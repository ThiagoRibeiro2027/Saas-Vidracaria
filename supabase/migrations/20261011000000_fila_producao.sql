-- Fila de Produção — Fase B do plano aprovado em 23/09/2026 (fila de
-- produção agrupada por cliente/pedido, catálogo de peças fabricadas e
-- necessidades automáticas de suprimentos). Primeira fase por não depender
-- de nenhuma tabela nova.
--
-- Não existe hoje nenhuma tela cruzando pedidos de clientes diferentes numa
-- fila única — /producao agrupa por pedido dentro de uma página com 9
-- seções, e listar_programacao() (20260918000000) é uma visão flat por
-- operação/recurso, não por pedido/cliente. Esta migration só adiciona uma
-- função de leitura nova, agregando dados que já existem (ordens_producao,
-- que já tem prioridade desde 20260918000000; op_lotes; pedidos; pessoas;
-- obras) — nenhuma tabela, nenhuma coluna e nenhuma permissão nova (reaproveita
-- producao.view já seedada, mesmo padrão de listar_programacao()).

create or replace function public.listar_fila_producao(
  p_pessoa_id uuid default null,
  p_obra_id uuid default null,
  p_status_op text default null
) returns table (
  pedido_id uuid,
  pedido_numero text,
  pessoa_id uuid,
  pessoa_nome text,
  obra_id uuid,
  obra_nome text,
  previsao_entrega date,
  ordem_producao_id uuid,
  ordem_producao_numero text,
  prioridade smallint,
  item_codigo text,
  item_descricao text,
  quantidade_planejada numeric,
  quantidade_produzida numeric,
  quantidade_perdida numeric,
  status text,
  situacao text,
  lotes_total bigint,
  lotes_concluidos bigint
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
    p.id, p.numero, pe.id, pe.nome, o.id, o.nome, p.previsao_entrega,
    op.id, op.numero, op.prioridade,
    i.codigo, i.descricao,
    op.quantidade_planejada, op.quantidade_produzida, op.quantidade_perdida,
    op.status, op.situacao,
    coalesce(lc.lotes_total, 0), coalesce(lc.lotes_concluidos, 0)
  from public.ordens_producao op
  join public.pedidos p on p.id = op.pedido_id
  join public.pedido_itens pi on pi.id = op.pedido_item_id
  join public.itens i on i.id = pi.item_id
  join public.pessoas pe on pe.id = p.pessoa_id
  left join public.obras o on o.id = p.obra_id
  left join lateral (
    select count(*) as lotes_total,
           count(*) filter (where ol.status = 'concluido') as lotes_concluidos
    from public.op_lotes ol
    where ol.ordem_producao_id = op.id
  ) lc on true
  where op.company_id = v_company_id
    and (p_pessoa_id is null or p.pessoa_id = p_pessoa_id)
    and (p_obra_id is null or p.obra_id = p_obra_id)
    and (p_status_op is null or op.status = p_status_op)
  order by op.prioridade, p.previsao_entrega nulls last, p.numero, op.numero;
end;
$$;

grant execute on function public.listar_fila_producao(uuid, uuid, text) to authenticated;
