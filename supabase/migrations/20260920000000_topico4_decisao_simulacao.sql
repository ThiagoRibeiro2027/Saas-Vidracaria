-- TÓPICO 4 — Fase 6c da ampliação de escopo (ADR-002 v2.3, plano
-- aprovado pelo responsável do produto em 2026-09-20): decisão humana
-- (§7) e simulação de cenários (§8), terceira sub-fase do bloco §5-10
-- (6a planejamento → 6b sequenciamento → 6c decisão/simulação → 6d
-- horizonte/congelamento → 6e replanejamento).
--
-- §7 é recorte direto: registrar recomendação apresentada, decisão,
-- usuário, data/hora, motivo — "qual foi o resultado" é respondido
-- comparando o snapshot da decisão com o estado atual da operação numa
-- consulta (listar_decisoes_sequenciamento()), sem guardar um campo de
-- resultado que ficaria desatualizado.
--
-- §8 lista 8 exemplos de cenário e 10 dimensões de impacto. Só uma parte
-- tem dado real, mesma disciplina do §6 (Fase 6b):
--   - Implementados: antecipar/atrasar OP (nova data planejada), trocar
--     prioridade, trocar equipamento/recurso — parâmetros de uma função
--     só, combináveis.
--   - "Agrupar OPs" já é coberto pelo sinal de setup compartilhado do §6
--     (Fase 6b) — simular separadamente duplicaria esse sinal.
--   - "Considerar parada de máquina" fica de fora: a situação do recurso
--     (§33) nunca foi ligada ao cálculo de capacidade (só capacidade_
--     horas_dia e manutenção preventiva agendada entram na conta,
--     decisão da Fase 5a) — simular isso exigiria estender aquele
--     cálculo, fora do combinado aqui.
--   - "Utilizar sobra"/"chegada futura de material" ficam de fora — sem
--     dado real (§24-25/§20-22 não existem), mesma exclusão da Fase
--     6a/6b.
--   - Das 10 dimensões de impacto, ficam de fora horas extras e
--     materiais (sem dado real); prazo é expresso pela classificação
--     risco/oportunidade/recomendado já existente (§6), não por uma data
--     de conclusão prevista (exigiria um simulador de capacidade dia-a-
--     dia que nenhum ADR pede em detalhe).
--
-- Desenho técnico — SEM mutação de verdade (nunca insert/update na
-- tabela real): o motor de ranking da Fase 6b é fatorado numa função
-- interna parametrizável por override (calcular_ranking_sequenciamento).
-- recomendar_sequenciamento() vira um wrapper fino sobre ela —
-- comportamento idêntico, mesmos testes da Fase 6b continuam validando
-- isso. simular_alteracao_programacao() chama a mesma função com os
-- valores hipotéticos e compara antes×depois — nunca escreve na tabela.
-- Alternativa descartada: aplicar a mudança e reverter na mesma
-- transação (funciona em Postgres, mas um bug no revert commitaria uma
-- OP alterada por engano — mais frágil de auditar que nunca escrever).

-- =========================================================================
-- 1. calcular_ranking_sequenciamento() — extrai o corpo de
--    recomendar_sequenciamento() (Fase 6b) pra uma função interna (sem
--    grant a authenticated, mesmo padrão de criar_op_lote_operacoes)
--    parametrizável por override: exclui uma operação real do recurso
--    (ela "saiu") e/ou inclui uma linha sintética com valores
--    hipotéticos (ela "entrou", com data/prioridade sobrescritas por
--    coalesce — só entra se o recurso de destino bater com o recurso
--    consultado). Sem overrides, comportamento idêntico ao de antes.
-- =========================================================================

