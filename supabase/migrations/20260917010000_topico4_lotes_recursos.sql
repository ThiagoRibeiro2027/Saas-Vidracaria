-- TÓPICO 4 — Fase 3 da ampliação de escopo (ADR-002 v2.2, plano aprovado
-- pelo responsável do produto em 2026-09-17): produção em lotes (§12) e
-- produção paralela/transferência entre recursos (§13), sobre a Fase 2
-- (roteiro produtivo e acompanhamento por operação — 20260917000000).
--
-- Decisão de escopo (aprovada pelo responsável do produto): cada lote de
-- liberação da OP ganha progresso PRÓPRIO em cada operação do roteiro —
-- não só uma quantidade liberada solta. Isso insere um nível novo na
-- hierarquia que a Fase 2 criou:
--
--   Pedido → Item → OP → Lote → Operação   (antes: OP → Operação direto)
--
-- Decisões de recorte desta fase:
--   - `op_operacoes` (Fase 2) vira `op_lote_operacoes`: é o mesmo
--     snapshot do roteiro (ou fallback "Produção"), só que agora
--     pertence a um lote, não direto à OP. Toda OP continua nascendo com
--     pelo menos 1 lote coprindo a quantidade inteira por padrão
--     (`p_liberar_integralmente = true`, default de
--     criar_ordem_producao) — comportamento idêntico ao da Fase 2 pra
--     quem não usa lotes parciais. `p_liberar_integralmente = false`
--     nasce sem nenhum lote; nada pode ser apontado até liberar o
--     primeiro via liberar_lote_producao().
--   - Fluxo sequencial (§16, operação N não passa do que a N-1 entregou)
--     passa a valer DENTRO do mesmo lote — lotes diferentes avançam pelo
--     roteiro de forma independente, cada um no seu próprio ritmo (é o
--     propósito de dividir em lotes).
--   - Nova trava: quantidade produzida numa op_lote_operacoes nunca pode
--     exceder a quantidade planejada DAQUELE LOTE (diferente da Fase 2,
--     que não limitava superprodução no nível da OP inteira) — sem essa
--     trava, apontar além do que o lote liberou tornaria a liberação
--     parcial do §12 inútil (bastaria "estourar" um lote pequeno pra
--     completar a OP inteira sem nunca liberar o resto).
--   - `ordens_producao.quantidade_produzida/perdida` continuam agregadas
--     (agora somando a última operação de CADA lote / soma de rejeitada
--     de todas as op_lote_operacoes da OP) — T8/T9 não mudam nada.
--   - §13: divisão de uma célula (lote × operação) entre recursos é uma
--     tabela nova (`op_lote_operacao_recursos`) e uma função de
--     apontamento separada (apontar_producao_recurso()) — apontar_
--     producao() não muda de novo pro caso comum (sem divisão de
--     recurso). "Recurso" continua texto livre — não há cadastro de
--     recursos produtivos ainda (§32, fase futura).
--   - Transferência (§13) reduz a alocação de origem e soma na de
--     destino (cria ou reaproveita um split existente pro mesmo
--     recurso), preservando rastreabilidade via transferido_de_id — sem
--     inventar um status "transferida" separado: o próprio saldo
--     (alocada - produzida) da origem já reflete a transferência.
--   - Lote fabril (§14, agrupamento entre OPs) fica pra próxima fase,
--     como já combinado — esta migration não mexe nisso.

-- =========================================================================
-- 1. op_lotes — lotes de liberação da OP (§12).
-- =========================================================================

create table public.op_lotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  ordem_producao_id uuid not null references public.ordens_producao(id) on delete cascade,
  numero int not null check (numero > 0),
  quantidade_planejada numeric(14, 3) not null check (quantidade_planejada > 0),
  quantidade_produzida numeric(14, 3) not null default 0 check (quantidade_produzida >= 0),
  quantidade_rejeitada numeric(14, 3) not null default 0 check (quantidade_rejeitada >= 0),
  saldo numeric(14, 3) generated always as (quantidade_planejada - quantidade_produzida) stored,
  status text not null default 'liberado' check (status in ('liberado', 'em_andamento', 'concluido')),
  liberado_por uuid references public.profiles(id),
  liberado_em timestamptz not null default now(),
  constraint op_lotes_ordem_numero_unique unique (ordem_producao_id, numero)
);
comment on table public.op_lotes is 'TÓPICO 4 §12 — lotes de liberação parcial da OP pra fábrica. A soma de quantidade_planejada de todos os lotes de uma OP nunca ultrapassa ordens_producao.quantidade_planejada.';
create index op_lotes_ordem_producao_id_idx on public.op_lotes (ordem_producao_id);

