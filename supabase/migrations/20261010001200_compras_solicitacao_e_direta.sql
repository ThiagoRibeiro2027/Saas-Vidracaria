-- Compras completo (T7) — Fase 4 da ADR-011 (docs/ADR-011 — Compras
-- v1.0.md): Solicitação de Compra (SC) e Compras Diretas (TÓPICO 7 §16,
-- §2). Depende da Fase 3 (SC/compra direta consomem `necessidades_compra`
-- via `atender_necessidade_compra()` já existente — decisão 1 da ADR-011,
-- convergência de fluxo).
--
-- Momento em que uma necessidade vinculada é "atendida": só quando a SC
-- é efetivamente enviada (enviar_solicitacao_compra), nunca ao adicionar
-- item num rascunho — rascunho é só edição local, sem efeito colateral
-- fora da própria SC, mesmo princípio já usado em orçamento (rascunho
-- editável, só orçamento aprovado converte em pedido) e BOM sugerida
-- (editável até aprovar_bom_definitiva). Compra direta não tem rascunho
-- — é um registro já decidido no ato (bypass deliberado da SC), então
-- atende a necessidade vinculada na hora da criação.
--
-- Campos obrigatórios/opcionais de compra direta (ADR-011 §5): a ADR
-- deixou em aberto um "default" para configuração por empresa, sem
-- pedir configurabilidade completa nesta fase (não existe nenhum
-- mecanismo de campo obrigatório configurável por empresa em lugar
-- nenhum do projeto ainda). O default fixo desta fase: item, quantidade,
-- motivo (lista fixa) e justificativa são sempre obrigatórios;
-- necessidade_compra_id é opcional. Configurabilidade por empresa fica
-- para uma fase futura, se e quando for pedida.

insert into public.numbering_document_types (document_type, resource, action) values
  ('solicitacao_compra', 'compras', 'manage');

create table public.solicitacoes_compra (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  numero text not null,
  solicitante_id uuid not null references public.profiles(id),
  setor text,
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  justificativa text,
  status text not null default 'rascunho' check (status in ('rascunho', 'aberta', 'cancelada')),
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solicitacoes_compra_numero_unique unique (company_id, numero)
);
comment on table public.solicitacoes_compra is 'Fase 4 da ADR-011 (TÓPICO 7 §16) — Solicitação de Compra. rascunho: editável (itens); aberta: enviada, cada item com necessidade_compra_id vinculada já chamou atender_necessidade_compra(); cancelada: de rascunho ou aberta, sem reverter necessidade já atendida (ver nota da migration).';
create index solicitacoes_compra_company_id_idx on public.solicitacoes_compra (company_id);

create table public.solicitacao_compra_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  solicitacao_compra_id uuid not null references public.solicitacoes_compra(id) on delete cascade,
  item_id uuid not null references public.itens(id),
  quantidade numeric(14, 4) not null check (quantidade > 0),
  data_necessaria date,
  aplicacao text,
  necessidade_compra_id uuid references public.necessidades_compra(id),
  observacoes text,
  created_at timestamptz not null default now()
);
comment on table public.solicitacao_compra_itens is 'Fase 4 da ADR-011 — item de uma SC. necessidade_compra_id opcional: quando presente, a necessidade precisa pertencer ao mesmo item e estar aberta (checado em adicionar_item_solicitacao()); é atendida só quando a SC é enviada.';
create index solicitacao_compra_itens_company_id_idx on public.solicitacao_compra_itens (company_id);
create index solicitacao_compra_itens_solicitacao_id_idx on public.solicitacao_compra_itens (solicitacao_compra_id);

alter table public.solicitacoes_compra enable row level security;
create policy solicitacoes_compra_select on public.solicitacoes_compra for select
  using (company_id = (select public.current_company_id()));
grant select on public.solicitacoes_compra to authenticated;

alter table public.solicitacao_compra_itens enable row level security;
create policy solicitacao_compra_itens_select on public.solicitacao_compra_itens for select
  using (company_id = (select public.current_company_id()));
grant select on public.solicitacao_compra_itens to authenticated;

create trigger set_updated_at before update on public.solicitacoes_compra
  for each row execute function public.set_updated_at();

-- =========================================================================
-- criar_solicitacao_compra() / adicionar_item_solicitacao() /
-- remover_item_solicitacao() / enviar_solicitacao_compra() /
-- cancelar_solicitacao_compra() — gate compras.manage.
-- =========================================================================

