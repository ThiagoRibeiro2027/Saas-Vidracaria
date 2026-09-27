-- ADR-012, Fase 2 — combinação de barras de menor custo total (emenda
-- aprovada em 27/09/2026: o escopo original previa um único
-- comprimento por perfil; o responsável do produto pediu o caso mais
-- amplo, com múltiplos comprimentos candidatos e escolha automática da
-- combinação mais barata).
--
-- Cada comprimento candidato é um ITEM comprável distinto (ex.: "PERFIL
-- BRANCO 3M" e "PERFIL BRANCO 6M" são duas linhas de cadastro
-- diferentes, cada uma com seu próprio histórico de custo em
-- pedido_compra_itens, §2.3) — não um campo novo em `itens`. Uma linha
-- de composição `linear` sem nenhum comprimento cadastrado continua se
-- comportando exatamente como a Fase 1 (custo por metro corrido, sem
-- arredondamento de barra) — nada muda pra peça que não configurar
-- isso.
--
-- Algoritmo: "menor custo pra cobrir pelo menos N metros usando barras
-- de comprimentos fixos" (unbounded knapsack, minimizar custo, permite
-- ultrapassar no último corte) — programação dinâmica em granularidade
-- de 1cm, limite superior de 100m (10.000 células) por chamada, mais
-- que suficiente pra qualquer peça real e sem risco de loop
-- descontrolado com dado incoerente.

create table public.peca_composicao_comprimentos_barra (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  peca_composicao_id uuid not null references public.peca_composicao(id) on delete cascade,
  item_id uuid not null references public.itens(id),
  comprimento_metros numeric(10, 4) not null check (comprimento_metros > 0),
  created_at timestamptz not null default now(),
  constraint peca_composicao_comprimentos_barra_item_unique unique (peca_composicao_id, item_id),
  constraint peca_composicao_comprimentos_barra_valor_unique unique (peca_composicao_id, comprimento_metros)
);
comment on table public.peca_composicao_comprimentos_barra is 'ADR-012 Fase 2 — comprimentos de barra candidatos pra uma linha de composição linear (perfil). Cada linha aqui referencia um item comprável distinto (ex.: "perfil 3m", "perfil 6m"), nunca um campo numérico solto — o custo de cada comprimento vem do histórico de compras daquele item específico.';
create index peca_composicao_comprimentos_barra_company_id_idx on public.peca_composicao_comprimentos_barra (company_id);
create index peca_composicao_comprimentos_barra_composicao_id_idx on public.peca_composicao_comprimentos_barra (peca_composicao_id);

alter table public.peca_composicao_comprimentos_barra enable row level security;
create policy peca_composicao_comprimentos_barra_select on public.peca_composicao_comprimentos_barra for select
  using (company_id = (select public.current_company_id()));
grant select on public.peca_composicao_comprimentos_barra to authenticated;

create or replace function public.definir_comprimento_barra_composicao(p_peca_composicao_id uuid, p_item_id uuid, p_comprimento_metros numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_comp public.peca_composicao;
  v_id uuid;
begin
  if p_comprimento_metros is null or p_comprimento_metros <= 0 then
    raise exception 'Comprimento de barra deve ser maior que zero.';
  end if;

  select * into v_comp from public.peca_composicao where id = p_peca_composicao_id and company_id = v_company_id;
  if not found then
    raise exception 'Linha de composição não encontrada nesta empresa.';
  end if;
  if v_comp.tipo_calculo <> 'linear' then
    raise exception 'Comprimento de barra só se aplica a linha de composição do tipo "linear" (esta é "%").', v_comp.tipo_calculo;
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id and situacao = 'ativo') then
    raise exception 'Item não encontrado ou inativo nesta empresa.';
  end if;

  insert into public.peca_composicao_comprimentos_barra (company_id, peca_composicao_id, item_id, comprimento_metros)
  values (v_company_id, p_peca_composicao_id, p_item_id, p_comprimento_metros)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pecas.comprimento_barra_definido', 'peca_composicao_comprimento_barra', v_id, null,
    jsonb_build_object('peca_composicao_id', p_peca_composicao_id, 'item_id', p_item_id, 'comprimento_metros', p_comprimento_metros)
  );

  return v_id;
end;
$$;

