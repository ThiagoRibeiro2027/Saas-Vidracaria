-- TÓPICO 5 — Engenharia, recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO
-- PILOTO v1.0, novembro: "o que a fábrica faz"). Texto exato do recorte
-- (PLANO §4): "T5 — Engenharia: itens a produzir com medidas, vinculados
-- ao pedido — incluindo o registro de medição em obra e a regra de
-- bloqueio por medida não confirmada (T16 §7)."
--
-- O TÓPICO 5 completo (docs/Prompt TÓPICO 5) é um módulo inteiro —
-- Produto x Projeto, biblioteca técnica, motor de regras versionado, BOM
-- hierárquica sugerida/definitiva, revisões com comparação e análise de
-- impacto, Solicitação de Engenharia, pacote técnico de fabricação, CMV
-- técnico, fila com prioridade/SLA. Nada disso está no recorte de M1: o
-- PLANO só pede o vínculo pedido→item→medida que o TÓPICO 16 §7 exige
-- para poder, mais adiante (T4, quando existir), impedir liberação de
-- produção sem medida confirmada. §51 do próprio TÓPICO 5 já lista boa
-- parte disso como fora do MVP amplo; aqui o corte é ainda mais estreito,
-- pelo mesmo critério de T2/T15/T10/T3: só o que sustenta o fluxo mínimo
-- do piloto.
--
-- Sem tabela "projetos" (Produto x Projeto, §5): um item a produzir aqui é
-- só o vínculo pedido_item → medida, não uma entidade técnica com BOM,
-- revisão e aprovação. Criado manualmente pela Engenharia por
-- pedido_item — nem todo item de um pedido precisa de medição em obra
-- (ex.: serviço, frete), então não é criado em lote na liberação do
-- pedido.
--
-- measurement_rules.tipo_item (T15) era texto livre "pra quando o
-- catálogo existir" — T5 é o primeiro consumidor real: casa por
-- igualdade de texto contra itens.tipo (T2), sem precisar migrar
-- measurement_rules para FK agora (a tabela já era texto livre de
-- propósito, comparação textual é suficiente pro recorte).

create table public.itens_producao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_id uuid not null references public.pedidos(id),
  pedido_item_id uuid not null references public.pedido_itens(id),
  ambiente text,
  largura_mm numeric(10, 2),
  altura_mm numeric(10, 2),
  medida_registrada_por uuid references public.profiles(id),
  medida_registrada_em timestamptz,
  medida_confirmada boolean not null default false,
  medida_confirmada_por uuid references public.profiles(id),
  medida_confirmada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itens_producao_pedido_item_unique unique (pedido_item_id)
);
comment on table public.itens_producao is 'TÓPICO 5, recorte mínimo — vínculo pedido_item → medida de obra (TÓPICO 16 §7), sem Produto/Projeto/BOM/revisão. Um pedido_item só ganha linha aqui quando a Engenharia decide que ele precisa de medição.';
create index itens_producao_pedido_id_idx on public.itens_producao (pedido_id);

create trigger set_updated_at before update on public.itens_producao
  for each row execute function public.set_updated_at();

alter table public.itens_producao enable row level security;

-- SELECT liberado a qualquer autenticado da empresa, sem exigir
-- engenharia.view — mesmo padrão de T2/T10/T15/T3: T4 (Produção), quando
-- existir, vai precisar ler medida_confirmada pra aplicar a regra de
-- bloqueio, sem que seu usuário administre Engenharia.
create policy itens_producao_select on public.itens_producao for select
  using (company_id = (select public.current_company_id()));

grant select on public.itens_producao to authenticated;

-- =========================================================================
-- criar_item_producao() — só a partir de pedido liberado (ADR-002 §6:
-- Liberação → Engenharia). pedido_item precisa pertencer ao pedido.
-- =========================================================================

