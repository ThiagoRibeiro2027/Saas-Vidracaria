-- TÓPICO 4 — Fase 7a da ampliação de escopo (ADR-002 v2.3, plano
-- aprovado pelo responsável do produto em 2026-09-22): primeira das 4
-- sub-fases combinadas do bloco §40-48 (7a encerramento/bloqueio/
-- rastreabilidade/histórico → 7b custos produtivos → 7c status
-- configurável → 7d liberação pra estoque). Cada sub-fase seguinte tem
-- aprovação própria antes de começar, mesmo ritmo da Fase 6a-6e.
--
-- Investigação prévia (achados que embasam o recorte): §41 (status
-- configurável) e §45 (custos) exigem decisão de escopo antes de
-- qualquer schema — §41 contraria o padrão deliberado do resto do
-- projeto (T9/T16 usam texto livre "sem status configurável" por
-- decisão explícita); §45 não tem NENHUMA base no schema (nem coluna de
-- custo em T4, nem "centro de custo" em T11 Financeiro, que exclui isso
-- do MVP explicitamente). §44 (liberação pra estoque) tem o lado de
-- Expedição já funcionando (adicionar_item_expedicao(), T9, já exige
-- status='concluida' e status_qualidade='aprovado') mas o lado Estoque
-- (T6) tem zero referência a T4 em qualquer direção — integração nova
-- entre módulos, fora desta sub-fase. §48 (indicadores) deveria
-- estender T12 BI (que já é o módulo dono do assunto,
-- dashboard_operacional()), não duplicar dentro de T4 — fica de fora do
-- roteiro combinado.
--
-- Esta sub-fase (§42, §46-47) só reaproveita dado e padrão que já
-- existem, sem decisão de negócio nova:
--   - §42: motivo_bloqueio/origem_bloqueio já existiam (Fase 1, texto
--     livre) mas sem categoria estruturada. Hoje só há UM gatilho real
--     de bloqueio (medição em obra não confirmada, TÓPICO 16 §7) — as
--     outras 11 categorias da lista fechada do §42 (vidro, máquina,
--     operador, ferramenta, qualidade, manutenção, fornecedor...) não
--     têm gatilho real ainda (dependem de módulos que não existem:
--     materiais, controle de presença) — ficam disponíveis no enum pra
--     quando esses gatilhos nascerem, sem inventar um agora.
--   - §43 (encerramento por critério de processo): investigado e
--     descartado nesta fase — ver nota antes de concluir_ordem_
--     producao() mais abaixo. status_qualidade só pode virar 'bloqueado'
--     depois que a OP já está concluída (T8 inspeciona pós-produção),
--     então uma checagem em concluir_ordem_producao() seria código
--     morto. O critério de processo já é satisfeito como o T8 foi
--     desenhado: qualidade é gate paralelo que já bloqueia a etapa
--     seguinte (expedição), não a própria conclusão da OP.
--   - §46/§47: rastrear_ordem_producao()/historico_ordem_producao() são
--     leitura pura sobre dado que já existe inteiro (Pedido→Item→OP→
--     Lote→Operação→Recurso→Apontamento→Qualidade) — só falta Material
--     (§20-22 não implementado), que fica ausente do objeto retornado.

-- =========================================================================
-- 1. categoria_bloqueio — TÓPICO 4 §42.
-- =========================================================================

alter table public.ordens_producao
  add column categoria_bloqueio text check (categoria_bloqueio in (
    'material', 'vidro', 'engenharia', 'maquina', 'operador', 'ferramenta',
    'qualidade', 'manutencao', 'fornecedor', 'prioridade', 'cliente', 'outro'
  ));
comment on column public.ordens_producao.categoria_bloqueio is 'TÓPICO 4 §42 — categoria estruturada do bloqueio (nula quando situacao <> bloqueada). Único gatilho real hoje é medição em obra não confirmada, categorizado como cliente — as demais categorias ficam disponíveis pra quando os gatilhos que as geram existirem (material/vidro/máquina/operador dependem de módulos ainda não implementados).';

