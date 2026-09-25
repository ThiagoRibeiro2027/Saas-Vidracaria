-- Correções do code review dos últimos 5 tópicos (T13 Integrações,
-- T18 Contratos, T17 RH completo, ADR-004 Fiscal, T12 BI Fase 2) — 5
-- agentes em paralelo, um por área, revisão verificada linha a linha
-- antes de entrar aqui. Cada achado abaixo foi confirmado contra o
-- código real antes da correção; achados que eram decisão de escopo já
-- documentada (não bug) ficam listados no fim, sem alteração.

-- =========================================================================
-- 1. T13 — registrar_evento_integracao(): o operador jsonb `||` dá
--    prioridade ao operando da DIREITA. Como estava escrito
--    (jsonb_build_object(...) || coalesce(p_metadata, '{}')), um
--    chamador com integracoes.manage podia mandar
--    p_metadata:{"nivel_automacao":"automatico"} e sobrescrever
--    silenciosamente o "informativo" que a função existe pra garantir —
--    exatamente o que a regra 8 do CLAUDE.md veda (evento não pode ser
--    livre pro chamador controlar). Correção: inverte a ordem, os campos
--    fixos (nivel_automacao, modulo_origem, modulo_destino, tipo_evento,
--    correlacao_id) sempre vencem; p_metadata só acrescenta campos
--    extras que não colidem com eles.
-- =========================================================================

create or replace function public.registrar_evento_integracao(
  p_modulo_origem text,
  p_modulo_destino text,
  p_tipo_evento text,
  p_entidade_tipo text default null,
  p_entidade_id uuid default null,
  p_descricao text default null,
  p_metadata jsonb default null,
  p_correlacao_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_id uuid;
begin
  if p_modulo_origem is null or btrim(p_modulo_origem) = '' then
    raise exception 'Módulo de origem é obrigatório.';
  end if;
  if p_tipo_evento is null or btrim(p_tipo_evento) = '' then
    raise exception 'Tipo de evento é obrigatório.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'integracoes.evento_modulo', coalesce(p_entidade_tipo, 'evento_integracao'), p_entidade_id,
    p_descricao,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'modulo_origem', p_modulo_origem,
      'modulo_destino', p_modulo_destino,
      'tipo_evento', p_tipo_evento,
      'nivel_automacao', 'informativo',
      'correlacao_id', coalesce(p_correlacao_id, gen_random_uuid())
    )
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- =========================================================================
-- 2. T13 — enfileirar_operacao(): o check-then-insert da idempotência
--    (select pra ver se a chave já existe, depois insert) tem uma
--    corrida TOCTOU real — duas chamadas concorrentes com a mesma
--    chave_idempotencia podem passar pelo SELECT antes de qualquer uma
--    commitar, e a segunda INSERT esbarra no índice único e estoura um
--    unique_violation cru, em vez de devolver o id da operação já
--    existente como o §18 promete (e o teste já assume). Correção:
--    INSERT ... ON CONFLICT DO NOTHING (atômico) — se não inserir por
--    já existir, busca e devolve a linha existente.
-- =========================================================================

