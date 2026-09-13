-- Achados do code-review de 13/09/2026 sobre T10 (Comercial) e T3 (Pedidos)
-- — revisão pedida antes de avançar para novembro. Todas as funções abaixo
-- já existiam nas migrations de T10/T3; aqui só corrige o corpo (mesma
-- assinatura, então os GRANTs existentes continuam valendo).
--
-- 1. next_document_number(): a própria migration de T15 (13/09) deixou
--    a função sem has_permission() de propósito, com a nota "revisitar
--    quando o primeiro módulo consumidor for construído" — T10/T3 são esse
--    consumidor. Gate por tipo de documento: só os tipos com consumidor
--    real hoje (orcamento, pedido) exigem a permissão do módulo dono;
--    tipos futuros sem consumidor (ex.: ordem_producao) continuam abertos
--    até terem um, mesma lógica da decisão original.
-- 2. orcamento_valor_total(): extrai a soma usada por decidir_orcamento()
--    para uma função só, reaproveitada pela UI (comercial/page.tsx) — antes
--    a mesma fórmula existia em dois lugares (SQL e client) sem fonte
--    única de verdade.
-- 3. cancelar_orcamento(): passa a rejeitar cancelamento se o orçamento já
--    foi convertido em pedido (pedidos.orcamento_id) — a conversão nunca
--    muda o status do orçamento, então sem este check dava pra cancelar um
--    orçamento com pedido ativo, quebrando a rastreabilidade que a própria
--    migration de T10 declara como objetivo.
-- 4. resolver_pendencia_pedido(): passa a rejeitar resolver pendência de
--    pedido já cancelado — cancelar_pedido() permite cancelar a partir de
--    'pendente' sem resolver pendências abertas antes, então sem este
--    check a auditoria podia registrar uma pendência "resolvida" depois do
--    pedido já ter sido cancelado.
-- 5. converter_orcamento_em_pedido(): revalida que nenhum item do
--    orçamento foi desativado entre a aprovação e a conversão — mesma
--    invariante que upsert_orcamento_item() já aplica ao adicionar o item.
-- 6. remove_orcamento_item(): trava o orçamento (pai) ANTES de reler o item
--    (filho), mesma ordem de upsert_orcamento_item() — a ordem invertida
--    original não tinha corrida demonstrável, mas divergia do padrão da
--    função vizinha e podia gravar um "before" obsoleto na auditoria se o
--    item fosse removido por outra transação entre a primeira leitura e o
--    lock do pai.

-- =========================================================================
-- 1. next_document_number()
-- =========================================================================

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

  if p_document_type = 'orcamento' and not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para emitir numeração de orçamento (orcamentos.manage).';
  elsif p_document_type = 'pedido' and not public.has_permission('pedidos', 'manage') then
    raise exception 'Sem permissão para emitir numeração de pedido (pedidos.manage).';
  end if;
  -- Outros document_type (ex.: ordem_producao) continuam sem gate — mesma
  -- decisão original de T15: revisitar quando tiverem consumidor real.

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
-- 2. orcamento_valor_total()
-- =========================================================================

create or replace function public.orcamento_valor_total(p_orcamento_id uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(oi.quantidade * oi.preco_unitario), 0)
  from public.orcamento_itens oi
  join public.orcamentos o on o.id = oi.orcamento_id
  where oi.orcamento_id = p_orcamento_id
    and o.company_id = public.current_company_id();
$$;

grant execute on function public.orcamento_valor_total(uuid) to authenticated;

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

  v_total := public.orcamento_valor_total(p_id);

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

-- =========================================================================
-- 3. cancelar_orcamento()
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
  if exists (select 1 from public.pedidos where orcamento_id = p_id) then
    raise exception 'Este orçamento já foi convertido em pedido — cancele ou resolva o pedido em vez disso.';
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

-- =========================================================================
-- 4. resolver_pendencia_pedido()
-- =========================================================================