create or replace function public.recalcular_situacao_ordem_producao(p_ordem_producao_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_op public.ordens_producao;
begin
  select * into v_op from public.ordens_producao where id = p_ordem_producao_id for update;
  if not found then
    return;
  end if;

  if public.pedido_bloqueado_por_medicao(v_op.pedido_id) then
    update public.ordens_producao set
      situacao = 'bloqueada',
      motivo_bloqueio = 'Há item com medida em obra não confirmada neste pedido.',
      origem_bloqueio = 'medicao',
      categoria_bloqueio = 'cliente',
      impacto_bloqueio = 'Produção não pode iniciar nem prosseguir até a medida ser confirmada (TÓPICO 16 §7).',
      acao_necessaria = 'Confirmar a medição do item em obra (TÓPICO 5).'
    where id = p_ordem_producao_id and situacao <> 'bloqueada';
  elsif v_op.situacao = 'bloqueada' then
    update public.ordens_producao set
      situacao = 'liberada', motivo_bloqueio = null, origem_bloqueio = null,
      categoria_bloqueio = null, impacto_bloqueio = null, acao_necessaria = null
    where id = p_ordem_producao_id;
  end if;
end;
$$;

-- Nota sobre §43 (encerramento por critério de processo): concluir_
-- ordem_producao() NÃO ganhou checagem de status_qualidade nesta fase.
-- Investigado e descartado — registrar_inspecao_qualidade() (T8,
-- 20260915050000_topico8_qualidade.sql:179) só aceita inspecionar OP com
-- status='concluida' (é inspeção pós-produção, não pré-conclusão); logo
-- status_qualidade só pode virar 'bloqueado' depois que a OP já está
-- concluída, nunca antes. Uma checagem em concluir_ordem_producao() seria
-- código morto, inalcançável pelo próprio desenho de T8. O critério de
-- processo do §43 já é satisfeito como o projeto desenhou: "concluída"
-- é o critério de PRODUÇÃO (quantidade + operações, já existia);
-- aprovação de qualidade é um gate PARALELO que já bloqueia a etapa
-- seguinte (adicionar_item_expedicao(), T9, exige status_qualidade=
-- 'aprovado') — sem duplicar a autoridade de T8 dentro do T4.

-- =========================================================================
-- 2. rastrear_ordem_producao() — TÓPICO 4 §46. Leitura pura, monta a
--    cadeia Pedido→Item→OP→Lote→Operação→Recurso→Apontamento→Qualidade
--    num objeto jsonb aninhado. Material (§20-22) fica ausente — não
--    existe no schema.
-- =========================================================================

create or replace function public.rastrear_ordem_producao(p_ordem_producao_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_op public.ordens_producao;
  v_resultado jsonb;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
  end if;

  select * into v_op from public.ordens_producao where id = p_ordem_producao_id and company_id = v_company_id;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;

  select jsonb_build_object(
    'ordem_producao', jsonb_build_object(
      'id', v_op.id, 'numero', v_op.numero, 'status', v_op.status, 'situacao', v_op.situacao,
      'status_qualidade', v_op.status_qualidade, 'categoria_bloqueio', v_op.categoria_bloqueio,
      'quantidade_planejada', v_op.quantidade_planejada, 'quantidade_produzida', v_op.quantidade_produzida,
      'quantidade_perdida', v_op.quantidade_perdida
    ),
    'pedido', (
      select jsonb_build_object(
        'id', p.id, 'numero', p.numero, 'pessoa_nome', pe.nome, 'obra_nome', o.nome, 'previsao_entrega', p.previsao_entrega
      )
      from public.pedidos p
      join public.pessoas pe on pe.id = p.pessoa_id
      left join public.obras o on o.id = p.obra_id
      where p.id = v_op.pedido_id
    ),
    'item', (
      select jsonb_build_object('id', i.id, 'codigo', i.codigo, 'descricao', i.descricao)
      from public.pedido_itens pit join public.itens i on i.id = pit.item_id
      where pit.id = v_op.pedido_item_id
    ),
    'lotes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', ol.id, 'numero', ol.numero, 'status', ol.status,
        'quantidade_planejada', ol.quantidade_planejada, 'quantidade_produzida', ol.quantidade_produzida,
        'operacoes', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', olo.id, 'sequencia', olo.sequencia, 'descricao', olo.descricao, 'status', olo.status,
            'quantidade_planejada', olo.quantidade_planejada, 'quantidade_produzida', olo.quantidade_produzida,
            'recurso', case when r.id is not null then jsonb_build_object('id', r.id, 'codigo', r.codigo, 'nome', r.nome) else null end,
            'apontamentos', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'id', pa.id, 'quantidade_produzida', pa.quantidade_produzida, 'quantidade_perdida', pa.quantidade_perdida,
                'quantidade_retrabalho', pa.quantidade_retrabalho, 'observacao', pa.observacao, 'registrado_em', pa.registrado_em
              ) order by pa.registrado_em), '[]'::jsonb)
              from public.producao_apontamentos pa where pa.op_lote_operacao_id = olo.id
            )
          ) order by olo.sequencia), '[]'::jsonb)
          from public.op_lote_operacoes olo
          left join public.recursos_produtivos r on r.id = olo.recurso_produtivo_id
          where olo.op_lote_id = ol.id
        )
      ) order by ol.numero), '[]'::jsonb)
      from public.op_lotes ol where ol.ordem_producao_id = v_op.id
    ),
    'qualidade', jsonb_build_object(
      'inspecoes', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', iq.id, 'quantidade_aprovada', iq.quantidade_aprovada, 'quantidade_reprovada', iq.quantidade_reprovada,
          'resultado', iq.resultado, 'inspecionado_em', iq.inspecionado_em
        ) order by iq.inspecionado_em), '[]'::jsonb)
        from public.inspecoes_qualidade iq where iq.ordem_producao_id = v_op.id
      ),
      'nao_conformidades', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', nc.id, 'quantidade', nc.quantidade, 'disposicao', nc.disposicao, 'status', nc.status, 'aberta_em', nc.aberta_em
        ) order by nc.aberta_em), '[]'::jsonb)
        from public.nao_conformidades nc where nc.ordem_producao_id = v_op.id
      )
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

