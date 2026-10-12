-- Auditoria TR Systems (12/10/2026) — achado 3: escrita de tenant sem guarda de suspensão.
--
-- CLAUDE.md regra 2: toda mutação de tenant rejeita empresa suspensa
-- (assert_company_not_suspended()). A varredura scripts/test-suspensao-varredura.mjs
-- (catálogo do banco) achou 9 funções de escrita chamáveis por authenticated
-- que só checavam permissão: uma empresa suspensa continuava ajustando estoque,
-- apagando arquivos e movendo propostas/oportunidades. O corpo de delete_file()
-- e de mudar_estagio_oportunidade() foi lido no banco para confirmar.
--
-- A ÚNICA mudança em cada função é a linha
--     perform public.assert_company_not_suspended();
-- logo DEPOIS do gate de permissão (quem não tem permissão continua recebendo
-- o erro de permissão, não o de suspensão). O restante do corpo é idêntico à
-- definição que estava em vigor — gerado de pg_get_functiondef(), não
-- reescrito à mão. create or replace preserva os grants.
--
-- Ficam FORA, de propósito, por precisarem funcionar em empresa suspensa:
-- operações de platform_admin, log_system_event e o rastro do próprio usuário
-- (lista justificada em scripts/test-suspensao-varredura.mjs).

