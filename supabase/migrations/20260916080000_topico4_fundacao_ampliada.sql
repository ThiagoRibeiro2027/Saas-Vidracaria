-- TÓPICO 4 — Fase 1 da ampliação de escopo (ADR-002 v2.2, aprovada em
-- 2026-09-16): fundação para o TÓPICO 4 completo, ainda respeitando as
-- exclusões que o próprio TÓPICO 4 reafirma nos §49/§54 (sem IA autônoma,
-- sem otimização matemática/nesting de corte).
--
-- Escopo desta migration (ver plano de implementação faseado):
--   1. `ordens_producao` deixa de ser 1:1 com `pedido_itens` — passa a
--      admitir produção parcial (TÓPICO 4 §11-12): várias OPs para o
--      mesmo item, desde que a soma das quantidades planejadas não
--      ultrapasse `pedido_itens.quantidade` (pode ficar menor —
--      decisão do responsável do produto: saldo ainda não planejado é
--      permitido).
--   2. OP ganha uma situação clara (TÓPICO 4 §3): liberada, liberada
--      com restrição ou bloqueada, com motivo/origem/impacto/ação —
--      substitui o comportamento anterior de simplesmente recusar a
--      criação da OP quando `pedido_bloqueado_por_medicao()` é
--      verdadeiro. A OP passa a nascer bloqueada (em vez de não
--      nascer), e `apontar_producao()`/`concluir_ordem_producao()`
--      recalculam a situação a cada chamada e recusam prosseguir
--      enquanto bloqueada — o bloqueio continua real, só passa a ser
--      visível e reavaliado automaticamente (antes, uma vez confirmada
--      a medição, era preciso tentar criar a OP de novo).
--   3. Marco formal de "Engenharia Liberada" (TÓPICO 4 §4), versionado
--      — carimbo formal (quem liberou, quando, qual versão), sem BOM/
--      conteúdo técnico (não existe modelagem de BOM no projeto ainda;
--      revisitar quando houver).
--   4. `adicionar_item_expedicao()` (TÓPICO 9) precisa acompanhar a
--      mudança de 1:1 para 1:N — hoje pega uma OP arbitrária do item;
--      passa a agregar `quantidade_produzida` de todas as OPs
--      concluídas e aprovadas pela qualidade do mesmo `pedido_item_id`.
--      Sem essa correção, o dia em que existir a 2ª OP de um item, a
--      expedição erra silenciosamente a quantidade disponível.

-- =========================================================================
-- 1. engenharia_versoes (TÓPICO 4 §4) — precisa existir antes do ALTER de
--    ordens_producao (FK).
-- =========================================================================

create table public.engenharia_versoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_item_id uuid not null references public.pedido_itens(id),
  versao int not null check (versao > 0),
  situacao text not null default 'liberada' check (situacao in ('liberada', 'substituida')),
  liberado_por uuid references public.profiles(id),
  liberado_em timestamptz not null default now(),
  motivo_alteracao text,
  observacoes text,
  superseded_by_id uuid references public.engenharia_versoes(id),
  constraint engenharia_versoes_pedido_item_versao_unique unique (pedido_item_id, versao)
);
comment on table public.engenharia_versoes is 'TÓPICO 4 §4 — marco formal de engenharia liberada para produção. Carimbo de versão (quem/quando/motivo), sem BOM/conteúdo técnico: não existe modelagem de BOM no projeto ainda.';
create index engenharia_versoes_pedido_item_id_idx on public.engenharia_versoes (pedido_item_id);
-- No máximo 1 versão "liberada" (vigente) por item — a anterior sempre
-- vira "substituida" antes de uma nova ser criada (ver liberar_engenharia()).
create unique index engenharia_versoes_liberada_unique on public.engenharia_versoes (pedido_item_id) where situacao = 'liberada';

alter table public.engenharia_versoes enable row level security;
create policy engenharia_versoes_select on public.engenharia_versoes for select
  using (company_id = (select public.current_company_id()));
grant select on public.engenharia_versoes to authenticated;

