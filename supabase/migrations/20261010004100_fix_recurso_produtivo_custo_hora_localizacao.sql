-- FIX (27/09/2026, achado ao construir a tela da Fase 4): a migration
-- 20261010004000 recriou criar_recurso_produtivo()/editar_recurso_
-- produtivo() a partir da assinatura de 17/09 (sem localizacao), sem ver
-- que 20260917040000 já tinha adicionado p_localizacao, e que
-- 20260925000000 (permissões granulares) já tinha trocado o gate pra
-- assert_tenant_write_any('producao', array['configurar','manage']).
-- O `drop function if exists` daquela migration usava a assinatura
-- antiga (5/4 parâmetros) e não encontrou nada pra derrubar — o
-- `create or replace` seguinte, com 6/5 parâmetros mas o último de tipo
-- numeric (custo_hora) em vez de text (localizacao), criou uma SEGUNDA
-- sobrecarga em paralelo, em vez de substituir a função real. Resultado:
-- p_localizacao ficou inacessível em qualquer chamada que também
-- passasse p_custo_hora, e o gate regrediu de volta pra só 'manage' (sem
-- 'configurar') nessa sobrecarga nova e não-usada.
--
-- Corrige derrubando as duas sobrecargas (a antiga com localizacao e a
-- nova, errada, com custo_hora) e recriando uma função só, com os dois
-- campos e o gate correto.

drop function if exists public.criar_recurso_produtivo(text, text, text, text, numeric, text);
drop function if exists public.criar_recurso_produtivo(text, text, text, text, numeric, numeric);

create or replace function public.criar_recurso_produtivo(
  p_codigo text, p_nome text, p_tipo text, p_setor text default null, p_capacidade_horas_dia numeric default null,
  p_localizacao text default null, p_custo_hora numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
  v_id uuid;
begin
  if p_codigo is null or btrim(p_codigo) = '' then
    raise exception 'Código do recurso é obrigatório.';
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do recurso é obrigatório.';
  end if;
  if p_tipo not in ('maquina', 'equipamento', 'linha', 'posto', 'equipe', 'operador', 'ferramenta', 'dispositivo') then
    raise exception 'Tipo de recurso inválido: %.', p_tipo;
  end if;
  if p_capacidade_horas_dia is not null and p_capacidade_horas_dia <= 0 then
    raise exception 'Capacidade em horas/dia deve ser maior que zero.';
  end if;
  if p_custo_hora is not null and p_custo_hora < 0 then
    raise exception 'Custo/hora inválido.';
  end if;

  insert into public.recursos_produtivos (company_id, codigo, nome, tipo, setor, capacidade_horas_dia, localizacao, custo_hora)
  values (v_company_id, btrim(p_codigo), btrim(p_nome), p_tipo, p_setor, p_capacidade_horas_dia, p_localizacao, p_custo_hora)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_criado', 'recurso_produtivo', v_id, p_nome, jsonb_build_object('tipo', p_tipo));

  return v_id;
end;
$$;

grant execute on function public.criar_recurso_produtivo(text, text, text, text, numeric, text, numeric) to authenticated;

drop function if exists public.editar_recurso_produtivo(uuid, text, text, numeric, text);
drop function if exists public.editar_recurso_produtivo(uuid, text, text, numeric, numeric);

create or replace function public.editar_recurso_produtivo(
  p_id uuid, p_nome text, p_setor text default null, p_capacidade_horas_dia numeric default null,
  p_localizacao text default null, p_custo_hora numeric default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do recurso é obrigatório.';
  end if;
  if p_capacidade_horas_dia is not null and p_capacidade_horas_dia <= 0 then
    raise exception 'Capacidade em horas/dia deve ser maior que zero.';
  end if;
  if p_custo_hora is not null and p_custo_hora < 0 then
    raise exception 'Custo/hora inválido.';
  end if;

  update public.recursos_produtivos set
    nome = btrim(p_nome), setor = p_setor, capacidade_horas_dia = p_capacidade_horas_dia,
    localizacao = p_localizacao, custo_hora = p_custo_hora
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_editado', 'recurso_produtivo', p_id, p_nome, jsonb_build_object('custo_hora', p_custo_hora));
end;
$$;

grant execute on function public.editar_recurso_produtivo(uuid, text, text, numeric, text, numeric) to authenticated;
