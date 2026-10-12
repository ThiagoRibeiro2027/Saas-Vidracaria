-- Auditoria TR Systems (12/10/2026) — cron storage-reconciliation não gravava
-- o rastro de auditoria da purga de objetos órfãos.
--
-- PROBLEMA. src/app/api/cron/storage-reconciliation/route.ts purga os objetos
-- órfãos do bucket e depois chamava admin.rpc("log_activity", ...) para gravar
-- "security.storage_orphans_purged" em activity_logs. log_activity() exige
-- auth.uid() não nulo (20260912131500) e a service role não tem uid: a função
-- levantava "Autenticação obrigatória..." — e a rota não olhava o retorno do
-- rpc. Reproduzido de ponta a ponta (scripts/test-cron-storage-reconciliation.mjs):
-- a rota respondia 200 ok:true, o objeto era purgado e nenhuma linha de
-- auditoria existia. Evidência de upload que contornou o pipeline da aplicação
-- (o motivo de existir deste cron) ficava sem rastro.
--
-- POR QUE NÃO ABRIR log_activity() PARA service_role. Ela é a escrita padrão de
-- dezenas de funções de negócio, que rodam como o usuário da sessão; aceitar
-- "ninguém logado" ali mudaria o contrato de todas. CLAUDE.md regra 8: função
-- genérica de auditoria não vira API livre — o evento deve corresponder a uma
-- operação real.
--
-- SOLUÇÃO. Função própria, no padrão sistema_* (só service_role, como
-- sistema_notificar_vencimento_contrato):
--   * EXECUTE só para service_role (revoke explícito de PUBLIC/anon/authenticated,
--     regra 7) E checagem de auth.role() no corpo (defesa em profundidade: um
--     grant errado no futuro não a abre);
--   * lista FECHADA de ações — hoje só 'security.storage_orphans_purged'; o
--     entity_type é derivado da ação, não informado pelo chamador;
--   * grava como evento de PLATAFORMA: company_id e user_id nulos (o órfão
--     nunca teve dono), igual a log_platform_admin_access().
-- Para registrar outra operação de sistema no futuro, acrescentar a ação ao
-- `case` abaixo numa migration nova — e ao teste.

create or replace function public.sistema_registrar_evento_plataforma(
  p_action text,
  p_description text default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_entity_type text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'AUD-1210-06: evento de plataforma só pode ser registrado pela service role.';
  end if;

  v_entity_type := case p_action
    when 'security.storage_orphans_purged' then 'storage_object'
    else null
  end;
  if v_entity_type is null then
    raise exception 'AUD-1210-06: ação de auditoria de plataforma não permitida: "%".', p_action;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (null, null, p_action, v_entity_type, null, p_description, p_metadata)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.sistema_registrar_evento_plataforma(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.sistema_registrar_evento_plataforma(text, text, jsonb)
  to service_role;
