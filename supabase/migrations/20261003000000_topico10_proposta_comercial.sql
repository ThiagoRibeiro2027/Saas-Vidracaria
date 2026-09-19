-- TÓPICO 10 — Proposta comercial simplificada, Fase 3 (e última) da
-- ampliação de escopo aprovada em ADR-002 v2.4 (§4.3, 19/09/2026).
--
-- Gerada como um retrato (snapshot) do orçamento no momento da geração —
-- sem versionamento de orçamento (continua fora do MVP), então "a partir
-- de uma versão específica" (§23) vira "a partir do estado atual de um
-- orçamento aprovado". O snapshot NUNCA inclui custo_unitario (§22 —
-- informação interna não pode aparecer pro cliente).
--
-- Vencimento não é um status próprio armazenado: "vencida" é derivado na
-- leitura (validade < current_date and status = 'enviada'), não uma
-- transição que precisa de job. registrar_aceite_proposta() bloqueia
-- aceite de proposta vencida, salvo p_forcar=true (§26, "salvo
-- autorização") — exige propostas.manage do mesmo jeito, autorização
-- aqui é a permissão de quem está aceitando, não um papel separado.
--
-- Sem geração de PDF/identidade visual/layout configurável, sem portal do
-- cliente e sem assinatura eletrônica nesta fase — aceite é registro
-- manual do Comercial. O aceite/recusa da proposta é informativo:
-- continua não sendo pré-requisito da conversão em Pedido (TÓPICO 3), que
-- já usa orcamento.status='aprovado' e não é alterado por esta migration.

-- next_document_number() (TÓPICO 15 §7) valida o tipo de documento contra
-- uma lista fixa com o gate de permissão específico de cada um — "proposta"
-- precisa entrar nessa lista, senão gerar_proposta() nunca consegue emitir
-- número (mesmo padrão de permissão explícita por tipo já usado para
-- orcamento/pedido/ordem_producao/expedicao/instalacao/titulo_financeiro).
-- Mesma assinatura da função anterior — é um CREATE OR REPLACE de verdade,
-- sem DROP necessário.

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
  elsif p_document_type = 'proposta' then
    if not public.has_permission('propostas', 'manage') then
      raise exception 'Sem permissão para emitir numeração de proposta (propostas.manage).';
    end if;
  elsif p_document_type = 'pedido' then
    if not public.has_permission('pedidos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de pedido (pedidos.manage).';
    end if;
  elsif p_document_type = 'ordem_producao' then
    if not (public.has_permission('producao', 'planejar') or public.has_permission('producao', 'manage')) then
      raise exception 'Sem permissão para emitir numeração de ordem de produção (producao.planejar ou producao.manage).';
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

grant execute on function public.next_document_number(text) to authenticated;

create table public.propostas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  orcamento_id uuid not null references public.orcamentos(id),
  numero text not null,
  status text not null default 'rascunho' check (status in (
    'rascunho', 'enviada', 'aceita', 'recusada', 'cancelada'
  )),
  validade date not null,
  snapshot jsonb not null,
  gerado_em timestamptz not null default now(),
  gerado_por uuid not null references public.profiles(id),
  enviada_em timestamptz,
  enviada_por uuid references public.profiles(id),
  canal text,
  destinatario text,
  decidida_em timestamptz,
  decidida_por uuid references public.profiles(id),
  decisao_observacao text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint propostas_company_numero_unique unique (company_id, numero)
);
comment on table public.propostas is 'TÓPICO 10 §23-27, ADR-002 v2.4 Fase 3 — retrato do orçamento no momento da geração, sem versionamento, sem PDF/layout configurável. snapshot nunca inclui custo (§22).';
create index propostas_orcamento_id_idx on public.propostas (orcamento_id);
create index propostas_company_status_idx on public.propostas (company_id, status);

create trigger set_updated_at before update on public.propostas
  for each row execute function public.set_updated_at();

alter table public.propostas enable row level security;

create policy propostas_select on public.propostas for select
  using (company_id = (select public.current_company_id()));

grant select on public.propostas to authenticated;

-- =========================================================================
-- gerar_proposta() — só a partir de orçamento aprovado (aprovação interna
-- já cumprida via decidir_orcamento). Snapshot congela itens/preços/
-- condições; nunca inclui custo_unitario.
-- =========================================================================

create or replace function public.gerar_proposta(
  p_orcamento_id uuid,
  p_validade date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_orcamento public.orcamentos;
  v_snapshot jsonb;
  v_numero text;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('propostas', 'manage') then
    raise exception 'Sem permissão para gerenciar propostas (propostas.manage).';
  end if;
  -- Só exige que a validade exista (§26 — "toda proposta deverá possuir
  -- validade"); não força que seja futura na criação, porque uma proposta
  -- pode nascer já vencida em cenários legítimos (ex.: registro tardio de
  -- uma negociação feita fora do sistema) — vencimento é tratado por
  -- registrar_aceite_proposta() exigindo p_forcar, não por bloquear aqui.
  if p_validade is null then
    raise exception 'Validade da proposta é obrigatória.';
  end if;

  select * into v_orcamento from public.orcamentos
  where id = p_orcamento_id and company_id = v_company_id;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'aprovado' then
    raise exception 'Só é possível gerar proposta de orçamento aprovado (status atual: %).', v_orcamento.status;
  end if;

  select jsonb_build_object(
    'numero_orcamento', v_orcamento.numero,
    'pessoa_id', v_orcamento.pessoa_id,
    'obra_id', v_orcamento.obra_id,
    'data_orcamento', v_orcamento.data_orcamento,
    'condicao_comercial', v_orcamento.condicao_comercial,
    'observacoes', v_orcamento.observacoes,
    'valor_total', public.orcamento_valor_total(p_orcamento_id),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', oi.item_id,
        'codigo', i.codigo,
        'descricao', i.descricao,
        'quantidade', oi.quantidade,
        'preco_unitario', oi.preco_unitario,
        'subtotal', oi.quantidade * oi.preco_unitario
      ) order by i.codigo)
      from public.orcamento_itens oi
      join public.itens i on i.id = oi.item_id
      where oi.orcamento_id = p_orcamento_id
    ), '[]'::jsonb)
  ) into v_snapshot;

  v_numero := public.next_document_number('proposta');

  insert into public.propostas (company_id, orcamento_id, numero, validade, snapshot, gerado_por)
  values (v_company_id, p_orcamento_id, v_numero, p_validade, v_snapshot, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.proposta_gerada', 'proposta', v_id, v_numero,
    jsonb_build_object('orcamento_id', p_orcamento_id, 'validade', p_validade)
  );

  return v_id;
