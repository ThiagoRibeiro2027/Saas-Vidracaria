-- TÓPICO 10 — Comercial, recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO
-- PILOTO v1.0, outubro: "entrada do pedido", sequência T2 → T10 → T3).
--
-- Recorte decidido em 13/09/2026: "orçamento simples e conversão em
-- pedido, preservando rastreabilidade. Sem tabela de preços, comissões ou
-- descontos avançados" (PLANO §4). Dentro desse recorte, dois cortes
-- adicionais confirmados com o responsável do produto:
--
--   1. Esta migration entrega só o orçamento (cabeçalho + itens + decisão).
--      A tabela `pedidos` e a função de conversão de verdade são do
--      TÓPICO 3, que ainda não existe — entram na próxima migration, não
--      aqui. "Convertido em pedido" fica de fora da lista de status por
--      enquanto: um orçamento aprovado é o suficiente para T3 consumir.
--   2. Sem versionamento (TÓPICO 10 §20/§43 — V1/V2/V3, nunca sobrescrever
--      versão enviada/aprovada). Um orçamento tem status único: rascunho é
--      editável livremente; aprovado/rejeitado/cancelado são terminais e a
--      escrita bloqueia qualquer alteração de cabeçalho ou item — corrigir
--      significa cancelar e criar outro orçamento. Histórico de
--      negociação/propostas fica para quando o Comercial completo entrar
--      (M3/M4, PLANO §6).
--
-- Também fora deste recorte, por não serem "conversão em pedido" nem
-- rastreabilidade básica: oportunidades/funil (§3), atividades/follow-up
-- (§6), produtos configuráveis (§9), engenharia (§10-11), formação de
-- custo/margem/markup (§12-14), descontos (§15), cenários (§16), tabelas
-- de preço (§17-18), proposta/PDF/identidade visual (§23-27), aceite do
-- cliente (§27), aprovação parcial por item (§28), indicadores (§37-39),
-- concorrência (§40).
--
-- Alçada de aprovação: reaproveita approval_thresholds (TÓPICO 15 §8, já
-- criada sem consumidor) com processo='orcamento' — primeiro consumidor
-- real dessa tabela.

create table public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  numero text not null,
  pessoa_id uuid not null references public.pessoas(id),
  obra_id uuid references public.obras(id),
  responsavel_id uuid not null references public.profiles(id),
  data_orcamento date not null default current_date,
  validade date,
  condicao_comercial text,
  status text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'rejeitado', 'cancelado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orcamentos_company_numero_unique unique (company_id, numero)
);
comment on table public.orcamentos is 'TÓPICO 10, recorte mínimo — sem versionamento (ver cabeçalho da migration). status rascunho é o único editável; os demais são terminais.';
create index orcamentos_pessoa_id_idx on public.orcamentos (pessoa_id);
create index orcamentos_obra_id_idx on public.orcamentos (obra_id);

