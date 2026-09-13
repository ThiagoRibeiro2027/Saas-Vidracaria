-- TÓPICO 6 — Estoque, recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO
-- PILOTO v1.0, novembro: "o que a fábrica faz"). Texto exato do recorte
-- (PLANO §4): "T6 — Estoque: saldo, reserva para o pedido, consumo e
-- registro de sobra. Sem inventário completo nem curva avançada."
--
-- O TÓPICO 6 completo é um módulo de almoxarifado inteiro — localização,
-- lote/serial, materiais dimensionais como peças físicas individuais
-- (§5: "16 barras × 6.000mm, 1 sobra × 4.500mm", nunca uma quantidade
-- decimal de barras), motor de compatibilidade/critérios de
-- reaproveitamento de sobra (§6), inventário com segunda contagem e
-- aprovação (§7), integração com Compras. Nada disso entra aqui — o
-- corte é pelo mesmo critério de T2/T15/T10/T3/T5: só o que sustenta o
-- fluxo mínimo do piloto.
--
-- Decisão de modelagem: saldo é ESCALAR (quantidade na unidade_principal
-- do item), não peça física individual. "Sobra" aqui é só mais um tipo de
-- movimentação de entrada (mesmo nível de "Compra"/"Produção" no §3 do
-- spec) que qualquer usuário de Estoque registra quando um material sobra
-- de um corte — não é inferida automaticamente da diferença entre
-- reserva e consumo, nem rastreada como peça individual (SOB-000154 do
-- §4 fica para quando o recorte pedir controle de peça física). Consumir
-- uma reserva sempre baixa o valor total reservado; se sobrou material
-- utilizável, quem consumiu registra a entrada de sobra à parte.
--
-- Sem Compras (T18, M2): a única forma de estabelecer saldo inicial neste
-- recorte é ajustar_saldo(), o mesmo mecanismo usado depois pra correção.
-- "Impedir estoque negativo" (§2) é respeitado (fisica nunca fica < 0);
-- não impede sobra pontual de reservado > físico num ajuste manual
-- incomum — regra não pedida explicitamente pelo recorte.

create table public.estoque_saldos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null references public.itens(id),
  quantidade_fisica numeric(14, 3) not null default 0 check (quantidade_fisica >= 0),
  quantidade_reservada numeric(14, 3) not null default 0 check (quantidade_reservada >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estoque_saldos_company_item_unique unique (company_id, item_id)
);
comment on table public.estoque_saldos is 'TÓPICO 6 §2 — saldo físico e reservado por item. Disponível = quantidade_fisica - quantidade_reservada, calculado na leitura, não armazenado.';

