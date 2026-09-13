-- TÓPICO 3 — Gestão e Acompanhamento de Pedidos, recorte mínimo do M1
-- (PLANO DE ENTREGA — MVP DO PILOTO v1.0, outubro: "entrada do pedido",
-- sequência T2 → T10 → T3, último item do mês).
--
-- Recorte decidido nesta entrega, seguindo o mesmo critério já aplicado em
-- T2/T15/T10 (só o que sustenta o fluxo mínimo do ADR-002 §6: Orçamento →
-- Aprovação/Conversão → Conferência → Liberação → Engenharia...):
--
--   1. Único caminho de entrada é a CONVERSÃO de um orçamento aprovado
--      (TÓPICO 10). Cadastro direto de pedido (TÓPICO 3 §2) e importação de
--      arquivo (§3) ficam fora — o próprio commit de T10 já prometia que
--      "a conversão de verdade... entra junto quando eu implementar T3", e
--      o fluxo mínimo do M1 (PLANO §4) começa em Comercial, não em Pedidos
--      direto. Cada orçamento converte em no máximo um pedido (unique em
--      orcamento_id) — itens são copiados no momento da conversão; como o
--      orçamento fica imutável a partir de 'aprovado' (T10), a cópia nunca
--      diverge do que foi aprovado.
--   2. Status param na conferência do orçamento (5 valores: recebido,
--      em_conferencia, pendente, liberado, cancelado) — cobre só até
--      "Liberação" (PLANO §4: "T3 — Pedidos: entrada, conferência,
--      pendências, liberação, status e histórico"). Em andamento/
--      parcialmente concluído/concluído (TÓPICO 3 §5) dependem de apontamento
--      de produção — só fazem sentido quando o TÓPICO 4 existir (novembro).
--   3. Pendência ganha tabela própria (pedido_pendencias) — não é só um
--      status, é um registro rastreável (quem abriu, quando, resolução),
--      exigido pelo PLANO §8 como uma das "pelo menos três exceções
--      operacionais" que o M1 precisa tratar dentro do sistema. Pendência
--      aberta bloqueia liberação.
--   4. Fora do recorte, por não serem "conferência, pendências, liberação,
--      status e histórico": motor de notificações/alertas configurável
--      (§10-12 — é um subsistema inteiro, sem ADR próprio ainda), tela de
--      busca/filtro avançado (§14 — cabe quando houver volume real de
--      pedidos), granularidade de permissão por ação (§8 lista visualizar/
--      criar/editar/alterar status/cancelar como permissões distintas — aqui
--      é uma permissão só, pedidos.manage, mesmo padrão de T2/T10/T15).
--
-- Histórico (§7) é activity_logs, como em todo o resto do schema — não uma
-- tabela própria.

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  numero text not null,
  orcamento_id uuid not null references public.orcamentos(id),
  pessoa_id uuid not null references public.pessoas(id),
  obra_id uuid references public.obras(id),
  responsavel_id uuid not null references public.profiles(id),
  data_pedido date not null default current_date,
  previsao_entrega date,
  status text not null default 'recebido' check (status in ('recebido', 'em_conferencia', 'pendente', 'liberado', 'cancelado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedidos_company_numero_unique unique (company_id, numero),
  constraint pedidos_orcamento_unique unique (orcamento_id)
);
comment on table public.pedidos is 'TÓPICO 3, recorte mínimo — único caminho de entrada é converter_orcamento_em_pedido(). Sem cadastro direto/importação neste recorte (ver cabeçalho da migration).';
create index pedidos_pessoa_id_idx on public.pedidos (pessoa_id);
create index pedidos_obra_id_idx on public.pedidos (obra_id);

create table public.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  item_id uuid not null references public.itens(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  preco_unitario numeric(14, 2) not null check (preco_unitario >= 0),
  created_at timestamptz not null default now()
);
comment on table public.pedido_itens is 'Cópia congelada de orcamento_itens no momento da conversão — o orçamento de origem já é imutável a partir de aprovado (T10), então não há divergência a reconciliar.';
create index pedido_itens_pedido_id_idx on public.pedido_itens (pedido_id);
create index pedido_itens_item_id_idx on public.pedido_itens (item_id);

create table public.pedido_pendencias (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  descricao text not null,
  aberta_por uuid not null references public.profiles(id),
  aberta_em timestamptz not null default now(),
  resolvida boolean not null default false,
  resolvida_por uuid references public.profiles(id),
  resolvida_em timestamptz,
  resolucao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.pedido_pendencias is 'PLANO §8 — uma das exceções operacionais que o M1 precisa tratar dentro do sistema. Pendência aberta bloqueia liberar_pedido().';
create index pedido_pendencias_pedido_id_idx on public.pedido_pendencias (pedido_id);
-- Índice parcial: toda checagem de "tem pendência aberta" filtra por
-- resolvida = false; sem isso, liberar_pedido()/resolver_pendencia_pedido()
-- fariam sequential scan conforme a tabela crescer.
create index pedido_pendencias_abertas_idx on public.pedido_pendencias (pedido_id) where not resolvida;

create trigger set_updated_at before update on public.pedidos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pedido_pendencias
  for each row execute function public.set_updated_at();

alter table public.pedidos enable row level security;
alter table public.pedido_itens enable row level security;
alter table public.pedido_pendencias enable row level security;

-- SELECT liberado a qualquer autenticado da empresa, sem exigir
-- pedidos.view — mesmo padrão de T2/T10/T15: módulos futuros (T4/T5/T6...)
-- vão precisar ler pedidos liberados sem que seu usuário administre Pedidos.
create policy pedidos_select on public.pedidos for select
  using (company_id = (select public.current_company_id()));
create policy pedido_itens_select on public.pedido_itens for select
  using (exists (
    select 1 from public.pedidos p
    where p.id = pedido_itens.pedido_id
      and p.company_id = (select public.current_company_id())
  ));
create policy pedido_pendencias_select on public.pedido_pendencias for select
  using (exists (
    select 1 from public.pedidos p
    where p.id = pedido_pendencias.pedido_id
      and p.company_id = (select public.current_company_id())
  ));

grant select on public.pedidos to authenticated;
grant select on public.pedido_itens to authenticated;
grant select on public.pedido_pendencias to authenticated;

-- =========================================================================
-- converter_orcamento_em_pedido() — único caminho de criação de pedido
-- neste recorte. Orçamento precisa estar 'aprovado'; cada orçamento
-- converte no máximo uma vez (unique em pedidos.orcamento_id).
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

grant execute on function public.converter_orcamento_em_pedido(uuid) to authenticated;

-- =========================================================================
-- Transições de status — uma função por ação (mesmo padrão de T10), sem
-- máquina de estados genérica: cada função já sabe de qual status parte.
-- =========================================================================

create or replace function public.iniciar_conferencia_pedido(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.pedidos;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pedidos', 'manage') then
    raise exception 'Sem permissão para gerenciar pedidos (pedidos.manage).';
  end if;

  select * into v_before from public.pedidos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_before.status <> 'recebido' then
    raise exception 'Só é possível iniciar conferência a partir de "recebido" (status atual: %).', v_before.status;
  end if;

  update public.pedidos set status = 'em_conferencia' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.conferencia_iniciada', 'pedido', p_id, v_before.numero, '{}'::jsonb
  );

  return p_id;
end;
$$;

grant execute on function public.iniciar_conferencia_pedido(uuid) to authenticated;

create or replace function public.abrir_pendencia_pedido(p_id uuid, p_descricao text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_pedido public.pedidos;
  v_pendencia_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pedidos', 'manage') then
    raise exception 'Sem permissão para gerenciar pedidos (pedidos.manage).';
  end if;
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição da pendência é obrigatória.';
  end if;

  select * into v_pedido from public.pedidos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_pedido.status not in ('em_conferencia', 'pendente') then
    raise exception 'Só é possível abrir pendência com o pedido em conferência (status atual: %).', v_pedido.status;
  end if;

  insert into public.pedido_pendencias (pedido_id, descricao, aberta_por)
  values (p_id, p_descricao, auth.uid())
  returning id into v_pendencia_id;

  if v_pedido.status <> 'pendente' then
    update public.pedidos set status = 'pendente' where id = p_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pendencia_aberta', 'pedido_pendencia', v_pendencia_id, v_pedido.numero,
    jsonb_build_object('pedido_id', p_id, 'descricao', p_descricao)
  );

  return v_pendencia_id;
end;
$$;

grant execute on function public.abrir_pendencia_pedido(uuid, text) to authenticated;

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

grant execute on function public.resolver_pendencia_pedido(uuid, text) to authenticated;

create or replace function public.liberar_pedido(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.pedidos;
  v_pendencias_abertas int;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pedidos', 'manage') then
    raise exception 'Sem permissão para gerenciar pedidos (pedidos.manage).';
  end if;

  select * into v_before from public.pedidos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_before.status <> 'em_conferencia' then
    raise exception 'Só é possível liberar pedido em conferência, sem pendência aberta (status atual: %).', v_before.status;
  end if;

  select count(*) into v_pendencias_abertas from public.pedido_pendencias
  where pedido_id = p_id and not resolvida;
  if v_pendencias_abertas > 0 then
    raise exception 'Pedido tem % pendência(s) aberta(s) — resolva antes de liberar.', v_pendencias_abertas;
  end if;

  update public.pedidos set status = 'liberado' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pedido_liberado', 'pedido', p_id, v_before.numero, '{}'::jsonb
  );

  return p_id;
end;
$$;

grant execute on function public.liberar_pedido(uuid) to authenticated;

create or replace function public.cancelar_pedido(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.pedidos;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pedidos', 'manage') then
    raise exception 'Sem permissão para gerenciar pedidos (pedidos.manage).';
  end if;

  select * into v_before from public.pedidos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_before.status not in ('recebido', 'em_conferencia', 'pendente') then
    raise exception 'Pedido com status "%" não pode ser cancelado.', v_before.status;
  end if;

  update public.pedidos set status = 'cancelado' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pedido_cancelado', 'pedido', p_id, v_before.numero,
    jsonb_build_object('status_anterior', v_before.status)
  );

  return p_id;
end;
$$;

grant execute on function public.cancelar_pedido(uuid) to authenticated;
