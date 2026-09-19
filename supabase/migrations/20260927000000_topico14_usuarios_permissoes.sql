-- TÓPICO 14 — Usuários / Permissões, recorte mínimo (ADR-002 §4.10,
-- decisão do responsável do produto em 2026-09-19 de construir agora,
-- como pré-requisito antes de considerar a Fase 8 concluída).
--
-- O TÓPICO 14 completo (docs/Prompt TÓPICO 14) tem 61 seções — alçadas de
-- aprovação com substituição de aprovador, SSO, integrações de
-- identidade, terminais industriais, acesso emergencial, permissões
-- temporárias com fluxo de aprovação, dashboards/relatórios
-- administrativos, revisão periódica automatizada. Nada disso entra
-- aqui — mesmo critério de recorte do resto do projeto: só o que
-- sustenta "usuário → perfil → permissões" configurável por empresa,
-- via UI, que hoje só existe como dado (Fundação, Fase 2) sem nenhuma
-- tela (achado registrado em 20260914110000_phase8_security_gate_p1.sql:
-- "a tela de atribuir papel do TÓPICO 14 ainda não foi construída").
--
-- Decisão de arquitetura: a Fundação já deixou explícito que a escrita
-- nestas tabelas (profiles/roles/role_permissions/user_roles) "passa
-- pela service role a partir do servidor Next.js" (comentário da
-- migration 20260911005438, linha ~266) — não pelo padrão de RPC direto
-- de `authenticated` usado em T2-T17. Aqui ficamos NO MEIO DO CAMINHO:
-- criar o usuário em auth.users é inevitavelmente uma chamada da Admin
-- API (service role) a partir do Server Action, mas todo o resto —
-- inserir profiles, atribuir papel, criar papel de empresa, conceder/
-- revogar permissão — vira função SECURITY DEFINER normal, chamada pelo
-- client autenticado comum, com has_permission()/current_company_id()/
-- assert_company_not_suspended() de verdade, igual a todo o resto do
-- schema. Minimiza o uso da service role à única operação que não tem
-- outro jeito (criar a identidade em auth.users).
--
-- Permissões já existiam desde o seed original da Fundação —
-- users.view/manage, roles.view/manage — só nunca tinham nenhuma função
-- ou tela que as usasse. Nenhuma permissão nova.
--
-- Fora do recorte, decisão consciente:
--   - Sem onboarding de empresa nova / signup público — só há hoje o
--     piloto único (JR Box), provisionado fora do app; convite de
--     usuário aqui pressupõe empresa já existente.
--   - Login por matrícula continua sendo o modo primário (mesmo padrão
--     de login/actions.ts); e-mail de auth.users é sempre sintético
--     (`<login_identifier>.<company_slug>@users.internal`, mesmo padrão
--     já usado pelos scripts de teste) — contact_email é só dado de
--     contato pra notificação futura, nunca usado pra autenticação
--     nesta fase (login por e-mail real já é suportado pelo login
--     existente via contact_email, mas exigiria coletar e-mail real de
--     cada operador de chão de fábrica — não faz parte deste recorte).
--   - "Revogar papel" é soft (valid_until = now()), nunca DELETE — igual
--     ao resto do schema, preserva histórico de auditoria.
--   - "Copiar template" na criação de papel de empresa não foi
--     implementado: os templates nascem com role_permissions vazio
--     (seed.sql), copiar não teria nenhuma permissão pra trazer — seria
--     complexidade sem efeito prático hoje.
--   - Revogação imediata de sessão ao desativar usuário (§36) fica no
--     Server Action (admin.auth.admin.signOut), não nesta migration —
--     é chamada de Admin API, não SQL.
--   - Reset de senha por admin (§19, recorte mínimo de "recuperação de
--     acesso") é Admin API (updateUserById) + esta migration só marca
--     must_change_password.

-- =========================================================================
-- 1. criar_perfil_usuario() — segunda metade da criação de usuário (a
--    primeira, auth.users, é Admin API no Server Action). Sempre nasce
--    com must_change_password=true (mesmo texto do comentário da coluna:
--    "senha definida por outra pessoa, ainda não trocada pelo usuário").
-- =========================================================================

create or replace function public.criar_perfil_usuario(
  p_auth_user_id uuid,
  p_login_identifier text,
  p_display_name text,
  p_contact_email text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('users', 'manage');
begin
  if btrim(coalesce(p_login_identifier, '')) = '' then
    raise exception 'Matrícula/identificador de login não pode ser vazio.';
  end if;
  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'Nome não pode ser vazio.';
  end if;

  insert into public.profiles (id, company_id, login_identifier, display_name, contact_email, must_change_password)
  values (p_auth_user_id, v_company_id, btrim(p_login_identifier), btrim(p_display_name), p_contact_email, true);

  perform public.log_activity('users.usuario_criado', 'profile', p_auth_user_id, p_display_name, null);

  return p_auth_user_id;
end;
$$;

grant execute on function public.criar_perfil_usuario(uuid, text, text, text) to authenticated;

-- =========================================================================
-- 2. atribuir_papel_usuario() / revogar_papel_usuario() — user_roles.
--    Papel global (company_id null, template) pode ser atribuído
--    diretamente; papel de empresa precisa pertencer à MESMA empresa do
--    perfil (o trigger validate_user_role_tenant, SEC-009, já garante
--    isso no banco — aqui só garantimos que o PERFIL em si é desta
--    empresa, já que a função roda como service role internamente e não
--    pode confiar em RLS pra isso).
-- =========================================================================

create or replace function public.atribuir_papel_usuario(
  p_profile_id uuid,
  p_role_id uuid,
  p_valid_until timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('users', 'manage');
  v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_profile_id and company_id = v_company_id) then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and (company_id = v_company_id or company_id is null)) then
    raise exception 'Papel não encontrado nesta empresa.';
  end if;

  insert into public.user_roles (profile_id, role_id, valid_until)
  values (p_profile_id, p_role_id, p_valid_until)
  returning id into v_id;

  perform public.log_activity('users.papel_atribuido', 'user_role', v_id, null,
    jsonb_build_object('profile_id', p_profile_id, 'role_id', p_role_id, 'valid_until', p_valid_until));

  return v_id;
end;
$$;

grant execute on function public.atribuir_papel_usuario(uuid, uuid, timestamptz) to authenticated;

create or replace function public.revogar_papel_usuario(p_user_role_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('users', 'manage');
  v_profile_id uuid;
begin
  select ur.profile_id into v_profile_id
  from public.user_roles ur
  join public.profiles p on p.id = ur.profile_id
  where ur.id = p_user_role_id and p.company_id = v_company_id;

  if not found then
    raise exception 'Atribuição de papel não encontrada nesta empresa.';
  end if;

  update public.user_roles set valid_until = least(coalesce(valid_until, now()), now())
  where id = p_user_role_id;

  perform public.log_activity('users.papel_revogado', 'user_role', p_user_role_id, null,
    jsonb_build_object('profile_id', v_profile_id));
end;
$$;

grant execute on function public.revogar_papel_usuario(uuid) to authenticated;

-- =========================================================================
-- 3. desativar_usuario() / reativar_usuario() — profiles.active. A
--    revogação de sessão em tempo real (§36) é responsabilidade do
--    Server Action (Admin API), não desta função.
-- =========================================================================

create or replace function public.desativar_usuario(p_profile_id uuid, p_motivo text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('users', 'manage');
begin
  update public.profiles set active = false where id = p_profile_id and company_id = v_company_id;
  if not found then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;

  perform public.log_activity('users.usuario_desativado', 'profile', p_profile_id, p_motivo, null);
end;
$$;

grant execute on function public.desativar_usuario(uuid, text) to authenticated;

create or replace function public.reativar_usuario(p_profile_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('users', 'manage');
begin
  update public.profiles set active = true where id = p_profile_id and company_id = v_company_id;
  if not found then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;

  perform public.log_activity('users.usuario_reativado', 'profile', p_profile_id, null, null);
end;
$$;

grant execute on function public.reativar_usuario(uuid) to authenticated;

-- =========================================================================
-- 4. marcar_troca_senha_obrigatoria() — usada pelo reset de senha
--    administrativo (Server Action troca a senha via Admin API, esta
--    função só sinaliza que a próxima sessão precisa trocar).
-- =========================================================================

create or replace function public.marcar_troca_senha_obrigatoria(p_profile_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('users', 'manage');
begin
  update public.profiles set must_change_password = true where id = p_profile_id and company_id = v_company_id;
  if not found then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;

  perform public.log_activity('users.senha_resetada', 'profile', p_profile_id, null, null);
end;
$$;

grant execute on function public.marcar_troca_senha_obrigatoria(uuid) to authenticated;

-- =========================================================================
-- 5. criar_papel_empresa() / conceder_permissao_papel() /
--    revogar_permissao_papel() — RBAC configurável por empresa (ADR-002
--    §4.10/§4.11). Conceder/revogar só em papel DESTA empresa, nunca em
--    template global (company_id null) — evita uma empresa alterar
--    permissão que afeta todas as outras que usam o mesmo template.
-- =========================================================================

create or replace function public.criar_papel_empresa(p_key text, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('roles', 'manage');
  v_id uuid;
begin
  if btrim(coalesce(p_key, '')) = '' or btrim(coalesce(p_name, '')) = '' then
    raise exception 'Chave e nome do papel não podem ser vazios.';
  end if;

  insert into public.roles (company_id, key, name, is_system_template)
  values (v_company_id, upper(btrim(p_key)), btrim(p_name), false)
  returning id into v_id;

  perform public.log_activity('roles.papel_criado', 'role', v_id, p_name, null);

  return v_id;
end;
$$;

grant execute on function public.criar_papel_empresa(text, text) to authenticated;

create or replace function public.conceder_permissao_papel(p_role_id uuid, p_permission_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('roles', 'manage');
begin
  if not exists (select 1 from public.roles where id = p_role_id and company_id = v_company_id) then
    raise exception 'Papel não encontrado nesta empresa (papéis-modelo do sistema não podem ser alterados).';
  end if;

  insert into public.role_permissions (role_id, permission_id)
  values (p_role_id, p_permission_id)
  on conflict do nothing;

  perform public.log_activity('roles.permissao_concedida', 'role', p_role_id, null,
    jsonb_build_object('permission_id', p_permission_id));
end;
$$;

grant execute on function public.conceder_permissao_papel(uuid, uuid) to authenticated;

create or replace function public.revogar_permissao_papel(p_role_id uuid, p_permission_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('roles', 'manage');
begin
  if not exists (select 1 from public.roles where id = p_role_id and company_id = v_company_id) then
    raise exception 'Papel não encontrado nesta empresa (papéis-modelo do sistema não podem ser alterados).';
  end if;

  delete from public.role_permissions where role_id = p_role_id and permission_id = p_permission_id;

  perform public.log_activity('roles.permissao_revogada', 'role', p_role_id, null,
    jsonb_build_object('permission_id', p_permission_id));
end;
$$;

grant execute on function public.revogar_permissao_papel(uuid, uuid) to authenticated;
