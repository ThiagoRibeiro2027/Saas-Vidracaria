-- TÓPICO 15 — Configurações, recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO
-- PILOTO v1.0, seção 4): numerações (§7), margem de quebra (§31.4,
-- Arquitetura Mestre 6.3), regra de medição (§31.5) e alçadas de aprovação
-- (§8, recortada a valor mínimo + perfil aprovador — sem sequencial/
-- paralelo/delegação/escalonamento, que ficam para quando T10/T3 precisarem).
--
-- material_tipo/processo/tipo_item são texto livre de propósito: T2
-- Cadastros (materiais/itens) ainda não existe (entra em outubro). Migra
-- para referência real quando T2 existir, sem quebrar dado histórico.
--
-- Leitura (SELECT) é liberada para qualquer usuário autenticado da própria
-- empresa, sem exigir configuracoes.view — módulos operacionais futuros
-- (T4, T5...) vão precisar ler margem de quebra/regra de medição para
-- aplicar, não só quem administra Configurações. A permissão
-- configuracoes.view/manage gate a TELA de administração (app), não a
-- leitura dos valores em si. Escrita, essa sim, só via função
-- SECURITY DEFINER com has_permission('configuracoes','manage') — mesmo
-- padrão de authenticated só com GRANT de SELECT já usado em todo o schema.

create table public.numbering_sequences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  document_type text not null,
  prefixo text not null default '',
  sufixo text not null default '',
  digitos int not null default 6 check (digitos between 1 and 12),
  incluir_ano boolean not null default false,
  incluir_mes boolean not null default false,
  reinicio text not null default 'nunca' check (reinicio in ('nunca', 'anual', 'mensal')),
  current_value bigint not null default 0,
  current_period_key text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint numbering_sequences_company_document_unique unique (company_id, document_type)
);
comment on table public.numbering_sequences is 'TÓPICO 15 §7 — numeração configurável por tipo de documento. current_value/current_period_key só mudam via next_document_number().';

