-- ADR-012, Fase 1 — complemento: listar_caracteristicas_peca() é usada
-- pela tela de Peças (src/app/pecas/page.tsx) e tem RETURNS TABLE com
-- colunas explícitas — precisa incluir papel_dimensional (novo campo
-- desta fase) pra tela conseguir exibir/gerenciar. Muda o formato de
-- retorno — precisa do drop antes do create or replace.
drop function if exists public.listar_caracteristicas_peca(uuid);

create or replace function public.listar_caracteristicas_peca(p_peca_id uuid)
returns table (id uuid, nome text, tipo text, unidade text, opcoes text[], obrigatoria boolean, papel_dimensional text)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pecas', 'view') then
    raise exception 'Sem permissão para consultar peças (pecas.view).';
  end if;
  if not exists (select 1 from public.pecas p where p.id = p_peca_id and p.company_id = v_company_id) then
    raise exception 'Peça não encontrada nesta empresa.';
  end if;

  return query
  select pc.id, pc.nome, pc.tipo, pc.unidade, pc.opcoes, pc.obrigatoria, pc.papel_dimensional
  from public.peca_caracteristicas pc
  where pc.peca_id = p_peca_id and pc.company_id = v_company_id
  order by pc.nome;
end;
$$;

grant execute on function public.listar_caracteristicas_peca(uuid) to authenticated;
