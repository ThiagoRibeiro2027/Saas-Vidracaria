-- Compras completo (T7) — Fase 5 da ADR-011 (docs/ADR-011 — Compras
-- v1.0.md): cotação, negociação, histórico de preços, custo total de
-- aquisição e alçada de aprovação (TÓPICO 7 §17-§23). Depende da Fase 4
-- (cotação nasce de itens de uma SC enviada) e da Fase 1 (fornecedores).
--
-- Decisões de design que fecham o que a ADR-011 §5 deixou em aberto pra
-- esta fase ("critérios/pesos default de comparação de cotação"): em vez
-- de um score ponderado subjetivo (que exigiria inventar pesos sem base
-- em nenhum ADR), o "custo total de aquisição" (§21) é um cálculo
-- monetário objetivo — preço + impostos + frete − desconto, todos POR
-- UNIDADE (simplificação deliberada: mantém o cálculo consistente entre
-- seleção total e parcial/§18, sem precisar ratear valores de linha).
-- Isso já satisfaz o princípio central do TÓPICO 7 ("o sistema sugere, o
-- humano decide", §13): o sistema mostra o custo total por proposta,
-- ordenado, mas `selecionar_fornecedor_cotacao()` aceita qualquer
-- proposta — nunca força a de menor custo — e sempre exige justificativa.
--
-- §18 (cotação parcial) não ganha uma função `dividir_cotacao()`
-- separada: `selecionar_fornecedor_cotacao()` já aceita quantidade
-- parcial e pode ser chamada mais de uma vez por item (fornecedores
-- diferentes cobrindo partes da mesma necessidade) — mesmo resultado,
-- sem duplicar mecanismo.
--
-- Alçada (§22/§23): engine dedicada a Compras (decisão 2 da ADR-011),
-- multi-etapa (ordem/valor_minimo/perfil por etapa, dentro de um
-- `processo` — esta fase usa só 'cotacao', mas o desenho já serve pra
-- 'pedido_compra' na Fase 6 sem precisar redesenhar). `approval_
-- thresholds` (T15) não é tocado.

insert into public.numbering_document_types (document_type, resource, action) values
  ('cotacao', 'compras', 'manage');

-- =========================================================================
-- cotacoes / cotacao_itens / cotacao_propostas / cotacao_negociacoes /
-- cotacao_selecoes / historico_precos_item_fornecedor
-- =========================================================================

create table public.cotacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  numero text not null,
  solicitacao_compra_id uuid not null references public.solicitacoes_compra(id),
  status text not null default 'aberta' check (status in ('aberta', 'selecionada', 'cancelada')),
  aprovacao_id uuid,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cotacoes_numero_unique unique (company_id, numero)
);
comment on table public.cotacoes is 'Fase 5 da ADR-011 (TÓPICO 7 §16→§17) — cotação nasce de uma SC enviada (status aberta). selecionada: todo item com fornecedor escolhido e submetido à alçada (aprovacao_id preenchido); status da aprovação em si vive em compras_aprovacoes, consultado via aprovacao_id.';
create index cotacoes_company_id_idx on public.cotacoes (company_id);
create index cotacoes_solicitacao_id_idx on public.cotacoes (solicitacao_compra_id);

create table public.cotacao_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  cotacao_id uuid not null references public.cotacoes(id) on delete cascade,
  solicitacao_compra_item_id uuid not null references public.solicitacao_compra_itens(id),
  created_at timestamptz not null default now(),
  constraint cotacao_itens_unique unique (cotacao_id, solicitacao_compra_item_id)
);
create index cotacao_itens_company_id_idx on public.cotacao_itens (company_id);
create index cotacao_itens_cotacao_id_idx on public.cotacao_itens (cotacao_id);

create table public.cotacao_propostas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  cotacao_item_id uuid not null references public.cotacao_itens(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id),
  preco_unitario numeric(14, 4) not null check (preco_unitario >= 0),
  desconto numeric(14, 4) not null default 0 check (desconto >= 0),
  impostos numeric(14, 4) not null default 0 check (impostos >= 0),
  frete numeric(14, 4) not null default 0 check (frete >= 0),
  custo_unitario numeric(14, 4) not null,
  prazo_entrega_dias integer,
  condicao_pagamento text,
  validade date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cotacao_propostas_unique unique (cotacao_item_id, pessoa_id)
);
comment on table public.cotacao_propostas is 'Fase 5 da ADR-011 (TÓPICO 7 §17) — proposta de um fornecedor pra um item da cotação. custo_unitario = preco_unitario - desconto + impostos + frete (todos por unidade, ver nota da migration); reavaliado a cada rodada de negociação.';
create index cotacao_propostas_company_id_idx on public.cotacao_propostas (company_id);
create index cotacao_propostas_item_id_idx on public.cotacao_propostas (cotacao_item_id);