grant execute on function public.rastrear_ordem_producao(uuid) to authenticated;

-- =========================================================================
-- 3. historico_ordem_producao() — TÓPICO 4 §47. Filtra activity_logs
--    (histórico único do sistema, sem tabela nova) pros eventos ligados
--    a esta OP e às entidades dela (operações, splits de recurso).
-- =========================================================================

create or replace function public.historico_ordem_producao(p_ordem_producao_id uuid)
returns table (
  id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  description text,
  metadata jsonb,
  criado_por_nome text,
  criado_em timestamptz
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
  if not exists (select 1 from public.ordens_producao op where op.id = p_ordem_producao_id and op.company_id = v_company_id) then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;

  return query
  select al.id, al.action, al.entity_type, al.entity_id, al.description, al.metadata, prof.display_name, al.created_at
  from public.activity_logs al
  left join public.profiles prof on prof.id = al.user_id
  where al.company_id = v_company_id
    and (
      (al.entity_type = 'ordem_producao' and al.entity_id = p_ordem_producao_id)
      or (al.entity_type = 'op_lote_operacao' and al.entity_id in (
        select olo.id from public.op_lote_operacoes olo where olo.ordem_producao_id = p_ordem_producao_id
      ))
      or (al.entity_type = 'op_lote_operacao_recurso' and al.entity_id in (
        select olor.id from public.op_lote_operacao_recursos olor
        join public.op_lote_operacoes olo on olo.id = olor.op_lote_operacao_id
        where olo.ordem_producao_id = p_ordem_producao_id
      ))
    )
  order by al.created_at desc;
end;
$$;

grant execute on function public.historico_ordem_producao(uuid) to authenticated;