end;
$$;

grant execute on function public.gerar_proposta(uuid, date) to authenticated;

-- =========================================================================
-- marcar_proposta_enviada() — registra data/hora, responsável, canal e
-- destinatário (§25). Só a partir de rascunho.
-- =========================================================================

create or replace function public.marcar_proposta_enviada(
  p_id uuid,
  p_canal text,
  p_destinatario text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.propostas;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('propostas', 'manage') then
    raise exception 'Sem permissão para gerenciar propostas (propostas.manage).';
  end if;

  select * into v_before from public.propostas
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Proposta não encontrada nesta empresa.';
  end if;
  if v_before.status <> 'rascunho' then
    raise exception 'Só é possível enviar proposta em rascunho (status atual: %).', v_before.status;
  end if;

  update public.propostas set
    status = 'enviada', enviada_em = now(), enviada_por = auth.uid(),
    canal = p_canal, destinatario = p_destinatario
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.proposta_enviada', 'proposta', p_id, v_before.numero,
    jsonb_build_object('canal', p_canal, 'destinatario', p_destinatario)
  );

  return p_id;
end;
$$;

grant execute on function public.marcar_proposta_enviada(uuid, text, text) to authenticated;

-- =========================================================================
-- registrar_aceite_proposta() / registrar_recusa_proposta() — só a partir
-- de enviada. Aceite de proposta vencida exige p_forcar=true (§26).
-- =========================================================================

create or replace function public.registrar_aceite_proposta(
  p_id uuid,
  p_forcar boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.propostas;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('propostas', 'manage') then
    raise exception 'Sem permissão para gerenciar propostas (propostas.manage).';
  end if;

  select * into v_before from public.propostas
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Proposta não encontrada nesta empresa.';
  end if;
  if v_before.status <> 'enviada' then
    raise exception 'Só é possível aceitar proposta enviada (status atual: %).', v_before.status;
  end if;
  if v_before.validade < current_date and not p_forcar then
    raise exception 'Proposta vencida em %. Aceite exige autorização explícita (p_forcar).', v_before.validade;
  end if;

  update public.propostas set
    status = 'aceita', decidida_em = now(), decidida_por = auth.uid()
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.proposta_aceita', 'proposta', p_id, v_before.numero,
    jsonb_build_object('vencida_forcada', v_before.validade < current_date and p_forcar)
  );

  return p_id;
end;
$$;

grant execute on function public.registrar_aceite_proposta(uuid, boolean) to authenticated;

create or replace function public.registrar_recusa_proposta(
  p_id uuid,
  p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.propostas;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('propostas', 'manage') then
    raise exception 'Sem permissão para gerenciar propostas (propostas.manage).';
  end if;

  select * into v_before from public.propostas
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Proposta não encontrada nesta empresa.';
  end if;
  if v_before.status <> 'enviada' then
    raise exception 'Só é possível recusar proposta enviada (status atual: %).', v_before.status;
  end if;

  update public.propostas set
    status = 'recusada', decidida_em = now(), decidida_por = auth.uid(), decisao_observacao = p_observacao
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.proposta_recusada', 'proposta', p_id, v_before.numero,
    jsonb_build_object('observacao', p_observacao)
  );

  return p_id;
end;
$$;

grant execute on function public.registrar_recusa_proposta(uuid, text) to authenticated;

-- =========================================================================
-- cancelar_proposta() — de rascunho ou enviada. Aceita/recusada são
-- terminais (mesmo padrão de orçamento decidido).
-- =========================================================================

create or replace function public.cancelar_proposta(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.propostas;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('propostas', 'manage') then
    raise exception 'Sem permissão para gerenciar propostas (propostas.manage).';
  end if;

  select * into v_before from public.propostas
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Proposta não encontrada nesta empresa.';
  end if;
  if v_before.status not in ('rascunho', 'enviada') then
    raise exception 'Proposta com status "%" não pode ser cancelada.', v_before.status;
  end if;

  update public.propostas set status = 'cancelada' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.proposta_cancelada', 'proposta', p_id, v_before.numero,
    jsonb_build_object('status_anterior', v_before.status)
  );

  return p_id;
end;
$$;

grant execute on function public.cancelar_proposta(uuid) to authenticated;
