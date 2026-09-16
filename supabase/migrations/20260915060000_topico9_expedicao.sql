-- TÓPICO 9 — Expedição, recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO
-- PILOTO v1.0, dezembro: "saída, campo e homologação", mesmo mês de T8
-- Qualidade). Texto exato do recorte (PLANO §4): "T9 — Expedição:
-- separação, conferência, romaneio e saída, com suporte a expedição
-- parcial." ADR-002 §4.8 é a lista autoritativa mais detalhada:
-- "preparação; separação; conferência; carregamento; despacho; entrega;
-- ocorrências; rastreabilidade. Deverá também suportar operações
-- parciais, mantendo: planejado; realizado; pendente. Não fazem parte do
-- MVP: otimização de rotas; telemetria de frota; gestão logística
-- avançada."
--
-- O TÓPICO 9 completo (docs/Prompt TÓPICO 9) é o módulo mais amplo do
-- MVP: viagens agrupando múltiplos pedidos (§7), veículos/transportadoras/
-- frete/rotas (§5-6), lacre (§4), etiquetas/QR Code (§17), baixa de
-- estoque configurável (§13 — nem existe estoque de produto acabado no
-- MVP, T6 só modela matéria-prima), documentação fiscal (§15), avarias
-- (§12), indicadores de BI (§21). Nada disso entra aqui — mesmo critério
-- de recorte de T2-T8: só o que sustenta "separação, conferência,
-- romaneio e saída, com suporte a expedição parcial".
--
-- Decisões de recorte:
--   - Expedição integra com T4/T8 só por LEITURA — nenhuma função ou
--     enum de T3/T4/T8 é alterada. pedidos.status nunca avança além de
--     'liberado' (T3), então o gate de disponibilidade pra expedir vive
--     inteiramente aqui, consultando ordens_producao.status='concluida'
--     + status_qualidade='aprovado' (T8) pelo pedido_item_id (1:1 com
--     ordens_producao, T4).
--   - Disponibilidade para expedir = ordens_producao.quantidade_produzida
--     (nunca inspecoes_qualidade). status_qualidade='aprovado' já é um
--     invariante estrutural de T8 — só fica 'aprovado' quando não há NC
--     aberta, e cada reinspecionar_retrabalho() exige que a soma da
--     reinspeção feche exatamente a quantidade da NC (sempre o resto
--     reprovado do ciclo anterior). Logo, sempre que status_qualidade=
--     'aprovado', 100% de quantidade_produzida já foi aprovado — ler
--     inspecoes_qualidade diretamente seria redundante e duplicaria a
--     autoridade de outro módulo (item 48 de T8 / regra fundamental de
--     T9: "Expedição não mantém estoque próprio... administra a
--     operação logística").
--   - "Planejado/realizado/pendente" (ADR-002) são, literalmente,
--     expedicao_itens.quantidade / quantidade_entregue / quantidade_
--     pendente (gerada) — sem o enum de 11 status de entrega do prompt
--     completo (§8), que depende de viagem/transportadora inexistentes.
--   - "Romaneio" é função de leitura (mesmo padrão de lista_corte(),
--     T4), não uma entidade nova — sem viagem/veículo/transportadora não
--     há nada além do que já existe em expedicoes/expedicao_itens/
--     pedidos pra persistir.
--   - "Ocorrências" é uma tabela minimalista (descrição livre) — sem
--     tipo/tratamento/status configurável (§10 completo, Release 1).
--   - Sem status 'entregue' em expedicoes.status — confirmação de
--     entrega vive só em expedicao_itens.quantidade_entregue, mesmo
--     espírito de T8 ter deixado "liberação" implícita em
--     status_qualidade='aprovado', sem função dedicada.
--   - Cancelamento após a saída não é tratado aqui (§20 completo: "após
--     saída, não tratar como simples cancelamento — utilizar fluxo de
--     retorno/devolução") — isso é Release 1.
--   - insert into activity_logs direto (não log_activity()), mesmo
--     padrão já usado em T2-T8.
--
-- Pré-requisito funcional (não é escopo extra): next_document_number()
-- foi reescrita em 20260915020000_auditoria_15092026_p0.sql como
-- allow-list fechada (F09) — qualquer document_type fora de
-- orcamento/pedido/ordem_producao já é negado por padrão. Precisa ser
-- recriada aqui com o ramo 'expedicao', ou criar_expedicao() nunca
-- funciona.

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

create table public.expedicoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_id uuid not null references public.pedidos(id),
  numero text not null,
  status text not null default 'preparando'
    check (status in ('preparando', 'conferida', 'expedida', 'cancelada')),
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expedicoes_company_numero_unique unique (company_id, numero)
);
comment on table public.expedicoes is
  'TÓPICO 9, recorte mínimo — cabeçalho de expedição. Um pedido pode ter várias (expedição parcial, ADR-002 §4.8). Sem colunas de quem/quando por transição (mesmo padrão de ordens_producao/pedidos/orcamentos) — isso vive em activity_logs.';
create index expedicoes_pedido_id_idx on public.expedicoes (pedido_id);
create index expedicoes_status_idx on public.expedicoes (status);

create table public.expedicao_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  expedicao_id uuid not null references public.expedicoes(id) on delete cascade,
  pedido_item_id uuid not null references public.pedido_itens(id),
  -- planejado / realizado / pendente do ADR-002 §4.8, literalmente.
  quantidade numeric(14, 3) not null check (quantidade > 0),
  quantidade_entregue numeric(14, 3) not null default 0 check (quantidade_entregue >= 0),
  quantidade_pendente numeric(14, 3) generated always as (quantidade - quantidade_entregue) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expedicao_itens_entregue_check check (quantidade_entregue <= quantidade),
  -- Um mesmo pedido_item só aparece uma vez por expedição — corrigir
  -- quantidade é remover_item_expedicao() + adicionar de novo, não editar.
  constraint expedicao_itens_expedicao_pedido_item_unique unique (expedicao_id, pedido_item_id)
);
comment on table public.expedicao_itens is
  'TÓPICO 9, recorte mínimo — quantidade/quantidade_entregue/quantidade_pendente nomeiam planejado/realizado/pendente (ADR-002 §4.8), sem o enum de 11 status de entrega do prompt completo (depende de viagem/transportadora, fora de escopo).';