create table public.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  item_id uuid not null references public.itens(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  preco_unitario numeric(14, 2) not null check (preco_unitario >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.orcamento_itens is 'TÓPICO 10 §7-8 — sem tabela de preços/descontos (recorte de M1): preco_unitario é digitado livremente por quem monta o orçamento.';
-- ADR-009 §3.1: FK de junção precisa de índice próprio — orcamento_id
-- entra em toda query da tela (listar itens de um orçamento) e no lock
-- usado por decidir_orcamento/upsert_orcamento_item.
create index orcamento_itens_orcamento_id_idx on public.orcamento_itens (orcamento_id);
create index orcamento_itens_item_id_idx on public.orcamento_itens (item_id);

create trigger set_updated_at before update on public.orcamentos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.orcamento_itens
  for each row execute function public.set_updated_at();

alter table public.orcamentos enable row level security;
alter table public.orcamento_itens enable row level security;

-- SELECT liberado a qualquer autenticado da empresa, sem exigir
-- orcamentos.view — mesmo padrão de T2/T15: o módulo futuro T3 (Pedidos)
-- vai precisar ler orçamentos aprovados sem que seu usuário
-- necessariamente administre o Comercial. orcamentos.view/.manage gate a
-- TELA, não a leitura da RLS.
create policy orcamentos_select on public.orcamentos for select
  using (company_id = (select public.current_company_id()));
create policy orcamento_itens_select on public.orcamento_itens for select
  using (exists (
    select 1 from public.orcamentos o
    where o.id = orcamento_itens.orcamento_id
      and o.company_id = (select public.current_company_id())
  ));

grant select on public.orcamentos to authenticated;
grant select on public.orcamento_itens to authenticated;

-- =========================================================================
-- upsert_orcamento() — cabeçalho. Só edita enquanto status='rascunho'.
-- =========================================================================

create or replace function public.upsert_orcamento(
  p_id uuid,
  p_pessoa_id uuid,
  p_obra_id uuid,
  p_validade date,
  p_condicao_comercial text,
  p_observacoes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.orcamentos;
  v_id uuid;
  v_numero text;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para gerenciar orçamentos (orcamentos.manage).';
  end if;
  if not exists (
    select 1 from public.pessoas p
    join public.pessoa_papeis pp on pp.pessoa_id = p.id
    where p.id = p_pessoa_id and p.company_id = v_company_id
      and pp.papel = 'CLIENTE' and pp.ativo
  ) then
    raise exception 'A pessoa vinculada ao orçamento precisa ter o papel CLIENTE ativo.';
  end if;
  if p_obra_id is not null and not exists (
    select 1 from public.obras where id = p_obra_id and company_id = v_company_id and pessoa_id = p_pessoa_id
  ) then
    raise exception 'A obra informada não pertence a esta empresa ou não é desta pessoa.';
  end if;

  if p_id is not null then
    select * into v_before from public.orcamentos
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Orçamento não encontrado nesta empresa.';
    end if;
    if v_before.status <> 'rascunho' then
      raise exception 'Só é possível editar orçamento em rascunho (status atual: %).', v_before.status;
    end if;

    update public.orcamentos set
      pessoa_id = p_pessoa_id, obra_id = p_obra_id, validade = p_validade,
      condicao_comercial = p_condicao_comercial, observacoes = p_observacoes
    where id = p_id
    returning id into v_id;
    v_numero := v_before.numero;
  else
    v_numero := public.next_document_number('orcamento');
    insert into public.orcamentos (
      company_id, numero, pessoa_id, obra_id, responsavel_id, validade, condicao_comercial, observacoes
    ) values (
      v_company_id, v_numero, p_pessoa_id, p_obra_id, auth.uid(), p_validade, p_condicao_comercial, p_observacoes
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_upserted', 'orcamento', v_id, v_numero,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'pessoa_id', p_pessoa_id, 'obra_id', p_obra_id, 'validade', p_validade
    ))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_orcamento(uuid, uuid, uuid, date, text, text) to authenticated;

-- =========================================================================
-- upsert_orcamento_item() / remove_orcamento_item() — só em orçamento
-- rascunho. FOR UPDATE no orçamento evita corrida com decidir_orcamento
-- (mesma linha, mesmo padrão de lock usado em upsert_numbering_sequence).
-- =========================================================================

create or replace function public.upsert_orcamento_item(
  p_id uuid,
  p_orcamento_id uuid,
  p_item_id uuid,
  p_quantidade numeric,
  p_preco_unitario numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_orcamento public.orcamentos;
  v_before public.orcamento_itens;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para gerenciar orçamentos (orcamentos.manage).';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if p_preco_unitario is null or p_preco_unitario < 0 then
    raise exception 'Preço unitário inválido.';
  end if;

  select * into v_orcamento from public.orcamentos
  where id = p_orcamento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'rascunho' then
    raise exception 'Só é possível alterar itens de orçamento em rascunho (status atual: %).', v_orcamento.status;
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id and situacao = 'ativo') then
    raise exception 'Item não encontrado ou inativo nesta empresa.';
  end if;

  if p_id is not null then
    select * into v_before from public.orcamento_itens
    where id = p_id and orcamento_id = p_orcamento_id
    for update;
    if not found then
      raise exception 'Item do orçamento não encontrado.';
    end if;

    update public.orcamento_itens set
      item_id = p_item_id, quantidade = p_quantidade, preco_unitario = p_preco_unitario
    where id = p_id
    returning id into v_id;
  else
    insert into public.orcamento_itens (orcamento_id, item_id, quantidade, preco_unitario)
    values (p_orcamento_id, p_item_id, p_quantidade, p_preco_unitario)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_item_upserted', 'orcamento_item', v_id, v_orcamento.numero,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'orcamento_id', p_orcamento_id, 'item_id', p_item_id, 'quantidade', p_quantidade, 'preco_unitario', p_preco_unitario
    ))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_orcamento_item(uuid, uuid, uuid, numeric, numeric) to authenticated;