create table public.estoque_reservas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null references public.itens(id),
  pedido_id uuid not null references public.pedidos(id),
  pedido_item_id uuid not null references public.pedido_itens(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  status text not null default 'reservado' check (status in ('reservado', 'liberado', 'consumido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.estoque_reservas is 'TÓPICO 6 §2 — reserva rastreável, reversível e parcial (reserva menos que o necessário quando o disponível não cobre). Ciclo: reservado → liberado, ou reservado → consumido.';
create index estoque_reservas_pedido_item_idx on public.estoque_reservas (pedido_item_id);
-- Índice parcial: toda checagem de "já existe reserva ativa" filtra por
-- status='reservado' — sem isso, reservar_para_pedido_item() faria
-- sequential scan conforme o histórico de reservas cresce.
create index estoque_reservas_ativas_idx on public.estoque_reservas (pedido_item_id) where status = 'reservado';

create table public.estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null references public.itens(id),
  tipo text not null check (tipo in ('ajuste', 'reserva', 'liberacao_reserva', 'consumo', 'entrada_sobra')),
  quantidade numeric(14, 3) not null,
  pedido_id uuid references public.pedidos(id),
  pedido_item_id uuid references public.pedido_itens(id),
  motivo text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint estoque_movimentacoes_quantidade_check check (tipo = 'ajuste' or quantidade > 0)
);
comment on table public.estoque_movimentacoes is 'TÓPICO 6 §3 — ledger append-only de toda alteração de saldo. quantidade é o delta assinado só para tipo=ajuste; para os demais tipos é sempre positiva, o significado vem do tipo. Nunca editado nem apagado (§3: "Reversões... geram movimentos compensatórios").';
create index estoque_movimentacoes_item_id_idx on public.estoque_movimentacoes (item_id);
create index estoque_movimentacoes_pedido_item_idx on public.estoque_movimentacoes (pedido_item_id);

create trigger set_updated_at before update on public.estoque_saldos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.estoque_reservas
  for each row execute function public.set_updated_at();

alter table public.estoque_saldos enable row level security;
alter table public.estoque_reservas enable row level security;
alter table public.estoque_movimentacoes enable row level security;

-- SELECT liberado a qualquer autenticado da empresa, sem exigir
-- estoque.view — mesmo padrão do resto do schema: T4 (Produção), quando
-- existir, vai precisar ler saldo/reserva pra consumir, sem que seu
-- usuário administre Estoque.
create policy estoque_saldos_select on public.estoque_saldos for select
  using (company_id = (select public.current_company_id()));
create policy estoque_reservas_select on public.estoque_reservas for select
  using (company_id = (select public.current_company_id()));
create policy estoque_movimentacoes_select on public.estoque_movimentacoes for select
  using (company_id = (select public.current_company_id()));

grant select on public.estoque_saldos to authenticated;
grant select on public.estoque_reservas to authenticated;
grant select on public.estoque_movimentacoes to authenticated;

-- =========================================================================
-- ajustar_saldo() — único mecanismo de entrada/correção de saldo neste
-- recorte (sem Compras ainda). p_quantidade_delta pode ser positivo ou
-- negativo; nunca deixa quantidade_fisica < 0 (TÓPICO 6 §2).
-- =========================================================================

create or replace function public.ajustar_saldo(
  p_item_id uuid,
  p_quantidade_delta numeric,
  p_motivo text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_saldo public.estoque_saldos;
  v_mov_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('estoque', 'manage') then
    raise exception 'Sem permissão para gerenciar estoque (estoque.manage).';
  end if;
  if p_quantidade_delta is null or p_quantidade_delta = 0 then
    raise exception 'Quantidade do ajuste não pode ser zero.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Motivo do ajuste é obrigatório.';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  insert into public.estoque_saldos (company_id, item_id)
  values (v_company_id, p_item_id)
  on conflict (company_id, item_id) do nothing;

  select * into v_saldo from public.estoque_saldos
  where company_id = v_company_id and item_id = p_item_id
  for update;

  if v_saldo.quantidade_fisica + p_quantidade_delta < 0 then
    raise exception 'Ajuste deixaria o saldo físico negativo (atual: %, ajuste: %).', v_saldo.quantidade_fisica, p_quantidade_delta;
  end if;

  update public.estoque_saldos set quantidade_fisica = quantidade_fisica + p_quantidade_delta
  where id = v_saldo.id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, motivo, created_by)
  values (v_company_id, p_item_id, 'ajuste', p_quantidade_delta, p_motivo, auth.uid())
  returning id into v_mov_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.saldo_ajustado', 'estoque_movimentacao', v_mov_id, p_motivo,
    jsonb_build_object('item_id', p_item_id, 'delta', p_quantidade_delta, 'saldo_fisico_anterior', v_saldo.quantidade_fisica)
  );

  return v_mov_id;
end;
$$;

grant execute on function public.ajustar_saldo(uuid, numeric, text) to authenticated;

-- =========================================================================
-- reservar_para_pedido_item() — reserva parcial quando o disponível não
-- cobre a quantidade do pedido_item (TÓPICO 6 §2). Só a partir de pedido
-- liberado (ADR-002 §6: Liberação → Engenharia → Reserva/Disponibilidade).
-- Retorna a quantidade efetivamente reservada (0 se não havia disponível).
-- =========================================================================

create or replace function public.reservar_para_pedido_item(p_pedido_item_id uuid)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_pedido_item public.pedido_itens;
  v_pedido public.pedidos;
  v_saldo public.estoque_saldos;
  v_disponivel numeric;
  v_reservar numeric;
  v_reserva_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('estoque', 'manage') then
    raise exception 'Sem permissão para gerenciar estoque (estoque.manage).';
  end if;

  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido_item.pedido_id;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível reservar estoque para pedido liberado (status atual: %).', v_pedido.status;
  end if;
  if exists (select 1 from public.estoque_reservas where pedido_item_id = p_pedido_item_id and status = 'reservado') then
    raise exception 'Já existe reserva ativa para este item de pedido — libere antes de reservar de novo.';
  end if;

  insert into public.estoque_saldos (company_id, item_id)
  values (v_company_id, v_pedido_item.item_id)
  on conflict (company_id, item_id) do nothing;

  select * into v_saldo from public.estoque_saldos
  where company_id = v_company_id and item_id = v_pedido_item.item_id
  for update;

  v_disponivel := v_saldo.quantidade_fisica - v_saldo.quantidade_reservada;
  v_reservar := least(v_pedido_item.quantidade, greatest(v_disponivel, 0));

  if v_reservar <= 0 then
    return 0;
  end if;

  insert into public.estoque_reservas (company_id, item_id, pedido_id, pedido_item_id, quantidade)
  values (v_company_id, v_pedido_item.item_id, v_pedido.id, p_pedido_item_id, v_reservar)
  returning id into v_reserva_id;

  update public.estoque_saldos set quantidade_reservada = quantidade_reservada + v_reservar
  where id = v_saldo.id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, pedido_id, pedido_item_id, created_by)
  values (v_company_id, v_pedido_item.item_id, 'reserva', v_reservar, v_pedido.id, p_pedido_item_id, auth.uid());

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.reserva_criada', 'estoque_reserva', v_reserva_id, v_pedido.numero,
    jsonb_build_object(
      'pedido_item_id', p_pedido_item_id, 'quantidade_necessaria', v_pedido_item.quantidade,
      'quantidade_reservada', v_reservar, 'falta', v_pedido_item.quantidade - v_reservar
    )
  );

  return v_reservar;
end;
$$;

grant execute on function public.reservar_para_pedido_item(uuid) to authenticated;

