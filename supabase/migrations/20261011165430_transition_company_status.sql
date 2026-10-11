-- Achado da auditoria de gaps ADR-001 a ADR-012 (11/10/2026): Prompt
-- Mestre item 30 exige o ciclo ATIVA → CANCELAMENTO → SUSPENSA →
-- RETENÇÃO → EXCLUSÃO DEFINITIVA pra existência do tenant.
-- companies.status já tem os 5 valores certos desde a Fundação
-- (20260911005438, check constraint 'active'/'cancellation'/'suspended'/
-- 'retention'/'deleted'), mas nenhuma função jamais escreveu nessa coluna
-- além do default na criação — toda empresa nasce 'active' e fica assim
-- pra sempre, sem nenhum caminho de desativação.
--
-- Deliberadamente paralela e nunca fundida com transition_subscription()
-- (mesmo arquivo, linha ~73): aquela é o ciclo COMERCIAL (inadimplência,
-- item 31); esta é o ciclo de EXISTÊNCIA do tenant (item 30). O comentário
-- original da migration da Fundação já é explícito: "Nenhuma camada
-- poderá ser usada para fazer o papel de outra."
--
-- Gate é is_platform_admin_mfa_verified(), não o is_platform_admin() mais
-- fraco que transition_subscription() ainda usa (função de 11/09, antes
-- do Security Gate P0 corrigir esse padrão em 14/09) — esta função é nova
-- hoje, então já nasce com o padrão atual, mais estrito: existência do
-- tenant é mais sensível que status comercial.
create or replace function public.transition_company_status(
  p_company_id uuid,
  p_new_status text,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old_status text;
  v_valid_next text[];
begin
  if not public.is_platform_admin_mfa_verified() then
    raise exception 'Apenas administradores de plataforma (com MFA verificado) podem alterar o status de existência da empresa.';
  end if;

  select status into v_old_status from public.companies where id = p_company_id;
  if v_old_status is null then
    raise exception 'Empresa % não encontrada.', p_company_id;
  end if;

  -- Fluxo linear do item 30, só pra frente: active→cancellation→
  -- suspended→retention→deleted. O Prompt Mestre não define nenhum
  -- caminho de volta — se isso vier a ser necessário (ex.: desistência de
  -- cancelamento), é uma decisão de produto nova, não algo pra inventar
  -- aqui silenciosamente.
  v_valid_next := case v_old_status
    when 'active' then array['cancellation']
    when 'cancellation' then array['suspended']
    when 'suspended' then array['retention']
    when 'retention' then array['deleted']
    else array[]::text[]
  end;

  if p_new_status <> v_old_status and not (p_new_status = any(v_valid_next)) then
    raise exception 'Transição de status inválida: % → % (válidas a partir de %: %).', v_old_status, p_new_status, v_old_status, v_valid_next;
  end if;
  if p_new_status = v_old_status then
    raise exception 'Empresa já está no status "%".', v_old_status;
  end if;

  update public.companies
  set
    status = p_new_status,
    deleted_at = case when p_new_status = 'deleted' then now() else deleted_at end,
    updated_at = now()
  where id = p_company_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    p_company_id, auth.uid(), 'governance.company_status_transitioned', 'company', p_company_id,
    p_reason, jsonb_build_object('from', v_old_status, 'to', p_new_status)
  );
end;
$$;

grant execute on function public.transition_company_status(uuid, text, text) to authenticated;