create index expedicao_itens_expedicao_id_idx on public.expedicao_itens (expedicao_id);
-- Índice crítico para a query de "quantidade já usada" dentro do lock de
-- adicionar_item_expedicao().
create index expedicao_itens_pedido_item_id_idx on public.expedicao_itens (pedido_item_id);

create table public.ocorrencias_expedicao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  expedicao_id uuid not null references public.expedicoes(id) on delete cascade,
  descricao text not null,
  registrado_por uuid not null references public.profiles(id),
  registrado_em timestamptz not null default now()
);
comment on table public.ocorrencias_expedicao is
  'TÓPICO 9, recorte mínimo — descrição livre, sem tipo/tratamento/status configurável (prompt completo §10, Release 1).';
create index ocorrencias_expedicao_expedicao_id_idx on public.ocorrencias_expedicao (expedicao_id);

create trigger set_updated_at before update on public.expedicoes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.expedicao_itens
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 2. RLS — mesmo padrão de ordens_producao/inspecoes_qualidade: SELECT
--    aberto a qualquer autenticado da empresa, sem exigir expedicao.view
--    (T16 Instalação, quando existir, pode precisar ler sem administrar
--    Expedição). Nenhuma policy de INSERT/UPDATE/DELETE para
--    authenticated — só as funções abaixo escrevem.
-- =========================================================================

alter table public.expedicoes enable row level security;
alter table public.expedicao_itens enable row level security;
alter table public.ocorrencias_expedicao enable row level security;

create policy expedicoes_select on public.expedicoes for select
  using (company_id = (select public.current_company_id()));
create policy expedicao_itens_select on public.expedicao_itens for select
  using (company_id = (select public.current_company_id()));
create policy ocorrencias_expedicao_select on public.ocorrencias_expedicao for select
  using (company_id = (select public.current_company_id()));

grant select on public.expedicoes to authenticated;
grant select on public.expedicao_itens to authenticated;
grant select on public.ocorrencias_expedicao to authenticated;

-- =========================================================================
-- 3. criar_expedicao() — só a partir de pedido liberado.
-- =========================================================================

create or replace function public.criar_expedicao(p_pedido_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('expedicao', 'manage');
  v_pedido public.pedidos;
  v_numero text;
  v_id uuid;
begin
  select * into v_pedido from public.pedidos
  where id = p_pedido_id and company_id = v_company_id;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível expedir pedido liberado (status atual: %).', v_pedido.status;
  end if;

  v_numero := public.next_document_number('expedicao');

  insert into public.expedicoes (company_id, pedido_id, numero)
  values (v_company_id, p_pedido_id, v_numero)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'expedicao.criada', 'expedicao', v_id, v_numero, jsonb_build_object('pedido_id', p_pedido_id));

  return v_id;
end;
$$;

grant execute on function public.criar_expedicao(uuid) to authenticated;

