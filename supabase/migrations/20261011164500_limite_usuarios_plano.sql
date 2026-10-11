-- Achado da auditoria de gaps ADR-001 a ADR-012 (11/10/2026): Prompt
-- Mestre item 23 exige "companies → subscription → plan → max_users" e
-- que "o sistema deverá impedir a criação de usuários acima do limite" —
-- plans.max_users existe desde a Fundação SaaS Governance
-- (20260911234557), mas nunca foi lido por nenhuma função de escrita;
-- era só exibido (painel platform_admin, src/app/governance/page.tsx).
-- Uma empresa no plano START (hipoteticamente 5 usuários) conseguia
-- criar o 6º, 7º, 50º usuário sem nenhum bloqueio.
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
  v_max_users integer;
  v_active_count integer;
begin
  if btrim(coalesce(p_login_identifier, '')) = '' then
    raise exception 'Matrícula/identificador de login não pode ser vazio.';
  end if;
  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'Nome não pode ser vazio.';
  end if;

  select pl.max_users into v_max_users
  from public.subscriptions s
  join public.plans pl on pl.id = s.plan_id
  where s.company_id = v_company_id;

  if v_max_users is not null then
    select count(*) into v_active_count from public.profiles where company_id = v_company_id and active;
    if v_active_count >= v_max_users then
      raise exception 'Limite de usuários do plano atingido (%/% usuários ativos). Desative um usuário ou faça upgrade de plano.', v_active_count, v_max_users;
    end if;
  end if;

  insert into public.profiles (id, company_id, login_identifier, display_name, contact_email, must_change_password)
  values (p_auth_user_id, v_company_id, btrim(p_login_identifier), btrim(p_display_name), p_contact_email, true);

  perform public.log_activity('users.usuario_criado', 'profile', p_auth_user_id, p_display_name, null);

  return p_auth_user_id;
end;
$$;
