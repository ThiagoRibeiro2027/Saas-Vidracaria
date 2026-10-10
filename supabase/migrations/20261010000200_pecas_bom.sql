-- Peças Fabricadas — Fase A do plano aprovado em 23/09/2026 (fila de
-- produção, peças fabricadas e necessidades automáticas de suprimentos).
-- Camada de BOM (lista de materiais) deliberadamente leve, decisão
-- confirmada com o responsável do produto: uma peça (item do catálogo já
-- existente) associada a uma lista PLANA de materiais e quantidade por
-- unidade — sem hierarquia Produto→Conjunto→Subconjunto, sem motor de
-- regras e sem versionamento novo (isso é o Prompt TÓPICO 5 completo, que
-- segue fora de escopo, "fora do M1" desde a própria migration de
-- fundação ampliada — 20260916080000).
--
-- Sem essa camada não tem como o sistema somar "este pedido de 10 janelas
-- modelo X precisa de N metros de perfil Y" — cada pedido hoje só
-- referencia itens do catálogo de forma solta (pedido_itens), sem
-- composição. Isso é o que a Fase C (necessidades automáticas de
-- Suprimentos, próxima fase) vai consumir.

create table public.pecas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null references public.itens(id),
  descricao_tecnica text,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pecas_item_id_unique unique (item_id)
);
comment on table public.pecas is 'Fase A do plano de 23/09/2026 — uma peça fabricada é um item do catálogo (tipo componente/produto_acabado, validado em criar_peca()) com uma lista de materiais associada (peca_composicao). item_id é único: um item só pode ser "a mesma" peça uma vez.';
create index pecas_company_id_idx on public.pecas (company_id);

create table public.peca_composicao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  peca_id uuid not null references public.pecas(id) on delete cascade,
  material_item_id uuid not null references public.itens(id),
  quantidade_por_unidade numeric(14, 4) not null check (quantidade_por_unidade > 0),
  observacao text,
  created_at timestamptz not null default now(),
  constraint peca_composicao_unique unique (peca_id, material_item_id)
);
comment on table public.peca_composicao is 'Fase A — linha de material da peça (perfil/vidro/acessório/insumo), quantidade por 1 unidade da peça. Plana, sem hierarquia — um material não pode ser composto de outros materiais nesta fase.';
create index peca_composicao_company_id_idx on public.peca_composicao (company_id);
create index peca_composicao_peca_id_idx on public.peca_composicao (peca_id);

alter table public.pecas enable row level security;
create policy pecas_select on public.pecas for select
  using (company_id = (select public.current_company_id()));
grant select on public.pecas to authenticated;

alter table public.peca_composicao enable row level security;
create policy peca_composicao_select on public.peca_composicao for select
  using (company_id = (select public.current_company_id()));
grant select on public.peca_composicao to authenticated;

create trigger set_updated_at before update on public.pecas
  for each row execute function public.set_updated_at();

-- =========================================================================
-- criar_peca() — item precisa ser componente ou produto_acabado (matéria-
-- prima/insumo não vira "peça", ela é o que compõe a peça); um item só
-- pode virar peça uma vez (unique).
-- =========================================================================

create or replace function public.criar_peca(p_item_id uuid, p_descricao_tecnica text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_item public.itens;
  v_id uuid;
begin
  select * into v_item from public.itens where id = p_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if v_item.tipo not in ('componente', 'produto_acabado') then
    raise exception 'Só item do tipo componente ou produto_acabado pode virar peça (tipo atual: "%").', v_item.tipo;
  end if;
  if exists (select 1 from public.pecas where item_id = p_item_id) then
    raise exception 'Este item já é uma peça cadastrada.';
  end if;

  insert into public.pecas (company_id, item_id, descricao_tecnica)
  values (v_company_id, p_item_id, p_descricao_tecnica)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'pecas.peca_criada', 'peca', v_id, v_item.codigo);

  return v_id;
end;
$$;

grant execute on function public.criar_peca(uuid, text) to authenticated;

