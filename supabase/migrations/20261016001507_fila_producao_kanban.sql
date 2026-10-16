-- Fila de Produção — quadro Kanban (desenho aprovado em conversa com o
-- usuário, 16/10/2026): card por pedido, coluna calculada automaticamente
-- (nunca gravada) a partir do estado real de produção/expedição/instalação,
-- e reordenar prioridade dentro da coluna aplicada a todas as OPs do
-- pedido como bloco. Tudo aditivo — nenhuma tabela/função existente perde
-- comportamento, a tela de tabela (listar_fila_producao, inalterada) continua
-- funcionando exatamente como antes.
--
-- 1) pedidos.producao_iniciada_em — vínculo "pedido liberado → produção"
--    pedido pelo usuário: grava quando a 1a OP do pedido é criada (dentro de
--    criar_ordem_producao). Não reaproveita nem redefine pedidos.status
--    (que continua só com os 5 valores do fluxo comercial/conferência) —
--    é um registro novo e separado, seguro de adicionar.
-- 2) listar_fila_producao_kanban() — leitura nova, um registro por pedido,
--    com o "estágio" calculado na hora (aguardando_liberacao / planejada /
--    em_producao / expedicao / instalacao / concluida), nunca armazenado.
-- 3) definir_prioridade_pedido() — aplica prioridade a todas as OPs não
--    canceladas do pedido de uma vez (drag dentro da coluna do Kanban).
--    Se alguma OP do pedido já tem material separado (estoque_reservas em
--    'reservado'/'consumido' para o item), exige especificamente
--    producao.manage (gerente) em vez de producao.configurar — checagem no
--    banco, não só na tela.

alter table public.pedidos add column producao_iniciada_em timestamptz;
comment on column public.pedidos.producao_iniciada_em is
  'Preenchido automaticamente na criação da 1a ordem de produção do pedido (criar_ordem_producao) — marca o momento real em que um pedido liberado entrou em produção. Nunca editado manualmente.';

-- =========================================================================
-- criar_ordem_producao — mesma assinatura/corpo de
-- 20261010005200_fix_criar_ordem_producao_overload_fase9.sql, só acrescenta
-- o registro de producao_iniciada_em na 1a OP do pedido.
-- =========================================================================

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

  -- Vínculo liberado→produção (desenho de 16/10/2026): só na 1a OP do pedido.
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

-- =========================================================================
-- listar_fila_producao_kanban — um registro por pedido (não por OP), com
-- estágio calculado na hora. Não substitui listar_fila_producao (tabela
-- continua OP a OP, inalterada).
-- =========================================================================