create or replace function public.calcular_ranking_sequenciamento(
  p_recurso_produtivo_id uuid,
  p_excluir_op_lote_operacao_id uuid default null,
  p_incluir_recurso_produtivo_id uuid default null,
  p_incluir_op_lote_operacao_id uuid default null,
  p_incluir_data_planejada_inicio date default null,
  p_incluir_prioridade smallint default null
)
returns table (
  op_lote_operacao_id uuid,
  ordem_producao_id uuid,
  ordem_producao_numero text,
  descricao_operacao text,
  prioridade smallint,
  previsao_entrega date,
  dias_para_prazo int,
  perfil text,
  ferramenta text,
  processo text,
  setup_compartilhado_count int,
  posicao_atual int,
  posicao_recomendada int,
  classificacao text,
  explicacao text
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_peso_prazo numeric;
  v_peso_prioridade numeric;
  v_peso_setup numeric;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  select coalesce((select peso from public.sequenciamento_pesos where company_id = v_company_id and criterio = 'prazo'), 1)
    into v_peso_prazo;
  select coalesce((select peso from public.sequenciamento_pesos where company_id = v_company_id and criterio = 'prioridade'), 1)
    into v_peso_prioridade;
  select coalesce((select peso from public.sequenciamento_pesos where company_id = v_company_id and criterio = 'setup_compartilhado'), 1)
    into v_peso_setup;

  return query
  with pendentes as (
    select
      olo.id, olo.ordem_producao_id, op.numero as op_numero, op.prioridade as op_prioridade,
      olo.descricao, olo.perfil, olo.ferramenta, olo.processo,
      olo.data_planejada_inicio, olo.sequencia,
      p.previsao_entrega,
      (p.previsao_entrega - current_date) as dias_para_prazo
    from public.op_lote_operacoes olo
    join public.ordens_producao op on op.id = olo.ordem_producao_id
    join public.pedidos p on p.id = op.pedido_id
    where olo.company_id = v_company_id
      and olo.recurso_produtivo_id = p_recurso_produtivo_id
      and olo.status <> 'concluida'
      and olo.id is distinct from p_excluir_op_lote_operacao_id
    union all
    select
      olo.id, olo.ordem_producao_id, op.numero as op_numero,
      coalesce(p_incluir_prioridade, op.prioridade) as op_prioridade,
      olo.descricao, olo.perfil, olo.ferramenta, olo.processo,
      coalesce(p_incluir_data_planejada_inicio, olo.data_planejada_inicio) as data_planejada_inicio,
      olo.sequencia,
      p.previsao_entrega,
      (p.previsao_entrega - current_date) as dias_para_prazo
    from public.op_lote_operacoes olo
    join public.ordens_producao op on op.id = olo.ordem_producao_id
    join public.pedidos p on p.id = op.pedido_id
    where olo.company_id = v_company_id
      and olo.id = p_incluir_op_lote_operacao_id
      and p_incluir_recurso_produtivo_id = p_recurso_produtivo_id
      and olo.status <> 'concluida'
  ),
  setup as (
    select a.id,
      count(*) filter (
        where b.id <> a.id and a.perfil is not null and a.ferramenta is not null and a.processo is not null
          and b.perfil = a.perfil and b.ferramenta = a.ferramenta and b.processo = a.processo
      )::int as setup_compartilhado_count
    from pendentes a
    join pendentes b on true
    group by a.id
  ),
  ranks as (
    select pe.*, s.setup_compartilhado_count,
      rank() over (order by pe.dias_para_prazo asc nulls last) as rank_prazo,
      rank() over (order by pe.op_prioridade asc) as rank_prioridade,
      rank() over (order by s.setup_compartilhado_count desc) as rank_setup
    from pendentes pe
    join setup s on s.id = pe.id
  ),
  score as (
    select r.*,
      (r.rank_prazo * v_peso_prazo + r.rank_prioridade * v_peso_prioridade + r.rank_setup * v_peso_setup) as score_final
    from ranks r
  ),
  posicionado as (
    select sc.*,
      (row_number() over (order by sc.score_final asc, sc.op_numero asc))::int as posicao_recomendada,
      (row_number() over (
        order by sc.data_planejada_inicio asc nulls last, sc.op_prioridade asc, sc.op_numero asc, sc.sequencia asc
      ))::int as posicao_atual
    from score sc
  ),
  classificado as (
    select po.*,
      case
        when po.dias_para_prazo is not null and po.dias_para_prazo < 0 then 'risco'
        when po.posicao_recomendada < po.posicao_atual then 'oportunidade'
        else 'recomendado'
      end as classificacao
    from posicionado po
  )
  select
    c.id, c.ordem_producao_id, c.op_numero, c.descricao, c.op_prioridade,
    c.previsao_entrega, c.dias_para_prazo, c.perfil, c.ferramenta, c.processo, c.setup_compartilhado_count,
    c.posicao_atual, c.posicao_recomendada, c.classificacao,
    case c.classificacao
      when 'risco' then format(
        'OP %s está %s dia(s) atrasada em relação ao prazo prometido (%s).',
        c.op_numero, abs(c.dias_para_prazo), to_char(c.previsao_entrega, 'DD/MM/YYYY')
      )
      when 'oportunidade' then format(
        'Adiantar OP %s da %sª para a %sª posição melhora o atendimento a prazo/prioridade%s.',
        c.op_numero, c.posicao_atual, c.posicao_recomendada,
        case when c.setup_compartilhado_count > 0
          then format(' e agrupa com %s operação(ões) de mesmo perfil/ferramenta/processo', c.setup_compartilhado_count)
          else ''
        end
      )
      else 'Posição atual já atende prazo e prioridade — sem recomendação de mudança.'
    end as explicacao
  from classificado c
  order by c.posicao_recomendada;
end;
$$;

-- recomendar_sequenciamento() (Fase 6b) — wrapper fino: só a checagem de
-- permissão de leitura (calcular_ranking_sequenciamento é interna, sem
-- grant, então cada consumidor precisa da sua própria checagem).
create or replace function public.recomendar_sequenciamento(p_recurso_produtivo_id uuid)
returns table (
  op_lote_operacao_id uuid,
  ordem_producao_id uuid,
  ordem_producao_numero text,
  descricao_operacao text,
  prioridade smallint,
  previsao_entrega date,
  dias_para_prazo int,
  perfil text,
  ferramenta text,
  processo text,
  setup_compartilhado_count int,
  posicao_atual int,
  posicao_recomendada int,
  classificacao text,
  explicacao text
)
language plpgsql security definer set search_path = public as $$
begin
  if public.current_company_id() is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
  end if;

  return query select * from public.calcular_ranking_sequenciamento(p_recurso_produtivo_id);
end;
$$;

grant execute on function public.recomendar_sequenciamento(uuid) to authenticated;

-- =========================================================================
-- 2. sequenciamento_decisoes — TÓPICO 4 §7. Só gravada via
--    decidir_sequenciamento() (sem policy de insert direta).
-- =========================================================================

create table public.sequenciamento_decisoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  op_lote_operacao_id uuid not null references public.op_lote_operacoes(id) on delete cascade,
  recomendacao_snapshot jsonb not null,
  decisao text not null check (decisao in ('aceitar', 'rejeitar', 'modificar', 'ignorar', 'manual')),
  motivo text,
  aplicado boolean not null default false,
  decidido_por uuid not null references public.profiles(id),
  decidido_em timestamptz not null default now()
);
comment on table public.sequenciamento_decisoes is 'TÓPICO 4 §7 — recomendação apresentada (snapshot) → decisão → usuário → data/hora → motivo. "Resultado" (§7) é lido comparando o snapshot com o estado atual da operação (listar_decisoes_sequenciamento()), não um campo aqui.';
create index sequenciamento_decisoes_op_lote_operacao_id_idx on public.sequenciamento_decisoes (op_lote_operacao_id);

