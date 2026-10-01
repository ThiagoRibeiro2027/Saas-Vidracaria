-- FIX (26/09/2026, achado pelo /code-review): definir_valor_
-- caracteristica_orcamento_item() (20261103040000) nunca chama
-- assert_company_not_suspended() — uma empresa suspensa por pendência
-- comercial ainda conseguia gravar característica de peça no orçamento,
-- violando a regra 2 da auditoria de segurança do CLAUDE.md ("toda
-- mutação de tenant rejeita empresa suspensa").
--
-- Achado mais amplo, NÃO corrigido nesta migration por estar fora do
-- escopo do que foi construído agora: TODO o módulo de Orçamentos
-- (upsert_orcamento, upsert_orcamento_item, decidir_orcamento,
-- cancelar_orcamento, vincular_oportunidade_orcamento) foi escrito em
-- 13/09-19/09, antes de assert_tenant_write()/assert_company_not_
-- suspended() existirem (introduzidas em 15/09 pro restante do sistema,
-- nunca retroaplicadas em Orçamentos) — o mesmo padrão de "convenção
-- nova não retroaplicada" já visto no achado de permissões ausentes
-- (20261103030000). Corrigir o módulo inteiro é uma auditoria maior,
-- decisão separada pro responsável do produto.
create or replace function public.definir_valor_caracteristica_orcamento_item(
  p_orcamento_item_id uuid, p_peca_caracteristica_id uuid,
  p_valor_numero numeric default null, p_valor_texto text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_orcamento_item public.orcamento_itens;
  v_orcamento public.orcamentos;
  v_caract public.peca_caracteristicas;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'manage') then
    raise exception 'Sem permissão para gerenciar orçamentos (orcamentos.manage).';
  end if;
  perform public.assert_company_not_suspended();

  select oi.* into v_orcamento_item from public.orcamento_itens oi
  join public.orcamentos o on o.id = oi.orcamento_id
  where oi.id = p_orcamento_item_id and o.company_id = v_company_id;
  if not found then
    raise exception 'Item de orçamento não encontrado nesta empresa.';
  end if;

  select * into v_orcamento from public.orcamentos where id = v_orcamento_item.orcamento_id;
  if v_orcamento.status <> 'rascunho' then
    raise exception 'Só é possível alterar características de orçamento em rascunho (status atual: %).', v_orcamento.status;
  end if;

  select * into v_caract from public.peca_caracteristicas where id = p_peca_caracteristica_id and company_id = v_company_id;
  if not found then
    raise exception 'Característica não encontrada nesta empresa.';
  end if;
  if not exists (select 1 from public.pecas where id = v_caract.peca_id and item_id = v_orcamento_item.item_id) then
    raise exception 'Esta característica não pertence à peça deste item de orçamento.';
  end if;

  if v_caract.tipo = 'numero' then
    if p_valor_numero is null or p_valor_texto is not null then
      raise exception 'Característica "%" é numérica — informe só valor_numero.', v_caract.nome;
    end if;
  else
    if p_valor_texto is null or p_valor_numero is not null then
      raise exception 'Característica "%" é de texto/opção — informe só valor_texto.', v_caract.nome;
    end if;
    if v_caract.tipo = 'opcao' and not (p_valor_texto = any(v_caract.opcoes)) then
      raise exception 'Valor "%" não é uma opção permitida para "%" (permitidas: %).', p_valor_texto, v_caract.nome, array_to_string(v_caract.opcoes, ', ');
    end if;
  end if;

  insert into public.orcamento_item_caracteristicas (company_id, orcamento_item_id, peca_caracteristica_id, valor_numero, valor_texto)
  values (v_company_id, p_orcamento_item_id, p_peca_caracteristica_id, p_valor_numero, p_valor_texto)
  on conflict (orcamento_item_id, peca_caracteristica_id)
  do update set valor_numero = excluded.valor_numero, valor_texto = excluded.valor_texto, updated_at = now()
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'orcamentos.caracteristica_valor_definido', 'orcamento_item_caracteristica', v_id, v_caract.nome,
    jsonb_build_object('orcamento_item_id', p_orcamento_item_id, 'valor_numero', p_valor_numero, 'valor_texto', p_valor_texto)
  );

  return v_id;
end;
$$;

grant execute on function public.definir_valor_caracteristica_orcamento_item(uuid, uuid, numeric, text) to authenticated;
