-- Compras completo (T7) — Fase 6 da ADR-011 (docs/ADR-011 — Compras
-- v1.0.md): Pedido de Compra, compras recorrentes e orçado×comprometido
-- ×realizado (TÓPICO 7 §24, §25, §33). Depende da Fase 5 (PC nasce de
-- cotação selecionada e já aprovada pela alçada).
--
-- §25 (compras recorrentes) reaproveita `contratos` (T18, tipo=
-- 'fornecedor') — só a camada de programação de entregas é nova, sem
-- reinventar o conceito de contrato: `vincular_pedido_compra_contrato()`
-- só valida e liga um contrato já vigente; `programar_entrega_pedido_
-- compra()` registra datas/quantidades futuras, chamável quantas vezes
-- forem necessárias (a "recorrência" é o padrão de uso, não uma função
-- geradora de calendário — nenhuma regra de periodicidade está definida
-- em ADR nenhum pra inventar isso agora).
--
-- §33 (orçado×comprometido×realizado) NÃO escreve em `titulos_
-- financeiros` (T11) — essa tabela é estruturalmente só contas a
-- receber (`pedido_id not null references pedidos`, o pedido de
-- VENDA). "Realizado" precisa de contas a PAGAR, que não existe em
-- lugar nenhum do schema — por isso esta fase cria `titulos_pagar` como
-- gêmeo estrutural de `titulos_financeiros` (mesmo padrão: parcelas via
-- jsonb, histórico de pagamento em tabela própria, status aberto→
-- parcial→pago), exatamente como a ADR-011 já previu ("gerar_titulos_
-- pedido_compra() gêmeo"). Continua fora do recorte, herdado de T11: sem
-- plano de contas/centro de custo/conta financeira/juros/multas.
--
-- "categoria" do orçamento reaproveita `itens.classificacao` (T2, já
-- existe, mesmo domínio de texto livre) — não inventa uma taxonomia de
-- categoria de compra nova.

insert into public.numbering_document_types (document_type, resource, action) values
  ('pedido_compra', 'compras', 'manage'),
  ('titulo_compra', 'financeiro', 'manage');

-- Permissão nova (financeiro.pagar) vai em supabase/seed.sql — catálogo de
-- permissões vive lá, não em migration nova (convenção já estabelecida
-- neste projeto desde a Fase A do plano de 23/09/2026).

-- =========================================================================
-- pedidos_compra / pedido_compra_itens / pedido_compra_programacoes
-- =========================================================================

create table public.pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  numero text not null,
  cotacao_id uuid not null references public.cotacoes(id),
  pessoa_id uuid not null references public.pessoas(id),
  contrato_id uuid references public.contratos(id),
  status text not null default 'emitido' check (status in ('emitido', 'confirmado', 'cancelado')),
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedidos_compra_numero_unique unique (company_id, numero)
);
comment on table public.pedidos_compra is 'Fase 6 da ADR-011 (TÓPICO 7 §24) — Pedido de Compra formal, gerado a partir de uma cotação selecionada e já aprovada pela alçada (gerar_pedido_compra_de_cotacao()). Um PC por fornecedor distinto entre as seleções da cotação — nunca multi-fornecedor no mesmo documento.';
create index pedidos_compra_company_id_idx on public.pedidos_compra (company_id);
create index pedidos_compra_cotacao_id_idx on public.pedidos_compra (cotacao_id);

create table public.pedido_compra_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_compra_id uuid not null references public.pedidos_compra(id) on delete cascade,
  cotacao_item_id uuid not null references public.cotacao_itens(id),
  item_id uuid not null references public.itens(id),
  quantidade numeric(14, 4) not null check (quantidade > 0),
  preco_unitario numeric(14, 4) not null check (preco_unitario >= 0),
  custo_unitario numeric(14, 4) not null,
  created_at timestamptz not null default now()
);
create index pedido_compra_itens_company_id_idx on public.pedido_compra_itens (company_id);
create index pedido_compra_itens_pedido_id_idx on public.pedido_compra_itens (pedido_compra_id);

