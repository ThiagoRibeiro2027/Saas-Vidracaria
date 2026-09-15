-- Fase 8 (reaberta) — Security Gate P0: corrige os achados críticos da
-- auditoria técnica independente de 14/09/2026 (SEC-001, SEC-002, SEC-003,
-- SEC-004, SEC-006), testada direto na Data API do Supabase, ignorando o
-- Next.js. Ver docs internos: plano-remediacao-auditoria.md (Fase P0).
--
-- =========================================================================
-- SEC-001 — MFA do platform_admin não era imposto no banco: is_platform_
-- admin() só checava a tabela platform_admins, nunca o AAL da sessão. O
-- middleware (src/lib/supabase/middleware.ts) usa is_platform_admin() em
-- AAL1 para decidir se deve mandar a pessoa para /mfa/enroll ou /mfa/verify
-- — se a própria função passasse a exigir aal2, o middleware pararia de
-- reconhecer o platform_admin ainda não verificado e puraria o redireciona-
-- mento de MFA inteiro. Por isso is_platform_admin() continua como
-- identidade pura (sem gate de AAL); toda autorização privilegiada passa a
-- exigir a nova is_platform_admin_mfa_verified() no lugar.
-- =========================================================================

create or replace function public.is_platform_admin_mfa_verified()
returns boolean
language sql stable security definer set search_path = public as $$
  select
    coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    and public.is_platform_admin();
$$;

grant execute on function public.is_platform_admin_mfa_verified() to authenticated;

-- has_permission() é o gate central de RBAC usado por toda função de
-- negócio — hoje qualquer linha em platform_admins passava em qualquer
-- checagem de permissão, mesmo em AAL1.
create or replace function public.has_permission(p_resource text, p_action text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.profile_id = auth.uid()
      and p.resource = p_resource
      and p.action = p_action
      and ur.valid_from <= now()
      and (ur.valid_until is null or ur.valid_until > now())
  ) or public.is_platform_admin_mfa_verified();
$$;

-- Policies de SELECT que concediam acesso cross-tenant a platform_admin —
-- mesmo texto de 20260912140000_adr009_rls_performance.sql, só trocando a
-- função de gate.

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select
  using (id = (select public.current_company_id()) or (select public.is_platform_admin_mfa_verified()));

drop policy if exists company_units_select on public.company_units;
create policy company_units_select on public.company_units for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin_mfa_verified()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    company_id = (select public.current_company_id())
    or (select public.is_platform_admin_mfa_verified())
    or id = (select auth.uid())
  );

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select
  using (
    company_id = (select public.current_company_id())
    or company_id is null
    or (select public.is_platform_admin_mfa_verified())
  );

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (
          r.company_id = (select public.current_company_id())
          or r.company_id is null
          or (select public.is_platform_admin_mfa_verified())
        )
    )
  );

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = user_roles.profile_id
        and (
          p.company_id = (select public.current_company_id())
          or (select public.is_platform_admin_mfa_verified())
        )
    )
  );

drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs for select
  using (
    (company_id = (select public.current_company_id()) and (select public.has_permission('activity_logs', 'read')))
    or (select public.is_platform_admin_mfa_verified())
  );

-- platform_admins_select: "ver o próprio registro" continua em AAL1 (não é
-- acesso privilegiado, só confirma a própria identidade); só o ramo que
-- expõe os registros de outros admins exige AAL2.
drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins for select
  using (id = (select auth.uid()) or (select public.is_platform_admin_mfa_verified()));

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin_mfa_verified()));

drop policy if exists files_select on public.files;
create policy files_select on public.files for select
  using (
    (company_id = (select public.current_company_id()) and (select public.has_permission('files', 'read')))
    or (select public.is_platform_admin_mfa_verified())
  );

-- =========================================================================
-- SEC-002/003/004 — storage.objects (bucket company-files) só verificava
-- tenant (prefixo do path), nunca a permissão RBAC de files.*, criando um
-- canal de acesso paralelo ao modelo de autorização da aplicação
-- (register_file()/delete_file() aplicam has_permission(), mas o bucket em
-- si nunca aplicava). Acesso de suporte (platform_admin) continua só-
-- leitura, agora exigindo AAL2 também nesse caminho.
-- =========================================================================

drop policy if exists company_files_select on storage.objects;
create policy company_files_select on storage.objects for select
  using (
    bucket_id = 'company-files'
    and (
      (select public.is_platform_admin_mfa_verified())
      or (
        (storage.foldername(name))[1] = (select public.current_company_id())::text
        and (select public.has_permission('files', 'read'))
      )
    )
  );