create table public.cotacao_negociacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  cotacao_proposta_id uuid not null references public.cotacao_propostas(id) on delete cascade,
  rodada smallint not null,
  preco_anterior numeric(14, 4) not null,
  preco_novo numeric(14, 4) not null,
  condicao_anterior text,
  condicao_nova text,
  observacao text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint cotacao_negociacoes_unique unique (cotacao_proposta_id, rodada)
);
comment on table public.cotacao_negociacoes is 'Fase 5 da ADR-011 (TÓPICO 7 §19) — histórico append-only de rodadas de negociação por proposta. economia = preco_anterior - preco_novo, calculada na leitura.';
create index cotacao_negociacoes_company_id_idx on public.cotacao_negociacoes (company_id);
create index cotacao_negociacoes_proposta_id_idx on public.cotacao_negociacoes (cotacao_proposta_id);

create table public.cotacao_selecoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  cotacao_item_id uuid not null references public.cotacao_itens(id) on delete cascade,
  cotacao_proposta_id uuid not null references public.cotacao_propostas(id),
  quantidade numeric(14, 4) not null check (quantidade > 0),
  justificativa text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
comment on table public.cotacao_selecoes is 'Fase 5 da ADR-011 (TÓPICO 7 §21, princípio §13) — fornecedor(es) escolhido(s) por item, com quantidade (permite split, §18) e justificativa sempre obrigatória, mesmo quando a proposta escolhida não é a de menor custo_unitario.';
create index cotacao_selecoes_company_id_idx on public.cotacao_selecoes (company_id);
create index cotacao_selecoes_item_id_idx on public.cotacao_selecoes (cotacao_item_id);

create table public.historico_precos_item_fornecedor (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null references public.itens(id),
  pessoa_id uuid not null references public.pessoas(id),
  preco numeric(14, 4) not null,
  cotacao_id uuid references public.cotacoes(id),
  registrado_em timestamptz not null default now()
);
comment on table public.historico_precos_item_fornecedor is 'Fase 5 da ADR-011 (TÓPICO 7 §20) — append-only, uma linha por proposta registrada (registrar_proposta_cotacao()), independente de ter sido selecionada ou não.';
create index historico_precos_item_fornecedor_company_id_idx on public.historico_precos_item_fornecedor (company_id);
create index historico_precos_item_fornecedor_item_pessoa_idx on public.historico_precos_item_fornecedor (item_id, pessoa_id);

alter table public.cotacoes enable row level security;
create policy cotacoes_select on public.cotacoes for select using (company_id = (select public.current_company_id()));
grant select on public.cotacoes to authenticated;

alter table public.cotacao_itens enable row level security;
create policy cotacao_itens_select on public.cotacao_itens for select using (company_id = (select public.current_company_id()));
grant select on public.cotacao_itens to authenticated;

alter table public.cotacao_propostas enable row level security;
create policy cotacao_propostas_select on public.cotacao_propostas for select using (company_id = (select public.current_company_id()));
grant select on public.cotacao_propostas to authenticated;

alter table public.cotacao_negociacoes enable row level security;
create policy cotacao_negociacoes_select on public.cotacao_negociacoes for select using (company_id = (select public.current_company_id()));
grant select on public.cotacao_negociacoes to authenticated;

alter table public.cotacao_selecoes enable row level security;
create policy cotacao_selecoes_select on public.cotacao_selecoes for select using (company_id = (select public.current_company_id()));
grant select on public.cotacao_selecoes to authenticated;

alter table public.historico_precos_item_fornecedor enable row level security;
create policy historico_precos_item_fornecedor_select on public.historico_precos_item_fornecedor for select using (company_id = (select public.current_company_id()));
grant select on public.historico_precos_item_fornecedor to authenticated;