alter table public.sequenciamento_decisoes enable row level security;
create policy sequenciamento_decisoes_select on public.sequenciamento_decisoes for select
  using (company_id = (select public.current_company_id()));
grant select on public.sequenciamento_decisoes to authenticated;

create or replace function public.decidir_sequenciamento(
  p_op_lote_operacao_id uuid,
  p_decisao text,
  p_motivo text default null,
  p_nova_data_planejada_inicio date default null,
  p_nova_data_planejada_fim date default null,
  p_novo_recurso_produtivo_id uuid default null,
  p_nova_prioridade smallint default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_operacao public.op_lote_operacoes;
  v_snapshot jsonb;
  v_tem_valor_novo boolean;
  v_aplicado boolean := false;
  v_id uuid;
begin
  if p_decisao not in ('aceitar', 'rejeitar', 'modificar', 'ignorar', 'manual') then
    raise exception 'Decisão inválida: %.', p_decisao;
  end if;

  select * into v_operacao from public.op_lote_operacoes
  where id = p_op_lote_operacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;
  if v_operacao.status = 'concluida' then
    raise exception 'Operação já concluída não participa mais de sequenciamento.';
  end if;

  v_tem_valor_novo := p_nova_data_planejada_inicio is not null or p_nova_data_planejada_fim is not null
    or p_novo_recurso_produtivo_id is not null or p_nova_prioridade is not null;

  if p_decisao in ('rejeitar', 'ignorar') and v_tem_valor_novo then
    raise exception 'Decisão "%" não altera a programação — não informe data/recurso/prioridade novos.', p_decisao;
  end if;

  -- Snapshot da recomendação apresentada (§7) no momento da decisão —
  -- vazio quando a operação não tem recurso associado.
  if v_operacao.recurso_produtivo_id is not null then
    select to_jsonb(r) into v_snapshot
    from public.calcular_ranking_sequenciamento(v_operacao.recurso_produtivo_id) r
    where r.op_lote_operacao_id = p_op_lote_operacao_id;
  end if;

  -- Aplica de verdade só quando a decisão é aceitar/modificar/manual E
  -- algum valor novo veio — reaproveita as funções já validadas e
  -- auditadas (trocar_recurso_operacao Fase 5b, programar_operacao/
  -- definir_prioridade_op Fase 6a), sem duplicar validação.
  if p_decisao in ('aceitar', 'modificar', 'manual') and v_tem_valor_novo then
    if p_novo_recurso_produtivo_id is not null then
      perform public.trocar_recurso_operacao(p_op_lote_operacao_id, p_novo_recurso_produtivo_id, p_motivo);
    end if;
    if p_nova_data_planejada_inicio is not null or p_nova_data_planejada_fim is not null then
      perform public.programar_operacao(
        p_op_lote_operacao_id,
        coalesce(p_nova_data_planejada_inicio, v_operacao.data_planejada_inicio),
        coalesce(p_nova_data_planejada_fim, v_operacao.data_planejada_fim)
      );
    end if;
    if p_nova_prioridade is not null then
      perform public.definir_prioridade_op(v_operacao.ordem_producao_id, p_nova_prioridade);
    end if;
    v_aplicado := true;
  end if;

  insert into public.sequenciamento_decisoes (
    company_id, op_lote_operacao_id, recomendacao_snapshot, decisao, motivo, aplicado, decidido_por
  ) values (
    v_company_id, p_op_lote_operacao_id, coalesce(v_snapshot, '{}'::jsonb), p_decisao, p_motivo, v_aplicado, auth.uid()
  ) returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.sequenciamento_decidido', 'op_lote_operacao', p_op_lote_operacao_id, p_motivo,
    jsonb_build_object('decisao', p_decisao, 'aplicado', v_aplicado, 'sequenciamento_decisao_id', v_id)
  );

  return v_id;