create table public.cutting_margin_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  material_tipo text not null,
  processo text not null default '', -- '' = valor padrão do material, sem override de processo
  percentual numeric(6, 3) not null check (percentual >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cutting_margin_settings_unique unique (company_id, material_tipo, processo)
);
comment on table public.cutting_margin_settings is 'TÓPICO 15 §31.4 / Arquitetura Mestre 6.3 — quantidade técnica planejada, não a perda real (registrada na produção). processo='''' é o padrão do material, sobreposto pela combinação específica quando existir.';

create table public.measurement_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  tipo_item text not null,
  exige_medicao_confirmada boolean not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint measurement_rules_company_tipo_unique unique (company_id, tipo_item)
);
comment on table public.measurement_rules is 'TÓPICO 15 §31.5 — true bloqueia liberação para produção sem medida confirmada (itens sob medida); false apenas sinaliza (itens padrão/catálogo).';

create table public.approval_thresholds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  processo text not null,
  valor_minimo numeric(14, 2) not null check (valor_minimo >= 0),
  role_id uuid not null references public.roles(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_thresholds_company_processo_unique unique (company_id, processo)
);
comment on table public.approval_thresholds is 'TÓPICO 15 §8, recortado — valor mínimo que exige aprovação e perfil aprovador, por processo. Sem sequencial/paralelo/delegação/escalonamento (fora do recorte de M1).';

create trigger set_updated_at before update on public.numbering_sequences
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.cutting_margin_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.measurement_rules
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.approval_thresholds
  for each row execute function public.set_updated_at();

alter table public.numbering_sequences enable row level security;
alter table public.cutting_margin_settings enable row level security;
alter table public.measurement_rules enable row level security;
alter table public.approval_thresholds enable row level security;

create policy numbering_sequences_select on public.numbering_sequences for select
  using (company_id = (select public.current_company_id()));
create policy cutting_margin_settings_select on public.cutting_margin_settings for select
  using (company_id = (select public.current_company_id()));
create policy measurement_rules_select on public.measurement_rules for select
  using (company_id = (select public.current_company_id()));
create policy approval_thresholds_select on public.approval_thresholds for select
  using (company_id = (select public.current_company_id()));

grant select on public.numbering_sequences to authenticated;
grant select on public.cutting_margin_settings to authenticated;
grant select on public.measurement_rules to authenticated;
grant select on public.approval_thresholds to authenticated;

-- =========================================================================
-- next_document_number() — usada pelos módulos futuros (T3, T4, T10) que
-- ainda não existem. Lock de linha (FOR UPDATE) garante que concorrência não
-- gera duplicidade (TÓPICO 15 §7). Números emitidos nunca são reutilizados
-- automaticamente: cancelamento/exclusão de documento é responsabilidade de
-- quem consome, não desta função.
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

create or replace function public.upsert_numbering_sequence(
  p_document_type text,
  p_prefixo text,
  p_sufixo text,
  p_digitos int,
  p_incluir_ano boolean,
  p_incluir_mes boolean,
  p_reinicio text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.numbering_sequences;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('configuracoes', 'manage') then
    raise exception 'Sem permissão para gerenciar configurações (configuracoes.manage).';
  end if;
  if p_reinicio not in ('nunca', 'anual', 'mensal') then
    raise exception 'Reinício inválido: "%".', p_reinicio;
  end if;

  -- FOR UPDATE: sem o lock, duas chamadas concorrentes pra mesma chave leem
  -- o mesmo "before" e uma delas grava um "before" desatualizado na
  -- auditoria (a escrita em si já serializa via ON CONFLICT, só a leitura
  -- do valor anterior não).
  select * into v_before from public.numbering_sequences
  where company_id = v_company_id and document_type = p_document_type
  for update;

  insert into public.numbering_sequences (
    company_id, document_type, prefixo, sufixo, digitos, incluir_ano, incluir_mes, reinicio
  ) values (
    v_company_id, p_document_type, p_prefixo, p_sufixo, p_digitos, p_incluir_ano, p_incluir_mes, p_reinicio
  )
  on conflict (company_id, document_type) do update
  set prefixo = excluded.prefixo,
      sufixo = excluded.sufixo,
      digitos = excluded.digitos,
      incluir_ano = excluded.incluir_ano,
      incluir_mes = excluded.incluir_mes,
      reinicio = excluded.reinicio
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.numbering_sequence_upserted', 'numbering_sequence', v_id,
    p_document_type,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'prefixo', p_prefixo, 'sufixo', p_sufixo, 'digitos', p_digitos,
      'incluir_ano', p_incluir_ano, 'incluir_mes', p_incluir_mes, 'reinicio', p_reinicio
    ))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_numbering_sequence(text, text, text, int, boolean, boolean, text) to authenticated;

-- =========================================================================
-- get_cutting_margin() — tenta o par material+processo exato, cai para o
-- padrão do material (processo=''). NULL quando não há nenhum configurado.
-- =========================================================================

create or replace function public.get_cutting_margin(p_material_tipo text, p_processo text default '')
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select percentual from public.cutting_margin_settings
     where company_id = public.current_company_id()
       and material_tipo = p_material_tipo and processo = p_processo and ativo),
    (select percentual from public.cutting_margin_settings
     where company_id = public.current_company_id()
       and material_tipo = p_material_tipo and processo = '' and ativo)
  );
$$;

grant execute on function public.get_cutting_margin(text, text) to authenticated;

create or replace function public.upsert_cutting_margin(
  p_material_tipo text,
  p_processo text,
  p_percentual numeric,
  p_ativo boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.cutting_margin_settings;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('configuracoes', 'manage') then
    raise exception 'Sem permissão para gerenciar configurações (configuracoes.manage).';
  end if;

  select * into v_before from public.cutting_margin_settings
  where company_id = v_company_id and material_tipo = p_material_tipo and processo = p_processo
  for update;

  insert into public.cutting_margin_settings (company_id, material_tipo, processo, percentual, ativo)
  values (v_company_id, p_material_tipo, p_processo, p_percentual, p_ativo)
  on conflict (company_id, material_tipo, processo) do update
  set percentual = excluded.percentual,
      ativo = excluded.ativo
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.cutting_margin_upserted', 'cutting_margin_setting', v_id,
    p_material_tipo || coalesce(nullif('/' || p_processo, '/'), ''),
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object('percentual', p_percentual, 'ativo', p_ativo))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_cutting_margin(text, text, numeric, boolean) to authenticated;

create or replace function public.upsert_measurement_rule(
  p_tipo_item text,
  p_exige_medicao_confirmada boolean,
  p_ativo boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.measurement_rules;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('configuracoes', 'manage') then
    raise exception 'Sem permissão para gerenciar configurações (configuracoes.manage).';
  end if;

  select * into v_before from public.measurement_rules
  where company_id = v_company_id and tipo_item = p_tipo_item
  for update;

  insert into public.measurement_rules (company_id, tipo_item, exige_medicao_confirmada, ativo)
  values (v_company_id, p_tipo_item, p_exige_medicao_confirmada, p_ativo)
  on conflict (company_id, tipo_item) do update
  set exige_medicao_confirmada = excluded.exige_medicao_confirmada,
      ativo = excluded.ativo
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.measurement_rule_upserted', 'measurement_rule', v_id,
    p_tipo_item,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object('exige_medicao_confirmada', p_exige_medicao_confirmada, 'ativo', p_ativo))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_measurement_rule(text, boolean, boolean) to authenticated;

create or replace function public.upsert_approval_threshold(
  p_processo text,
  p_valor_minimo numeric,
  p_role_id uuid,
  p_ativo boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.approval_thresholds;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('configuracoes', 'manage') then
    raise exception 'Sem permissão para gerenciar configurações (configuracoes.manage).';
  end if;
  if not exists (
    select 1 from public.roles
    where id = p_role_id and (company_id = v_company_id or company_id is null)
  ) then
    raise exception 'Perfil aprovador inválido para esta empresa.';
  end if;

  select * into v_before from public.approval_thresholds
  where company_id = v_company_id and processo = p_processo
  for update;

  insert into public.approval_thresholds (company_id, processo, valor_minimo, role_id, ativo)
  values (v_company_id, p_processo, p_valor_minimo, p_role_id, p_ativo)
  on conflict (company_id, processo) do update
  set valor_minimo = excluded.valor_minimo,
      role_id = excluded.role_id,
      ativo = excluded.ativo
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.approval_threshold_upserted', 'approval_threshold', v_id,
    p_processo,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object('valor_minimo', p_valor_minimo, 'role_id', p_role_id, 'ativo', p_ativo))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_approval_threshold(text, numeric, uuid, boolean) to authenticated;
