-- ADR-012 v1.1 — correção de unidade das dimensões (achado em teste na tela
-- real, 03/10/2026). O cálculo supunha largura/altura sempre em milímetros
-- (perímetro = 2 x (L + A) / 1000; área = L x A / 1.000.000), mas as peças
-- do catálogo da JR Box têm dimensões em METROS: com 2 m x 1,5 m o sistema
-- calculava 0,00756 m de perfil e 0,00000315 m² de vidro (1.000x e
-- 1.000.000x abaixo do real). Hoje isso não gerou preço errado só porque
-- esses materiais ainda não tinham custo e a margem não estava configurada.
--
-- Agora a unidade é lida de peca_caracteristicas.unidade (mm, cm ou m,
-- sem diferenciar maiúscula/minúscula) e as dimensões são convertidas para
-- metros antes do cálculo. Para unidade em mm o resultado é idêntico ao
-- anterior. Unidade vazia ou desconhecida NÃO é adivinhada: o cálculo
-- devolve unidade_dimensao_invalida, as linhas dimensionais ficam de fora e
-- o preço não é sugerido (motivo 'unidade_dimensao_invalida'), pelo mesmo
-- princípio do ADR-012 de nunca assumir em silêncio.
--
-- Só são recriadas as 3 funções afetadas, com a mesma assinatura (grants e
-- revokes da 20261010005600 permanecem).

