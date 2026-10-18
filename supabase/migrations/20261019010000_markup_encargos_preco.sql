-- Melhorias do responsável do produto (18/10/2026), item 3 da nova rodada:
-- "Margem de preço" ganha cadastro de impostos/encargos e regime tributário,
-- e o preço sugerido passa a considerar tudo:
--     preço = custo ÷ (1 − (impostos e encargos + margem de lucro) / 100)
--     markup = 1 ÷ (1 − (impostos e encargos + margem de lucro) / 100)   [multiplica o CUSTO]
-- Sem nada cadastrado em pricing_cost_components, o resultado é IDÊNTICO ao de
-- antes (custo ÷ (1 − margem)). A margem de lucro continua em pricing_settings
-- e o override por item (item 11) continua trocando SÓ a margem de lucro; os
-- encargos são sempre os do cadastro da empresa. orcamento_itens.margem_percentual
-- segue guardando só o lucro; encargos e markup ficam no metadata do log.
--
-- O sistema NÃO sugere alíquotas: quem digita é a empresa (a alíquota certa é
-- com o contador). `regime_tributario` é só um rótulo informativo (o cálculo
-- usa os percentuais digitados).

create table public.pricing_cost_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id),
  regime_tributario text check (regime_tributario in ('mei', 'simples_nacional', 'lucro_presumido', 'lucro_real')),
  simples_nacional numeric(5, 2) not null default 0 check (simples_nacional >= 0 and simples_nacional < 100),
  icms numeric(5, 2) not null default 0 check (icms >= 0 and icms < 100),
  pis numeric(5, 2) not null default 0 check (pis >= 0 and pis < 100),
  cofins numeric(5, 2) not null default 0 check (cofins >= 0 and cofins < 100),
  iss numeric(5, 2) not null default 0 check (iss >= 0 and iss < 100),
  ipi numeric(5, 2) not null default 0 check (ipi >= 0 and ipi < 100),
  comissao numeric(5, 2) not null default 0 check (comissao >= 0 and comissao < 100),
  despesas_fixas numeric(5, 2) not null default 0 check (despesas_fixas >= 0 and despesas_fixas < 100),
  custo_financeiro_frete numeric(5, 2) not null default 0 check (custo_financeiro_frete >= 0 and custo_financeiro_frete < 100),
  soma_encargos numeric(6, 2) generated always as (
    simples_nacional + icms + pis + cofins + iss + ipi + comissao + despesas_fixas + custo_financeiro_frete
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.pricing_cost_components is 'Melhorias 18/10/2026, item 3 — impostos e encargos (% sobre o preço de venda) que entram no divisor do preço sugerido, ao lado da margem de lucro (pricing_settings). Digitados pela empresa; sem linha = encargos 0.';

create trigger set_updated_at before update on public.pricing_cost_components
  for each row execute function public.set_updated_at();

alter table public.pricing_cost_components enable row level security;
create policy pricing_cost_components_select on public.pricing_cost_components for select
  using (company_id = (select public.current_company_id()));
grant select on public.pricing_cost_components to authenticated;

create or replace function public.upsert_pricing_cost_components(
  p_regime text default null,
  p_simples_nacional numeric default 0, p_icms numeric default 0, p_pis numeric default 0,
  p_cofins numeric default 0, p_iss numeric default 0, p_ipi numeric default 0,
  p_comissao numeric default 0, p_despesas_fixas numeric default 0, p_custo_financeiro_frete numeric default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before public.pricing_cost_components;
  v_margem numeric;
  v_soma numeric;
  v_id uuid;
begin
  if p_regime is not null and p_regime not in ('mei', 'simples_nacional', 'lucro_presumido', 'lucro_real') then
    raise exception 'Regime tributário inválido: "%".', p_regime;
  end if;
  if least(p_simples_nacional, p_icms, p_pis, p_cofins, p_iss, p_ipi, p_comissao, p_despesas_fixas, p_custo_financeiro_frete) < 0
     or greatest(p_simples_nacional, p_icms, p_pis, p_cofins, p_iss, p_ipi, p_comissao, p_despesas_fixas, p_custo_financeiro_frete) >= 100 then
    raise exception 'Cada percentual deve ser maior ou igual a 0 e menor que 100.';
  end if;

  v_soma := p_simples_nacional + p_icms + p_pis + p_cofins + p_iss + p_ipi + p_comissao + p_despesas_fixas + p_custo_financeiro_frete;
  select margem_percentual into v_margem from public.pricing_settings where company_id = v_company_id;
  if v_soma + coalesce(v_margem, 0) >= 100 then
    raise exception 'A soma de impostos/encargos (%) com a margem de lucro (%) precisa ser menor que 100%%.', v_soma, coalesce(v_margem, 0);
  end if;

  select * into v_before from public.pricing_cost_components where company_id = v_company_id for update;

  insert into public.pricing_cost_components (
    company_id, regime_tributario, simples_nacional, icms, pis, cofins, iss, ipi, comissao, despesas_fixas, custo_financeiro_frete
  ) values (
    v_company_id, p_regime, p_simples_nacional, p_icms, p_pis, p_cofins, p_iss, p_ipi, p_comissao, p_despesas_fixas, p_custo_financeiro_frete
  )
  on conflict (company_id) do update set
    regime_tributario = excluded.regime_tributario, simples_nacional = excluded.simples_nacional, icms = excluded.icms,
    pis = excluded.pis, cofins = excluded.cofins, iss = excluded.iss, ipi = excluded.ipi, comissao = excluded.comissao,
    despesas_fixas = excluded.despesas_fixas, custo_financeiro_frete = excluded.custo_financeiro_frete
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.encargos_preco_upserted', 'pricing_cost_components', v_id, null,
    jsonb_build_object(
      'before', to_jsonb(v_before),
      'after', jsonb_build_object('regime_tributario', p_regime, 'soma_encargos', v_soma)
    )
  );

  return v_id;
end;
$$;

revoke all on function public.upsert_pricing_cost_components(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.upsert_pricing_cost_components(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- A margem de lucro também não pode mais estourar 100% junto com os encargos.
create or replace function public.upsert_margem_preco(p_percentual numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before public.pricing_settings;
  v_encargos numeric;
  v_id uuid;
begin
  if p_percentual is null or p_percentual < 0 or p_percentual >= 100 then
    raise exception 'Margem deve ser maior ou igual a 0 e menor que 100.';
  end if;
  select soma_encargos into v_encargos from public.pricing_cost_components where company_id = v_company_id;
  if coalesce(v_encargos, 0) + p_percentual >= 100 then
    raise exception 'A soma de impostos/encargos (%) com a margem de lucro (%) precisa ser menor que 100%%.', coalesce(v_encargos, 0), p_percentual;
  end if;

  select * into v_before from public.pricing_settings where company_id = v_company_id for update;

  insert into public.pricing_settings (company_id, margem_percentual)
  values (v_company_id, p_percentual)
  on conflict (company_id) do update set margem_percentual = excluded.margem_percentual
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.margem_preco_upserted', 'pricing_setting', v_id, null,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object('margem_percentual', p_percentual))
  );

  return v_id;
end;
$$;

create or replace function public._calcular_preco_configurador(p_company_id uuid, p_item_id uuid, p_valores jsonb, p_margem_override numeric default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_peca_id uuid;
  v_custo jsonb;
  v_mo jsonb;
  v_margem numeric;
  v_margem_empresa numeric;
  v_encargos numeric := 0;
  v_regime text;
  v_divisor numeric;
  v_pendentes jsonb;
  v_tem_roteiro boolean;
  v_material numeric;
  v_mao numeric;
  v_total numeric;
  v_motivo_custo text;
  v_motivo text;
  v_preco numeric;
begin
  select id into v_peca_id from public.pecas where item_id = p_item_id and company_id = p_company_id;
  if not found then
    return jsonb_build_object('aplica_configurador', false);
  end if;

  v_custo := public._calcular_custo_peca(p_company_id, v_peca_id, p_valores);
  v_mo := public._calcular_mao_obra_item(p_company_id, p_item_id);
  select margem_percentual into v_margem_empresa from public.pricing_settings where company_id = p_company_id;
  v_margem := coalesce(p_margem_override, v_margem_empresa);
  -- Melhorias 18/10/2026, item 3: impostos/encargos cadastrados entram no
  -- divisor junto com o lucro. Sem cadastro = 0 = fórmula antiga.
  select soma_encargos, regime_tributario into v_encargos, v_regime
  from public.pricing_cost_components where company_id = p_company_id;
  v_encargos := coalesce(v_encargos, 0);

  select coalesce(jsonb_agg(pc.nome order by pc.nome), '[]'::jsonb) into v_pendentes
  from public.peca_caracteristicas pc
  where pc.peca_id = v_peca_id and pc.company_id = p_company_id and pc.obrigatoria and not (p_valores ? pc.id::text);

  v_tem_roteiro := coalesce((v_mo ->> 'tem_roteiro')::boolean, false);
  v_material := (v_custo ->> 'custo_total')::numeric;
  v_mao := case when v_tem_roteiro then (v_mo ->> 'custo_total')::numeric else null end;
  v_total := v_material + coalesce(v_mao, 0);

  v_motivo_custo := case
    when jsonb_array_length(v_pendentes) > 0 then 'caracteristicas_pendentes'
    when coalesce((v_custo ->> 'dimensoes_pendentes')::boolean, false) then 'dimensoes_pendentes'
    when coalesce((v_custo ->> 'unidade_dimensao_invalida')::boolean, false) then 'unidade_dimensao_invalida'
    when jsonb_array_length(v_custo -> 'componentes') = 0 then 'sem_componentes_custeados'
    when jsonb_array_length(v_custo -> 'materiais_sem_custo') > 0 then 'custo_material_incompleto'
    when v_tem_roteiro and jsonb_array_length(v_mo -> 'operacoes_sem_custo') > 0 then 'custo_mao_obra_incompleto'
    else null
  end;

  v_motivo := coalesce(
    v_motivo_custo,
    case
      when v_margem is null then 'margem_nao_configurada'
      when v_encargos + v_margem >= 100 then 'encargos_invalidos'
      else null
    end
  );
  if v_margem is not null and v_encargos + v_margem < 100 then
    v_divisor := 1 - (v_encargos + v_margem) / 100.0;
  end if;

  if v_motivo is null then
    v_preco := round(v_total / v_divisor, 2);
  end if;

  return jsonb_build_object(
    'aplica_configurador', true,
    'custo_completo', v_motivo_custo is null,
    'custo_material', v_material,
    'custo_mao_obra', v_mao,
    'custo_total', v_total,
    'margem_percentual', v_margem,
    'margem_padrao_empresa', v_margem_empresa,
    'margem_personalizada', p_margem_override is not null,
    'encargos_percentual', v_encargos,
    'regime_tributario', v_regime,
    'markup', case when v_divisor is not null then round(1 / v_divisor, 4) else null end,
    'preco_sugerido', v_preco,
    'motivo_sem_preco', v_motivo,
    'caracteristicas_pendentes', v_pendentes,
    'material', v_custo,
    'mao_obra', v_mo
  );
end;
$$;

create or replace function public.upsert_orcamento_item_configurado(
  p_id uuid,
  p_orcamento_id uuid,
  p_item_id uuid,
  p_quantidade numeric,
  p_valores jsonb,
  p_preco_override numeric default null,
  p_margem_override numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('orcamentos', 'manage');
  v_orcamento public.orcamentos;
  v_before public.orcamento_itens;
  v_peca_id uuid;
  v_calculo jsonb;
  v_preco numeric;
  v_custo_material numeric;
  v_custo_mao numeric;
  v_margem_gravada numeric;
  v_id uuid;
  v_entry record;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if p_preco_override is not null and p_preco_override < 0 then
    raise exception 'Preço unitário inválido.';
  end if;
  if p_margem_override is not null and (p_margem_override < 0 or p_margem_override >= 100) then
    raise exception 'Margem deve estar entre 0 e menos de 100.';
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

  select id into v_peca_id from public.pecas where item_id = p_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Este item não é uma peça configurável — use o formulário comum de item.';
  end if;

  perform public._validar_valores_configurador(v_company_id, v_peca_id, coalesce(p_valores, '{}'::jsonb));

  v_calculo := public._calcular_preco_configurador(v_company_id, p_item_id, coalesce(p_valores, '{}'::jsonb), p_margem_override);

  if jsonb_array_length(v_calculo -> 'caracteristicas_pendentes') > 0 then
    raise exception 'Preencha as características obrigatórias: %.',
      (select string_agg(value #>> '{}', ', ') from jsonb_array_elements(v_calculo -> 'caracteristicas_pendentes'));
  end if;

  v_preco := coalesce(p_preco_override, (v_calculo ->> 'preco_sugerido')::numeric);
  if v_preco is null then
    raise exception 'Não foi possível calcular o preço automaticamente (%). Informe o preço manualmente.',
      case v_calculo ->> 'motivo_sem_preco'
        when 'dimensoes_pendentes' then 'dimensões pendentes'
        when 'unidade_dimensao_invalida' then 'a unidade de largura/altura da peça precisa ser mm, cm ou m — corrija no cadastro da peça'
        when 'sem_componentes_custeados' then 'nenhum componente com custo'
        when 'custo_material_incompleto' then 'há material sem histórico de compra'
        when 'custo_mao_obra_incompleto' then 'há operação sem tempo ou custo/hora'
        when 'margem_nao_configurada' then 'margem de preço da empresa não configurada'
        when 'encargos_invalidos' then 'a soma de impostos/encargos e margem chega a 100% ou mais — revise em Configurações → Margem de preço'
        else 'motivo desconhecido'
      end;
  end if;

  -- Melhorias 17/10/2026, item 11: a margem fica gravada na linha só quando o
  -- preço veio do cálculo; preço digitado à mão não tem margem a registrar.
  if p_preco_override is null then
    v_margem_gravada := (v_calculo ->> 'margem_percentual')::numeric;
  end if;

  -- Custo só é gravado quando está completo — custo parcial subestimaria o
  -- custo real e distorceria a margem exibida (ADR-012: nunca assumir zero).
  if (v_calculo ->> 'custo_completo')::boolean then
    v_custo_material := (v_calculo ->> 'custo_material')::numeric;
    v_custo_mao := (v_calculo ->> 'custo_mao_obra')::numeric;
  end if;

  if p_id is not null then
    select * into v_before from public.orcamento_itens
    where id = p_id and orcamento_id = p_orcamento_id
    for update;
    if not found then
      raise exception 'Item do orçamento não encontrado.';
    end if;

    update public.orcamento_itens set
      item_id = p_item_id, quantidade = p_quantidade, preco_unitario = v_preco,
      custo_unitario = v_custo_material, custo_mao_obra = v_custo_mao,
      margem_percentual = v_margem_gravada
    where id = p_id
    returning id into v_id;
  else
    insert into public.orcamento_itens (orcamento_id, item_id, quantidade, preco_unitario, custo_unitario, custo_mao_obra, margem_percentual)
    values (p_orcamento_id, p_item_id, p_quantidade, v_preco, v_custo_material, v_custo_mao, v_margem_gravada)
    returning id into v_id;
  end if;

  -- Valores das características: o payload é a verdade — o que não vier
  -- nele (inclusive características de uma peça anterior, se o item mudou)
  -- é removido.
  delete from public.orcamento_item_caracteristicas
  where orcamento_item_id = v_id and not (coalesce(p_valores, '{}'::jsonb) ? peca_caracteristica_id::text);

  for v_entry in select key, value from jsonb_each(coalesce(p_valores, '{}'::jsonb)) loop
    insert into public.orcamento_item_caracteristicas (company_id, orcamento_item_id, peca_caracteristica_id, valor_numero, valor_texto)
    values (
      v_company_id, v_id, v_entry.key::uuid,
      case when jsonb_typeof(v_entry.value -> 'n') = 'number' then (v_entry.value ->> 'n')::numeric else null end,
      case when jsonb_typeof(v_entry.value -> 't') = 'string' then v_entry.value ->> 't' else null end
    )
    on conflict (orcamento_item_id, peca_caracteristica_id)
    do update set valor_numero = excluded.valor_numero, valor_texto = excluded.valor_texto, updated_at = now();
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_item_upserted', 'orcamento_item', v_id, v_orcamento.numero,
    jsonb_build_object(
      'origem', 'configurador',
      'before', to_jsonb(v_before),
      'after', jsonb_build_object(
        'orcamento_id', p_orcamento_id, 'item_id', p_item_id, 'quantidade', p_quantidade,
        'preco_unitario', v_preco, 'custo_unitario', v_custo_material, 'custo_mao_obra', v_custo_mao
      ),
      'preco_sugerido', v_calculo -> 'preco_sugerido',
      'preco_ajustado_pelo_vendedor', p_preco_override is not null,
      'margem_percentual', v_calculo -> 'margem_percentual',
      'margem_personalizada', p_margem_override is not null,
      'encargos_percentual', v_calculo -> 'encargos_percentual',
      'markup', v_calculo -> 'markup',
      'valores', coalesce(p_valores, '{}'::jsonb)
    )
  );

  return v_id;
end;
$$;
