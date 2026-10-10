-- Compras completo (T7) — Fase 1 da ADR-011 (docs/ADR-011 — Compras
-- v1.0.md): fornecedor, fornecedores/materiais alternativos e política de
-- abastecimento. Primeira fase de 10, escopo literal completo do Prompt
-- TÓPICO 7 aprovado pelo responsável do produto via chat em 23/09/2026.
--
-- Reaproveita `pessoas`/`pessoa_papeis` (T2) já existente — fornecedor
-- continua sendo uma pessoa com papel FORNECEDOR ativo, mesmo padrão já
-- usado em `contratos` (T18). `fornecedor_dados` só acrescenta os campos
-- comerciais que T2 deliberadamente deixou de fora ("isso é enriquecimento
-- comercial... fora do recorte de M1").
--
-- Sem tela/leitura via RPC nesta fase: as 4 tabelas têm RLS + select
-- liberado para authenticated (mesmo padrão de `pecas`/`peca_composicao`),
-- e a tela consulta direto via supabase-js com embed de FK, mesmo padrão
-- já usado em `/suprimentos`. Todo INSERT/UPDATE passa pelas funções
-- abaixo (SECURITY DEFINER, bypassa RLS).

create table public.fornecedor_dados (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pessoa_id uuid not null references public.pessoas(id),
  prazo_pagamento_dias integer check (prazo_pagamento_dias is null or prazo_pagamento_dias >= 0),
  lead_time_dias integer check (lead_time_dias is null or lead_time_dias >= 0),
  banco text,
  agencia text,
  conta text,
  tipo_conta text check (tipo_conta is null or tipo_conta in ('corrente', 'poupanca')),
  chave_pix text,
  condicoes_padrao text,
  homologado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fornecedor_dados_pessoa_unique unique (pessoa_id)
);
comment on table public.fornecedor_dados is 'Fase 1 da ADR-011 — dados comerciais do fornecedor (1:1 com pessoas, papel FORNECEDOR ativo, checado em upsert_fornecedor_dados()). T2 deliberadamente não modela isso.';
create index fornecedor_dados_company_id_idx on public.fornecedor_dados (company_id);

create table public.item_fornecedores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null references public.itens(id),
  pessoa_id uuid not null references public.pessoas(id),
  principal boolean not null default false,
  prioridade integer not null default 100,
  homologado boolean not null default false,
  preco_referencia numeric(14, 4) check (preco_referencia is null or preco_referencia >= 0),
  condicoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_fornecedores_unique unique (item_id, pessoa_id)
);
comment on table public.item_fornecedores is 'Fase 1 da ADR-011 (TÓPICO 7 §13/§14) — fornecedor por item (materia_prima/insumo/material_auxiliar, checado em upsert_item_fornecedor()), com no máximo um principal por item (índice parcial abaixo).';
create index item_fornecedores_company_id_idx on public.item_fornecedores (company_id);
create index item_fornecedores_item_id_idx on public.item_fornecedores (item_id);
create unique index item_fornecedores_principal_unique on public.item_fornecedores (item_id) where principal;

create table public.item_materiais_alternativos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_origem_id uuid not null references public.itens(id),
  item_equivalente_id uuid not null references public.itens(id),
  exige_aprovacao boolean not null default true,
  regra_substituicao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint item_materiais_alternativos_unique unique (item_origem_id, item_equivalente_id),
  constraint item_materiais_alternativos_distinct check (item_origem_id <> item_equivalente_id)
);
comment on table public.item_materiais_alternativos is 'Fase 1 da ADR-011 (TÓPICO 7 §15) — equivalência entre dois itens materia_prima/insumo/material_auxiliar. exige_aprovacao marca se o uso do alternativo precisa de decisão humana antes de substituir o item de origem numa compra.';
create index item_materiais_alternativos_company_id_idx on public.item_materiais_alternativos (company_id);
create index item_materiais_alternativos_origem_idx on public.item_materiais_alternativos (item_origem_id);

