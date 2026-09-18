-- TÓPICO 4 — Fase 6b da ampliação de escopo (ADR-002 v2.3, plano
-- aprovado pelo responsável do produto em 2026-09-19): sequenciamento
-- inteligente (§6), segunda sub-fase do bloco §5-10 (6a planejamento →
-- 6b sequenciamento → 6c decisão humana/simulação → 6d horizonte/
-- congelamento → 6e replanejamento).
--
-- O §6 lista ~15 critérios (prazo, atraso, prioridade, material
-- disponível, vidro, setup/perfil/ferramenta/processo compartilhados,
-- capacidade, gargalos, sobras, movimentação, espera, balanceamento). Só
-- prazo (pedidos.previsao_entrega), prioridade (ordens_producao.
-- prioridade, Fase 6a) e capacidade/gargalo (Fase 5) tinham dado real no
-- schema — o próprio exemplo do ADR pra "recomendação" é sobre setup
-- compartilhado, que não dava pra calcular. Decisão do responsável do
-- produto: em vez de cortar setup do escopo (como material/vidro/sobras,
-- que dependem de blocos não escolhidos — §20-22, §24-25), esta fase
-- primeiro estrutura os campos que faltam no roteiro (perfil, ferramenta,
-- processo) e só depois constrói o motor.
--
-- Decisões de recorte desta fase:
--   - perfil/ferramenta/processo são text simples em roteiro_operacoes
--     (config) e op_lote_operacoes (snapshot) — sem cadastro auxiliar,
--     mesmo padrão de "recurso_necessario" antes de virar
--     recurso_produtivo_id (Fase 5a): aqui não há candidato óbvio a
--     cadastro formal (perfil/ferramenta são atributos livres de cada
--     fábrica), então formalizar como tabela própria seria inventar
--     estrutura sem consumidor real.
--   - Gargalo (Fase 5) não entra no score por operação — é informativo,
--     reaproveitado de calcular_capacidade_recurso()/listar_gargalos()
--     sem duplicar cálculo, mesmo princípio do cabeçalho de
--     20260917050000_topico4_gargalos.sql. Resolvido no server component
--     da tela (Fase 5c também fez assim), não em SQL novo.
--   - Sem fórmula nem limiar definidos em nenhum ADR: o motor usa RANKING
--     por critério (não soma de magnitudes brutas, que deixaria prazo em
--     dias — podendo ser -400 — dominar sozinho) com pesos configuráveis
--     por empresa (default 1 cada, ponto de partida neutro). Classificação
--     🔴/🟡/🟢 compara posição recomendada × posição atual, sem limiar
--     arbitrário de "quão atrasado é risco": prazo vencido é sempre
--     risco, independentemente de posição.
--   - Posição "atual" reaproveita a mesma ordem que listar_programacao()
--     (Fase 6a) já usa (data planejada, prioridade, número) — não inventa
--     uma segunda noção de ordem corrente.
--   - Sem persistência de recomendação/decisão (§7) nem simulação (§8) —
--     função pura de leitura, recalculada a cada chamada. Fase 6c.
--   - Sem horizonte/congelamento (§9) nem replanejamento (§10) — Fases
--     6d/6e, ainda não implementadas.

-- =========================================================================
-- 1. Roteiro estruturado — perfil/ferramenta/processo (viabiliza detecção
--    de setup compartilhado do §6).
-- =========================================================================

alter table public.roteiro_operacoes
  add column perfil text,
  add column ferramenta text,
  add column processo text;
comment on column public.roteiro_operacoes.perfil is 'TÓPICO 4 §6 — setup compartilhado: operações com mesmo perfil+ferramenta+processo (todos preenchidos) são candidatas a agrupamento no sequenciamento (Fase 6b). Opcional — item sem esses campos simplesmente não participa da detecção.';

alter table public.op_lote_operacoes
  add column perfil text,
  add column ferramenta text,
  add column processo text;

drop function if exists public.adicionar_operacao_roteiro(uuid, int, text, uuid, numeric, text, text, text);

create function public.adicionar_operacao_roteiro(
  p_roteiro_id uuid,
  p_sequencia int,
  p_descricao text,
  p_recurso_produtivo_id uuid default null,
  p_tempo_previsto_minutos numeric default null,
  p_requisitos text default null,
  p_criterios_qualidade text default null,
  p_equipamentos_alternativos text default null,
  p_perfil text default null,
  p_ferramenta text default null,
  p_processo text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_id uuid;
begin
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição da operação é obrigatória.';
  end if;
  if p_sequencia is null or p_sequencia <= 0 then
    raise exception 'Sequência deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.roteiros_produtivos where id = p_roteiro_id and company_id = v_company_id) then
    raise exception 'Roteiro não encontrado nesta empresa.';
  end if;
  if p_recurso_produtivo_id is not null and not exists (
    select 1 from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id
  ) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.roteiro_operacoes (
    company_id, roteiro_id, sequencia, descricao, recurso_produtivo_id,
    tempo_previsto_minutos, requisitos, criterios_qualidade, equipamentos_alternativos,
    perfil, ferramenta, processo
  ) values (
    v_company_id, p_roteiro_id, p_sequencia, btrim(p_descricao), p_recurso_produtivo_id,
    p_tempo_previsto_minutos, p_requisitos, p_criterios_qualidade, p_equipamentos_alternativos,
    p_perfil, p_ferramenta, p_processo
  ) returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.operacao_roteiro_adicionada', 'roteiro_produtivo', p_roteiro_id, p_descricao,
    jsonb_build_object('roteiro_operacao_id', v_id, 'sequencia', p_sequencia)
  );

  return v_id;