create table public.pedido_compra_programacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_compra_id uuid not null references public.pedidos_compra(id) on delete cascade,
  data_entrega date not null,
  quantidade numeric(14, 4) not null check (quantidade > 0),
  status text not null default 'planejada' check (status in ('planejada', 'entregue', 'cancelada')),
  created_at timestamptz not null default now()
);
comment on table public.pedido_compra_programacoes is 'Fase 6 da ADR-011 (TÓPICO 7 §25) — entregas futuras programadas dentro de um PC, opcionalmente ligado a um contrato de fornecedor (pedidos_compra.contrato_id) pra compra recorrente.';
create index pedido_compra_programacoes_company_id_idx on public.pedido_compra_programacoes (company_id);
create index pedido_compra_programacoes_pedido_id_idx on public.pedido_compra_programacoes (pedido_compra_id);

alter table public.pedidos_compra enable row level security;
create policy pedidos_compra_select on public.pedidos_compra for select using (company_id = (select public.current_company_id()));
grant select on public.pedidos_compra to authenticated;

alter table public.pedido_compra_itens enable row level security;
create policy pedido_compra_itens_select on public.pedido_compra_itens for select using (company_id = (select public.current_company_id()));
grant select on public.pedido_compra_itens to authenticated;

alter table public.pedido_compra_programacoes enable row level security;
create policy pedido_compra_programacoes_select on public.pedido_compra_programacoes for select using (company_id = (select public.current_company_id()));
grant select on public.pedido_compra_programacoes to authenticated;

create trigger set_updated_at before update on public.pedidos_compra
  for each row execute function public.set_updated_at();

-- =========================================================================
-- orcamentos_compra
-- =========================================================================

