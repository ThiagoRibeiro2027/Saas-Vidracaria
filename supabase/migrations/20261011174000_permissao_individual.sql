-- TÓPICO 14 §5/§6 (Prompt TÓPICO 14 — Usuários/Permissões), achado da
-- auditoria de gaps ADR-001 a ADR-012 (11/10/2026): "Permitir permissões
-- individuais por usuário. Permitir que uma permissão individual:
-- conceda; complemente; restrinja; permissões provenientes de perfis.
-- Suportar permissões restritivas/negativas quando necessário." §6 dá o
-- exemplo de referência: "Perfil A → editar pedidos; restrição individual
-- → não aprovar [...] Usuário pode editar pedidos [...] e não pode
-- aprová-los" — hoje toda autorização resolve só por papel
-- (user_roles ⋈ role_permissions), sem nenhum mecanismo por usuário.
--
-- Fora do recorte, deliberadamente: o exemplo do §6 também usa "escopo →
-- Filial 2" e "alçada → R$ 30.000" — duas dimensões extras (unidade/
-- filial, limite monetário) que dependem de cadastro de filiais, ainda
-- não construído (decisão explícita do responsável do produto de deixar
-- para depois). Implementar aqui só o núcleo pedido de verdade — conceder/
-- restringir permissão individual, com precedência clara — sem inventar
-- um sistema de escopo geográfico/financeiro que a filial ainda nem
-- existe para alimentar.
--
-- ATENÇÃO — esta migration altera has_permission(), a função de
-- autorização central chamada por toda escrita de negócio do sistema.
-- Qualquer erro aqui tem alcance máximo. Mesma defesa contra auto-
-- promoção de privilégio já aplicada em atribuir_papel_usuario()/
-- conceder_permissao_papel() (fix 20261011000151): conceder uma
-- permissão individual exige que quem concede já possua essa permissão —
-- restringir/negar nunca precisa desse requisito, porque reduzir acesso
-- não é um vetor de escalação.

create table public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  profile_id uuid not null references public.profiles(id),
  permission_id uuid not null references public.permissions(id),
  efeito text not null check (efeito in ('conceder', 'negar')),
  concedido_por uuid references public.profiles(id),
  motivo text,
  created_at timestamptz not null default now(),
  constraint user_permissions_unique unique (profile_id, permission_id)
);
comment on table public.user_permissions is
  'TÓPICO 14 §5/§6 — permissão individual por usuário, além/apesar do papel. "negar" sempre vence sobre o papel (restrição nunca é ignorada); "conceder" garante a permissão mesmo sem papel que a dê. Não tem dimensão de escopo/alçada (filial, limite de valor) — fora do recorte, ver comentário no topo da migration.';
create index user_permissions_company_id_idx on public.user_permissions (company_id);

alter table public.user_permissions enable row level security;
create policy user_permissions_select on public.user_permissions for select
  using (
    company_id = (select public.current_company_id())
    and (
      profile_id = (select auth.uid())
      or (select public.has_permission('roles', 'manage'))
      or (select public.is_platform_admin_mfa_verified())
    )
  );
grant select on public.user_permissions to authenticated;

-- =========================================================================
-- has_permission() — mesma assinatura e mesmos chamadores (nenhum código
-- que já chama esta função precisa mudar). Resolução: override individual
-- de 'negar' sempre vence (nunca cai pro papel); override 'conceder'
-- garante a permissão mesmo sem papel; sem override nenhum, comportamento
-- idêntico ao de antes (resolve só por papel). platform_admin continua
-- como bypass independente, antes de qualquer checagem de empresa —
-- inalterado.
-- =========================================================================
create or replace function public.has_permission(p_resource text, p_action text)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.is_platform_admin_mfa_verified()
    or coalesce(
      (
        select up.efeito = 'conceder'
        from public.user_permissions up
        join public.permissions p on p.id = up.permission_id
        where up.profile_id = auth.uid() and p.resource = p_resource and p.action = p_action
      ),
      exists (
        select 1
        from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id
        join public.permissions p on p.id = rp.permission_id
        where ur.profile_id = auth.uid()
          and p.resource = p_resource
          and p.action = p_action
          and ur.valid_from <= now()
          and (ur.valid_until is null or ur.valid_until > now())
      )
    );
$$;

-- =========================================================================
-- conceder_permissao_individual() / restringir_permissao_individual() /
-- remover_permissao_individual() — mesmo padrão de criar_papel_empresa()/
-- conceder_permissao_papel() (TÓPICO 14, 20260927000000): gate é
-- roles.manage (gerenciar o que alguém pode fazer é a mesma
-- responsabilidade de gerenciar papéis, só granular por pessoa em vez de
-- por papel).
-- =========================================================================

