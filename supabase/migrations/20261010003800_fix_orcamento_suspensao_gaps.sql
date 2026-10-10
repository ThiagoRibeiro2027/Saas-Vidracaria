-- FIX (27/09/2026, levantamento pedido após o audit que reabriu a Fase 8):
-- a migration 20261010003300 corrigiu definir_valor_caracteristica_
-- orcamento_item() e registrou que o resto do módulo de Orçamentos
-- precisava de um levantamento função a função antes de generalizar a
-- correção. Feito o levantamento nas 9 funções de mutação do módulo:
-- upsert_orcamento, remove_orcamento_item, decidir_orcamento,
-- cancelar_orcamento e converter_orcamento_em_pedido já usam
-- assert_tenant_write() desde 15/09 — não são o gap. Duas ainda são:
--
--   1. upsert_orcamento_item() — tinha assert_tenant_write() em 15/09,
--      mas regrediu em 02/10 (20261002000000_topico10_formacao_custo)
--      quando ganhou o parâmetro p_custo_unitario: a reescrita voltou
--      ao padrão manual antigo (current_company_id() + has_permission())
--      e perdeu a checagem de suspensão.
--   2. vincular_oportunidade_orcamento() — criada em 01/10
--      (20261001000000_topico10_oportunidades) já no padrão manual,
--      nunca teve a checagem.
--
-- Resultado: hoje uma empresa suspensa por pendência comercial ainda
-- conseguia editar preço/custo de item de orçamento e vincular
-- oportunidade a orçamento. Assinaturas não mudam — só troca o guard
-- manual por assert_tenant_write(), mesmo padrão das demais.

create or replace function public.upsert_orcamento_item(
  p_id uuid,
  p_orcamento_id uuid,
  p_item_id uuid,
  p_quantidade numeric,
  p_preco_unitario numeric,
  p_custo_unitario numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('orcamentos', 'manage');
  v_orcamento public.orcamentos;
  v_before public.orcamento_itens;
  v_id uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if p_preco_unitario is null or p_preco_unitario < 0 then
    raise exception 'Preço unitário inválido.';
  end if;
  if p_custo_unitario is not null and p_custo_unitario < 0 then
    raise exception 'Custo unitário inválido.';
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

  if p_id is not null then
    select * into v_before from public.orcamento_itens
    where id = p_id and orcamento_id = p_orcamento_id
    for update;
    if not found then
      raise exception 'Item do orçamento não encontrado.';
    end if;

    update public.orcamento_itens set
      item_id = p_item_id, quantidade = p_quantidade, preco_unitario = p_preco_unitario,
      custo_unitario = p_custo_unitario
    where id = p_id
    returning id into v_id;
  else
    insert into public.orcamento_itens (orcamento_id, item_id, quantidade, preco_unitario, custo_unitario)
    values (p_orcamento_id, p_item_id, p_quantidade, p_preco_unitario, p_custo_unitario)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_item_upserted', 'orcamento_item', v_id, v_orcamento.numero,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'orcamento_id', p_orcamento_id, 'item_id', p_item_id, 'quantidade', p_quantidade,
      'preco_unitario', p_preco_unitario, 'custo_unitario', p_custo_unitario
    ))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_orcamento_item(uuid, uuid, uuid, numeric, numeric, numeric) to authenticated;

create or replace function public.vincular_oportunidade_orcamento(
  p_orcamento_id uuid,
  p_oportunidade_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('orcamentos', 'manage');
  v_orcamento public.orcamentos;
begin
  if not exists (
    select 1 from public.oportunidades where id = p_oportunidade_id and company_id = v_company_id
  ) then
    raise exception 'Oportunidade não encontrada nesta empresa.';
  end if;

  select * into v_orcamento from public.orcamentos
  where id = p_orcamento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'rascunho' then
    raise exception 'Só é possível vincular oportunidade a orçamento em rascunho (status atual: %).', v_orcamento.status;
  end if;

  update public.orcamentos set oportunidade_id = p_oportunidade_id where id = p_orcamento_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_vinculado_oportunidade', 'orcamento', p_orcamento_id, v_orcamento.numero,
    jsonb_build_object('oportunidade_id', p_oportunidade_id)
  );

  return p_orcamento_id;
end;
$$;

grant execute on function public.vincular_oportunidade_orcamento(uuid, uuid) to authenticated;
