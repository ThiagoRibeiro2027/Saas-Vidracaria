-- BOM hierárquica + revisão básica — Fase E do plano de evolução da BOM
-- leve (aprovado em 23/09/2026), dentro do que o ADR-002 §4.5 já
-- autoriza ("composição, componentes, materiais, quantidades... revisões;
-- histórico") — não precisa de emenda ao ADR, só amplia dentro do texto
-- já aprovado. O motor de regras (Fase G) é que vai precisar de emenda,
-- por ser automação nova não coberta pelo §4.5 atual.
--
-- Hierarquia: peca_composicao.material_item_id passa a aceitar, além de
-- matéria-prima/insumo/material_auxiliar (folha), outro item que já seja
-- uma peça (componente/produto_acabado com linha em `pecas`) — um
-- subconjunto. Trava de ciclo via peca_contem_peca() (percorre a árvore
-- recursivamente) — uma peça não pode compor, direta ou indiretamente,
-- a si mesma.
--
-- Revisão básica: toda mudança estrutural na composição de uma peça
-- (adicionar/atualizar/remover material) grava um snapshot em
-- peca_revisoes e incrementa pecas.revisao_atual — histórico consultável
-- via listar_revisoes_peca(), sem apagar nada (nenhum UPDATE/DELETE em
-- peca_revisoes, só INSERT).
--
-- Efeito colateral necessário: gerar_necessidades_de_pedido()/
-- gerar_necessidades_de_ordem_producao() (Fase C, 20261013000000) hoje
-- só juntam peca_composicao em 1 nível — com hierarquia, uma peça que
-- contém subconjunto teria material subestimado (a função nunca desceria
-- ao nível do subconjunto). Reescritas aqui para expandir a árvore
-- inteira via CTE recursiva, somando só as folhas (item que não é peça).

alter table public.pecas
  add column revisao_atual integer not null default 0 check (revisao_atual >= 0);
comment on column public.pecas.revisao_atual is 'Fase E — incrementado a cada mudança estrutural na composição (ver snapshot_revisao_peca()). 0 = peça criada, sem nenhuma composição gravada ainda.';

create table public.peca_revisoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  peca_id uuid not null references public.pecas(id) on delete cascade,
  revisao integer not null check (revisao > 0),
  composicao_snapshot jsonb not null,
  motivo text,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint peca_revisoes_unique unique (peca_id, revisao)
);
comment on table public.peca_revisoes is 'Fase E — snapshot da composição da peça a cada mudança estrutural. Só INSERT (nunca UPDATE/DELETE) — é histórico, não estado atual.';
create index peca_revisoes_company_id_idx on public.peca_revisoes (company_id);
create index peca_revisoes_peca_id_idx on public.peca_revisoes (peca_id);

alter table public.peca_revisoes enable row level security;
create policy peca_revisoes_select on public.peca_revisoes for select
  using (company_id = (select public.current_company_id()));
grant select on public.peca_revisoes to authenticated;

-- =========================================================================
-- peca_contem_peca() — interna, sem grant a authenticated. Percorre a
-- árvore de composição a partir de p_peca_id_raiz e diz se p_peca_id_alvo
-- é alcançável (inclusive a própria raiz) — usada só para travar ciclo em
-- adicionar_material_peca(), nunca chamada direto por RPC.
-- =========================================================================