create table public.politicas_abastecimento (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null references public.itens(id),
  tipo text not null default 'sob_demanda' check (tipo in ('sob_demanda', 'estoque_minimo', 'seguranca', 'ponto_reposicao')),
  estoque_minimo numeric(14, 4) check (estoque_minimo is null or estoque_minimo >= 0),
  estoque_seguranca numeric(14, 4) check (estoque_seguranca is null or estoque_seguranca >= 0),
  ponto_reposicao numeric(14, 4) check (ponto_reposicao is null or ponto_reposicao >= 0),
  lote_minimo numeric(14, 4) check (lote_minimo is null or lote_minimo > 0),
  lote_economico numeric(14, 4) check (lote_economico is null or lote_economico > 0),
  multiplo numeric(14, 4) check (multiplo is null or multiplo > 0),
  fornecedor_preferencial_id uuid references public.pessoas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint politicas_abastecimento_item_unique unique (item_id)
);
comment on table public.politicas_abastecimento is 'Fase 1 da ADR-011 (TÓPICO 7 §10) — política de abastecimento por item (materia_prima/insumo/material_auxiliar, checado em upsert_politica_abastecimento()). Consumida pelo Motor de Necessidades da Fase 3.';
create index politicas_abastecimento_company_id_idx on public.politicas_abastecimento (company_id);

alter table public.fornecedor_dados enable row level security;
create policy fornecedor_dados_select on public.fornecedor_dados for select
  using (company_id = (select public.current_company_id()));
grant select on public.fornecedor_dados to authenticated;

alter table public.item_fornecedores enable row level security;
create policy item_fornecedores_select on public.item_fornecedores for select
  using (company_id = (select public.current_company_id()));
grant select on public.item_fornecedores to authenticated;

alter table public.item_materiais_alternativos enable row level security;
create policy item_materiais_alternativos_select on public.item_materiais_alternativos for select
  using (company_id = (select public.current_company_id()));
grant select on public.item_materiais_alternativos to authenticated;

alter table public.politicas_abastecimento enable row level security;
create policy politicas_abastecimento_select on public.politicas_abastecimento for select
  using (company_id = (select public.current_company_id()));
grant select on public.politicas_abastecimento to authenticated;

create trigger set_updated_at before update on public.fornecedor_dados
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.item_fornecedores
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.politicas_abastecimento
  for each row execute function public.set_updated_at();

-- =========================================================================
-- upsert_fornecedor_dados() — pessoa precisa ter papel FORNECEDOR ativo,
-- mesma validação já usada em ativar_contrato() (T18).
-- =========================================================================

