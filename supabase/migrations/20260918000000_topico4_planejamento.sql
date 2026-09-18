-- TÓPICO 4 — Fase 6a da ampliação de escopo (ADR-002 v2.3, plano aprovado
-- pelo responsável do produto em 2026-09-18): base de dados de
-- planejamento — prioridade e programação por operação (§5), primeira
-- sub-fase do bloco §5-10 (6a planejamento → 6b sequenciamento → 6c
-- decisão humana/simulação → 6d horizonte/congelamento → 6e
-- replanejamento). Fecha o §31-37 (Fase 5) e agora endereça só o §5.
--
-- Não existe hoje nenhum dado de prazo por OP/operação nem de prioridade
-- em lugar nenhum do schema (confirmado por grep amplo em
-- supabase/migrations/*.sql). Esta migration cria só a base — prioridade,
-- datas planejadas por operação e uma consulta de leitura — sem nenhum
-- motor de recomendação (§6), simulação (§8), congelamento (§9) ou
-- replanejamento (§10), que ainda não existem e ficam para as sub-fases
-- seguintes.
--
-- Decisões de recorte desta fase:
--   - Prioridade é campo da OP (ordens_producao), não do pedido — o §6 usa
--     "OP 720"/"OP 719" como granularidade nos próprios exemplos.
--     Escala smallint 1-5, 1 = mais urgente, 5 = menos urgente (convenção
--     de UX tipo "severidade", não uma regra de negócio do ADR — default
--     3 = normal).
--   - Programação (data_planejada_inicio/fim) é campo de op_lote_
--     operacoes, não de ordens_producao nem de op_lotes — é o nível
--     "por operação/por recurso" que o §5 pede ("por máquina"): a mesma OP
--     pode ter operações em recursos diferentes, com datas diferentes.
--     Granularidade de dia (sem hora), consistente com pedidos.
--     previsao_entrega já ser date, não timestamptz.
--   - "Prazo prometido" não ganha coluna nova: já existe em
--     pedidos.previsao_entrega (nível de pedido) e cada OP é 1:1 com um
--     pedido_item (ordens_producao_pedido_item_unique) — listar_
--     programacao() lê por join, sem duplicar dado que divergiria.
--   - "Planejamento por turno" (§5) fica de fora: não existe modelo de
--     turno/calendário no projeto (decisão da Fase 5a, 20260917030000,
--     "é Release 1") — inventar um agora só pra viabilizar esse filtro
--     seria regra de negócio sem ADR. Os filtros aqui são só intervalo de
--     data, recurso e setor.
--   - Nenhuma tabela nova: só alter table add column em ordens_producao e
--     op_lote_operacoes, que já têm RLS habilitada — sem policy nova.
--   - Nenhuma permissão nova: reaproveita producao.view/producao.manage já
--     seedadas. A permissão de "alterar programação em período congelado"
--     é da Fase 6d (§9), que ainda não existe.
--   - Sem sequenciamento, simulação, congelamento ou replanejamento ainda
--     — esta fase só guarda os dados que as sub-fases futuras vão
--     consumir, e expõe listar_programacao() como painel manual de
--     programação.

-- =========================================================================
-- 1. Colunas novas.
-- =========================================================================

alter table public.ordens_producao
  add column prioridade smallint not null default 3 check (prioridade between 1 and 5);
comment on column public.ordens_producao.prioridade is 'TÓPICO 4 §5-6 — 1 = mais urgente, 5 = menos urgente (convenção de severidade, default 3 = normal). Consumido pelo sequenciamento inteligente da Fase 6b, ainda não implementado.';

alter table public.op_lote_operacoes
  add column data_planejada_inicio date,
  add column data_planejada_fim date,
  add constraint op_lote_operacoes_data_planejada_check
    check (data_planejada_fim is null or data_planejada_inicio is null or data_planejada_fim >= data_planejada_inicio);
comment on column public.op_lote_operacoes.data_planejada_inicio is 'TÓPICO 4 §5 — programação por operação/recurso ("por máquina"). Granularidade de dia, sem hora/turno (Release 1, Fase 5a).';

-- =========================================================================
-- 2. definir_prioridade_op() / programar_operacao() — escrita.
-- =========================================================================

create or replace function public.definir_prioridade_op(p_ordem_producao_id uuid, p_prioridade smallint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  if p_prioridade is null or p_prioridade not between 1 and 5 then
    raise exception 'Prioridade deve estar entre 1 (mais urgente) e 5 (menos urgente).';
  end if;

  update public.ordens_producao set prioridade = p_prioridade
  where id = p_ordem_producao_id and company_id = v_company_id;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.prioridade_definida', 'ordem_producao', p_ordem_producao_id, null,
    jsonb_build_object('prioridade', p_prioridade)
  );
end;
$$;

grant execute on function public.definir_prioridade_op(uuid, smallint) to authenticated;

create or replace function public.programar_operacao(
  p_op_lote_operacao_id uuid, p_data_planejada_inicio date, p_data_planejada_fim date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  if p_data_planejada_inicio is not null and p_data_planejada_fim is not null
    and p_data_planejada_fim < p_data_planejada_inicio then
    raise exception 'Data planejada de fim (%) não pode ser anterior à de início (%).', p_data_planejada_fim, p_data_planejada_inicio;
  end if;

  update public.op_lote_operacoes set
    data_planejada_inicio = p_data_planejada_inicio,
    data_planejada_fim = p_data_planejada_fim
  where id = p_op_lote_operacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.operacao_programada', 'op_lote_operacao', p_op_lote_operacao_id, null,
    jsonb_build_object('data_planejada_inicio', p_data_planejada_inicio, 'data_planejada_fim', p_data_planejada_fim)
  );
end;
$$;

grant execute on function public.programar_operacao(uuid, date, date) to authenticated;

-- =========================================================================
-- 3. listar_programacao() — leitura, painel de programação (§5). Traz o
--    prazo prometido por join em pedidos.previsao_entrega (não duplicado),
--    filtra por intervalo de data (overlap com data_planejada_inicio/fim),
--    recurso e setor. Ordena por data planejada (nulls last) e prioridade.
-- =========================================================================

create or replace function public.listar_programacao(
  p_data_inicio date default null,
  p_data_fim date default null,
  p_recurso_produtivo_id uuid default null,
  p_setor text default null
) returns table (
  op_lote_operacao_id uuid,
  ordem_producao_id uuid,
  ordem_producao_numero text,
  prioridade smallint,
  item_codigo text,
  item_descricao text,
  previsao_entrega date,
  descricao_operacao text,
  sequencia int,
  status text,
  quantidade_planejada numeric,
  saldo numeric,
  recurso_produtivo_id uuid,
  recurso_codigo text,
  recurso_nome text,
  setor text,
  data_planejada_inicio date,
  data_planejada_fim date
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

  return query
  select
    olo.id, op.id, op.numero, op.prioridade,
    i.codigo, i.descricao, p.previsao_entrega,
    olo.descricao, olo.sequencia, olo.status, olo.quantidade_planejada, olo.saldo,
    r.id, r.codigo, r.nome, r.setor,
    olo.data_planejada_inicio, olo.data_planejada_fim
  from public.op_lote_operacoes olo
  join public.ordens_producao op on op.id = olo.ordem_producao_id
  join public.pedido_itens pi on pi.id = op.pedido_item_id
  join public.pedidos p on p.id = op.pedido_id
  join public.itens i on i.id = pi.item_id
  left join public.recursos_produtivos r on r.id = olo.recurso_produtivo_id
  where olo.company_id = v_company_id
    and (p_data_inicio is null or olo.data_planejada_fim is null or olo.data_planejada_fim >= p_data_inicio)
    and (p_data_fim is null or olo.data_planejada_inicio is null or olo.data_planejada_inicio <= p_data_fim)
    and (p_recurso_produtivo_id is null or olo.recurso_produtivo_id = p_recurso_produtivo_id)
    and (p_setor is null or r.setor = p_setor)
  order by olo.data_planejada_inicio nulls last, op.prioridade, op.numero, olo.sequencia;
end;
$$;

grant execute on function public.listar_programacao(date, date, uuid, text) to authenticated;
