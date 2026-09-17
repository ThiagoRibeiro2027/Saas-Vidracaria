-- TÓPICO 4 — Fase 2 da ampliação de escopo (ADR-002 v2.2, plano aprovado
-- pelo responsável do produto em 2026-09-17): roteiro produtivo
-- configurável por empresa (§15) e acompanhamento por operação (§16),
-- construído sobre a fundação da Fase 1 (situação da OP, engenharia
-- liberada, OP parcial — 20260916080000).
--
-- Decisões de recorte desta fase:
--   - Fallback aprovado pelo responsável do produto: item/processo sem
--     roteiro ativo configurado gera OP com uma única operação genérica
--     "Produção". Roteiro multi-etapa é opt-in — quem não configurar nada
--     mantém exatamente o comportamento anterior (um "apontamento" cobre
--     a OP inteira).
--   - "Recurso necessário" da operação (§15) é texto livre nesta fase —
--     não existe cadastro de máquinas/equipamentos/centros de trabalho no
--     projeto ainda (§32 Recursos Produtivos é fase futura); formalizar
--     isso agora seria inventar um cadastro sem consumidor real.
--   - "Aprovado" não vira contador por operação: T8 (Qualidade) já é a
--     autoridade de aprovação/reprovação no nível da OP inteira
--     (ordens_producao.status_qualidade). Duplicar "aprovado" por
--     operação criaria duas fontes de verdade divergentes. Cada operação
--     rastreia produzido/rejeitado/retrabalho — contadores de apoio ao
--     acompanhamento visual do §16, sem acionar o fluxo formal de não
--     conformidade de T8.
--   - "Iniciado" (§16) não é uma quantidade própria: é o status da
--     operação (planejada -> em_andamento -> concluida) e o timestamp
--     iniciada_em — visível sem inventar uma métrica de "quantidade em
--     andamento" que nenhum ADR define.
--   - Sequência de roteiro_operacoes é imutável após criada (sem
--     reordenar): pra mudar a ordem, remove e recria a operação. Um editor
--     de posições é complexidade sem consumidor real ainda.
--   - `op_operacoes` é sempre um snapshot da operação no momento da
--     criação da OP (mesmo padrão de engenharia_versoes, 20260916080000):
--     editar/remover uma `roteiro_operacoes` depois não afeta OPs já
--     criadas.
--   - Fluxo sequencial: apontar_producao() recusa produzir numa operação
--     mais do que a operação anterior do roteiro já entregou — sem isso,
--     "acompanhamento por operação" seria só um formulário sem garantia
--     nenhuma de que o roteiro reflete o fluxo real da fábrica.

-- =========================================================================
-- 1. roteiros_produtivos / roteiro_operacoes — configuração por empresa.
-- =========================================================================

create table public.roteiros_produtivos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null references public.itens(id),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.roteiros_produtivos is 'TÓPICO 4 §15 — roteiro produtivo configurável por empresa, associado a um item (produto/processo). No máximo 1 ativo por item (roteiros_produtivos_ativo_unique) — criar um novo desativa o anterior.';
create index roteiros_produtivos_item_id_idx on public.roteiros_produtivos (item_id);
create unique index roteiros_produtivos_ativo_unique on public.roteiros_produtivos (company_id, item_id) where ativo;

create table public.roteiro_operacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  roteiro_id uuid not null references public.roteiros_produtivos(id) on delete cascade,
  sequencia int not null check (sequencia > 0),
  descricao text not null,
  recurso_necessario text,
  tempo_previsto_minutos numeric(10, 2) check (tempo_previsto_minutos is null or tempo_previsto_minutos > 0),
  requisitos text,
  criterios_qualidade text,
  equipamentos_alternativos text,
  constraint roteiro_operacoes_roteiro_sequencia_unique unique (roteiro_id, sequencia)
);
comment on table public.roteiro_operacoes is 'TÓPICO 4 §15 — operações do roteiro em sequência (ex.: Corte, Usinagem, Montagem, Inspeção). "Recurso necessário" é texto livre — não há cadastro de recursos produtivos ainda (§32, fase futura).';
create index roteiro_operacoes_roteiro_id_idx on public.roteiro_operacoes (roteiro_id);

create trigger set_updated_at before update on public.roteiros_produtivos
  for each row execute function public.set_updated_at();

alter table public.roteiros_produtivos enable row level security;
alter table public.roteiro_operacoes enable row level security;