create function public.upsert_fornecedor_dados(
  p_pessoa_id uuid,
  p_prazo_pagamento_dias integer default null,
  p_lead_time_dias integer default null,
  p_banco text default null,
  p_agencia text default null,
  p_conta text default null,
  p_tipo_conta text default null,
  p_chave_pix text default null,
  p_condicoes_padrao text default null,
  p_homologado boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_id uuid;
begin
  if not exists (
    select 1 from public.pessoas p
    join public.pessoa_papeis pp on pp.pessoa_id = p.id
    where p.id = p_pessoa_id and p.company_id = v_company_id
      and pp.papel = 'FORNECEDOR' and pp.ativo
  ) then
    raise exception 'A pessoa precisa ter o papel FORNECEDOR ativo nesta empresa.';
  end if;
  if p_tipo_conta is not null and p_tipo_conta not in ('corrente', 'poupanca') then
    raise exception 'Tipo de conta inválido: "%".', p_tipo_conta;
  end if;

  insert into public.fornecedor_dados (
    company_id, pessoa_id, prazo_pagamento_dias, lead_time_dias, banco, agencia,
    conta, tipo_conta, chave_pix, condicoes_padrao, homologado
  ) values (
    v_company_id, p_pessoa_id, p_prazo_pagamento_dias, p_lead_time_dias, p_banco, p_agencia,
    p_conta, p_tipo_conta, p_chave_pix, p_condicoes_padrao, coalesce(p_homologado, false)
  )
  on conflict (pessoa_id) do update set
    prazo_pagamento_dias = excluded.prazo_pagamento_dias,
    lead_time_dias = excluded.lead_time_dias,
    banco = excluded.banco,
    agencia = excluded.agencia,
    conta = excluded.conta,
    tipo_conta = excluded.tipo_conta,
    chave_pix = excluded.chave_pix,
    condicoes_padrao = excluded.condicoes_padrao,
    homologado = excluded.homologado,
    updated_at = now()
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.fornecedor_dados_atualizado', 'fornecedor_dados', v_id, null);

  return v_id;
end;
$$;

grant execute on function public.upsert_fornecedor_dados(uuid, integer, integer, text, text, text, text, text, text, boolean) to authenticated;

-- =========================================================================
-- upsert_item_fornecedor() / definir_fornecedor_principal() — TÓPICO 7
-- §13/§14. Item precisa ser material comprável (mesmo conjunto de tipos já
-- usado em peca_composicao/BomPedidoItem.tsx: materia_prima/insumo/
-- material_auxiliar).
-- =========================================================================

create function public.upsert_item_fornecedor(
  p_item_id uuid,
  p_pessoa_id uuid,
  p_prioridade integer default 100,
  p_homologado boolean default false,
  p_preco_referencia numeric default null,
  p_condicoes text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_item public.itens;
  v_id uuid;
begin
  select * into v_item from public.itens where id = p_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if v_item.tipo not in ('materia_prima', 'insumo', 'material_auxiliar') then
    raise exception 'Só item do tipo materia_prima, insumo ou material_auxiliar pode ter fornecedor associado (tipo atual: "%").', v_item.tipo;
  end if;
  if not exists (
    select 1 from public.pessoas p
    join public.pessoa_papeis pp on pp.pessoa_id = p.id
    where p.id = p_pessoa_id and p.company_id = v_company_id
      and pp.papel = 'FORNECEDOR' and pp.ativo
  ) then
    raise exception 'A pessoa precisa ter o papel FORNECEDOR ativo nesta empresa.';
  end if;
  if p_preco_referencia is not null and p_preco_referencia < 0 then
    raise exception 'Preço de referência não pode ser negativo.';
  end if;

  insert into public.item_fornecedores (
    company_id, item_id, pessoa_id, prioridade, homologado, preco_referencia, condicoes
  ) values (
    v_company_id, p_item_id, p_pessoa_id, coalesce(p_prioridade, 100), coalesce(p_homologado, false), p_preco_referencia, p_condicoes
  )
  on conflict (item_id, pessoa_id) do update set
    prioridade = excluded.prioridade,
    homologado = excluded.homologado,
    preco_referencia = excluded.preco_referencia,
    condicoes = excluded.condicoes,
    updated_at = now()
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.item_fornecedor_atualizado', 'item_fornecedores', v_id, v_item.codigo);

  return v_id;
end;
$$;

grant execute on function public.upsert_item_fornecedor(uuid, uuid, integer, boolean, numeric, text) to authenticated;

create function public.definir_fornecedor_principal(p_item_id uuid, p_pessoa_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_row public.item_fornecedores;
begin
  select * into v_row from public.item_fornecedores
    where item_id = p_item_id and pessoa_id = p_pessoa_id and company_id = v_company_id;
  if not found then
    raise exception 'Fornecedor não associado a este item nesta empresa.';
  end if;

  update public.item_fornecedores set principal = false, updated_at = now()
    where item_id = p_item_id and company_id = v_company_id and principal and id <> v_row.id;
  update public.item_fornecedores set principal = true, updated_at = now()
    where id = v_row.id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.fornecedor_principal_definido', 'item_fornecedores', v_row.id, null);

  return v_row.id;
end;
$$;

grant execute on function public.definir_fornecedor_principal(uuid, uuid) to authenticated;

-- =========================================================================
-- upsert_item_material_alternativo() / desativar_item_material_
-- alternativo() — TÓPICO 7 §15. Toda alteração é auditada em
-- activity_logs, incluindo reativação via novo upsert.
-- =========================================================================

create function public.upsert_item_material_alternativo(
  p_item_origem_id uuid,
  p_item_equivalente_id uuid,
  p_exige_aprovacao boolean default true,
  p_regra_substituicao text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_origem public.itens;
  v_equivalente public.itens;
  v_id uuid;
begin
  if p_item_origem_id = p_item_equivalente_id then
    raise exception 'Um item não pode ser alternativo dele mesmo.';
  end if;

  select * into v_origem from public.itens where id = p_item_origem_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de origem não encontrado nesta empresa.';
  end if;
  select * into v_equivalente from public.itens where id = p_item_equivalente_id and company_id = v_company_id;
  if not found then
    raise exception 'Item equivalente não encontrado nesta empresa.';
  end if;
  if v_origem.tipo not in ('materia_prima', 'insumo', 'material_auxiliar')
     or v_equivalente.tipo not in ('materia_prima', 'insumo', 'material_auxiliar') then
    raise exception 'Material alternativo só se aplica a item do tipo materia_prima, insumo ou material_auxiliar.';
  end if;

  insert into public.item_materiais_alternativos (
    company_id, item_origem_id, item_equivalente_id, exige_aprovacao, regra_substituicao, ativo
  ) values (
    v_company_id, p_item_origem_id, p_item_equivalente_id, coalesce(p_exige_aprovacao, true), p_regra_substituicao, true
  )
  on conflict (item_origem_id, item_equivalente_id) do update set
    exige_aprovacao = excluded.exige_aprovacao,
    regra_substituicao = excluded.regra_substituicao,
    ativo = true
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.material_alternativo_registrado', 'item_materiais_alternativos', v_id,
    v_origem.codigo || ' -> ' || v_equivalente.codigo);

  return v_id;
end;
$$;

grant execute on function public.upsert_item_material_alternativo(uuid, uuid, boolean, text) to authenticated;

create function public.desativar_item_material_alternativo(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
begin
  update public.item_materiais_alternativos set ativo = false
    where id = p_id and company_id = v_company_id and ativo;
  if not found then
    raise exception 'Material alternativo ativo não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.material_alternativo_desativado', 'item_materiais_alternativos', p_id, null);

  return p_id;
end;
$$;

grant execute on function public.desativar_item_material_alternativo(uuid) to authenticated;

-- =========================================================================
-- upsert_politica_abastecimento() — TÓPICO 7 §10. Consumida pelo Motor de
-- Necessidades da Fase 3 (ainda não implementada).
-- =========================================================================

create function public.upsert_politica_abastecimento(
  p_item_id uuid,
  p_tipo text default 'sob_demanda',
  p_estoque_minimo numeric default null,
  p_estoque_seguranca numeric default null,
  p_ponto_reposicao numeric default null,
  p_lote_minimo numeric default null,
  p_lote_economico numeric default null,
  p_multiplo numeric default null,
  p_fornecedor_preferencial_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_item public.itens;
  v_id uuid;
begin
  select * into v_item from public.itens where id = p_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if v_item.tipo not in ('materia_prima', 'insumo', 'material_auxiliar') then
    raise exception 'Política de abastecimento só se aplica a item do tipo materia_prima, insumo ou material_auxiliar.';
  end if;
  if p_tipo not in ('sob_demanda', 'estoque_minimo', 'seguranca', 'ponto_reposicao') then
    raise exception 'Tipo de política inválido: "%".', p_tipo;
  end if;
  if p_fornecedor_preferencial_id is not null and not exists (
    select 1 from public.pessoas p
    join public.pessoa_papeis pp on pp.pessoa_id = p.id
    where p.id = p_fornecedor_preferencial_id and p.company_id = v_company_id
      and pp.papel = 'FORNECEDOR' and pp.ativo
  ) then
    raise exception 'Fornecedor preferencial precisa ter o papel FORNECEDOR ativo nesta empresa.';
  end if;

  insert into public.politicas_abastecimento (
    company_id, item_id, tipo, estoque_minimo, estoque_seguranca, ponto_reposicao,
    lote_minimo, lote_economico, multiplo, fornecedor_preferencial_id
  ) values (
    v_company_id, p_item_id, p_tipo, p_estoque_minimo, p_estoque_seguranca, p_ponto_reposicao,
    p_lote_minimo, p_lote_economico, p_multiplo, p_fornecedor_preferencial_id
  )
  on conflict (item_id) do update set
    tipo = excluded.tipo,
    estoque_minimo = excluded.estoque_minimo,
    estoque_seguranca = excluded.estoque_seguranca,
    ponto_reposicao = excluded.ponto_reposicao,
    lote_minimo = excluded.lote_minimo,
    lote_economico = excluded.lote_economico,
    multiplo = excluded.multiplo,
    fornecedor_preferencial_id = excluded.fornecedor_preferencial_id,
    updated_at = now()
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.politica_abastecimento_atualizada', 'politicas_abastecimento', v_id, v_item.codigo);

  return v_id;
end;
$$;

grant execute on function public.upsert_politica_abastecimento(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid) to authenticated;