end;
$$;

grant execute on function public.adicionar_operacao_roteiro(uuid, int, text, uuid, numeric, text, text, text, text, text, text) to authenticated;

-- criar_op_lote_operacoes() — mesmo corpo da Fase 3/5a, só copiando os 3
-- campos novos no snapshot (branch de fallback "Produção" não seta —
-- ficam null, sem detecção de setup pra item sem roteiro).
create or replace function public.criar_op_lote_operacoes(
  p_company_id uuid, p_ordem_producao_id uuid, p_item_id uuid, p_op_lote_id uuid, p_quantidade numeric
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_roteiro_id uuid;
  v_roteiro_operacao record;
begin
  select id into v_roteiro_id from public.roteiros_produtivos
  where item_id = p_item_id and company_id = p_company_id and ativo;

  if v_roteiro_id is not null then
    for v_roteiro_operacao in
      select * from public.roteiro_operacoes where roteiro_id = v_roteiro_id order by sequencia
    loop
      insert into public.op_lote_operacoes (
        company_id, ordem_producao_id, op_lote_id, roteiro_operacao_id, sequencia, descricao, recurso_produtivo_id,
        tempo_previsto_minutos, requisitos, criterios_qualidade, equipamentos_alternativos, quantidade_planejada,
        perfil, ferramenta, processo
      ) values (
        p_company_id, p_ordem_producao_id, p_op_lote_id, v_roteiro_operacao.id, v_roteiro_operacao.sequencia,
        v_roteiro_operacao.descricao, v_roteiro_operacao.recurso_produtivo_id, v_roteiro_operacao.tempo_previsto_minutos,
        v_roteiro_operacao.requisitos, v_roteiro_operacao.criterios_qualidade, v_roteiro_operacao.equipamentos_alternativos,
        p_quantidade, v_roteiro_operacao.perfil, v_roteiro_operacao.ferramenta, v_roteiro_operacao.processo
      );
    end loop;
  else
    insert into public.op_lote_operacoes (company_id, ordem_producao_id, op_lote_id, sequencia, descricao, quantidade_planejada)
    values (p_company_id, p_ordem_producao_id, p_op_lote_id, 1, 'Produção', p_quantidade);
  end if;
end;
$$;

-- =========================================================================
-- 2. sequenciamento_pesos — pesos configuráveis por critério (§6: "pesos
--    e critérios utilizados pelo mecanismo de recomendação deverão ser
--    configuráveis pela empresa"). Peso ausente = 1 (default neutro via
--    coalesce em recomendar_sequenciamento(), sem depender de seed).
-- =========================================================================

create table public.sequenciamento_pesos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  criterio text not null check (criterio in ('prazo', 'prioridade', 'setup_compartilhado')),
  peso numeric(6, 2) not null default 1 check (peso >= 0),
  updated_at timestamptz not null default now(),
  constraint sequenciamento_pesos_company_criterio_unique unique (company_id, criterio)
);
comment on table public.sequenciamento_pesos is 'TÓPICO 4 §6 — peso de cada critério no ranking de recomendar_sequenciamento(). Ausência de linha = peso 1 (default neutro).';

create trigger set_updated_at before update on public.sequenciamento_pesos
  for each row execute function public.set_updated_at();

alter table public.sequenciamento_pesos enable row level security;
create policy sequenciamento_pesos_select on public.sequenciamento_pesos for select
  using (company_id = (select public.current_company_id()));
grant select on public.sequenciamento_pesos to authenticated;

create or replace function public.definir_peso_sequenciamento(p_criterio text, p_peso numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  if p_criterio not in ('prazo', 'prioridade', 'setup_compartilhado') then
    raise exception 'Critério inválido: %.', p_criterio;
  end if;
  if p_peso is null or p_peso < 0 then
    raise exception 'Peso deve ser maior ou igual a zero.';
  end if;

  insert into public.sequenciamento_pesos (company_id, criterio, peso)
  values (v_company_id, p_criterio, p_peso)
  on conflict (company_id, criterio) do update set peso = excluded.peso;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.peso_sequenciamento_definido', 'sequenciamento_pesos', null, p_criterio,
    jsonb_build_object('criterio', p_criterio, 'peso', p_peso)
  );
end;
$$;

grant execute on function public.definir_peso_sequenciamento(text, numeric) to authenticated;

-- =========================================================================
-- 3. recomendar_sequenciamento() — TÓPICO 4 §6. Ranking por critério
--    (rank_prazo, rank_prioridade, rank_setup; 1 = mais urgente/mais
--    setup compartilhado em cada um), score = soma ponderada dos ranks
--    (menor = mais recomendado), posição recomendada × posição atual
--    (mesma ordem de listar_programacao — data planejada, prioridade,
--    número), classificação por comparação (prazo vencido = risco,
--    sempre; posição recomendada melhor que a atual = oportunidade;
--    senão, recomendado), explicação por template determinístico.
-- =========================================================================

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
declare
  v_company_id uuid := public.current_company_id();
  v_peso_prazo numeric;
  v_peso_prioridade numeric;
  v_peso_setup numeric;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
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

grant execute on function public.recomendar_sequenciamento(uuid) to authenticated;