alter table public.op_lotes enable row level security;
create policy op_lotes_select on public.op_lotes for select
  using (company_id = (select public.current_company_id()));
grant select on public.op_lotes to authenticated;

-- =========================================================================
-- 2. op_operacoes (Fase 2) vira op_lote_operacoes — cada lote tem seu
--    próprio snapshot das operações do roteiro.
-- =========================================================================

alter table public.op_operacoes rename to op_lote_operacoes;
alter table public.op_lote_operacoes add column op_lote_id uuid references public.op_lotes(id) on delete cascade;

-- Backfill: toda op_lote_operacoes já existente (criada pela Fase 2, sem
-- conceito de lote) pertence a um lote único nº 1, cobrindo a quantidade
-- inteira da OP — mesmo comportamento que criar_ordem_producao() abaixo
-- passa a fazer por padrão.
insert into public.op_lotes (company_id, ordem_producao_id, numero, quantidade_planejada, liberado_em)
select distinct op.company_id, op.id, 1, op.quantidade_planejada, op.created_at
from public.ordens_producao op
where exists (select 1 from public.op_lote_operacoes olo where olo.ordem_producao_id = op.id);

update public.op_lote_operacoes olo set op_lote_id = lot.id
from public.op_lotes lot
where lot.ordem_producao_id = olo.ordem_producao_id and lot.numero = 1 and olo.op_lote_id is null;

alter table public.op_lote_operacoes alter column op_lote_id set not null;

alter table public.op_lote_operacoes drop constraint op_operacoes_ordem_sequencia_unique;
alter table public.op_lote_operacoes add constraint op_lote_operacoes_lote_sequencia_unique unique (op_lote_id, sequencia);
create index op_lote_operacoes_op_lote_id_idx on public.op_lote_operacoes (op_lote_id);

comment on table public.op_lote_operacoes is 'TÓPICO 4 §16 — snapshot das operações do roteiro por LOTE (§12: cada lote avança pelo roteiro de forma independente). "Aprovado" continua sendo autoridade de T8 (ordens_producao.status_qualidade), não duplicado aqui.';

alter policy op_operacoes_select on public.op_lote_operacoes rename to op_lote_operacoes_select;

-- producao_apontamentos: renomeia a coluna que aponta a operação (agora
-- de lote) e acrescenta o vínculo opcional com um split de recurso (§13).
alter table public.producao_apontamentos rename column op_operacao_id to op_lote_operacao_id;
alter table public.producao_apontamentos add column op_lote_operacao_recurso_id uuid;

-- =========================================================================
-- 3. op_lote_operacao_recursos — divisão de uma célula (lote × operação)
--    entre recursos (§13, produção paralela e transferência).
-- =========================================================================

create table public.op_lote_operacao_recursos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  op_lote_operacao_id uuid not null references public.op_lote_operacoes(id) on delete cascade,
  recurso text not null,
  quantidade_alocada numeric(14, 3) not null check (quantidade_alocada > 0),
  quantidade_produzida numeric(14, 3) not null default 0 check (quantidade_produzida >= 0),
  quantidade_rejeitada numeric(14, 3) not null default 0 check (quantidade_rejeitada >= 0),
  quantidade_retrabalho numeric(14, 3) not null default 0 check (quantidade_retrabalho >= 0),
  saldo numeric(14, 3) generated always as (quantidade_alocada - quantidade_produzida) stored,
  status text not null default 'planejada' check (status in ('planejada', 'em_andamento', 'concluida')),
  transferido_de_id uuid references public.op_lote_operacao_recursos(id),
  created_at timestamptz not null default now()
);
comment on table public.op_lote_operacao_recursos is 'TÓPICO 4 §13 — divide a quantidade de uma op_lote_operacoes entre recursos (ex.: Máquina A=100, Máquina B=100). "Recurso" é texto livre — não há cadastro de recursos produtivos ainda (§32, fase futura). Soma de quantidade_alocada nunca ultrapassa a quantidade_planejada da operação (alocar_recurso_operacao()).';
create index op_lote_operacao_recursos_op_lote_operacao_id_idx on public.op_lote_operacao_recursos (op_lote_operacao_id);

alter table public.op_lote_operacao_recursos enable row level security;
create policy op_lote_operacao_recursos_select on public.op_lote_operacao_recursos for select
  using (company_id = (select public.current_company_id()));
