-- ADR-009 §3.4 / Security Gate Fase 8 — item "Logs: retenção definida".
-- Decisão registrada: retenção de activity_logs = 24 meses. Expurgo é
-- exceção deliberada e auditada ao trigger de imutabilidade (o comentário
-- em 20260912140500_adr010_activity_logs_anonymization.sql já previa este
-- exato caso: "se uma política de retenção precisar de expurgo controlado
-- no futuro, ela deverá remover/ajustar este trigger de forma deliberada e
-- auditada, não contorná-lo silenciosamente").
--
-- Escopo desta migration: só a função de expurgo, restrita a
-- platform_admin, chamada manualmente. NÃO agenda pg_cron — decisão de
-- automatizar fica para depois (Security Gate Fase 8, 13/09/2026).

create or replace function public.prevent_activity_log_mutation()
returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.activity_logs_retention_purge', true) is distinct from 'on' then
      raise exception 'Logs de auditoria são imutáveis — DELETE não é permitido fora do expurgo de retenção controlado (ADR-009 §3.4).';
    end if;
    if old.created_at > now() - interval '24 months' then
      raise exception 'Expurgo de retenção só alcança linhas com mais de 24 meses (ADR-009 §3.4).';
    end if;
    return old;
  end if;

  if current_setting('app.activity_logs_anonymization', true) is distinct from 'on' then
    raise exception 'Logs de auditoria são imutáveis — UPDATE não é permitido fora do procedimento de anonimização (ADR-010 §6).';
  end if;

  if new.id is distinct from old.id
     or new.company_id is distinct from old.company_id
     or new.action is distinct from old.action
     or new.entity_type is distinct from old.entity_type
     or new.entity_id is distinct from old.entity_id
     or new.description is distinct from old.description
     or new.metadata is distinct from old.metadata
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Anonimização não pode alterar o fato registrado (ADR-010 §6) — apenas user_id, ip_address, user_agent e anonymized_at.';
  end if;

  return new;
end;
$$;

-- Restrita a platform_admin, como anonymize_activity_logs_for_user() — só
-- deleta o que já passou dos 24 meses (a checagem do trigger acima é a
-- barreira real; o WHERE aqui é a mesma regra, redundante de propósito).
create or replace function public.purge_activity_logs_older_than_retention()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Apenas administradores de plataforma podem expurgar logs por retenção (ADR-009 §3.4).';
  end if;

  perform set_config('app.activity_logs_retention_purge', 'on', true);

  delete from public.activity_logs
  where created_at < now() - interval '24 months';

  get diagnostics v_count = row_count;

  perform set_config('app.activity_logs_retention_purge', 'off', true);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    null, auth.uid(), 'governance.activity_logs_retention_purge', 'activity_logs', null,
    'Expurgo automático por retenção (ADR-009 §3.4)', jsonb_build_object('rows_purged', v_count, 'retention_months', 24)
  );

  return v_count;
end;
$$;

grant execute on function public.purge_activity_logs_older_than_retention() to authenticated;
