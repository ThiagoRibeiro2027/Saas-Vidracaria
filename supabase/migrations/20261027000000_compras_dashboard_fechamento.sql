-- Compras completo (T7) — Fase 9 da ADR-011 (docs/ADR-011 — Compras
-- v1.0.md), última fase: Dashboard, configuração consolidada, auditoria
-- de permissões, critério de conclusão (TÓPICO 7 §38 + seções de
-- fechamento do Prompt).
--
-- Dashboard: dashboard_compras() segue literalmente o mesmo padrão de
-- dashboard_operacional() (T12 BI) — uma função jsonb, filtro de período
-- opcional, sem mecanismo de gráfico paralelo. Gate compras.view (não
-- bi.view): é o dashboard do MÓDULO Compras, mesma convenção de leitura
-- já usada em mapa_compras_futuras()/calcular_orcado_comprometido_
-- realizado()/rastrear_necessidade() — todo dado sensível de Compras já
-- é lido com compras.view, não com a permissão geral de BI.
--
-- Configuração consolidada: NÃO cria tabela nem função nova — cada
-- parâmetro das Fases 1-8 (fornecedor_dados/item_fornecedores/
-- politicas_abastecimento, calendario_feriados, compras_alcada_etapas,
-- orcamentos_compra, criterios_avaliacao_fornecedor) já tem sua própria
-- tela (/compras, /compras/mapa, /compras/cotacoes, /compras/orcamento,
-- /compras/fornecedores). A UI desta fase (/compras/configuracoes) é só
-- um hub de navegação com contagem ao vivo de cada área — sem duplicar
-- formulário nenhum já existente.
--
-- Auditoria de permissões (matriz do PERMISSÕES do Prompt) e critério de
-- conclusão (fluxo ponta a ponta, 20 passos) são verificação — viram
-- blocos novos em scripts/test-compras.mjs, não código de produção.