grant select on public.op_lote_operacao_recursos to authenticated;

alter table public.producao_apontamentos
  add constraint producao_apontamentos_op_lote_operacao_recurso_id_fkey
  foreign key (op_lote_operacao_recurso_id) references public.op_lote_operacao_recursos(id);

-- =========================================================================
-- 4. criar_op_lote_operacoes() — helper interno (sem grant a
--    authenticated, só chamado de dentro de outras funções SECURITY
--    DEFINER do schema): snapshot do roteiro ativo do item (ou operação
--    única "Produção" de fallback) num lote. Extraído porque agora tem
--    dois chamadores (criar_ordem_producao() e liberar_lote_producao())
--    que precisam ficar em sincronia.
-- =========================================================================

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
        company_id, ordem_producao_id, op_lote_id, roteiro_operacao_id, sequencia, descricao, recurso_necessario,
        tempo_previsto_minutos, requisitos, criterios_qualidade, equipamentos_alternativos, quantidade_planejada
      ) values (
        p_company_id, p_ordem_producao_id, p_op_lote_id, v_roteiro_operacao.id, v_roteiro_operacao.sequencia,
        v_roteiro_operacao.descricao, v_roteiro_operacao.recurso_necessario, v_roteiro_operacao.tempo_previsto_minutos,
        v_roteiro_operacao.requisitos, v_roteiro_operacao.criterios_qualidade, v_roteiro_operacao.equipamentos_alternativos,
        p_quantidade
      );
    end loop;
  else
    insert into public.op_lote_operacoes (company_id, ordem_producao_id, op_lote_id, sequencia, descricao, quantidade_planejada)
    values (p_company_id, p_ordem_producao_id, p_op_lote_id, 1, 'Produção', p_quantidade);
  end if;
end;
$$;

-- =========================================================================
-- 5. recalcular_agregados_producao() — helper interno: recalcula
--    op_lotes e ordens_producao a partir de op_lote_operacoes. Chamado
--    tanto por apontar_producao() quanto por apontar_producao_recurso()
--    (depois de consolidar os splits de recurso na célula pai).
-- =========================================================================

