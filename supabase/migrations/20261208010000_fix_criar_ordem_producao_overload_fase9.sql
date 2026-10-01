-- Corrige achado da própria migration anterior (20261208000000): mesmo
-- padrão do incidente já registrado no BACKLOG (criar_recurso_produtivo/
-- editar_recurso_produtivo, 27/09/2026) — criar_ordem_producao() teve a
-- assinatura trocada 3 vezes por "drop function" + "create function" desde
-- 16/09 (hoje é (p_pedido_item_id uuid, p_quantidade numeric default null,
-- p_liberar_integralmente boolean default true), fixada em
-- 20260925000000_topico4_permissoes_granulares.sql). A migration anterior
-- usou a assinatura de 1 parâmetro (morta desde 16/09, base de
-- 20260915010000) num "create or replace function" — isso não substituiu a
-- função real: criou uma segunda sobrecarga inofensiva mas morta, e o
-- evento de integração nunca foi acrescentado na função que a aplicação de
-- fato chama. Corrigido aqui: remove a sobrecarga morta e reaplica a
-- assinatura real, com o evento acrescentado no lugar certo.

drop function if exists public.criar_ordem_producao(uuid);

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

  v_numero := public.next_document_number('ordem_producao');

  insert into public.ordens_producao (
    company_id, pedido_id, pedido_item_id, numero, quantidade_planejada, engenharia_versao_id
  ) values (
    v_company_id, v_pedido.id, p_pedido_item_id, v_numero, v_quantidade, v_engenharia_versao_id
  )
  returning id into v_id;

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