create function public.dashboard_compras(p_data_inicio date default null, p_data_fim date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_timezone text;
  v_pedidos_valor_total numeric;
  v_titulos_realizado numeric;
  v_economia_negociacao numeric;
  v_fornecedores_ativos int;
  v_fornecedores_avaliados int;
  v_score_medio numeric;
  v_lead_time_medio numeric;
  v_recebimentos_total int;
  v_recebimentos_no_prazo int;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('compras', 'view') then
    raise exception 'Sem permissão para consultar compras (compras.view).';
  end if;
  if p_data_inicio is not null and p_data_fim is not null and p_data_fim < p_data_inicio then
    raise exception 'Data de fim não pode ser anterior à data de início.';
  end if;

  select coalesce(timezone, 'America/Sao_Paulo') into v_timezone from public.companies where id = v_company_id;

  select coalesce(sum(pci.quantidade * pci.preco_unitario), 0) into v_pedidos_valor_total
  from public.pedido_compra_itens pci
  join public.pedidos_compra pc on pc.id = pci.pedido_compra_id
  where pc.company_id = v_company_id and pc.status <> 'cancelado'
    and (p_data_inicio is null or (pc.created_at at time zone v_timezone)::date >= p_data_inicio)
    and (p_data_fim is null or (pc.created_at at time zone v_timezone)::date <= p_data_fim);

  select coalesce(sum(tp.valor_pago), 0) into v_titulos_realizado
  from public.titulos_pagar tp
  where tp.company_id = v_company_id
    and (p_data_inicio is null or tp.vencimento >= p_data_inicio)
    and (p_data_fim is null or tp.vencimento <= p_data_fim);

  select coalesce(sum(cn.preco_anterior - cn.preco_novo), 0) into v_economia_negociacao
  from public.cotacao_negociacoes cn
  where cn.company_id = v_company_id
    and (p_data_inicio is null or (cn.created_at at time zone v_timezone)::date >= p_data_inicio)
    and (p_data_fim is null or (cn.created_at at time zone v_timezone)::date <= p_data_fim);

  select count(*) into v_fornecedores_ativos
  from public.pessoa_papeis pp join public.pessoas p on p.id = pp.pessoa_id
  where p.company_id = v_company_id and pp.papel = 'FORNECEDOR' and pp.ativo;

  select count(distinct pessoa_id), avg(score) into v_fornecedores_avaliados, v_score_medio
  from public.fornecedor_avaliacoes
  where company_id = v_company_id
    and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
    and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim);

  select avg(cp.prazo_entrega_dias) into v_lead_time_medio
  from public.cotacao_selecoes cs
  join public.cotacao_propostas cp on cp.id = cs.cotacao_proposta_id
  where cs.company_id = v_company_id and cp.prazo_entrega_dias is not null
    and (p_data_inicio is null or (cs.created_at at time zone v_timezone)::date >= p_data_inicio)
    and (p_data_fim is null or (cs.created_at at time zone v_timezone)::date <= p_data_fim);

  select
    count(*),
    count(*) filter (where cp.prazo_entrega_dias is not null and r.data_recebimento <= (pc.created_at::date + cp.prazo_entrega_dias))
  into v_recebimentos_total, v_recebimentos_no_prazo
  from public.recebimentos_pedido_compra r
  join public.pedidos_compra pc on pc.id = r.pedido_compra_id
  left join public.recebimento_itens ri on ri.recebimento_id = r.id
  left join public.pedido_compra_itens pci on pci.id = ri.pedido_compra_item_id
  left join public.cotacao_itens ci on ci.id = pci.cotacao_item_id
  left join public.cotacao_propostas cp on cp.cotacao_item_id = ci.id and cp.pessoa_id = pc.pessoa_id
  where r.company_id = v_company_id and r.status <> 'cancelado'
    and (p_data_inicio is null or r.data_recebimento >= p_data_inicio)
    and (p_data_fim is null or r.data_recebimento <= p_data_fim);

  return jsonb_build_object(
    'periodo', jsonb_build_object('data_inicio', p_data_inicio, 'data_fim', p_data_fim),
    'necessidades', jsonb_build_object(
      'por_status', coalesce((
        select jsonb_object_agg(status, total) from (
          select status, count(*) as total from public.necessidades_compra
          where company_id = v_company_id
            and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
            and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
          group by status
        ) s
      ), '{}'::jsonb),
      'abertas_total', coalesce((select count(*) from public.necessidades_compra where company_id = v_company_id and status = 'aberta'), 0)
    ),
    'solicitacoes', jsonb_build_object(
      'por_status', coalesce((
        select jsonb_object_agg(status, total) from (
          select status, count(*) as total from public.solicitacoes_compra
          where company_id = v_company_id
            and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
            and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
          group by status
        ) s
      ), '{}'::jsonb),
      'emergenciais', coalesce((
        select count(*) from public.solicitacoes_compra
        where company_id = v_company_id and urgencia = 'emergencial'
          and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
          and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
      ), 0)
    ),
    'cotacoes', jsonb_build_object(
      'por_status', coalesce((
        select jsonb_object_agg(status, total) from (
          select status, count(*) as total from public.cotacoes
          where company_id = v_company_id
            and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
            and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
          group by status
        ) s
      ), '{}'::jsonb),
      'economia_negociacao', v_economia_negociacao
    ),
    'aprovacoes', jsonb_build_object(
      'por_status', coalesce((
        select jsonb_object_agg(status, total) from (
          select status, count(*) as total from public.compras_aprovacoes
          where company_id = v_company_id
            and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
            and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
          group by status
        ) s
      ), '{}'::jsonb)
    ),
    'pedidos', jsonb_build_object(
      'por_status', coalesce((
        select jsonb_object_agg(status, total) from (
          select status, count(*) as total from public.pedidos_compra
          where company_id = v_company_id
            and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
            and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
          group by status
        ) s
      ), '{}'::jsonb),
      'emergenciais', coalesce((
        select count(*) from public.pedidos_compra
        where company_id = v_company_id and urgencia = 'emergencial'
          and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
          and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
      ), 0),
      'valor_total', v_pedidos_valor_total
    ),
    'recebimentos', jsonb_build_object(
      'por_status', coalesce((
        select jsonb_object_agg(status, total) from (
          select status, count(*) as total from public.recebimentos_pedido_compra
          where company_id = v_company_id
            and (p_data_inicio is null or data_recebimento >= p_data_inicio)
            and (p_data_fim is null or data_recebimento <= p_data_fim)
          group by status
        ) s
      ), '{}'::jsonb),
      'total', v_recebimentos_total,
      'no_prazo', v_recebimentos_no_prazo
    ),
    'financeiro', jsonb_build_object('comprometido', v_pedidos_valor_total, 'realizado', v_titulos_realizado),
    'fornecedores', jsonb_build_object(
      'ativos', v_fornecedores_ativos,
      'avaliados_no_periodo', v_fornecedores_avaliados,
      'score_medio_no_periodo', v_score_medio
    ),
    'lead_time_medio_dias', v_lead_time_medio
  );
end;
$$;

grant execute on function public.dashboard_compras(date, date) to authenticated;
