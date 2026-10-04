-- ADR-012 v1.2 — tipo_calculo "largura" e "altura" na composição da peça
-- (pedido do usuário, 2026-10-04, ao configurar o perfil de alumínio do
-- BOX-COR-VID). Até aqui, "Linear" só sabia calcular o PERÍMETRO inteiro
-- (2 x (largura + altura)) — um material que consome só a largura (ex.:
-- trilho superior de um box, que corre só na parte de cima) não tinha
-- como ser representado corretamente: cadastrar como "Linear" superestima
-- o consumo (usa o perímetro todo em vez de só a largura).
--
-- Agora tipo_calculo aceita também 'largura' e 'altura': consome
-- exatamente a dimensão capturada daquele papel (x quantidade_por_unidade
-- x (1 + perda)), na mesma unidade convertida pra metros já usada pelo
-- perímetro/área. Passam a valer comprimento de barra (combinação de
-- barras inteiras) e % de perda, igual já valia para 'linear' — a lógica
-- de barra já era genérica por necessidade em metros, só precisava entrar
-- no mesmo grupo de tipos.
--
-- Migration aditiva: nenhuma linha existente muda de tipo_calculo sozinha
-- (continuam 'fixo'/'linear'/'area' como estavam). Só amplia o que o
-- cadastro aceita a partir de agora.

-- 1. Constraint de tipo_calculo (nome auto-gerado pelo Postgres, conferido
--    na base real antes de escrever esta migration — não é um palpite).
alter table public.peca_composicao
  drop constraint peca_composicao_tipo_calculo_check,
  add constraint peca_composicao_tipo_calculo_check
    check (tipo_calculo in ('fixo', 'linear', 'area', 'largura', 'altura'));

-- 2. Validação de entrada da ação de definir o tipo de cálculo.
create or replace function public.definir_tipo_calculo_composicao(p_composicao_id uuid, p_tipo_calculo text, p_percentual_perda numeric default 0)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_comp public.peca_composicao;
begin
  if p_tipo_calculo not in ('fixo', 'linear', 'area', 'largura', 'altura') then
    raise exception 'Tipo de cálculo inválido: % (aceito: fixo, linear, area, largura, altura).', p_tipo_calculo;
  end if;
  if p_tipo_calculo = 'fixo' and coalesce(p_percentual_perda, 0) <> 0 then
    raise exception 'Percentual de perda só se aplica a tipo_calculo linear/área/largura/altura.';
  end if;
  if p_tipo_calculo <> 'fixo' and (p_percentual_perda is null or p_percentual_perda < 0) then
    raise exception 'Percentual de perda inválido para tipo_calculo %.', p_tipo_calculo;
  end if;

  select * into v_comp from public.peca_composicao where id = p_composicao_id and company_id = v_company_id;
  if not found then
    raise exception 'Linha de composição não encontrada nesta empresa.';
  end if;

  update public.peca_composicao
  set tipo_calculo = p_tipo_calculo, percentual_perda = p_percentual_perda
  where id = p_composicao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pecas.tipo_calculo_composicao_definido', 'peca_composicao', p_composicao_id, null,
    jsonb_build_object('tipo_calculo', p_tipo_calculo, 'percentual_perda', p_percentual_perda)
  );
end;
$$;

-- 3. _calcular_custo_peca — mesma função da 20261212000000, só com
--    'largura' e 'altura' entrando no mesmo grupo de 'linear' (dimensão
--    única em vez de perímetro) e saindo do grupo de 'area' (que
--    continua sem combinação de barra, por não fazer sentido pra m²).
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
    where peca_id = v_peca_id and tipo_calculo in ('linear', 'area', 'largura', 'altura')
  ) and (v_largura is null or v_altura is null);

  -- Unidade das dimensões lida do cadastro da característica (mm, cm ou m)
  -- e convertida para metros. Unidade vazia ou desconhecida não é
  -- adivinhada: sinaliza e a linha dimensional fica de fora (nunca um
  -- custo com a escala errada).
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
    where peca_id = v_peca_id and tipo_calculo in ('linear', 'area', 'largura', 'altura')
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

  -- Linear (perímetro) / largura / altura / área — todas precisam de
  -- largura E altura capturadas (mesmo quando só uma delas entra na
  -- conta, porque a peça já exige as duas como característica obrigatória
  -- nesse cenário).
  for v_comp in
    select id, material_item_id, quantidade_por_unidade, tipo_calculo, percentual_perda
    from public.peca_composicao
    where peca_id = v_peca_id and tipo_calculo in ('linear', 'area', 'largura', 'altura')
  loop
    if v_largura is null or v_altura is null or v_unidade_invalida then
      continue;
    end if;
    if v_comp.tipo_calculo = 'linear' then
      v_base := 2 * (v_largura_m + v_altura_m);
    elsif v_comp.tipo_calculo = 'largura' then
      v_base := v_largura_m;
    elsif v_comp.tipo_calculo = 'altura' then
      v_base := v_altura_m;
    else
      v_base := v_largura_m * v_altura_m;
    end if;
    v_necessidade := v_base * v_comp.quantidade_por_unidade * (1 + v_comp.percentual_perda / 100.0);

    -- Área não tem como combinar em "barras" (é m², não metro corrido) —
    -- vai direto pro mapa genérico, igual sempre foi. Linear/largura/altura
    -- passam pela combinação de comprimentos de barra, se houver.
    if v_comp.tipo_calculo = 'area' then
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

  -- Custeia o mapa genérico (fixo + linear/largura/altura/área sem barra).
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