create or replace function public.listar_fila_producao_kanban(
  p_pessoa_id uuid default null,
  p_obra_id uuid default null,
  p_estagio text default null
) returns table (
  pedido_id uuid,
  pedido_numero text,
  pessoa_id uuid,
  pessoa_nome text,
  obra_id uuid,
  obra_nome text,
  previsao_entrega date,
  estagio text,
  prioridade smallint,
  total_ops bigint,
  ops_concluidas bigint,
  tem_op_bloqueada boolean,
  tem_pendencia boolean,
  material_separado boolean,
  producao_iniciada_em timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
  end if;

  return query
  with op_agg as (
    select
      op.pedido_id,
      count(*) as total_ops,
      count(*) filter (where op.status = 'concluida') as ops_concluidas,
      bool_or(op.status = 'em_producao') as tem_em_producao,
      bool_or(op.situacao = 'bloqueada') as tem_bloqueada,
      min(op.prioridade) as prioridade,
      bool_and(op.status = 'concluida') as producao_completa
    from public.ordens_producao op
    where op.company_id = v_company_id and op.status <> 'cancelada'
    group by op.pedido_id
  ),
  item_pend as (
    select
      pi.pedido_id,
      bool_and(pi.quantidade <= coalesce(exp_sum.entregue, 0)) as expedicao_completa,
      bool_and(pi.quantidade <= coalesce(inst_sum.instalada, 0)) as instalacao_completa
    from public.pedido_itens pi
    left join lateral (
      select sum(ei.quantidade_entregue) as entregue
      from public.expedicao_itens ei
      join public.expedicoes e on e.id = ei.expedicao_id
      where ei.pedido_item_id = pi.id and e.status <> 'cancelada' and e.company_id = v_company_id
    ) exp_sum on true
    left join lateral (
      select sum(ii.quantidade_instalada) as instalada
      from public.instalacao_itens ii
      join public.instalacoes i on i.id = ii.instalacao_id
      where ii.pedido_item_id = pi.id and i.status <> 'cancelada' and i.company_id = v_company_id
    ) inst_sum on true
    group by pi.pedido_id
  ),
  material as (
    select distinct op.pedido_id
    from public.ordens_producao op
    join public.estoque_reservas er on er.pedido_item_id = op.pedido_item_id and er.company_id = v_company_id
    where op.company_id = v_company_id and op.status <> 'cancelada'
      and er.status in ('reservado', 'consumido')
  ),
  base as (
    select
      p.id as pedido_id, p.numero as pedido_numero, pe.id as pessoa_id, pe.nome as pessoa_nome,
      o.id as obra_id, o.nome as obra_nome, p.previsao_entrega,
      case
        when p.status <> 'liberado' then 'aguardando_liberacao'
        when coalesce(oa.producao_completa, false) and coalesce(ip.expedicao_completa, false) and coalesce(ip.instalacao_completa, false) then 'concluida'
        when coalesce(oa.producao_completa, false) and coalesce(ip.expedicao_completa, false) then 'instalacao'
        when coalesce(oa.producao_completa, false) then 'expedicao'
        when coalesce(oa.tem_em_producao, false) then 'em_producao'
        else 'planejada'
      end as estagio,
      oa.prioridade,
      coalesce(oa.total_ops, 0) as total_ops,
      coalesce(oa.ops_concluidas, 0) as ops_concluidas,
      coalesce(oa.tem_bloqueada, false) as tem_op_bloqueada,
      (p.status = 'pendente') as tem_pendencia,
      exists (select 1 from material m where m.pedido_id = p.id) as material_separado,
      p.producao_iniciada_em
    from public.pedidos p
    join public.pessoas pe on pe.id = p.pessoa_id
    left join public.obras o on o.id = p.obra_id
    left join op_agg oa on oa.pedido_id = p.id
    left join item_pend ip on ip.pedido_id = p.id
    where p.company_id = v_company_id
      and p.status <> 'cancelado'
      and (p_pessoa_id is null or p.pessoa_id = p_pessoa_id)
      and (p_obra_id is null or p.obra_id = p_obra_id)
  )
  select * from base
  where p_estagio is null or base.estagio = p_estagio
  order by coalesce(base.prioridade, 3), base.previsao_entrega nulls last, base.pedido_numero;
end;
$$;

grant execute on function public.listar_fila_producao_kanban(uuid, uuid, text) to authenticated;

-- =========================================================================
-- definir_prioridade_pedido — arrastar card dentro da coluna no Kanban.
-- Aplica a mesma prioridade a todas as OPs (não canceladas) do pedido.
-- =========================================================================

create or replace function public.definir_prioridade_pedido(p_pedido_id uuid, p_prioridade smallint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
  v_tem_material_separado boolean;
  v_afetadas int;
begin
  if p_prioridade is null or p_prioridade not between 1 and 5 then
    raise exception 'Prioridade deve estar entre 1 (mais urgente) e 5 (menos urgente).';
  end if;
  if not exists (select 1 from public.pedidos where id = p_pedido_id and company_id = v_company_id) then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;

  select exists (
    select 1
    from public.ordens_producao op
    join public.estoque_reservas er on er.pedido_item_id = op.pedido_item_id and er.company_id = v_company_id
    where op.pedido_id = p_pedido_id and op.company_id = v_company_id
      and op.status <> 'cancelada'
      and er.status in ('reservado', 'consumido')
  ) into v_tem_material_separado;

  if v_tem_material_separado and not public.has_permission('producao', 'manage') then
    raise exception 'Este pedido já tem material separado para produção — só um gerente (produção.manage) pode reordenar a prioridade.';
  end if;

  update public.ordens_producao set prioridade = p_prioridade
  where pedido_id = p_pedido_id and company_id = v_company_id and status <> 'cancelada';
  get diagnostics v_afetadas = row_count;

  if v_afetadas = 0 then
    raise exception 'Este pedido ainda não tem ordem de produção criada.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.prioridade_pedido_definida', 'pedido', p_pedido_id, null,
    jsonb_build_object('prioridade', p_prioridade, 'ordens_afetadas', v_afetadas, 'material_separado', v_tem_material_separado)
  );
end;
$$;

grant execute on function public.definir_prioridade_pedido(uuid, smallint) to authenticated;
