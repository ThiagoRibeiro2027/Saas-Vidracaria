-- Auditoria TR Systems (12/10/2026) — achado 5: log_system_event() confia em
-- p_company_id vindo do cliente.
--
-- PROBLEMA. A função é SECURITY DEFINER, chamável por `authenticated`
-- (scripts/test-governance.mjs seção 6 exige isso: o upload do app registra
-- falha de storage com a sessão do usuário) e gravava system_events com o
-- p_company_id recebido, sem checar nada. Um usuário do tenant A conseguia
-- gravar eventos técnicos na empresa B (ou "órfãos", sem empresa) —
-- CLAUDE.md regra 1: nunca confiar em company_id enviado pelo cliente.
-- O achado 4 (20261012175409) já tirou `anon` e `PUBLIC`; este fecha o que
-- sobrava para `authenticated`.
--
-- COMO FICA, por quem chama:
--   * service_role (crons, webhooks, sistema_*): a empresa vem do registro que
--     eles processam, não de um cliente de browser — passa como está. Isto é
--     o que os 11 chamadores de src/app/api/** e sistema_falhar_operacao()
--     fazem hoje.
--   * platform_admin com MFA (AAL2): pode registrar em qualquer empresa (já lê
--     todas via is_platform_admin_mfa_verified(); regra 4 do CLAUDE.md).
--   * usuário comum de tenant: a empresa é SEMPRE a do próprio usuário
--     (current_company_id()). Se mandar p_company_id de outra empresa, é
--     recusado; se mandar nulo, o evento é atribuído à empresa dele (antes
--     ficava sem dono, o que permitia forjar evento "de plataforma").
--   * sem sessão e sem ser service_role: recusado.
--
-- NÃO MUDA: a assinatura, o enum de category/severity (constraints da
-- tabela) nem o grant a `authenticated`. Tampouco passa a recusar empresa
-- suspensa — o rastro técnico precisa registrar falhas também nelas (exceção
-- justificada em scripts/test-suspensao-varredura.mjs).
--
-- Chamadores internos (falhar_operacao, sistema_falhar_operacao) já passam a
-- empresa da própria operação — verificado em 12/10/2026.

create or replace function public.log_system_event(
  p_category text,
  p_message text,
  p_severity text default 'error',
  p_company_id uuid default null,
  p_correlation_id uuid default null,
  p_context jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_company_id uuid;
  v_atual uuid;
begin
  if coalesce((select auth.role()), '') = 'service_role' then
    v_company_id := p_company_id;
  elsif (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória para registrar evento de sistema.';
  elsif (select public.is_platform_admin_mfa_verified()) then
    v_company_id := p_company_id;
  else
    v_atual := public.current_company_id();
    if v_atual is null then
      raise exception 'Usuário sem empresa associada.';
    end if;
    if p_company_id is not null and p_company_id is distinct from v_atual then
      raise exception 'AUD-1210-05: p_company_id não é a empresa do usuário — o evento só pode ser registrado na própria empresa.';
    end if;
    v_company_id := v_atual;
  end if;

  insert into public.system_events (category, severity, company_id, correlation_id, message, context)
  values (p_category, p_severity, v_company_id, p_correlation_id, p_message, p_context)
  returning id into v_id;
  return v_id;
end;
$$;
