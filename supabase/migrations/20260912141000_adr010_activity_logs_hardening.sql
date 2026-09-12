-- ADR-010 §6 — Ajustes de revisão sobre a anonimização de activity_logs.
-- Esta migration não altera 20260912140000_adr009_rls_performance.sql nem
-- 20260912140500_adr010_activity_logs_anonymization.sql — só complementa.

-- =========================================================================
-- 1. Fecha o bypass do GUC: app.activity_logs_anonymization não é um
--    privilégio do Postgres — qualquer role capaz de rodar
--    set_config('app.activity_logs_anonymization', 'on', true) seguido de
--    um UPDATE direto passaria pelo trigger. A barreira efetiva precisa ser
--    o próprio GRANT da tabela: sem UPDATE concedido, nenhuma role chega a
--    tentar o UPDATE, qualquer que seja o valor do GUC.
--
--    service_role tem RLS bypassado (bypassrls), mas GRANT/REVOKE é um
--    mecanismo independente da RLS e continua valendo mesmo para
--    bypassrls — só dono do objeto e superusuário ignoram GRANT.
--
--    anonymize_activity_logs_for_user() é SECURITY DEFINER e roda com o
--    privilégio de quem é dono da função (quem a criou via migration, não
--    quem a chama), então continua funcionando normalmente após este
--    revoke — o revoke afeta apenas UPDATE feito diretamente pelas roles
--    de aplicação, fora da função.
-- =========================================================================

revoke update on public.activity_logs from anon, authenticated, service_role;

-- =========================================================================
-- 2. anonymize_activity_logs_for_user() filtra por user_id + anonymized_at
--    is null sem índice hoje — seq scan. Índice parcial: só interessa achar
--    linhas AINDA não anonimizadas; linhas já anonimizadas têm user_id nulo
--    e nunca mais entram nesse filtro (o parcial evita indexar o que já
--    virou irrelevante para esta consulta).
-- =========================================================================

create index activity_logs_user_id_unanonymized_idx
  on public.activity_logs (user_id)
  where anonymized_at is null;

-- =========================================================================
-- 3. anonymize_activity_logs_for_user(): quando o profile do titular já não
--    existe mais (desligado/removido), não havia como derivar a empresa por
--    ele, e o evento de anonimização nascia com company_id nulo — invisível
--    a qualquer tenant, já que activity_logs_select exige
--    company_id = current_company_id(). Isso quebrava a rastreabilidade que
--    o ADR-010 §5/§6 exige. Correção: capturar o(s) company_id(s) das
--    próprias linhas anonimizadas nesta chamada via RETURNING, antes que
--    user_id seja nulificado — depois do UPDATE não há mais como localizá-
--    -las por user_id.
-- =========================================================================

create or replace function public.anonymize_activity_logs_for_user(
  p_user_id uuid,
  p_reason text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_company_id uuid;
  v_company_ids uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'Apenas administradores de plataforma podem anonimizar registros de auditoria (ADR-010 §6).';
  end if;
  if p_user_id is null then
    raise exception 'Usuário alvo da anonimização é obrigatório.';
  end if;

  select company_id into v_company_id from public.profiles where id = p_user_id;

  perform set_config('app.activity_logs_anonymization', 'on', true);

  with anonymized as (
    update public.activity_logs
    set user_id = null,
        ip_address = null,
        user_agent = null,
        anonymized_at = now()
    where user_id = p_user_id
      and anonymized_at is null
    returning company_id
  )
  select count(*), array_agg(distinct company_id) into v_count, v_company_ids
  from anonymized;

  perform set_config('app.activity_logs_anonymization', 'off', true);

  if v_company_id is not null then
    insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
    values (
      v_company_id, auth.uid(), 'lgpd.activity_logs_anonymized', 'profile', p_user_id,
      p_reason, jsonb_build_object('rows_anonymized', v_count)
    );
  elsif v_company_ids is not null then
    -- Profile não existe mais: registra o evento em cada empresa cujas
    -- linhas foram efetivamente anonimizadas nesta chamada (normalmente
    -- uma só, dado que profiles.id é 1:1 com company_id).
    for v_company_id in select unnest(v_company_ids) loop
      insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
      values (
        v_company_id, auth.uid(), 'lgpd.activity_logs_anonymized', 'profile', p_user_id,
        p_reason, jsonb_build_object('rows_anonymized', v_count)
      );
    end loop;
  end if;

  return v_count;
end;
$$;