create or replace function public.enfileirar_operacao(
  p_integracao_id uuid,
  p_tipo text,
  p_payload jsonb default null,
  p_chave_idempotencia text default null,
  p_prioridade integer default 0,
  p_origem text default 'manual'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_integracao public.integracoes;
  v_id uuid;
  v_nova boolean := true;
begin
  if p_tipo is null or btrim(p_tipo) = '' then
    raise exception 'Tipo da operação é obrigatório.';
  end if;

  select * into v_integracao from public.integracoes
  where id = p_integracao_id and company_id = v_company_id;
  if not found then
    raise exception 'Integração não encontrada nesta empresa.';
  end if;
  if v_integracao.status <> 'ativo' then
    raise exception 'Integração inativa: não é possível enfileirar novas operações (§2).';
  end if;

  if p_chave_idempotencia is not null then
    insert into public.integracao_operacoes (
      company_id, integracao_id, origem, tipo, prioridade, chave_idempotencia, payload, criado_por
    ) values (
      v_company_id, p_integracao_id, p_origem, p_tipo, p_prioridade, p_chave_idempotencia, p_payload, auth.uid()
    )
    on conflict (company_id, chave_idempotencia) where chave_idempotencia is not null do nothing
    returning id into v_id;

    if v_id is null then
      -- §18: já existia — devolve a operação existente, sem duplicar e
      -- sem gravar um segundo evento de auditoria pra ela.
      select id into v_id from public.integracao_operacoes
      where company_id = v_company_id and chave_idempotencia = p_chave_idempotencia;
      v_nova := false;
    end if;
  else
    insert into public.integracao_operacoes (
      company_id, integracao_id, origem, tipo, prioridade, chave_idempotencia, payload, criado_por
    ) values (
      v_company_id, p_integracao_id, p_origem, p_tipo, p_prioridade, null, p_payload, auth.uid()
    )
    returning id into v_id;
  end if;

  if v_nova then
    insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
    values (
      v_company_id, auth.uid(), 'integracoes.operacao_enfileirada', 'integracao_operacao', v_id, p_tipo,
      jsonb_build_object('integracao_id', p_integracao_id, 'origem', p_origem)
    );
  end if;

  return v_id;
end;
$$;

-- =========================================================================
-- 3. T17 RH — funcionario_documentos não tinha o CHECK de
--    validade >= data_referencia que funcionario_afastamentos já tinha
--    (data_fim >= data_inicio) na mesma migration — inconsistência
--    entre duas tabelas irmãs criadas juntas. A validação só existia
--    dentro de registrar_documento_funcionario(); qualquer inserção
--    futura fora dessa função (ferramenta de suporte, backfill) não
--    teria essa rede de segurança. Adiciona o CHECK simétrico.
-- =========================================================================

alter table public.funcionario_documentos add constraint funcionario_documentos_validade_check
  check (validade is null or data_referencia is null or validade >= data_referencia);

-- =========================================================================
-- 4. T12 BI — dashboard_operacional(): dois achados confirmados.
--
--    a) A subquery de taxa_conversao_orcamento_pedido e o join de OTIF
--       filtram company_id só na tabela âncora (orcamentos/expedicoes),
--       não na tabela relacionada (pedidos) — quebra o invariante que
--       a própria migration anterior (20260916060000) documentava:
--       "cada subquery filtra company_id explicitamente... SECURITY
--       DEFINER não pode confiar só na RLS de baixo". Hoje pedidos.
--       orcamento_id/expedicoes.pedido_id só apontam pra linhas da
--       mesma empresa por construção (nenhuma função permite o
--       contrário), mas é defesa em profundidade barata — adiciona o
--       filtro explícito nas duas.
--
--    b) O filtro de período do OTIF usava expedicoes.created_at (data
--       de abertura do registro), mas a métrica em si ("no prazo")
--       compara expedicoes.updated_at (data em que status virou
--       'expedida', via registrar_saida_expedicao — nenhuma outra
--       função atualiza a linha depois disso). Uma expedição aberta em
--       fevereiro mas só expedida em março ficava fora de um filtro
--       "março" que deveria contar exatamente esse embarque. Troca o
--       filtro de período do OTIF pra updated_at, consistente com o
--       que a métrica mede.
--
--    c) Todo ::date em coluna timestamptz (inspecionado_em, aberta_em,
--       registrado_em, created_at, updated_at) usava o fuso da sessão
--       do banco (UTC por padrão), não o fuso da empresa
--       (companies.timezone, América/São_Paulo = UTC-3 por padrão).
--       Um evento às 21h30 local de 31/01 vira timestamptz ~00h30 UTC
--       de 01/02 — um filtro "janeiro" perde esse registro
--       silenciosamente. Busca companies.timezone uma vez e usa
--       `at time zone` em todo ::date, em vez do cast direto.
-- =========================================================================

