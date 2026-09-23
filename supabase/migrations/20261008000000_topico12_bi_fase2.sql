-- TÓPICO 12 — BI, Fase 2 ainda básica (ADR-002 v2.6 §4.16, decisão do
-- responsável do produto em 23/09/2026). O recorte mínimo
-- (20260916060000) já cobria contagens/somas por módulo, sem filtro de
-- período. O Prompt TÓPICO 12 inteiro (49 seções — KPI versionado,
-- drill-down, dashboards por área, alertas, Cockpit Executivo,
-- benchmark, Assistente Analítico) CONTINUA fora do MVP — nada disso
-- está aqui. Ver o próprio §4.16 (v2.6) para o texto completo da
-- ampliação e do que continua excluído.
--
-- O que entra nesta fase, só:
--   1. dashboard_operacional() ganha dois parâmetros opcionais
--      (p_data_inicio, p_data_fim) — filtro de período (§6, só
--      "personalizado"), aplicado a cada seção pela data de negócio
--      mais natural já existente no schema (data_pedido, data_orcamento,
--      inspecionado_em, aberta_em, created_at conforme o módulo — nada
--      novo). "itens_com_pendencia" e "titulos_vencidos" continuam sem
--      filtro de período — são métricas de posição atual ("quanto está
--      pendente agora"), não de fluxo num intervalo, mesmo raciocínio já
--      usado nelas desde o recorte mínimo.
--   2. Quatro indicadores calculados (chave nova "indicadores" no
--      retorno):
--      - ticket_medio (§14): valor liberado ÷ pedidos liberados, no
--        período.
--      - taxa_conversao_orcamento_pedido (§14 "Cotações",
--        simplificada): orçamentos com pedido vinculado ÷ total de
--        orçamentos no período, em percentual.
--      - taxa_nao_conformidade (§18): inspeções reprovadas ÷ total de
--        inspeções no período, em percentual.
--      - otif (§19, básico): "no prazo" compara a data em que a
--        expedição saiu (expedicoes.updated_at no momento em que
--        status vira 'expedida' — não duplicamos um campo novo pra
--        isso) com pedidos.previsao_entrega; "integral" é a expedição
--        sem nenhum item com quantidade_pendente > 0. Amostra de "no
--        prazo" é só expedições com previsao_entrega preenchida — sem
--        isso, não tem o que comparar, e o indicador não afirma um
--        percentual sobre dado que não existe (mesmo espírito do
--        TÓPICO 12 §10: "não afirmar quando os dados não permitem
--        sustentar").
--   3. `periodo` no retorno, ecoando p_data_inicio/p_data_fim — nod
--      mínimo ao §44 ("exibir período dos dados"), sem os demais itens
--      daquele parágrafo (última atualização, status de processamento
--      assíncrono — não há processamento assíncrono aqui, é tudo síncrono
--      sob RLS).
--
-- drop obrigatório antes do create or replace: mudar de 0 pra 2
-- parâmetros (mesmo com default) muda a assinatura da função — sem o
-- drop, ficariam duas funções sobrepostas e uma chamada sem argumento
-- seria ambígua (mesmo problema já resolvido em log_activity(), Fase 4).
drop function if exists public.dashboard_operacional();

create or replace function public.dashboard_operacional(p_data_inicio date default null, p_data_fim date default null)
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
        ), 0)
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
        ), '{}'::jsonb)
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
        ), '{}'::jsonb)
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
        ), 0)
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

grant execute on function public.dashboard_operacional(date, date) to authenticated;