create or replace function public.remove_orcamento_item(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_item public.orcamento_itens;
  v_orcamento public.orcamentos;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para gerenciar orçamentos (orcamentos.manage).';
  end if;

  select oi.* into v_item from public.orcamento_itens oi
  join public.orcamentos o on o.id = oi.orcamento_id
  where oi.id = p_id and o.company_id = v_company_id;
  if not found then
    raise exception 'Item do orçamento não encontrado nesta empresa.';
  end if;

  select * into v_orcamento from public.orcamentos where id = v_item.orcamento_id for update;
  if v_orcamento.status <> 'rascunho' then
    raise exception 'Só é possível remover item de orçamento em rascunho (status atual: %).', v_orcamento.status;
  end if;

  delete from public.orcamento_itens where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_item_removed', 'orcamento_item', p_id, v_orcamento.numero,
    jsonb_build_object('before', to_jsonb(v_item))
  );
end;
$$;

grant execute on function public.remove_orcamento_item(uuid) to authenticated;

-- =========================================================================
-- decidir_orcamento() — aprova ou rejeita um rascunho. Acima da alçada
-- configurada (approval_thresholds, TÓPICO 15 §8), exige que quem decide
-- tenha o papel aprovador, além de orcamentos.manage.
-- =========================================================================

create or replace function public.decidir_orcamento(
  p_id uuid,
  p_decisao text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.orcamentos;
  v_total numeric;
  v_threshold public.approval_thresholds;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para gerenciar orçamentos (orcamentos.manage).';
  end if;
  if p_decisao not in ('aprovado', 'rejeitado') then
    raise exception 'Decisão inválida: "%".', p_decisao;
  end if;

  select * into v_before from public.orcamentos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_before.status <> 'rascunho' then
    raise exception 'Só é possível decidir orçamento em rascunho (status atual: %).', v_before.status;
  end if;

  select coalesce(sum(quantidade * preco_unitario), 0) into v_total
  from public.orcamento_itens where orcamento_id = p_id;

  if p_decisao = 'aprovado' then
    if v_total <= 0 then
      raise exception 'Orçamento sem itens não pode ser aprovado.';
    end if;

    select * into v_threshold from public.approval_thresholds
    where company_id = v_company_id and processo = 'orcamento' and ativo;

    if found and v_total >= v_threshold.valor_minimo and not public.is_platform_admin() then
      if not exists (
        select 1 from public.user_roles ur
        where ur.profile_id = auth.uid() and ur.role_id = v_threshold.role_id
          and ur.valid_from <= now() and (ur.valid_until is null or ur.valid_until > now())
      ) then
        raise exception 'Aprovação de orçamento a partir de R$ % exige o perfil aprovador configurado em Configurações.', v_threshold.valor_minimo;
      end if;
    end if;
  end if;

  update public.orcamentos set status = p_decisao where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_decidido', 'orcamento', p_id, v_before.numero,
    jsonb_build_object('decisao', p_decisao, 'valor_total', v_total)
  );

  return p_id;
end;
$$;

grant execute on function public.decidir_orcamento(uuid, text) to authenticated;

-- =========================================================================
-- cancelar_orcamento() — de rascunho ou aprovado. Não cancela um já
-- rejeitado/cancelado (já são terminais, nada a fazer).
-- =========================================================================

create or replace function public.cancelar_orcamento(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.orcamentos;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para gerenciar orçamentos (orcamentos.manage).';
  end if;

  select * into v_before from public.orcamentos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_before.status not in ('rascunho', 'aprovado') then
    raise exception 'Orçamento com status "%" não pode ser cancelado.', v_before.status;
  end if;

  update public.orcamentos set status = 'cancelado' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_cancelado', 'orcamento', p_id, v_before.numero,
    jsonb_build_object('status_anterior', v_before.status)
  );

  return p_id;
end;
$$;

grant execute on function public.cancelar_orcamento(uuid) to authenticated;
