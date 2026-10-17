-- Trava de negócio aprovada em conversa com o usuário (17/10/2026): achado do
-- teste de ponta a ponta em homologação — criar_ordem_producao() deixava criar
-- (e produzir/concluir integralmente) uma OP sem NUNCA ter existido uma versão
-- de engenharia liberada pro item do pedido, mesmo quando o item é uma peça
-- fabricada (com composição/configurador). Numa vidraçaria isso é risco real
-- (corte de vidro com medida não revisada).
--
-- Trava só vale pra item que É peça (existe em public.pecas) — item simples
-- (matéria-prima, insumo, componente sem configurador) nunca passa por
-- engenharia e continua liberado pra OP exatamente como antes, sem mudança de
-- comportamento alguma pra esse caso (decisão do usuário: travar isso pra todo
-- item "engessaria" sem necessidade).
--
-- Mesma assinatura, mesmo corpo da versão vigente
-- (20261016001507_fila_producao_kanban.sql) — só acrescenta a checagem nova
-- entre resolver v_engenharia_versao_id e gerar o número do documento.

create or replace function public.criar_ordem_producao(p_pedido_item_id uuid, p_quantidade numeric default null, p_liberar_integralmente boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
  v_pedido_item public.pedido_itens;
  v_pedido public.pedidos;
  v_ja_planejado numeric;
  v_quantidade numeric;
  v_engenharia_versao_id uuid;
  v_op_lote_id uuid;
  v_numero text;
  v_id uuid;
begin
  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido_item.pedido_id;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível criar ordem de produção para item de pedido liberado (status atual: %).', v_pedido.status;
  end if;

  perform 1 from public.ordens_producao
  where pedido_item_id = p_pedido_item_id and company_id = v_company_id and status <> 'cancelada'
  for update;

  select coalesce(sum(quantidade_planejada), 0) into v_ja_planejado
  from public.ordens_producao
  where pedido_item_id = p_pedido_item_id and company_id = v_company_id and status <> 'cancelada';

  v_quantidade := coalesce(p_quantidade, v_pedido_item.quantidade - v_ja_planejado);
  if v_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero (saldo ainda não planejado do item: %).', v_pedido_item.quantidade - v_ja_planejado;
  end if;
  if v_ja_planejado + v_quantidade > v_pedido_item.quantidade then
    raise exception 'Quantidade solicitada (%) somada ao já planejado (%) excede a quantidade do item (%).',
      v_quantidade, v_ja_planejado, v_pedido_item.quantidade;
  end if;

  select id into v_engenharia_versao_id from public.engenharia_versoes
  where pedido_item_id = p_pedido_item_id and situacao = 'liberada';

  -- Trava nova (17/10/2026): item-peça exige engenharia liberada antes de OP.
  if v_engenharia_versao_id is null
     and exists (
       select 1 from public.pecas
       where item_id = v_pedido_item.item_id and company_id = v_company_id
     )
  then
    raise exception 'Este item é uma peça fabricada e exige engenharia liberada antes de criar ordem de produção.';
  end if;

  v_numero := public.next_document_number('ordem_producao');

  insert into public.ordens_producao (
    company_id, pedido_id, pedido_item_id, numero, quantidade_planejada, engenharia_versao_id
  ) values (
    v_company_id, v_pedido.id, p_pedido_item_id, v_numero, v_quantidade, v_engenharia_versao_id
  )
  returning id into v_id;

  if v_pedido.producao_iniciada_em is null then
    update public.pedidos set producao_iniciada_em = now() where id = v_pedido.id;
  end if;

  if p_liberar_integralmente then
    insert into public.op_lotes (company_id, ordem_producao_id, numero, quantidade_planejada, liberado_por)
    values (v_company_id, v_id, 1, v_quantidade, auth.uid())
    returning id into v_op_lote_id;

    perform public.criar_op_lote_operacoes(v_company_id, v_id, v_pedido_item.item_id, v_op_lote_id, v_quantidade);
  end if;

  perform public.recalcular_situacao_ordem_producao(v_id);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_criada', 'ordem_producao', v_id, v_numero,
    jsonb_build_object(
      'pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id,
      'quantidade_planejada', v_quantidade, 'engenharia_versao_id', v_engenharia_versao_id,
      'liberado_integralmente', p_liberar_integralmente, 'op_lote_id', v_op_lote_id
    )
  );

  perform public.registrar_evento_integracao_interno(
    v_company_id, 'pedidos', 'producao', 'ordem_producao_criada',
    'ordem_producao', v_id, v_numero,
    jsonb_build_object('pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id, 'quantidade_planejada', v_quantidade)
  );

  return v_id;
end;
$$;

grant execute on function public.criar_ordem_producao(uuid, numeric, boolean) to authenticated;