create or replace function public._calcular_custo_peca(p_company_id uuid, p_peca_id uuid, p_valores jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := p_company_id;
  v_peca_id uuid := p_peca_id;
  v_largura numeric;
  v_altura numeric;
  v_dimensoes_pendentes boolean;
  v_un_largura text;
  v_un_altura text;
  v_fator_largura numeric;
  v_fator_altura numeric;
  v_largura_m numeric;
  v_altura_m numeric;
  v_unidade_invalida boolean;
  v_quantidades jsonb := '{}'::jsonb;
  v_comp record;
  v_regra record;
  v_valor_numero numeric;
  v_valor_texto text;
  v_condicao_bate boolean;
  v_base numeric;
  v_necessidade numeric;
  v_material record;
  v_custo_unit numeric;
  v_custo_total numeric := 0;
  v_componentes jsonb := '[]'::jsonb;
  v_sem_custo jsonb := '[]'::jsonb;
  v_opcoes_count integer;
  v_opcao record;
  v_comprimentos numeric[];
  v_custos_barra numeric[];
  v_itens_barra uuid[];
  v_alvo_cm integer;
  v_comp_cm integer;
  v_dp numeric[];
  v_escolha integer[];
  v_contagem integer[];
  v_m integer;
  v_k integer;
  v_melhor numeric;
  v_melhor_k integer;
  v_candidato numeric;
begin
  select (p_valores -> pcar.id::text ->> 'n')::numeric into v_largura
  from public.peca_caracteristicas pcar
  where pcar.peca_id = v_peca_id and pcar.papel_dimensional = 'largura' and p_valores ? pcar.id::text
  limit 1;

  select (p_valores -> pcar.id::text ->> 'n')::numeric into v_altura
  from public.peca_caracteristicas pcar
  where pcar.peca_id = v_peca_id and pcar.papel_dimensional = 'altura' and p_valores ? pcar.id::text
  limit 1;

  v_dimensoes_pendentes := exists (
    select 1 from public.peca_composicao
    where peca_id = v_peca_id and tipo_calculo in ('linear', 'area')
  ) and (v_largura is null or v_altura is null);

  -- Unidade das dimensões lida do cadastro da característica (mm, cm ou m)
  -- e convertida para metros — antes supunha sempre mm, o que subestimava
  -- 1.000x o perímetro e 1.000.000x a área de peça cadastrada em metros.
  -- Unidade vazia ou desconhecida não é adivinhada: sinaliza e a linha
  -- dimensional fica de fora (nunca um custo com a escala errada).
  select lower(btrim(pcar.unidade)) into v_un_largura
  from public.peca_caracteristicas pcar
  where pcar.peca_id = v_peca_id and pcar.papel_dimensional = 'largura'
  limit 1;
  select lower(btrim(pcar.unidade)) into v_un_altura
  from public.peca_caracteristicas pcar
  where pcar.peca_id = v_peca_id and pcar.papel_dimensional = 'altura'
  limit 1;
  v_fator_largura := case v_un_largura when 'mm' then 0.001 when 'cm' then 0.01 when 'm' then 1 else null end;
  v_fator_altura := case v_un_altura when 'mm' then 0.001 when 'cm' then 0.01 when 'm' then 1 else null end;
  v_unidade_invalida := exists (
    select 1 from public.peca_composicao
    where peca_id = v_peca_id and tipo_calculo in ('linear', 'area')
  ) and (v_fator_largura is null or v_fator_altura is null);
  v_largura_m := v_largura * v_fator_largura;
  v_altura_m := v_altura * v_fator_altura;

  -- Base fixa (tipo_calculo='fixo').
  for v_comp in
    select material_item_id, quantidade_por_unidade
    from public.peca_composicao
    where peca_id = v_peca_id and tipo_calculo = 'fixo'
  loop
    v_quantidades := v_quantidades || jsonb_build_object(v_comp.material_item_id::text, v_comp.quantidade_por_unidade);
  end loop;

  -- Linear/área — precisa de largura E altura capturadas.
  for v_comp in
    select id, material_item_id, quantidade_por_unidade, tipo_calculo, percentual_perda
    from public.peca_composicao
    where peca_id = v_peca_id and tipo_calculo in ('linear', 'area')
  loop
    if v_largura is null or v_altura is null or v_unidade_invalida then
      continue;
    end if;
    if v_comp.tipo_calculo = 'linear' then
      v_base := 2 * (v_largura_m + v_altura_m);
    else
      v_base := v_largura_m * v_altura_m;
    end if;
    v_necessidade := v_base * v_comp.quantidade_por_unidade * (1 + v_comp.percentual_perda / 100.0);

    if v_comp.tipo_calculo <> 'linear' then
      v_quantidades := v_quantidades || jsonb_build_object(v_comp.material_item_id::text, v_necessidade);
      continue;
    end if;

    select count(*) into v_opcoes_count
    from public.peca_composicao_comprimentos_barra
    where peca_composicao_id = v_comp.id;

    if v_opcoes_count = 0 then
      v_quantidades := v_quantidades || jsonb_build_object(v_comp.material_item_id::text, v_necessidade);
      continue;
    end if;

    v_comprimentos := array[]::numeric[];
    v_custos_barra := array[]::numeric[];
    v_itens_barra := array[]::uuid[];

    for v_opcao in
      select item_id, comprimento_metros
      from public.peca_composicao_comprimentos_barra
      where peca_composicao_id = v_comp.id
      order by comprimento_metros
    loop
      select pci.custo_unitario into v_custo_unit
      from public.pedido_compra_itens pci
      join public.pedidos_compra pc on pc.id = pci.pedido_compra_id and pc.company_id = v_company_id
      where pci.item_id = v_opcao.item_id and pci.company_id = v_company_id and pci.custo_unitario is not null
      order by pci.created_at desc
      limit 1;

      if v_custo_unit is null then
        v_sem_custo := v_sem_custo || jsonb_build_object(
          'item_id', v_opcao.item_id,
          'codigo', (select codigo from public.itens where id = v_opcao.item_id),
          'descricao', (select descricao from public.itens where id = v_opcao.item_id),
          'quantidade', null,
          'motivo', 'comprimento de barra sem histórico de compra'
        );
      else
        v_comprimentos := v_comprimentos || v_opcao.comprimento_metros;
        v_custos_barra := v_custos_barra || v_custo_unit;
        v_itens_barra := v_itens_barra || v_opcao.item_id;
      end if;
    end loop;

    if array_length(v_comprimentos, 1) is null then
      continue;
    end if;

    v_alvo_cm := ceil(v_necessidade * 100)::integer;
    if v_alvo_cm > 10000 then
      raise exception 'Metragem necessária (%.2fm) implausível para cálculo de barras — confira as dimensões capturadas.', v_necessidade;
    end if;
    if v_alvo_cm < 1 then
      v_alvo_cm := 1;
    end if;

    v_dp := array_fill(null::numeric, array[v_alvo_cm + 1]);
    v_escolha := array_fill(null::integer, array[v_alvo_cm + 1]);
    v_dp[1] := 0;

    for v_m in 1..v_alvo_cm loop
      v_melhor := null;
      v_melhor_k := null;
      for v_k in 1..array_length(v_comprimentos, 1) loop
        v_comp_cm := round(v_comprimentos[v_k] * 100)::integer;
        if v_comp_cm >= v_m then
          v_candidato := v_custos_barra[v_k];
        else
          v_candidato := v_custos_barra[v_k] + v_dp[v_m - v_comp_cm + 1];
        end if;
        if v_melhor is null or v_candidato < v_melhor then
          v_melhor := v_candidato;
          v_melhor_k := v_k;
        end if;
      end loop;
      v_dp[v_m + 1] := v_melhor;
      v_escolha[v_m + 1] := v_melhor_k;
    end loop;

    v_contagem := array_fill(0, array[array_length(v_comprimentos, 1)]);
    v_m := v_alvo_cm;
    while v_m > 0 loop
      v_k := v_escolha[v_m + 1];
      v_contagem[v_k] := v_contagem[v_k] + 1;
      v_comp_cm := round(v_comprimentos[v_k] * 100)::integer;
      v_m := greatest(0, v_m - v_comp_cm);
    end loop;

    for v_k in 1..array_length(v_comprimentos, 1) loop
      if v_contagem[v_k] > 0 then
        v_custo_total := v_custo_total + (v_contagem[v_k] * v_custos_barra[v_k]);
        v_componentes := v_componentes || jsonb_build_object(
          'item_id', v_itens_barra[v_k],
          'codigo', (select codigo from public.itens where id = v_itens_barra[v_k]),
          'descricao', (select descricao from public.itens where id = v_itens_barra[v_k]),
          'quantidade', v_contagem[v_k],
          'comprimento_metros', v_comprimentos[v_k],
          'necessidade_metros', round(v_necessidade, 3),
          'custo_unitario', v_custos_barra[v_k],
          'subtotal', round(v_contagem[v_k] * v_custos_barra[v_k], 4)
        );
      end if;
    end loop;
  end loop;

  -- Regras (peca_regras) — só afetam linhas do mapa genérico.
  for v_regra in
    select pr.*, pcar.tipo as caract_tipo
    from public.peca_regras pr
    join public.peca_caracteristicas pcar on pcar.id = pr.caracteristica_id
    where pr.peca_id = v_peca_id and pr.company_id = v_company_id and pr.ativo = true
    order by pr.created_at
  loop
    if not (p_valores ? v_regra.caracteristica_id::text) then
      continue;
    end if;
    v_valor_numero := (p_valores -> v_regra.caracteristica_id::text ->> 'n')::numeric;
    v_valor_texto := p_valores -> v_regra.caracteristica_id::text ->> 't';

    v_condicao_bate := case
      when v_regra.caract_tipo = 'numero' then
        case v_regra.operador
          when '>' then v_valor_numero > v_regra.valor_comparacao_numero
          when '>=' then v_valor_numero >= v_regra.valor_comparacao_numero
          when '<' then v_valor_numero < v_regra.valor_comparacao_numero
          when '<=' then v_valor_numero <= v_regra.valor_comparacao_numero
          when '=' then v_valor_numero = v_regra.valor_comparacao_numero
          else v_valor_numero <> v_regra.valor_comparacao_numero
        end
      else
        case v_regra.operador
          when '=' then v_valor_texto = v_regra.valor_comparacao_texto
          else v_valor_texto <> v_regra.valor_comparacao_texto
        end
    end;

    if v_condicao_bate then
      if v_regra.acao = 'remover_material' then
        v_quantidades := v_quantidades - v_regra.acao_material_item_id::text;
      else
        v_quantidades := v_quantidades || jsonb_build_object(v_regra.acao_material_item_id::text, v_regra.acao_quantidade);
      end if;
    end if;
  end loop;

  -- Custeia o mapa genérico (fixo + linear/área sem barra).
  for v_material in
    select (kv.key)::uuid as item_id, (kv.value)::numeric as quantidade
    from jsonb_each_text(v_quantidades) kv
  loop
    select pci.custo_unitario into v_custo_unit
    from public.pedido_compra_itens pci
    join public.pedidos_compra pc on pc.id = pci.pedido_compra_id and pc.company_id = v_company_id
    where pci.item_id = v_material.item_id and pci.company_id = v_company_id and pci.custo_unitario is not null
    order by pci.created_at desc
    limit 1;

    if v_custo_unit is null then
      v_sem_custo := v_sem_custo || jsonb_build_object(
        'item_id', v_material.item_id,
        'codigo', (select codigo from public.itens where id = v_material.item_id),
        'descricao', (select descricao from public.itens where id = v_material.item_id),
        'quantidade', v_material.quantidade
      );
    else
      v_custo_total := v_custo_total + (v_material.quantidade * v_custo_unit);
      v_componentes := v_componentes || jsonb_build_object(
        'item_id', v_material.item_id,
        'codigo', (select codigo from public.itens where id = v_material.item_id),
        'descricao', (select descricao from public.itens where id = v_material.item_id),
        'quantidade', v_material.quantidade,
        'custo_unitario', v_custo_unit,
        'subtotal', round(v_material.quantidade * v_custo_unit, 4)
      );
    end if;
  end loop;

  return jsonb_build_object(
    'aplica_configurador', true,
    'custo_total', round(v_custo_total, 2),
    'componentes', v_componentes,
    'materiais_sem_custo', v_sem_custo,
    'largura_capturada', v_largura,
    'altura_capturada', v_altura,
    'dimensoes_pendentes', v_dimensoes_pendentes,
    'unidade_dimensao_invalida', v_unidade_invalida
  );
end;
$$;

create or replace function public._calcular_preco_configurador(p_company_id uuid, p_item_id uuid, p_valores jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_peca_id uuid;
  v_custo jsonb;
  v_mo jsonb;
  v_margem numeric;
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
  select margem_percentual into v_margem from public.pricing_settings where company_id = p_company_id;

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
  p_preco_override numeric default null
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
  v_id uuid;
  v_entry record;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if p_preco_override is not null and p_preco_override < 0 then
    raise exception 'Preço unitário inválido.';
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

  v_calculo := public._calcular_preco_configurador(v_company_id, p_item_id, coalesce(p_valores, '{}'::jsonb));

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
      custo_unitario = v_custo_material, custo_mao_obra = v_custo_mao
    where id = p_id
    returning id into v_id;
  else
    insert into public.orcamento_itens (orcamento_id, item_id, quantidade, preco_unitario, custo_unitario, custo_mao_obra)
    values (p_orcamento_id, p_item_id, p_quantidade, v_preco, v_custo_material, v_custo_mao)
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
      'valores', coalesce(p_valores, '{}'::jsonb)
    )
  );

  return v_id;
end;
$$;