create trigger set_updated_at before update on public.cotacoes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.cotacao_propostas
  for each row execute function public.set_updated_at();

-- =========================================================================
-- compras_alcada_etapas (config) / compras_aprovacoes /
-- compras_aprovacao_etapas (runtime) — TÓPICO 7 §22/§23.
-- =========================================================================

create table public.compras_alcada_etapas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  processo text not null,
  ordem smallint not null check (ordem > 0),
  valor_minimo numeric(14, 2) not null check (valor_minimo >= 0),
  role_id uuid not null references public.roles(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compras_alcada_etapas_unique unique (company_id, processo, ordem)
);
comment on table public.compras_alcada_etapas is 'Fase 5 da ADR-011 (TÓPICO 7 §22/§23) — configuração da alçada multi-etapa de Compras, por processo (esta fase usa "cotacao"; Fase 6 reaproveita pra "pedido_compra"). Engine própria, não toca approval_thresholds (T15).';
create index compras_alcada_etapas_company_id_idx on public.compras_alcada_etapas (company_id);

create table public.compras_aprovacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  processo text not null,
  entidade_id uuid not null,
  valor numeric(14, 2) not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
comment on table public.compras_aprovacoes is 'Fase 5 da ADR-011 — instância de aprovação por alçada pra uma entidade de Compras (cotação hoje; pedido de compra na Fase 6). Sem etapa nenhuma aplicável = aprovada automaticamente (mesmo espírito de approval_thresholds: sem alçada configurada não bloqueia).';
create index compras_aprovacoes_company_id_idx on public.compras_aprovacoes (company_id);
create index compras_aprovacoes_entidade_idx on public.compras_aprovacoes (entidade_id);

create table public.compras_aprovacao_etapas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  compra_aprovacao_id uuid not null references public.compras_aprovacoes(id) on delete cascade,
  ordem smallint not null,
  valor_minimo numeric(14, 2) not null,
  role_id uuid not null references public.roles(id),
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada')),
  decidido_por uuid references public.profiles(id),
  decidido_em timestamptz,
  observacao text,
  constraint compras_aprovacao_etapas_unique unique (compra_aprovacao_id, ordem)
);
comment on table public.compras_aprovacao_etapas is 'Fase 5 da ADR-011 — etapa concreta de uma aprovação (snapshot de valor_minimo/role_id no momento da submissão). Decidida em ordem: só a etapa com menor ordem "pendente" é decidível.';
create index compras_aprovacao_etapas_company_id_idx on public.compras_aprovacao_etapas (company_id);
create index compras_aprovacao_etapas_aprovacao_id_idx on public.compras_aprovacao_etapas (compra_aprovacao_id);

alter table public.compras_alcada_etapas enable row level security;
create policy compras_alcada_etapas_select on public.compras_alcada_etapas for select using (company_id = (select public.current_company_id()));
grant select on public.compras_alcada_etapas to authenticated;

alter table public.compras_aprovacoes enable row level security;
create policy compras_aprovacoes_select on public.compras_aprovacoes for select using (company_id = (select public.current_company_id()));
grant select on public.compras_aprovacoes to authenticated;

alter table public.compras_aprovacao_etapas enable row level security;
create policy compras_aprovacao_etapas_select on public.compras_aprovacao_etapas for select using (company_id = (select public.current_company_id()));
grant select on public.compras_aprovacao_etapas to authenticated;

create trigger set_updated_at before update on public.compras_alcada_etapas
  for each row execute function public.set_updated_at();

-- =========================================================================
-- upsert_alcada_compra() / desativar_alcada_compra() — config, gate
-- compras.manage.
-- =========================================================================

create function public.upsert_alcada_compra(
  p_processo text,
  p_ordem smallint,
  p_valor_minimo numeric,
  p_role_id uuid,
  p_ativo boolean default true
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_id uuid;
begin
  if p_ordem is null or p_ordem <= 0 then
    raise exception 'Ordem da etapa deve ser maior que zero.';
  end if;
  if p_valor_minimo is null or p_valor_minimo < 0 then
    raise exception 'Valor mínimo inválido.';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and (company_id = v_company_id or company_id is null)) then
    raise exception 'Perfil aprovador inválido para esta empresa.';
  end if;

  insert into public.compras_alcada_etapas (company_id, processo, ordem, valor_minimo, role_id, ativo)
  values (v_company_id, p_processo, p_ordem, p_valor_minimo, p_role_id, coalesce(p_ativo, true))
  on conflict (company_id, processo, ordem) do update set
    valor_minimo = excluded.valor_minimo,
    role_id = excluded.role_id,
    ativo = excluded.ativo,
    updated_at = now()
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.alcada_definida', 'compras_alcada_etapas', v_id, p_processo);

  return v_id;
