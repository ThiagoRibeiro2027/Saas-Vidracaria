-- Compras completo (T7) — Fase 7 da ADR-011 (docs/ADR-011 — Compras
-- v1.0.md): Recebimento completo, conferência/qualidade, lote, divergência,
-- devolução (TÓPICO 7 §26 a §31, §36). Depende da Fase 6 (recebe contra um
-- pedido_compra já emitido) e da Fase 2 (peça física dimensional, quando o
-- item for desse tipo — entrada em estoque continua passando por
-- ajustar_saldo(), que já trata escalar vs. dimensional).
--
-- CORREÇÃO DE PREMISSA (achado durante a pesquisa desta fase, não do plano
-- original): o plano aprovado presumia que §28 (conferência/qualidade)
-- "reaproveita inspecoes_qualidade/nao_conformidades (T8)". Isso está
-- errado — as duas tabelas de T8 têm `ordem_producao_id uuid not null
-- references ordens_producao(id)` (FK obrigatória a OP de Produção) e
-- `nao_conformidades.disposicao` é limitado por CHECK só a 'retrabalho'
-- (comentário da própria tabela: "sucata/concessão/devolução são Release
-- 1... ADR-002 §4.13 não as lista"). T8 é estruturalmente incompatível com
-- Recebimento — não tem OP nenhuma, e devolução é justamente o que T8
-- explicitamente não suporta. Esta fase segue o mesmo padrão de "gêmeo
-- estrutural" já usado na Fase 6 (titulos_pagar/titulos_financeiros):
-- cria tabelas NOVAS e próprias de Recebimento (divergencias_recebimento),
-- espelhando o espírito insert-only/nunca sobrescrever de T8, sem tocar ou
-- reaproveitar as tabelas de T8.
--
-- §26 (estoque em trânsito): os estados "comprado" (pedidos_compra.status
-- emitido/confirmado), "recebido"/"conferência"/"quarentena"
-- (recebimento_itens.status) e "disponível para consumo" (o instante em
-- que finalizar_conferencia_recebimento() chama ajustar_saldo()) já
-- cobrem a exigência — "compra não significa estoque disponível" é
-- garantido porque NENHUMA função de recebimento chama ajustar_saldo()
-- antes de finalizar_conferencia_recebimento().
--
-- §27 reaproveita ajustar_saldo() (T6) literalmente: ganha um 4º parâmetro
-- opcional p_tipo (default 'ajuste', 100% compatível com todo chamador
-- existente que passa só 3 argumentos posicionais — registrar_recebimento_
-- necessidade() do recebimento leve continua funcionando sem mudança).
-- estoque_movimentacoes.tipo ganha 'compra'/'devolucao'; mesmo padrão de
-- duplo gate (compras.manage explícito nesta fase + estoque.manage
-- embutido em ajustar_saldo(), nunca contornado) já provado em
-- registrar_recebimento_necessidade().
--
-- §31 (devolução): decisão de modelagem — rejeitar ANTES de aceitar
-- (mercadoria nunca chega a entrar no estoque: divergência tratada com
-- decisao='recusar', reduz quantidade_aceita em finalizar_conferencia_
-- recebimento) é uma ação diferente de devolver DEPOIS de já aceito
-- (mercadoria já entrou no estoque via 'compra', sai de novo via
-- registrar_devolucao_compra() com tipo='devolucao' — só permitida sobre
-- item já conferido). Isso evita um par compra+devolução artificial pra
-- mercadoria que nunca foi de fato aceita.
--
-- §36 (documentos): reaproveita files/register_file (Storage e Arquivos,
-- já genérico — p_entity_type/p_entity_id). Nenhuma tabela de anexo nova.
-- Nenhum módulo do sistema ainda tem UI de upload própria (só o cron de
-- reconciliação usa Storage hoje) — esta fase não inventa uma agora;
-- fica pra quando o produto pedir upload de arquivo em algum módulo.

insert into public.numbering_document_types (document_type, resource, action) values
  ('recebimento_compra', 'compras', 'manage');

-- =========================================================================
-- ajustar_saldo() — ganha p_tipo novo (default 'ajuste'). Acrescentar um
-- parâmetro muda a assinatura (uuid, numeric, text) para (uuid, numeric,
-- text, text) — CREATE OR REPLACE sozinho criaria uma SEGUNDA função
-- (overload), não substituiria a existente, e uma chamada com só 3
-- argumentos posicionais (todo chamador já existente, ex.: registrar_
-- recebimento_necessidade()) ficaria ambígua entre as duas. Precisa
-- derrubar a assinatura de 3 argumentos primeiro.
-- =========================================================================

alter table public.estoque_movimentacoes
  drop constraint estoque_movimentacoes_tipo_check;
alter table public.estoque_movimentacoes
  add constraint estoque_movimentacoes_tipo_check
  check (tipo in ('ajuste', 'reserva', 'liberacao_reserva', 'consumo', 'entrada_sobra', 'compra', 'devolucao'));

drop function public.ajustar_saldo(uuid, numeric, text);

create function public.ajustar_saldo(
  p_item_id uuid,
  p_quantidade_delta numeric,
  p_motivo text,
  p_tipo text default 'ajuste'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_saldo public.estoque_saldos;
  v_mov_id uuid;
begin
  if p_tipo not in ('ajuste', 'compra', 'devolucao') then
    raise exception 'Tipo de movimentação inválido para ajustar_saldo(): "%".', p_tipo;
  end if;
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('estoque', 'manage') then
    raise exception 'Sem permissão para gerenciar estoque (estoque.manage).';
  end if;
  if p_quantidade_delta is null or p_quantidade_delta = 0 then
    raise exception 'Quantidade do ajuste não pode ser zero.';
  end if;
  if p_tipo = 'compra' and p_quantidade_delta < 0 then
    raise exception 'Recebimento de compra não pode reduzir o saldo.';
  end if;
  if p_tipo = 'devolucao' and p_quantidade_delta > 0 then
    raise exception 'Devolução não pode aumentar o saldo.';
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
  values (
    v_company_id, p_item_id, p_tipo,
    case when p_tipo = 'ajuste' then p_quantidade_delta else abs(p_quantidade_delta) end,
    p_motivo, auth.uid()
  )
  returning id into v_mov_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.saldo_ajustado', 'estoque_movimentacao', v_mov_id, p_motivo,
    jsonb_build_object('item_id', p_item_id, 'delta', p_quantidade_delta, 'tipo', p_tipo, 'saldo_fisico_anterior', v_saldo.quantidade_fisica)
  );

  return v_mov_id;
end;
$$;

grant execute on function public.ajustar_saldo(uuid, numeric, text, text) to authenticated;

-- =========================================================================
-- recebimentos_pedido_compra / recebimento_itens — cabeçalho e item de um
-- evento de recebimento contra um pedido_compra. Um PC pode ter vários
-- recebimentos (parcial/múltiplo, §27). Nenhuma entrada física de estoque
-- acontece aqui — só em finalizar_conferencia_recebimento().
-- =========================================================================

create table public.recebimentos_pedido_compra (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_compra_id uuid not null references public.pedidos_compra(id),
  numero text not null,
  numero_nf text,
  transportadora text,
  data_recebimento date not null default current_date,
  status text not null default 'em_conferencia' check (status in ('em_conferencia', 'conferido', 'cancelado')),
  observacoes text,
  recebido_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recebimentos_pedido_compra_numero_unique unique (company_id, numero)
);
comment on table public.recebimentos_pedido_compra is 'Fase 7 da ADR-011 (TÓPICO 7 §27) — evento de recebimento contra um pedido de compra. em_conferencia: recebido fisicamente, ainda sem entrada de estoque (§26 "compra não significa estoque disponível"); conferido: finalizar_conferencia_recebimento() já rodou, entrada de estoque já ocorreu para os itens aceitos.';
create index recebimentos_pedido_compra_company_id_idx on public.recebimentos_pedido_compra (company_id);
create index recebimentos_pedido_compra_pedido_id_idx on public.recebimentos_pedido_compra (pedido_compra_id);

create table public.recebimento_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  recebimento_id uuid not null references public.recebimentos_pedido_compra(id) on delete cascade,
  pedido_compra_item_id uuid not null references public.pedido_compra_itens(id),
  item_id uuid not null references public.itens(id),
  quantidade_recebida numeric(14, 4) not null check (quantidade_recebida > 0),
  quantidade_aceita numeric(14, 4),
  status text not null default 'pendente' check (status in ('pendente', 'quarentena', 'conferido')),
  created_at timestamptz not null default now()
);
comment on table public.recebimento_itens is 'Fase 7 da ADR-011 — item recebido nesta conferência. quantidade_aceita só é preenchida por finalizar_conferencia_recebimento() (quantidade_recebida menos o que foi recusado por divergência tratada). status=quarentena enquanto houver divergência de qualidade aberta (§28).';
create index recebimento_itens_company_id_idx on public.recebimento_itens (company_id);
create index recebimento_itens_recebimento_id_idx on public.recebimento_itens (recebimento_id);
create index recebimento_itens_pedido_compra_item_id_idx on public.recebimento_itens (pedido_compra_item_id);

