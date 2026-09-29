-- TÓPICO 13, Fase 9 (§4 do Prompt TÓPICO 13 — Integrações Internas entre
-- Módulos). Nível Informativo apenas (§15: "detectar → registrar →
-- informar") — nenhuma automação nova de negócio, só rastreabilidade: os 9
-- pontos de transição citados no doc passam a chamar
-- registrar_evento_integracao_interno() no meio da própria função que já
-- fazia a transição, sem mudar nenhum comportamento existente.
--
-- registrar_evento_integracao() (Fase 1, 20261004000000) exige
-- has_permission('integracoes', 'manage') de quem chama — correto pra
-- chamada manual/direta (ex.: um sistema externo ou admin registrando um
-- evento), mas quebraria aqui: um usuário COMERCIAL convertendo orçamento
-- não tem (nem deveria precisar de) permissão de integrações só pra gerar
-- o log informativo dessa própria ação. registrar_evento_integracao_interno()
-- é a mesma gravação em activity_logs, sem o gate de permissão — e sem
-- `grant ... to authenticated`, então só é chamável de dentro de outra
-- função já dona do schema (toda SECURITY DEFINER aqui roda como o role
-- que também é dono desta função), nunca via Data API diretamente. A
-- autorização de quem disparou o evento já foi validada pela função de
-- negócio que o envolve (ex.: converter_orcamento_em_pedido já exigiu
-- pedidos.manage antes de chegar aqui).

create or replace function public.registrar_evento_integracao_interno(
  p_company_id uuid,
  p_modulo_origem text,
  p_modulo_destino text,
  p_tipo_evento text,
  p_entidade_tipo text default null,
  p_entidade_id uuid default null,
  p_descricao text default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    p_company_id, auth.uid(), 'integracoes.evento_modulo', coalesce(p_entidade_tipo, 'evento_integracao'), p_entidade_id,
    p_descricao,
    jsonb_build_object(
      'modulo_origem', p_modulo_origem,
      'modulo_destino', p_modulo_destino,
      'tipo_evento', p_tipo_evento,
      'nivel_automacao', 'informativo',
      'correlacao_id', gen_random_uuid()
    ) || coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Sem grant a authenticated de propósito (ver comentário acima) e sem
-- grant a PUBLIC/anon (CLAUDE.md regra 7) — chamada só internamente.

-- =========================================================================
-- 1. Comercial → Pedidos — converter_orcamento_em_pedido() (idêntica à
--    versão da ADR-012 Fase 4, só com o evento acrescentado antes do return)
-- =========================================================================

create or replace function public.converter_orcamento_em_pedido(p_orcamento_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_orcamento public.orcamentos;
  v_pedido_id uuid;
  v_numero text;
  v_oi public.orcamento_itens;
  v_pedido_item_id uuid;
  v_peca_id uuid;
begin
  select * into v_orcamento from public.orcamentos
  where id = p_orcamento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'aprovado' then
    raise exception 'Só é possível converter orçamento aprovado (status atual: %).', v_orcamento.status;
  end if;
  if exists (select 1 from public.pedidos where orcamento_id = p_orcamento_id) then
    raise exception 'Este orçamento já foi convertido em pedido.';
  end if;
  if exists (
    select 1 from public.orcamento_itens oi
    join public.itens i on i.id = oi.item_id
    where oi.orcamento_id = p_orcamento_id and i.situacao <> 'ativo'
  ) then
    raise exception 'Orçamento tem item(ns) inativo(s) desde a aprovação — reative o item ou cancele este orçamento e crie outro antes de converter.';
  end if;

  v_numero := public.next_document_number('pedido');

  insert into public.pedidos (
    company_id, numero, orcamento_id, pessoa_id, obra_id, responsavel_id, observacoes
  ) values (
    v_company_id, v_numero, p_orcamento_id, v_orcamento.pessoa_id, v_orcamento.obra_id, auth.uid(), v_orcamento.observacoes
  )
  returning id into v_pedido_id;

  for v_oi in select * from public.orcamento_itens where orcamento_id = p_orcamento_id
  loop
    insert into public.pedido_itens (company_id, pedido_id, item_id, quantidade, preco_unitario, custo_unitario, custo_mao_obra, orcamento_item_id)
    values (v_company_id, v_pedido_id, v_oi.item_id, v_oi.quantidade, v_oi.preco_unitario, v_oi.custo_unitario, v_oi.custo_mao_obra, v_oi.id)
    returning id into v_pedido_item_id;

    insert into public.pedido_item_caracteristicas (company_id, pedido_item_id, peca_caracteristica_id, valor_numero, valor_texto)
    select v_company_id, v_pedido_item_id, oic.peca_caracteristica_id, oic.valor_numero, oic.valor_texto
    from public.orcamento_item_caracteristicas oic
    where oic.orcamento_item_id = v_oi.id;

    select id into v_peca_id from public.pecas where item_id = v_oi.item_id and company_id = v_company_id;
    if found then
      perform public.gerar_bom_sugerida_a_partir_da_conversao(v_pedido_item_id, v_company_id, v_peca_id);
    end if;
    v_peca_id := null;
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pedido_convertido_de_orcamento', 'pedido', v_pedido_id, v_numero,
    jsonb_build_object('orcamento_id', p_orcamento_id, 'orcamento_numero', v_orcamento.numero)
  );

  perform public.registrar_evento_integracao_interno(
    v_company_id, 'comercial', 'pedidos', 'orcamento_convertido_em_pedido',
    'pedido', v_pedido_id, v_numero,
    jsonb_build_object('orcamento_id', p_orcamento_id, 'orcamento_numero', v_orcamento.numero)
  );

  return v_pedido_id;
end;
$$;

-- =========================================================================
-- 2. Pedidos → PCP/Produção — criar_ordem_producao()
-- =========================================================================

create or replace function public.criar_ordem_producao(p_pedido_item_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_pedido_item public.pedido_itens;
  v_pedido public.pedidos;
  v_numero text;
  v_id uuid;
begin
  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido_item.pedido_id;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível criar ordem de produção para item de pedido liberado (status atual: %).', v_pedido.status;
  end if;
  if public.pedido_bloqueado_por_medicao(v_pedido.id) then
    raise exception 'Pedido bloqueado para produção: há item com medida em obra não confirmada (TÓPICO 16 §7).';
  end if;
  if exists (select 1 from public.ordens_producao where pedido_item_id = p_pedido_item_id) then
    raise exception 'Este item de pedido já tem ordem de produção.';
  end if;

  v_numero := public.next_document_number('ordem_producao');

  insert into public.ordens_producao (company_id, pedido_id, pedido_item_id, numero, quantidade_planejada)
  values (v_company_id, v_pedido.id, p_pedido_item_id, v_numero, v_pedido_item.quantidade)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_criada', 'ordem_producao', v_id, v_numero,
    jsonb_build_object('pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id, 'quantidade_planejada', v_pedido_item.quantidade)
  );

  perform public.registrar_evento_integracao_interno(
    v_company_id, 'pedidos', 'producao', 'ordem_producao_criada',
    'ordem_producao', v_id, v_numero,
    jsonb_build_object('pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id, 'quantidade_planejada', v_pedido_item.quantidade)
  );

  return v_id;
end;
$$;

-- =========================================================================
-- 3. Engenharia → PCP/Produção — liberar_engenharia()
-- =========================================================================

create or replace function public.liberar_engenharia(p_pedido_item_id uuid, p_observacoes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_pedido_item public.pedido_itens;
  v_versao_anterior public.engenharia_versoes;
  v_nova_versao int;
  v_id uuid;
begin
  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_versao_anterior from public.engenharia_versoes
  where pedido_item_id = p_pedido_item_id and situacao = 'liberada'
  for update;

  if v_versao_anterior.id is not null then
    update public.engenharia_versoes set situacao = 'substituida' where id = v_versao_anterior.id;
  end if;

  select coalesce(max(versao), 0) + 1 into v_nova_versao
  from public.engenharia_versoes where pedido_item_id = p_pedido_item_id;

  insert into public.engenharia_versoes (
    company_id, pedido_item_id, versao, situacao, liberado_por, liberado_em, motivo_alteracao, observacoes
  ) values (
    v_company_id, p_pedido_item_id, v_nova_versao, 'liberada', auth.uid(), now(),
    case when v_versao_anterior.id is not null then 'Nova versão liberada substituindo a anterior.' else null end,
    p_observacoes
  )
  returning id into v_id;

  if v_versao_anterior.id is not null then
    update public.engenharia_versoes set superseded_by_id = v_id where id = v_versao_anterior.id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.versao_liberada', 'pedido_item', p_pedido_item_id, p_observacoes,
    jsonb_build_object('engenharia_versao_id', v_id, 'versao', v_nova_versao, 'versao_anterior_id', v_versao_anterior.id)
  );

  perform public.registrar_evento_integracao_interno(
    v_company_id, 'engenharia', 'producao', 'versao_engenharia_liberada',
    'pedido_item', p_pedido_item_id, p_observacoes,
    jsonb_build_object('engenharia_versao_id', v_id, 'versao', v_nova_versao)
  );

  return v_id;
end;
$$;

-- =========================================================================
-- 4. Compras → Estoque — finalizar_conferencia_recebimento()
-- =========================================================================

create or replace function public.finalizar_conferencia_recebimento(p_recebimento_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_recebimento public.recebimentos_pedido_compra;
  v_item record;
  v_qtd_recusada numeric;
  v_qtd_aceita numeric;
  v_necessidade_id uuid;
  v_mov_id uuid;
begin
  select * into v_recebimento from public.recebimentos_pedido_compra where id = p_recebimento_id and company_id = v_company_id;
  if not found then
    raise exception 'Recebimento não encontrado nesta empresa.';
  end if;
  if v_recebimento.status <> 'em_conferencia' then
    raise exception 'Só é possível finalizar conferência de um recebimento em_conferencia (status atual: %).', v_recebimento.status;
  end if;
  if exists (
    select 1 from public.divergencias_recebimento dr
    join public.recebimento_itens ri on ri.id = dr.recebimento_item_id
    where ri.recebimento_id = p_recebimento_id and dr.status = 'aberta'
  ) then
    raise exception 'Existem divergências abertas neste recebimento — trate todas antes de finalizar a conferência.';
  end if;

  for v_item in select * from public.recebimento_itens where recebimento_id = p_recebimento_id loop
    select coalesce(sum(dr.quantidade_divergente), 0) into v_qtd_recusada
    from public.divergencias_recebimento dr
    where dr.recebimento_item_id = v_item.id and dr.status = 'tratada' and dr.decisao = 'recusar';

    v_qtd_aceita := v_item.quantidade_recebida - v_qtd_recusada;
    if v_qtd_aceita < 0 then
      v_qtd_aceita := 0;
    end if;

    update public.recebimento_itens set quantidade_aceita = v_qtd_aceita, status = 'conferido' where id = v_item.id;

    if v_qtd_aceita > 0 then
      v_mov_id := public.ajustar_saldo(
        v_item.item_id, v_qtd_aceita,
        format('Recebimento %s do pedido de compra.', v_recebimento.numero),
        'compra'
      );
      update public.estoque_movimentacoes set recebimento_item_id = v_item.id where id = v_mov_id;
    end if;

    select nc.id into v_necessidade_id
    from public.pedido_compra_itens pci
    join public.cotacao_itens ci on ci.id = pci.cotacao_item_id
    join public.solicitacao_compra_itens sci on sci.id = ci.solicitacao_compra_item_id
    join public.necessidades_compra nc on nc.id = sci.necessidade_compra_id
    where pci.id = v_item.pedido_compra_item_id and nc.status = 'atendida';

    if v_necessidade_id is not null then
      update public.necessidades_compra set
        status = 'recebida', quantidade_recebida = v_qtd_aceita, data_recebimento = now(), recebido_por = auth.uid()
      where id = v_necessidade_id;
    end if;
  end loop;

  update public.recebimentos_pedido_compra set status = 'conferido' where id = p_recebimento_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.conferencia_finalizada', 'recebimento_pedido_compra', p_recebimento_id, v_recebimento.numero);

  perform public.registrar_evento_integracao_interno(
    v_company_id, 'compras', 'estoque', 'recebimento_conferido',
    'recebimento_pedido_compra', p_recebimento_id, v_recebimento.numero,
    null
  );

  return p_recebimento_id;
end;
$$;

-- =========================================================================
-- 5. Estoque → Produção — consumir_peca_dimensional()
-- =========================================================================

create or replace function public.consumir_peca_dimensional(
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

  perform public.registrar_evento_integracao_interno(
    v_company_id, 'estoque', 'producao', 'peca_dimensional_consumida',
    'itens_pecas_dimensionais', p_peca_id, p_observacao,
    jsonb_build_object('quantidade_consumida', p_quantidade, 'quantidade_restante', v_restante)
  );

  return p_peca_id;
end;
$$;

-- =========================================================================
-- 6. Produção → Estoque — registrar_entrada_sobra()
-- =========================================================================

create or replace function public.registrar_entrada_sobra(
  p_item_id uuid,
  p_quantidade numeric,
  p_pedido_item_id uuid,
  p_observacao text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('estoque', 'manage');
  v_pedido_id uuid;
  v_mov_id uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade da sobra deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  if p_pedido_item_id is not null then
    select pi.pedido_id into v_pedido_id from public.pedido_itens pi
    join public.pedidos p on p.id = pi.pedido_id
    where pi.id = p_pedido_item_id and p.company_id = v_company_id;
    if v_pedido_id is null then
      raise exception 'Item de pedido não encontrado nesta empresa.';
    end if;
  end if;

  insert into public.estoque_saldos (company_id, item_id)
  values (v_company_id, p_item_id)
  on conflict (company_id, item_id) do nothing;

  update public.estoque_saldos set quantidade_fisica = quantidade_fisica + p_quantidade
  where company_id = v_company_id and item_id = p_item_id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, pedido_id, pedido_item_id, motivo, created_by)
  values (v_company_id, p_item_id, 'entrada_sobra', p_quantidade, v_pedido_id, p_pedido_item_id, p_observacao, auth.uid())
  returning id into v_mov_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.sobra_registrada', 'estoque_movimentacao', v_mov_id, p_observacao,
    jsonb_build_object('item_id', p_item_id, 'quantidade', p_quantidade, 'pedido_item_id', p_pedido_item_id)
  );

  perform public.registrar_evento_integracao_interno(
    v_company_id, 'producao', 'estoque', 'sobra_registrada',
    'estoque_movimentacao', v_mov_id, p_observacao,
    jsonb_build_object('item_id', p_item_id, 'quantidade', p_quantidade, 'pedido_item_id', p_pedido_item_id)
  );

  return v_mov_id;
end;
$$;

-- =========================================================================
-- 7. Expedição → Financeiro — registrar_saida_expedicao()
-- =========================================================================

create or replace function public.registrar_saida_expedicao(p_expedicao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('expedicao', 'manage');
  v_expedicao public.expedicoes;
begin
  select * into v_expedicao from public.expedicoes
  where id = p_expedicao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Expedição não encontrada nesta empresa.';
  end if;
  if v_expedicao.status <> 'conferida' then
    raise exception 'Só é possível registrar saída de expedição conferida (status atual: %).', v_expedicao.status;
  end if;

  update public.expedicoes set status = 'expedida' where id = p_expedicao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'expedicao.saida_registrada', 'expedicao', p_expedicao_id, v_expedicao.numero, null);

  perform public.registrar_evento_integracao_interno(
    v_company_id, 'expedicao', 'financeiro', 'saida_expedicao_registrada',
    'expedicao', p_expedicao_id, v_expedicao.numero,
    null
  );

  return p_expedicao_id;
end;
$$;

-- =========================================================================
-- 8. Financeiro → Comercial/Pedidos — registrar_recebimento_titulo()
-- =========================================================================

create or replace function public.registrar_recebimento_titulo(
  p_titulo_id uuid,
  p_valor numeric,
  p_data_recebimento date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('financeiro', 'receber');
  v_titulo public.titulos_financeiros;
  v_id uuid;
  v_novo_recebido numeric;
  v_data_recebimento date := coalesce(p_data_recebimento, current_date);
  v_status_resultante text;
begin
  select * into v_titulo from public.titulos_financeiros
  where id = p_titulo_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Título financeiro não encontrado nesta empresa.';
  end if;
  if v_titulo.status not in ('aberto', 'parcial') then
    raise exception 'Só é possível registrar recebimento em título aberto ou parcial (status atual: %).', v_titulo.status;
  end if;
  if p_valor <= 0 then
    raise exception 'Valor recebido precisa ser maior que zero.';
  end if;

  v_novo_recebido := v_titulo.valor_recebido + p_valor;
  if v_novo_recebido > v_titulo.valor then
    raise exception 'Valor recebido (%) excederia o valor do título (%, saldo disponível %).',
      v_novo_recebido, v_titulo.valor, v_titulo.valor - v_titulo.valor_recebido;
  end if;

  insert into public.recebimentos_titulo (company_id, titulo_id, valor, data_recebimento, registrado_por)
  values (v_company_id, p_titulo_id, p_valor, v_data_recebimento, auth.uid())
  returning id into v_id;

  v_status_resultante := case when v_novo_recebido >= v_titulo.valor then 'pago' else 'parcial' end;

  update public.titulos_financeiros
  set valor_recebido = v_novo_recebido,
      status = v_status_resultante
  where id = p_titulo_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'financeiro.recebimento_registrado', 'titulo_financeiro', p_titulo_id, null,
    jsonb_build_object('recebimento_id', v_id, 'valor', p_valor, 'data_recebimento', v_data_recebimento)
  );

  perform public.registrar_evento_integracao_interno(
    v_company_id, 'financeiro', 'pedidos', 'recebimento_titulo_registrado',
    'titulo_financeiro', p_titulo_id, null,
    jsonb_build_object('pedido_id', v_titulo.pedido_id, 'valor', p_valor, 'status_resultante', v_status_resultante)
  );

  return v_id;
end;
$$;

-- =========================================================================
-- 9. Qualidade → Produção/Estoque — registrar_inspecao_qualidade() —
--    evento disparado só quando há reprovação (a transição real do §4;
--    aprovação sem ressalva não move nada entre módulos).
-- =========================================================================

create or replace function public.registrar_inspecao_qualidade(
  p_ordem_producao_id uuid, p_quantidade_aprovada numeric, p_quantidade_reprovada numeric, p_observacoes text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('qualidade', 'manage');
  v_op public.ordens_producao;
  v_inspecao_id uuid;
  v_nc_id uuid;
begin
  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status <> 'concluida' then
    raise exception 'Só é possível inspecionar ordem de produção concluída (status atual: %).', v_op.status;
  end if;
  if p_quantidade_aprovada < 0 or p_quantidade_reprovada < 0 then
    raise exception 'Quantidades não podem ser negativas.';
  end if;
  if p_quantidade_aprovada + p_quantidade_reprovada <> v_op.quantidade_produzida then
    raise exception 'A soma de aprovada e reprovada (%) precisa ser igual à quantidade produzida (%).',
      p_quantidade_aprovada + p_quantidade_reprovada, v_op.quantidade_produzida;
  end if;
  if exists (
    select 1 from public.inspecoes_qualidade
    where ordem_producao_id = p_ordem_producao_id and nao_conformidade_id is null
  ) then
    raise exception 'Já existe inspeção registrada para esta ordem de produção.';
  end if;

  insert into public.inspecoes_qualidade (
    company_id, ordem_producao_id, nao_conformidade_id, quantidade_aprovada,
    quantidade_reprovada, observacoes, inspecionado_por
  ) values (
    v_company_id, p_ordem_producao_id, null, p_quantidade_aprovada,
    p_quantidade_reprovada, p_observacoes, auth.uid()
  ) returning id into v_inspecao_id;

  if p_quantidade_reprovada > 0 then
    insert into public.nao_conformidades (
      company_id, ordem_producao_id, inspecao_origem_id, quantidade, descricao, aberta_por
    ) values (
      v_company_id, p_ordem_producao_id, v_inspecao_id, p_quantidade_reprovada, p_observacoes, auth.uid()
    ) returning id into v_nc_id;
    update public.ordens_producao set status_qualidade = 'bloqueado' where id = p_ordem_producao_id;
    perform public.notificar_usuarios_com_permissao(
      'qualidade', array['manage'], 'qualidade.nao_conformidade_aberta',
      'Não conformidade aberta — OP ' || v_op.numero,
      coalesce(p_observacoes, 'Quantidade reprovada: ' || p_quantidade_reprovada), 'importante',
      'nao_conformidade', v_nc_id, 'Executar retrabalho ou disposição da não conformidade.'
    );
    perform public.registrar_evento_integracao_interno(
      v_company_id, 'qualidade', 'producao', 'nao_conformidade_aberta',
      'ordem_producao', p_ordem_producao_id, p_observacoes,
      jsonb_build_object('nao_conformidade_id', v_nc_id, 'quantidade_reprovada', p_quantidade_reprovada)
    );
  else
    update public.ordens_producao set status_qualidade = 'aprovado' where id = p_ordem_producao_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'qualidade.inspecao_registrada', 'ordem_producao', p_ordem_producao_id, p_observacoes,
    jsonb_build_object(
      'inspecao_id', v_inspecao_id, 'quantidade_aprovada', p_quantidade_aprovada,
      'quantidade_reprovada', p_quantidade_reprovada, 'nao_conformidade_id', v_nc_id
    )
  );

  return v_inspecao_id;
end;
$$;
