-- Fase 7 — Security Testing: log_activity() é a única via de escrita em
-- activity_logs, mas não verificava se havia um usuário autenticado. Um
-- cliente com só a anon key (sem login) conseguia chamá-la e gravar um
-- registro com company_id/user_id nulos (achado do
-- scripts/test-security-phase7.mjs). As demais RPCs de escrita
-- (register_file, delete_file, transition_subscription) já recusam
-- chamadas sem sessão porque checam has_permission()/is_platform_admin();
-- log_activity() não tinha checagem equivalente. Alinha com o comentário
-- original da função ("impede que um usuário forje company_id/user_id de
-- outro tenant") cobrindo também o caso de não haver usuário nenhum.
--
-- A assinatura em produção é a de 7 parâmetros criada na Fase 4
-- (20260911231124_audit_events.sql, que já dropou a versão original de 5
-- parâmetros) — é essa que precisa ser substituída, não a antiga.
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
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória para registrar evento de auditoria.';
  end if;

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
