-- Fase 2 — Fundação de Segurança
-- Combina Tópico 1 (Base/Estrutura), ADR-001 (Usuários/Permissões) e o
-- Prompt Mestre de Segurança. Escopo: tenant/empresa, filial/unidade,
-- identidade, RBAC configurável, auditoria central e isolamento por RLS.
-- Nenhuma regra de negócio dos módulos operacionais (Tópicos 2-14) entra aqui.

create extension if not exists pgcrypto;

-- =========================================================================
-- 1. EMPRESAS / TENANTS  (Tópico 1 §4-7, Prompt Mestre item 3)
-- =========================================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  timezone text not null default 'America/Sao_Paulo',
  -- Ciclo de vida oficial (Prompt Mestre Segurança): nunca exclusão imediata.
  status text not null default 'active'
    check (status in ('active', 'cancellation', 'suspended', 'retention', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint companies_slug_unique unique (slug)
);
comment on table public.companies is 'Tenant raiz. Todo isolamento multi-tenant deriva de company_id, nunca de valor enviado pelo cliente.';

-- Filial/Unidade — Tópico 1 §5 e §18 confirmam esta camada como parte da
-- própria cadeia de segurança estrutural. Opcional: nem toda empresa usa.
create table public.company_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text, -- código de negócio, independente do id técnico (Tópico 1 §6)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint company_units_company_code_unique unique (company_id, code)
);

-- =========================================================================
-- 2. USUÁRIOS DE PLATAFORMA vs. USUÁRIOS DE TENANT (ADR-001 §6-8, §30)
--    Duas dimensões arquiteturalmente distintas — nunca uma é perfil da outra.
-- =========================================================================

create table public.platform_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'SUPER_ADMIN' check (role in ('SUPER_ADMIN')),
  mfa_enforced boolean not null default true, -- ADR-001 §26: MFA obrigatório
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.platform_admins is 'Administra o SaaS em si. Nunca deve ser inferido a partir de profiles de tenant (ADR-001).';

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  unit_id uuid references public.company_units(id),
  -- Identificador visível ao usuário: matrícula OU e-mail (ADR-001 / Tópico 14
  -- não exigem e-mail). auth.users.email pode ser sintético — ver lib/auth.
  login_identifier text not null,
  display_name text not null,
  contact_email text, -- e-mail real para notificações, quando existir
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_company_login_unique unique (company_id, login_identifier)
);
comment on table public.profiles is 'Usuário de tenant. company_id nunca deve ser aceito de input do cliente ao autorizar operações.';

-- =========================================================================
-- 3. RBAC CONFIGURÁVEL POR EMPRESA (ADR-001 aprovado prevalece sobre o
--    enum fixo do Prompt Mestre de Segurança — ver Auditoria Fase 1, item 01)
-- =========================================================================

-- Catálogo de permissões possíveis (definido pelo produto/módulos).
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  action text not null,
  description text,
  constraint permissions_resource_action_unique unique (resource, action)
);

-- Papéis: company_id nulo = template de sistema (seed); preenchido = papel
-- real de uma empresa. Nenhum papel é hardcoded como enum de aplicação.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  key text not null,
  name text not null,
  is_system_template boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_company_key_unique unique (company_id, key)
);
-- Postgres não considera NULL = NULL em UNIQUE(company_id, key); sem este
-- índice parcial, dois templates de sistema com a mesma key não colidiriam.
create unique index roles_system_template_key_unique
  on public.roles (key) where company_id is null;

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- Atribuição usuário↔papel, com validade temporal (ADR-001: "autorização
-- expirada não é válida").
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  constraint user_roles_no_duplicate unique (profile_id, role_id, valid_from)
);

-- =========================================================================
-- 4. AUDITORIA CENTRAL (Tópico 1 §8, Prompt Mestre — tabela activity_logs)
-- =========================================================================

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  description text,
  metadata jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