create or replace function public.resolver_pendencia_pedido(p_pendencia_id uuid, p_resolucao text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_pendencia public.pedido_pendencias;
  v_pedido public.pedidos;
  v_abertas_restantes int;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pedidos', 'manage') then
    raise exception 'Sem permissão para gerenciar pedidos (pedidos.manage).';
  end if;

  select pp.* into v_pendencia from public.pedido_pendencias pp
  join public.pedidos p on p.id = pp.pedido_id
  where pp.id = p_pendencia_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Pendência não encontrada nesta empresa.';
  end if;
  if v_pendencia.resolvida then
    raise exception 'Pendência já resolvida.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pendencia.pedido_id for update;
  if v_pedido.status = 'cancelado' then
    raise exception 'Pedido está cancelado — não é possível resolver pendência.';
  end if;

  update public.pedido_pendencias set
    resolvida = true, resolvida_por = auth.uid(), resolvida_em = now(), resolucao = p_resolucao
  where id = p_pendencia_id;

  select count(*) into v_abertas_restantes from public.pedido_pendencias
  where pedido_id = v_pedido.id and not resolvida and id <> p_pendencia_id;

  if v_abertas_restantes = 0 and v_pedido.status = 'pendente' then
    update public.pedidos set status = 'em_conferencia' where id = v_pedido.id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pendencia_resolvida', 'pedido_pendencia', p_pendencia_id, v_pedido.numero,
    jsonb_build_object('pedido_id', v_pedido.id, 'resolucao', p_resolucao, 'pendencias_abertas_restantes', v_abertas_restantes)
  );

  return p_pendencia_id;
end;
$$;

-- =========================================================================
-- 5. converter_orcamento_em_pedido()
-- =========================================================================

create or replace function public.converter_orcamento_em_pedido(p_orcamento_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_orcamento public.orcamentos;
  v_pedido_id uuid;
  v_numero text;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pedidos', 'manage') then
    raise exception 'Sem permissão para gerenciar pedidos (pedidos.manage).';
  end if;

  select * into v_orcamento from public.orcamentos
  where id = p_orcamento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'aprovado' then
    raise exception 'Só é possível converter orçamento aprovado (status atual: %).', v_orcamento.status;
  end if;
  if exists (select 1 from public.pedidos where orcamento_id = p_orcamento_id) then
    raise exception 'Este orçamento já foi convertido em pedido.';
  end if;
  if exists (
    select 1 from public.orcamento_itens oi
    join public.itens i on i.id = oi.item_id
    where oi.orcamento_id = p_orcamento_id and i.situacao <> 'ativo'
  ) then
    raise exception 'Orçamento tem item(ns) inativo(s) desde a aprovação — reative o item ou cancele este orçamento e crie outro antes de converter.';
  end if;

  v_numero := public.next_document_number('pedido');

  insert into public.pedidos (
    company_id, numero, orcamento_id, pessoa_id, obra_id, responsavel_id, observacoes
  ) values (
    v_company_id, v_numero, p_orcamento_id, v_orcamento.pessoa_id, v_orcamento.obra_id, auth.uid(), v_orcamento.observacoes
  )
  returning id into v_pedido_id;

  insert into public.pedido_itens (pedido_id, item_id, quantidade, preco_unitario)
  select v_pedido_id, oi.item_id, oi.quantidade, oi.preco_unitario
  from public.orcamento_itens oi
  where oi.orcamento_id = p_orcamento_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pedido_convertido_de_orcamento', 'pedido', v_pedido_id, v_numero,
    jsonb_build_object('orcamento_id', p_orcamento_id, 'orcamento_numero', v_orcamento.numero)
  );

  return v_pedido_id;
end;
$$;

-- =========================================================================
-- 6. remove_orcamento_item()
-- =========================================================================

create or replace function public.remove_orcamento_item(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_orcamento_id uuid;
  v_orcamento public.orcamentos;
  v_item public.orcamento_itens;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para gerenciar orçamentos (orcamentos.manage).';
  end if;

  select orcamento_id into v_orcamento_id from public.orcamento_itens where id = p_id;
  if not found then
    raise exception 'Item do orçamento não encontrado nesta empresa.';
  end if;

  -- Trava o pai ANTES de reler o item (mesma ordem de upsert_orcamento_item)
  -- — evita que o "before" da auditoria capture um item que outra
  -- transação já removeu entre a primeira leitura e o lock.
  select * into v_orcamento from public.orcamentos
  where id = v_orcamento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item do orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'rascunho' then
    raise exception 'Só é possível remover item de orçamento em rascunho (status atual: %).', v_orcamento.status;
  end if;

  select * into v_item from public.orcamento_itens where id = p_id;
  if not found then
    raise exception 'Item do orçamento não encontrado nesta empresa.';
  end if;

  delete from public.orcamento_itens where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_item_removed', 'orcamento_item', p_id, v_orcamento.numero,
    jsonb_build_object('before', to_jsonb(v_item))
  );
end;
$$;