create or replace function public.conceder_permissao_individual(
  p_profile_id uuid,
  p_permission_id uuid,
  p_motivo text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_resource text;
  v_action text;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('roles', 'manage') then
    raise exception 'Sem permissão para gerenciar permissões individuais (roles.manage).';
  end if;
  perform public.assert_company_not_suspended();

  if not exists (select 1 from public.profiles where id = p_profile_id and company_id = v_company_id) then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;

  select p.resource, p.action into v_resource, v_action from public.permissions p where p.id = p_permission_id;
  if v_resource is null then
    raise exception 'Permissão não encontrada.';
  end if;

  -- Mesma defesa contra auto-promoção de privilégio do fix 20261011000151
  -- (conceder_permissao_papel): nunca conceder o que o próprio chamador
  -- não possui — nem a si mesmo, nem a terceiros.
  if not public.has_permission(v_resource, v_action) then
    raise exception 'Você não pode conceder uma permissão que você mesmo não possui.';
  end if;

  insert into public.user_permissions (company_id, profile_id, permission_id, efeito, concedido_por, motivo)
  values (v_company_id, p_profile_id, p_permission_id, 'conceder', auth.uid(), p_motivo)
  on conflict (profile_id, permission_id) do update
    set efeito = 'conceder', concedido_por = auth.uid(), motivo = p_motivo, created_at = now()
  returning id into v_id;

  perform public.log_activity(
    'roles.permissao_individual_concedida', 'profile', p_profile_id, p_motivo,
    jsonb_build_object('permission_id', p_permission_id, 'resource', v_resource, 'action', v_action)
  );

  return v_id;
end;
$$;

grant execute on function public.conceder_permissao_individual(uuid, uuid, text) to authenticated;

create or replace function public.restringir_permissao_individual(
  p_profile_id uuid,
  p_permission_id uuid,
  p_motivo text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_resource text;
  v_action text;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('roles', 'manage') then
    raise exception 'Sem permissão para gerenciar permissões individuais (roles.manage).';
  end if;
  perform public.assert_company_not_suspended();

  if not exists (select 1 from public.profiles where id = p_profile_id and company_id = v_company_id) then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;

  select p.resource, p.action into v_resource, v_action from public.permissions p where p.id = p_permission_id;
  if v_resource is null then
    raise exception 'Permissão não encontrada.';
  end if;

  -- Restringir nunca precisa da checagem acima — reduzir o acesso de
  -- alguém não é um vetor de escalação, mesmo que quem restringe não
  -- possua a própria permissão.
  insert into public.user_permissions (company_id, profile_id, permission_id, efeito, concedido_por, motivo)
  values (v_company_id, p_profile_id, p_permission_id, 'negar', auth.uid(), p_motivo)
  on conflict (profile_id, permission_id) do update
    set efeito = 'negar', concedido_por = auth.uid(), motivo = p_motivo, created_at = now()
  returning id into v_id;

  perform public.log_activity(
    'roles.permissao_individual_restringida', 'profile', p_profile_id, p_motivo,
    jsonb_build_object('permission_id', p_permission_id, 'resource', v_resource, 'action', v_action)
  );

  return v_id;
end;
$$;

grant execute on function public.restringir_permissao_individual(uuid, uuid, text) to authenticated;

create or replace function public.remover_permissao_individual(p_profile_id uuid, p_permission_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_deleted_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('roles', 'manage') then
    raise exception 'Sem permissão para gerenciar permissões individuais (roles.manage).';
  end if;

  delete from public.user_permissions
  where profile_id = p_profile_id
    and permission_id = p_permission_id
    and company_id = v_company_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Não há override individual para remover.';
  end if;

  perform public.log_activity(
    'roles.permissao_individual_removida', 'profile', p_profile_id, null,
    jsonb_build_object('permission_id', p_permission_id)
  );
end;
$$;

grant execute on function public.remover_permissao_individual(uuid, uuid) to authenticated;

-- =========================================================================
-- listar_permissoes_efetivas() — TÓPICO 14 §6: "o administrador deverá
-- conseguir responder: o que este usuário realmente pode fazer?" Devolve
-- toda permissão do catálogo com a origem (papel, override individual) e
-- o resultado final — mesmo cálculo de has_permission(), só pra todas as
-- permissões de uma vez, com a explicação de onde vem cada uma.
-- =========================================================================
create or replace function public.listar_permissoes_efetivas(p_profile_id uuid)
returns table (
  permission_id uuid,
  resource text,
  action text,
  via_papel boolean,
  override text,
  efetiva boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('roles', 'manage') and not public.has_permission('users', 'manage') then
    raise exception 'Sem permissão para consultar permissões efetivas.';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id and company_id = v_company_id) then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;

  return query
  select
    p.id,
    p.resource,
    p.action,
    exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.profile_id = p_profile_id
        and rp.permission_id = p.id
        and ur.valid_from <= now()
        and (ur.valid_until is null or ur.valid_until > now())
    ) as via_papel,
    up.efeito as override,
    coalesce(
      up.efeito = 'conceder',
      exists (
        select 1 from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id
        where ur.profile_id = p_profile_id
          and rp.permission_id = p.id
          and ur.valid_from <= now()
          and (ur.valid_until is null or ur.valid_until > now())
      )
    ) as efetiva
  from public.permissions p
  left join public.user_permissions up on up.permission_id = p.id and up.profile_id = p_profile_id
  order by p.resource, p.action;
end;
$$;

grant execute on function public.listar_permissoes_efetivas(uuid) to authenticated;
