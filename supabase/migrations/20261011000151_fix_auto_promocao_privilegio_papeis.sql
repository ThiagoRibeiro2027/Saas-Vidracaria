-- Fecha a brecha de auto-promoção de privilégio em atribuir_papel_usuario()
-- e conceder_permissao_papel() (TÓPICO 14, 20260927000000). Achada na
-- auditoria de gaps ADR-001 a ADR-012 de 11/10/2026.
--
-- Hoje as duas funções checam só assert_tenant_write('users'|'roles',
-- 'manage') — quem gerencia usuários/papéis pode conceder a um papel uma
-- permissão que ele mesmo nunca teve, e depois atribuir esse papel a si
-- mesmo (ou a terceiros), obtendo acesso que nenhum ADMIN jamais concedeu
-- de fato. ADMIN (template global) já nasce com todas as permissões
-- (seed.sql), então este fix não quebra o fluxo normal de um ADMIN
-- atribuindo papéis subordinados — só bloqueia quem tenta conceder/
-- atribuir algo além do que já possui. platform_admin com MFA continua
-- liberado, porque has_permission() já faz esse OR internamente.

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

  if exists (
    select 1
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = p_role_id
      and not public.has_permission(p.resource, p.action)
  ) then
    raise exception 'Você não pode atribuir um papel com permissões que você mesmo não possui.';
  end if;

  insert into public.user_roles (profile_id, role_id, valid_until)
  values (p_profile_id, p_role_id, p_valid_until)
  returning id into v_id;

  perform public.log_activity('users.papel_atribuido', 'user_role', v_id, null,
    jsonb_build_object('profile_id', p_profile_id, 'role_id', p_role_id, 'valid_until', p_valid_until));

  return v_id;
end;
$$;

create or replace function public.conceder_permissao_papel(p_role_id uuid, p_permission_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('roles', 'manage');
  v_resource text;
  v_action text;
begin
  if not exists (select 1 from public.roles where id = p_role_id and company_id = v_company_id) then
    raise exception 'Papel não encontrado nesta empresa (papéis-modelo do sistema não podem ser alterados).';
  end if;

  select p.resource, p.action into v_resource, v_action
  from public.permissions p
  where p.id = p_permission_id;

  if v_resource is null then
    raise exception 'Permissão não encontrada.';
  end if;

  if not public.has_permission(v_resource, v_action) then
    raise exception 'Você não pode conceder uma permissão que você mesmo não possui.';
  end if;

  insert into public.role_permissions (role_id, permission_id)
  values (p_role_id, p_permission_id)
  on conflict do nothing;

  perform public.log_activity('roles.permissao_concedida', 'role', p_role_id, null,
    jsonb_build_object('permission_id', p_permission_id));
end;
$$;
