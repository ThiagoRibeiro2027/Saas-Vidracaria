-- Fase 4 — Auditoria
-- Prompt Mestre de Segurança itens 17-18: os campos ip_address/user_agent já
-- existiam em activity_logs desde a Fase 2, mas nunca eram preenchidos.
-- Nenhuma regra de negócio de módulo (Tópicos 2-14) entra aqui — só a
-- instrumentação dos fluxos de autenticação que já existem na aplicação
-- (login, logout, troca de senha, MFA) e o reforço de proteção dos logs.

-- =========================================================================
-- 1. log_activity() passa a aceitar IP/User-Agent (item 17: rastreabilidade)
-- =========================================================================

drop function if exists public.log_activity(text, text, uuid, text, jsonb);

create or replace function public.log_activity(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_description text default null,
  p_metadata jsonb default null,
  p_ip_address inet default null,
  p_user_agent text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.activity_logs (
    company_id, user_id, action, entity_type, entity_id, description,
    metadata, ip_address, user_agent
  )
  values (
    public.current_company_id(), auth.uid(), p_action, p_entity_type, p_entity_id,
    p_description, p_metadata, p_ip_address, p_user_agent
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.log_activity(text, text, uuid, text, jsonb, inet, text) to authenticated;

-- complete_password_change() (Fase 2) também passa a registrar IP/UA.
-- Precisa dropar a assinatura antiga (zero parâmetros) antes: como os novos
-- parâmetros mudam a assinatura, CREATE OR REPLACE criaria uma segunda
-- função sobreposta em vez de substituir, e uma chamada sem argumentos
-- ficaria ambígua entre as duas ("function is not unique").
drop function if exists public.complete_password_change();

create or replace function public.complete_password_change(
  p_ip_address inet default null,
  p_user_agent text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
  set must_change_password = false
  where id = auth.uid();

  perform public.log_activity(
    'auth.password_changed', 'profile', auth.uid(),
    'Usuário concluiu a troca de senha obrigatória.', null,
    p_ip_address, p_user_agent
  );
end;
$$;

grant execute on function public.complete_password_change(inet, text) to authenticated;

-- =========================================================================
-- 2. PROTEÇÃO DOS LOGS (item 18) — imutabilidade real, no banco, mesmo para
--    service_role. Nenhuma UPDATE/DELETE é um caso de uso legítimo hoje;
--    se uma política de retenção (Fase 5) precisar de expurgo controlado no
--    futuro, ela deverá remover/ajustar este trigger de forma deliberada e
--    auditada, não contorná-lo silenciosamente.
-- =========================================================================

create or replace function public.prevent_activity_log_mutation()
returns trigger
language plpgsql as $$
begin
  raise exception 'Logs de auditoria são imutáveis — UPDATE/DELETE não são permitidos (Prompt Mestre item 18).';
end;
$$;

create trigger activity_logs_immutable
  before update or delete on public.activity_logs
  for each row execute function public.prevent_activity_log_mutation();