grant execute on function public.definir_comprimento_barra_composicao(uuid, uuid, numeric) to authenticated;

create or replace function public.remover_comprimento_barra_composicao(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
begin
  if not exists (select 1 from public.peca_composicao_comprimentos_barra where id = p_id and company_id = v_company_id) then
    raise exception 'Comprimento de barra não encontrado nesta empresa.';
  end if;

  delete from public.peca_composicao_comprimentos_barra where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'pecas.comprimento_barra_removido', 'peca_composicao_comprimento_barra', p_id, null, '{}'::jsonb);
end;
$$;

grant execute on function public.remover_comprimento_barra_composicao(uuid) to authenticated;

-- calcular_custo_orcamento_item() — mesma assinatura da Fase 1, corpo
-- estendido: linha 'linear' com comprimentos cadastrados passa a
-- resolver a combinação de barras de menor custo (DP), em vez do custo
-- por metro corrido direto. Linha 'linear' sem nenhum comprimento
-- cadastrado, e toda linha 'area'/'fixo', continuam exatamente como a
-- Fase 1.
create or replace function public.calcular_custo_orcamento_item(p_orcamento_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_item_id uuid;
  v_peca_id uuid;
  v_largura numeric;
  v_altura numeric;
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
  -- Fase 2 — combinação de barras.
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
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'view') then
    raise exception 'Sem permissão para consultar orçamentos (orcamentos.view).';
  end if;

  select oi.item_id into v_item_id from public.orcamento_itens oi
  join public.orcamentos o on o.id = oi.orcamento_id
  where oi.id = p_orcamento_item_id and o.company_id = v_company_id;
  if not found then
    raise exception 'Item de orçamento não encontrado nesta empresa.';
  end if;

  select id into v_peca_id from public.pecas where item_id = v_item_id and company_id = v_company_id;
  if not found then
    return jsonb_build_object('aplica_configurador', false);
  end if;

  select oic.valor_numero into v_largura
  from public.peca_caracteristicas pcar
  join public.orcamento_item_caracteristicas oic on oic.peca_caracteristica_id = pcar.id and oic.orcamento_item_id = p_orcamento_item_id
  where pcar.peca_id = v_peca_id and pcar.papel_dimensional = 'largura';

  select oic.valor_numero into v_altura
  from public.peca_caracteristicas pcar
  join public.orcamento_item_caracteristicas oic on oic.peca_caracteristica_id = pcar.id and oic.orcamento_item_id = p_orcamento_item_id
  where pcar.peca_id = v_peca_id and pcar.papel_dimensional = 'altura';

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
    if v_largura is null or v_altura is null then
      continue;
    end if;
    if v_comp.tipo_calculo = 'linear' then
      v_base := 2 * (v_largura + v_altura) / 1000.0;
    else
      v_base := (v_largura * v_altura) / 1000000.0;
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
      -- Fase 1: sem comprimento cadastrado, custo por metro corrido.
      v_quantidades := v_quantidades || jsonb_build_object(v_comp.material_item_id::text, v_necessidade);
      continue;
    end if;

    -- Fase 2: monta as opções com custo conhecido (histórico de compra
    -- daquele item de barra específico).
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
      -- Nenhum comprimento com custo conhecido — já registrado acima.
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
    v_dp[1] := 0; -- índice 1 = 0cm

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

  -- Regras (peca_regras) — só afetam linhas do mapa genérico
  -- (fixo, ou linear/área sem comprimento de barra cadastrado).
  for v_regra in
    select pr.*, pcar.tipo as caract_tipo
    from public.peca_regras pr
    join public.peca_caracteristicas pcar on pcar.id = pr.caracteristica_id
    where pr.peca_id = v_peca_id and pr.company_id = v_company_id and pr.ativo = true
    order by pr.created_at
  loop
    select oic.valor_numero, oic.valor_texto
      into v_valor_numero, v_valor_texto
    from public.orcamento_item_caracteristicas oic
    where oic.orcamento_item_id = p_orcamento_item_id and oic.peca_caracteristica_id = v_regra.caracteristica_id;

    if not found then
      continue;
    end if;

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
    'altura_capturada', v_altura
  );
end;
$$;

grant execute on function public.calcular_custo_orcamento_item(uuid) to authenticated;