-- =========================================================================
-- 4. adicionar_item_expedicao() — exige OP concluída e aprovada pela
--    qualidade; respeita a quantidade já usada por outras expedições
--    ativas do mesmo pedido_item (expedição parcial, ADR-002 §4.8).
--    Ordem de lock (evita deadlock com remover_item_expedicao/
--    conferir_expedicao concorrentes): sempre expedicoes antes de
--    ordens_producao.
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
  v_op public.ordens_producao;
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

  select * into v_op from public.ordens_producao
  where pedido_item_id = p_pedido_item_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de pedido ainda não tem ordem de produção — produção não iniciada.';
  end if;
  if v_op.status <> 'concluida' then
    raise exception 'Ordem de produção ainda não concluída (status atual: %).', v_op.status;
  end if;
  if v_op.status_qualidade <> 'aprovado' then
    raise exception 'Ordem de produção não liberada pela qualidade (status_qualidade atual: %).', v_op.status_qualidade;
  end if;

  select coalesce(sum(ei.quantidade), 0) into v_ja_usado
  from public.expedicao_itens ei
  join public.expedicoes e on e.id = ei.expedicao_id
  where ei.pedido_item_id = p_pedido_item_id and e.status <> 'cancelada';

  v_disponivel := v_op.quantidade_produzida - v_ja_usado;
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

grant execute on function public.adicionar_item_expedicao(uuid, uuid, numeric) to authenticated;

-- =========================================================================
-- 5. remover_item_expedicao() — corrige erro de separação antes da
--    conferência (§2 do prompt completo, sem o menu de tratamentos
--    configuráveis de divergência, isso é Release 1).
-- =========================================================================

create or replace function public.remover_item_expedicao(p_expedicao_item_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('expedicao', 'manage');
  v_expedicao_status text;
begin
  select e.status into v_expedicao_status
  from public.expedicao_itens ei
  join public.expedicoes e on e.id = ei.expedicao_id
  where ei.id = p_expedicao_item_id and ei.company_id = v_company_id
  for update of ei;
  if not found then
    raise exception 'Item de expedição não encontrado nesta empresa.';
  end if;
  if v_expedicao_status <> 'preparando' then
    raise exception 'Só é possível remover item com a expedição em preparação (status atual: %).', v_expedicao_status;
  end if;

  delete from public.expedicao_itens where id = p_expedicao_item_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'expedicao.item_removido', 'expedicao_item', p_expedicao_item_id, null, null);

  return p_expedicao_item_id;
end;
$$;

grant execute on function public.remover_item_expedicao(uuid) to authenticated;

-- =========================================================================
-- 6. conferir_expedicao() / registrar_saida_expedicao() / cancelar_
--    expedicao() — transições de estado do cabeçalho.
-- =========================================================================

create or replace function public.conferir_expedicao(p_expedicao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('expedicao', 'manage');
  v_expedicao public.expedicoes;
  v_total_itens int;
begin
  select * into v_expedicao from public.expedicoes
  where id = p_expedicao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Expedição não encontrada nesta empresa.';
  end if;
  if v_expedicao.status <> 'preparando' then
    raise exception 'Só é possível conferir expedição em preparação (status atual: %).', v_expedicao.status;
  end if;

  select count(*) into v_total_itens from public.expedicao_itens where expedicao_id = p_expedicao_id;
  if v_total_itens = 0 then
    raise exception 'Expedição sem itens não pode ser conferida.';
  end if;

  update public.expedicoes set status = 'conferida' where id = p_expedicao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'expedicao.conferida', 'expedicao', p_expedicao_id, v_expedicao.numero, null);

  return p_expedicao_id;
end;
$$;

grant execute on function public.conferir_expedicao(uuid) to authenticated;

create or replace function public.registrar_saida_expedicao(p_expedicao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('expedicao', 'manage');
  v_expedicao public.expedicoes;
begin
  select * into v_expedicao from public.expedicoes
  where id = p_expedicao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Expedição não encontrada nesta empresa.';
  end if;
  if v_expedicao.status <> 'conferida' then
    raise exception 'Só é possível registrar saída de expedição conferida (status atual: %).', v_expedicao.status;
  end if;

  update public.expedicoes set status = 'expedida' where id = p_expedicao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'expedicao.saida_registrada', 'expedicao', p_expedicao_id, v_expedicao.numero, null);

  return p_expedicao_id;
end;
$$;

grant execute on function public.registrar_saida_expedicao(uuid) to authenticated;

create or replace function public.cancelar_expedicao(p_expedicao_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('expedicao', 'manage');
  v_expedicao public.expedicoes;
begin
  select * into v_expedicao from public.expedicoes
  where id = p_expedicao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Expedição não encontrada nesta empresa.';
  end if;
  if v_expedicao.status = 'expedida' then
    raise exception 'Expedição já com saída registrada não pode ser cancelada — use o fluxo de retorno/devolução.';
  end if;
  if v_expedicao.status = 'cancelada' then
    raise exception 'Expedição já cancelada.';
  end if;

  update public.expedicoes set status = 'cancelada', motivo_cancelamento = p_motivo where id = p_expedicao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'expedicao.cancelada', 'expedicao', p_expedicao_id, p_motivo, null);

  return p_expedicao_id;
