-- ADR-012 — cálculo automático de custo e preço no orçamento (emenda v1.1,
-- decisão do responsável do produto em 03/10/2026). Até aqui:
--   - calcular_custo_orcamento_item() só lia valores JÁ GRAVADOS em
--     orcamento_item_caracteristicas, então o vendedor precisava salvar o
--     item (com um preço digitado à mão) antes de poder calcular;
--   - o resultado era só custo de material — o preço de venda continuava
--     100% manual, porque a "formação de preço (markup)" citada no ADR-012
--     §2 nunca existiu como regra (a margem era só exibição na tela).
--
-- Esta migration:
--   1. extrai o núcleo do cálculo (custo de material e mão de obra) para
--      funções internas que recebem os valores das características como
--      parâmetro, sem exigir item gravado — as funções públicas antigas
--      passam a só ler os valores gravados e chamar o núcleo (resultado
--      idêntico, verificado por teste de regressão);
--   2. cria a margem de preço por empresa (pricing_settings);
--   3. cria o pré-cálculo (custo + mão de obra + preço sugerido) sem gravar
--      nada, e a gravação atômica do item configurado — o servidor SEMPRE
--      recalcula, nunca confia em custo/preço vindos do navegador;
--   4. cria a listagem de características para o vendedor (gate
--      orcamentos.view; listar_caracteristicas_peca exige pecas.view).
--
-- Regra de preço (ADR-012: nunca assumir zero em silêncio):
--   preço sugerido = (custo_material + custo_mao_obra) / (1 - margem/100)
-- e só é sugerido quando o custo está completo e a margem está configurada.
-- Custo incompleto nunca é gravado em orcamento_itens.custo_unitario /
-- custo_mao_obra (ficaria subestimado e distorceria a margem exibida).

-- =========================================================================
-- 1. Margem de preço por empresa
-- =========================================================================