-- SELECT liberado a qualquer autenticado da empresa, mesmo padrão de
-- ordens_producao_select (T4) e demais tabelas de configuração de módulo.
create policy roteiros_produtivos_select on public.roteiros_produtivos for select
  using (company_id = (select public.current_company_id()));
create policy roteiro_operacoes_select on public.roteiro_operacoes for select
  using (company_id = (select public.current_company_id()));

grant select on public.roteiros_produtivos to authenticated;
grant select on public.roteiro_operacoes to authenticated;

-- =========================================================================
-- 2. op_operacoes — snapshot por OP das operações do roteiro (ou da
--    operação única de fallback), com acompanhamento (§16).
-- =========================================================================

create table public.op_operacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  ordem_producao_id uuid not null references public.ordens_producao(id) on delete cascade,
  roteiro_operacao_id uuid references public.roteiro_operacoes(id) on delete set null,
  sequencia int not null check (sequencia > 0),
  descricao text not null,
  recurso_necessario text,
  tempo_previsto_minutos numeric(10, 2),
  requisitos text,
  criterios_qualidade text,
  equipamentos_alternativos text,
  quantidade_planejada numeric(14, 3) not null check (quantidade_planejada > 0),
  quantidade_produzida numeric(14, 3) not null default 0 check (quantidade_produzida >= 0),
  quantidade_rejeitada numeric(14, 3) not null default 0 check (quantidade_rejeitada >= 0),
  quantidade_retrabalho numeric(14, 3) not null default 0 check (quantidade_retrabalho >= 0),
  saldo numeric(14, 3) generated always as (quantidade_planejada - quantidade_produzida) stored,
  status text not null default 'planejada' check (status in ('planejada', 'em_andamento', 'concluida')),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  constraint op_operacoes_ordem_sequencia_unique unique (ordem_producao_id, sequencia)
);
comment on table public.op_operacoes is 'TÓPICO 4 §16 — snapshot das operações do roteiro no momento da criação da OP (ou operação única "Produção" quando o item não tem roteiro ativo). "Aprovado" continua sendo autoridade de T8 (ordens_producao.status_qualidade), não duplicado aqui.';
create index op_operacoes_ordem_producao_id_idx on public.op_operacoes (ordem_producao_id);

alter table public.op_operacoes enable row level security;
create policy op_operacoes_select on public.op_operacoes for select
  using (company_id = (select public.current_company_id()));
grant select on public.op_operacoes to authenticated;

-- producao_apontamentos passa a apontar numa operação específica.
-- Nullable (não backfillável em linhas antigas, mesmo padrão aditivo de
-- ordens_producao.engenharia_versao_id em 20260916080000) — toda linha
-- nova sempre grava op_operacao_id via apontar_producao().
alter table public.producao_apontamentos
  add column op_operacao_id uuid references public.op_operacoes(id),
  add column quantidade_retrabalho numeric(14, 3) not null default 0 check (quantidade_retrabalho >= 0);

alter table public.producao_apontamentos drop constraint producao_apontamentos_quantidade_check;
alter table public.producao_apontamentos add constraint producao_apontamentos_quantidade_check
  check (quantidade_produzida > 0 or quantidade_perdida > 0 or quantidade_retrabalho > 0);

-- =========================================================================
-- 3. CRUD de roteiro — criar_roteiro_produtivo(), adicionar_operacao_
--    roteiro(), remover_operacao_roteiro(), desativar_roteiro().
-- =========================================================================

create or replace function public.criar_roteiro_produtivo(p_item_id uuid, p_nome text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do roteiro é obrigatório.';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  -- Só pode haver 1 roteiro ativo por item (roteiros_produtivos_ativo_
  -- unique) — desativa o anterior antes de criar o novo, mesmo padrão de
  -- liberar_engenharia() rebaixando a versão vigente antes de inserir.
  update public.roteiros_produtivos set ativo = false
  where item_id = p_item_id and company_id = v_company_id and ativo;

  insert into public.roteiros_produtivos (company_id, item_id, nome)
  values (v_company_id, p_item_id, btrim(p_nome))
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.roteiro_criado', 'roteiro_produtivo', v_id, p_nome,
    jsonb_build_object('item_id', p_item_id)
  );

  return v_id;
end;
$$;

grant execute on function public.criar_roteiro_produtivo(uuid, text) to authenticated;