end;
$$;

grant execute on function public.cancelar_expedicao(uuid, text) to authenticated;

-- =========================================================================
-- 7. confirmar_entrega_item_expedicao() — soma (nunca substitui) na
--    quantidade_entregue acumulada do item (§9 do prompt completo:
--    entrega parcial).
-- =========================================================================

create or replace function public.confirmar_entrega_item_expedicao(
  p_expedicao_item_id uuid,
  p_quantidade_entregue numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('expedicao', 'manage');
  v_item public.expedicao_itens;
  v_expedicao_status text;
begin
  select ei.* into v_item
  from public.expedicao_itens ei
  where ei.id = p_expedicao_item_id and ei.company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de expedição não encontrado nesta empresa.';
  end if;

  select status into v_expedicao_status from public.expedicoes where id = v_item.expedicao_id;
  if v_expedicao_status <> 'expedida' then
    raise exception 'Só é possível confirmar entrega de expedição com saída registrada (status atual: %).', v_expedicao_status;
  end if;
  if p_quantidade_entregue <= 0 then
    raise exception 'Quantidade entregue precisa ser maior que zero.';
  end if;
  if v_item.quantidade_entregue + p_quantidade_entregue > v_item.quantidade then
    raise exception 'Quantidade entregue (%) excederia a quantidade expedida (%).',
      v_item.quantidade_entregue + p_quantidade_entregue, v_item.quantidade;
  end if;

  update public.expedicao_itens
  set quantidade_entregue = quantidade_entregue + p_quantidade_entregue
  where id = p_expedicao_item_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'expedicao.entrega_confirmada', 'expedicao_item', p_expedicao_item_id, null,
    jsonb_build_object('quantidade_entregue', p_quantidade_entregue)
  );

  return p_expedicao_item_id;
end;
$$;

grant execute on function public.confirmar_entrega_item_expedicao(uuid, numeric) to authenticated;

-- =========================================================================
-- 8. registrar_ocorrencia_expedicao() — registro livre (§10 completo,
--    sem tipo/tratamento/status configurável).
-- =========================================================================

create or replace function public.registrar_ocorrencia_expedicao(p_expedicao_id uuid, p_descricao text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('expedicao', 'manage');
  v_expedicao public.expedicoes;
  v_id uuid;
begin
  select * into v_expedicao from public.expedicoes
  where id = p_expedicao_id and company_id = v_company_id;
  if not found then
    raise exception 'Expedição não encontrada nesta empresa.';
  end if;
  if v_expedicao.status = 'cancelada' then
    raise exception 'Não é possível registrar ocorrência em expedição cancelada.';
  end if;
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição da ocorrência é obrigatória.';
  end if;

  insert into public.ocorrencias_expedicao (company_id, expedicao_id, descricao, registrado_por)
  values (v_company_id, p_expedicao_id, p_descricao, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'expedicao.ocorrencia_registrada', 'expedicao', p_expedicao_id, p_descricao, null);

  return v_id;
end;
$$;

grant execute on function public.registrar_ocorrencia_expedicao(uuid, text) to authenticated;

-- =========================================================================
-- 9. romaneio_expedicao() — função de leitura, mesmo padrão de
--    lista_corte() (T4): sem viagem/veículo/transportadora (Release 1,
--    exigiria entidades que não existem).
-- =========================================================================

create or replace function public.romaneio_expedicao(p_expedicao_id uuid)
returns table (
  numero text,
  status text,
  pedido_numero text,
  pessoa_nome text,
  item_codigo text,
  item_descricao text,
  quantidade numeric,
  quantidade_entregue numeric,
  quantidade_pendente numeric
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('expedicao', 'view') then
    raise exception 'Sem permissão para consultar romaneio (expedicao.view).';
  end if;

  return query
  select
    e.numero, e.status, p.numero as pedido_numero, pe.nome as pessoa_nome,
    i.codigo as item_codigo, i.descricao as item_descricao,
    ei.quantidade, ei.quantidade_entregue, ei.quantidade_pendente
  from public.expedicao_itens ei
  join public.expedicoes e on e.id = ei.expedicao_id
  join public.pedidos p on p.id = e.pedido_id
  join public.pessoas pe on pe.id = p.pessoa_id
  join public.pedido_itens pit on pit.id = ei.pedido_item_id
  join public.itens i on i.id = pit.item_id
  where e.id = p_expedicao_id and e.company_id = v_company_id;
end;
$$;

grant execute on function public.romaneio_expedicao(uuid) to authenticated;
