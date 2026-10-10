-- FIX (27/09/2026, achado em teste manual): definir_papel_dimensional_
-- caracteristica() não tratava reatribuir um papel (largura/altura) já
-- usado por OUTRA característica da mesma peça — o erro bruto de
-- violação de constraint única vazava direto pra tela (500, mensagem
-- ilegível pro usuário), em vez de um comportamento previsível.
--
-- Comportamento esperado (mesmo padrão de "só um X por vez", como um
-- endereço padrão): ao marcar uma característica como "largura",
-- qualquer OUTRA característica da mesma peça que já fosse "largura"
-- perde esse papel automaticamente — nunca duas com o mesmo papel ao
-- mesmo tempo, nunca erro pro usuário no fluxo normal de corrigir/trocar
-- qual característica é a largura.
create or replace function public.definir_papel_dimensional_caracteristica(p_caracteristica_id uuid, p_papel text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pecas', 'manage');
  v_caract public.peca_caracteristicas;
begin
  if p_papel is not null and p_papel not in ('largura', 'altura') then
    raise exception 'Papel dimensional inválido: % (aceito: largura, altura, ou null pra remover).', p_papel;
  end if;

  select * into v_caract from public.peca_caracteristicas where id = p_caracteristica_id and company_id = v_company_id;
  if not found then
    raise exception 'Característica não encontrada nesta empresa.';
  end if;
  if v_caract.tipo <> 'numero' then
    raise exception 'Só característica numérica pode ter papel dimensional (característica "%" é do tipo "%").', v_caract.nome, v_caract.tipo;
  end if;

  -- Desmarca qualquer outra característica da mesma peça que já tenha
  -- este papel — nunca duas ao mesmo tempo, sem exigir que o usuário
  -- desmarque manualmente antes.
  if p_papel is not null then
    update public.peca_caracteristicas
    set papel_dimensional = null, updated_at = now()
    where peca_id = v_caract.peca_id and papel_dimensional = p_papel and id <> p_caracteristica_id;
  end if;

  update public.peca_caracteristicas set papel_dimensional = p_papel, updated_at = now() where id = p_caracteristica_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pecas.papel_dimensional_definido', 'peca_caracteristica', p_caracteristica_id, v_caract.nome,
    jsonb_build_object('papel_dimensional', p_papel)
  );
end;
$$;

grant execute on function public.definir_papel_dimensional_caracteristica(uuid, text) to authenticated;
