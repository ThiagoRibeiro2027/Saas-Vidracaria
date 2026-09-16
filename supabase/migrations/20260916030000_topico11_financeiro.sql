-- TÓPICO 11 — Financeiro, recorte mínimo do MVP (ADR-002 §4.14). PLANO DE
-- ENTREGA §6 previa pro M2: "T11 Financeiro básico (títulos vinculados ao
-- pedido)" — o número já chegou errado nesta sessão ("T14", que é Usuários/
-- Permissões; corrigido no PLANO e aqui).
--
-- O prompt completo do TÓPICO 11 (docs/Prompt TÓPICO 11 - FINANCEIRO.md,
-- 2072 linhas) lista na sua própria seção 34 ("Escopo do MVP") um ERP
-- financeiro inteiro como "obrigatório" — plano de contas, contas a pagar,
-- conciliação bancária, DRE, empréstimos, comissões, cobrança. Isso
-- contradiz diretamente o ADR-002 §4.14, que é taxativo: "O Financeiro do
-- MVP será deliberadamente limitado... Não fazem parte do MVP: estrutura
-- completa de contas a receber; contas a pagar; cobrança; conciliação;
-- fluxo de caixa completo; integração bancária; DRE; centros de custo
-- avançados; relatórios financeiros avançados. O objetivo é evitar a
-- criação de um 'mini módulo financeiro completo' dentro do MVP." O PLANO
-- está do lado do ADR-002 (frase estreita, sem nenhuma dessas menções).
-- Mesmo padrão do TÓPICO 7: o prompt do tópico mira um produto maior, o
-- ADR-002 é quem rege o MVP (hierarquia do CLAUDE.md do projeto) —
-- decisão confirmada com o responsável do produto antes deste commit.
--
-- Por isso este recorte é só: título financeiro a receber vinculado a
-- pedido (nunca a pagar — T7 Suprimentos não gera nenhuma origem de conta
-- a pagar neste MVP, a efetivação de compra é fora do SaaS), parcelas
-- planejadas, status básico (aberto/parcial/pago/cancelado) e registro de
-- recebimento (integral ou parcial, sem juros/multas/descontos — prompt
-- completo §7.4 "diferenças autorizadas", fora do recorte). Sem plano de
-- contas (§3.1), centros de custo (§3.3), contas financeiras/caixa/bancos
-- (§3.4/§10), conciliação bancária (§11), DRE (§12.3), orçamento (§15),
-- fechamento de período (§4/§16), empréstimos/financiamentos/investimentos
-- (§18-19/§24), comissões (§13), cobrança/inadimplência (§7.5-7.7), contas
-- a pagar (nenhuma origem existe no MVP atual).
--
-- Geração de título NÃO é automática na liberação do pedido (liberar_
-- pedido, T3, não é alterada) — é uma ação dedicada e manual, chamada uma
-- vez por pedido; a soma das parcelas precisa fechar exatamente o valor do
-- pedido (prompt completo §6.3, regra que sobrevive no recorte mínimo:
-- "ausência de duplicidade de lançamentos" é inviolável mesmo aqui).
-- "Vencido" não é um status próprio — é vencimento < hoje calculado em
-- runtime pela UI, sobre um título ainda 'aberto'/'parcial'.
--
-- Pré-requisito funcional: next_document_number() (allow-list fechada,
-- F09) precisa do ramo 'titulo_financeiro'.

