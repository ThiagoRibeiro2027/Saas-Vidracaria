-- Fix: OP ficava com "Bloqueada" (motivo: medição não confirmada) congelado
-- mesmo depois da medição ser confirmada. Achado pelo usuário (17/10/2026)
-- ao comparar a tela de Produção (OP 10041, pedido 000060) com a tela de
-- Engenharia, que já mostrava os 3 itens como "Confirmada".
--
-- Causa raiz: ordens_producao.situacao é um retrato GRAVADO, recalculado só
-- por recalcular_situacao_ordem_producao() — chamada hoje só a partir de
-- ações do lado Produção (criar_ordem_producao, apontar_producao,
-- concluir_ordem_producao, etc.). confirmar_medicao() (Engenharia) atualiza
-- itens_producao.medida_confirmada corretamente, mas nunca aciona esse
-- recálculo — a OP nunca "fica sabendo" que foi desbloqueada.
--
-- pedido_bloqueado_por_medicao(p_pedido_id) avalia o bloqueio pro PEDIDO
-- INTEIRO (todos os itens, não só o item medido) — por isso o recálculo
-- aqui percorre TODAS as OPs do mesmo pedido_id, não só a(s) ligada(s) ao
-- pedido_item_id do item medido.
--
-- Mesma correção nos dois sentidos: confirmar_medicao() pode desbloquear
-- (medida passou a estar confirmada); registrar_medicao() pode re-bloquear
-- (ela zera medida_confirmada ao registrar uma nova medida sobre um item
-- que já estava confirmado) — sem o recálculo aí também, uma OP poderia
-- ficar mostrando "Liberada" mesmo depois de uma remedição invalidar a
-- medida anterior.

create or replace function public.confirmar_medicao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_before public.itens_producao;
  v_op_id uuid;
begin
  select * into v_before from public.itens_producao
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de produção não encontrado nesta empresa.';
  end if;
  if v_before.largura_mm is null or v_before.altura_mm is null then
    raise exception 'Registre a medida antes de confirmar.';
  end if;
  if v_before.medida_confirmada then
    raise exception 'Medida já confirmada.';
  end if;

  update public.itens_producao set
    medida_confirmada = true, medida_confirmada_por = auth.uid(), medida_confirmada_em = now()
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.medicao_confirmada', 'item_producao', p_id, v_before.ambiente,
    jsonb_build_object('largura_mm', v_before.largura_mm, 'altura_mm', v_before.altura_mm)
  );

  -- Reavalia o bloqueio por medição de toda OP do pedido (não só do item
  -- medido — pedido_bloqueado_por_medicao() olha o pedido inteiro).
  for v_op_id in
    select id from public.ordens_producao where pedido_id = v_before.pedido_id and company_id = v_company_id
  loop
    perform public.recalcular_situacao_ordem_producao(v_op_id);
  end loop;

  return p_id;
end;
$$;

create or replace function public.registrar_medicao(
  p_id uuid,
  p_ambiente text,
  p_largura_mm numeric,
  p_altura_mm numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_before public.itens_producao;
  v_op_id uuid;
begin
  if p_largura_mm is null or p_largura_mm <= 0 or p_altura_mm is null or p_altura_mm <= 0 then
    raise exception 'Largura e altura devem ser maiores que zero.';
  end if;

  select * into v_before from public.itens_producao
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de produção não encontrado nesta empresa.';
  end if;

  update public.itens_producao set
    ambiente = p_ambiente,
    largura_mm = p_largura_mm,
    altura_mm = p_altura_mm,
    medida_registrada_por = auth.uid(),
    medida_registrada_em = now(),
    medida_confirmada = false,
    medida_confirmada_por = null,
    medida_confirmada_em = null
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.medicao_registrada', 'item_producao', p_id, p_ambiente,
    jsonb_build_object(
      'before', jsonb_build_object(
        'ambiente', v_before.ambiente, 'largura_mm', v_before.largura_mm, 'altura_mm', v_before.altura_mm,
        'medida_confirmada', v_before.medida_confirmada
      ),
      'after', jsonb_build_object('ambiente', p_ambiente, 'largura_mm', p_largura_mm, 'altura_mm', p_altura_mm)
    )
  );

  -- Se este item estava confirmado e acabou de virar não-confirmado (nova
  -- medida), uma OP que estava liberada pode precisar voltar a 'bloqueada'.
  for v_op_id in
    select id from public.ordens_producao where pedido_id = v_before.pedido_id and company_id = v_company_id
  loop
    perform public.recalcular_situacao_ordem_producao(v_op_id);
  end loop;

  return p_id;
end;
$$;