create or replace function public.dashboard_operacional(p_data_inicio date default null, p_data_fim date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_timezone text;
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

  select coalesce(timezone, 'America/Sao_Paulo') into v_timezone
  from public.companies where id = v_company_id;

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
    and exists (select 1 from public.pedidos pd where pd.orcamento_id = o.id and pd.company_id = v_company_id);

  -- Taxa de não conformidade (§18): inspeções reprovadas ÷ total, no período.
  select count(*), count(*) filter (where resultado = 'reprovado')
  into v_inspecoes_total, v_inspecoes_reprovadas
  from public.inspecoes_qualidade iq
  where iq.company_id = v_company_id
    and (p_data_inicio is null or (iq.inspecionado_em at time zone v_timezone)::date >= p_data_inicio)
    and (p_data_fim is null or (iq.inspecionado_em at time zone v_timezone)::date <= p_data_fim);

  -- OTIF básico (§19): "no prazo" x "integral", sem transportadora/região/rota.
  -- Filtro de período por updated_at (data de saída), não created_at
  -- (data de abertura) — consistente com o que a métrica mede.
  select
    count(*),
    count(*) filter (where p.previsao_entrega is not null),
    count(*) filter (where p.previsao_entrega is not null and (e.updated_at at time zone v_timezone)::date <= p.previsao_entrega),
    count(*) filter (where not exists (
      select 1 from public.expedicao_itens ei where ei.expedicao_id = e.id and ei.quantidade_pendente > 0
    )),
    count(*) filter (
      where p.previsao_entrega is not null and (e.updated_at at time zone v_timezone)::date <= p.previsao_entrega
        and not exists (select 1 from public.expedicao_itens ei where ei.expedicao_id = e.id and ei.quantidade_pendente > 0)
    )
  into v_otif_amostra, v_otif_amostra_prazo, v_otif_no_prazo, v_otif_integral, v_otif_no_prazo_e_integral
  from public.expedicoes e
  join public.pedidos p on p.id = e.pedido_id and p.company_id = v_company_id
  where e.company_id = v_company_id and e.status = 'expedida'
    and (p_data_inicio is null or (e.updated_at at time zone v_timezone)::date >= p_data_inicio)
    and (p_data_fim is null or (e.updated_at at time zone v_timezone)::date <= p_data_fim);

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
              and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
              and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
            group by status
          ) s
        ), '{}'::jsonb),
        'quantidade_planejada', coalesce((
          select sum(quantidade_planejada) from public.ordens_producao
          where company_id = v_company_id
            and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
            and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
        ), 0),
        'quantidade_produzida', coalesce((
          select sum(quantidade_produzida) from public.ordens_producao
          where company_id = v_company_id
            and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
            and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
        ), 0),
        'quantidade_perdida', coalesce((
          select sum(quantidade_perdida) from public.ordens_producao
          where company_id = v_company_id
            and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
            and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
        ), 0)
      )
    ),
    'qualidade', (
      select jsonb_build_object(
        'inspecoes_por_resultado', coalesce((
          select jsonb_object_agg(resultado, total) from (
            select resultado, count(*) as total from public.inspecoes_qualidade
            where company_id = v_company_id
              and (p_data_inicio is null or (inspecionado_em at time zone v_timezone)::date >= p_data_inicio)
              and (p_data_fim is null or (inspecionado_em at time zone v_timezone)::date <= p_data_fim)
            group by resultado
          ) s
        ), '{}'::jsonb),
        'nao_conformidades_por_status', coalesce((
          select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.nao_conformidades
            where company_id = v_company_id
              and (p_data_inicio is null or (aberta_em at time zone v_timezone)::date >= p_data_inicio)
              and (p_data_fim is null or (aberta_em at time zone v_timezone)::date <= p_data_fim)
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
              and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
              and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
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
              and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
              and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
            group by status
          ) s
        ), '{}'::jsonb),
        'danos_por_causa', coalesce((
          select jsonb_object_agg(causa, total) from (
            select causa, count(*) as total from public.danos_instalacao
            where company_id = v_company_id
              and (p_data_inicio is null or (registrado_em at time zone v_timezone)::date >= p_data_inicio)
              and (p_data_fim is null or (registrado_em at time zone v_timezone)::date <= p_data_fim)
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
              and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
              and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
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
              and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
              and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
            group by status
          ) s
        ), '{}'::jsonb),
        'valor_total', coalesce((
          select sum(valor) from public.titulos_financeiros
          where company_id = v_company_id
            and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
            and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
        ), 0),
        'valor_recebido', coalesce((
          select sum(valor_recebido) from public.titulos_financeiros
          where company_id = v_company_id
            and (p_data_inicio is null or (created_at at time zone v_timezone)::date >= p_data_inicio)
            and (p_data_fim is null or (created_at at time zone v_timezone)::date <= p_data_fim)
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

-- =========================================================================
-- Achados revisados e conscientemente NÃO alterados aqui (decisão de
-- escopo já documentada, não bug):
--
--   - Fiscal: mesmo usuário registra e aprova um documento (sem alçada
--     separada) — o próprio cabeçalho da migration 20261007000000 já
--     documenta que a ADR-004 não pede alçada pra aprovação fiscal.
--   - Fiscal: documento aprovado ainda pode ser revinculado/cancelado
--     sem nova avaliação — "cancelar"/"vincular" são correção interna
--     de registro (§9.3), não decisão fiscal; comportamento consistente
--     com o resto do módulo.
--   - RH: anexo de arquivo (entity_type='funcionario_documento') usa
--     files.upload/files.read, não rh.view/rh.manage — isso é
--     comportamento do módulo de Arquivos (Fase 3) pra QUALQUER
--     entidade de QUALQUER módulo, não algo introduzido por esta
--     migration; corrigir exigiria tornar register_file()/files_select
--     cientes do módulo de cada entity_type, mudança que afeta todos os
--     módulos, não só RH — fica como decisão separada pro responsável
--     do produto, não um code review fix pontual.
--   - Contratos: next_document_number() continua copiado por inteiro a
--     cada novo tipo de documento (padrão já usado em ~9 migrations
--     anteriores) — frágil a longo prazo, mas fora do escopo de um
--     review pontual; nenhuma regressão nesta migration especificamente
--     (a branch 'proposta' foi preservada corretamente).
--   - Contratos: ativar_contrato() não reverifica se a pessoa/obra/
--     pedido/funcionário vinculado ainda é válido no momento da
--     ativação (só valida na criação) — deriva de estado poder mudar
--     entre rascunho e ativação; fora do que o §12 (MVP) pediu.
--   - Lacunas de cobertura de teste (isolamento cross-tenant pra
--     algumas tabelas/RPCs novas, asserção de auditoria sem escopo por
--     company_id/tempo) — reais, mas são extensão de teste, não
--     correção de bug; ficam como próximo passo se o responsável do
--     produto quiser.
-- =========================================================================