drop policy if exists company_files_insert on storage.objects;
create policy company_files_insert on storage.objects for insert
  with check (
    bucket_id = 'company-files'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
    and (select public.has_permission('files', 'upload'))
  );

drop policy if exists company_files_update on storage.objects;
create policy company_files_update on storage.objects for update
  using (
    bucket_id = 'company-files'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
    and (select public.has_permission('files', 'upload'))
  )
  with check (
    bucket_id = 'company-files'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
    and (select public.has_permission('files', 'upload'))
  );

-- =========================================================================
-- Consistência do SEC-001: outras operações que já usavam is_platform_
-- admin() como gate de autorização (não só identidade) — mesmo risco de
-- AAL1 bypass que a auditoria descreve para as policies acima, só que em
-- funções de escrita/leitura privilegiada em vez de RLS puro.
-- =========================================================================

create or replace function public.transition_subscription(
  p_company_id uuid,
  p_new_status text,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old_status text;
begin
  if not public.is_platform_admin_mfa_verified() then
    raise exception 'Apenas administradores de plataforma podem alterar o status de assinatura.';
  end if;
  if p_new_status not in ('trial', 'active', 'past_due', 'suspended', 'canceled', 'expired') then
    raise exception 'Status de assinatura inválido: %', p_new_status;
  end if;

  select status into v_old_status from public.subscriptions where company_id = p_company_id;
  if v_old_status is null then
    raise exception 'Empresa % não possui assinatura.', p_company_id;
  end if;

  update public.subscriptions
  set
    status = p_new_status,
    past_due_since = case when p_new_status = 'past_due' then now() else past_due_since end,
    suspended_at = case when p_new_status = 'suspended' then now() else suspended_at end,
    canceled_at = case when p_new_status = 'canceled' then now() else canceled_at end,
    updated_at = now()
  where company_id = p_company_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    p_company_id, auth.uid(), 'governance.subscription_transitioned', 'subscription', p_company_id,
    p_reason, jsonb_build_object('from', v_old_status, 'to', p_new_status)
  );
end;
$$;