create table public.orcamentos_compra (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  categoria text not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  valor_orcado numeric(14, 2) not null check (valor_orcado >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orcamentos_compra_unique unique (company_id, categoria, periodo_inicio, periodo_fim),
  constraint orcamentos_compra_periodo_check check (periodo_fim >= periodo_inicio)
);
comment on table public.orcamentos_compra is 'Fase 6 da ADR-011 (TÓPICO 7 §33) — orçado por categoria/período. categoria reaproveita itens.classificacao (T2), sem taxonomia nova. comprometido/realizado são calculados, não armazenados (calcular_orcado_comprometido_realizado()).';
create index orcamentos_compra_company_id_idx on public.orcamentos_compra (company_id);

alter table public.orcamentos_compra enable row level security;
create policy orcamentos_compra_select on public.orcamentos_compra for select using (company_id = (select public.current_company_id()));
grant select on public.orcamentos_compra to authenticated;

create trigger set_updated_at before update on public.orcamentos_compra
  for each row execute function public.set_updated_at();

-- =========================================================================
-- titulos_pagar / pagamentos_titulo_compra — gêmeo estrutural de
-- titulos_financeiros/recebimentos_titulo (T11), pra "realizado" nascer
-- do Financeiro real.
-- =========================================================================

create table public.titulos_pagar (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_compra_id uuid not null references public.pedidos_compra(id),
  numero text not null,
  valor numeric(14, 2) not null check (valor > 0),
  valor_pago numeric(14, 2) not null default 0 check (valor_pago >= 0),
  saldo_pendente numeric(14, 2) generated always as (valor - valor_pago) stored,
  vencimento date not null,
  condicao_pagamento text,
  parcela_numero int not null default 1 check (parcela_numero > 0),
  parcela_total int not null default 1 check (parcela_total > 0),
  status text not null default 'aberto' check (status in ('aberto', 'parcial', 'pago', 'cancelado')),
  observacoes text,
  motivo_cancelamento text,
  criado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titulos_pagar_company_numero_unique unique (company_id, numero),
  constraint titulos_pagar_pago_check check (valor_pago <= valor)
);
comment on table public.titulos_pagar is 'Fase 6 da ADR-011 (TÓPICO 7 §33) — título a pagar vinculado a pedido de compra, gerado via gerar_titulos_pedido_compra() (mesmo padrão de gerar_titulos_pedido(), T11). Sem plano de contas/centro de custo/conta financeira/juros/multas — mesmo recorte herdado de titulos_financeiros.';
create index titulos_pagar_pedido_compra_id_idx on public.titulos_pagar (pedido_compra_id);
create index titulos_pagar_status_idx on public.titulos_pagar (status);

create table public.pagamentos_titulo_compra (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  titulo_id uuid not null references public.titulos_pagar(id) on delete cascade,
  valor numeric(14, 2) not null check (valor > 0),
  data_pagamento date not null default current_date,
  registrado_por uuid not null references public.profiles(id),
  registrado_em timestamptz not null default now()
);
create index pagamentos_titulo_compra_titulo_id_idx on public.pagamentos_titulo_compra (titulo_id);

alter table public.titulos_pagar enable row level security;
create policy titulos_pagar_select on public.titulos_pagar for select using (company_id = (select public.current_company_id()));
grant select on public.titulos_pagar to authenticated;

alter table public.pagamentos_titulo_compra enable row level security;
create policy pagamentos_titulo_compra_select on public.pagamentos_titulo_compra for select using (company_id = (select public.current_company_id()));
grant select on public.pagamentos_titulo_compra to authenticated;

create trigger set_updated_at before update on public.titulos_pagar
  for each row execute function public.set_updated_at();

-- =========================================================================
-- gerar_pedido_compra_de_cotacao() — TÓPICO 7 §24. Só a partir de
-- cotação selecionada com alçada já aprovada; um PC por fornecedor
-- distinto entre as seleções.
-- =========================================================================

create function public.gerar_pedido_compra_de_cotacao(p_cotacao_id uuid)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_cotacao public.cotacoes;
  v_aprovacao public.compras_aprovacoes;
  v_pessoa_id uuid;
  v_pc_id uuid;
  v_numero text;
  v_ids uuid[] := '{}';
begin
  select * into v_cotacao from public.cotacoes where id = p_cotacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Cotação não encontrada nesta empresa.';
  end if;
  if v_cotacao.status <> 'selecionada' then
    raise exception 'Só é possível gerar pedido de compra de uma cotação selecionada (status atual: %).', v_cotacao.status;
  end if;
  if v_cotacao.aprovacao_id is null then
    raise exception 'Cotação sem aprovação vinculada.';
  end if;
  select * into v_aprovacao from public.compras_aprovacoes where id = v_cotacao.aprovacao_id;
  if v_aprovacao.status <> 'aprovada' then
    raise exception 'Cotação ainda não aprovada pela alçada (status atual: %).', v_aprovacao.status;
  end if;
  if exists (select 1 from public.pedidos_compra where cotacao_id = p_cotacao_id) then
    raise exception 'Já existe pedido de compra gerado para esta cotação.';
  end if;

  for v_pessoa_id in
    select distinct cp.pessoa_id
    from public.cotacao_selecoes cs
    join public.cotacao_propostas cp on cp.id = cs.cotacao_proposta_id
    join public.cotacao_itens ci on ci.id = cs.cotacao_item_id
    where ci.cotacao_id = p_cotacao_id
  loop
    v_numero := public.next_document_number('pedido_compra');
    insert into public.pedidos_compra (company_id, numero, cotacao_id, pessoa_id)
    values (v_company_id, v_numero, p_cotacao_id, v_pessoa_id)
    returning id into v_pc_id;

    insert into public.pedido_compra_itens (company_id, pedido_compra_id, cotacao_item_id, item_id, quantidade, preco_unitario, custo_unitario)
    select v_company_id, v_pc_id, cs.cotacao_item_id, sci.item_id, cs.quantidade, cp.preco_unitario, cp.custo_unitario
    from public.cotacao_selecoes cs
    join public.cotacao_propostas cp on cp.id = cs.cotacao_proposta_id
    join public.cotacao_itens ci on ci.id = cs.cotacao_item_id
    join public.solicitacao_compra_itens sci on sci.id = ci.solicitacao_compra_item_id
    where ci.cotacao_id = p_cotacao_id and cp.pessoa_id = v_pessoa_id;

    v_ids := v_ids || v_pc_id;

    insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
    values (v_company_id, auth.uid(), 'compras.pedido_compra_gerado', 'pedido_compra', v_pc_id, v_numero);
  end loop;

  return v_ids;
end;
$$;

grant execute on function public.gerar_pedido_compra_de_cotacao(uuid) to authenticated;

create function public.atualizar_status_pedido_compra(p_id uuid, p_status text, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_pc public.pedidos_compra;
  v_valido boolean := false;
begin
  select * into v_pc from public.pedidos_compra where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Pedido de compra não encontrado nesta empresa.';
  end if;
  if p_status not in ('confirmado', 'cancelado') then
    raise exception 'Status inválido: "%".', p_status;
  end if;

  if v_pc.status = 'emitido' and p_status in ('confirmado', 'cancelado') then
    v_valido := true;
  elsif v_pc.status = 'confirmado' and p_status = 'cancelado' then
    v_valido := true;
  end if;
  if not v_valido then
    raise exception 'Transição de status inválida: % -> %.', v_pc.status, p_status;
  end if;

  update public.pedidos_compra
  set status = p_status,
      motivo_cancelamento = case when p_status = 'cancelado' then p_motivo else motivo_cancelamento end
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.pedido_compra_status_atualizado', 'pedido_compra', p_id, p_status);

  return p_id;
end;
$$;

grant execute on function public.atualizar_status_pedido_compra(uuid, text, text) to authenticated;

create function public.vincular_pedido_compra_contrato(p_pedido_compra_id uuid, p_contrato_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_pc public.pedidos_compra;
  v_contrato public.contratos;
begin
  select * into v_pc from public.pedidos_compra where id = p_pedido_compra_id and company_id = v_company_id;
  if not found then
    raise exception 'Pedido de compra não encontrado nesta empresa.';
  end if;
  select * into v_contrato from public.contratos where id = p_contrato_id and company_id = v_company_id;
  if not found then
    raise exception 'Contrato não encontrado nesta empresa.';
  end if;
  if v_contrato.tipo <> 'fornecedor' then
    raise exception 'Só é possível vincular contrato do tipo fornecedor.';
  end if;
  if v_contrato.pessoa_id is distinct from v_pc.pessoa_id then
    raise exception 'O contrato precisa ser do mesmo fornecedor do pedido de compra.';
  end if;
  if v_contrato.status <> 'vigente' then
    raise exception 'Só é possível vincular contrato vigente (status atual: %).', v_contrato.status;
  end if;

  update public.pedidos_compra set contrato_id = p_contrato_id where id = p_pedido_compra_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.pedido_compra_vinculado_contrato', 'pedido_compra', p_pedido_compra_id, v_contrato.numero);

  return p_pedido_compra_id;
end;
$$;

grant execute on function public.vincular_pedido_compra_contrato(uuid, uuid) to authenticated;

create function public.programar_entrega_pedido_compra(p_pedido_compra_id uuid, p_data_entrega date, p_quantidade numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_pc public.pedidos_compra;
  v_total_itens numeric;
  v_total_programado numeric;
  v_id uuid;
begin
  select * into v_pc from public.pedidos_compra where id = p_pedido_compra_id and company_id = v_company_id;
  if not found then
    raise exception 'Pedido de compra não encontrado nesta empresa.';
  end if;
  if v_pc.status = 'cancelado' then
    raise exception 'Não é possível programar entrega de pedido de compra cancelado.';
  end if;
  if p_data_entrega is null then
    raise exception 'Data de entrega é obrigatória.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select coalesce(sum(quantidade), 0) into v_total_itens from public.pedido_compra_itens where pedido_compra_id = p_pedido_compra_id;
  select coalesce(sum(quantidade), 0) into v_total_programado from public.pedido_compra_programacoes
    where pedido_compra_id = p_pedido_compra_id and status <> 'cancelada';
  if v_total_programado + p_quantidade > v_total_itens then
    raise exception 'Quantidade programada (%) excederia o total do pedido de compra (%).', v_total_programado + p_quantidade, v_total_itens;
  end if;

  insert into public.pedido_compra_programacoes (company_id, pedido_compra_id, data_entrega, quantidade)
  values (v_company_id, p_pedido_compra_id, p_data_entrega, p_quantidade)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.entrega_programada', 'pedido_compra', p_pedido_compra_id, null);

  return v_id;
end;
$$;

grant execute on function public.programar_entrega_pedido_compra(uuid, date, numeric) to authenticated;

-- =========================================================================
-- upsert_orcamento_compra() / calcular_orcado_comprometido_realizado()
-- — TÓPICO 7 §33.
-- =========================================================================

create function public.upsert_orcamento_compra(p_categoria text, p_periodo_inicio date, p_periodo_fim date, p_valor_orcado numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_id uuid;
begin
  if p_categoria is null or btrim(p_categoria) = '' then
    raise exception 'Categoria é obrigatória.';
  end if;
  if p_periodo_inicio is null or p_periodo_fim is null or p_periodo_fim < p_periodo_inicio then
    raise exception 'Período inválido.';
  end if;
  if p_valor_orcado is null or p_valor_orcado < 0 then
    raise exception 'Valor orçado inválido.';
  end if;

  insert into public.orcamentos_compra (company_id, categoria, periodo_inicio, periodo_fim, valor_orcado)
  values (v_company_id, p_categoria, p_periodo_inicio, p_periodo_fim, p_valor_orcado)
  on conflict (company_id, categoria, periodo_inicio, periodo_fim) do update set
    valor_orcado = excluded.valor_orcado, updated_at = now()
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.orcamento_definido', 'orcamento_compra', v_id, p_categoria);

  return v_id;
end;
$$;

grant execute on function public.upsert_orcamento_compra(text, date, date, numeric) to authenticated;

create function public.calcular_orcado_comprometido_realizado(p_categoria text, p_periodo_inicio date, p_periodo_fim date)
returns table (orcado numeric, comprometido numeric, realizado numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('compras', 'view') then
    raise exception 'Sem permissão para consultar compras (compras.view).';
  end if;

  return query
  select
    coalesce((
      select sum(oc.valor_orcado) from public.orcamentos_compra oc
      where oc.company_id = v_company_id and oc.categoria = p_categoria
        and oc.periodo_inicio >= p_periodo_inicio and oc.periodo_fim <= p_periodo_fim
    ), 0) as orcado,
    coalesce((
      select sum(pci.preco_unitario * pci.quantidade)
      from public.pedido_compra_itens pci
      join public.pedidos_compra pc on pc.id = pci.pedido_compra_id
      join public.itens i on i.id = pci.item_id
      where pc.company_id = v_company_id and pc.status in ('emitido', 'confirmado')
        and i.classificacao = p_categoria
        and pc.created_at::date between p_periodo_inicio and p_periodo_fim
    ), 0) as comprometido,
    coalesce((
      select sum(tp.valor_pago)
      from public.titulos_pagar tp
      join public.pedidos_compra pc on pc.id = tp.pedido_compra_id
      where pc.company_id = v_company_id
        and tp.vencimento between p_periodo_inicio and p_periodo_fim
        and exists (
          select 1 from public.pedido_compra_itens pci
          join public.itens i on i.id = pci.item_id
          where pci.pedido_compra_id = pc.id and i.classificacao = p_categoria
        )
    ), 0) as realizado;
end;
$$;

grant execute on function public.calcular_orcado_comprometido_realizado(text, date, date) to authenticated;

-- =========================================================================
-- gerar_titulos_pedido_compra() / registrar_pagamento_titulo_compra() —
-- gêmeos de gerar_titulos_pedido()/registrar_recebimento_titulo() (T11).
-- Gate financeiro.manage/financeiro.pagar — título a pagar continua
-- autoridade do Financeiro, mesmo referenciando pedido_compra.
-- =========================================================================

create function public.gerar_titulos_pedido_compra(p_pedido_compra_id uuid, p_parcelas jsonb)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_pc public.pedidos_compra;
  v_valor_pc numeric;
  v_soma_parcelas numeric := 0;
  v_total_parcelas int;
  v_parcela jsonb;
  v_indice int := 0;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_numero text;
begin
  select * into v_pc from public.pedidos_compra where id = p_pedido_compra_id and company_id = v_company_id for update;
  if not found then
    raise exception 'Pedido de compra não encontrado nesta empresa.';
  end if;
  if v_pc.status = 'cancelado' then
    raise exception 'Não é possível gerar título para pedido de compra cancelado.';
  end if;
  if exists (select 1 from public.titulos_pagar where pedido_compra_id = p_pedido_compra_id) then
    raise exception 'Este pedido de compra já tem título a pagar gerado.';
  end if;

  if jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then
    raise exception 'Informe ao menos uma parcela.';
  end if;
  v_total_parcelas := jsonb_array_length(p_parcelas);

  select coalesce(sum(preco_unitario * quantidade), 0) into v_valor_pc from public.pedido_compra_itens where pedido_compra_id = p_pedido_compra_id;

  for v_parcela in select * from jsonb_array_elements(p_parcelas) loop
    v_soma_parcelas := v_soma_parcelas + (v_parcela->>'valor')::numeric;
  end loop;
  if v_soma_parcelas <> v_valor_pc then
    raise exception 'Soma das parcelas (%) precisa ser igual ao valor do pedido de compra (%).', v_soma_parcelas, v_valor_pc;
  end if;

  for v_parcela in select * from jsonb_array_elements(p_parcelas) loop
    v_indice := v_indice + 1;
    if (v_parcela->>'valor')::numeric <= 0 then
      raise exception 'Parcela % com valor inválido.', v_indice;
    end if;
    if (v_parcela->>'vencimento') is null then
      raise exception 'Parcela % sem vencimento.', v_indice;
    end if;

    v_numero := public.next_document_number('titulo_compra');

    insert into public.titulos_pagar (
      company_id, pedido_compra_id, numero, valor, vencimento, condicao_pagamento,
      parcela_numero, parcela_total, criado_por
    ) values (
      v_company_id, p_pedido_compra_id, v_numero, (v_parcela->>'valor')::numeric, (v_parcela->>'vencimento')::date,
      v_parcela->>'condicao_pagamento', v_indice, v_total_parcelas, auth.uid()
    )
    returning id into v_id;

    v_ids := v_ids || v_id;
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'financeiro.titulos_pagar_gerados', 'pedido_compra', p_pedido_compra_id, null,
    jsonb_build_object('quantidade_titulos', v_total_parcelas, 'valor_total', v_valor_pc)
  );

  return v_ids;
end;
$$;

grant execute on function public.gerar_titulos_pedido_compra(uuid, jsonb) to authenticated;

create function public.registrar_pagamento_titulo_compra(p_titulo_id uuid, p_valor numeric, p_data_pagamento date default current_date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'pagar');
  v_titulo public.titulos_pagar;
  v_id uuid;
  v_novo_pago numeric;
  -- coalesce, não só o default do parâmetro: uma Server Action que envia
  -- null explícito (campo de data em branco) ignora o default da
  -- assinatura — mesmo cuidado já registrado em registrar_recebimento_
  -- titulo() (T11).
  v_data_pagamento date := coalesce(p_data_pagamento, current_date);
begin
  select * into v_titulo from public.titulos_pagar where id = p_titulo_id and company_id = v_company_id for update;
  if not found then
    raise exception 'Título a pagar não encontrado nesta empresa.';
  end if;
  if v_titulo.status not in ('aberto', 'parcial') then
    raise exception 'Só é possível registrar pagamento em título aberto ou parcial (status atual: %).', v_titulo.status;
  end if;
  if p_valor <= 0 then
    raise exception 'Valor pago precisa ser maior que zero.';
  end if;

  v_novo_pago := v_titulo.valor_pago + p_valor;
  if v_novo_pago > v_titulo.valor then
    raise exception 'Valor pago (%) excederia o valor do título (%, saldo pendente %).',
      v_novo_pago, v_titulo.valor, v_titulo.valor - v_titulo.valor_pago;
  end if;

  insert into public.pagamentos_titulo_compra (company_id, titulo_id, valor, data_pagamento, registrado_por)
  values (v_company_id, p_titulo_id, p_valor, v_data_pagamento, auth.uid())
  returning id into v_id;

  update public.titulos_pagar
  set valor_pago = v_novo_pago,
      status = case when v_novo_pago >= valor then 'pago' else 'parcial' end,
      updated_at = now()
  where id = p_titulo_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'financeiro.pagamento_titulo_compra_registrado', 'titulo_pagar', p_titulo_id, null,
    jsonb_build_object('valor', p_valor, 'novo_total_pago', v_novo_pago)
  );

  return v_id;
end;
$$;

grant execute on function public.registrar_pagamento_titulo_compra(uuid, numeric, date) to authenticated;