create or replace function public.next_document_number(p_document_type text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_row public.numbering_sequences%rowtype;
  v_period_key text;
  v_number text;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  if p_document_type = 'orcamento' then
    if not public.has_permission('orcamentos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de orçamento (orcamentos.manage).';
    end if;
  elsif p_document_type = 'pedido' then
    if not public.has_permission('pedidos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de pedido (pedidos.manage).';
    end if;
  elsif p_document_type = 'ordem_producao' then
    if not public.has_permission('producao', 'manage') then
      raise exception 'Sem permissão para emitir numeração de ordem de produção (producao.manage).';
    end if;
  elsif p_document_type = 'expedicao' then
    if not public.has_permission('expedicao', 'manage') then
      raise exception 'Sem permissão para emitir numeração de expedição (expedicao.manage).';
    end if;
  elsif p_document_type = 'instalacao' then
    if not public.has_permission('instalacao', 'manage') then
      raise exception 'Sem permissão para emitir numeração de instalação (instalacao.manage).';
    end if;
  elsif p_document_type = 'titulo_financeiro' then
    if not public.has_permission('financeiro', 'manage') then
      raise exception 'Sem permissão para emitir numeração de título financeiro (financeiro.manage).';
    end if;
  else
    raise exception 'Tipo de documento desconhecido: "%".', p_document_type;
  end if;

  perform public.assert_company_not_suspended();

  select * into v_row from public.numbering_sequences
  where company_id = v_company_id and document_type = p_document_type
  for update;

  if not found then
    raise exception 'Sequência de numeração não configurada para "%".', p_document_type;
  end if;

  v_period_key := case v_row.reinicio
    when 'anual' then to_char(now(), 'YYYY')
    when 'mensal' then to_char(now(), 'YYYY-MM')
    else ''
  end;

  if v_period_key is distinct from v_row.current_period_key then
    v_row.current_value := 0;
  end if;

  v_row.current_value := v_row.current_value + 1;

  update public.numbering_sequences
  set current_value = v_row.current_value,
      current_period_key = v_period_key
  where id = v_row.id;

  v_number := v_row.prefixo
    || (case when v_row.incluir_ano then to_char(now(), 'YYYY') else '' end)
    || (case when v_row.incluir_mes then to_char(now(), 'MM') else '' end)
    || lpad(v_row.current_value::text, v_row.digitos, '0')
    || v_row.sufixo;

  return v_number;
end;
$$;

-- =========================================================================
-- 1. Tabelas
-- =========================================================================

create table public.titulos_financeiros (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_id uuid not null references public.pedidos(id),
  numero text not null,
  valor numeric(14, 2) not null check (valor > 0),
  valor_recebido numeric(14, 2) not null default 0 check (valor_recebido >= 0),
  saldo_pendente numeric(14, 2) generated always as (valor - valor_recebido) stored,
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
  constraint titulos_financeiros_company_numero_unique unique (company_id, numero),
  constraint titulos_financeiros_recebido_check check (valor_recebido <= valor)
);
comment on table public.titulos_financeiros is
  'TÓPICO 11, recorte mínimo do MVP (ADR-002 §4.14) — só título a receber vinculado a pedido. Sem plano de contas/centro de custo/conta financeira. Gerado manualmente via gerar_titulos_pedido(), nunca automático na liberação do pedido (T3 não é alterado).';
create index titulos_financeiros_pedido_id_idx on public.titulos_financeiros (pedido_id);
create index titulos_financeiros_status_idx on public.titulos_financeiros (status);

create table public.recebimentos_titulo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  titulo_id uuid not null references public.titulos_financeiros(id) on delete cascade,
  valor numeric(14, 2) not null check (valor > 0),
  data_recebimento date not null default current_date,
  registrado_por uuid not null references public.profiles(id),
  registrado_em timestamptz not null default now()
);
comment on table public.recebimentos_titulo is
  'TÓPICO 11, recorte mínimo — histórico de recebimentos (integral ou parcial) de um título. Sem meio de pagamento/conta financeira/juros/multas/descontos (prompt completo §7.4, fora do recorte).';
create index recebimentos_titulo_titulo_id_idx on public.recebimentos_titulo (titulo_id);

create trigger set_updated_at before update on public.titulos_financeiros
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 2. RLS — SELECT aberto a qualquer autenticado da empresa, sem exigir
--    financeiro.view (mesmo padrão de T2/T5/T7/T9/T16).
-- =========================================================================

alter table public.titulos_financeiros enable row level security;
alter table public.recebimentos_titulo enable row level security;

create policy titulos_financeiros_select on public.titulos_financeiros for select
  using (company_id = (select public.current_company_id()));
create policy recebimentos_titulo_select on public.recebimentos_titulo for select
  using (company_id = (select public.current_company_id()));

grant select on public.titulos_financeiros to authenticated;
grant select on public.recebimentos_titulo to authenticated;

-- =========================================================================
-- 3. pedido_valor_total() — mesmo padrão de orcamento_valor_total() (T3
--    code-review fixes).
-- =========================================================================

create or replace function public.pedido_valor_total(p_pedido_id uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(pi.quantidade * pi.preco_unitario), 0)
  from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.pedido_id = p_pedido_id
    and p.company_id = public.current_company_id();
$$;

grant execute on function public.pedido_valor_total(uuid) to authenticated;

-- =========================================================================
-- 4. gerar_titulos_pedido() — só a partir de pedido liberado, sem título
--    já gerado, com a soma das parcelas fechando exatamente o valor do
--    pedido (prompt completo §6.3). p_parcelas: jsonb array de
--    {"valor": number, "vencimento": "YYYY-MM-DD", "condicao_pagamento": text opcional}.
-- =========================================================================

create or replace function public.gerar_titulos_pedido(p_pedido_id uuid, p_parcelas jsonb)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_pedido public.pedidos;
  v_valor_pedido numeric;
  v_soma_parcelas numeric := 0;
  v_total_parcelas int;
  v_parcela jsonb;
  v_indice int := 0;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_numero text;
begin
  select * into v_pedido from public.pedidos
  where id = p_pedido_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível gerar títulos de pedido liberado (status atual: %).', v_pedido.status;
  end if;
  if exists (select 1 from public.titulos_financeiros where pedido_id = p_pedido_id) then
    raise exception 'Este pedido já tem título financeiro gerado.';
  end if;

  if jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then
    raise exception 'Informe ao menos uma parcela.';
  end if;
  v_total_parcelas := jsonb_array_length(p_parcelas);

  v_valor_pedido := public.pedido_valor_total(p_pedido_id);

  for v_parcela in select * from jsonb_array_elements(p_parcelas) loop
    v_soma_parcelas := v_soma_parcelas + (v_parcela->>'valor')::numeric;
  end loop;
  if v_soma_parcelas <> v_valor_pedido then
    raise exception 'Soma das parcelas (%) precisa ser igual ao valor do pedido (%).', v_soma_parcelas, v_valor_pedido;
  end if;

  for v_parcela in select * from jsonb_array_elements(p_parcelas) loop
    v_indice := v_indice + 1;
    if (v_parcela->>'valor')::numeric <= 0 then
      raise exception 'Parcela % com valor inválido.', v_indice;
    end if;
    if (v_parcela->>'vencimento') is null then
      raise exception 'Parcela % sem vencimento.', v_indice;
    end if;

    v_numero := public.next_document_number('titulo_financeiro');

    insert into public.titulos_financeiros (
      company_id, pedido_id, numero, valor, vencimento, condicao_pagamento,
      parcela_numero, parcela_total, criado_por
    ) values (
      v_company_id, p_pedido_id, v_numero, (v_parcela->>'valor')::numeric, (v_parcela->>'vencimento')::date,
      v_parcela->>'condicao_pagamento', v_indice, v_total_parcelas, auth.uid()
    )
    returning id into v_id;

    v_ids := array_append(v_ids, v_id);

    insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
    values (
      v_company_id, auth.uid(), 'financeiro.titulo_gerado', 'titulo_financeiro', v_id, v_numero,
      jsonb_build_object('pedido_id', p_pedido_id, 'valor', v_parcela->>'valor', 'parcela', v_indice, 'de', v_total_parcelas)
    );
  end loop;

  return v_ids;
end;
$$;

grant execute on function public.gerar_titulos_pedido(uuid, jsonb) to authenticated;

-- =========================================================================
-- 5. registrar_recebimento_titulo() — soma (nunca substitui) na
--    quantidade recebida, mesmo padrão de confirmar_entrega_item_
--    expedicao() (T9). Permissão própria (financeiro.receber ≠
--    financeiro.manage): quem monta o título não necessariamente é quem
--    baixa o recebimento.
-- =========================================================================

create or replace function public.registrar_recebimento_titulo(
  p_titulo_id uuid,
  p_valor numeric,
  p_data_recebimento date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'receber');
  v_titulo public.titulos_financeiros;
  v_id uuid;
  v_novo_recebido numeric;
  -- coalesce, não só o default do parâmetro: a Server Action (actions.ts)
  -- envia null explícito quando o campo de data fica em branco no
  -- formulário, e um null explícito via RPC ignora o "default
  -- current_date" da assinatura — só o default vale quando o parâmetro é
  -- omitido inteiramente, nunca quando é passado como null.
  v_data_recebimento date := coalesce(p_data_recebimento, current_date);
begin
  select * into v_titulo from public.titulos_financeiros
  where id = p_titulo_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Título financeiro não encontrado nesta empresa.';
  end if;
  if v_titulo.status not in ('aberto', 'parcial') then
    raise exception 'Só é possível registrar recebimento em título aberto ou parcial (status atual: %).', v_titulo.status;
  end if;
  if p_valor <= 0 then
    raise exception 'Valor recebido precisa ser maior que zero.';
  end if;

  v_novo_recebido := v_titulo.valor_recebido + p_valor;
  if v_novo_recebido > v_titulo.valor then
    raise exception 'Valor recebido (%) excederia o valor do título (%, saldo disponível %).',
      v_novo_recebido, v_titulo.valor, v_titulo.valor - v_titulo.valor_recebido;
  end if;

  insert into public.recebimentos_titulo (company_id, titulo_id, valor, data_recebimento, registrado_por)
  values (v_company_id, p_titulo_id, p_valor, v_data_recebimento, auth.uid())
  returning id into v_id;

  update public.titulos_financeiros
  set valor_recebido = v_novo_recebido,
      status = case when v_novo_recebido >= valor then 'pago' else 'parcial' end
  where id = p_titulo_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'financeiro.recebimento_registrado', 'titulo_financeiro', p_titulo_id, null,
    jsonb_build_object('recebimento_id', v_id, 'valor', p_valor, 'data_recebimento', v_data_recebimento)
  );

  return v_id;
end;
$$;

grant execute on function public.registrar_recebimento_titulo(uuid, numeric, date) to authenticated;

-- =========================================================================
-- 6. cancelar_titulo_financeiro() — só antes de qualquer recebimento,
--    mesmo espírito de T9 "cancelamento só antes de progresso".
-- =========================================================================

create or replace function public.cancelar_titulo_financeiro(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'manage');
  v_titulo public.titulos_financeiros;
begin
  select * into v_titulo from public.titulos_financeiros
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Título financeiro não encontrado nesta empresa.';
  end if;
  if v_titulo.status <> 'aberto' then
    raise exception 'Só é possível cancelar título aberto, sem recebimento registrado (status atual: %).', v_titulo.status;
  end if;

  update public.titulos_financeiros set status = 'cancelado', motivo_cancelamento = p_motivo where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'financeiro.titulo_cancelado', 'titulo_financeiro', p_id, p_motivo, null);

  return p_id;
end;
$$;

grant execute on function public.cancelar_titulo_financeiro(uuid, text) to authenticated;