comment on table public.activity_logs is 'Somente-inserção via função log_activity(); nunca editável/apagável por usuário comum (Prompt Mestre item 8/48).';

-- =========================================================================
-- 5. FUNÇÕES DE CONTEXTO (usadas pelas policies de RLS abaixo)
-- =========================================================================

create or replace function public.current_profile()
returns public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles
  where id = auth.uid() and active = true and deleted_at is null
  limit 1;
$$;

create or replace function public.current_company_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.profiles
  where id = auth.uid() and active = true and deleted_at is null
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins
    where id = auth.uid() and active = true
  );
$$;

-- Checagem de permissão via papel ativo (respeita validade temporal).
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
  ) or public.is_platform_admin();
$$;

-- Única via de escrita em activity_logs — impede que um usuário forje
-- company_id/user_id de outro tenant no próprio log.
create or replace function public.log_activity(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_description text default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (public.current_company_id(), auth.uid(), p_action, p_entity_type, p_entity_id, p_description, p_metadata)
  returning id into v_id;
  return v_id;
end;
$$;

-- =========================================================================
-- 6. ROW LEVEL SECURITY — isolamento por company_id nunca confiando no
--    frontend (Prompt Mestre item 4/5).
-- =========================================================================

alter table public.companies enable row level security;
alter table public.company_units enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.activity_logs enable row level security;
alter table public.platform_admins enable row level security;

create policy companies_select on public.companies for select
  using (id = public.current_company_id() or public.is_platform_admin());

create policy company_units_select on public.company_units for select
  using (company_id = public.current_company_id() or public.is_platform_admin());

create policy profiles_select on public.profiles for select
  using (company_id = public.current_company_id() or public.is_platform_admin() or id = auth.uid());

create policy roles_select on public.roles for select
  using (company_id = public.current_company_id() or company_id is null or public.is_platform_admin());

create policy permissions_select on public.permissions for select
  using (true); -- catálogo global, não contém dado de tenant

create policy role_permissions_select on public.role_permissions for select
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (r.company_id = public.current_company_id() or r.company_id is null or public.is_platform_admin())
    )
  );

create policy user_roles_select on public.user_roles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = user_roles.profile_id
        and (p.company_id = public.current_company_id() or public.is_platform_admin())
    )
  );

create policy activity_logs_select on public.activity_logs for select
  using (
    (company_id = public.current_company_id() and public.has_permission('activity_logs', 'read'))
    or public.is_platform_admin()
  );

create policy platform_admins_select on public.platform_admins for select
  using (id = auth.uid() or public.is_platform_admin());

-- Nenhuma policy de INSERT/UPDATE/DELETE é criada para o role `authenticated`
-- nestas tabelas: toda escrita estrutural (criação de empresa, atribuição de
-- papel, criação de perfil) passa pela service role a partir do servidor
-- Next.js, que aplica validações adicionais antes de gravar — nunca direto
-- do navegador (Prompt Mestre item 4/48: validação no servidor > frontend).

-- =========================================================================
-- 7. GRANTS — apenas leitura para o papel autenticado; escrita só via
--    função SECURITY DEFINER (log_activity) ou service role.
-- =========================================================================

-- Supabase concede ALL por padrão a anon/authenticated/service_role em
-- tabelas novas do schema public (default privileges). Revogar
-- explicitamente antes de conceder só o necessário — não depender apenas
-- do "deny by default" do RLS para UPDATE/DELETE/INSERT sem policy.
revoke all on all tables in schema public from anon, authenticated;
grant select on
  public.companies, public.company_units, public.profiles, public.roles,
  public.permissions, public.role_permissions, public.user_roles,
  public.activity_logs, public.platform_admins
to authenticated;
grant execute on function public.log_activity(text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.has_permission(text, text) to authenticated;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.current_profile() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;

-- =========================================================================
-- 8. updated_at automático
-- =========================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.company_units
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.roles
  for each row execute function public.set_updated_at();