create or replace function public.inativar_peca(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
begin
  update public.pecas set situacao = 'inativo' where id = p_id and company_id = v_company_id and situacao = 'ativo';
  if not found then
    raise exception 'Peça ativa não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'pecas.peca_inativada', 'peca', p_id, null);

  return p_id;
end;
$$;

grant execute on function public.inativar_peca(uuid) to authenticated;

create or replace function public.reativar_peca(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
begin
  update public.pecas set situacao = 'ativo' where id = p_id and company_id = v_company_id and situacao = 'inativo';
  if not found then
    raise exception 'Peça inativa não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'pecas.peca_reativada', 'peca', p_id, null);

  return p_id;
end;
$$;

grant execute on function public.reativar_peca(uuid) to authenticated;

-- =========================================================================
-- adicionar_material_peca() / atualizar_material_peca() /
-- remover_material_peca() — a lista de materiais da peça. Adicionar
-- material já cadastrado na peça é rejeitado explicitamente (usar
-- atualizar_material_peca) — sem upsert silencioso, mesmo padrão de
-- convenção já usado no projeto (ex.: numbering_sequences).
-- =========================================================================

create or replace function public.adicionar_material_peca(
  p_peca_id uuid, p_material_item_id uuid, p_quantidade_por_unidade numeric, p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_material public.itens;
  v_id uuid;
begin
  if not exists (select 1 from public.pecas where id = p_peca_id and company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;
  select * into v_material from public.itens where id = p_material_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de material não encontrado nesta empresa.';
  end if;
  if v_material.tipo not in ('materia_prima', 'insumo', 'material_auxiliar') then
    raise exception 'Só item do tipo matéria-prima, insumo ou material auxiliar pode compor uma peça (tipo atual: "%").', v_material.tipo;
  end if;
  if p_quantidade_por_unidade is null or p_quantidade_por_unidade <= 0 then
    raise exception 'Quantidade por unidade precisa ser maior que zero.';
  end if;
  if exists (select 1 from public.peca_composicao where peca_id = p_peca_id and material_item_id = p_material_item_id) then
    raise exception 'Este material já está na composição da peça — use atualizar_material_peca() para alterar a quantidade.';
  end if;

  insert into public.peca_composicao (company_id, peca_id, material_item_id, quantidade_por_unidade, observacao)
  values (v_company_id, p_peca_id, p_material_item_id, p_quantidade_por_unidade, p_observacao)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pecas.material_adicionado', 'peca_composicao', v_id, v_material.codigo,
    jsonb_build_object('peca_id', p_peca_id, 'material_item_id', p_material_item_id, 'quantidade_por_unidade', p_quantidade_por_unidade)
  );

  return v_id;
end;
$$;

grant execute on function public.adicionar_material_peca(uuid, uuid, numeric, text) to authenticated;

create or replace function public.atualizar_material_peca(
  p_id uuid, p_quantidade_por_unidade numeric, p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
begin
  if p_quantidade_por_unidade is null or p_quantidade_por_unidade <= 0 then
    raise exception 'Quantidade por unidade precisa ser maior que zero.';
  end if;

  update public.peca_composicao
  set quantidade_por_unidade = p_quantidade_por_unidade, observacao = p_observacao
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Linha de composição não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pecas.material_atualizado', 'peca_composicao', p_id, null,
    jsonb_build_object('quantidade_por_unidade', p_quantidade_por_unidade)
  );

  return p_id;
end;
$$;

grant execute on function public.atualizar_material_peca(uuid, numeric, text) to authenticated;

create or replace function public.remover_material_peca(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
begin
  delete from public.peca_composicao where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Linha de composição não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'pecas.material_removido', 'peca_composicao', p_id, null);
end;
$$;

grant execute on function public.remover_material_peca(uuid) to authenticated;

-- =========================================================================
-- listar_composicao_peca() — leitura, junta com itens pra trazer código/
-- descrição/unidade do material (mesmo padrão de leitura de
-- listar_fila_producao/listar_programacao).
-- =========================================================================

create or replace function public.listar_composicao_peca(p_peca_id uuid)
returns table (
  id uuid,
  material_item_id uuid,
  material_codigo text,
  material_descricao text,
  material_unidade text,
  quantidade_por_unidade numeric,
  observacao text
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pecas', 'view') then
    raise exception 'Sem permissão para consultar peças (pecas.view).';
  end if;
  if not exists (select 1 from public.pecas p where p.id = p_peca_id and p.company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;

  return query
  select pc.id, pc.material_item_id, i.codigo, i.descricao, i.unidade_principal, pc.quantidade_por_unidade, pc.observacao
  from public.peca_composicao pc
  join public.itens i on i.id = pc.material_item_id
  where pc.peca_id = p_peca_id and pc.company_id = v_company_id
  order by i.codigo;
end;
$$;

grant execute on function public.listar_composicao_peca(uuid) to authenticated;