create or replace function public.criar_item_producao(p_pedido_item_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_pedido_item public.pedido_itens;
  v_pedido public.pedidos;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('engenharia', 'manage') then
    raise exception 'Sem permissão para gerenciar engenharia (engenharia.manage).';
  end if;

  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido_item.pedido_id;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível iniciar engenharia para item de pedido liberado (status atual: %).', v_pedido.status;
  end if;
  if exists (select 1 from public.itens_producao where pedido_item_id = p_pedido_item_id) then
    raise exception 'Este item de pedido já tem item de produção na Engenharia.';
  end if;

  insert into public.itens_producao (company_id, pedido_id, pedido_item_id)
  values (v_company_id, v_pedido.id, p_pedido_item_id)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.item_producao_criado', 'item_producao', v_id, v_pedido.numero,
    jsonb_build_object('pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id)
  );

  return v_id;
end;
$$;

grant execute on function public.criar_item_producao(uuid) to authenticated;

-- =========================================================================
-- registrar_medicao() — TÓPICO 16 §7: medida por item/ambiente. Uma nova
-- medida sobre item já confirmado desfaz a confirmação anterior — sem
-- isso, corrigir uma medida errada depois de confirmada deixaria a
-- liberação de produção autorizada por um número que não é mais o
-- registrado.
-- =========================================================================

create or replace function public.registrar_medicao(
  p_id uuid,
  p_ambiente text,
  p_largura_mm numeric,
  p_altura_mm numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.itens_producao;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('engenharia', 'manage') then
    raise exception 'Sem permissão para gerenciar engenharia (engenharia.manage).';
  end if;
  if p_largura_mm is null or p_largura_mm <= 0 or p_altura_mm is null or p_altura_mm <= 0 then
    raise exception 'Largura e altura devem ser maiores que zero.';
  end if;

  select * into v_before from public.itens_producao
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de produção não encontrado nesta empresa.';
  end if;

  update public.itens_producao set
    ambiente = p_ambiente,
    largura_mm = p_largura_mm,
    altura_mm = p_altura_mm,
    medida_registrada_por = auth.uid(),
    medida_registrada_em = now(),
    medida_confirmada = false,
    medida_confirmada_por = null,
    medida_confirmada_em = null
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.medicao_registrada', 'item_producao', p_id, p_ambiente,
    jsonb_build_object(
      'before', jsonb_build_object(
        'ambiente', v_before.ambiente, 'largura_mm', v_before.largura_mm, 'altura_mm', v_before.altura_mm,
        'medida_confirmada', v_before.medida_confirmada
      ),
      'after', jsonb_build_object('ambiente', p_ambiente, 'largura_mm', p_largura_mm, 'altura_mm', p_altura_mm)
    )
  );

  return p_id;
end;
$$;

grant execute on function public.registrar_medicao(uuid, text, numeric, numeric) to authenticated;

-- =========================================================================
-- confirmar_medicao() — conferência formal (TÓPICO 16 §7), separada de
-- quem registrou a medida.
-- =========================================================================

create or replace function public.confirmar_medicao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.itens_producao;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('engenharia', 'manage') then
    raise exception 'Sem permissão para gerenciar engenharia (engenharia.manage).';
  end if;

  select * into v_before from public.itens_producao
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de produção não encontrado nesta empresa.';
  end if;
  if v_before.largura_mm is null or v_before.altura_mm is null then
    raise exception 'Registre a medida antes de confirmar.';
  end if;
  if v_before.medida_confirmada then
    raise exception 'Medida já confirmada.';
  end if;

  update public.itens_producao set
    medida_confirmada = true, medida_confirmada_por = auth.uid(), medida_confirmada_em = now()
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.medicao_confirmada', 'item_producao', p_id, v_before.ambiente,
    jsonb_build_object('largura_mm', v_before.largura_mm, 'altura_mm', v_before.altura_mm)
  );

  return p_id;
end;
$$;

grant execute on function public.confirmar_medicao(uuid) to authenticated;

-- =========================================================================
-- pedido_bloqueado_por_medicao() — a regra de bloqueio em si (TÓPICO 16
-- §7 / PLANO §4). Ainda sem nenhum chamador real (T4 Produção não
-- existe) — mesmo padrão de get_cutting_margin()/approval_thresholds em
-- T15, construídos antes do primeiro consumidor.
--
-- Bloqueia quando existe pedido_item cujo item.tipo tem regra ativa
-- exigindo medição confirmada (measurement_rules) e ou (a) não há
-- itens_producao para ele, ou (b) existe mas a medida não foi
-- confirmada. Item sem regra correspondente (ou regra com
-- exige_medicao_confirmada=false) nunca bloqueia.
-- =========================================================================

create or replace function public.pedido_bloqueado_por_medicao(p_pedido_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.pedido_itens pi
    join public.itens i on i.id = pi.item_id
    join public.pedidos p on p.id = pi.pedido_id
    join public.measurement_rules mr
      on mr.company_id = p.company_id and mr.tipo_item = i.tipo and mr.ativo and mr.exige_medicao_confirmada
    left join public.itens_producao ip on ip.pedido_item_id = pi.id
    where pi.pedido_id = p_pedido_id
      and p.company_id = public.current_company_id()
      and (ip.id is null or not ip.medida_confirmada)
  );
$$;

grant execute on function public.pedido_bloqueado_por_medicao(uuid) to authenticated;