alter table public.recebimentos_pedido_compra enable row level security;
create policy recebimentos_pedido_compra_select on public.recebimentos_pedido_compra for select
  using (company_id = (select public.current_company_id()));
grant select on public.recebimentos_pedido_compra to authenticated;

alter table public.recebimento_itens enable row level security;
create policy recebimento_itens_select on public.recebimento_itens for select
  using (company_id = (select public.current_company_id()));
grant select on public.recebimento_itens to authenticated;

create trigger set_updated_at before update on public.recebimentos_pedido_compra
  for each row execute function public.set_updated_at();

-- =========================================================================
-- lotes_recebimento — TÓPICO 7 §29. Opcional (só quando aplicável), pode
-- haver mais de um lote por item recebido (split de lote).
-- =========================================================================

create table public.lotes_recebimento (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  recebimento_item_id uuid not null references public.recebimento_itens(id) on delete cascade,
  numero_lote text not null,
  quantidade numeric(14, 4) not null check (quantidade > 0),
  data_fabricacao date,
  data_validade date,
  certificado text,
  created_at timestamptz not null default now()
);
comment on table public.lotes_recebimento is 'Fase 7 da ADR-011 (TÓPICO 7 §29) — lote/fabricação/validade/certificado de um item recebido, quando aplicável. Soma das quantidades de lote de um recebimento_item não pode exceder quantidade_recebida (checado em registrar_lote_recebimento()).';
create index lotes_recebimento_company_id_idx on public.lotes_recebimento (company_id);
create index lotes_recebimento_recebimento_item_id_idx on public.lotes_recebimento (recebimento_item_id);

