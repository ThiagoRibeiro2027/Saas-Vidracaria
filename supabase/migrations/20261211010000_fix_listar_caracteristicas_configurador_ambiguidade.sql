-- FIX (achado pelo teste automatizado da própria 20261211000000): em
-- listar_caracteristicas_configurador(), `RETURNS TABLE (id, ...)` cria
-- uma variável de saída chamada `id`, e a checagem
-- `select 1 from public.itens where id = p_item_id` ficava ambígua entre
-- essa variável e a coluna (erro 42702, "column reference id is
-- ambiguous"). Qualificar a coluna resolve. Mesmo problema já visto e
-- corrigido em 20261202010000_fix_importar_obras_ambiguidade.sql.
-- Mesma assinatura e mesmo retorno; só muda a qualificação.

create or replace function public.listar_caracteristicas_configurador(p_item_id uuid)
returns table (id uuid, nome text, tipo text, unidade text, opcoes text[], obrigatoria boolean, papel_dimensional text)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'view') then
    raise exception 'Sem permissão para consultar orçamentos (orcamentos.view).';
  end if;
  if not exists (select 1 from public.itens i where i.id = p_item_id and i.company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  return query
  select pc.id, pc.nome, pc.tipo, pc.unidade, pc.opcoes, pc.obrigatoria, pc.papel_dimensional
  from public.pecas p
  join public.peca_caracteristicas pc on pc.peca_id = p.id and pc.company_id = v_company_id
  where p.item_id = p_item_id and p.company_id = v_company_id
  order by (pc.papel_dimensional is null), pc.papel_dimensional, pc.nome;
end;
$$;

revoke all on function public.listar_caracteristicas_configurador(uuid) from public, anon;
grant execute on function public.listar_caracteristicas_configurador(uuid) to authenticated;
