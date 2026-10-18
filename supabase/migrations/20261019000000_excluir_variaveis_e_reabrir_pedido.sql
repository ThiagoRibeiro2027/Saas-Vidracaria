-- Melhorias do responsável do produto (18/10/2026), itens 4 e 1 da nova rodada.
--
-- (4) Variáveis do configurador: ganham EXCLUSÃO (categoria e variável). Decisão
--     do responsável: excluir variável EM USO em peças é permitido — as peças
--     mantêm a característica como campo avulso (template_id vira NULL, o resto
--     da linha em peca_caracteristicas fica igual). peca_caracteristicas.template_id
--     não tem ON DELETE (NO ACTION), então o vínculo é desfeito ANTES do delete;
--     e apagar uma categoria faz cascade nos templates dela, por isso os
--     vínculos dos templates da categoria também são desfeitos antes.
--
-- (1) Pedidos: reabrir_pedido() devolve um pedido CANCELADO ao status 'recebido'
--     (mesmo número, mesmos itens). Seguro porque cancelar_pedido() só aceita
--     recebido/em_conferencia/pendente: um pedido cancelado nunca teve OP,
--     reserva de estoque nem item de produção. As pendências encerradas
--     automaticamente no cancelamento continuam encerradas (a resolução já diz
--     o motivo); o histórico fica no activity_logs.

create or replace function public.excluir_variavel_template(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_template public.variavel_templates;
  v_categoria text;
  v_pecas int;
begin
  select * into v_template from public.variavel_templates where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Variável do catálogo não encontrada nesta empresa.';
  end if;
  select nome into v_categoria from public.variavel_categorias where id = v_template.categoria_id;

  update public.peca_caracteristicas set template_id = null
  where template_id = p_id and company_id = v_company_id;
  get diagnostics v_pecas = row_count;

  delete from public.variavel_templates where id = p_id and company_id = v_company_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.variavel_template_excluida', 'variavel_template', p_id, v_template.nome,
    jsonb_build_object('categoria', v_categoria, 'caracteristicas_desvinculadas', v_pecas)
  );
end;
$$;

grant execute on function public.excluir_variavel_template(uuid) to authenticated;

create or replace function public.excluir_variavel_categoria(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_categoria public.variavel_categorias;
  v_templates int;
  v_pecas int;
begin
  select * into v_categoria from public.variavel_categorias where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Categoria não encontrada nesta empresa.';
  end if;

  update public.peca_caracteristicas set template_id = null
  where company_id = v_company_id
    and template_id in (select id from public.variavel_templates where categoria_id = p_id and company_id = v_company_id);
  get diagnostics v_pecas = row_count;

  delete from public.peca_categorias where categoria_id = p_id;
  delete from public.variavel_templates where categoria_id = p_id and company_id = v_company_id;
  get diagnostics v_templates = row_count;
  delete from public.variavel_categorias where id = p_id and company_id = v_company_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.variavel_categoria_excluida', 'variavel_categoria', p_id, v_categoria.nome,
    jsonb_build_object('variaveis_excluidas', v_templates, 'caracteristicas_desvinculadas', v_pecas)
  );
end;
$$;

grant execute on function public.excluir_variavel_categoria(uuid) to authenticated;

create or replace function public.reabrir_pedido(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_before public.pedidos;
begin
  select * into v_before from public.pedidos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_before.status <> 'cancelado' then
    raise exception 'Só é possível reabrir pedido cancelado (status atual: %).', v_before.status;
  end if;

  update public.pedidos set status = 'recebido' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pedido_reaberto', 'pedido', p_id, v_before.numero,
    jsonb_build_object('status_anterior', v_before.status, 'status_novo', 'recebido')
  );

  return p_id;
end;
$$;

grant execute on function public.reabrir_pedido(uuid) to authenticated;
