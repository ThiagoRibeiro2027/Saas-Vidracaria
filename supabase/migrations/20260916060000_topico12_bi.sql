-- TÓPICO 12 — BI, recorte mínimo do MVP (ADR-002 §4.16). PLANO DE ENTREGA
-- §6 previa pro M3, e §4 (M2) já citava "indicadores essenciais de
-- acompanhamento do piloto" como frase genérica.
--
-- docs/Prompt TÓPICO 12 (1748 linhas) não tem NENHUMA seção de corte de
-- MVP — é, do início ao fim, uma plataforma analítica completa: KPI
-- versionado, drill-down KPI→Desvio→Causa→Origem→Documento, DRE, matriz
-- de rentabilidade, construtor de dashboards, alertas configuráveis,
-- relatórios agendados com exportação, benchmark entre unidades, e um
-- Assistente Analítico em linguagem natural (§38-39). Isso contradiz
-- direto o ADR-002 §4.16: "O MVP deverá possuir somente indicadores
-- operacionais básicos necessários para acompanhamento do fluxo. Não
-- fazem parte do MVP: BI avançado; dashboards analíticos complexos;
-- análises preditivas; indicadores avançados de desempenho." Mesma
-- decisão já tomada pra T7/T11 (ADR-002 prevalece sobre o prompt do
-- tópico), confirmada com o responsável do produto antes deste commit.
--
-- Por isso este recorte é só contagens/somas/percentuais objetivos por
-- módulo, direto sobre o schema que já existe — sem KPI versionado (§4),
-- período/filtro configurável (§5-7), análise temporal (§8), drill-down
-- (§9-11), rentabilidade (§13, exigiria custo de produção que não existe
-- no schema), Cockpit Executivo (§21), metas (§26), construtor de
-- dashboards (§27-28), alertas (§29-30), relatórios agendados/exportação
-- (§31-33), benchmark (§35), snapshots históricos (§36), Assistente
-- Analítico (§38-39).
--
-- Sem tabela nova — BI aqui é 100% leitura agregada, nenhum dado próprio.
-- Uma função só (dashboard_operacional()), não uma por módulo: a tela é
-- um dashboard único, não sete telas — evita sete round-trips. Cada
-- subquery filtra company_id explicitamente (mesmo padrão de
-- pedido_valor_total()/romaneio_expedicao() — SECURITY DEFINER não pode
-- confiar só na RLS de baixo). Permissão nova é só bi.view — nada a
-- gerenciar neste recorte, e de propósito não exige nenhuma permissão de
-- módulo operacional (pedidos.view, producao.view etc.): BI é uma
-- permissão própria, por cima de todos os módulos.

create or replace function public.dashboard_operacional()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('bi', 'view') then
    raise exception 'Sem permissão para consultar indicadores (bi.view).';
  end if;

  return jsonb_build_object(
    'pedidos', (
      select jsonb_build_object(
        'por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.pedidos where company_id = v_company_id group by status
          ) s
        ), '{}'::jsonb),
        'valor_liberado', coalesce((
          select sum(pi.quantidade * pi.preco_unitario)
          from public.pedido_itens pi
          join public.pedidos p on p.id = pi.pedido_id
          where p.company_id = v_company_id and p.status = 'liberado'
        ), 0)
      )
    ),
    'producao', (
      select jsonb_build_object(
        'por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.ordens_producao where company_id = v_company_id group by status
          ) s
        ), '{}'::jsonb),
        'quantidade_planejada', coalesce((select sum(quantidade_planejada) from public.ordens_producao where company_id = v_company_id), 0),
        'quantidade_produzida', coalesce((select sum(quantidade_produzida) from public.ordens_producao where company_id = v_company_id), 0),
        'quantidade_perdida', coalesce((select sum(quantidade_perdida) from public.ordens_producao where company_id = v_company_id), 0)
      )
    ),
    'qualidade', (
      select jsonb_build_object(
        'inspecoes_por_resultado', coalesce((
          select jsonb_object_agg(resultado, total) from (
            select resultado, count(*) as total from public.inspecoes_qualidade where company_id = v_company_id group by resultado
          ) s
        ), '{}'::jsonb),
        'nao_conformidades_por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.nao_conformidades where company_id = v_company_id group by status
          ) s
        ), '{}'::jsonb)
      )
    ),
    'expedicao', (
      select jsonb_build_object(
        'por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.expedicoes where company_id = v_company_id group by status
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
            select status, count(*) as total from public.instalacoes where company_id = v_company_id group by status
          ) s
        ), '{}'::jsonb),
        'danos_por_causa', coalesce((
          select jsonb_object_agg(causa, total) from (
            select causa, count(*) as total from public.danos_instalacao where company_id = v_company_id group by causa
          ) s
        ), '{}'::jsonb)
      )
    ),
    'suprimentos', (
      select jsonb_build_object(
        'necessidades_por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.necessidades_compra where company_id = v_company_id group by status
          ) s
        ), '{}'::jsonb)
      )
    ),
    'financeiro', (
      select jsonb_build_object(
        'titulos_por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.titulos_financeiros where company_id = v_company_id group by status
          ) s
        ), '{}'::jsonb),
        'valor_total', coalesce((select sum(valor) from public.titulos_financeiros where company_id = v_company_id), 0),
        'valor_recebido', coalesce((select sum(valor_recebido) from public.titulos_financeiros where company_id = v_company_id), 0),
        'titulos_vencidos', coalesce((
          select count(*) from public.titulos_financeiros
          where company_id = v_company_id and status not in ('pago', 'cancelado') and vencimento < current_date
        ), 0)
      )
    )
  );
end;
$$;

grant execute on function public.dashboard_operacional() to authenticated;
