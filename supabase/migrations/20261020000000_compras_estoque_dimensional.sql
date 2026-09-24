-- Compras completo (T7) — Fase 2 da ADR-011 (docs/ADR-011 — Compras
-- v1.0.md): estoque dimensional e conversão de unidade completa,
-- implementando a emenda ao ADR-002 §4.6 (v2.8→v2.9, mesmo commit da
-- ADR-011). Fase de maior risco técnico do roteiro — estende T6
-- (`estoque_saldos`/`ajustar_saldo`), já em produção.
--
-- T6 modela saldo como ESCALAR por decisão original (comentário da
-- migration 20260913230000: "saldo é ESCALAR... não peça física
-- individual") — decisão que continua valendo, sem nenhuma alteração de
-- comportamento, para todo item que não optar pelo contrário.
-- `estoque_saldos`/`ajustar_saldo()`/`registrar_entrada_sobra()` não são
-- tocados por esta migration.
--
-- O que esta fase acrescenta, de forma aditiva:
--   1. `itens` ganha duas colunas opcionais (dimensao_tipo, peso_por_
--      unidade_dimensao) — só usadas por item que optar por controle por
--      peça; nula para todo o resto do catálogo.
--   2. `itens_pecas_dimensionais` — peça física individual (barra, chapa,
--      bobina) com quantidade original/disponível na unidade_principal do
--      item (metro linear ou m²). Consumir parte de uma peça só reduz
--      quantidade_disponivel na mesma linha — o que sobra é, por
--      construção, a "sobra reaproveitável" (TÓPICO 7 §9 base): não existe
--      um conceito separado de "linha de sobra", é a mesma peça com saldo
--      menor, disponível pra nova consulta/consumo.
--   3. Conversão de unidade dimensional completa (§6): metro linear → kg
--      via peso_por_unidade_dimensao (linear) ou área → kg (area) — não um
--      fator fixo genérico, o fator é a propriedade física real do item.
--
-- Fora desta emenda (ADR-002 §4.6, texto da emenda): lote/série/
-- certificado de qualidade por peça (Recebimento, Fase 7 da ADR-011) e
-- qualquer otimização de corte/nesting sobre as peças/sobras aqui
-- controladas (vedação do TÓPICO 4 §54 permanece integral — isto é só
-- saldo/posição, nunca decisão de corte).

alter table public.itens
  add column dimensao_tipo text check (dimensao_tipo is null or dimensao_tipo in ('linear', 'area')),
  add column peso_por_unidade_dimensao numeric(14, 4) check (peso_por_unidade_dimensao is null or peso_por_unidade_dimensao > 0);
comment on column public.itens.dimensao_tipo is 'Fase 2 da ADR-011 — null = item escalar (padrão, T6 inalterado); "linear" = peça medida em metro (barra/perfil); "area" = peça medida em m² (chapa/bobina/vidro).';
comment on column public.itens.peso_por_unidade_dimensao is 'Fase 2 da ADR-011 — kg por 1 unidade_principal do item (kg/m se dimensao_tipo=linear, kg/m² se dimensao_tipo=area). Base da conversão de unidade dimensional completa (TÓPICO 7 §6).';

create table public.itens_pecas_dimensionais (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null references public.itens(id),
  identificador text,
  quantidade_original numeric(14, 4) not null check (quantidade_original > 0),
  quantidade_disponivel numeric(14, 4) not null check (quantidade_disponivel >= 0),
  situacao text not null default 'disponivel' check (situacao in ('disponivel', 'esgotada')),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itens_pecas_dimensionais_disponivel_check check (quantidade_disponivel <= quantidade_original)
);
comment on table public.itens_pecas_dimensionais is 'Fase 2 da ADR-011 (TÓPICO 7 §5/§9 base) — peça física individual de item com dimensao_tipo definido. quantidade_original/disponivel na unidade_principal do item (metro ou m²). Consumo parcial só reduz quantidade_disponivel na mesma linha — isso já É a sobra reaproveitável, sem tabela/estado separado.';
create index itens_pecas_dimensionais_company_id_idx on public.itens_pecas_dimensionais (company_id);
create index itens_pecas_dimensionais_item_id_idx on public.itens_pecas_dimensionais (item_id);

alter table public.itens_pecas_dimensionais enable row level security;
create policy itens_pecas_dimensionais_select on public.itens_pecas_dimensionais for select
  using (company_id = (select public.current_company_id()));
grant select on public.itens_pecas_dimensionais to authenticated;

create trigger set_updated_at before update on public.itens_pecas_dimensionais
  for each row execute function public.set_updated_at();

-- =========================================================================
-- definir_propriedades_dimensionais_item() — gate itens.manage (T2), é
-- edição de propriedade de item, não uma ação de estoque ou de compras.
-- Desligar o controle (p_dimensao_tipo = null) é bloqueado se existir
-- peça dimensional já registrada para o item, pra nunca deixar peça
-- órfã de configuração.
-- =========================================================================

create function public.definir_propriedades_dimensionais_item(
  p_item_id uuid,
  p_dimensao_tipo text,
  p_peso_por_unidade_dimensao numeric default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_item public.itens;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('itens', 'manage') then
    raise exception 'Sem permissão para gerenciar itens (itens.manage).';
  end if;
  perform public.assert_company_not_suspended();

  select * into v_item from public.itens where id = p_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if p_dimensao_tipo is not null and p_dimensao_tipo not in ('linear', 'area') then
    raise exception 'Tipo de dimensão inválido: "%".', p_dimensao_tipo;
  end if;
  if p_peso_por_unidade_dimensao is not null and p_peso_por_unidade_dimensao <= 0 then
    raise exception 'Peso por unidade de dimensão deve ser maior que zero.';
  end if;
  if p_dimensao_tipo is null and exists (
    select 1 from public.itens_pecas_dimensionais where item_id = p_item_id and company_id = v_company_id
  ) then
    raise exception 'Não é possível desligar o controle dimensional: já existe peça dimensional registrada para este item.';
  end if;

  update public.itens set dimensao_tipo = p_dimensao_tipo, peso_por_unidade_dimensao = p_peso_por_unidade_dimensao
  where id = p_item_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'estoque.propriedades_dimensionais_definidas', 'itens', p_item_id, v_item.codigo);

  return p_item_id;
end;
$$;

grant execute on function public.definir_propriedades_dimensionais_item(uuid, text, numeric) to authenticated;

-- =========================================================================
-- registrar_peca_dimensional() / consumir_peca_dimensional() — TÓPICO 7
-- §5/§9 base. Gate estoque.manage, mesmo recurso de ajustar_saldo()/
-- registrar_entrada_sobra() — isto é saldo/posição de estoque, não ação
-- de compra.
-- =========================================================================

create function public.registrar_peca_dimensional(
  p_item_id uuid,
  p_quantidade numeric,
  p_identificador text default null,
  p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('estoque', 'manage');
  v_item public.itens;
  v_id uuid;
begin
  select * into v_item from public.itens where id = p_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if v_item.dimensao_tipo is null then
    raise exception 'Item não tem controle dimensional configurado (definir_propriedades_dimensionais_item()).';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  insert into public.itens_pecas_dimensionais (
    company_id, item_id, identificador, quantidade_original, quantidade_disponivel, observacao
  ) values (
    v_company_id, p_item_id, p_identificador, p_quantidade, p_quantidade, p_observacao
  )
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'estoque.peca_dimensional_registrada', 'itens_pecas_dimensionais', v_id, v_item.codigo);

  return v_id;
end;
$$;

grant execute on function public.registrar_peca_dimensional(uuid, numeric, text, text) to authenticated;

create function public.consumir_peca_dimensional(
  p_peca_id uuid,
  p_quantidade numeric,
  p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('estoque', 'manage');
  v_peca public.itens_pecas_dimensionais;
  v_restante numeric;
begin
  select * into v_peca from public.itens_pecas_dimensionais
    where id = p_peca_id and company_id = v_company_id;
  if not found then
    raise exception 'Peça dimensional não encontrada nesta empresa.';
  end if;
  if v_peca.situacao <> 'disponivel' then
    raise exception 'Peça dimensional não está disponível (situação atual: "%").', v_peca.situacao;
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade a consumir deve ser maior que zero.';
  end if;
  if p_quantidade > v_peca.quantidade_disponivel then
    raise exception 'Quantidade a consumir (%) maior que a disponível (%).', p_quantidade, v_peca.quantidade_disponivel;
  end if;

  v_restante := v_peca.quantidade_disponivel - p_quantidade;

  update public.itens_pecas_dimensionais
  set quantidade_disponivel = v_restante,
      situacao = case when v_restante = 0 then 'esgotada' else 'disponivel' end,
      updated_at = now()
  where id = p_peca_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.peca_dimensional_consumida', 'itens_pecas_dimensionais', p_peca_id, p_observacao,
    jsonb_build_object('quantidade_consumida', p_quantidade, 'quantidade_restante', v_restante)
  );

  return p_peca_id;
end;
$$;

grant execute on function public.consumir_peca_dimensional(uuid, numeric, text) to authenticated;

-- =========================================================================
-- converter_item_para_peso() / converter_item_de_peso() — TÓPICO 7 §6,
-- conversão de unidade dimensional completa. Leitura, gate estoque.view
-- (padrão manual, mesmo de listar_composicao_peca).
-- =========================================================================

create function public.converter_item_para_peso(p_item_id uuid, p_quantidade numeric)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_item public.itens;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('estoque', 'view') then
    raise exception 'Sem permissão para consultar estoque (estoque.view).';
  end if;
  select * into v_item from public.itens where id = p_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if v_item.peso_por_unidade_dimensao is null then
    raise exception 'Item não tem conversão de unidade configurada.';
  end if;
  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'Quantidade inválida.';
  end if;

  return p_quantidade * v_item.peso_por_unidade_dimensao;
end;
$$;

grant execute on function public.converter_item_para_peso(uuid, numeric) to authenticated;

create function public.converter_item_de_peso(p_item_id uuid, p_quantidade_kg numeric)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_item public.itens;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('estoque', 'view') then
    raise exception 'Sem permissão para consultar estoque (estoque.view).';
  end if;
  select * into v_item from public.itens where id = p_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if v_item.peso_por_unidade_dimensao is null then
    raise exception 'Item não tem conversão de unidade configurada.';
  end if;
  if p_quantidade_kg is null or p_quantidade_kg < 0 then
    raise exception 'Quantidade inválida.';
  end if;

  return p_quantidade_kg / v_item.peso_por_unidade_dimensao;
end;
$$;

grant execute on function public.converter_item_de_peso(uuid, numeric) to authenticated;
