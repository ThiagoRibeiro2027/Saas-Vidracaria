-- ADR-012, Fase 1 — Fundação do cálculo de precificação dimensional
-- (aprovada em 27/09/2026). Liga o configurador de peça (já existente,
-- Fases F-H) a um cálculo de custo automático no Orçamento: perfil por
-- metro linear, vidro por metro quadrado, acessórios com quantidade
-- condicional por faixa de tamanho (reaproveitando o motor de regras já
-- existente, peca_regras — nenhuma tabela nova pra isso). Mão de obra
-- continua manual nesta fase (§2.5 da ADR).
--
-- Decisão operacional confirmada pelo responsável do produto: se algum
-- material da composição não tiver histórico de preço, o cálculo soma o
-- que consegue e avisa explicitamente quais componentes ficaram sem
-- custo (nunca assume zero silenciosamente, nunca bloqueia o item
-- inteiro).
--
-- Fonte de custo: pedido_compra_itens.custo_unitario mais recente (não
-- historico_precos_item_fornecedor, que registra toda PROPOSTA de
-- cotação, selecionada ou não — custo real de compra é o que de fato
-- foi pago num Pedido de Compra, ADR-011).
--
-- Unidade das características dimensionais: milímetros, por convenção
-- (mesmo padrão já usado no exemplo "largura=1800" desde a Fase F) —
-- perímetro/área são calculados em mm e convertidos pra metro/m² aqui
-- dentro, nunca expostos em mm pro cálculo de custo.

-- 1. Papel dimensional da característica (§2.1) — no máximo uma
-- característica "largura" e uma "altura" por peça.
alter table public.peca_caracteristicas
  add column papel_dimensional text check (papel_dimensional is null or papel_dimensional in ('largura', 'altura'));
comment on column public.peca_caracteristicas.papel_dimensional is 'ADR-012 §2.1 — marca esta característica como a largura/altura da peça, pra alimentar fórmula de perímetro/área. Null = característica comum, sem papel na fórmula (comportamento anterior, inalterado).';
create unique index peca_caracteristicas_papel_dimensional_unique
  on public.peca_caracteristicas (peca_id, papel_dimensional) where papel_dimensional is not null;

create or replace function public.definir_papel_dimensional_caracteristica(p_caracteristica_id uuid, p_papel text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_caract public.peca_caracteristicas;
begin
  if p_papel is not null and p_papel not in ('largura', 'altura') then
    raise exception 'Papel dimensional inválido: % (aceito: largura, altura, ou null pra remover).', p_papel;
  end if;

  select * into v_caract from public.peca_caracteristicas where id = p_caracteristica_id and company_id = v_company_id;
  if not found then
    raise exception 'Característica não encontrada nesta empresa.';
  end if;
  if v_caract.tipo <> 'numero' then
    raise exception 'Só característica numérica pode ter papel dimensional (característica "%" é do tipo "%").', v_caract.nome, v_caract.tipo;
  end if;

  update public.peca_caracteristicas set papel_dimensional = p_papel, updated_at = now() where id = p_caracteristica_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pecas.papel_dimensional_definido', 'peca_caracteristica', p_caracteristica_id, v_caract.nome,
    jsonb_build_object('papel_dimensional', p_papel)
  );
end;
$$;

grant execute on function public.definir_papel_dimensional_caracteristica(uuid, text) to authenticated;

-- 2. Tipo de cálculo por linha de composição (§2.2). Default 'fixo'
-- preserva 100% o comportamento atual pra toda composição já cadastrada
-- — nenhuma peça existente muda de comportamento sem alguém
-- explicitamente marcar uma linha como linear/área.
alter table public.peca_composicao
  add column tipo_calculo text not null default 'fixo' check (tipo_calculo in ('fixo', 'linear', 'area')),
  add column percentual_perda numeric(5, 2) not null default 0 check (percentual_perda >= 0);
alter table public.peca_composicao
  add constraint peca_composicao_perda_so_dimensional check (tipo_calculo = 'fixo' or percentual_perda is not null),
  add constraint peca_composicao_fixo_sem_perda check (tipo_calculo <> 'fixo' or percentual_perda = 0);
comment on column public.peca_composicao.tipo_calculo is 'ADR-012 §2.2 — "fixo" (padrão, inalterado): quantidade_por_unidade é a quantidade real. "linear": quantidade real = perímetro da peça (mm→m) × quantidade_por_unidade × (1+perda%). "area": idem, com área (mm²→m²). Perímetro/área exigem peca_caracteristicas.papel_dimensional (largura/altura) definidos e capturados no item de orçamento.';
comment on column public.peca_composicao.percentual_perda is 'ADR-012 §2.2 — só aplicável a tipo_calculo linear/area (perda de corte). Sempre 0 para fixo.';

create or replace function public.definir_tipo_calculo_composicao(p_composicao_id uuid, p_tipo_calculo text, p_percentual_perda numeric default 0)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_comp public.peca_composicao;
begin
  if p_tipo_calculo not in ('fixo', 'linear', 'area') then
    raise exception 'Tipo de cálculo inválido: % (aceito: fixo, linear, area).', p_tipo_calculo;
  end if;
  if p_tipo_calculo = 'fixo' and coalesce(p_percentual_perda, 0) <> 0 then
    raise exception 'Percentual de perda só se aplica a tipo_calculo linear/area.';
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

grant execute on function public.definir_tipo_calculo_composicao(uuid, text, numeric) to authenticated;

-- 3. calcular_custo_orcamento_item() — leitura pura, não grava nada.
-- O vendedor decide se aplica o resultado a orcamento_itens.custo_
-- unitario (via upsert_orcamento_item(), já existente) — nunca
-- automático/silencioso (ADR-012 §3: "nunca autoridade cega").
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
  v_qtd numeric;
  v_material record;
  v_custo_unit numeric;
  v_custo_total numeric := 0;
  v_componentes jsonb := '[]'::jsonb;
  v_sem_custo jsonb := '[]'::jsonb;
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
    -- Não é peça configurável — sem erro, só sinaliza que este motor
    -- não se aplica; a tela cai pro custo manual já existente.
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

  -- Linear/área — precisa de largura E altura capturadas no item de
  -- orçamento; sem isso, a linha fica de fora (marcada em sem_custo
  -- mais abaixo, motivo "sem dimensão capturada").
  for v_comp in
    select material_item_id, quantidade_por_unidade, tipo_calculo, percentual_perda
    from public.peca_composicao
    where peca_id = v_peca_id and tipo_calculo in ('linear', 'area')
  loop
    if v_largura is null or v_altura is null then
      continue;
    end if;
    if v_comp.tipo_calculo = 'linear' then
      v_base := 2 * (v_largura + v_altura) / 1000.0; -- perímetro, mm -> m
    else
      v_base := (v_largura * v_altura) / 1000000.0; -- área, mm² -> m²
    end if;
    v_qtd := v_base * v_comp.quantidade_por_unidade * (1 + v_comp.percentual_perda / 100.0);
    v_quantidades := v_quantidades || jsonb_build_object(v_comp.material_item_id::text, v_qtd);
  end loop;

  -- Regras (peca_regras, já existente) — mesma lógica de
  -- simular_bom_sugerida(), lendo orcamento_item_caracteristicas em vez
  -- de pedido_item_caracteristicas. Regra sempre pode sobrepor o valor
  -- computado acima, fixo ou dimensional.
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

  -- Custeia cada material: pedido_compra_itens.custo_unitario mais
  -- recente. Sem histórico -> vai pra sem_custo, nunca conta como 0.
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
