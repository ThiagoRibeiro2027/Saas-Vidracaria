-- TÓPICO 12 — BI, Fase 3 (ADR-002 §4.16, decisão do responsável do
-- produto em 26/09/2026). Ver o texto completo da ampliação, por área,
-- no próprio §4.16 do ADR-002. Resumo: abre um subconjunto de §14-20
-- (dashboards por área) usando só dado que já existe hoje no schema —
-- nenhuma tabela nova nesta fase, tudo é leitura agregada.
--
-- Assinatura muda de novo (novo parâmetro p_dias_estoque_parado, com
-- default) — precisa do drop antes do create or replace, mesmo raciocínio
-- já documentado na Fase 2: sem o drop, ficariam duas funções
-- sobrepostas e uma chamada com 2 argumentos ficaria ambígua.
drop function if exists public.dashboard_operacional(date, date);

create or replace function public.dashboard_operacional(
  p_data_inicio date default null,
  p_data_fim date default null,
  p_dias_estoque_parado integer default 90
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_pedidos_liberados_count bigint;
  v_pedidos_liberados_valor numeric;
  v_orcamentos_total bigint;
  v_orcamentos_convertidos bigint;
  v_inspecoes_total bigint;
  v_inspecoes_reprovadas bigint;
  v_otif_amostra bigint;
  v_otif_amostra_prazo bigint;
  v_otif_no_prazo bigint;
  v_otif_integral bigint;
  v_otif_no_prazo_e_integral bigint;
  v_top_cliente_valor numeric;
  v_pc_valor_total numeric;
  v_pc_top_fornecedor_valor numeric;
  v_titulos_receber_total bigint;
  v_titulos_receber_vencidos bigint;
  v_titulos_pagar_total bigint;
  v_titulos_pagar_vencidos bigint;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('bi', 'view') then
    raise exception 'Sem permissão para consultar indicadores (bi.view).';
  end if;
  if p_data_inicio is not null and p_data_fim is not null and p_data_fim < p_data_inicio then
    raise exception 'Data de fim não pode ser anterior à data de início.';
  end if;
  if p_dias_estoque_parado is null or p_dias_estoque_parado <= 0 then
    raise exception 'Dias de estoque parado deve ser um número positivo.';
  end if;

  -- Ticket médio (§14): valor liberado ÷ pedidos liberados, no período.
  select count(*) into v_pedidos_liberados_count
  from public.pedidos p
  where p.company_id = v_company_id and p.status = 'liberado'
    and (p_data_inicio is null or p.data_pedido >= p_data_inicio)
    and (p_data_fim is null or p.data_pedido <= p_data_fim);

  select coalesce(sum(pi.quantidade * pi.preco_unitario), 0) into v_pedidos_liberados_valor
  from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where p.company_id = v_company_id and p.status = 'liberado'
    and (p_data_inicio is null or p.data_pedido >= p_data_inicio)
    and (p_data_fim is null or p.data_pedido <= p_data_fim);

  -- Taxa de conversão orçamento → pedido (§14 "Cotações", simplificada).
  select count(*) into v_orcamentos_total
  from public.orcamentos o
  where o.company_id = v_company_id
    and (p_data_inicio is null or o.data_orcamento >= p_data_inicio)
    and (p_data_fim is null or o.data_orcamento <= p_data_fim);

  select count(*) into v_orcamentos_convertidos
  from public.orcamentos o
  where o.company_id = v_company_id
    and (p_data_inicio is null or o.data_orcamento >= p_data_inicio)
    and (p_data_fim is null or o.data_orcamento <= p_data_fim)
    and exists (select 1 from public.pedidos pd where pd.orcamento_id = o.id);

  -- Taxa de não conformidade (§18): inspeções reprovadas ÷ total, no período.
  select count(*), count(*) filter (where resultado = 'reprovado')
  into v_inspecoes_total, v_inspecoes_reprovadas
  from public.inspecoes_qualidade iq
  where iq.company_id = v_company_id
    and (p_data_inicio is null or iq.inspecionado_em::date >= p_data_inicio)
    and (p_data_fim is null or iq.inspecionado_em::date <= p_data_fim);

  -- OTIF básico (§19): "no prazo" x "integral", sem transportadora/região/rota.
  select
    count(*),
    count(*) filter (where p.previsao_entrega is not null),
    count(*) filter (where p.previsao_entrega is not null and e.updated_at::date <= p.previsao_entrega),
    count(*) filter (where not exists (
      select 1 from public.expedicao_itens ei where ei.expedicao_id = e.id and ei.quantidade_pendente > 0
    )),
    count(*) filter (
      where p.previsao_entrega is not null and e.updated_at::date <= p.previsao_entrega
        and not exists (select 1 from public.expedicao_itens ei where ei.expedicao_id = e.id and ei.quantidade_pendente > 0)
    )
  into v_otif_amostra, v_otif_amostra_prazo, v_otif_no_prazo, v_otif_integral, v_otif_no_prazo_e_integral
  from public.expedicoes e
  join public.pedidos p on p.id = e.pedido_id
  where e.company_id = v_company_id and e.status = 'expedida'
    and (p_data_inicio is null or e.created_at::date >= p_data_inicio)
    and (p_data_fim is null or e.created_at::date <= p_data_fim);

  -- Fase 3 — top cliente do período, para participação % (§14 "concentração").
  select max(faturamento) into v_top_cliente_valor from (
    select sum(pi.quantidade * pi.preco_unitario) as faturamento
    from public.pedido_itens pi
    join public.pedidos p on p.id = pi.pedido_id
    where p.company_id = v_company_id and p.status = 'liberado'
      and (p_data_inicio is null or p.data_pedido >= p_data_inicio)
      and (p_data_fim is null or p.data_pedido <= p_data_fim)
    group by p.pessoa_id
  ) c;

  -- Fase 3 — valor total e top fornecedor de Pedido de Compra do período,
  -- para participação % (§17 "concentração").
  select coalesce(sum(pci.quantidade * pci.preco_unitario), 0) into v_pc_valor_total
  from public.pedido_compra_itens pci
  join public.pedidos_compra pc on pc.id = pci.pedido_compra_id
  where pc.company_id = v_company_id
    and (p_data_inicio is null or pc.created_at::date >= p_data_inicio)
    and (p_data_fim is null or pc.created_at::date <= p_data_fim);

  select max(valor) into v_pc_top_fornecedor_valor from (
    select sum(pci.quantidade * pci.preco_unitario) as valor
    from public.pedido_compra_itens pci
    join public.pedidos_compra pc on pc.id = pci.pedido_compra_id
    where pc.company_id = v_company_id
      and (p_data_inicio is null or pc.created_at::date >= p_data_inicio)
      and (p_data_fim is null or pc.created_at::date <= p_data_fim)
    group by pc.pessoa_id
  ) f;

  -- Fase 3 — inadimplência simples (vencidos ÷ total emitido no período).
  select count(*) into v_titulos_receber_total
  from public.titulos_financeiros
  where company_id = v_company_id
    and (p_data_inicio is null or created_at::date >= p_data_inicio)
    and (p_data_fim is null or created_at::date <= p_data_fim);
  select count(*) into v_titulos_receber_vencidos
  from public.titulos_financeiros
  where company_id = v_company_id and status not in ('pago', 'cancelado') and vencimento < current_date
    and (p_data_inicio is null or created_at::date >= p_data_inicio)
    and (p_data_fim is null or created_at::date <= p_data_fim);

  select count(*) into v_titulos_pagar_total
  from public.titulos_pagar
  where company_id = v_company_id
    and (p_data_inicio is null or created_at::date >= p_data_inicio)
    and (p_data_fim is null or created_at::date <= p_data_fim);
  select count(*) into v_titulos_pagar_vencidos
  from public.titulos_pagar
  where company_id = v_company_id and status not in ('pago', 'cancelado') and vencimento < current_date
    and (p_data_inicio is null or created_at::date >= p_data_inicio)
    and (p_data_fim is null or created_at::date <= p_data_fim);

  return jsonb_build_object(
    'periodo', jsonb_build_object('data_inicio', p_data_inicio, 'data_fim', p_data_fim),
    'pedidos', (
      select jsonb_build_object(
        'por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.pedidos
            where company_id = v_company_id
              and (p_data_inicio is null or data_pedido >= p_data_inicio)
              and (p_data_fim is null or data_pedido <= p_data_fim)
            group by status
          ) s
        ), '{}'::jsonb),
        'valor_liberado', v_pedidos_liberados_valor
      )
    ),
    -- Fase 3 — §14 Dashboard Comercial: ranking de clientes e de produtos,
    -- limitado ao que pedidos/pedido_itens já registram. Sem vendedor (não
    -- existe vendedor_id em pedidos/orcamentos, só responsavel_id, que não
    -- presumo ser o vendedor) e sem margem/crescimento (análise temporal
    -- continua fora, §8).
    'comercial', jsonb_build_object(
      'faturamento_liberado', v_pedidos_liberados_valor,
      'top_clientes', coalesce((
        select jsonb_agg(to_jsonb(t)) from (
          select pe.nome as cliente, sum(pi.quantidade * pi.preco_unitario) as faturamento
          from public.pedido_itens pi
          join public.pedidos p on p.id = pi.pedido_id
          join public.pessoas pe on pe.id = p.pessoa_id
          where p.company_id = v_company_id and p.status = 'liberado'
            and (p_data_inicio is null or p.data_pedido >= p_data_inicio)
            and (p_data_fim is null or p.data_pedido <= p_data_fim)
          group by pe.nome
          order by faturamento desc
          limit 10
        ) t
      ), '[]'::jsonb),
      'top_produtos', coalesce((
        select jsonb_agg(to_jsonb(t)) from (
          select i.descricao as produto, i.classificacao,
                 sum(pi.quantidade) as quantidade_vendida,
                 sum(pi.quantidade * pi.preco_unitario) as valor_vendido
          from public.pedido_itens pi
          join public.pedidos p on p.id = pi.pedido_id
          join public.itens i on i.id = pi.item_id
          where p.company_id = v_company_id and p.status = 'liberado'
            and (p_data_inicio is null or p.data_pedido >= p_data_inicio)
            and (p_data_fim is null or p.data_pedido <= p_data_fim)
          group by i.descricao, i.classificacao
          order by valor_vendido desc
          limit 10
        ) t
      ), '[]'::jsonb),
      'concentracao_top_cliente_pct', case when v_pedidos_liberados_valor > 0 and v_top_cliente_valor is not null
        then round(v_top_cliente_valor / v_pedidos_liberados_valor * 100, 1) else null end
    ),
    'producao', (
      select jsonb_build_object(
        'por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.ordens_producao
            where company_id = v_company_id
              and (p_data_inicio is null or created_at::date >= p_data_inicio)
              and (p_data_fim is null or created_at::date <= p_data_fim)
            group by status
          ) s
        ), '{}'::jsonb),
        'quantidade_planejada', coalesce((
          select sum(quantidade_planejada) from public.ordens_producao
          where company_id = v_company_id
            and (p_data_inicio is null or created_at::date >= p_data_inicio)
            and (p_data_fim is null or created_at::date <= p_data_fim)
        ), 0),
        'quantidade_produzida', coalesce((
          select sum(quantidade_produzida) from public.ordens_producao
          where company_id = v_company_id
            and (p_data_inicio is null or created_at::date >= p_data_inicio)
            and (p_data_fim is null or created_at::date <= p_data_fim)
        ), 0),
        'quantidade_perdida', coalesce((
          select sum(quantidade_perdida) from public.ordens_producao
          where company_id = v_company_id
            and (p_data_inicio is null or created_at::date >= p_data_inicio)
            and (p_data_fim is null or created_at::date <= p_data_fim)
        ), 0),
        -- Fase 3 — §15 "perdas": taxa de perda sobre o planejado, no período.
        'taxa_perda_pct', (
          select case when coalesce(sum(quantidade_planejada), 0) > 0
            then round(sum(quantidade_perdida) / sum(quantidade_planejada) * 100, 1) else null end
          from public.ordens_producao
          where company_id = v_company_id
            and (p_data_inicio is null or created_at::date >= p_data_inicio)
            and (p_data_fim is null or created_at::date <= p_data_fim)
        )
      )
    ),
    -- Fase 3 — §16 Dashboard Estoque, seção nova. Sem valor monetário (não
    -- existe custo de item cadastrado de forma confiável), sem giro/ABC/
    -- cobertura/trânsito, sem "excesso" (não existe estoque_maximo na
    -- política, só mínimo/segurança/ponto de reposição).
    'estoque', jsonb_build_object(
      'totais', (
        select jsonb_build_object(
          'quantidade_fisica', coalesce(sum(quantidade_fisica), 0),
          'quantidade_reservada', coalesce(sum(quantidade_reservada), 0),
          'quantidade_disponivel', coalesce(sum(quantidade_fisica - quantidade_reservada), 0)
        )
        from public.estoque_saldos where company_id = v_company_id
      ),
      'ruptura', (
        select jsonb_build_object(
          'quantidade_itens', count(*),
          'itens', coalesce((
            select jsonb_agg(to_jsonb(x)) from (
              select i2.codigo, i2.descricao, es2.quantidade_fisica, pa2.estoque_minimo
              from public.estoque_saldos es2
              join public.itens i2 on i2.id = es2.item_id
              join public.politicas_abastecimento pa2 on pa2.item_id = es2.item_id and pa2.company_id = es2.company_id
              where es2.company_id = v_company_id and pa2.estoque_minimo is not null
                and es2.quantidade_fisica <= pa2.estoque_minimo
              order by es2.quantidade_fisica asc
              limit 20
            ) x
          ), '[]'::jsonb)
        )
        from public.estoque_saldos es
        join public.politicas_abastecimento pa on pa.item_id = es.item_id and pa.company_id = es.company_id
        where es.company_id = v_company_id and pa.estoque_minimo is not null
          and es.quantidade_fisica <= pa.estoque_minimo
      ),
      'parados', (
        select jsonb_build_object(
          'dias', p_dias_estoque_parado,
          'quantidade_itens', count(*),
          'itens', coalesce((
            select jsonb_agg(to_jsonb(y)) from (
              select y1.codigo, y1.descricao, y1.ultima_movimentacao
              from (
                select i3.codigo, i3.descricao, max(em3.created_at) as ultima_movimentacao
                from public.itens i3
                left join public.estoque_movimentacoes em3 on em3.item_id = i3.id and em3.company_id = v_company_id
                where i3.company_id = v_company_id
                group by i3.id, i3.codigo, i3.descricao
                having max(em3.created_at) is null
                  or max(em3.created_at) < now() - (p_dias_estoque_parado || ' days')::interval
              ) y1
              order by y1.ultima_movimentacao asc nulls first
              limit 20
            ) y
          ), '[]'::jsonb)
        )
        from (
          select i4.id
          from public.itens i4
          left join public.estoque_movimentacoes em4 on em4.item_id = i4.id and em4.company_id = v_company_id
          where i4.company_id = v_company_id
          group by i4.id
          having max(em4.created_at) is null
            or max(em4.created_at) < now() - (p_dias_estoque_parado || ' days')::interval
        ) z
      )
    ),
    'qualidade', (
      select jsonb_build_object(
        'inspecoes_por_resultado', coalesce((
          select jsonb_object_agg(resultado, total) from (
            select resultado, count(*) as total from public.inspecoes_qualidade
            where company_id = v_company_id
              and (p_data_inicio is null or inspecionado_em::date >= p_data_inicio)
              and (p_data_fim is null or inspecionado_em::date <= p_data_fim)
            group by resultado
          ) s
        ), '{}'::jsonb),
        'nao_conformidades_por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.nao_conformidades
            where company_id = v_company_id
              and (p_data_inicio is null or aberta_em::date >= p_data_inicio)
              and (p_data_fim is null or aberta_em::date <= p_data_fim)
            group by status
          ) s
        ), '{}'::jsonb),
        -- Fase 3 — §18 "Pareto"/"motivo": nao_conformidades não tem campo de
        -- motivo categorizado (só descricao livre) — disposicao é o campo
        -- categórico real que existe, usado como proxy.
        'nao_conformidades_por_disposicao', coalesce((
          select jsonb_object_agg(disposicao, total) from (
            select disposicao, count(*) as total from public.nao_conformidades
            where company_id = v_company_id
              and (p_data_inicio is null or aberta_em::date >= p_data_inicio)
              and (p_data_fim is null or aberta_em::date <= p_data_fim)
            group by disposicao
          ) s
        ), '{}'::jsonb),
        'retrabalho_executado', coalesce((
          select count(*) from public.nao_conformidades
          where company_id = v_company_id and disposicao = 'retrabalho' and retrabalho_executado_em is not null
            and (p_data_inicio is null or aberta_em::date >= p_data_inicio)
            and (p_data_fim is null or aberta_em::date <= p_data_fim)
        ), 0)
      )
    ),
    'expedicao', (
      select jsonb_build_object(
        'por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.expedicoes
            where company_id = v_company_id
              and (p_data_inicio is null or created_at::date >= p_data_inicio)
              and (p_data_fim is null or created_at::date <= p_data_fim)
            group by status
          ) s
        ), '{}'::jsonb),
        'itens_com_pendencia', coalesce((
          select count(*) from public.expedicao_itens where company_id = v_company_id and quantidade_pendente > 0
        ), 0),
        -- Fase 3 — §19 "entregas parciais": expedição com pelo menos um
        -- item ainda pendente, no período.
        'entregas_parciais', coalesce((
          select count(*) from public.expedicoes e
          where e.company_id = v_company_id and e.status = 'expedida'
            and (p_data_inicio is null or e.created_at::date >= p_data_inicio)
            and (p_data_fim is null or e.created_at::date <= p_data_fim)
            and exists (select 1 from public.expedicao_itens ei where ei.expedicao_id = e.id and ei.quantidade_pendente > 0)
        ), 0)
      )
    ),
    'instalacao', (
      select jsonb_build_object(
        'por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.instalacoes
            where company_id = v_company_id
              and (p_data_inicio is null or created_at::date >= p_data_inicio)
              and (p_data_fim is null or created_at::date <= p_data_fim)
            group by status
          ) s
        ), '{}'::jsonb),
        'danos_por_causa', coalesce((
          select jsonb_object_agg(causa, total) from (
            select causa, count(*) as total from public.danos_instalacao
            where company_id = v_company_id
              and (p_data_inicio is null or registrado_em::date >= p_data_inicio)
              and (p_data_fim is null or registrado_em::date <= p_data_fim)
            group by causa
          ) s
        ), '{}'::jsonb)
      )
    ),
    'suprimentos', (
      select jsonb_build_object(
        'necessidades_por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.necessidades_compra
            where company_id = v_company_id
              and (p_data_inicio is null or created_at::date >= p_data_inicio)
              and (p_data_fim is null or created_at::date <= p_data_fim)
            group by status
          ) s
        ), '{}'::jsonb),
        -- Fase 3 — §17 Dashboard Suprimentos.
        'pedidos_compra_por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.pedidos_compra
            where company_id = v_company_id
              and (p_data_inicio is null or created_at::date >= p_data_inicio)
              and (p_data_fim is null or created_at::date <= p_data_fim)
            group by status
          ) s
        ), '{}'::jsonb),
        'top_fornecedores_avaliacao', coalesce((
          select jsonb_agg(to_jsonb(t)) from (
            select fornecedor, score, periodo_fim from (
              select distinct on (fa.pessoa_id) pe.nome as fornecedor, fa.score, fa.periodo_fim
              from public.fornecedor_avaliacoes fa
              join public.pessoas pe on pe.id = fa.pessoa_id
              where fa.company_id = v_company_id
              order by fa.pessoa_id, fa.periodo_fim desc
            ) latest
            order by score desc
            limit 10
          ) t
        ), '[]'::jsonb),
        -- Lead time: recebimento − criação do Pedido de Compra, em dias.
        -- Pontualidade fica fora desta fase (ver §4.16 do ADR-002): exigiria
        -- casar cada recebimento com a programação de entrega específica,
        -- e nem todo PC tem programação.
        'lead_time_medio_dias', (
          select round(avg(r.data_recebimento - pc.created_at::date)::numeric, 1)
          from public.recebimentos_pedido_compra r
          join public.pedidos_compra pc on pc.id = r.pedido_compra_id
          where pc.company_id = v_company_id
            and (p_data_inicio is null or r.data_recebimento >= p_data_inicio)
            and (p_data_fim is null or r.data_recebimento <= p_data_fim)
        ),
        'compras_emergenciais', coalesce((
          select count(*) from public.compras_diretas
          where company_id = v_company_id and motivo = 'urgencia'
            and (p_data_inicio is null or created_at::date >= p_data_inicio)
            and (p_data_fim is null or created_at::date <= p_data_fim)
        ), 0),
        'concentracao_top_fornecedor_pct', case when v_pc_valor_total > 0 and v_pc_top_fornecedor_valor is not null
          then round(v_pc_top_fornecedor_valor / v_pc_valor_total * 100, 1) else null end
      )
    ),
    'financeiro', (
      select jsonb_build_object(
        'titulos_por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.titulos_financeiros
            where company_id = v_company_id
              and (p_data_inicio is null or created_at::date >= p_data_inicio)
              and (p_data_fim is null or created_at::date <= p_data_fim)
            group by status
          ) s
        ), '{}'::jsonb),
        'valor_total', coalesce((
          select sum(valor) from public.titulos_financeiros
          where company_id = v_company_id
            and (p_data_inicio is null or created_at::date >= p_data_inicio)
            and (p_data_fim is null or created_at::date <= p_data_fim)
        ), 0),
        'valor_recebido', coalesce((
          select sum(valor_recebido) from public.titulos_financeiros
          where company_id = v_company_id
            and (p_data_inicio is null or created_at::date >= p_data_inicio)
            and (p_data_fim is null or created_at::date <= p_data_fim)
        ), 0),
        'titulos_vencidos', coalesce((
          select count(*) from public.titulos_financeiros
          where company_id = v_company_id and status not in ('pago', 'cancelado') and vencimento < current_date
        ), 0),
        'taxa_inadimplencia_receber_pct', case when v_titulos_receber_total > 0
          then round(v_titulos_receber_vencidos::numeric / v_titulos_receber_total * 100, 1) else null end,
        -- Fase 3 — §20 "contas a pagar": espelha o que já existe pra
        -- contas a receber. Sem DRE, margem, break-even ou fluxo de caixa
        -- projetado (fora desta fase, ver §4.16 do ADR-002).
        'titulos_pagar', jsonb_build_object(
          'por_status', coalesce((
            select jsonb_object_agg(status, total) from (
              select status, count(*) as total from public.titulos_pagar
              where company_id = v_company_id
                and (p_data_inicio is null or created_at::date >= p_data_inicio)
                and (p_data_fim is null or created_at::date <= p_data_fim)
              group by status
            ) s
          ), '{}'::jsonb),
          'valor_total', coalesce((
            select sum(valor) from public.titulos_pagar
            where company_id = v_company_id
              and (p_data_inicio is null or created_at::date >= p_data_inicio)
              and (p_data_fim is null or created_at::date <= p_data_fim)
          ), 0),
          'valor_pago', coalesce((
            select sum(valor_pago) from public.titulos_pagar
            where company_id = v_company_id
              and (p_data_inicio is null or created_at::date >= p_data_inicio)
              and (p_data_fim is null or created_at::date <= p_data_fim)
          ), 0),
          'vencidos', v_titulos_pagar_vencidos,
          'taxa_inadimplencia_pct', case when v_titulos_pagar_total > 0
            then round(v_titulos_pagar_vencidos::numeric / v_titulos_pagar_total * 100, 1) else null end
        )
      )
    ),
    'indicadores', jsonb_build_object(
      'ticket_medio', case when v_pedidos_liberados_count > 0 then round(v_pedidos_liberados_valor / v_pedidos_liberados_count, 2) else null end,
      'pedidos_liberados_amostra', v_pedidos_liberados_count,
      'taxa_conversao_orcamento_pedido', case when v_orcamentos_total > 0 then round(v_orcamentos_convertidos::numeric / v_orcamentos_total * 100, 1) else null end,
      'orcamentos_amostra', v_orcamentos_total,
      'taxa_nao_conformidade', case when v_inspecoes_total > 0 then round(v_inspecoes_reprovadas::numeric / v_inspecoes_total * 100, 1) else null end,
      'inspecoes_amostra', v_inspecoes_total,
      'otif', jsonb_build_object(
        'no_prazo_pct', case when v_otif_amostra_prazo > 0 then round(v_otif_no_prazo::numeric / v_otif_amostra_prazo * 100, 1) else null end,
        'integral_pct', case when v_otif_amostra > 0 then round(v_otif_integral::numeric / v_otif_amostra * 100, 1) else null end,
        'no_prazo_e_integral_pct', case when v_otif_amostra_prazo > 0 then round(v_otif_no_prazo_e_integral::numeric / v_otif_amostra_prazo * 100, 1) else null end,
        'amostra', v_otif_amostra,
        'amostra_com_previsao', v_otif_amostra_prazo
      )
    )
  );
end;
$$;

grant execute on function public.dashboard_operacional(date, date, integer) to authenticated;
