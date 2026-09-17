-- TÓPICO 4 — Fase 4 da ampliação de escopo (ADR-002 v2.2, plano aprovado
-- pelo responsável do produto em 2026-09-17): lote fabril (§14), sobre a
-- Fase 3 (produção em lotes e paralela/transferência de recurso —
-- 20260917010000).
--
-- Decisão de escopo (aprovada pelo responsável do produto): diferente do
-- exemplo literal do §14 ("Lote Fabril 001: OP 601 → 40un..."), o
-- agrupamento aqui é por LOTE DE LIBERAÇÃO (op_lotes, §12), não pela OP
-- inteira — mais preciso operacionalmente, já que só o que foi liberado
-- pra fábrica está pronto pra ser agrupado. Isso é o único ponto onde
-- esta fase se afasta do texto literal do §14; o restante segue à risca:
--   - conceito operacional e temporário — não altera pedido, item,
--     cliente, OP nem op_lotes;
--   - cada quantidade continua vinculada ao seu op_lote de origem;
--   - um op_lote pode participar de vários lotes fabris (§14: "uma OP
--     poderá participar de vários lotes fabris") — sem trava de
--     "quantidade já usada em outro lote fabril", é agrupamento lógico,
--     não um ledger de reserva;
--   - "critério de agrupamento" (mesmo material/perfil/processo/
--     operação/setup/ferramenta/máquina/característica produtiva) é
--     texto livre, decisão humana registrada — nenhuma validação
--     automática: o TÓPICO 4 não define uma fórmula pra isso, e inventar
--     uma agora seria regra de negócio sem base em nenhum ADR.
--   - lista_corte_lote_fabril() é o ganho real de "otimização
--     operacional" do §14: uma lista de corte combinada de todas as OPs
--     cujos lotes de liberação entraram no lote fabril, reaproveitando a
--     mesma lógica de lista_corte() (T4 §54, já corrigida em
--     20260915010000 pra comparar i.classificacao) — sem otimização/
--     nesting, que já está fora de escopo pelo próprio §54.

-- =========================================================================
-- 1. lotes_fabris / lote_fabril_itens.
-- =========================================================================

create table public.lotes_fabris (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  nome text not null,
  situacao text not null default 'aberto' check (situacao in ('aberto', 'encerrado')),
  criterio_agrupamento text,
  observacoes text,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  encerrado_em timestamptz
);
comment on table public.lotes_fabris is 'TÓPICO 4 §14 — agrupamento operacional e temporário de lotes de liberação (op_lotes) de diferentes OPs, pra otimização (ex.: corte combinado). Não altera pedido/item/cliente/OP/op_lotes.';
create index lotes_fabris_company_id_idx on public.lotes_fabris (company_id);

create table public.lote_fabril_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  lote_fabril_id uuid not null references public.lotes_fabris(id) on delete cascade,
  op_lote_id uuid not null references public.op_lotes(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  adicionado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
comment on table public.lote_fabril_itens is 'TÓPICO 4 §14 — vincula um op_lote (lote de liberação, §12) a um lote fabril, com quantidade própria (≤ planejado do op_lote). Um mesmo op_lote pode aparecer em vários lotes fabris — sem trava de "já usado", é agrupamento lógico, não reserva.';
create index lote_fabril_itens_lote_fabril_id_idx on public.lote_fabril_itens (lote_fabril_id);
create index lote_fabril_itens_op_lote_id_idx on public.lote_fabril_itens (op_lote_id);

alter table public.lotes_fabris enable row level security;
alter table public.lote_fabril_itens enable row level security;

create policy lotes_fabris_select on public.lotes_fabris for select
  using (company_id = (select public.current_company_id()));
create policy lote_fabril_itens_select on public.lote_fabril_itens for select
  using (company_id = (select public.current_company_id()));

grant select on public.lotes_fabris to authenticated;
grant select on public.lote_fabril_itens to authenticated;

-- =========================================================================
-- 2. CRUD — criar_lote_fabril() / adicionar_item_lote_fabril() /
--    remover_item_lote_fabril() / encerrar_lote_fabril().
-- =========================================================================

create or replace function public.criar_lote_fabril(
  p_nome text, p_criterio_agrupamento text default null, p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do lote fabril é obrigatório.';
  end if;

  insert into public.lotes_fabris (company_id, nome, criterio_agrupamento, observacoes, criado_por)
  values (v_company_id, btrim(p_nome), p_criterio_agrupamento, p_observacoes, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.lote_fabril_criado', 'lote_fabril', v_id, p_nome, null);

  return v_id;
end;
$$;

grant execute on function public.criar_lote_fabril(text, text, text) to authenticated;

create or replace function public.adicionar_item_lote_fabril(
  p_lote_fabril_id uuid, p_op_lote_id uuid, p_quantidade numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_lote_fabril public.lotes_fabris;
  v_op_lote public.op_lotes;
  v_id uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select * into v_lote_fabril from public.lotes_fabris
  where id = p_lote_fabril_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Lote fabril não encontrado nesta empresa.';
  end if;
  if v_lote_fabril.situacao = 'encerrado' then
    raise exception 'Lote fabril encerrado não aceita novos itens.';
  end if;

  select * into v_op_lote from public.op_lotes where id = p_op_lote_id and company_id = v_company_id;
  if not found then
    raise exception 'Lote de liberação não encontrado nesta empresa.';
  end if;
  if p_quantidade > v_op_lote.quantidade_planejada then
    raise exception 'Quantidade (%) excede o planejado do lote de liberação (%).', p_quantidade, v_op_lote.quantidade_planejada;
  end if;

  insert into public.lote_fabril_itens (company_id, lote_fabril_id, op_lote_id, quantidade, adicionado_por)
  values (v_company_id, p_lote_fabril_id, p_op_lote_id, p_quantidade, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.item_lote_fabril_adicionado', 'lote_fabril', p_lote_fabril_id, null,
    jsonb_build_object('lote_fabril_item_id', v_id, 'op_lote_id', p_op_lote_id, 'quantidade', p_quantidade)
  );

  return v_id;
end;
$$;

grant execute on function public.adicionar_item_lote_fabril(uuid, uuid, numeric) to authenticated;

create or replace function public.remover_item_lote_fabril(p_lote_fabril_item_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  delete from public.lote_fabril_itens where id = p_lote_fabril_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de lote fabril não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.item_lote_fabril_removido', 'lote_fabril_item', p_lote_fabril_item_id, null, null);
end;
$$;

grant execute on function public.remover_item_lote_fabril(uuid) to authenticated;

create or replace function public.encerrar_lote_fabril(p_lote_fabril_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  update public.lotes_fabris set situacao = 'encerrado', encerrado_em = now()
  where id = p_lote_fabril_id and company_id = v_company_id and situacao = 'aberto';
  if not found then
    raise exception 'Lote fabril não encontrado nesta empresa ou já encerrado.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.lote_fabril_encerrado', 'lote_fabril', p_lote_fabril_id, null, null);
end;
$$;

grant execute on function public.encerrar_lote_fabril(uuid) to authenticated;

-- =========================================================================
-- 3. lista_corte_lote_fabril() — combina a lista_corte() (§54) de todas
--    as OPs cujos lotes de liberação entraram no lote fabril, usando a
--    quantidade agrupada (lote_fabril_itens.quantidade), não a
--    quantidade_planejada inteira da OP.
-- =========================================================================

create or replace function public.lista_corte_lote_fabril(p_lote_fabril_id uuid)
returns table (
  lote_fabril_item_id uuid,
  ordem_producao_id uuid,
  ordem_producao_numero text,
  op_lote_numero int,
  pedido_numero text,
  pessoa_nome text,
  obra_nome text,
  ambiente text,
  item_codigo text,
  item_descricao text,
  largura_mm numeric,
  altura_mm numeric,
  quantidade numeric,
  margem_quebra_percentual numeric,
  responsavel text,
  emitido_em timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
  end if;
  if not exists (select 1 from public.lotes_fabris where id = p_lote_fabril_id and company_id = v_company_id) then
    raise exception 'Lote fabril não encontrado nesta empresa.';
  end if;

  return query
  select
    lfi.id,
    ord.id,
    ord.numero,
    ol.numero,
    p.numero,
    pe.nome,
    o.nome,
    ip.ambiente,
    i.codigo,
    i.descricao,
    ip.largura_mm,
    ip.altura_mm,
    lfi.quantidade,
    public.get_cutting_margin(i.classificacao, ''),
    prof.display_name,
    now()
  from public.lote_fabril_itens lfi
  join public.op_lotes ol on ol.id = lfi.op_lote_id
  join public.ordens_producao ord on ord.id = ol.ordem_producao_id
  join public.pedido_itens pit on pit.id = ord.pedido_item_id
  join public.pedidos p on p.id = pit.pedido_id
  join public.pessoas pe on pe.id = p.pessoa_id
  left join public.obras o on o.id = p.obra_id
  join public.itens i on i.id = pit.item_id
  left join public.itens_producao ip on ip.pedido_item_id = pit.id
  left join public.profiles prof on prof.id = auth.uid()
  where lfi.lote_fabril_id = p_lote_fabril_id;
end;
$$;

grant execute on function public.lista_corte_lote_fabril(uuid) to authenticated;