create or replace function public.liberar_engenharia(p_pedido_item_id uuid, p_observacoes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_pedido_item public.pedido_itens;
  v_versao_anterior public.engenharia_versoes;
  v_nova_versao int;
  v_id uuid;
begin
  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_versao_anterior from public.engenharia_versoes
  where pedido_item_id = p_pedido_item_id and situacao = 'liberada'
  for update;

  -- Rebaixa a versão vigente ANTES de inserir a nova: o índice único
  -- parcial (no máx. 1 'liberada' por item) rejeitaria o insert abaixo se
  -- a anterior ainda estivesse 'liberada' no momento da inserção.
  if v_versao_anterior.id is not null then
    update public.engenharia_versoes set situacao = 'substituida' where id = v_versao_anterior.id;
  end if;

  select coalesce(max(versao), 0) + 1 into v_nova_versao
  from public.engenharia_versoes where pedido_item_id = p_pedido_item_id;

  insert into public.engenharia_versoes (
    company_id, pedido_item_id, versao, situacao, liberado_por, liberado_em, motivo_alteracao, observacoes
  ) values (
    v_company_id, p_pedido_item_id, v_nova_versao, 'liberada', auth.uid(), now(),
    case when v_versao_anterior.id is not null then 'Nova versão liberada substituindo a anterior.' else null end,
    p_observacoes
  )
  returning id into v_id;

  if v_versao_anterior.id is not null then
    update public.engenharia_versoes set superseded_by_id = v_id where id = v_versao_anterior.id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.versao_liberada', 'pedido_item', p_pedido_item_id, p_observacoes,
    jsonb_build_object('engenharia_versao_id', v_id, 'versao', v_nova_versao, 'versao_anterior_id', v_versao_anterior.id)
  );

  return v_id;
end;
$$;

grant execute on function public.liberar_engenharia(uuid, text) to authenticated;

-- =========================================================================
-- 2. ordens_producao — remove a exclusividade 1:1 e ganha situação clara.
-- =========================================================================

alter table public.ordens_producao drop constraint ordens_producao_pedido_item_unique;

alter table public.ordens_producao
  add column situacao text not null default 'liberada'
    check (situacao in ('liberada', 'liberada_com_restricao', 'bloqueada')),
  add column motivo_bloqueio text,
  add column origem_bloqueio text,
  add column impacto_bloqueio text,
  add column acao_necessaria text,
  add column engenharia_versao_id uuid references public.engenharia_versoes(id);

comment on column public.ordens_producao.situacao is 'TÓPICO 4 §3 — situação clara da OP (liberada/liberada_com_restricao/bloqueada), reavaliada por recalcular_situacao_ordem_producao() a cada apontamento/conclusão.';

-- =========================================================================
-- 3. recalcular_situacao_ordem_producao() — função interna (sem grant a
--    authenticated: só é chamada de dentro de outras funções SECURITY
--    DEFINER do próprio schema). Hoje só conhece o bloqueio por medida
--    (TÓPICO 5/16 §7) — é o único requisito de liberação do §3 que já
--    existe no sistema; os demais (roteiro definido, recursos definidos
--    etc.) entram nas fases seguintes conforme cada conceito nascer.
-- =========================================================================

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
      impacto_bloqueio = 'Produção não pode iniciar nem prosseguir até a medida ser confirmada (TÓPICO 16 §7).',
      acao_necessaria = 'Confirmar a medição do item em obra (TÓPICO 5).'
    where id = p_ordem_producao_id and situacao <> 'bloqueada';
  elsif v_op.situacao = 'bloqueada' then
    update public.ordens_producao set
      situacao = 'liberada', motivo_bloqueio = null, origem_bloqueio = null,
      impacto_bloqueio = null, acao_necessaria = null
    where id = p_ordem_producao_id;
  end if;
end;
$$;

-- =========================================================================
-- 4. criar_ordem_producao() — revisão: permite OP parcial (p_quantidade
--    opcional, default = saldo restante do item), nasce bloqueada (em vez
--    de recusar a criação) quando há medida não confirmada, grava a
--    versão de engenharia vigente quando houver.
-- =========================================================================

drop function if exists public.criar_ordem_producao(uuid);

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

  perform public.recalcular_situacao_ordem_producao(v_id);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_criada', 'ordem_producao', v_id, v_numero,
    jsonb_build_object(
      'pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id,
      'quantidade_planejada', v_quantidade, 'engenharia_versao_id', v_engenharia_versao_id
    )
  );

  return v_id;
end;
$$;

grant execute on function public.criar_ordem_producao(uuid, numeric) to authenticated;

-- =========================================================================
-- 5. apontar_producao() / concluir_ordem_producao() — recalculam a
--    situação a cada chamada e recusam prosseguir enquanto bloqueada.
--    Migradas também para o helper assert_tenant_write().
-- =========================================================================