create or replace function public.recalcular_agregados_producao(p_op_lote_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ordem_producao_id uuid;
  v_ultima_produzida numeric;
  v_lote_planejada numeric;
begin
  select ordem_producao_id into v_ordem_producao_id from public.op_lotes where id = p_op_lote_id;

  select quantidade_produzida into v_ultima_produzida from public.op_lote_operacoes
  where op_lote_id = p_op_lote_id order by sequencia desc limit 1;
  select quantidade_planejada into v_lote_planejada from public.op_lotes where id = p_op_lote_id;

  update public.op_lotes set
    quantidade_produzida = coalesce(v_ultima_produzida, 0),
    quantidade_rejeitada = (select coalesce(sum(quantidade_rejeitada), 0) from public.op_lote_operacoes where op_lote_id = p_op_lote_id),
    status = case when coalesce(v_ultima_produzida, 0) >= v_lote_planejada then 'concluido' else 'em_andamento' end
  where id = p_op_lote_id;

  update public.ordens_producao set
    quantidade_produzida = (
      select coalesce(sum(ultima.quantidade_produzida), 0) from (
        select distinct on (olo.op_lote_id) olo.op_lote_id, olo.quantidade_produzida
        from public.op_lote_operacoes olo
        where olo.ordem_producao_id = v_ordem_producao_id
        order by olo.op_lote_id, olo.sequencia desc
      ) ultima
    ),
    quantidade_perdida = (
      select coalesce(sum(quantidade_rejeitada), 0) from public.op_lote_operacoes where ordem_producao_id = v_ordem_producao_id
    ),
    status = 'em_producao'
  where id = v_ordem_producao_id;
end;
$$;

-- =========================================================================
-- 6. criar_ordem_producao() — ganha p_liberar_integralmente (default
--    true = comportamento idêntico à Fase 2: nasce com 1 lote cobrindo a
--    quantidade inteira). false = nasce sem nenhum lote.
-- =========================================================================

drop function if exists public.criar_ordem_producao(uuid, numeric);

create function public.criar_ordem_producao(
  p_pedido_item_id uuid, p_quantidade numeric default null, p_liberar_integralmente boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_pedido_item public.pedido_itens;
  v_pedido public.pedidos;
  v_ja_planejado numeric;
  v_quantidade numeric;
  v_engenharia_versao_id uuid;
  v_op_lote_id uuid;
  v_numero text;
  v_id uuid;
begin
  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido_item.pedido_id;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível criar ordem de produção para item de pedido liberado (status atual: %).', v_pedido.status;
  end if;

  -- Lock de todas as OPs ativas do item antes de agregar (evita duas
  -- criações concorrentes ultrapassarem juntas o saldo do item).
  perform 1 from public.ordens_producao
  where pedido_item_id = p_pedido_item_id and company_id = v_company_id and status <> 'cancelada'
  for update;

  select coalesce(sum(quantidade_planejada), 0) into v_ja_planejado
  from public.ordens_producao
  where pedido_item_id = p_pedido_item_id and company_id = v_company_id and status <> 'cancelada';

  v_quantidade := coalesce(p_quantidade, v_pedido_item.quantidade - v_ja_planejado);
  if v_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero (saldo ainda não planejado do item: %).', v_pedido_item.quantidade - v_ja_planejado;
  end if;
  if v_ja_planejado + v_quantidade > v_pedido_item.quantidade then
    raise exception 'Quantidade solicitada (%) somada ao já planejado (%) excede a quantidade do item (%).',
      v_quantidade, v_ja_planejado, v_pedido_item.quantidade;
  end if;

  select id into v_engenharia_versao_id from public.engenharia_versoes
  where pedido_item_id = p_pedido_item_id and situacao = 'liberada';

  v_numero := public.next_document_number('ordem_producao');

  insert into public.ordens_producao (
    company_id, pedido_id, pedido_item_id, numero, quantidade_planejada, engenharia_versao_id
  ) values (
    v_company_id, v_pedido.id, p_pedido_item_id, v_numero, v_quantidade, v_engenharia_versao_id
  )
  returning id into v_id;

  if p_liberar_integralmente then
    insert into public.op_lotes (company_id, ordem_producao_id, numero, quantidade_planejada, liberado_por)
    values (v_company_id, v_id, 1, v_quantidade, auth.uid())
    returning id into v_op_lote_id;

    perform public.criar_op_lote_operacoes(v_company_id, v_id, v_pedido_item.item_id, v_op_lote_id, v_quantidade);
  end if;

  perform public.recalcular_situacao_ordem_producao(v_id);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_criada', 'ordem_producao', v_id, v_numero,
    jsonb_build_object(
      'pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id,
      'quantidade_planejada', v_quantidade, 'engenharia_versao_id', v_engenharia_versao_id,
      'liberado_integralmente', p_liberar_integralmente, 'op_lote_id', v_op_lote_id
    )
  );

  return v_id;
end;
$$;

grant execute on function public.criar_ordem_producao(uuid, numeric, boolean) to authenticated;

-- =========================================================================
-- 7. liberar_lote_producao() — TÓPICO 4 §12: libera mais uma parte da OP
--    pra fábrica, sem ultrapassar a quantidade planejada da OP.
-- =========================================================================

create or replace function public.liberar_lote_producao(p_ordem_producao_id uuid, p_quantidade numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_op public.ordens_producao;
  v_pedido_item public.pedido_itens;
  v_ja_liberado numeric;
  v_numero int;
  v_id uuid;
begin
  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível liberar lote em OP planejada ou em produção (status atual: %).', v_op.status;
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  -- Lock de todos os lotes da OP antes de agregar (evita duas liberações
  -- concorrentes ultrapassarem juntas o planejado da OP).
  perform 1 from public.op_lotes where ordem_producao_id = p_ordem_producao_id for update;

  select coalesce(sum(quantidade_planejada), 0) into v_ja_liberado
  from public.op_lotes where ordem_producao_id = p_ordem_producao_id;

  if v_ja_liberado + p_quantidade > v_op.quantidade_planejada then
    raise exception 'Quantidade solicitada (%) somada ao já liberado (%) excede a quantidade planejada da OP (%).',
      p_quantidade, v_ja_liberado, v_op.quantidade_planejada;
  end if;

  perform public.recalcular_situacao_ordem_producao(p_ordem_producao_id);
  select * into v_op from public.ordens_producao where id = p_ordem_producao_id;
  if v_op.situacao = 'bloqueada' then
    raise exception 'Ordem de produção bloqueada (%): %. Ação necessária: %',
      v_op.origem_bloqueio, v_op.motivo_bloqueio, v_op.acao_necessaria;
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero from public.op_lotes where ordem_producao_id = p_ordem_producao_id;
  select * into v_pedido_item from public.pedido_itens where id = v_op.pedido_item_id;

  insert into public.op_lotes (company_id, ordem_producao_id, numero, quantidade_planejada, liberado_por)
  values (v_company_id, p_ordem_producao_id, v_numero, p_quantidade, auth.uid())
  returning id into v_id;

  perform public.criar_op_lote_operacoes(v_company_id, p_ordem_producao_id, v_pedido_item.item_id, v_id, p_quantidade);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.lote_liberado', 'ordem_producao', p_ordem_producao_id, null,
    jsonb_build_object('op_lote_id', v_id, 'numero', v_numero, 'quantidade', p_quantidade)
  );

  return v_id;
end;
$$;

grant execute on function public.liberar_lote_producao(uuid, numeric) to authenticated;

-- =========================================================================
-- 8. apontar_producao() — aponta numa op_lote_operacao (renomeado);
--    fluxo sequencial passa a valer dentro do mesmo lote; nova trava:
--    não pode superar o planejado do PRÓPRIO lote.
-- =========================================================================

drop function if exists public.apontar_producao(uuid, numeric, numeric, numeric, text);

create function public.apontar_producao(
  p_op_lote_operacao_id uuid,
  p_quantidade_produzida numeric default 0,
  p_quantidade_rejeitada numeric default 0,
  p_quantidade_retrabalho numeric default 0,
  p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_operacao public.op_lote_operacoes;
  v_operacao_anterior public.op_lote_operacoes;
  v_op public.ordens_producao;
  v_produzida numeric := coalesce(p_quantidade_produzida, 0);
  v_rejeitada numeric := coalesce(p_quantidade_rejeitada, 0);
  v_retrabalho numeric := coalesce(p_quantidade_retrabalho, 0);
  v_id uuid;
begin
  if v_produzida < 0 or v_rejeitada < 0 or v_retrabalho < 0 then
    raise exception 'Quantidades não podem ser negativas.';
  end if;
  if v_produzida = 0 and v_rejeitada = 0 and v_retrabalho = 0 then
    raise exception 'Informe ao menos uma quantidade (produzida, rejeitada ou retrabalho) maior que zero.';
  end if;

  select * into v_operacao from public.op_lote_operacoes
  where id = p_op_lote_operacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;

  select * into v_op from public.ordens_producao where id = v_operacao.ordem_producao_id for update;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível apontar produção em OP planejada ou em produção (status atual: %).', v_op.status;
  end if;

  perform public.recalcular_situacao_ordem_producao(v_op.id);
  select * into v_op from public.ordens_producao where id = v_op.id;
  if v_op.situacao = 'bloqueada' then
    raise exception 'Ordem de produção bloqueada (%): %. Ação necessária: %',
      v_op.origem_bloqueio, v_op.motivo_bloqueio, v_op.acao_necessaria;
  end if;

  -- TÓPICO 4 §12: produzir além do que ESTE LOTE liberou tornaria a
  -- liberação parcial inútil (bastaria "estourar" um lote pequeno pra
  -- completar a OP inteira sem liberar o resto).
  if v_operacao.quantidade_produzida + v_produzida > v_operacao.quantidade_planejada then
    raise exception 'Quantidade produzida (%) excederia o planejado deste lote (%).',
      v_operacao.quantidade_produzida + v_produzida, v_operacao.quantidade_planejada;
  end if;

  -- TÓPICO 4 §16: fluxo sequencial DENTRO do mesmo lote — lotes
  -- diferentes avançam pelo roteiro de forma independente (§12).
  if v_operacao.sequencia > 1 then
    select * into v_operacao_anterior from public.op_lote_operacoes
    where op_lote_id = v_operacao.op_lote_id and sequencia = v_operacao.sequencia - 1;
    if found and v_operacao.quantidade_produzida + v_produzida > v_operacao_anterior.quantidade_produzida then
      raise exception 'Quantidade produzida (%) excederia o que a operação anterior (%) já entregou (%) neste lote.',
        v_operacao.quantidade_produzida + v_produzida, v_operacao_anterior.descricao, v_operacao_anterior.quantidade_produzida;
    end if;
  end if;

  insert into public.producao_apontamentos (
    company_id, ordem_producao_id, op_lote_operacao_id, quantidade_produzida, quantidade_perdida,
    quantidade_retrabalho, observacao, registrado_por
  ) values (
    v_company_id, v_op.id, p_op_lote_operacao_id, v_produzida, v_rejeitada, v_retrabalho, p_observacao, auth.uid()
  ) returning id into v_id;

  update public.op_lote_operacoes set
    quantidade_produzida = quantidade_produzida + v_produzida,
    quantidade_rejeitada = quantidade_rejeitada + v_rejeitada,
    quantidade_retrabalho = quantidade_retrabalho + v_retrabalho,
    iniciada_em = coalesce(iniciada_em, now()),
    status = case when quantidade_produzida + v_produzida >= quantidade_planejada then 'concluida' else 'em_andamento' end,
    concluida_em = case when quantidade_produzida + v_produzida >= quantidade_planejada then now() else concluida_em end
  where id = p_op_lote_operacao_id;

  perform public.recalcular_agregados_producao(v_operacao.op_lote_id);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.apontamento_registrado', 'ordem_producao', v_op.id, p_observacao,
    jsonb_build_object(
      'op_lote_operacao_id', p_op_lote_operacao_id, 'quantidade_produzida', v_produzida,
      'quantidade_rejeitada', v_rejeitada, 'quantidade_retrabalho', v_retrabalho
    )
  );

  return v_id;
end;
$$;

grant execute on function public.apontar_producao(uuid, numeric, numeric, numeric, text) to authenticated;

-- =========================================================================
-- 9. concluir_ordem_producao() — mesma lógica da Fase 2 (todas as
--    operações da OP concluídas), agora sobre op_lote_operacoes; a
--    coluna ordem_producao_id continua denormalizada, então a consulta
--    não muda de forma, só de tabela.
-- =========================================================================

create or replace function public.concluir_ordem_producao(p_ordem_producao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_op public.ordens_producao;
  v_operacoes_pendentes int;
begin
  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível concluir OP planejada ou em produção (status atual: %).', v_op.status;
  end if;
  if v_op.quantidade_produzida < v_op.quantidade_planejada then
    raise exception 'Quantidade produzida (%) ainda não atinge a planejada (%).', v_op.quantidade_produzida, v_op.quantidade_planejada;
  end if;

  select count(*) into v_operacoes_pendentes from public.op_lote_operacoes
  where ordem_producao_id = p_ordem_producao_id and status <> 'concluida';
  if v_operacoes_pendentes > 0 then
    raise exception 'Ainda há % operação(ões) de lote não concluída(s) (TÓPICO 4 §16).', v_operacoes_pendentes;
  end if;

  perform public.recalcular_situacao_ordem_producao(p_ordem_producao_id);
  select * into v_op from public.ordens_producao where id = p_ordem_producao_id;
  if v_op.situacao = 'bloqueada' then
    raise exception 'Ordem de produção bloqueada (%): %. Ação necessária: %',
      v_op.origem_bloqueio, v_op.motivo_bloqueio, v_op.acao_necessaria;
  end if;

  update public.ordens_producao set status = 'concluida' where id = p_ordem_producao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_concluida', 'ordem_producao', p_ordem_producao_id, v_op.numero,
    jsonb_build_object('quantidade_produzida', v_op.quantidade_produzida, 'quantidade_perdida', v_op.quantidade_perdida)
  );

  return p_ordem_producao_id;
end;
$$;

-- =========================================================================
-- 10. alocar_recurso_operacao() / transferir_recurso_operacao() /
--     apontar_producao_recurso() — TÓPICO 4 §13.
-- =========================================================================

create or replace function public.alocar_recurso_operacao(
  p_op_lote_operacao_id uuid, p_recurso text, p_quantidade numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_operacao public.op_lote_operacoes;
  v_ja_alocado numeric;
  v_id uuid;
begin
  if p_recurso is null or btrim(p_recurso) = '' then
    raise exception 'Recurso é obrigatório.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select * into v_operacao from public.op_lote_operacoes
  where id = p_op_lote_operacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;

  select coalesce(sum(quantidade_alocada), 0) into v_ja_alocado
  from public.op_lote_operacao_recursos where op_lote_operacao_id = p_op_lote_operacao_id;

  if v_ja_alocado + p_quantidade > v_operacao.quantidade_planejada then
    raise exception 'Quantidade alocada (%) somada à já alocada (%) excede o planejado da operação (%).',
      p_quantidade, v_ja_alocado, v_operacao.quantidade_planejada;
  end if;

  insert into public.op_lote_operacao_recursos (company_id, op_lote_operacao_id, recurso, quantidade_alocada)
  values (v_company_id, p_op_lote_operacao_id, btrim(p_recurso), p_quantidade)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.recurso_alocado', 'op_lote_operacao', p_op_lote_operacao_id, p_recurso,
    jsonb_build_object('op_lote_operacao_recurso_id', v_id, 'quantidade', p_quantidade)
  );

  return v_id;
end;
$$;

grant execute on function public.alocar_recurso_operacao(uuid, text, numeric) to authenticated;

create or replace function public.transferir_recurso_operacao(
  p_op_lote_operacao_recurso_id uuid, p_recurso_destino text, p_quantidade numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_origem public.op_lote_operacao_recursos;
  v_destino public.op_lote_operacao_recursos;
  v_saldo numeric;
  v_id uuid;
begin
  if p_recurso_destino is null or btrim(p_recurso_destino) = '' then
    raise exception 'Recurso de destino é obrigatório.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select * into v_origem from public.op_lote_operacao_recursos
  where id = p_op_lote_operacao_recurso_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Recurso de origem não encontrado nesta empresa.';
  end if;

  v_saldo := v_origem.quantidade_alocada - v_origem.quantidade_produzida;
  if p_quantidade > v_saldo then
    raise exception 'Quantidade a transferir (%) excede o saldo do recurso de origem (%).', p_quantidade, v_saldo;
  end if;

  -- Reduzir a alocação pode fazer a origem já bater o novo total (ex.:
  -- M01 produziu 70 de 100, transfere os 30 restantes -> aloca 70, que a
  -- própria produzida já atingiu) — status precisa ser recalculado, não
  -- só quantidade_alocada, senão fica "em_andamento" com saldo zero.
  -- Só sobe de 'planejada' se algo já foi produzido (quantidade_produzida
  -- = 0 continua 'planejada' mesmo com a alocação reduzida).
  update public.op_lote_operacao_recursos set
    quantidade_alocada = quantidade_alocada - p_quantidade,
    status = case
      when quantidade_produzida = 0 then status
      when quantidade_produzida >= quantidade_alocada - p_quantidade then 'concluida'
      else 'em_andamento'
    end
  where id = p_op_lote_operacao_recurso_id;

  -- Reaproveita um split já existente pro mesmo recurso de destino nesta
  -- operação, se houver; senão cria um novo.
  select * into v_destino from public.op_lote_operacao_recursos
  where op_lote_operacao_id = v_origem.op_lote_operacao_id and recurso = btrim(p_recurso_destino) and company_id = v_company_id
  for update;

  if found then
    update public.op_lote_operacao_recursos set
      quantidade_alocada = quantidade_alocada + p_quantidade,
      status = case
        when quantidade_produzida = 0 then status
        when quantidade_produzida >= quantidade_alocada + p_quantidade then 'concluida'
        else 'em_andamento'
      end
    where id = v_destino.id;
    v_id := v_destino.id;
  else
    insert into public.op_lote_operacao_recursos (
      company_id, op_lote_operacao_id, recurso, quantidade_alocada, transferido_de_id
    ) values (
      v_company_id, v_origem.op_lote_operacao_id, btrim(p_recurso_destino), p_quantidade, p_op_lote_operacao_recurso_id
    ) returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.recurso_transferido', 'op_lote_operacao_recurso', p_op_lote_operacao_recurso_id, p_recurso_destino,
    jsonb_build_object('origem_id', p_op_lote_operacao_recurso_id, 'destino_id', v_id, 'quantidade', p_quantidade)
  );

  return v_id;
end;
$$;

grant execute on function public.transferir_recurso_operacao(uuid, text, numeric) to authenticated;

create or replace function public.apontar_producao_recurso(
  p_op_lote_operacao_recurso_id uuid,
  p_quantidade_produzida numeric default 0,
  p_quantidade_rejeitada numeric default 0,
  p_quantidade_retrabalho numeric default 0,
  p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_recurso public.op_lote_operacao_recursos;
  v_operacao public.op_lote_operacoes;
  v_operacao_anterior public.op_lote_operacoes;
  v_op public.ordens_producao;
  v_produzida numeric := coalesce(p_quantidade_produzida, 0);
  v_rejeitada numeric := coalesce(p_quantidade_rejeitada, 0);
  v_retrabalho numeric := coalesce(p_quantidade_retrabalho, 0);
  v_id uuid;
begin
  if v_produzida < 0 or v_rejeitada < 0 or v_retrabalho < 0 then
    raise exception 'Quantidades não podem ser negativas.';
  end if;
  if v_produzida = 0 and v_rejeitada = 0 and v_retrabalho = 0 then
    raise exception 'Informe ao menos uma quantidade (produzida, rejeitada ou retrabalho) maior que zero.';
  end if;

  select * into v_recurso from public.op_lote_operacao_recursos
  where id = p_op_lote_operacao_recurso_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Recurso de operação não encontrado nesta empresa.';
  end if;
  if v_recurso.quantidade_produzida + v_produzida > v_recurso.quantidade_alocada then
    raise exception 'Quantidade produzida (%) excederia o alocado a este recurso (%).',
      v_recurso.quantidade_produzida + v_produzida, v_recurso.quantidade_alocada;
  end if;

  select * into v_operacao from public.op_lote_operacoes where id = v_recurso.op_lote_operacao_id for update;
  select * into v_op from public.ordens_producao where id = v_operacao.ordem_producao_id for update;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível apontar produção em OP planejada ou em produção (status atual: %).', v_op.status;
  end if;

  perform public.recalcular_situacao_ordem_producao(v_op.id);
  select * into v_op from public.ordens_producao where id = v_op.id;
  if v_op.situacao = 'bloqueada' then
    raise exception 'Ordem de produção bloqueada (%): %. Ação necessária: %',
      v_op.origem_bloqueio, v_op.motivo_bloqueio, v_op.acao_necessaria;
  end if;

  if v_operacao.sequencia > 1 then
    select * into v_operacao_anterior from public.op_lote_operacoes
    where op_lote_id = v_operacao.op_lote_id and sequencia = v_operacao.sequencia - 1;
    if found and v_operacao.quantidade_produzida + v_produzida > v_operacao_anterior.quantidade_produzida then
      raise exception 'Quantidade produzida (%) excederia o que a operação anterior (%) já entregou (%) neste lote.',
        v_operacao.quantidade_produzida + v_produzida, v_operacao_anterior.descricao, v_operacao_anterior.quantidade_produzida;
    end if;
  end if;

  insert into public.producao_apontamentos (
    company_id, ordem_producao_id, op_lote_operacao_id, op_lote_operacao_recurso_id, quantidade_produzida,
    quantidade_perdida, quantidade_retrabalho, observacao, registrado_por
  ) values (
    v_company_id, v_op.id, v_recurso.op_lote_operacao_id, p_op_lote_operacao_recurso_id, v_produzida, v_rejeitada,
    v_retrabalho, p_observacao, auth.uid()
  ) returning id into v_id;

  update public.op_lote_operacao_recursos set
    quantidade_produzida = quantidade_produzida + v_produzida,
    quantidade_rejeitada = quantidade_rejeitada + v_rejeitada,
    quantidade_retrabalho = quantidade_retrabalho + v_retrabalho,
    status = case when quantidade_produzida + v_produzida >= quantidade_alocada then 'concluida' else 'em_andamento' end
  where id = p_op_lote_operacao_recurso_id;

  -- Consolida na célula (lote × operação) pai: soma de todos os splits
  -- de recurso dessa operação (§13, "o sistema deverá consolidar os
  -- resultados na OP").
  update public.op_lote_operacoes set
    quantidade_produzida = (select coalesce(sum(quantidade_produzida), 0) from public.op_lote_operacao_recursos where op_lote_operacao_id = v_operacao.id),
    quantidade_rejeitada = (select coalesce(sum(quantidade_rejeitada), 0) from public.op_lote_operacao_recursos where op_lote_operacao_id = v_operacao.id),
    quantidade_retrabalho = (select coalesce(sum(quantidade_retrabalho), 0) from public.op_lote_operacao_recursos where op_lote_operacao_id = v_operacao.id),
    iniciada_em = coalesce(iniciada_em, now()),
    status = case
      when (select coalesce(sum(quantidade_produzida), 0) from public.op_lote_operacao_recursos where op_lote_operacao_id = v_operacao.id) >= quantidade_planejada
      then 'concluida' else 'em_andamento'
    end
  where id = v_operacao.id;

  perform public.recalcular_agregados_producao(v_operacao.op_lote_id);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.apontamento_registrado', 'ordem_producao', v_op.id, p_observacao,
    jsonb_build_object(
      'op_lote_operacao_recurso_id', p_op_lote_operacao_recurso_id, 'quantidade_produzida', v_produzida,
      'quantidade_rejeitada', v_rejeitada, 'quantidade_retrabalho', v_retrabalho
    )
  );

  return v_id;
end;
$$;

grant execute on function public.apontar_producao_recurso(uuid, numeric, numeric, numeric, text) to authenticated;