create or replace function public.peca_contem_peca(p_peca_id_raiz uuid, p_peca_id_alvo uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  with recursive arvore(peca_id) as (
    select p_peca_id_raiz
    union
    select p2.id
    from arvore a
    join public.peca_composicao pc on pc.peca_id = a.peca_id
    join public.pecas p2 on p2.item_id = pc.material_item_id
  )
  select exists (select 1 from arvore where peca_id = p_peca_id_alvo);
$$;

-- =========================================================================
-- snapshot_revisao_peca() — interna, sem grant a authenticated. Chamada
-- via `perform` pelas três funções de composição depois da mutação já
-- efetivada — grava o estado resultante, não o anterior.
-- =========================================================================

create or replace function public.snapshot_revisao_peca(p_peca_id uuid, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_nova_revisao integer;
  v_snapshot jsonb;
begin
  update public.pecas set revisao_atual = revisao_atual + 1
  where id = p_peca_id
  returning revisao_atual into v_nova_revisao;

  select coalesce(jsonb_agg(jsonb_build_object(
    'material_item_id', pc.material_item_id,
    'material_codigo', i.codigo,
    'eh_peca', exists (select 1 from public.pecas sp where sp.item_id = pc.material_item_id),
    'quantidade_por_unidade', pc.quantidade_por_unidade,
    'observacao', pc.observacao
  ) order by i.codigo), '[]'::jsonb)
  into v_snapshot
  from public.peca_composicao pc
  join public.itens i on i.id = pc.material_item_id
  where pc.peca_id = p_peca_id;

  insert into public.peca_revisoes (company_id, peca_id, revisao, composicao_snapshot, motivo, criado_por)
  values (v_company_id, p_peca_id, v_nova_revisao, v_snapshot, p_motivo, auth.uid());

  return v_nova_revisao;
end;
$$;

-- =========================================================================
-- adicionar_material_peca() — agora aceita subconjunto (outra peça) além
-- de matéria-prima/insumo/material_auxiliar, com trava de ciclo. Grava
-- revisão ao final.
-- =========================================================================

create or replace function public.adicionar_material_peca(
  p_peca_id uuid, p_material_item_id uuid, p_quantidade_por_unidade numeric, p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_material public.itens;
  v_sub_peca public.pecas;
  v_id uuid;
begin
  if not exists (select 1 from public.pecas where id = p_peca_id and company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;
  select * into v_material from public.itens where id = p_material_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de material não encontrado nesta empresa.';
  end if;

  if v_material.tipo in ('componente', 'produto_acabado') then
    select * into v_sub_peca from public.pecas where item_id = p_material_item_id and company_id = v_company_id;
    if not found then
      raise exception 'Item "%" ainda não é uma peça cadastrada — cadastre-o como peça antes de usá-lo como subconjunto.', v_material.codigo;
    end if;
    if v_sub_peca.situacao <> 'ativo' then
      raise exception 'A peça "%" está inativa e não pode compor outra peça.', v_material.codigo;
    end if;
    if public.peca_contem_peca(v_sub_peca.id, p_peca_id) then
      raise exception 'Não é possível adicionar "%" — criaria um ciclo (essa peça já compõe, direta ou indiretamente, a peça de destino).', v_material.codigo;
    end if;
  elsif v_material.tipo not in ('materia_prima', 'insumo', 'material_auxiliar') then
    raise exception 'Item do tipo "%" não pode compor uma peça (aceito: matéria-prima, insumo, material auxiliar, ou outra peça já cadastrada).', v_material.tipo;
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

  perform public.snapshot_revisao_peca(p_peca_id, format('Material "%s" adicionado.', v_material.codigo));

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pecas.material_adicionado', 'peca_composicao', v_id, v_material.codigo,
    jsonb_build_object('peca_id', p_peca_id, 'material_item_id', p_material_item_id, 'quantidade_por_unidade', p_quantidade_por_unidade)
  );

  return v_id;
end;
$$;

create or replace function public.atualizar_material_peca(
  p_id uuid, p_quantidade_por_unidade numeric, p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_peca_id uuid;
begin
  if p_quantidade_por_unidade is null or p_quantidade_por_unidade <= 0 then
    raise exception 'Quantidade por unidade precisa ser maior que zero.';
  end if;

  update public.peca_composicao
  set quantidade_por_unidade = p_quantidade_por_unidade, observacao = p_observacao
  where id = p_id and company_id = v_company_id
  returning peca_id into v_peca_id;
  if not found then
    raise exception 'Linha de composição não encontrada nesta empresa.';
  end if;

  perform public.snapshot_revisao_peca(v_peca_id, 'Quantidade/observação de material atualizada.');

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pecas.material_atualizado', 'peca_composicao', p_id, null,
    jsonb_build_object('quantidade_por_unidade', p_quantidade_por_unidade)
  );

  return p_id;
end;
$$;

create or replace function public.remover_material_peca(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_peca_id uuid;
begin
  delete from public.peca_composicao where id = p_id and company_id = v_company_id
  returning peca_id into v_peca_id;
  if not found then
    raise exception 'Linha de composição não encontrada nesta empresa.';
  end if;

  perform public.snapshot_revisao_peca(v_peca_id, 'Material removido.');

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'pecas.material_removido', 'peca_composicao', p_id, null);
end;
$$;

-- =========================================================================
-- inativar_peca() — passa a rejeitar se a peça compõe outra peça ativa
-- (evita quebrar silenciosamente a BOM de quem usa esta peça como
-- subconjunto).
-- =========================================================================

create or replace function public.inativar_peca(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_item_id uuid;
begin
  select item_id into v_item_id from public.pecas where id = p_id and company_id = v_company_id and situacao = 'ativo';
  if not found then
    raise exception 'Peça ativa não encontrada nesta empresa.';
  end if;

  if exists (
    select 1 from public.peca_composicao pc
    join public.pecas parent on parent.id = pc.peca_id
    where pc.material_item_id = v_item_id and parent.situacao = 'ativo'
  ) then
    raise exception 'Não é possível inativar: esta peça compõe outra peça ativa como subconjunto.';
  end if;

  update public.pecas set situacao = 'inativo' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'pecas.peca_inativada', 'peca', p_id, null);

  return p_id;
end;
$$;

-- =========================================================================
-- listar_composicao_peca() — ganha a coluna eh_peca (a função muda de
-- assinatura de retorno, precisa DROP antes do CREATE).
-- =========================================================================

drop function if exists public.listar_composicao_peca(uuid);

create function public.listar_composicao_peca(p_peca_id uuid)
returns table (
  id uuid,
  material_item_id uuid,
  material_codigo text,
  material_descricao text,
  material_unidade text,
  quantidade_por_unidade numeric,
  observacao text,
  eh_peca boolean
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
  select pc.id, pc.material_item_id, i.codigo, i.descricao, i.unidade_principal, pc.quantidade_por_unidade, pc.observacao,
    exists (select 1 from public.pecas sp where sp.item_id = pc.material_item_id) as eh_peca
  from public.peca_composicao pc
  join public.itens i on i.id = pc.material_item_id
  where pc.peca_id = p_peca_id and pc.company_id = v_company_id
  order by i.codigo;
end;
$$;

grant execute on function public.listar_composicao_peca(uuid) to authenticated;

-- =========================================================================
-- listar_revisoes_peca() — leitura do histórico.
-- =========================================================================

create or replace function public.listar_revisoes_peca(p_peca_id uuid)
returns table (
  revisao integer,
  composicao_snapshot jsonb,
  motivo text,
  criado_por uuid,
  created_at timestamptz
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
  select pr.revisao, pr.composicao_snapshot, pr.motivo, pr.criado_por, pr.created_at
  from public.peca_revisoes pr
  where pr.peca_id = p_peca_id and pr.company_id = v_company_id
  order by pr.revisao desc;
end;
$$;

grant execute on function public.listar_revisoes_peca(uuid) to authenticated;

-- =========================================================================
-- gerar_necessidades_de_pedido() / gerar_necessidades_de_ordem_producao()
-- (Fase C) — reescritas para expandir a árvore de composição inteira via
-- CTE recursiva, somando só as folhas (item que não é peça). Assinatura
-- e o resto do corpo (disponível, já sinalizado, falta, chamada a
-- criar_necessidade_compra) não mudam.
-- =========================================================================

create or replace function public.gerar_necessidades_de_pedido(p_pedido_id uuid)
returns table (item_id uuid, item_codigo text, item_descricao text, quantidade_gerada numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_pedido public.pedidos;
  v_linha record;
  v_disponivel numeric;
  v_ja_sinalizado numeric;
  v_falta numeric;
  v_gerados int := 0;
  v_itens_gerados jsonb := '[]'::jsonb;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id and company_id = v_company_id;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível gerar necessidades para pedido liberado (status atual: %).', v_pedido.status;
  end if;

  for v_linha in
    with recursive expansao as (
      select pc.material_item_id as mat_id, pi.quantidade * pc.quantidade_por_unidade as qtd_total
      from public.pedido_itens pi
      join public.pecas p on p.item_id = pi.item_id and p.company_id = v_company_id
      join public.peca_composicao pc on pc.peca_id = p.id
      where pi.pedido_id = p_pedido_id
      union all
      select pc2.material_item_id, e.qtd_total * pc2.quantidade_por_unidade
      from expansao e
      join public.pecas sp on sp.item_id = e.mat_id
      join public.peca_composicao pc2 on pc2.peca_id = sp.id
    )
    select e.mat_id, i.codigo as mat_codigo, i.descricao as mat_descricao, sum(e.qtd_total) as necessario
    from expansao e
    join public.itens i on i.id = e.mat_id
    where not exists (select 1 from public.pecas sp2 where sp2.item_id = e.mat_id)
    group by e.mat_id, i.codigo, i.descricao
  loop
    select coalesce(es.quantidade_fisica, 0) - coalesce(es.quantidade_reservada, 0)
      into v_disponivel
    from public.estoque_saldos es
    where es.company_id = v_company_id and es.item_id = v_linha.mat_id;
    v_disponivel := coalesce(v_disponivel, 0);

    select coalesce(sum(nc.quantidade), 0) into v_ja_sinalizado
    from public.necessidades_compra nc
    where nc.company_id = v_company_id and nc.item_id = v_linha.mat_id
      and nc.origem in ('pedido', 'producao') and nc.status = 'aberta';

    v_falta := v_linha.necessario - v_disponivel - v_ja_sinalizado;
    if v_falta > 0 then
      perform public.criar_necessidade_compra(
        v_linha.mat_id, v_falta, null, 'pedido',
        format('Gerado automaticamente a partir do pedido %s.', v_pedido.numero)
      );
      v_gerados := v_gerados + 1;
      v_itens_gerados := v_itens_gerados || jsonb_build_object('item_id', v_linha.mat_id, 'quantidade', v_falta);
      return query select v_linha.mat_id, v_linha.mat_codigo, v_linha.mat_descricao, v_falta;
    end if;
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'suprimentos.necessidades_geradas_de_pedido', 'pedido', p_pedido_id, v_pedido.numero,
    jsonb_build_object('count', v_gerados, 'items', v_itens_gerados)
  );
end;
$$;

create or replace function public.gerar_necessidades_de_ordem_producao(p_ordem_producao_id uuid)
returns table (item_id uuid, item_codigo text, item_descricao text, quantidade_gerada numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_op public.ordens_producao;
  v_linha record;
  v_disponivel numeric;
  v_ja_sinalizado numeric;
  v_falta numeric;
  v_gerados int := 0;
  v_itens_gerados jsonb := '[]'::jsonb;
begin
  select * into v_op from public.ordens_producao where id = p_ordem_producao_id and company_id = v_company_id;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;

  for v_linha in
    with recursive expansao as (
      select pc.material_item_id as mat_id, v_op.quantidade_planejada * pc.quantidade_por_unidade as qtd_total
      from public.pedido_itens pi
      join public.pecas p on p.item_id = pi.item_id and p.company_id = v_company_id
      join public.peca_composicao pc on pc.peca_id = p.id
      where pi.id = v_op.pedido_item_id
      union all
      select pc2.material_item_id, e.qtd_total * pc2.quantidade_por_unidade
      from expansao e
      join public.pecas sp on sp.item_id = e.mat_id
      join public.peca_composicao pc2 on pc2.peca_id = sp.id
    )
    select e.mat_id, i.codigo as mat_codigo, i.descricao as mat_descricao, sum(e.qtd_total) as necessario
    from expansao e
    join public.itens i on i.id = e.mat_id
    where not exists (select 1 from public.pecas sp2 where sp2.item_id = e.mat_id)
    group by e.mat_id, i.codigo, i.descricao
  loop
    select coalesce(es.quantidade_fisica, 0) - coalesce(es.quantidade_reservada, 0)
      into v_disponivel
    from public.estoque_saldos es
    where es.company_id = v_company_id and es.item_id = v_linha.mat_id;
    v_disponivel := coalesce(v_disponivel, 0);

    select coalesce(sum(nc.quantidade), 0) into v_ja_sinalizado
    from public.necessidades_compra nc
    where nc.company_id = v_company_id and nc.item_id = v_linha.mat_id
      and nc.origem in ('pedido', 'producao') and nc.status = 'aberta';

    v_falta := v_linha.necessario - v_disponivel - v_ja_sinalizado;
    if v_falta > 0 then
      perform public.criar_necessidade_compra(
        v_linha.mat_id, v_falta, null, 'producao',
        format('Gerado automaticamente a partir da ordem de produção %s.', v_op.numero)
      );
      v_gerados := v_gerados + 1;
      v_itens_gerados := v_itens_gerados || jsonb_build_object('item_id', v_linha.mat_id, 'quantidade', v_falta);
      return query select v_linha.mat_id, v_linha.mat_codigo, v_linha.mat_descricao, v_falta;
    end if;
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'suprimentos.necessidades_geradas_de_producao', 'ordem_producao', p_ordem_producao_id, v_op.numero,
    jsonb_build_object('count', v_gerados, 'items', v_itens_gerados)
  );
end;
$$;
