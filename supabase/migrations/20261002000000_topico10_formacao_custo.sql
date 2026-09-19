-- TÓPICO 10 — Formação de custo simplificada, Fase 2 da ampliação de
-- escopo aprovada em ADR-002 v2.4 (§4.3, 19/09/2026). Metodologia única:
-- "custo informado" (§13) — as demais (último custo, custo médio, custo
-- de compra) dependem de histórico de compras/produção que o sistema
-- ainda não tem maduro, e ficam fora desta fase.
--
-- custo_unitario é opcional (nem todo item tem custo conhecido ainda) e
-- não tem coluna própria de "markup"/"margem": ambos são só
-- (preco_unitario - custo_unitario) / preco_unitario, calculados na hora
-- de exibir — guardar um valor derivado ao lado da fonte é abrir espaço
-- pra divergência (mesmo princípio de orcamento_valor_total()).
--
-- Visibilidade: orcamento_itens já é de leitura liberada a qualquer
-- autenticado da empresa (mesmo padrão de preco_unitario) — custo não
-- ganha uma restrição própria de RLS/permissão aqui. A regra do §22
-- ("custo/margem nunca aparecem pro cliente") é sobre o documento
-- externo (proposta comercial), que ainda não existe nesta migration.

alter table public.orcamento_itens
  add column custo_unitario numeric(14, 2) check (custo_unitario is null or custo_unitario >= 0);
comment on column public.orcamento_itens.custo_unitario is 'TÓPICO 10 §12-13, ADR-002 v2.4 — custo informado (metodologia única desta fase). NULL = custo não informado. Margem/markup são calculados a partir daqui, nunca persistidos.';

-- Assinatura muda (novo parâmetro no fim) — precisa DROP explícito, senão
-- create or replace cria uma segunda função sobrecarregada e uma chamada
-- nomeada com só os 5 parâmetros antigos fica ambígua entre as duas
-- (mesmo padrão já usado em várias migrations do TÓPICO 4/16).
drop function if exists public.upsert_orcamento_item(uuid, uuid, uuid, numeric, numeric);

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
  v_company_id uuid := public.current_company_id();
  v_orcamento public.orcamentos;
  v_before public.orcamento_itens;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para gerenciar orçamentos (orcamentos.manage).';
  end if;
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