create or replace function public.adicionar_operacao_roteiro(
  p_roteiro_id uuid,
  p_sequencia int,
  p_descricao text,
  p_recurso_necessario text default null,
  p_tempo_previsto_minutos numeric default null,
  p_requisitos text default null,
  p_criterios_qualidade text default null,
  p_equipamentos_alternativos text default null
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

  insert into public.roteiro_operacoes (
    company_id, roteiro_id, sequencia, descricao, recurso_necessario,
    tempo_previsto_minutos, requisitos, criterios_qualidade, equipamentos_alternativos
  ) values (
    v_company_id, p_roteiro_id, p_sequencia, btrim(p_descricao), p_recurso_necessario,
    p_tempo_previsto_minutos, p_requisitos, p_criterios_qualidade, p_equipamentos_alternativos
  ) returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.operacao_roteiro_adicionada', 'roteiro_produtivo', p_roteiro_id, p_descricao,
    jsonb_build_object('roteiro_operacao_id', v_id, 'sequencia', p_sequencia)
  );

  return v_id;
end;
$$;

grant execute on function public.adicionar_operacao_roteiro(uuid, int, text, text, numeric, text, text, text) to authenticated;

create or replace function public.remover_operacao_roteiro(p_roteiro_operacao_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  delete from public.roteiro_operacoes
  where id = p_roteiro_operacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Operação de roteiro não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.operacao_roteiro_removida', 'roteiro_operacao', p_roteiro_operacao_id, null, null);
end;
$$;

grant execute on function public.remover_operacao_roteiro(uuid) to authenticated;

create or replace function public.desativar_roteiro(p_roteiro_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  update public.roteiros_produtivos set ativo = false
  where id = p_roteiro_id and company_id = v_company_id;
  if not found then
    raise exception 'Roteiro não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.roteiro_desativado', 'roteiro_produtivo', p_roteiro_id, null, null);
end;
$$;

grant execute on function public.desativar_roteiro(uuid) to authenticated;

-- =========================================================================
-- 4. criar_ordem_producao() — passa a instanciar op_operacoes a partir do
--    roteiro ativo do item (ou operação única de fallback).
-- =========================================================================

drop function if exists public.criar_ordem_producao(uuid, numeric);

create function public.criar_ordem_producao(p_pedido_item_id uuid, p_quantidade numeric default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_pedido_item public.pedido_itens;
  v_pedido public.pedidos;
  v_ja_planejado numeric;
  v_quantidade numeric;
  v_engenharia_versao_id uuid;
  v_roteiro_id uuid;
  v_roteiro_operacao record;
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

  -- TÓPICO 4 §15 — snapshot do roteiro ativo do item, se houver; senão,
  -- operação única "Produção" (fallback aprovado pelo responsável do
  -- produto, preserva o comportamento anterior pra quem não configurou
  -- roteiro).
  select id into v_roteiro_id from public.roteiros_produtivos
  where item_id = v_pedido_item.item_id and company_id = v_company_id and ativo;

  if v_roteiro_id is not null then
    for v_roteiro_operacao in
      select * from public.roteiro_operacoes where roteiro_id = v_roteiro_id order by sequencia
    loop
      insert into public.op_operacoes (
        company_id, ordem_producao_id, roteiro_operacao_id, sequencia, descricao, recurso_necessario,
        tempo_previsto_minutos, requisitos, criterios_qualidade, equipamentos_alternativos, quantidade_planejada
      ) values (
        v_company_id, v_id, v_roteiro_operacao.id, v_roteiro_operacao.sequencia, v_roteiro_operacao.descricao,
        v_roteiro_operacao.recurso_necessario, v_roteiro_operacao.tempo_previsto_minutos, v_roteiro_operacao.requisitos,
        v_roteiro_operacao.criterios_qualidade, v_roteiro_operacao.equipamentos_alternativos, v_quantidade
      );
    end loop;
  else
    insert into public.op_operacoes (company_id, ordem_producao_id, sequencia, descricao, quantidade_planejada)
    values (v_company_id, v_id, 1, 'Produção', v_quantidade);
  end if;

  perform public.recalcular_situacao_ordem_producao(v_id);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_criada', 'ordem_producao', v_id, v_numero,
    jsonb_build_object(
      'pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id,
      'quantidade_planejada', v_quantidade, 'engenharia_versao_id', v_engenharia_versao_id,
      'roteiro_id', v_roteiro_id
    )
  );

  return v_id;
end;
$$;

grant execute on function public.criar_ordem_producao(uuid, numeric) to authenticated;

-- =========================================================================
-- 5. apontar_producao() — passa a apontar numa operação específica
--    (op_operacao_id), não mais na OP como um todo. Recusa produzir mais
--    do que a operação anterior do roteiro já entregou (§16, fluxo
--    sequencial). ordens_producao.quantidade_produzida/perdida continuam
--    agregadas (última operação / soma de rejeitada), preservando T8 e
--    T9 sem alteração.
-- =========================================================================

drop function if exists public.apontar_producao(uuid, numeric, numeric, text);

create function public.apontar_producao(
  p_op_operacao_id uuid,
  p_quantidade_produzida numeric default 0,
  p_quantidade_rejeitada numeric default 0,
  p_quantidade_retrabalho numeric default 0,
  p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_operacao public.op_operacoes;
  v_operacao_anterior public.op_operacoes;
  v_op public.ordens_producao;
  v_ultima_sequencia int;
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

  select * into v_operacao from public.op_operacoes
  where id = p_op_operacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação de OP não encontrada nesta empresa.';
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

  -- TÓPICO 4 §16: fluxo sequencial do roteiro — esta operação nunca pode
  -- acumular mais produzido do que a operação anterior já entregou.
  if v_operacao.sequencia > 1 then
    select * into v_operacao_anterior from public.op_operacoes
    where ordem_producao_id = v_operacao.ordem_producao_id and sequencia = v_operacao.sequencia - 1;
    if found and v_operacao.quantidade_produzida + v_produzida > v_operacao_anterior.quantidade_produzida then
      raise exception 'Quantidade produzida (%) excederia o que a operação anterior (%) já entregou (%).',
        v_operacao.quantidade_produzida + v_produzida, v_operacao_anterior.descricao, v_operacao_anterior.quantidade_produzida;
    end if;
  end if;

  insert into public.producao_apontamentos (
    company_id, ordem_producao_id, op_operacao_id, quantidade_produzida, quantidade_perdida,
    quantidade_retrabalho, observacao, registrado_por
  ) values (
    v_company_id, v_op.id, p_op_operacao_id, v_produzida, v_rejeitada, v_retrabalho, p_observacao, auth.uid()
  ) returning id into v_id;

  update public.op_operacoes set
    quantidade_produzida = quantidade_produzida + v_produzida,
    quantidade_rejeitada = quantidade_rejeitada + v_rejeitada,
    quantidade_retrabalho = quantidade_retrabalho + v_retrabalho,
    iniciada_em = coalesce(iniciada_em, now()),
    status = case when quantidade_produzida + v_produzida >= quantidade_planejada then 'concluida' else 'em_andamento' end,
    concluida_em = case when quantidade_produzida + v_produzida >= quantidade_planejada then now() else concluida_em end
  where id = p_op_operacao_id;

  select max(sequencia) into v_ultima_sequencia from public.op_operacoes where ordem_producao_id = v_op.id;

  update public.ordens_producao set
    quantidade_produzida = (
      select quantidade_produzida from public.op_operacoes
      where ordem_producao_id = v_op.id and sequencia = v_ultima_sequencia
    ),
    quantidade_perdida = (
      select coalesce(sum(quantidade_rejeitada), 0) from public.op_operacoes where ordem_producao_id = v_op.id
    ),
    status = 'em_producao'
  where id = v_op.id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.apontamento_registrado', 'ordem_producao', v_op.id, p_observacao,
    jsonb_build_object(
      'op_operacao_id', p_op_operacao_id, 'quantidade_produzida', v_produzida,
      'quantidade_rejeitada', v_rejeitada, 'quantidade_retrabalho', v_retrabalho
    )
  );

  return v_id;
end;
$$;

grant execute on function public.apontar_producao(uuid, numeric, numeric, numeric, text) to authenticated;

-- =========================================================================
-- 6. concluir_ordem_producao() — além do critério existente (quantidade
--    produzida >= planejada), agora exige que TODAS as operações do
--    roteiro tenham chegado a 'concluida' (§16: acompanhar cada etapa,
--    não só o total da OP).
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

  select count(*) into v_operacoes_pendentes from public.op_operacoes
  where ordem_producao_id = p_ordem_producao_id and status <> 'concluida';
  if v_operacoes_pendentes > 0 then
    raise exception 'Ainda há % operação(ões) do roteiro não concluída(s) (TÓPICO 4 §16).', v_operacoes_pendentes;
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