end;
$$;

grant execute on function public.decidir_sequenciamento(uuid, text, text, date, date, uuid, smallint) to authenticated;

create or replace function public.listar_decisoes_sequenciamento(p_op_lote_operacao_id uuid default null)
returns table (
  id uuid,
  op_lote_operacao_id uuid,
  ordem_producao_numero text,
  descricao_operacao text,
  recomendacao_snapshot jsonb,
  decisao text,
  motivo text,
  aplicado boolean,
  decidido_por_nome text,
  decidido_em timestamptz,
  status_atual text,
  quantidade_planejada numeric,
  quantidade_produzida numeric,
  data_planejada_inicio_atual date,
  data_planejada_fim_atual date
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
    sd.id, sd.op_lote_operacao_id, op.numero, olo.descricao, sd.recomendacao_snapshot, sd.decisao, sd.motivo,
    sd.aplicado, prof.display_name, sd.decidido_em,
    olo.status, olo.quantidade_planejada, olo.quantidade_produzida, olo.data_planejada_inicio, olo.data_planejada_fim
  from public.sequenciamento_decisoes sd
  join public.op_lote_operacoes olo on olo.id = sd.op_lote_operacao_id
  join public.ordens_producao op on op.id = olo.ordem_producao_id
  left join public.profiles prof on prof.id = sd.decidido_por
  where sd.company_id = v_company_id
    and (p_op_lote_operacao_id is null or sd.op_lote_operacao_id = p_op_lote_operacao_id)
  order by sd.decidido_em desc;
end;
$$;

grant execute on function public.listar_decisoes_sequenciamento(uuid) to authenticated;

-- =========================================================================
-- 3. simular_alteracao_programacao() — TÓPICO 4 §8. Nunca insert/update:
--    compara antes×depois via calcular_ranking_sequenciamento() com
--    override, e capacidade/gargalo (§31/§37) via calcular_capacidade_
--    recurso() pro "antes" (reaproveitado sem duplicar) + ajuste aditivo
--    das horas desta operação pro "depois" (a soma é estritamente
--    aditiva — mover uma operação só soma/subtrai as horas dela mesma,
--    sem recalcular o resto).
-- =========================================================================

create or replace function public.simular_alteracao_programacao(
  p_op_lote_operacao_id uuid,
  p_novo_recurso_produtivo_id uuid default null,
  p_nova_data_planejada_inicio date default null,
  p_nova_data_planejada_fim date default null,
  p_nova_prioridade smallint default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_operacao public.op_lote_operacoes;
  v_recurso_atual_id uuid;
  v_recurso_novo_id uuid;
  v_muda_recurso boolean;
  v_horas_operacao numeric;
  v_cap_atual_calc record;
  v_cap_novo_calc record;
  v_necessaria_atual_depois numeric;
  v_necessaria_novo_depois numeric;
  v_recurso_atual_jsonb jsonb;
  v_recurso_novo_jsonb jsonb;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'manage') then
    raise exception 'Sem permissão para simular alteração de programação (producao.manage).';
  end if;

  select * into v_operacao from public.op_lote_operacoes
  where id = p_op_lote_operacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;
  if v_operacao.recurso_produtivo_id is null then
    raise exception 'Operação sem recurso associado não participa de sequenciamento — nada a simular.';
  end if;
  if p_novo_recurso_produtivo_id is not null and not exists (
    select 1 from public.recursos_produtivos where id = p_novo_recurso_produtivo_id and company_id = v_company_id
  ) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;
  if p_nova_prioridade is not null and p_nova_prioridade not between 1 and 5 then
    raise exception 'Prioridade deve estar entre 1 (mais urgente) e 5 (menos urgente).';
  end if;

  v_recurso_atual_id := v_operacao.recurso_produtivo_id;
  v_recurso_novo_id := coalesce(p_novo_recurso_produtivo_id, v_recurso_atual_id);
  v_muda_recurso := v_recurso_novo_id <> v_recurso_atual_id;
  v_horas_operacao := coalesce(
    (v_operacao.quantidade_planejada - v_operacao.quantidade_produzida) * v_operacao.tempo_previsto_minutos / 60.0, 0
  );

  select * into v_cap_atual_calc from public.calcular_capacidade_recurso(v_recurso_atual_id, 7);
  v_necessaria_atual_depois := v_cap_atual_calc.capacidade_necessaria_horas - (case when v_muda_recurso then v_horas_operacao else 0 end);
  if v_muda_recurso then
    select * into v_cap_novo_calc from public.calcular_capacidade_recurso(v_recurso_novo_id, 7);
    v_necessaria_novo_depois := v_cap_novo_calc.capacidade_necessaria_horas + v_horas_operacao;
  end if;

  -- Bloco "recurso_atual" — sempre calculado, nunca referencia
  -- v_cap_novo_calc (que só existe quando o recurso muda; ver nota
  -- abaixo sobre por que os dois blocos precisam ficar em queries
  -- separadas).
  with antes_atual as (
    select * from public.calcular_ranking_sequenciamento(v_recurso_atual_id)
  ),
  depois_atual as (
    select * from public.calcular_ranking_sequenciamento(
      v_recurso_atual_id, p_op_lote_operacao_id, v_recurso_novo_id, p_op_lote_operacao_id,
      p_nova_data_planejada_inicio, p_nova_prioridade
    )
  ),
  outras_atual as (
    select da.ordem_producao_numero, da.descricao_operacao, aa.classificacao as classificacao_antes,
      da.classificacao as classificacao_depois, aa.posicao_recomendada as posicao_antes, da.posicao_recomendada as posicao_depois
    from depois_atual da
    join antes_atual aa on aa.op_lote_operacao_id = da.op_lote_operacao_id
    where da.op_lote_operacao_id <> p_op_lote_operacao_id
      and (aa.classificacao <> da.classificacao or aa.posicao_recomendada <> da.posicao_recomendada)
  )
  select jsonb_build_object(
    'recurso_produtivo_id', v_recurso_atual_id,
    'capacidade_disponivel_horas', v_cap_atual_calc.capacidade_disponivel_horas,
    'capacidade_necessaria_horas_antes', v_cap_atual_calc.capacidade_necessaria_horas,
    'capacidade_necessaria_horas_depois', v_necessaria_atual_depois,
    'classificacao_antes', v_cap_atual_calc.classificacao,
    'classificacao_depois', case
      when v_cap_atual_calc.capacidade_disponivel_horas = 0 then 'sem_capacidade_cadastrada'
      when v_necessaria_atual_depois > v_cap_atual_calc.capacidade_disponivel_horas then 'sobrecarga'
      when v_necessaria_atual_depois = 0 then 'ociosa'
      else 'normal'
    end,
    'operacao_antes', (select to_jsonb(aa) from antes_atual aa where aa.op_lote_operacao_id = p_op_lote_operacao_id),
    'operacao_depois', (select to_jsonb(da) from depois_atual da where da.op_lote_operacao_id = p_op_lote_operacao_id),
    'outras_operacoes_afetadas', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from outras_atual o)
  ) into v_recurso_atual_jsonb;

  -- Bloco "recurso_novo" — só roda (e só então v_cap_novo_calc existe) se
  -- o recurso realmente muda. Fica numa query própria, separada da de
  -- cima: colocar as duas dentro do mesmo "case when v_muda_recurso então
  -- ... senão null" faria o PL/pgSQL tentar resolver v_cap_novo_calc.
  -- campo pra montar os parâmetros da consulta ANTES de decidir qual
  -- branch do CASE vale — e um record nunca atribuído (quando o recurso
  -- não muda) estoura "record is not assigned yet" mesmo no branch que
  -- não deveria rodar.
  if v_muda_recurso then
    with antes_novo as (
      select * from public.calcular_ranking_sequenciamento(v_recurso_novo_id)
    ),
    depois_novo as (
      select * from public.calcular_ranking_sequenciamento(
        v_recurso_novo_id, null, v_recurso_novo_id, p_op_lote_operacao_id,
        p_nova_data_planejada_inicio, p_nova_prioridade
      )
    ),
    outras_novo as (
      select dn.ordem_producao_numero, dn.descricao_operacao, an.classificacao as classificacao_antes,
        dn.classificacao as classificacao_depois, an.posicao_recomendada as posicao_antes, dn.posicao_recomendada as posicao_depois
      from depois_novo dn
      join antes_novo an on an.op_lote_operacao_id = dn.op_lote_operacao_id
      where dn.op_lote_operacao_id <> p_op_lote_operacao_id
        and (an.classificacao <> dn.classificacao or an.posicao_recomendada <> dn.posicao_recomendada)
    )
    select jsonb_build_object(
      'recurso_produtivo_id', v_recurso_novo_id,
      'capacidade_disponivel_horas', v_cap_novo_calc.capacidade_disponivel_horas,
      'capacidade_necessaria_horas_antes', v_cap_novo_calc.capacidade_necessaria_horas,
      'capacidade_necessaria_horas_depois', v_necessaria_novo_depois,
      'classificacao_antes', v_cap_novo_calc.classificacao,
      'classificacao_depois', case
        when v_cap_novo_calc.capacidade_disponivel_horas = 0 then 'sem_capacidade_cadastrada'
        when v_necessaria_novo_depois > v_cap_novo_calc.capacidade_disponivel_horas then 'sobrecarga'
        when v_necessaria_novo_depois = 0 then 'ociosa'
        else 'normal'
      end,
      'operacao_depois', (select to_jsonb(dn) from depois_novo dn where dn.op_lote_operacao_id = p_op_lote_operacao_id),
      'outras_operacoes_afetadas', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from outras_novo o)
    ) into v_recurso_novo_jsonb;
  end if;

  return jsonb_build_object('recurso_atual', v_recurso_atual_jsonb, 'recurso_novo', v_recurso_novo_jsonb);
end;
$$;

grant execute on function public.simular_alteracao_programacao(uuid, uuid, date, date, smallint) to authenticated;
