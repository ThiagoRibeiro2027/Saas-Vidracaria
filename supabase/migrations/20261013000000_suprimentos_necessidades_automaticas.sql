-- Necessidades automáticas de Suprimentos — Fase C do plano aprovado em
-- 23/09/2026 (fila de produção, peças fabricadas e necessidades
-- automáticas de suprimentos). Depende da Fase A (pecas/peca_composicao,
-- migration 20261012000000) já commitada.
--
-- necessidades_compra continua exatamente como está (ADR-002 §4.18 —
-- só o registro/acompanhamento da necessidade, sem cotação/pedido de
-- compra/recebimento) — nenhuma tabela/coluna nova aqui, só duas funções
-- que expandem pedido_itens/ordens_producao através de peca_composicao e
-- chamam criar_necessidade_compra() já existente (não duplicam o insert).
--
-- Idempotência sem precisar de uma coluna nova ligando necessidade a
-- pedido/OP (a tabela não tem essa referência e o escopo desta fase não
-- adiciona uma): em vez de "já existe necessidade aberta para este item
-- deste pedido", o cálculo desconta da falta o que JÁ está sinalizado em
-- necessidades_compra abertas de origem pedido/producao para aquele item
-- — reexecutar pro mesmo pedido sem mudança de estoque gera falta líquida
-- zero (nada novo), e um segundo pedido que precise do mesmo material só
-- gera necessidade pela diferença ainda não coberta, sem duplicar nem
-- subestimar a demanda somada de dois pedidos diferentes pelo mesmo item.
--
-- Item de pedido/OP sem peça associada (produto ainda sem BOM cadastrada)
-- é ignorado silenciosamente — fica pra lançamento manual, como já é hoje
-- (comportamento documentado no retorno, não um erro).

create or replace function public.gerar_necessidades_de_pedido(p_pedido_id uuid)
returns table (item_id uuid, item_codigo text, item_descricao text, quantidade_gerada numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_pedido public.pedidos;
  v_linha record;
  v_disponivel numeric;
  v_ja_sinalizado numeric;
  v_falta numeric;
  v_gerados int := 0;
  v_itens_gerados jsonb := '[]'::jsonb;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id and company_id = v_company_id;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível gerar necessidades para pedido liberado (status atual: %).', v_pedido.status;
  end if;

  for v_linha in
    select pc.material_item_id as mat_id, i.codigo as mat_codigo, i.descricao as mat_descricao,
           sum(pc.quantidade_por_unidade * pi.quantidade) as necessario
    from public.pedido_itens pi
    join public.pecas p on p.item_id = pi.item_id and p.company_id = v_company_id
    join public.peca_composicao pc on pc.peca_id = p.id
    join public.itens i on i.id = pc.material_item_id
    where pi.pedido_id = p_pedido_id
    group by pc.material_item_id, i.codigo, i.descricao
  loop
    select coalesce(es.quantidade_fisica, 0) - coalesce(es.quantidade_reservada, 0)
      into v_disponivel
    from public.estoque_saldos es
    where es.company_id = v_company_id and es.item_id = v_linha.mat_id;
    v_disponivel := coalesce(v_disponivel, 0);

    select coalesce(sum(nc.quantidade), 0) into v_ja_sinalizado
    from public.necessidades_compra nc
    where nc.company_id = v_company_id and nc.item_id = v_linha.mat_id
      and nc.origem in ('pedido', 'producao') and nc.status = 'aberta';

    v_falta := v_linha.necessario - v_disponivel - v_ja_sinalizado;
    if v_falta > 0 then
      perform public.criar_necessidade_compra(
        v_linha.mat_id, v_falta, null, 'pedido',
        format('Gerado automaticamente a partir do pedido %s.', v_pedido.numero)
      );
      v_gerados := v_gerados + 1;
      v_itens_gerados := v_itens_gerados || jsonb_build_object('item_id', v_linha.mat_id, 'quantidade', v_falta);
      return query select v_linha.mat_id, v_linha.mat_codigo, v_linha.mat_descricao, v_falta;
    end if;
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'suprimentos.necessidades_geradas_de_pedido', 'pedido', p_pedido_id, v_pedido.numero,
    jsonb_build_object('count', v_gerados, 'items', v_itens_gerados)
  );
end;
$$;

grant execute on function public.gerar_necessidades_de_pedido(uuid) to authenticated;

create or replace function public.gerar_necessidades_de_ordem_producao(p_ordem_producao_id uuid)
returns table (item_id uuid, item_codigo text, item_descricao text, quantidade_gerada numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_op public.ordens_producao;
  v_linha record;
  v_disponivel numeric;
  v_ja_sinalizado numeric;
  v_falta numeric;
  v_gerados int := 0;
  v_itens_gerados jsonb := '[]'::jsonb;
begin
  select * into v_op from public.ordens_producao where id = p_ordem_producao_id and company_id = v_company_id;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;

  for v_linha in
    select pc.material_item_id as mat_id, i.codigo as mat_codigo, i.descricao as mat_descricao,
           pc.quantidade_por_unidade * v_op.quantidade_planejada as necessario
    from public.pedido_itens pi
    join public.pecas p on p.item_id = pi.item_id and p.company_id = v_company_id
    join public.peca_composicao pc on pc.peca_id = p.id
    join public.itens i on i.id = pc.material_item_id
    where pi.id = v_op.pedido_item_id
  loop
    select coalesce(es.quantidade_fisica, 0) - coalesce(es.quantidade_reservada, 0)
      into v_disponivel
    from public.estoque_saldos es
    where es.company_id = v_company_id and es.item_id = v_linha.mat_id;
    v_disponivel := coalesce(v_disponivel, 0);

    select coalesce(sum(nc.quantidade), 0) into v_ja_sinalizado
    from public.necessidades_compra nc
    where nc.company_id = v_company_id and nc.item_id = v_linha.mat_id
      and nc.origem in ('pedido', 'producao') and nc.status = 'aberta';

    v_falta := v_linha.necessario - v_disponivel - v_ja_sinalizado;
    if v_falta > 0 then
      perform public.criar_necessidade_compra(
        v_linha.mat_id, v_falta, null, 'producao',
        format('Gerado automaticamente a partir da ordem de produção %s.', v_op.numero)
      );
      v_gerados := v_gerados + 1;
      v_itens_gerados := v_itens_gerados || jsonb_build_object('item_id', v_linha.mat_id, 'quantidade', v_falta);
      return query select v_linha.mat_id, v_linha.mat_codigo, v_linha.mat_descricao, v_falta;
    end if;
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'suprimentos.necessidades_geradas_de_producao', 'ordem_producao', p_ordem_producao_id, v_op.numero,
    jsonb_build_object('count', v_gerados, 'items', v_itens_gerados)
  );
end;
$$;

grant execute on function public.gerar_necessidades_de_ordem_producao(uuid) to authenticated;