create function public.criar_solicitacao_compra(
  p_setor text default null,
  p_prioridade text default 'normal',
  p_justificativa text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_numero text;
  v_id uuid;
begin
  if p_prioridade not in ('baixa', 'normal', 'alta', 'urgente') then
    raise exception 'Prioridade inválida: "%".', p_prioridade;
  end if;

  v_numero := public.next_document_number('solicitacao_compra');

  insert into public.solicitacoes_compra (company_id, numero, solicitante_id, setor, prioridade, justificativa)
  values (v_company_id, v_numero, auth.uid(), p_setor, p_prioridade, p_justificativa)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.solicitacao_criada', 'solicitacao_compra', v_id, v_numero);

  return v_id;
end;
$$;

grant execute on function public.criar_solicitacao_compra(text, text, text) to authenticated;

create function public.adicionar_item_solicitacao(
  p_solicitacao_compra_id uuid,
  p_item_id uuid,
  p_quantidade numeric,
  p_data_necessaria date default null,
  p_aplicacao text default null,
  p_necessidade_compra_id uuid default null,
  p_observacoes text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_sc public.solicitacoes_compra;
  v_id uuid;
begin
  select * into v_sc from public.solicitacoes_compra where id = p_solicitacao_compra_id and company_id = v_company_id;
  if not found then
    raise exception 'Solicitação de compra não encontrada nesta empresa.';
  end if;
  if v_sc.status <> 'rascunho' then
    raise exception 'Só é possível adicionar item a uma solicitação em rascunho (status atual: %).', v_sc.status;
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if p_necessidade_compra_id is not null and not exists (
    select 1 from public.necessidades_compra
    where id = p_necessidade_compra_id and company_id = v_company_id and item_id = p_item_id and status = 'aberta'
  ) then
    raise exception 'Necessidade de compra não encontrada, não é do mesmo item ou não está aberta.';
  end if;

  insert into public.solicitacao_compra_itens (
    company_id, solicitacao_compra_id, item_id, quantidade, data_necessaria, aplicacao, necessidade_compra_id, observacoes
  ) values (
    v_company_id, p_solicitacao_compra_id, p_item_id, p_quantidade, p_data_necessaria, p_aplicacao, p_necessidade_compra_id, p_observacoes
  )
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.solicitacao_item_adicionado', 'solicitacao_compra', p_solicitacao_compra_id, null);

  return v_id;
end;
$$;

grant execute on function public.adicionar_item_solicitacao(uuid, uuid, numeric, date, text, uuid, text) to authenticated;

create function public.remover_item_solicitacao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_item public.solicitacao_compra_itens;
  v_sc public.solicitacoes_compra;
begin
  select * into v_item from public.solicitacao_compra_itens where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de solicitação não encontrado nesta empresa.';
  end if;
  select * into v_sc from public.solicitacoes_compra where id = v_item.solicitacao_compra_id;
  if v_sc.status <> 'rascunho' then
    raise exception 'Só é possível remover item de uma solicitação em rascunho (status atual: %).', v_sc.status;
  end if;

  delete from public.solicitacao_compra_itens where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.solicitacao_item_removido', 'solicitacao_compra', v_item.solicitacao_compra_id, null);

  return p_id;
end;
$$;

grant execute on function public.remover_item_solicitacao(uuid) to authenticated;

create function public.enviar_solicitacao_compra(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_sc public.solicitacoes_compra;
  v_qtd_itens int;
  v_item record;
begin
  select * into v_sc from public.solicitacoes_compra where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Solicitação de compra não encontrada nesta empresa.';
  end if;
  if v_sc.status <> 'rascunho' then
    raise exception 'Só é possível enviar uma solicitação em rascunho (status atual: %).', v_sc.status;
  end if;

  select count(*) into v_qtd_itens from public.solicitacao_compra_itens where solicitacao_compra_id = p_id;
  if v_qtd_itens = 0 then
    raise exception 'Solicitação sem itens não pode ser enviada.';
  end if;

  for v_item in
    select necessidade_compra_id from public.solicitacao_compra_itens
    where solicitacao_compra_id = p_id and necessidade_compra_id is not null
  loop
    perform public.atender_necessidade_compra(v_item.necessidade_compra_id);
  end loop;

  update public.solicitacoes_compra set status = 'aberta' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.solicitacao_enviada', 'solicitacao_compra', p_id, v_sc.numero);

  return p_id;
end;
$$;

grant execute on function public.enviar_solicitacao_compra(uuid) to authenticated;

create function public.cancelar_solicitacao_compra(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_sc public.solicitacoes_compra;
begin
  select * into v_sc from public.solicitacoes_compra where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Solicitação de compra não encontrada nesta empresa.';
  end if;
  if v_sc.status not in ('rascunho', 'aberta') then
    raise exception 'Solicitação já está cancelada.';
  end if;

  update public.solicitacoes_compra set status = 'cancelada', motivo_cancelamento = p_motivo where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.solicitacao_cancelada', 'solicitacao_compra', p_id, p_motivo);

  return p_id;
end;
$$;

grant execute on function public.cancelar_solicitacao_compra(uuid, text) to authenticated;

-- =========================================================================
-- compras_diretas — TÓPICO 7 §2. Registro já decidido no ato (bypass
-- deliberado da SC), sem rascunho — atende a necessidade vinculada na
-- hora da criação, se houver.
-- =========================================================================

create table public.compras_diretas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null references public.itens(id),
  quantidade numeric(14, 4) not null check (quantidade > 0),
  motivo text not null check (motivo in ('urgencia', 'baixo_valor', 'item_nao_recorrente', 'outro')),
  justificativa text not null,
  responsavel_id uuid not null references public.profiles(id),
  necessidade_compra_id uuid references public.necessidades_compra(id),
  status text not null default 'registrada' check (status in ('registrada', 'cancelada')),
  motivo_cancelamento text,
  created_at timestamptz not null default now()
);
comment on table public.compras_diretas is 'Fase 4 da ADR-011 (TÓPICO 7 §2) — compra direta, bypass deliberado da Solicitação de Compra. motivo/justificativa sempre obrigatórios (default fixo desta fase, ver nota da migration); configurabilidade por empresa fica para fase futura.';
create index compras_diretas_company_id_idx on public.compras_diretas (company_id);

alter table public.compras_diretas enable row level security;
create policy compras_diretas_select on public.compras_diretas for select
  using (company_id = (select public.current_company_id()));
grant select on public.compras_diretas to authenticated;

create function public.criar_compra_direta(
  p_item_id uuid,
  p_quantidade numeric,
  p_motivo text,
  p_justificativa text,
  p_necessidade_compra_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_id uuid;
begin
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if p_motivo not in ('urgencia', 'baixo_valor', 'item_nao_recorrente', 'outro') then
    raise exception 'Motivo inválido: "%".', p_motivo;
  end if;
  if p_justificativa is null or btrim(p_justificativa) = '' then
    raise exception 'Justificativa é obrigatória para compra direta.';
  end if;
  if p_necessidade_compra_id is not null and not exists (
    select 1 from public.necessidades_compra
    where id = p_necessidade_compra_id and company_id = v_company_id and item_id = p_item_id and status = 'aberta'
  ) then
    raise exception 'Necessidade de compra não encontrada, não é do mesmo item ou não está aberta.';
  end if;

  if p_necessidade_compra_id is not null then
    perform public.atender_necessidade_compra(p_necessidade_compra_id);
  end if;

  insert into public.compras_diretas (
    company_id, item_id, quantidade, motivo, justificativa, responsavel_id, necessidade_compra_id
  ) values (
    v_company_id, p_item_id, p_quantidade, p_motivo, p_justificativa, auth.uid(), p_necessidade_compra_id
  )
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'compras.compra_direta_registrada', 'compras_diretas', v_id, p_justificativa,
    jsonb_build_object('item_id', p_item_id, 'quantidade', p_quantidade, 'motivo', p_motivo)
  );

  return v_id;
end;
$$;

grant execute on function public.criar_compra_direta(uuid, numeric, text, text, uuid) to authenticated;

create function public.cancelar_compra_direta(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
begin
  update public.compras_diretas set status = 'cancelada', motivo_cancelamento = p_motivo
  where id = p_id and company_id = v_company_id and status = 'registrada';
  if not found then
    raise exception 'Compra direta registrada não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.compra_direta_cancelada', 'compras_diretas', p_id, p_motivo);

  return p_id;
end;
$$;

grant execute on function public.cancelar_compra_direta(uuid, text) to authenticated;