CREATE OR REPLACE FUNCTION public.ajustar_saldo(p_item_id uuid, p_quantidade_delta numeric, p_motivo text, p_tipo text DEFAULT 'ajuste'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_saldo public.estoque_saldos;
  v_mov_id uuid;
begin
  if p_tipo not in ('ajuste', 'compra', 'devolucao') then
    raise exception 'Tipo de movimentação inválido para ajustar_saldo(): "%".', p_tipo;
  end if;
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('estoque', 'manage') then
    raise exception 'Sem permissão para gerenciar estoque (estoque.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if p_quantidade_delta is null or p_quantidade_delta = 0 then
    raise exception 'Quantidade do ajuste não pode ser zero.';
  end if;
  if p_tipo = 'compra' and p_quantidade_delta < 0 then
    raise exception 'Recebimento de compra não pode reduzir o saldo.';
  end if;
  if p_tipo = 'devolucao' and p_quantidade_delta > 0 then
    raise exception 'Devolução não pode aumentar o saldo.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Motivo do ajuste é obrigatório.';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  insert into public.estoque_saldos (company_id, item_id)
  values (v_company_id, p_item_id)
  on conflict (company_id, item_id) do nothing;

  select * into v_saldo from public.estoque_saldos
  where company_id = v_company_id and item_id = p_item_id
  for update;

  if v_saldo.quantidade_fisica + p_quantidade_delta < 0 then
    raise exception 'Ajuste deixaria o saldo físico negativo (atual: %, ajuste: %).', v_saldo.quantidade_fisica, p_quantidade_delta;
  end if;

  update public.estoque_saldos set quantidade_fisica = quantidade_fisica + p_quantidade_delta
  where id = v_saldo.id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, motivo, created_by)
  values (
    v_company_id, p_item_id, p_tipo,
    case when p_tipo = 'ajuste' then p_quantidade_delta else abs(p_quantidade_delta) end,
    p_motivo, auth.uid()
  )
  returning id into v_mov_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.saldo_ajustado', 'estoque_movimentacao', v_mov_id, p_motivo,
    jsonb_build_object('item_id', p_item_id, 'delta', p_quantidade_delta, 'tipo', p_tipo, 'saldo_fisico_anterior', v_saldo.quantidade_fisica)
  );

  return v_mov_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_file(p_file_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_file public.files;
begin
  if not public.has_permission('files', 'delete') then
    raise exception 'Sem permissão para remover arquivos.';
  end if;
  perform public.assert_company_not_suspended();

  select * into v_file from public.files
  where id = p_file_id and company_id = v_company_id and deleted_at is null;
  if not found then
    raise exception 'Arquivo não encontrado nesta empresa.';
  end if;

  if v_file.entity_type = 'funcionario_documento' and not public.has_permission('rh', 'manage') then
    raise exception 'Sem permissão para remover documento de RH (rh.manage).';
  end if;
  if v_file.entity_type = 'contrato' and not public.has_permission('contratos', 'manage') then
    raise exception 'Sem permissão para remover documento de contrato (contratos.manage).';
  end if;

  update public.files
  set deleted_at = now(), deleted_by = auth.uid()
  where id = p_file_id;

  perform public.log_activity('file.delete', 'file', p_file_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_oportunidade(p_id uuid, p_pessoa_id uuid, p_origem text, p_descricao text, p_valor_potencial numeric, p_probabilidade numeric, p_previsao_fechamento date, p_observacoes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.oportunidades;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('oportunidades', 'manage') then
    raise exception 'Sem permissão para gerenciar oportunidades (oportunidades.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if p_probabilidade is not null and (p_probabilidade < 0 or p_probabilidade > 100) then
    raise exception 'Probabilidade deve estar entre 0 e 100.';
  end if;
  if not exists (select 1 from public.pessoas where id = p_pessoa_id and company_id = v_company_id) then
    raise exception 'Pessoa não encontrada nesta empresa.';
  end if;

  if p_id is not null then
    select * into v_before from public.oportunidades
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Oportunidade não encontrada nesta empresa.';
    end if;
    if v_before.estagio in ('ganha', 'perdida') then
      raise exception 'Oportunidade em estágio terminal ("%") não pode ser editada.', v_before.estagio;
    end if;

    update public.oportunidades set
      pessoa_id = p_pessoa_id, origem = p_origem, descricao = p_descricao,
      valor_potencial = p_valor_potencial, probabilidade = p_probabilidade,
      previsao_fechamento = p_previsao_fechamento, observacoes = p_observacoes
    where id = p_id
    returning id into v_id;
  else
    insert into public.oportunidades (
      company_id, pessoa_id, responsavel_id, origem, descricao,
      valor_potencial, probabilidade, previsao_fechamento, observacoes
    ) values (
      v_company_id, p_pessoa_id, auth.uid(), p_origem, p_descricao,
      p_valor_potencial, p_probabilidade, p_previsao_fechamento, p_observacoes
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.oportunidade_upserted', 'oportunidade', v_id, p_descricao,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'pessoa_id', p_pessoa_id, 'valor_potencial', p_valor_potencial, 'probabilidade', p_probabilidade
    ))
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mudar_estagio_oportunidade(p_id uuid, p_estagio text, p_motivo_perda text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.oportunidades;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('oportunidades', 'manage') then
    raise exception 'Sem permissão para gerenciar oportunidades (oportunidades.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if p_estagio not in (
    'prospeccao', 'contato', 'levantamento', 'qualificada',
    'orcamento', 'negociacao', 'aprovacao', 'ganha', 'perdida'
  ) then
    raise exception 'Estágio inválido: "%".', p_estagio;
  end if;
  if p_estagio = 'perdida' and p_motivo_perda is null then
    raise exception 'Motivo da perda é obrigatório ao mover para "perdida".';
  end if;
  if p_estagio <> 'perdida' and p_motivo_perda is not null then
    raise exception 'Motivo de perda só se aplica ao estágio "perdida".';
  end if;

  select * into v_before from public.oportunidades
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Oportunidade não encontrada nesta empresa.';
  end if;
  if v_before.estagio in ('ganha', 'perdida') then
    raise exception 'Oportunidade em estágio terminal ("%") não pode mudar de estágio.', v_before.estagio;
  end if;

  update public.oportunidades set estagio = p_estagio, motivo_perda = p_motivo_perda where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.oportunidade_estagio_mudado', 'oportunidade', p_id, p_estagio,
    jsonb_build_object('estagio_anterior', v_before.estagio, 'estagio_novo', p_estagio, 'motivo_perda', p_motivo_perda)
  );

  return p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_proposta(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.propostas;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('propostas', 'manage') then
    raise exception 'Sem permissão para gerenciar propostas (propostas.manage).';
  end if;
  perform public.assert_company_not_suspended();

  select * into v_before from public.propostas
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Proposta não encontrada nesta empresa.';
  end if;
  if v_before.status not in ('rascunho', 'enviada') then
    raise exception 'Proposta com status "%" não pode ser cancelada.', v_before.status;
  end if;

  update public.propostas set status = 'cancelada' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.proposta_cancelada', 'proposta', p_id, v_before.numero,
    jsonb_build_object('status_anterior', v_before.status)
  );

  return p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.marcar_proposta_enviada(p_id uuid, p_canal text, p_destinatario text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.propostas;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('propostas', 'manage') then
    raise exception 'Sem permissão para gerenciar propostas (propostas.manage).';
  end if;
  perform public.assert_company_not_suspended();

  select * into v_before from public.propostas
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Proposta não encontrada nesta empresa.';
  end if;
  if v_before.status <> 'rascunho' then
    raise exception 'Só é possível enviar proposta em rascunho (status atual: %).', v_before.status;
  end if;

  update public.propostas set
    status = 'enviada', enviada_em = now(), enviada_por = auth.uid(),
    canal = p_canal, destinatario = p_destinatario
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.proposta_enviada', 'proposta', p_id, v_before.numero,
    jsonb_build_object('canal', p_canal, 'destinatario', p_destinatario)
  );

  return p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_aceite_proposta(p_id uuid, p_forcar boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.propostas;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('propostas', 'manage') then
    raise exception 'Sem permissão para gerenciar propostas (propostas.manage).';
  end if;
  perform public.assert_company_not_suspended();

  select * into v_before from public.propostas
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Proposta não encontrada nesta empresa.';
  end if;
  if v_before.status <> 'enviada' then
    raise exception 'Só é possível aceitar proposta enviada (status atual: %).', v_before.status;
  end if;
  if v_before.validade < current_date and not p_forcar then
    raise exception 'Proposta vencida em %. Aceite exige autorização explícita (p_forcar).', v_before.validade;
  end if;

  update public.propostas set
    status = 'aceita', decidida_em = now(), decidida_por = auth.uid()
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.proposta_aceita', 'proposta', p_id, v_before.numero,
    jsonb_build_object('vencida_forcada', v_before.validade < current_date and p_forcar)
  );

  return p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_recusa_proposta(p_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.propostas;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('propostas', 'manage') then
    raise exception 'Sem permissão para gerenciar propostas (propostas.manage).';
  end if;
  perform public.assert_company_not_suspended();

  select * into v_before from public.propostas
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Proposta não encontrada nesta empresa.';
  end if;
  if v_before.status <> 'enviada' then
    raise exception 'Só é possível recusar proposta enviada (status atual: %).', v_before.status;
  end if;

  update public.propostas set
    status = 'recusada', decidida_em = now(), decidida_por = auth.uid(), decisao_observacao = p_observacao
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.proposta_recusada', 'proposta', p_id, v_before.numero,
    jsonb_build_object('observacao', p_observacao)
  );

  return p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remover_permissao_individual(p_profile_id uuid, p_permission_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_deleted_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('roles', 'manage') then
    raise exception 'Sem permissão para gerenciar permissões individuais (roles.manage).';
  end if;
  perform public.assert_company_not_suspended();

  delete from public.user_permissions
  where profile_id = p_profile_id
    and permission_id = p_permission_id
    and company_id = v_company_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Não há override individual para remover.';
  end if;

  perform public.log_activity(
    'roles.permissao_individual_removida', 'profile', p_profile_id, null,
    jsonb_build_object('permission_id', p_permission_id)
  );
end;
$function$;