alter table public.lotes_recebimento enable row level security;
create policy lotes_recebimento_select on public.lotes_recebimento for select
  using (company_id = (select public.current_company_id()));
grant select on public.lotes_recebimento to authenticated;

-- =========================================================================
-- divergencias_recebimento — TÓPICO 7 §30. decisao: 'aceitar' (mantém
-- quantidade_recebida integral) ou 'recusar' (reduz quantidade_aceita em
-- finalizar_conferencia_recebimento() — mercadoria nunca entra no
-- estoque). Devolução de mercadoria JÁ aceita é uma ação separada
-- (registrar_devolucao_compra(), não uma decisão de divergência).
-- =========================================================================

create table public.divergencias_recebimento (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  recebimento_item_id uuid not null references public.recebimento_itens(id),
  tipo text not null check (tipo in ('quantidade_menor', 'quantidade_maior', 'avaria', 'qualidade', 'documentacao', 'atraso', 'outra')),
  quantidade_divergente numeric(14, 4) check (quantidade_divergente >= 0),
  descricao text not null,
  status text not null default 'aberta' check (status in ('aberta', 'tratada')),
  decisao text check (decisao in ('aceitar', 'recusar')),
  decisao_observacao text,
  registrado_por uuid not null references public.profiles(id),
  tratado_por uuid references public.profiles(id),
  tratado_em timestamptz,
  created_at timestamptz not null default now(),
  constraint divergencias_recebimento_status_decisao_check check (
    (status = 'aberta' and decisao is null) or (status = 'tratada' and decisao is not null)
  )
);
comment on table public.divergencias_recebimento is 'Fase 7 da ADR-011 (TÓPICO 7 §30) — divergência registrada contra um item recebido. finalizar_conferencia_recebimento() bloqueia enquanto houver divergência aberta para qualquer item do recebimento.';
create index divergencias_recebimento_company_id_idx on public.divergencias_recebimento (company_id);
create index divergencias_recebimento_item_id_idx on public.divergencias_recebimento (recebimento_item_id);