create or replace function public.company_usage(p_company_id uuid default null)
returns table (
  company_id uuid,
  user_count bigint,
  active_user_count bigint,
  storage_bytes_used bigint,
  file_count bigint,
  plan_name text,
  max_users integer,
  max_storage_bytes bigint,
  subscription_status text
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
begin
  if p_company_id is null then
    v_company_id := public.current_company_id();
  elsif p_company_id = public.current_company_id() or public.is_platform_admin_mfa_verified() then
    v_company_id := p_company_id;
  else
    raise exception 'Sem permissão para consultar consumo de outra empresa.';
  end if;

  if v_company_id is null then
    raise exception 'Nenhuma empresa informada nem associada ao usuário atual.';
  end if;

  -- Subqueries qualificadas com alias: o parâmetro de saída "company_id" da
  -- própria função (returns table) entra em escopo no corpo do plpgsql e,
  -- sem alias, colide com a coluna company_id das tabelas ("ambiguous").
  return query
  select
    v_company_id,
    (select count(*) from public.profiles pr where pr.company_id = v_company_id and pr.deleted_at is null),
    (select count(*) from public.profiles pr where pr.company_id = v_company_id and pr.deleted_at is null and pr.active = true),
    coalesce((select sum(f.size_bytes) from public.files f where f.company_id = v_company_id and f.deleted_at is null), 0)::bigint,
    (select count(*) from public.files f where f.company_id = v_company_id and f.deleted_at is null),
    p.name,
    p.max_users,
    p.max_storage_bytes,
    s.status
  from (select v_company_id as id) c
  left join public.subscriptions s on s.company_id = c.id
  left join public.plans p on p.id = s.plan_id;
end;
$$;

create or replace function public.anonymize_activity_logs_for_user(
  p_user_id uuid,
  p_reason text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_company_id uuid;
begin
  if not public.is_platform_admin_mfa_verified() then
    raise exception 'Apenas administradores de plataforma podem anonimizar registros de auditoria (ADR-010 §6).';
  end if;
  if p_user_id is null then
    raise exception 'Usuário alvo da anonimização é obrigatório.';
  end if;

  select company_id into v_company_id from public.profiles where id = p_user_id;

  perform set_config('app.activity_logs_anonymization', 'on', true);

  update public.activity_logs
  set user_id = null,
      ip_address = null,
      user_agent = null,
      anonymized_at = now()
  where user_id = p_user_id
    and anonymized_at is null;

  get diagnostics v_count = row_count;

  perform set_config('app.activity_logs_anonymization', 'off', true);

  -- Escurece identidade em profiles — display_name/contact_email deixam de
  -- conter dado original; login_identifier vira um valor sintético (mantém
  -- a constraint de unicidade por empresa). FKs estruturais (files.*_by
  -- inclusive) continuam apontando para este id, agora anonimizado.
  update public.profiles
  set display_name = 'Titular anonimizado',
      contact_email = null,
      login_identifier = 'anonimizado-' || p_user_id::text
  where id = p_user_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'lgpd.activity_logs_anonymized', 'profile', p_user_id,
    p_reason, jsonb_build_object('rows_anonymized', v_count, 'profile_anonymized', true)
  );

  return v_count;
end;
$$;

create or replace function public.purge_activity_logs_older_than_retention()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not public.is_platform_admin_mfa_verified() then
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

-- =========================================================================
-- SEC-006 — EXECUTE em funções do schema public estava aberto além do
-- necessário. A causa raiz não é o PUBLIC "genérico" do Postgres (revogar
-- dele sozinho não muda nada, como confirmado ao testar) — é que o próprio
-- Supabase configura, desde o provisionamento do projeto, uma default ACL
-- (pg_default_acl, role postgres, schema public) que concede EXECUTE a
-- anon/authenticated/service_role em toda função NOVA criada no schema
-- public. Por isso toda função deste projeto, mesmo sem nenhum `grant`
-- explícito, sempre foi executável por anon e authenticated.
--
-- Revoga dos dois papéis (anon e authenticated) e reconcede EXECUTE só para
-- authenticated, só nas funções que o app realmente chama hoje via
-- .rpc(...) (levantamento em src/**/*.ts e scripts/*.mjs — mesma lista que
-- já tinha `grant execute` explícito nas migrations anteriores). anon não
-- entra em nenhuma lista de re-concessão — nenhuma função deste projeto é
-- chamada sem sessão.
--
-- O regrant usa oid::regprocedure (resolvido a partir do nome via
-- pg_proc/pg_namespace) em vez de reescrever as ~44 assinaturas à mão —
-- evita reintroduzir por transcrição o mesmo tipo de erro já corrigido
-- nesta migration (company_usage/transition_subscription/anonymize_
-- activity_logs_for_user/purge_activity_logs_older_than_retention acima).
-- Se algum nome da lista não existir mais, a migration falha explicitamente
-- em vez de deixar silenciosamente sem grant.
--
-- Chamadas internas entre funções SECURITY DEFINER continuam funcionando
-- independente deste revoke: dentro de uma SECURITY DEFINER, current_user
-- vira o owner da função (mesmo owner de todas as funções deste schema), e
-- o owner sempre pode executar suas próprias funções independente de GRANT
-- — por isso helpers internos (ex.: assert_company_not_suspended, chamada
-- de dentro de register_file) não precisariam de grant nem se não
-- estivessem na lista abaixo; entram nela mesmo assim porque também têm
-- chamada direta hoje (.rpc(...) em algum teste ou tela).
-- =========================================================================

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;

do $$
declare
  v_names text[] := array[
    'abrir_pendencia_pedido', 'ajustar_saldo', 'anonymize_activity_logs_for_user',
    'assert_company_not_suspended', 'cancelar_orcamento', 'cancelar_pedido',
    'company_usage', 'complete_password_change', 'confirmar_medicao', 'consumir_reserva',
    'converter_orcamento_em_pedido', 'criar_item_producao', 'current_company_id',
    'current_profile', 'decidir_orcamento', 'delete_file', 'get_cutting_margin',
    'has_permission', 'iniciar_conferencia_pedido', 'is_platform_admin',
    'is_platform_admin_mfa_verified', 'liberar_pedido', 'liberar_reserva', 'log_activity',
    'next_document_number', 'orcamento_valor_total', 'pedido_bloqueado_por_medicao',
    'purge_activity_logs_older_than_retention', 'register_file', 'registrar_entrada_sobra',
    'registrar_medicao', 'remove_orcamento_item', 'reservar_para_pedido_item',
    'resolver_pendencia_pedido', 'set_pessoa_papel', 'transition_subscription',
    'upsert_approval_threshold', 'upsert_cutting_margin', 'upsert_item',
    'upsert_measurement_rule', 'upsert_numbering_sequence', 'upsert_obra',
    'upsert_orcamento', 'upsert_orcamento_item', 'upsert_pessoa'
  ];
  v_name text;
  v_oid oid;
  v_found boolean;
begin
  foreach v_name in array v_names loop
    v_found := false;
    for v_oid in
      select p.oid from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name
    loop
      execute format('grant execute on function %s to authenticated', v_oid::regprocedure);
      v_found := true;
    end loop;
    if not v_found then
      raise exception 'SEC-006: função public.% não encontrada ao conceder EXECUTE a authenticated.', v_name;
    end if;
  end loop;
end $$;