create table public.pricing_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id),
  margem_percentual numeric(5, 2) not null check (margem_percentual >= 0 and margem_percentual < 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.pricing_settings is 'ADR-012 v1.1 — margem de preço única por empresa. preço = custo / (1 - margem/100). Sem linha = margem não configurada: o orçamento não sugere preço automático.';

create trigger set_updated_at before update on public.pricing_settings
  for each row execute function public.set_updated_at();

alter table public.pricing_settings enable row level security;
create policy pricing_settings_select on public.pricing_settings for select
  using (company_id = (select public.current_company_id()));
grant select on public.pricing_settings to authenticated;

create or replace function public.upsert_margem_preco(p_percentual numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before public.pricing_settings;
  v_id uuid;
begin
  if p_percentual is null or p_percentual < 0 or p_percentual >= 100 then
    raise exception 'Margem deve ser maior ou igual a 0 e menor que 100.';
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

revoke all on function public.upsert_margem_preco(numeric) from public, anon;
grant execute on function public.upsert_margem_preco(numeric) to authenticated;

-- =========================================================================
-- 2. Validação dos valores de característica (preview e gravação)
--    p_valores = { "<peca_caracteristica_id>": {"n": <número>} | {"t": "<texto>"} }
--    Cada chave precisa ser característica DESTA peça e DESTA empresa — sem
--    isso, um id de outra empresa/peça poderia ser injetado no cálculo.
-- =========================================================================

create or replace function public._validar_valores_configurador(p_company_id uuid, p_peca_id uuid, p_valores jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_entry record;
  v_cid uuid;
  v_caract public.peca_caracteristicas;
  v_n numeric;
  v_t text;
begin
  if p_valores is null or jsonb_typeof(p_valores) <> 'object' then
    raise exception 'Valores das características inválidos.';
  end if;

  for v_entry in select key, value from jsonb_each(p_valores) loop
    begin
      v_cid := v_entry.key::uuid;
    exception when invalid_text_representation then
      raise exception 'Identificador de característica inválido.';
    end;

    select * into v_caract from public.peca_caracteristicas
    where id = v_cid and peca_id = p_peca_id and company_id = p_company_id;
    if not found then
      raise exception 'Característica não pertence à peça deste item.';
    end if;

    if jsonb_typeof(v_entry.value) <> 'object' then
      raise exception 'Valor da característica "%" inválido.', v_caract.nome;
    end if;

    if v_caract.tipo = 'numero' then
      if coalesce(jsonb_typeof(v_entry.value -> 'n'), 'null') <> 'number'
         or coalesce(jsonb_typeof(v_entry.value -> 't'), 'null') <> 'null' then
        raise exception 'Característica "%" é numérica — informe só um número.', v_caract.nome;
      end if;
      v_n := (v_entry.value ->> 'n')::numeric;
      if abs(v_n) >= 10000000000 then
        raise exception 'Valor da característica "%" fora do limite permitido.', v_caract.nome;
      end if;
      if v_caract.papel_dimensional is not null and v_n <= 0 then
        raise exception 'Dimensão "%" deve ser maior que zero.', v_caract.nome;
      end if;
    else
      if coalesce(jsonb_typeof(v_entry.value -> 't'), 'null') <> 'string'
         or coalesce(jsonb_typeof(v_entry.value -> 'n'), 'null') <> 'null' then
        raise exception 'Característica "%" é de texto/opção — informe só texto.', v_caract.nome;
      end if;
      v_t := v_entry.value ->> 't';
      if btrim(v_t) = '' then
        raise exception 'Valor da característica "%" não pode ser vazio.', v_caract.nome;
      end if;
      if v_caract.tipo = 'opcao' and not (v_t = any(v_caract.opcoes)) then
        raise exception 'Valor "%" não é uma opção permitida para "%" (permitidas: %).', v_t, v_caract.nome, array_to_string(v_caract.opcoes, ', ');
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public._validar_valores_configurador(uuid, uuid, jsonb) from public, anon, authenticated;

-- =========================================================================
-- 3. Núcleo do cálculo de custo de material — corpo de
--    calcular_custo_orcamento_item() da Fase 2 (20261105000000), lendo os
--    valores de p_valores em vez de orcamento_item_caracteristicas. Única
--    adição ao retorno: dimensoes_pendentes (peça tem linha linear/área e
--    largura ou altura não foi informada) — sem isso a linha era pulada em
--    silêncio e o custo parecia completo.
-- =========================================================================

create or replace function public._calcular_custo_peca(p_company_id uuid, p_peca_id uuid, p_valores jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := p_company_id;
  v_peca_id uuid := p_peca_id;
  v_largura numeric;
  v_altura numeric;
  v_dimensoes_pendentes boolean;
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
    'dimensoes_pendentes', v_dimensoes_pendentes
  );
end;
$$;

revoke all on function public._calcular_custo_peca(uuid, uuid, jsonb) from public, anon, authenticated;

-- calcular_custo_orcamento_item() — mesma assinatura e mesmo resultado da
-- Fase 2; agora só lê os valores gravados e chama o núcleo.
create or replace function public.calcular_custo_orcamento_item(p_orcamento_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_item_id uuid;
  v_peca_id uuid;
  v_valores jsonb;
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

  select coalesce(jsonb_object_agg(
    oic.peca_caracteristica_id::text,
    jsonb_build_object('n', oic.valor_numero, 't', oic.valor_texto)
  ), '{}'::jsonb) into v_valores
  from public.orcamento_item_caracteristicas oic
  where oic.orcamento_item_id = p_orcamento_item_id;

  return public._calcular_custo_peca(v_company_id, v_peca_id, v_valores);
end;
$$;

grant execute on function public.calcular_custo_orcamento_item(uuid) to authenticated;

-- =========================================================================
-- 4. Núcleo do cálculo de mão de obra — corpo de
--    calcular_mao_obra_orcamento_item() da Fase 4 (20261105040000); depende
--    só do item (roteiro ativo), não dos valores das características.
-- =========================================================================

create or replace function public._calcular_mao_obra_item(p_company_id uuid, p_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_roteiro_id uuid;
  v_operacao record;
  v_custo_operacao numeric;
  v_custo_total numeric := 0;
  v_operacoes jsonb := '[]'::jsonb;
  v_operacoes_sem_custo jsonb := '[]'::jsonb;
begin
  select id into v_roteiro_id from public.roteiros_produtivos
  where item_id = p_item_id and company_id = p_company_id and ativo;
  if not found then
    return jsonb_build_object('tem_roteiro', false);
  end if;

  for v_operacao in
    select ro.id, ro.sequencia, ro.descricao, ro.tempo_previsto_minutos, ro.recurso_produtivo_id,
      rp.nome as recurso_nome, rp.custo_hora
    from public.roteiro_operacoes ro
    left join public.recursos_produtivos rp on rp.id = ro.recurso_produtivo_id and rp.company_id = p_company_id
    where ro.roteiro_id = v_roteiro_id
    order by ro.sequencia
  loop
    if v_operacao.tempo_previsto_minutos is null or v_operacao.recurso_produtivo_id is null or v_operacao.custo_hora is null then
      v_operacoes_sem_custo := v_operacoes_sem_custo || jsonb_build_object(
        'operacao_id', v_operacao.id, 'sequencia', v_operacao.sequencia, 'descricao', v_operacao.descricao,
        'motivo', case
          when v_operacao.tempo_previsto_minutos is null then 'sem_tempo_previsto'
          when v_operacao.recurso_produtivo_id is null then 'sem_recurso_definido'
          else 'recurso_sem_custo_hora'
        end
      );
    else
      v_custo_operacao := round((v_operacao.tempo_previsto_minutos / 60.0) * v_operacao.custo_hora, 2);
      v_custo_total := v_custo_total + v_custo_operacao;
      v_operacoes := v_operacoes || jsonb_build_object(
        'operacao_id', v_operacao.id, 'sequencia', v_operacao.sequencia, 'descricao', v_operacao.descricao,
        'recurso_nome', v_operacao.recurso_nome, 'tempo_previsto_minutos', v_operacao.tempo_previsto_minutos,
        'custo_hora', v_operacao.custo_hora, 'custo_operacao', v_custo_operacao
      );
    end if;
  end loop;

  return jsonb_build_object(
    'tem_roteiro', true, 'custo_total', round(v_custo_total, 2),
    'operacoes', v_operacoes, 'operacoes_sem_custo', v_operacoes_sem_custo
  );
end;
$$;

revoke all on function public._calcular_mao_obra_item(uuid, uuid) from public, anon, authenticated;

create or replace function public.calcular_mao_obra_orcamento_item(p_orcamento_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_item_id uuid;
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

  return public._calcular_mao_obra_item(v_company_id, v_item_id);
end;
$$;

grant execute on function public.calcular_mao_obra_orcamento_item(uuid) to authenticated;

-- =========================================================================
-- 5. Cálculo completo (material + mão de obra + preço sugerido) — interno
--    (usado também pela gravação, que recalcula sempre) e público (pré-
--    cálculo da tela, leitura pura).
-- =========================================================================

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

revoke all on function public._calcular_preco_configurador(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.calcular_preco_configurador(p_item_id uuid, p_valores jsonb default '{}'::jsonb)
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
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  select id into v_peca_id from public.pecas where item_id = p_item_id and company_id = v_company_id;
  if not found then
    return jsonb_build_object('aplica_configurador', false);
  end if;

  perform public._validar_valores_configurador(v_company_id, v_peca_id, coalesce(p_valores, '{}'::jsonb));

  return public._calcular_preco_configurador(v_company_id, p_item_id, coalesce(p_valores, '{}'::jsonb));
end;
$$;

revoke all on function public.calcular_preco_configurador(uuid, jsonb) from public, anon;
grant execute on function public.calcular_preco_configurador(uuid, jsonb) to authenticated;

-- =========================================================================
-- 6. Características da peça de um item, para o vendedor (orcamentos.view,
--    não pecas.view) — inclui opções e papel dimensional.
-- =========================================================================

create or replace function public.listar_caracteristicas_configurador(p_item_id uuid)
returns table (id uuid, nome text, tipo text, unidade text, opcoes text[], obrigatoria boolean, papel_dimensional text)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'view') then
    raise exception 'Sem permissão para consultar orçamentos (orcamentos.view).';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  return query
  select pc.id, pc.nome, pc.tipo, pc.unidade, pc.opcoes, pc.obrigatoria, pc.papel_dimensional
  from public.pecas p
  join public.peca_caracteristicas pc on pc.peca_id = p.id and pc.company_id = v_company_id
  where p.item_id = p_item_id and p.company_id = v_company_id
  order by (pc.papel_dimensional is null), pc.papel_dimensional, pc.nome;
end;
$$;

revoke all on function public.listar_caracteristicas_configurador(uuid) from public, anon;
grant execute on function public.listar_caracteristicas_configurador(uuid) to authenticated;

-- =========================================================================
-- 7. Gravação atômica do item configurado: item + valores das
--    características + custos + preço, numa transação só. O servidor
--    recalcula tudo; do navegador só aceita quantidade, valores das
--    características e, opcionalmente, um preço ajustado pelo vendedor.
-- =========================================================================

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

revoke all on function public.upsert_orcamento_item_configurado(uuid, uuid, uuid, numeric, jsonb, numeric) from public, anon;
grant execute on function public.upsert_orcamento_item_configurado(uuid, uuid, uuid, numeric, jsonb, numeric) to authenticated;