alter table public.divergencias_recebimento enable row level security;
create policy divergencias_recebimento_select on public.divergencias_recebimento for select
  using (company_id = (select public.current_company_id()));
grant select on public.divergencias_recebimento to authenticated;

-- =========================================================================
-- devolucoes_compra — TÓPICO 7 §31. Só sobre item já conferido (já entrou
-- em estoque via 'compra') — devolução é sempre uma saída explícita,
-- nunca uma reversão silenciosa da entrada.
-- =========================================================================

create table public.devolucoes_compra (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  recebimento_item_id uuid not null references public.recebimento_itens(id),
  divergencia_id uuid references public.divergencias_recebimento(id),
  quantidade numeric(14, 4) not null check (quantidade > 0),
  motivo text not null,
  status text not null default 'registrada' check (status in ('registrada', 'cancelada')),
  registrado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
comment on table public.devolucoes_compra is 'Fase 7 da ADR-011 (TÓPICO 7 §31) — devolução ao fornecedor de material já aceito no estoque. divergencia_id é opcional (devolução pode nascer de uma divergência tratada ou ser registrada depois, direto).';
create index devolucoes_compra_company_id_idx on public.devolucoes_compra (company_id);
create index devolucoes_compra_item_id_idx on public.devolucoes_compra (recebimento_item_id);

alter table public.devolucoes_compra enable row level security;
create policy devolucoes_compra_select on public.devolucoes_compra for select
  using (company_id = (select public.current_company_id()));
grant select on public.devolucoes_compra to authenticated;

-- =========================================================================
-- registrar_recebimento_pedido_compra() — cabeçalho + itens de um evento
-- de recebimento. Aceita parcial/múltiplo: soma de quantidade_recebida
-- entre todos os recebimentos de um mesmo pedido_compra_item não pode
-- exceder pedido_compra_itens.quantidade.
-- =========================================================================

create function public.registrar_recebimento_pedido_compra(
  p_pedido_compra_id uuid,
  p_itens jsonb,
  p_numero_nf text default null,
  p_transportadora text default null,
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_pc public.pedidos_compra;
  v_numero text;
  v_recebimento_id uuid;
  v_item jsonb;
  v_pci public.pedido_compra_itens;
  v_ja_recebido numeric;
  v_qtd numeric;
begin
  select * into v_pc from public.pedidos_compra where id = p_pedido_compra_id and company_id = v_company_id;
  if not found then
    raise exception 'Pedido de compra não encontrado nesta empresa.';
  end if;
  if v_pc.status = 'cancelado' then
    raise exception 'Não é possível registrar recebimento de pedido de compra cancelado.';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item recebido.';
  end if;

  v_numero := public.next_document_number('recebimento_compra');

  insert into public.recebimentos_pedido_compra (
    company_id, pedido_compra_id, numero, numero_nf, transportadora, observacoes, recebido_por
  ) values (
    v_company_id, p_pedido_compra_id, v_numero, p_numero_nf, p_transportadora, p_observacoes, auth.uid()
  )
  returning id into v_recebimento_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_pci from public.pedido_compra_itens
    where id = (v_item->>'pedido_compra_item_id')::uuid and pedido_compra_id = p_pedido_compra_id and company_id = v_company_id;
    if not found then
      raise exception 'Item de pedido de compra não encontrado neste pedido.';
    end if;

    v_qtd := (v_item->>'quantidade_recebida')::numeric;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'Quantidade recebida deve ser maior que zero.';
    end if;

    select coalesce(sum(quantidade_recebida), 0) into v_ja_recebido
    from public.recebimento_itens ri
    join public.recebimentos_pedido_compra r on r.id = ri.recebimento_id
    where ri.pedido_compra_item_id = v_pci.id and r.status <> 'cancelado';
    if v_ja_recebido + v_qtd > v_pci.quantidade then
      raise exception 'Quantidade recebida (%) excederia o total do item do pedido de compra (%, já recebido %).',
        v_ja_recebido + v_qtd, v_pci.quantidade, v_ja_recebido;
    end if;

    insert into public.recebimento_itens (company_id, recebimento_id, pedido_compra_item_id, item_id, quantidade_recebida)
    values (v_company_id, v_recebimento_id, v_pci.id, v_pci.item_id, v_qtd);
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.recebimento_registrado', 'recebimento_pedido_compra', v_recebimento_id, v_numero);

  return v_recebimento_id;
end;
$$;

grant execute on function public.registrar_recebimento_pedido_compra(uuid, jsonb, text, text, text) to authenticated;

-- =========================================================================
-- registrar_lote_recebimento() — TÓPICO 7 §29.
-- =========================================================================

create function public.registrar_lote_recebimento(
  p_recebimento_item_id uuid,
  p_numero_lote text,
  p_quantidade numeric,
  p_data_fabricacao date default null,
  p_data_validade date default null,
  p_certificado text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_item public.recebimento_itens;
  v_ja_lotado numeric;
  v_id uuid;
begin
  select * into v_item from public.recebimento_itens where id = p_recebimento_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de recebimento não encontrado nesta empresa.';
  end if;
  if v_item.status = 'conferido' then
    raise exception 'Item já conferido — não é possível registrar lote depois de finalizada a conferência.';
  end if;
  if p_numero_lote is null or btrim(p_numero_lote) = '' then
    raise exception 'Número do lote é obrigatório.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade do lote deve ser maior que zero.';
  end if;

  select coalesce(sum(quantidade), 0) into v_ja_lotado from public.lotes_recebimento where recebimento_item_id = p_recebimento_item_id;
  if v_ja_lotado + p_quantidade > v_item.quantidade_recebida then
    raise exception 'Quantidade em lotes (%) excederia a quantidade recebida do item (%).', v_ja_lotado + p_quantidade, v_item.quantidade_recebida;
  end if;

  insert into public.lotes_recebimento (company_id, recebimento_item_id, numero_lote, quantidade, data_fabricacao, data_validade, certificado)
  values (v_company_id, p_recebimento_item_id, p_numero_lote, p_quantidade, p_data_fabricacao, p_data_validade, p_certificado)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.lote_recebimento_registrado', 'recebimento_item', p_recebimento_item_id, p_numero_lote);

  return v_id;
end;
$$;

grant execute on function public.registrar_lote_recebimento(uuid, text, numeric, date, date, text) to authenticated;

-- =========================================================================
-- registrar_divergencia_recebimento() / tratar_divergencia() — TÓPICO 7
-- §30. Divergência de tipo='qualidade' põe o item em quarentena (§28) até
-- ser tratada.
-- =========================================================================

create function public.registrar_divergencia_recebimento(
  p_recebimento_item_id uuid,
  p_tipo text,
  p_descricao text,
  p_quantidade_divergente numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_item public.recebimento_itens;
  v_id uuid;
begin
  select * into v_item from public.recebimento_itens where id = p_recebimento_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de recebimento não encontrado nesta empresa.';
  end if;
  if v_item.status = 'conferido' then
    raise exception 'Item já conferido — não é possível registrar divergência depois de finalizada a conferência.';
  end if;
  if p_tipo not in ('quantidade_menor', 'quantidade_maior', 'avaria', 'qualidade', 'documentacao', 'atraso', 'outra') then
    raise exception 'Tipo de divergência inválido: "%".', p_tipo;
  end if;
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição da divergência é obrigatória.';
  end if;
  if p_quantidade_divergente is not null and p_quantidade_divergente < 0 then
    raise exception 'Quantidade divergente não pode ser negativa.';
  end if;

  insert into public.divergencias_recebimento (
    company_id, recebimento_item_id, tipo, quantidade_divergente, descricao, registrado_por
  ) values (
    v_company_id, p_recebimento_item_id, p_tipo, p_quantidade_divergente, p_descricao, auth.uid()
  )
  returning id into v_id;

  if p_tipo = 'qualidade' then
    update public.recebimento_itens set status = 'quarentena' where id = p_recebimento_item_id and status = 'pendente';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'compras.divergencia_registrada', 'recebimento_item', p_recebimento_item_id, p_descricao,
    jsonb_build_object('tipo', p_tipo, 'quantidade_divergente', p_quantidade_divergente)
  );

  return v_id;
end;
$$;

grant execute on function public.registrar_divergencia_recebimento(uuid, text, text, numeric) to authenticated;

create function public.tratar_divergencia(
  p_id uuid,
  p_decisao text,
  p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_divergencia public.divergencias_recebimento;
  v_abertas_restantes int;
begin
  select * into v_divergencia from public.divergencias_recebimento where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Divergência não encontrada nesta empresa.';
  end if;
  if v_divergencia.status <> 'aberta' then
    raise exception 'Divergência já foi tratada.';
  end if;
  if p_decisao not in ('aceitar', 'recusar') then
    raise exception 'Decisão inválida: "%".', p_decisao;
  end if;
  if p_decisao = 'recusar' and v_divergencia.quantidade_divergente is null then
    raise exception 'Divergência recusada precisa ter quantidade divergente informada.';
  end if;

  update public.divergencias_recebimento set
    status = 'tratada', decisao = p_decisao, decisao_observacao = p_observacao,
    tratado_por = auth.uid(), tratado_em = now()
  where id = p_id;

  select count(*) into v_abertas_restantes from public.divergencias_recebimento
  where recebimento_item_id = v_divergencia.recebimento_item_id and status = 'aberta';
  if v_abertas_restantes = 0 then
    update public.recebimento_itens set status = 'pendente' where id = v_divergencia.recebimento_item_id and status = 'quarentena';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.divergencia_tratada', 'recebimento_item', v_divergencia.recebimento_item_id, p_decisao);

  return p_id;
end;
$$;

grant execute on function public.tratar_divergencia(uuid, text, text) to authenticated;

-- =========================================================================
-- finalizar_conferencia_recebimento() — TÓPICO 7 §27/§28. Única função
-- que chama ajustar_saldo() (tipo='compra') nesta fase. Bloqueia enquanto
-- houver divergência aberta em qualquer item do recebimento. Fecha a
-- convergência da decisão 1 da ADR-011: marca a necessidade de origem
-- (quando houver, via pedido_compra_item -> cotacao_item ->
-- solicitacao_compra_item -> necessidade_compra_id) como 'recebida'.
-- =========================================================================

create function public.finalizar_conferencia_recebimento(p_recebimento_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_recebimento public.recebimentos_pedido_compra;
  v_item record;
  v_qtd_recusada numeric;
  v_qtd_aceita numeric;
  v_necessidade_id uuid;
begin
  select * into v_recebimento from public.recebimentos_pedido_compra where id = p_recebimento_id and company_id = v_company_id;
  if not found then
    raise exception 'Recebimento não encontrado nesta empresa.';
  end if;
  if v_recebimento.status <> 'em_conferencia' then
    raise exception 'Só é possível finalizar conferência de um recebimento em_conferencia (status atual: %).', v_recebimento.status;
  end if;
  if exists (
    select 1 from public.divergencias_recebimento dr
    join public.recebimento_itens ri on ri.id = dr.recebimento_item_id
    where ri.recebimento_id = p_recebimento_id and dr.status = 'aberta'
  ) then
    raise exception 'Existem divergências abertas neste recebimento — trate todas antes de finalizar a conferência.';
  end if;

  for v_item in select * from public.recebimento_itens where recebimento_id = p_recebimento_id loop
    select coalesce(sum(dr.quantidade_divergente), 0) into v_qtd_recusada
    from public.divergencias_recebimento dr
    where dr.recebimento_item_id = v_item.id and dr.status = 'tratada' and dr.decisao = 'recusar';

    v_qtd_aceita := v_item.quantidade_recebida - v_qtd_recusada;
    if v_qtd_aceita < 0 then
      v_qtd_aceita := 0;
    end if;

    update public.recebimento_itens set quantidade_aceita = v_qtd_aceita, status = 'conferido' where id = v_item.id;

    if v_qtd_aceita > 0 then
      perform public.ajustar_saldo(
        v_item.item_id, v_qtd_aceita,
        format('Recebimento %s do pedido de compra.', v_recebimento.numero),
        'compra'
      );
    end if;

    select nc.id into v_necessidade_id
    from public.pedido_compra_itens pci
    join public.cotacao_itens ci on ci.id = pci.cotacao_item_id
    join public.solicitacao_compra_itens sci on sci.id = ci.solicitacao_compra_item_id
    join public.necessidades_compra nc on nc.id = sci.necessidade_compra_id
    where pci.id = v_item.pedido_compra_item_id and nc.status = 'atendida';

    if v_necessidade_id is not null then
      update public.necessidades_compra set
        status = 'recebida', quantidade_recebida = v_qtd_aceita, data_recebimento = now(), recebido_por = auth.uid()
      where id = v_necessidade_id;
    end if;
  end loop;

  update public.recebimentos_pedido_compra set status = 'conferido' where id = p_recebimento_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.conferencia_finalizada', 'recebimento_pedido_compra', p_recebimento_id, v_recebimento.numero);

  return p_recebimento_id;
end;
$$;

grant execute on function public.finalizar_conferencia_recebimento(uuid) to authenticated;

-- =========================================================================
-- registrar_devolucao_compra() — TÓPICO 7 §31. Só sobre item já conferido.
-- =========================================================================

create function public.registrar_devolucao_compra(
  p_recebimento_item_id uuid,
  p_quantidade numeric,
  p_motivo text,
  p_divergencia_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_item public.recebimento_itens;
  v_ja_devolvido numeric;
  v_id uuid;
begin
  select * into v_item from public.recebimento_itens where id = p_recebimento_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de recebimento não encontrado nesta empresa.';
  end if;
  if v_item.status <> 'conferido' or v_item.quantidade_aceita is null then
    raise exception 'Só é possível devolver item já conferido.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade da devolução deve ser maior que zero.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Motivo da devolução é obrigatório.';
  end if;
  if p_divergencia_id is not null and not exists (
    select 1 from public.divergencias_recebimento where id = p_divergencia_id and company_id = v_company_id and recebimento_item_id = p_recebimento_item_id
  ) then
    raise exception 'Divergência não encontrada para este item de recebimento.';
  end if;

  select coalesce(sum(quantidade), 0) into v_ja_devolvido from public.devolucoes_compra
  where recebimento_item_id = p_recebimento_item_id and status = 'registrada';
  if v_ja_devolvido + p_quantidade > v_item.quantidade_aceita then
    raise exception 'Quantidade a devolver (%) excederia a quantidade aceita do item (%, já devolvido %).',
      v_ja_devolvido + p_quantidade, v_item.quantidade_aceita, v_ja_devolvido;
  end if;

  perform public.ajustar_saldo(v_item.item_id, -p_quantidade, p_motivo, 'devolucao');

  insert into public.devolucoes_compra (company_id, recebimento_item_id, divergencia_id, quantidade, motivo, registrado_por)
  values (v_company_id, p_recebimento_item_id, p_divergencia_id, p_quantidade, p_motivo, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'compras.devolucao_registrada', 'recebimento_item', p_recebimento_item_id, p_motivo,
    jsonb_build_object('quantidade', p_quantidade)
  );

  return v_id;
end;
$$;

grant execute on function public.registrar_devolucao_compra(uuid, numeric, text, uuid) to authenticated;