-- =========================================================================
-- liberar_reserva() — reversão (TÓPICO 6 §2: reservas devem ser
-- reversíveis). Não mexe em quantidade_fisica — reserva nunca é saída
-- física.
-- =========================================================================

create or replace function public.liberar_reserva(p_reserva_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_reserva public.estoque_reservas;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('estoque', 'manage') then
    raise exception 'Sem permissão para gerenciar estoque (estoque.manage).';
  end if;

  select * into v_reserva from public.estoque_reservas
  where id = p_reserva_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Reserva não encontrada nesta empresa.';
  end if;
  if v_reserva.status <> 'reservado' then
    raise exception 'Só é possível liberar reserva ativa (status atual: %).', v_reserva.status;
  end if;

  update public.estoque_saldos set quantidade_reservada = quantidade_reservada - v_reserva.quantidade
  where company_id = v_company_id and item_id = v_reserva.item_id;

  update public.estoque_reservas set status = 'liberado' where id = p_reserva_id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, pedido_id, pedido_item_id, created_by)
  values (v_company_id, v_reserva.item_id, 'liberacao_reserva', v_reserva.quantidade, v_reserva.pedido_id, v_reserva.pedido_item_id, auth.uid());

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.reserva_liberada', 'estoque_reserva', p_reserva_id, null,
    jsonb_build_object('item_id', v_reserva.item_id, 'quantidade', v_reserva.quantidade)
  );

  return p_reserva_id;
end;
$$;

grant execute on function public.liberar_reserva(uuid) to authenticated;

-- =========================================================================
-- consumir_reserva() — saída física (TÓPICO 6 §3: consumo de produção).
-- Consome sempre a reserva inteira; sobra de material vira uma entrada de
-- sobra separada (registrar_entrada_sobra), não inferida aqui.
-- =========================================================================

create or replace function public.consumir_reserva(p_reserva_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_reserva public.estoque_reservas;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('estoque', 'manage') then
    raise exception 'Sem permissão para gerenciar estoque (estoque.manage).';
  end if;

  select * into v_reserva from public.estoque_reservas
  where id = p_reserva_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Reserva não encontrada nesta empresa.';
  end if;
  if v_reserva.status <> 'reservado' then
    raise exception 'Só é possível consumir reserva ativa (status atual: %).', v_reserva.status;
  end if;

  update public.estoque_saldos set
    quantidade_fisica = quantidade_fisica - v_reserva.quantidade,
    quantidade_reservada = quantidade_reservada - v_reserva.quantidade
  where company_id = v_company_id and item_id = v_reserva.item_id;

  update public.estoque_reservas set status = 'consumido' where id = p_reserva_id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, pedido_id, pedido_item_id, created_by)
  values (v_company_id, v_reserva.item_id, 'consumo', v_reserva.quantidade, v_reserva.pedido_id, v_reserva.pedido_item_id, auth.uid());

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.reserva_consumida', 'estoque_reserva', p_reserva_id, null,
    jsonb_build_object('item_id', v_reserva.item_id, 'quantidade', v_reserva.quantidade)
  );

  return p_reserva_id;
end;
$$;

grant execute on function public.consumir_reserva(uuid) to authenticated;

-- =========================================================================
-- registrar_entrada_sobra() — TÓPICO 6 §3: "A entrada de Sobra deve
-- possuir movimentação específica denominada: Entrada de Sobra." Ação
-- independente (não derivada de reserva/consumo) — quem gerou o material
-- registra o que sobrou.
-- =========================================================================

create or replace function public.registrar_entrada_sobra(
  p_item_id uuid,
  p_quantidade numeric,
  p_pedido_item_id uuid,
  p_observacao text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_pedido_id uuid;
  v_mov_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('estoque', 'manage') then
    raise exception 'Sem permissão para gerenciar estoque (estoque.manage).';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade da sobra deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  if p_pedido_item_id is not null then
    select pi.pedido_id into v_pedido_id from public.pedido_itens pi
    join public.pedidos p on p.id = pi.pedido_id
    where pi.id = p_pedido_item_id and p.company_id = v_company_id;
    if v_pedido_id is null then
      raise exception 'Item de pedido não encontrado nesta empresa.';
    end if;
  end if;

  insert into public.estoque_saldos (company_id, item_id)
  values (v_company_id, p_item_id)
  on conflict (company_id, item_id) do nothing;

  update public.estoque_saldos set quantidade_fisica = quantidade_fisica + p_quantidade
  where company_id = v_company_id and item_id = p_item_id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, pedido_id, pedido_item_id, motivo, created_by)
  values (v_company_id, p_item_id, 'entrada_sobra', p_quantidade, v_pedido_id, p_pedido_item_id, p_observacao, auth.uid())
  returning id into v_mov_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.sobra_registrada', 'estoque_movimentacao', v_mov_id, p_observacao,
    jsonb_build_object('item_id', p_item_id, 'quantidade', p_quantidade, 'pedido_item_id', p_pedido_item_id)
  );

  return v_mov_id;
end;
$$;

grant execute on function public.registrar_entrada_sobra(uuid, numeric, uuid, text) to authenticated;