create or replace function public.apontar_producao(
  p_ordem_producao_id uuid,
  p_quantidade_produzida numeric default 0,
  p_quantidade_perdida numeric default 0,
  p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_op public.ordens_producao;
  v_id uuid;
begin
  if coalesce(p_quantidade_produzida, 0) < 0 or coalesce(p_quantidade_perdida, 0) < 0 then
    raise exception 'Quantidade produzida e perdida não podem ser negativas.';
  end if;
  if coalesce(p_quantidade_produzida, 0) = 0 and coalesce(p_quantidade_perdida, 0) = 0 then
    raise exception 'Informe quantidade produzida e/ou perdida maior que zero.';
  end if;

  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível apontar produção em OP planejada ou em produção (status atual: %).', v_op.status;
  end if;

  perform public.recalcular_situacao_ordem_producao(p_ordem_producao_id);
  select * into v_op from public.ordens_producao where id = p_ordem_producao_id;
  if v_op.situacao = 'bloqueada' then
    raise exception 'Ordem de produção bloqueada (%): %. Ação necessária: %',
      v_op.origem_bloqueio, v_op.motivo_bloqueio, v_op.acao_necessaria;
  end if;

  insert into public.producao_apontamentos (
    company_id, ordem_producao_id, quantidade_produzida, quantidade_perdida, observacao, registrado_por
  ) values (
    v_company_id, p_ordem_producao_id, coalesce(p_quantidade_produzida, 0), coalesce(p_quantidade_perdida, 0),
    p_observacao, auth.uid()
  ) returning id into v_id;

  update public.ordens_producao set
    quantidade_produzida = quantidade_produzida + coalesce(p_quantidade_produzida, 0),
    quantidade_perdida = quantidade_perdida + coalesce(p_quantidade_perdida, 0),
    status = 'em_producao'
  where id = p_ordem_producao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.apontamento_registrado', 'ordem_producao', p_ordem_producao_id, p_observacao,
    jsonb_build_object('quantidade_produzida', p_quantidade_produzida, 'quantidade_perdida', p_quantidade_perdida)
  );

  return v_id;
end;
$$;

create or replace function public.concluir_ordem_producao(p_ordem_producao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_op public.ordens_producao;
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
-- 6. adicionar_item_expedicao() (TÓPICO 9) — acompanha a mudança de 1:1
--    para 1:N: agrega quantidade_produzida de todas as OPs concluídas e
--    aprovadas pela qualidade do item, em vez de assumir uma única OP.
--    Mantém a ordem de lock já documentada (expedicoes antes de
--    ordens_producao) e a mesma assinatura (nenhuma mudança de RLS/grant).
-- =========================================================================

create or replace function public.adicionar_item_expedicao(
  p_expedicao_id uuid,
  p_pedido_item_id uuid,
  p_quantidade numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('expedicao', 'manage');
  v_expedicao public.expedicoes;
  v_pedido_item public.pedido_itens;
  v_produzido_aprovado numeric;
  v_ja_usado numeric;
  v_disponivel numeric;
  v_id uuid;
begin
  select * into v_expedicao from public.expedicoes
  where id = p_expedicao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Expedição não encontrada nesta empresa.';
  end if;
  if v_expedicao.status <> 'preparando' then
    raise exception 'Só é possível adicionar item com a expedição em preparação (status atual: %).', v_expedicao.status;
  end if;
  if p_quantidade <= 0 then
    raise exception 'Quantidade precisa ser maior que zero.';
  end if;

  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;
  if v_pedido_item.pedido_id <> v_expedicao.pedido_id then
    raise exception 'Este item de pedido não pertence ao pedido desta expedição.';
  end if;

  -- TÓPICO 4 ampliado: um pedido_item pode ter mais de uma OP (produção
  -- parcial). Lock de todas as OPs do item antes de agregar.
  perform 1 from public.ordens_producao
  where pedido_item_id = p_pedido_item_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de pedido ainda não tem ordem de produção — produção não iniciada.';
  end if;

  select coalesce(sum(quantidade_produzida), 0) into v_produzido_aprovado
  from public.ordens_producao
  where pedido_item_id = p_pedido_item_id and company_id = v_company_id
    and status = 'concluida' and status_qualidade = 'aprovado';

  select coalesce(sum(ei.quantidade), 0) into v_ja_usado
  from public.expedicao_itens ei
  join public.expedicoes e on e.id = ei.expedicao_id
  where ei.pedido_item_id = p_pedido_item_id and e.status <> 'cancelada';

  v_disponivel := v_produzido_aprovado - v_ja_usado;
  if p_quantidade > v_disponivel then
    raise exception 'Quantidade solicitada (%) excede o disponível para expedição (%).', p_quantidade, v_disponivel;
  end if;

  insert into public.expedicao_itens (company_id, expedicao_id, pedido_item_id, quantidade)
  values (v_company_id, p_expedicao_id, p_pedido_item_id, p_quantidade)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'expedicao.item_adicionado', 'expedicao', p_expedicao_id, null,
    jsonb_build_object('expedicao_item_id', v_id, 'pedido_item_id', p_pedido_item_id, 'quantidade', p_quantidade)
  );

  return v_id;
end;
$$;
