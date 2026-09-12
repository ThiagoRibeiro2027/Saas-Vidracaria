-- ADR-009 — Performance sob RLS: correção pontual (§9), sem alterar
-- comportamento funcional. Dois eixos:
--   1. Índice ausente na única tabela multi-tenant que realmente não tinha
--      cobertura para filtro por company_id (ver nota abaixo sobre as
--      demais tabelas citadas no ADR).
--   2. Padrão de subselect em toda chamada a auth.uid()/current_company_id()/
--      is_platform_admin()/has_permission() dentro de policies (§3.2), para
--      que o planejador as avalie uma vez por consulta, não por linha.
--
-- NOTA sobre os índices "ausentes" listados no ADR-009 §9:
-- company_units, profiles e roles JÁ possuem índice utilizável para
-- filtro por company_id, como efeito colateral de UNIQUE constraints
-- existentes desde a Fase 2 — todas têm company_id como coluna líder:
--   company_units_company_code_unique    unique (company_id, code)
--   profiles_company_login_unique        unique (company_id, login_identifier)
--   roles_company_key_unique             unique (company_id, key)
-- Um índice B-tree composto atende buscas de igualdade pela coluna líder
-- (aqui, company_id) sem precisar das demais colunas do WHERE — não há
-- ganho em criar um índice dedicado adicional nessas três tabelas.
-- Da mesma forma, as "colunas de junção" citadas no §9 já estão cobertas:
--   user_roles_no_duplicate            unique (profile_id, role_id, valid_from)
--   role_permissions (chave primária)  primary key (role_id, permission_id)
--   permissions_resource_action_unique unique (resource, action)
-- Criar índices single-column redundantes sobre essas colunas não traria
-- ganho de performance e contrariaria o próprio princípio, reafirmado no
-- ADR-009 §2.1 (a partir do T1 §21), de evitar índice sem justificativa.
-- `activity_logs` é a única das quatro tabelas citadas sem nenhuma
-- constraint que cubra company_id — por isso é a única que recebe índice
-- novo aqui.

create index activity_logs_company_id_idx on public.activity_logs (company_id);

-- =========================================================================
-- Padrão de subselect (§3.2) em todas as policies existentes no projeto —
-- não só nas quatro tabelas citadas no §9, mas em toda policy que chama
-- auth.uid() ou uma função auxiliar diretamente.
-- =========================================================================

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select
  using (id = (select public.current_company_id()) or (select public.is_platform_admin()));

drop policy if exists company_units_select on public.company_units;
create policy company_units_select on public.company_units for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    company_id = (select public.current_company_id())
    or (select public.is_platform_admin())
    or id = (select auth.uid())
  );

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select
  using (
    company_id = (select public.current_company_id())
    or company_id is null
    or (select public.is_platform_admin())
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
          or (select public.is_platform_admin())
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
          or (select public.is_platform_admin())
        )
    )
  );

drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs for select
  using (
    (company_id = (select public.current_company_id()) and (select public.has_permission('activity_logs', 'read')))
    or (select public.is_platform_admin())
  );

drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins for select
  using (id = (select auth.uid()) or (select public.is_platform_admin()));

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

drop policy if exists files_select on public.files;
create policy files_select on public.files for select
  using (
    (company_id = (select public.current_company_id()) and (select public.has_permission('files', 'read')))
    or (select public.is_platform_admin())
  );

drop policy if exists company_files_select on storage.objects;
create policy company_files_select on storage.objects for select
  using (
    bucket_id = 'company-files'
    and (
      (select public.is_platform_admin())
      or (storage.foldername(name))[1] = (select public.current_company_id())::text
    )
  );

drop policy if exists company_files_insert on storage.objects;
create policy company_files_insert on storage.objects for insert
  with check (
    bucket_id = 'company-files'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
  );

drop policy if exists company_files_delete on storage.objects;
create policy company_files_delete on storage.objects for delete
  using (
    bucket_id = 'company-files'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
  );
