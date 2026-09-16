-- TÓPICO 7 — Suprimentos e Compras, recorte mínimo do MVP (não é o corte
-- de M1 — é o próximo módulo depois dele, PLANO DE ENTREGA §6 previa pro
-- M2, mas essa mesma linha do PLANO usava por engano o número "T18"
-- (corrigido nesta sessão; T18 é Contratos, T7 é Suprimentos e Compras —
-- o cabeçalho de 20260913230000_topico6_estoque.sql já carregava o mesmo
-- erro de numeração antes desta correção).
--
-- ADR-002 §4.18 é taxativo e prevalece sobre o PLANO (hierarquia definida
-- no próprio CLAUDE.md do projeto): "O módulo completo de Compras não
-- fará parte do MVP." Quando houver necessidade de aquisição, o MVP só
-- precisa permitir: registrar a necessidade; identificar o material;
-- registrar a quantidade; permitir acompanhamento. "A efetivação da
-- compra poderá ocorrer fora do SaaS durante o MVP." ADR-002 §5 lista
-- "Compras completas" explicitamente fora do MVP.
--
-- Por isso este recorte é só necessidades_compra — sem fornecedor,
-- cotação, pedido de compra, recebimento ou entrada em estoque (essas
-- ficam pro TÓPICO 7 completo — 39 subseções — quando o módulo de Compras
-- for decidido para uma fase futura, fora do MVP). Nenhum novo ramo em
-- next_document_number(): isto é um registro de acompanhamento interno,
-- não um documento formal como orçamento/pedido/OP/expedição/instalação.
--
-- Sem tabela nova em T6 (Estoque) nem alteração nela: como a efetivação
-- da compra é fora do SaaS neste recorte, não existe "recebimento" a
-- registrar aqui — nenhuma entrada de estoque decorre de uma necessidade
-- de compra atendida.

create table public.necessidades_compra (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null references public.itens(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  data_necessaria date,
  origem text not null default 'manual' check (origem in ('pedido', 'producao', 'manual')),
  status text not null default 'aberta' check (status in ('aberta', 'atendida', 'cancelada')),
  observacoes text,
  motivo_cancelamento text,
  criado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.necessidades_compra is
  'TÓPICO 7, recorte mínimo do MVP (ADR-002 §4.18) — só o registro e acompanhamento da necessidade de material. Sem fornecedor/cotação/pedido de compra/recebimento: a efetivação da compra acontece fora do SaaS neste recorte.';
create index necessidades_compra_company_id_idx on public.necessidades_compra (company_id);
create index necessidades_compra_item_id_idx on public.necessidades_compra (item_id);
create index necessidades_compra_status_idx on public.necessidades_compra (status);

create trigger set_updated_at before update on public.necessidades_compra
  for each row execute function public.set_updated_at();

-- SELECT liberado a qualquer autenticado da empresa, sem exigir
-- suprimentos.view — mesmo padrão de T2/T5/T9/T16: outro módulo pode
-- precisar ler sem administrar Suprimentos.
alter table public.necessidades_compra enable row level security;
create policy necessidades_compra_select on public.necessidades_compra for select
  using (company_id = (select public.current_company_id()));

grant select on public.necessidades_compra to authenticated;

-- =========================================================================
-- criar_necessidade_compra() / atender_necessidade_compra() /
-- cancelar_necessidade_compra() — mesmo padrão de 3 guardas via
-- assert_tenant_write() e auditoria direta em activity_logs (T2-T16).
-- =========================================================================

create or replace function public.criar_necessidade_compra(
  p_item_id uuid,
  p_quantidade numeric,
  p_data_necessaria date default null,
  p_origem text default 'manual',
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_id uuid;
begin
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if p_quantidade <= 0 then
    raise exception 'Quantidade precisa ser maior que zero.';
  end if;
  if p_origem not in ('pedido', 'producao', 'manual') then
    raise exception 'Origem inválida: "%".', p_origem;
  end if;

  insert into public.necessidades_compra (company_id, item_id, quantidade, data_necessaria, origem, observacoes, criado_por)
  values (v_company_id, p_item_id, p_quantidade, p_data_necessaria, p_origem, p_observacoes, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'suprimentos.necessidade_criada', 'necessidade_compra', v_id, p_observacoes,
    jsonb_build_object('item_id', p_item_id, 'quantidade', p_quantidade, 'origem', p_origem)
  );

  return v_id;
end;
$$;

grant execute on function public.criar_necessidade_compra(uuid, numeric, date, text, text) to authenticated;

create or replace function public.atender_necessidade_compra(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_status text;
begin
  select status into v_status from public.necessidades_compra
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Necessidade de compra não encontrada nesta empresa.';
  end if;
  if v_status <> 'aberta' then
    raise exception 'Só é possível atender necessidade aberta (status atual: %).', v_status;
  end if;

  update public.necessidades_compra set status = 'atendida' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'suprimentos.necessidade_atendida', 'necessidade_compra', p_id, null, null);

  return p_id;
end;
$$;

grant execute on function public.atender_necessidade_compra(uuid) to authenticated;

create or replace function public.cancelar_necessidade_compra(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_status text;
begin
  select status into v_status from public.necessidades_compra
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Necessidade de compra não encontrada nesta empresa.';
  end if;
  if v_status <> 'aberta' then
    raise exception 'Só é possível cancelar necessidade aberta (status atual: %).', v_status;
  end if;

  update public.necessidades_compra set status = 'cancelada', motivo_cancelamento = p_motivo where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'suprimentos.necessidade_cancelada', 'necessidade_compra', p_id, p_motivo, null);

  return p_id;
end;
$$;

grant execute on function public.cancelar_necessidade_compra(uuid, text) to authenticated;
