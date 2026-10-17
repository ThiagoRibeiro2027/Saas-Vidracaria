-- Melhorias do responsável do produto (item 11, 17/10/2026): a margem de
-- venda deixa de ser só o percentual único da empresa (pricing_settings).
-- Decisão do responsável: margem POR ITEM do orçamento. A margem da empresa
-- continua sendo o valor padrão/sugerido; cada item configurável pode ter a
-- sua (0 <= margem < 100), usada no preço sugerido = custo ÷ (1 − margem).
-- A margem aplicada fica gravada na linha (orcamento_itens.margem_percentual)
-- quando o preço veio do cálculo; preço digitado à mão não grava margem.
-- Vale pra itens configuráveis (peças), que são os que têm custo calculado;
-- item comum continua com preço digitado.
--
-- As três funções ganham p_margem_override no FIM (default null). Aridade
-- nova = função nova no Postgres, então a antiga é removida explicitamente
-- (senão o PostgREST fica com duas sobrecargas ambíguas).

alter table public.orcamento_itens
  add column margem_percentual numeric(5, 2)
    check (margem_percentual is null or (margem_percentual >= 0 and margem_percentual < 100));
comment on column public.orcamento_itens.margem_percentual is
  'Melhorias 17/10/2026, item 11 — margem usada no preço sugerido deste item (a da empresa ou a informada pelo vendedor). NULL = preço digitado manualmente ou item sem configurador.';

drop function if exists public._calcular_preco_configurador(uuid, uuid, jsonb);
drop function if exists public.calcular_preco_configurador(uuid, jsonb);
drop function if exists public.upsert_orcamento_item_configurado(uuid, uuid, uuid, numeric, jsonb, numeric);

create or replace function public._calcular_preco_configurador(p_company_id uuid, p_item_id uuid, p_valores jsonb, p_margem_override numeric default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_peca_id uuid;
  v_custo jsonb;
  v_mo jsonb;
  v_margem numeric;
  v_margem_empresa numeric;
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

  v_motivo := coalesce(v_motivo_custo, case when v_margem is null then 'margem_nao_configurada' else null end);

  if v_motivo is null then
    v_preco := round(v_total / (1 - v_margem / 100.0), 2);
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
    'preco_sugerido', v_preco,
    'motivo_sem_preco', v_motivo,
    'caracteristicas_pendentes', v_pendentes,
    'material', v_custo,
    'mao_obra', v_mo
  );
end;
$$;

revoke all on function public._calcular_preco_configurador(uuid, uuid, jsonb, numeric) from public, anon, authenticated;

create or replace function public.calcular_preco_configurador(p_item_id uuid, p_valores jsonb default '{}'::jsonb, p_margem_override numeric default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_peca_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'view') then
    raise exception 'Sem permissão para consultar orçamentos (orcamentos.view).';
  end if;
  if p_margem_override is not null and (p_margem_override < 0 or p_margem_override >= 100) then
    raise exception 'Margem deve estar entre 0 e menos de 100.';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  select id into v_peca_id from public.pecas where item_id = p_item_id and company_id = v_company_id;
  if not found then
    return jsonb_build_object('aplica_configurador', false);
  end if;

  perform public._validar_valores_configurador(v_company_id, v_peca_id, coalesce(p_valores, '{}'::jsonb));

  return public._calcular_preco_configurador(v_company_id, p_item_id, coalesce(p_valores, '{}'::jsonb), p_margem_override);
end;
$$;

revoke all on function public.calcular_preco_configurador(uuid, jsonb, numeric) from public, anon;
grant execute on function public.calcular_preco_configurador(uuid, jsonb, numeric) to authenticated;

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
      'valores', coalesce(p_valores, '{}'::jsonb)
    )
  );

  return v_id;
end;
$$;

revoke all on function public.upsert_orcamento_item_configurado(uuid, uuid, uuid, numeric, jsonb, numeric, numeric) from public, anon;
grant execute on function public.upsert_orcamento_item_configurado(uuid, uuid, uuid, numeric, jsonb, numeric, numeric) to authenticated;