end;
$$;

grant execute on function public.upsert_alcada_compra(text, smallint, numeric, uuid, boolean) to authenticated;

create function public.desativar_alcada_compra(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
begin
  update public.compras_alcada_etapas set ativo = false, updated_at = now()
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Etapa de alçada não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.alcada_desativada', 'compras_alcada_etapas', p_id, null);

  return p_id;
end;
$$;

grant execute on function public.desativar_alcada_compra(uuid) to authenticated;

-- =========================================================================
-- submeter_aprovacao_compra() — interna (não concedida a authenticated),
-- só chamada de dentro de concluir_selecao_cotacao() (e, na Fase 6, do
-- fluxo de aprovação do Pedido de Compra). Sem etapa aplicável = aprovada
-- na hora, mesmo espírito de approval_thresholds (T15).
-- =========================================================================

create function public.submeter_aprovacao_compra(p_company_id uuid, p_processo text, p_entidade_id uuid, p_valor numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_aprovacao_id uuid;
  v_etapa record;
  v_qtd_etapas int := 0;
begin
  insert into public.compras_aprovacoes (company_id, processo, entidade_id, valor, status)
  values (p_company_id, p_processo, p_entidade_id, p_valor, 'pendente')
  returning id into v_aprovacao_id;

  for v_etapa in
    select ordem, valor_minimo, role_id from public.compras_alcada_etapas
    where company_id = p_company_id and processo = p_processo and ativo and valor_minimo <= p_valor
    order by ordem
  loop
    insert into public.compras_aprovacao_etapas (company_id, compra_aprovacao_id, ordem, valor_minimo, role_id)
    values (p_company_id, v_aprovacao_id, v_etapa.ordem, v_etapa.valor_minimo, v_etapa.role_id);
    v_qtd_etapas := v_qtd_etapas + 1;
  end loop;

  if v_qtd_etapas = 0 then
    update public.compras_aprovacoes set status = 'aprovada', decided_at = now() where id = v_aprovacao_id;
  end if;

  return v_aprovacao_id;
end;
$$;

create function public.decidir_etapa_aprovacao_compra(p_etapa_id uuid, p_decisao text, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_etapa public.compras_aprovacao_etapas;
  v_pendentes_anteriores int;
  v_pendentes_restantes int;
begin
  if p_decisao not in ('aprovar', 'rejeitar') then
    raise exception 'Decisão inválida: "%".', p_decisao;
  end if;

  select * into v_etapa from public.compras_aprovacao_etapas where id = p_etapa_id and company_id = v_company_id;
  if not found then
    raise exception 'Etapa de aprovação não encontrada nesta empresa.';
  end if;
  if v_etapa.status <> 'pendente' then
    raise exception 'Etapa já foi decidida (status atual: %).', v_etapa.status;
  end if;

  select count(*) into v_pendentes_anteriores from public.compras_aprovacao_etapas
  where compra_aprovacao_id = v_etapa.compra_aprovacao_id and ordem < v_etapa.ordem and status = 'pendente';
  if v_pendentes_anteriores > 0 then
    raise exception 'Existe etapa anterior ainda pendente — a alçada é decidida em ordem.';
  end if;

  if not public.is_platform_admin() and not exists (
    select 1 from public.user_roles ur
    where ur.profile_id = auth.uid() and ur.role_id = v_etapa.role_id
      and ur.valid_from <= now() and (ur.valid_until is null or ur.valid_until > now())
  ) then
    raise exception 'Decisão desta etapa exige o perfil aprovador configurado na alçada.';
  end if;

  update public.compras_aprovacao_etapas
  set status = case p_decisao when 'aprovar' then 'aprovada' else 'rejeitada' end,
      decidido_por = auth.uid(), decidido_em = now(), observacao = p_observacao
  where id = p_etapa_id;

  if p_decisao = 'rejeitar' then
    update public.compras_aprovacoes set status = 'rejeitada', decided_at = now() where id = v_etapa.compra_aprovacao_id;
  else
    select count(*) into v_pendentes_restantes from public.compras_aprovacao_etapas
    where compra_aprovacao_id = v_etapa.compra_aprovacao_id and status = 'pendente';
    if v_pendentes_restantes = 0 then
      update public.compras_aprovacoes set status = 'aprovada', decided_at = now() where id = v_etapa.compra_aprovacao_id;
    end if;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.etapa_aprovacao_decidida', 'compras_aprovacao_etapas', p_etapa_id, p_decisao);

  return p_etapa_id;
end;
$$;

grant execute on function public.decidir_etapa_aprovacao_compra(uuid, text, text) to authenticated;

-- =========================================================================
-- criar_cotacao_de_solicitacao() / registrar_proposta_cotacao() /
-- registrar_negociacao_cotacao() / selecionar_fornecedor_cotacao() /
-- concluir_selecao_cotacao() / cancelar_cotacao() — TÓPICO 7 §16-§23.
-- =========================================================================

create function public.criar_cotacao_de_solicitacao(p_solicitacao_compra_id uuid, p_item_ids uuid[] default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_sc public.solicitacoes_compra;
  v_numero text;
  v_id uuid;
  v_qtd int;
begin
  select * into v_sc from public.solicitacoes_compra where id = p_solicitacao_compra_id and company_id = v_company_id;
  if not found then
    raise exception 'Solicitação de compra não encontrada nesta empresa.';
  end if;
  if v_sc.status <> 'aberta' then
    raise exception 'Só é possível cotar uma solicitação enviada (status atual: %).', v_sc.status;
  end if;

  v_numero := public.next_document_number('cotacao');

  insert into public.cotacoes (company_id, numero, solicitacao_compra_id)
  values (v_company_id, v_numero, p_solicitacao_compra_id)
  returning id into v_id;

  insert into public.cotacao_itens (company_id, cotacao_id, solicitacao_compra_item_id)
  select v_company_id, v_id, sci.id
  from public.solicitacao_compra_itens sci
  where sci.solicitacao_compra_id = p_solicitacao_compra_id
    and (p_item_ids is null or sci.id = any(p_item_ids));

  get diagnostics v_qtd = row_count;
  if v_qtd = 0 then
    raise exception 'Nenhum item válido da solicitação para cotar.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.cotacao_criada', 'cotacao', v_id, v_numero);

  return v_id;
end;
$$;

grant execute on function public.criar_cotacao_de_solicitacao(uuid, uuid[]) to authenticated;

create function public.registrar_proposta_cotacao(
  p_cotacao_item_id uuid,
  p_pessoa_id uuid,
  p_preco_unitario numeric,
  p_desconto numeric default 0,
  p_impostos numeric default 0,
  p_frete numeric default 0,
  p_prazo_entrega_dias integer default null,
  p_condicao_pagamento text default null,
  p_validade date default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_ci public.cotacao_itens;
  v_cotacao public.cotacoes;
  v_sci public.solicitacao_compra_itens;
  v_custo_unitario numeric;
  v_id uuid;
begin
  select * into v_ci from public.cotacao_itens where id = p_cotacao_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de cotação não encontrado nesta empresa.';
  end if;
  select * into v_cotacao from public.cotacoes where id = v_ci.cotacao_id;
  if v_cotacao.status <> 'aberta' then
    raise exception 'Só é possível registrar proposta numa cotação aberta (status atual: %).', v_cotacao.status;
  end if;
  select * into v_sci from public.solicitacao_compra_itens where id = v_ci.solicitacao_compra_item_id;

  if not exists (
    select 1 from public.pessoas p
    join public.pessoa_papeis pp on pp.pessoa_id = p.id
    where p.id = p_pessoa_id and p.company_id = v_company_id and pp.papel = 'FORNECEDOR' and pp.ativo
  ) then
    raise exception 'A pessoa precisa ter o papel FORNECEDOR ativo nesta empresa.';
  end if;
  if p_preco_unitario is null or p_preco_unitario < 0 then
    raise exception 'Preço unitário inválido.';
  end if;

  v_custo_unitario := p_preco_unitario - coalesce(p_desconto, 0) + coalesce(p_impostos, 0) + coalesce(p_frete, 0);

  insert into public.cotacao_propostas (
    company_id, cotacao_item_id, pessoa_id, preco_unitario, desconto, impostos, frete,
    custo_unitario, prazo_entrega_dias, condicao_pagamento, validade
  ) values (
    v_company_id, p_cotacao_item_id, p_pessoa_id, p_preco_unitario, coalesce(p_desconto, 0), coalesce(p_impostos, 0), coalesce(p_frete, 0),
    v_custo_unitario, p_prazo_entrega_dias, p_condicao_pagamento, p_validade
  )
  on conflict (cotacao_item_id, pessoa_id) do update set
    preco_unitario = excluded.preco_unitario,
    desconto = excluded.desconto,
    impostos = excluded.impostos,
    frete = excluded.frete,
    custo_unitario = excluded.custo_unitario,
    prazo_entrega_dias = excluded.prazo_entrega_dias,
    condicao_pagamento = excluded.condicao_pagamento,
    validade = excluded.validade,
    updated_at = now()
  returning id into v_id;

  insert into public.historico_precos_item_fornecedor (company_id, item_id, pessoa_id, preco, cotacao_id)
  values (v_company_id, v_sci.item_id, p_pessoa_id, p_preco_unitario, v_cotacao.id);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.proposta_registrada', 'cotacao_proposta', v_id, null);

  return v_id;
end;
$$;

grant execute on function public.registrar_proposta_cotacao(uuid, uuid, numeric, numeric, numeric, numeric, integer, text, date) to authenticated;

create function public.registrar_negociacao_cotacao(
  p_cotacao_proposta_id uuid,
  p_preco_novo numeric,
  p_condicao_nova text default null,
  p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_proposta public.cotacao_propostas;
  v_cotacao_id uuid;
  v_status text;
  v_rodada smallint;
  v_id uuid;
begin
  select * into v_proposta from public.cotacao_propostas where id = p_cotacao_proposta_id and company_id = v_company_id;
  if not found then
    raise exception 'Proposta de cotação não encontrada nesta empresa.';
  end if;
  select c.status, c.id into v_status, v_cotacao_id
  from public.cotacao_itens ci join public.cotacoes c on c.id = ci.cotacao_id
  where ci.id = v_proposta.cotacao_item_id;
  if v_status <> 'aberta' then
    raise exception 'Só é possível negociar numa cotação aberta (status atual: %).', v_status;
  end if;
  if p_preco_novo is null or p_preco_novo < 0 then
    raise exception 'Preço novo inválido.';
  end if;

  select coalesce(max(rodada), 0) + 1 into v_rodada from public.cotacao_negociacoes where cotacao_proposta_id = p_cotacao_proposta_id;

  insert into public.cotacao_negociacoes (
    company_id, cotacao_proposta_id, rodada, preco_anterior, preco_novo, condicao_anterior, condicao_nova, observacao, created_by
  ) values (
    v_company_id, p_cotacao_proposta_id, v_rodada, v_proposta.preco_unitario, p_preco_novo,
    v_proposta.condicao_pagamento, coalesce(p_condicao_nova, v_proposta.condicao_pagamento), p_observacao, auth.uid()
  )
  returning id into v_id;

  update public.cotacao_propostas
  set preco_unitario = p_preco_novo,
      custo_unitario = p_preco_novo - desconto + impostos + frete,
      condicao_pagamento = coalesce(p_condicao_nova, condicao_pagamento),
      updated_at = now()
  where id = p_cotacao_proposta_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'compras.negociacao_registrada', 'cotacao_proposta', p_cotacao_proposta_id, p_observacao,
    jsonb_build_object('preco_anterior', v_proposta.preco_unitario, 'preco_novo', p_preco_novo, 'economia', v_proposta.preco_unitario - p_preco_novo)
  );

  return v_id;
end;
$$;

grant execute on function public.registrar_negociacao_cotacao(uuid, numeric, text, text) to authenticated;

create function public.selecionar_fornecedor_cotacao(
  p_cotacao_item_id uuid,
  p_cotacao_proposta_id uuid,
  p_quantidade numeric,
  p_justificativa text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_ci public.cotacao_itens;
  v_cotacao public.cotacoes;
  v_sci public.solicitacao_compra_itens;
  v_proposta public.cotacao_propostas;
  v_ja_selecionado numeric;
  v_id uuid;
begin
  select * into v_ci from public.cotacao_itens where id = p_cotacao_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de cotação não encontrado nesta empresa.';
  end if;
  select * into v_cotacao from public.cotacoes where id = v_ci.cotacao_id;
  if v_cotacao.status <> 'aberta' then
    raise exception 'Só é possível selecionar fornecedor numa cotação aberta (status atual: %).', v_cotacao.status;
  end if;
  select * into v_proposta from public.cotacao_propostas where id = p_cotacao_proposta_id and cotacao_item_id = p_cotacao_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Proposta não encontrada para este item de cotação.';
  end if;
  select * into v_sci from public.solicitacao_compra_itens where id = v_ci.solicitacao_compra_item_id;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if p_justificativa is null or btrim(p_justificativa) = '' then
    raise exception 'Justificativa é obrigatória para selecionar fornecedor (mesmo quando não é o de menor custo).';
  end if;

  select coalesce(sum(quantidade), 0) into v_ja_selecionado from public.cotacao_selecoes where cotacao_item_id = p_cotacao_item_id;
  if v_ja_selecionado + p_quantidade > v_sci.quantidade then
    raise exception 'Quantidade selecionada (%) excede a quantidade do item (%, já % selecionado).', p_quantidade, v_sci.quantidade, v_ja_selecionado;
  end if;

  insert into public.cotacao_selecoes (company_id, cotacao_item_id, cotacao_proposta_id, quantidade, justificativa, created_by)
  values (v_company_id, p_cotacao_item_id, p_cotacao_proposta_id, p_quantidade, p_justificativa, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.fornecedor_selecionado', 'cotacao_selecao', v_id, p_justificativa);

  return v_id;
end;
$$;

grant execute on function public.selecionar_fornecedor_cotacao(uuid, uuid, numeric, text) to authenticated;

create function public.concluir_selecao_cotacao(p_cotacao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_cotacao public.cotacoes;
  v_pendente record;
  v_valor_total numeric;
  v_aprovacao_id uuid;
begin
  select * into v_cotacao from public.cotacoes where id = p_cotacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Cotação não encontrada nesta empresa.';
  end if;
  if v_cotacao.status <> 'aberta' then
    raise exception 'Cotação já foi concluída ou cancelada (status atual: %).', v_cotacao.status;
  end if;

  select ci.id, sci.quantidade as necessario, coalesce(sum(cs.quantidade), 0) as selecionado
  into v_pendente
  from public.cotacao_itens ci
  join public.solicitacao_compra_itens sci on sci.id = ci.solicitacao_compra_item_id
  left join public.cotacao_selecoes cs on cs.cotacao_item_id = ci.id
  where ci.cotacao_id = p_cotacao_id
  group by ci.id, sci.quantidade
  having coalesce(sum(cs.quantidade), 0) <> sci.quantidade
  limit 1;

  if found then
    raise exception 'Existe item da cotação sem seleção completa (item de cotação %).', v_pendente.id;
  end if;

  select sum(cs.quantidade * cp.custo_unitario) into v_valor_total
  from public.cotacao_selecoes cs
  join public.cotacao_propostas cp on cp.id = cs.cotacao_proposta_id
  join public.cotacao_itens ci on ci.id = cs.cotacao_item_id
  where ci.cotacao_id = p_cotacao_id;

  v_aprovacao_id := public.submeter_aprovacao_compra(v_company_id, 'cotacao', p_cotacao_id, coalesce(v_valor_total, 0));

  update public.cotacoes set status = 'selecionada', aprovacao_id = v_aprovacao_id where id = p_cotacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'compras.cotacao_selecionada', 'cotacao', p_cotacao_id, v_cotacao.numero,
    jsonb_build_object('valor_total', v_valor_total, 'aprovacao_id', v_aprovacao_id)
  );

  return p_cotacao_id;
end;
$$;

grant execute on function public.concluir_selecao_cotacao(uuid) to authenticated;

create function public.cancelar_cotacao(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
begin
  update public.cotacoes set status = 'cancelada', motivo_cancelamento = p_motivo
  where id = p_id and company_id = v_company_id and status = 'aberta';
  if not found then
    raise exception 'Cotação aberta não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.cotacao_cancelada', 'cotacao', p_id, p_motivo);

  return p_id;
end;
$$;

grant execute on function public.cancelar_cotacao(uuid, text) to authenticated;
