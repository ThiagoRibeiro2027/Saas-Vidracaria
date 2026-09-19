-- TÓPICO 4 — Fase 7e da ampliação de escopo (ADR-002 §4.7): §50 permissões
-- granulares por perfil. Decisão do responsável do produto em 2026-09-19
-- ("ok, conforme recomendado"): 3 ações finas + producao.manage como
-- superset, nada de workflow novo.
--
-- Por quê ficou só em 3 ações, e não nas 4 do texto do §50 (Operador/
-- Líder-Supervisor/PCP/Gestor): "validar apontamentos" e "tratar
-- ocorrências" (perfil Líder/Supervisor) não mapeiam pra nenhuma função
-- que já existe — apontamento é aceito direto, sem etapa de aprovação
-- (implementar isso seria inventar um workflow novo, sem base em ADR,
-- mesmo problema do §45); e "ocorrência" não é conceito de T4 (existe em
-- T9/T16, módulos diferentes). Os outros 3 perfis mapeiam limpo pras
-- funções que já existem:
--   - producao.apontar (Operador): apontar produção/perda/retrabalho,
--     concluir OP, reportar/encerrar manutenção corretiva ("registrar
--     parada").
--   - producao.planejar (PCP): criar/programar/sequenciar OP, lote, lote
--     fabril, manutenção preventiva, transferência/alocação de recurso.
--   - producao.configurar (Gestor): roteiro, recurso (cadastro/situação),
--     prioridade, peso de sequenciamento, horizonte, rótulo de status
--     (§41), e as duas alterações mais críticas de uma OP — cancelar e
--     definir prioridade ("aprovar alterações críticas").
--
-- Por quê nenhuma empresa perde acesso: assert_tenant_write_any() aceita
-- QUALQUER uma das ações da lista — cada função troca
-- assert_tenant_write('producao', 'manage') por assert_tenant_write_any
-- ('producao', array['<ação fina>', 'manage']). Quem já tinha
-- producao.manage concedido continua podendo tudo, sem nenhum backfill
-- de role_permissions necessário. As 3 ações novas são só uma forma
-- adicional e mais fina de conceder a mesma coisa — 'producao.view'
-- (leitura) não muda em nada.
--
-- As 33 funções abaixo são recriadas com o corpo idêntico ao que já
-- estava em produção (extraído via pg_get_functiondef do banco local já
-- migrado) — a única mudança em cada uma é a linha do guard.
--
-- Achado ao testar: criar_ordem_producao() (bucket 'planejar') chama
-- next_document_number('ordem_producao'), que tem o PRÓPRIO gate
-- interno hardcoded pra 'producao'/'manage' (T15, mesmo padrão usado
-- pros outros tipos de documento — orçamento/pedido/expedição/
-- instalação/título financeiro, nenhum deles alterado aqui). Sem
-- corrigir esse branch, um papel só com producao.planejar (sem manage)
-- criava a OP mas nunca conseguia emitir o número dela. Só o branch
-- 'ordem_producao' muda, pro mesmo OR com 'manage'.

create or replace function public.assert_tenant_write_any(p_resource text, p_actions text[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not exists (select 1 from unnest(p_actions) a where public.has_permission(p_resource, a)) then
    raise exception 'Sem permissão para esta operação (%.%).', p_resource, array_to_string(p_actions, ' ou ');
  end if;
  perform public.assert_company_not_suspended();
  return v_company_id;
end;
$$;

grant execute on function public.assert_tenant_write_any(text, text[]) to authenticated;

CREATE OR REPLACE FUNCTION public.remover_item_lote_fabril(p_lote_fabril_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
begin
  delete from public.lote_fabril_itens where id = p_lote_fabril_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de lote fabril não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.item_lote_fabril_removido', 'lote_fabril_item', p_lote_fabril_item_id, null, null);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.encerrar_lote_fabril(p_lote_fabril_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
begin
  update public.lotes_fabris set situacao = 'encerrado', encerrado_em = now()
  where id = p_lote_fabril_id and company_id = v_company_id and situacao = 'aberto';
  if not found then
    raise exception 'Lote fabril não encontrado nesta empresa ou já encerrado.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.lote_fabril_encerrado', 'lote_fabril', p_lote_fabril_id, null, null);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.cancelar_manutencao_preventiva(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
begin
  update public.manutencoes_preventivas set ativo = false where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Manutenção preventiva não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.manutencao_preventiva_cancelada', 'manutencao_preventiva', p_id, null, null);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.iniciar_manutencao_corretiva(p_recurso_produtivo_id uuid, p_problema text, p_motivo text DEFAULT NULL::text, p_previsao_retorno timestamp with time zone DEFAULT NULL::timestamp with time zone, p_responsavel_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['apontar', 'manage']);
  v_id uuid;
begin
  if p_problema is null or btrim(p_problema) = '' then
    raise exception 'Descrição do problema é obrigatória.';
  end if;
  if not exists (select 1 from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;
  if p_responsavel_id is not null and not exists (select 1 from public.profiles where id = p_responsavel_id and company_id = v_company_id) then
    raise exception 'Responsável não encontrado nesta empresa.';
  end if;
  if exists (select 1 from public.manutencoes_corretivas where recurso_produtivo_id = p_recurso_produtivo_id and status = 'aberta') then
    raise exception 'Já existe manutenção corretiva aberta para este recurso.';
  end if;

  insert into public.manutencoes_corretivas (
    company_id, recurso_produtivo_id, problema, motivo, previsao_retorno, responsavel_id
  ) values (
    v_company_id, p_recurso_produtivo_id, btrim(p_problema), p_motivo, p_previsao_retorno, p_responsavel_id
  ) returning id into v_id;

  update public.recursos_produtivos set situacao = 'em_manutencao', motivo_situacao = p_problema
  where id = p_recurso_produtivo_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.manutencao_corretiva_iniciada', 'recurso_produtivo', p_recurso_produtivo_id, p_problema,
    jsonb_build_object('manutencao_corretiva_id', v_id)
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.encerrar_manutencao_corretiva(p_id uuid, p_pecas text DEFAULT NULL::text, p_servicos text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['apontar', 'manage']);
  v_manutencao public.manutencoes_corretivas;
begin
  select * into v_manutencao from public.manutencoes_corretivas
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Manutenção corretiva não encontrada nesta empresa.';
  end if;
  if v_manutencao.status = 'encerrada' then
    raise exception 'Manutenção corretiva já encerrada.';
  end if;

  update public.manutencoes_corretivas set
    status = 'encerrada', retorno_efetivo = now(), pecas = p_pecas, servicos = p_servicos, observacoes = p_observacoes
  where id = p_id;

  update public.recursos_produtivos set situacao = 'disponivel', motivo_situacao = null
  where id = v_manutencao.recurso_produtivo_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.manutencao_corretiva_encerrada', 'manutencao_corretiva', p_id, null,
    jsonb_build_object('recurso_produtivo_id', v_manutencao.recurso_produtivo_id)
  );
end;
$function$
;


CREATE OR REPLACE FUNCTION public.definir_prioridade_op(p_ordem_producao_id uuid, p_prioridade smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
begin
  if p_prioridade is null or p_prioridade not between 1 and 5 then
    raise exception 'Prioridade deve estar entre 1 (mais urgente) e 5 (menos urgente).';
  end if;

  update public.ordens_producao set prioridade = p_prioridade
  where id = p_ordem_producao_id and company_id = v_company_id;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.prioridade_definida', 'ordem_producao', p_ordem_producao_id, null,
    jsonb_build_object('prioridade', p_prioridade)
  );
end;
$function$
;


CREATE OR REPLACE FUNCTION public.trocar_recurso_operacao(p_op_lote_operacao_id uuid, p_novo_recurso_produtivo_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
  v_operacao public.op_lote_operacoes;
  v_recurso_anterior_id uuid;
begin
  if p_novo_recurso_produtivo_id is null then
    raise exception 'Novo recurso é obrigatório.';
  end if;
  if not exists (select 1 from public.recursos_produtivos where id = p_novo_recurso_produtivo_id and company_id = v_company_id) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  select * into v_operacao from public.op_lote_operacoes
  where id = p_op_lote_operacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;
  if v_operacao.status = 'concluida' then
    raise exception 'Operação já concluída não pode trocar de recurso.';
  end if;

  v_recurso_anterior_id := v_operacao.recurso_produtivo_id;

  update public.op_lote_operacoes set recurso_produtivo_id = p_novo_recurso_produtivo_id
  where id = p_op_lote_operacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.recurso_operacao_trocado', 'op_lote_operacao', p_op_lote_operacao_id, p_motivo,
    jsonb_build_object('recurso_anterior_id', v_recurso_anterior_id, 'recurso_novo_id', p_novo_recurso_produtivo_id)
  );
end;
$function$
;


CREATE OR REPLACE FUNCTION public.decidir_sequenciamento(p_op_lote_operacao_id uuid, p_decisao text, p_motivo text DEFAULT NULL::text, p_nova_data_planejada_inicio date DEFAULT NULL::date, p_nova_data_planejada_fim date DEFAULT NULL::date, p_novo_recurso_produtivo_id uuid DEFAULT NULL::uuid, p_nova_prioridade smallint DEFAULT NULL::smallint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
  v_operacao public.op_lote_operacoes;
  v_snapshot jsonb;
  v_tem_valor_novo boolean;
  v_aplicado boolean := false;
  v_id uuid;
begin
  if p_decisao not in ('aceitar', 'rejeitar', 'modificar', 'ignorar', 'manual') then
    raise exception 'Decisão inválida: %.', p_decisao;
  end if;

  select * into v_operacao from public.op_lote_operacoes
  where id = p_op_lote_operacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;
  if v_operacao.status = 'concluida' then
    raise exception 'Operação já concluída não participa mais de sequenciamento.';
  end if;

  v_tem_valor_novo := p_nova_data_planejada_inicio is not null or p_nova_data_planejada_fim is not null
    or p_novo_recurso_produtivo_id is not null or p_nova_prioridade is not null;

  if p_decisao in ('rejeitar', 'ignorar') and v_tem_valor_novo then
    raise exception 'Decisão "%" não altera a programação — não informe data/recurso/prioridade novos.', p_decisao;
  end if;

  -- Snapshot da recomendação apresentada (§7) no momento da decisão —
  -- vazio quando a operação não tem recurso associado.
  if v_operacao.recurso_produtivo_id is not null then
    select to_jsonb(r) into v_snapshot
    from public.calcular_ranking_sequenciamento(v_operacao.recurso_produtivo_id) r
    where r.op_lote_operacao_id = p_op_lote_operacao_id;
  end if;

  -- Aplica de verdade só quando a decisão é aceitar/modificar/manual E
  -- algum valor novo veio — reaproveita as funções já validadas e
  -- auditadas (trocar_recurso_operacao Fase 5b, programar_operacao/
  -- definir_prioridade_op Fase 6a), sem duplicar validação.
  if p_decisao in ('aceitar', 'modificar', 'manual') and v_tem_valor_novo then
    if p_novo_recurso_produtivo_id is not null then
      perform public.trocar_recurso_operacao(p_op_lote_operacao_id, p_novo_recurso_produtivo_id, p_motivo);
    end if;
    if p_nova_data_planejada_inicio is not null or p_nova_data_planejada_fim is not null then
      perform public.programar_operacao(
        p_op_lote_operacao_id,
        coalesce(p_nova_data_planejada_inicio, v_operacao.data_planejada_inicio),
        coalesce(p_nova_data_planejada_fim, v_operacao.data_planejada_fim)
      );
    end if;
    if p_nova_prioridade is not null then
      perform public.definir_prioridade_op(v_operacao.ordem_producao_id, p_nova_prioridade);
    end if;
    v_aplicado := true;
  end if;

  insert into public.sequenciamento_decisoes (
    company_id, op_lote_operacao_id, recomendacao_snapshot, decisao, motivo, aplicado, decidido_por
  ) values (
    v_company_id, p_op_lote_operacao_id, coalesce(v_snapshot, '{}'::jsonb), p_decisao, p_motivo, v_aplicado, auth.uid()
  ) returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.sequenciamento_decidido', 'op_lote_operacao', p_op_lote_operacao_id, p_motivo,
    jsonb_build_object('decisao', p_decisao, 'aplicado', v_aplicado, 'sequenciamento_decisao_id', v_id)
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.remover_horizonte_programacao(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
begin
  delete from public.producao_horizontes where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Horizonte de programação não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.horizonte_removido', 'producao_horizonte', p_id, null, null);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.programar_operacao(p_op_lote_operacao_id uuid, p_data_planejada_inicio date, p_data_planejada_fim date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
begin
  perform public.assert_pode_reprogramar(p_op_lote_operacao_id, p_data_planejada_inicio, p_data_planejada_fim);

  if p_data_planejada_inicio is not null and p_data_planejada_fim is not null
    and p_data_planejada_fim < p_data_planejada_inicio then
    raise exception 'Data planejada de fim (%) não pode ser anterior à de início (%).', p_data_planejada_fim, p_data_planejada_inicio;
  end if;

  update public.op_lote_operacoes set
    data_planejada_inicio = p_data_planejada_inicio,
    data_planejada_fim = p_data_planejada_fim
  where id = p_op_lote_operacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.operacao_programada', 'op_lote_operacao', p_op_lote_operacao_id, null,
    jsonb_build_object('data_planejada_inicio', p_data_planejada_inicio, 'data_planejada_fim', p_data_planejada_fim)
  );
end;
$function$
;


CREATE OR REPLACE FUNCTION public.cancelar_ordem_producao(p_ordem_producao_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
  v_op public.ordens_producao;
  v_reserva_ativa public.estoque_reservas;
begin
  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status = 'concluida' then
    raise exception 'Ordem de produção já concluída não pode ser cancelada.';
  end if;
  if v_op.status = 'cancelada' then
    raise exception 'Ordem de produção já está cancelada.';
  end if;

  update public.ordens_producao set status = 'cancelada' where id = p_ordem_producao_id;

  -- F07 (auditoria 15/09/2026): cancelar a OP não pode deixar a reserva de
  -- estoque do pedido_item presa — libera automaticamente a reserva ativa,
  -- se houver, na mesma transação.
  select * into v_reserva_ativa from public.estoque_reservas
  where pedido_item_id = v_op.pedido_item_id and status = 'reservado'
  for update;
  if found then
    perform public.liberar_reserva_interna(v_reserva_ativa.id, v_company_id);
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_cancelada', 'ordem_producao', p_ordem_producao_id, p_motivo,
    jsonb_build_object('status_anterior', v_op.status, 'reserva_liberada', v_reserva_ativa.id is not null)
  );

  return p_ordem_producao_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.desativar_roteiro(p_roteiro_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
begin
  update public.roteiros_produtivos set ativo = false
  where id = p_roteiro_id and company_id = v_company_id;
  if not found then
    raise exception 'Roteiro não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.roteiro_desativado', 'roteiro_produtivo', p_roteiro_id, null, null);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.criar_roteiro_produtivo(p_item_id uuid, p_nome text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
  v_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do roteiro é obrigatório.';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  -- Só pode haver 1 roteiro ativo por item (roteiros_produtivos_ativo_
  -- unique) — desativa o anterior antes de criar o novo, mesmo padrão de
  -- liberar_engenharia() rebaixando a versão vigente antes de inserir.
  update public.roteiros_produtivos set ativo = false
  where item_id = p_item_id and company_id = v_company_id and ativo;

  insert into public.roteiros_produtivos (company_id, item_id, nome)
  values (v_company_id, p_item_id, btrim(p_nome))
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.roteiro_criado', 'roteiro_produtivo', v_id, p_nome,
    jsonb_build_object('item_id', p_item_id)
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.remover_operacao_roteiro(p_roteiro_operacao_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
begin
  delete from public.roteiro_operacoes
  where id = p_roteiro_operacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Operação de roteiro não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.operacao_roteiro_removida', 'roteiro_operacao', p_roteiro_operacao_id, null, null);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.concluir_ordem_producao(p_ordem_producao_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['apontar', 'manage']);
  v_op public.ordens_producao;
  v_operacoes_pendentes int;
begin
  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível concluir OP planejada ou em produção (status atual: %).', v_op.status;
  end if;
  if v_op.quantidade_produzida < v_op.quantidade_planejada then
    raise exception 'Quantidade produzida (%) ainda não atinge a planejada (%).', v_op.quantidade_produzida, v_op.quantidade_planejada;
  end if;

  select count(*) into v_operacoes_pendentes from public.op_lote_operacoes
  where ordem_producao_id = p_ordem_producao_id and status <> 'concluida';
  if v_operacoes_pendentes > 0 then
    raise exception 'Ainda há % operação(ões) de lote não concluída(s) (TÓPICO 4 §16).', v_operacoes_pendentes;
  end if;

  perform public.recalcular_situacao_ordem_producao(p_ordem_producao_id);
  select * into v_op from public.ordens_producao where id = p_ordem_producao_id;
  if v_op.situacao = 'bloqueada' then
    raise exception 'Ordem de produção bloqueada (%): %. Ação necessária: %',
      v_op.origem_bloqueio, v_op.motivo_bloqueio, v_op.acao_necessaria;
  end if;

  update public.ordens_producao set status = 'concluida' where id = p_ordem_producao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_concluida', 'ordem_producao', p_ordem_producao_id, v_op.numero,
    jsonb_build_object('quantidade_produzida', v_op.quantidade_produzida, 'quantidade_perdida', v_op.quantidade_perdida)
  );

  return p_ordem_producao_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.criar_ordem_producao(p_pedido_item_id uuid, p_quantidade numeric DEFAULT NULL::numeric, p_liberar_integralmente boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
  v_pedido_item public.pedido_itens;
  v_pedido public.pedidos;
  v_ja_planejado numeric;
  v_quantidade numeric;
  v_engenharia_versao_id uuid;
  v_op_lote_id uuid;
  v_numero text;
  v_id uuid;
begin
  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido_item.pedido_id;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível criar ordem de produção para item de pedido liberado (status atual: %).', v_pedido.status;
  end if;

  -- Lock de todas as OPs ativas do item antes de agregar (evita duas
  -- criações concorrentes ultrapassarem juntas o saldo do item).
  perform 1 from public.ordens_producao
  where pedido_item_id = p_pedido_item_id and company_id = v_company_id and status <> 'cancelada'
  for update;

  select coalesce(sum(quantidade_planejada), 0) into v_ja_planejado
  from public.ordens_producao
  where pedido_item_id = p_pedido_item_id and company_id = v_company_id and status <> 'cancelada';

  v_quantidade := coalesce(p_quantidade, v_pedido_item.quantidade - v_ja_planejado);
  if v_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero (saldo ainda não planejado do item: %).', v_pedido_item.quantidade - v_ja_planejado;
  end if;
  if v_ja_planejado + v_quantidade > v_pedido_item.quantidade then
    raise exception 'Quantidade solicitada (%) somada ao já planejado (%) excede a quantidade do item (%).',
      v_quantidade, v_ja_planejado, v_pedido_item.quantidade;
  end if;

  select id into v_engenharia_versao_id from public.engenharia_versoes
  where pedido_item_id = p_pedido_item_id and situacao = 'liberada';

  v_numero := public.next_document_number('ordem_producao');

  insert into public.ordens_producao (
    company_id, pedido_id, pedido_item_id, numero, quantidade_planejada, engenharia_versao_id
  ) values (
    v_company_id, v_pedido.id, p_pedido_item_id, v_numero, v_quantidade, v_engenharia_versao_id
  )
  returning id into v_id;

  if p_liberar_integralmente then
    insert into public.op_lotes (company_id, ordem_producao_id, numero, quantidade_planejada, liberado_por)
    values (v_company_id, v_id, 1, v_quantidade, auth.uid())
    returning id into v_op_lote_id;

    perform public.criar_op_lote_operacoes(v_company_id, v_id, v_pedido_item.item_id, v_op_lote_id, v_quantidade);
  end if;

  perform public.recalcular_situacao_ordem_producao(v_id);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.ordem_criada', 'ordem_producao', v_id, v_numero,
    jsonb_build_object(
      'pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id,
      'quantidade_planejada', v_quantidade, 'engenharia_versao_id', v_engenharia_versao_id,
      'liberado_integralmente', p_liberar_integralmente, 'op_lote_id', v_op_lote_id
    )
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.liberar_lote_producao(p_ordem_producao_id uuid, p_quantidade numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
  v_op public.ordens_producao;
  v_pedido_item public.pedido_itens;
  v_ja_liberado numeric;
  v_numero int;
  v_id uuid;
begin
  select * into v_op from public.ordens_producao
  where id = p_ordem_producao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível liberar lote em OP planejada ou em produção (status atual: %).', v_op.status;
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  -- Lock de todos os lotes da OP antes de agregar (evita duas liberações
  -- concorrentes ultrapassarem juntas o planejado da OP).
  perform 1 from public.op_lotes where ordem_producao_id = p_ordem_producao_id for update;

  select coalesce(sum(quantidade_planejada), 0) into v_ja_liberado
  from public.op_lotes where ordem_producao_id = p_ordem_producao_id;

  if v_ja_liberado + p_quantidade > v_op.quantidade_planejada then
    raise exception 'Quantidade solicitada (%) somada ao já liberado (%) excede a quantidade planejada da OP (%).',
      p_quantidade, v_ja_liberado, v_op.quantidade_planejada;
  end if;

  perform public.recalcular_situacao_ordem_producao(p_ordem_producao_id);
  select * into v_op from public.ordens_producao where id = p_ordem_producao_id;
  if v_op.situacao = 'bloqueada' then
    raise exception 'Ordem de produção bloqueada (%): %. Ação necessária: %',
      v_op.origem_bloqueio, v_op.motivo_bloqueio, v_op.acao_necessaria;
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero from public.op_lotes where ordem_producao_id = p_ordem_producao_id;
  select * into v_pedido_item from public.pedido_itens where id = v_op.pedido_item_id;

  insert into public.op_lotes (company_id, ordem_producao_id, numero, quantidade_planejada, liberado_por)
  values (v_company_id, p_ordem_producao_id, v_numero, p_quantidade, auth.uid())
  returning id into v_id;

  perform public.criar_op_lote_operacoes(v_company_id, p_ordem_producao_id, v_pedido_item.item_id, v_id, p_quantidade);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.lote_liberado', 'ordem_producao', p_ordem_producao_id, null,
    jsonb_build_object('op_lote_id', v_id, 'numero', v_numero, 'quantidade', p_quantidade)
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.apontar_producao(p_op_lote_operacao_id uuid, p_quantidade_produzida numeric DEFAULT 0, p_quantidade_rejeitada numeric DEFAULT 0, p_quantidade_retrabalho numeric DEFAULT 0, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['apontar', 'manage']);
  v_operacao public.op_lote_operacoes;
  v_operacao_anterior public.op_lote_operacoes;
  v_op public.ordens_producao;
  v_produzida numeric := coalesce(p_quantidade_produzida, 0);
  v_rejeitada numeric := coalesce(p_quantidade_rejeitada, 0);
  v_retrabalho numeric := coalesce(p_quantidade_retrabalho, 0);
  v_id uuid;
begin
  if v_produzida < 0 or v_rejeitada < 0 or v_retrabalho < 0 then
    raise exception 'Quantidades não podem ser negativas.';
  end if;
  if v_produzida = 0 and v_rejeitada = 0 and v_retrabalho = 0 then
    raise exception 'Informe ao menos uma quantidade (produzida, rejeitada ou retrabalho) maior que zero.';
  end if;

  select * into v_operacao from public.op_lote_operacoes
  where id = p_op_lote_operacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;

  select * into v_op from public.ordens_producao where id = v_operacao.ordem_producao_id for update;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível apontar produção em OP planejada ou em produção (status atual: %).', v_op.status;
  end if;

  perform public.recalcular_situacao_ordem_producao(v_op.id);
  select * into v_op from public.ordens_producao where id = v_op.id;
  if v_op.situacao = 'bloqueada' then
    raise exception 'Ordem de produção bloqueada (%): %. Ação necessária: %',
      v_op.origem_bloqueio, v_op.motivo_bloqueio, v_op.acao_necessaria;
  end if;

  -- TÓPICO 4 §12: produzir além do que ESTE LOTE liberou tornaria a
  -- liberação parcial inútil (bastaria "estourar" um lote pequeno pra
  -- completar a OP inteira sem liberar o resto).
  if v_operacao.quantidade_produzida + v_produzida > v_operacao.quantidade_planejada then
    raise exception 'Quantidade produzida (%) excederia o planejado deste lote (%).',
      v_operacao.quantidade_produzida + v_produzida, v_operacao.quantidade_planejada;
  end if;

  -- TÓPICO 4 §16: fluxo sequencial DENTRO do mesmo lote — lotes
  -- diferentes avançam pelo roteiro de forma independente (§12).
  if v_operacao.sequencia > 1 then
    select * into v_operacao_anterior from public.op_lote_operacoes
    where op_lote_id = v_operacao.op_lote_id and sequencia = v_operacao.sequencia - 1;
    if found and v_operacao.quantidade_produzida + v_produzida > v_operacao_anterior.quantidade_produzida then
      raise exception 'Quantidade produzida (%) excederia o que a operação anterior (%) já entregou (%) neste lote.',
        v_operacao.quantidade_produzida + v_produzida, v_operacao_anterior.descricao, v_operacao_anterior.quantidade_produzida;
    end if;
  end if;

  insert into public.producao_apontamentos (
    company_id, ordem_producao_id, op_lote_operacao_id, quantidade_produzida, quantidade_perdida,
    quantidade_retrabalho, observacao, registrado_por
  ) values (
    v_company_id, v_op.id, p_op_lote_operacao_id, v_produzida, v_rejeitada, v_retrabalho, p_observacao, auth.uid()
  ) returning id into v_id;

  update public.op_lote_operacoes set
    quantidade_produzida = quantidade_produzida + v_produzida,
    quantidade_rejeitada = quantidade_rejeitada + v_rejeitada,
    quantidade_retrabalho = quantidade_retrabalho + v_retrabalho,
    iniciada_em = coalesce(iniciada_em, now()),
    status = case when quantidade_produzida + v_produzida >= quantidade_planejada then 'concluida' else 'em_andamento' end,
    concluida_em = case when quantidade_produzida + v_produzida >= quantidade_planejada then now() else concluida_em end
  where id = p_op_lote_operacao_id;

  perform public.recalcular_agregados_producao(v_operacao.op_lote_id);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.apontamento_registrado', 'ordem_producao', v_op.id, p_observacao,
    jsonb_build_object(
      'op_lote_operacao_id', p_op_lote_operacao_id, 'quantidade_produzida', v_produzida,
      'quantidade_rejeitada', v_rejeitada, 'quantidade_retrabalho', v_retrabalho
    )
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.apontar_producao_recurso(p_op_lote_operacao_recurso_id uuid, p_quantidade_produzida numeric DEFAULT 0, p_quantidade_rejeitada numeric DEFAULT 0, p_quantidade_retrabalho numeric DEFAULT 0, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['apontar', 'manage']);
  v_recurso public.op_lote_operacao_recursos;
  v_operacao public.op_lote_operacoes;
  v_operacao_anterior public.op_lote_operacoes;
  v_op public.ordens_producao;
  v_produzida numeric := coalesce(p_quantidade_produzida, 0);
  v_rejeitada numeric := coalesce(p_quantidade_rejeitada, 0);
  v_retrabalho numeric := coalesce(p_quantidade_retrabalho, 0);
  v_id uuid;
begin
  if v_produzida < 0 or v_rejeitada < 0 or v_retrabalho < 0 then
    raise exception 'Quantidades não podem ser negativas.';
  end if;
  if v_produzida = 0 and v_rejeitada = 0 and v_retrabalho = 0 then
    raise exception 'Informe ao menos uma quantidade (produzida, rejeitada ou retrabalho) maior que zero.';
  end if;

  select * into v_recurso from public.op_lote_operacao_recursos
  where id = p_op_lote_operacao_recurso_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Recurso de operação não encontrado nesta empresa.';
  end if;
  if v_recurso.quantidade_produzida + v_produzida > v_recurso.quantidade_alocada then
    raise exception 'Quantidade produzida (%) excederia o alocado a este recurso (%).',
      v_recurso.quantidade_produzida + v_produzida, v_recurso.quantidade_alocada;
  end if;

  select * into v_operacao from public.op_lote_operacoes where id = v_recurso.op_lote_operacao_id for update;
  select * into v_op from public.ordens_producao where id = v_operacao.ordem_producao_id for update;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível apontar produção em OP planejada ou em produção (status atual: %).', v_op.status;
  end if;

  perform public.recalcular_situacao_ordem_producao(v_op.id);
  select * into v_op from public.ordens_producao where id = v_op.id;
  if v_op.situacao = 'bloqueada' then
    raise exception 'Ordem de produção bloqueada (%): %. Ação necessária: %',
      v_op.origem_bloqueio, v_op.motivo_bloqueio, v_op.acao_necessaria;
  end if;

  if v_operacao.sequencia > 1 then
    select * into v_operacao_anterior from public.op_lote_operacoes
    where op_lote_id = v_operacao.op_lote_id and sequencia = v_operacao.sequencia - 1;
    if found and v_operacao.quantidade_produzida + v_produzida > v_operacao_anterior.quantidade_produzida then
      raise exception 'Quantidade produzida (%) excederia o que a operação anterior (%) já entregou (%) neste lote.',
        v_operacao.quantidade_produzida + v_produzida, v_operacao_anterior.descricao, v_operacao_anterior.quantidade_produzida;
    end if;
  end if;

  insert into public.producao_apontamentos (
    company_id, ordem_producao_id, op_lote_operacao_id, op_lote_operacao_recurso_id, quantidade_produzida,
    quantidade_perdida, quantidade_retrabalho, observacao, registrado_por
  ) values (
    v_company_id, v_op.id, v_recurso.op_lote_operacao_id, p_op_lote_operacao_recurso_id, v_produzida, v_rejeitada,
    v_retrabalho, p_observacao, auth.uid()
  ) returning id into v_id;

  update public.op_lote_operacao_recursos set
    quantidade_produzida = quantidade_produzida + v_produzida,
    quantidade_rejeitada = quantidade_rejeitada + v_rejeitada,
    quantidade_retrabalho = quantidade_retrabalho + v_retrabalho,
    status = case when quantidade_produzida + v_produzida >= quantidade_alocada then 'concluida' else 'em_andamento' end
  where id = p_op_lote_operacao_recurso_id;

  -- Consolida na célula (lote × operação) pai: soma de todos os splits
  -- de recurso dessa operação (§13, "o sistema deverá consolidar os
  -- resultados na OP").
  update public.op_lote_operacoes set
    quantidade_produzida = (select coalesce(sum(quantidade_produzida), 0) from public.op_lote_operacao_recursos where op_lote_operacao_id = v_operacao.id),
    quantidade_rejeitada = (select coalesce(sum(quantidade_rejeitada), 0) from public.op_lote_operacao_recursos where op_lote_operacao_id = v_operacao.id),
    quantidade_retrabalho = (select coalesce(sum(quantidade_retrabalho), 0) from public.op_lote_operacao_recursos where op_lote_operacao_id = v_operacao.id),
    iniciada_em = coalesce(iniciada_em, now()),
    status = case
      when (select coalesce(sum(quantidade_produzida), 0) from public.op_lote_operacao_recursos where op_lote_operacao_id = v_operacao.id) >= quantidade_planejada
      then 'concluida' else 'em_andamento'
    end
  where id = v_operacao.id;

  perform public.recalcular_agregados_producao(v_operacao.op_lote_id);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.apontamento_registrado', 'ordem_producao', v_op.id, p_observacao,
    jsonb_build_object(
      'op_lote_operacao_recurso_id', p_op_lote_operacao_recurso_id, 'quantidade_produzida', v_produzida,
      'quantidade_rejeitada', v_rejeitada, 'quantidade_retrabalho', v_retrabalho
    )
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.criar_lote_fabril(p_nome text, p_criterio_agrupamento text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
  v_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do lote fabril é obrigatório.';
  end if;

  insert into public.lotes_fabris (company_id, nome, criterio_agrupamento, observacoes, criado_por)
  values (v_company_id, btrim(p_nome), p_criterio_agrupamento, p_observacoes, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.lote_fabril_criado', 'lote_fabril', v_id, p_nome, null);

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.adicionar_item_lote_fabril(p_lote_fabril_id uuid, p_op_lote_id uuid, p_quantidade numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
  v_lote_fabril public.lotes_fabris;
  v_op_lote public.op_lotes;
  v_id uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select * into v_lote_fabril from public.lotes_fabris
  where id = p_lote_fabril_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Lote fabril não encontrado nesta empresa.';
  end if;
  if v_lote_fabril.situacao = 'encerrado' then
    raise exception 'Lote fabril encerrado não aceita novos itens.';
  end if;

  select * into v_op_lote from public.op_lotes where id = p_op_lote_id and company_id = v_company_id;
  if not found then
    raise exception 'Lote de liberação não encontrado nesta empresa.';
  end if;
  if p_quantidade > v_op_lote.quantidade_planejada then
    raise exception 'Quantidade (%) excede o planejado do lote de liberação (%).', p_quantidade, v_op_lote.quantidade_planejada;
  end if;

  insert into public.lote_fabril_itens (company_id, lote_fabril_id, op_lote_id, quantidade, adicionado_por)
  values (v_company_id, p_lote_fabril_id, p_op_lote_id, p_quantidade, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.item_lote_fabril_adicionado', 'lote_fabril', p_lote_fabril_id, null,
    jsonb_build_object('lote_fabril_item_id', v_id, 'op_lote_id', p_op_lote_id, 'quantidade', p_quantidade)
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.atualizar_situacao_recurso(p_id uuid, p_situacao text, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
begin
  if p_situacao not in (
    'disponivel', 'em_producao', 'programado_manutencao', 'em_manutencao', 'parado',
    'indisponivel', 'aguardando_peca', 'aguardando_ferramenta', 'aguardando_operador', 'bloqueado', 'outros'
  ) then
    raise exception 'Situação inválida: %.', p_situacao;
  end if;

  update public.recursos_produtivos set situacao = p_situacao, motivo_situacao = p_motivo
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.recurso_produtivo_situacao_alterada', 'recurso_produtivo', p_id, p_motivo,
    jsonb_build_object('situacao', p_situacao)
  );
end;
$function$
;


CREATE OR REPLACE FUNCTION public.desativar_recurso_produtivo(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
begin
  update public.recursos_produtivos set ativo = false where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_desativado', 'recurso_produtivo', p_id, null, null);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.alocar_recurso_operacao(p_op_lote_operacao_id uuid, p_recurso_produtivo_id uuid, p_quantidade numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
  v_operacao public.op_lote_operacoes;
  v_ja_alocado numeric;
  v_id uuid;
begin
  if p_recurso_produtivo_id is null then
    raise exception 'Recurso é obrigatório.';
  end if;
  if not exists (select 1 from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select * into v_operacao from public.op_lote_operacoes
  where id = p_op_lote_operacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;

  select coalesce(sum(quantidade_alocada), 0) into v_ja_alocado
  from public.op_lote_operacao_recursos where op_lote_operacao_id = p_op_lote_operacao_id;

  if v_ja_alocado + p_quantidade > v_operacao.quantidade_planejada then
    raise exception 'Quantidade alocada (%) somada à já alocada (%) excede o planejado da operação (%).',
      p_quantidade, v_ja_alocado, v_operacao.quantidade_planejada;
  end if;

  insert into public.op_lote_operacao_recursos (company_id, op_lote_operacao_id, recurso_produtivo_id, quantidade_alocada)
  values (v_company_id, p_op_lote_operacao_id, p_recurso_produtivo_id, p_quantidade)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.recurso_alocado', 'op_lote_operacao', p_op_lote_operacao_id, null,
    jsonb_build_object('op_lote_operacao_recurso_id', v_id, 'recurso_produtivo_id', p_recurso_produtivo_id, 'quantidade', p_quantidade)
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.transferir_recurso_operacao(p_op_lote_operacao_recurso_id uuid, p_recurso_produtivo_destino_id uuid, p_quantidade numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
  v_origem public.op_lote_operacao_recursos;
  v_destino public.op_lote_operacao_recursos;
  v_saldo numeric;
  v_id uuid;
begin
  if p_recurso_produtivo_destino_id is null then
    raise exception 'Recurso de destino é obrigatório.';
  end if;
  if not exists (select 1 from public.recursos_produtivos where id = p_recurso_produtivo_destino_id and company_id = v_company_id) then
    raise exception 'Recurso produtivo de destino não encontrado nesta empresa.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select * into v_origem from public.op_lote_operacao_recursos
  where id = p_op_lote_operacao_recurso_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Recurso de origem não encontrado nesta empresa.';
  end if;

  v_saldo := v_origem.quantidade_alocada - v_origem.quantidade_produzida;
  if p_quantidade > v_saldo then
    raise exception 'Quantidade a transferir (%) excede o saldo do recurso de origem (%).', p_quantidade, v_saldo;
  end if;

  update public.op_lote_operacao_recursos set
    quantidade_alocada = quantidade_alocada - p_quantidade,
    status = case
      when quantidade_produzida = 0 then status
      when quantidade_produzida >= quantidade_alocada - p_quantidade then 'concluida'
      else 'em_andamento'
    end
  where id = p_op_lote_operacao_recurso_id;

  select * into v_destino from public.op_lote_operacao_recursos
  where op_lote_operacao_id = v_origem.op_lote_operacao_id and recurso_produtivo_id = p_recurso_produtivo_destino_id and company_id = v_company_id
  for update;

  if found then
    update public.op_lote_operacao_recursos set
      quantidade_alocada = quantidade_alocada + p_quantidade,
      status = case
        when quantidade_produzida = 0 then status
        when quantidade_produzida >= quantidade_alocada + p_quantidade then 'concluida'
        else 'em_andamento'
      end
    where id = v_destino.id;
    v_id := v_destino.id;
  else
    insert into public.op_lote_operacao_recursos (
      company_id, op_lote_operacao_id, recurso_produtivo_id, quantidade_alocada, transferido_de_id
    ) values (
      v_company_id, v_origem.op_lote_operacao_id, p_recurso_produtivo_destino_id, p_quantidade, p_op_lote_operacao_recurso_id
    ) returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.recurso_transferido', 'op_lote_operacao_recurso', p_op_lote_operacao_recurso_id, null,
    jsonb_build_object(
      'origem_id', p_op_lote_operacao_recurso_id, 'destino_id', v_id, 'quantidade', p_quantidade,
      'recurso_produtivo_destino_id', p_recurso_produtivo_destino_id
    )
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.criar_recurso_produtivo(p_codigo text, p_nome text, p_tipo text, p_setor text DEFAULT NULL::text, p_capacidade_horas_dia numeric DEFAULT NULL::numeric, p_localizacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  insert into public.recursos_produtivos (company_id, codigo, nome, tipo, setor, capacidade_horas_dia, localizacao)
  values (v_company_id, btrim(p_codigo), btrim(p_nome), p_tipo, p_setor, p_capacidade_horas_dia, p_localizacao)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_criado', 'recurso_produtivo', v_id, p_nome, jsonb_build_object('tipo', p_tipo));

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.editar_recurso_produtivo(p_id uuid, p_nome text, p_setor text DEFAULT NULL::text, p_capacidade_horas_dia numeric DEFAULT NULL::numeric, p_localizacao text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do recurso é obrigatório.';
  end if;
  if p_capacidade_horas_dia is not null and p_capacidade_horas_dia <= 0 then
    raise exception 'Capacidade em horas/dia deve ser maior que zero.';
  end if;

  update public.recursos_produtivos set
    nome = btrim(p_nome), setor = p_setor, capacidade_horas_dia = p_capacidade_horas_dia, localizacao = p_localizacao
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_editado', 'recurso_produtivo', p_id, p_nome, null);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.programar_manutencao_preventiva(p_recurso_produtivo_id uuid, p_tipo text, p_proxima_data date, p_periodicidade_dias integer DEFAULT NULL::integer, p_duracao_estimada_horas numeric DEFAULT NULL::numeric, p_responsavel_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
  v_id uuid;
begin
  if p_tipo is null or btrim(p_tipo) = '' then
    raise exception 'Tipo de manutenção é obrigatório.';
  end if;
  if p_proxima_data is null then
    raise exception 'Próxima data é obrigatória.';
  end if;
  if p_periodicidade_dias is not null and p_periodicidade_dias <= 0 then
    raise exception 'Periodicidade deve ser maior que zero.';
  end if;
  if p_duracao_estimada_horas is not null and p_duracao_estimada_horas <= 0 then
    raise exception 'Duração estimada deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;
  if p_responsavel_id is not null and not exists (select 1 from public.profiles where id = p_responsavel_id and company_id = v_company_id) then
    raise exception 'Responsável não encontrado nesta empresa.';
  end if;

  insert into public.manutencoes_preventivas (
    company_id, recurso_produtivo_id, tipo, periodicidade_dias, proxima_data, duracao_estimada_horas, responsavel_id
  ) values (
    v_company_id, p_recurso_produtivo_id, btrim(p_tipo), p_periodicidade_dias, p_proxima_data, p_duracao_estimada_horas, p_responsavel_id
  ) returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.manutencao_preventiva_programada', 'recurso_produtivo', p_recurso_produtivo_id, p_tipo,
    jsonb_build_object('manutencao_preventiva_id', v_id, 'proxima_data', p_proxima_data)
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.editar_manutencao_preventiva(p_id uuid, p_proxima_data date, p_periodicidade_dias integer DEFAULT NULL::integer, p_duracao_estimada_horas numeric DEFAULT NULL::numeric, p_responsavel_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['planejar', 'manage']);
begin
  if p_proxima_data is null then
    raise exception 'Próxima data é obrigatória.';
  end if;
  if p_periodicidade_dias is not null and p_periodicidade_dias <= 0 then
    raise exception 'Periodicidade deve ser maior que zero.';
  end if;
  if p_duracao_estimada_horas is not null and p_duracao_estimada_horas <= 0 then
    raise exception 'Duração estimada deve ser maior que zero.';
  end if;
  if p_responsavel_id is not null and not exists (select 1 from public.profiles where id = p_responsavel_id and company_id = v_company_id) then
    raise exception 'Responsável não encontrado nesta empresa.';
  end if;

  update public.manutencoes_preventivas set
    proxima_data = p_proxima_data, periodicidade_dias = p_periodicidade_dias,
    duracao_estimada_horas = p_duracao_estimada_horas, responsavel_id = p_responsavel_id
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Manutenção preventiva não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.manutencao_preventiva_editada', 'manutencao_preventiva', p_id, null,
    jsonb_build_object('proxima_data', p_proxima_data)
  );
end;
$function$
;


CREATE OR REPLACE FUNCTION public.adicionar_operacao_roteiro(p_roteiro_id uuid, p_sequencia integer, p_descricao text, p_recurso_produtivo_id uuid DEFAULT NULL::uuid, p_tempo_previsto_minutos numeric DEFAULT NULL::numeric, p_requisitos text DEFAULT NULL::text, p_criterios_qualidade text DEFAULT NULL::text, p_equipamentos_alternativos text DEFAULT NULL::text, p_perfil text DEFAULT NULL::text, p_ferramenta text DEFAULT NULL::text, p_processo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
  v_id uuid;
begin
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição da operação é obrigatória.';
  end if;
  if p_sequencia is null or p_sequencia <= 0 then
    raise exception 'Sequência deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.roteiros_produtivos where id = p_roteiro_id and company_id = v_company_id) then
    raise exception 'Roteiro não encontrado nesta empresa.';
  end if;
  if p_recurso_produtivo_id is not null and not exists (
    select 1 from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id
  ) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.roteiro_operacoes (
    company_id, roteiro_id, sequencia, descricao, recurso_produtivo_id,
    tempo_previsto_minutos, requisitos, criterios_qualidade, equipamentos_alternativos,
    perfil, ferramenta, processo
  ) values (
    v_company_id, p_roteiro_id, p_sequencia, btrim(p_descricao), p_recurso_produtivo_id,
    p_tempo_previsto_minutos, p_requisitos, p_criterios_qualidade, p_equipamentos_alternativos,
    p_perfil, p_ferramenta, p_processo
  ) returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.operacao_roteiro_adicionada', 'roteiro_produtivo', p_roteiro_id, p_descricao,
    jsonb_build_object('roteiro_operacao_id', v_id, 'sequencia', p_sequencia)
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.definir_peso_sequenciamento(p_criterio text, p_peso numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
begin
  if p_criterio not in ('prazo', 'prioridade', 'setup_compartilhado') then
    raise exception 'Critério inválido: %.', p_criterio;
  end if;
  if p_peso is null or p_peso < 0 then
    raise exception 'Peso deve ser maior ou igual a zero.';
  end if;

  insert into public.sequenciamento_pesos (company_id, criterio, peso)
  values (v_company_id, p_criterio, p_peso)
  on conflict (company_id, criterio) do update set peso = excluded.peso;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.peso_sequenciamento_definido', 'sequenciamento_pesos', null, p_criterio,
    jsonb_build_object('criterio', p_criterio, 'peso', p_peso)
  );
end;
$function$
;


CREATE OR REPLACE FUNCTION public.criar_horizonte_programacao(p_tipo text, p_data_inicio date, p_data_fim date, p_motivo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
  v_id uuid;
begin
  if p_tipo not in ('longo_prazo', 'flexivel', 'congelado') then
    raise exception 'Tipo de horizonte inválido: %.', p_tipo;
  end if;
  if p_data_inicio is null or p_data_fim is null then
    raise exception 'Data de início e fim são obrigatórias.';
  end if;
  if p_data_fim < p_data_inicio then
    raise exception 'Data de fim (%) não pode ser anterior à de início (%).', p_data_fim, p_data_inicio;
  end if;

  insert into public.producao_horizontes (company_id, tipo, data_inicio, data_fim, motivo, criado_por)
  values (v_company_id, p_tipo, p_data_inicio, p_data_fim, p_motivo, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.horizonte_criado', 'producao_horizonte', v_id, p_motivo,
    jsonb_build_object('tipo', p_tipo, 'data_inicio', p_data_inicio, 'data_fim', p_data_fim)
  );

  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.definir_rotulo_status_producao(p_campo text, p_valor_interno text, p_rotulo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid := public.assert_tenant_write_any('producao', array['configurar', 'manage']);
  v_id uuid;
begin
  if btrim(coalesce(p_rotulo, '')) = '' then
    raise exception 'Rótulo não pode ser vazio.';
  end if;

  insert into public.producao_status_labels (company_id, campo, valor_interno, rotulo)
  values (v_company_id, p_campo, p_valor_interno, btrim(p_rotulo))
  on conflict (company_id, campo, valor_interno) do update
    set rotulo = excluded.rotulo
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.rotulo_status_definido', 'producao_status_labels', v_id, p_rotulo,
    jsonb_build_object('campo', p_campo, 'valor_interno', p_valor_interno)
  );

  return v_id;
end;
$function$
;


-- =========================================================================
-- next_document_number() — corpo idêntico ao anterior, só o branch
-- 'ordem_producao' passa a aceitar 'planejar' OU 'manage'.
-- =========================================================================

create or replace function public.next_document_number(p_document_type text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_row public.numbering_sequences%rowtype;
  v_period_key text;
  v_number text;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  if p_document_type = 'orcamento' then
    if not public.has_permission('orcamentos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de orçamento (orcamentos.manage).';
    end if;
  elsif p_document_type = 'pedido' then
    if not public.has_permission('pedidos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de pedido (pedidos.manage).';
    end if;
  elsif p_document_type = 'ordem_producao' then
    if not (public.has_permission('producao', 'planejar') or public.has_permission('producao', 'manage')) then
      raise exception 'Sem permissão para emitir numeração de ordem de produção (producao.planejar ou producao.manage).';
    end if;
  elsif p_document_type = 'expedicao' then
    if not public.has_permission('expedicao', 'manage') then
      raise exception 'Sem permissão para emitir numeração de expedição (expedicao.manage).';
    end if;
  elsif p_document_type = 'instalacao' then
    if not public.has_permission('instalacao', 'manage') then
      raise exception 'Sem permissão para emitir numeração de instalação (instalacao.manage).';
    end if;
  elsif p_document_type = 'titulo_financeiro' then
    if not public.has_permission('financeiro', 'manage') then
      raise exception 'Sem permissão para emitir numeração de título financeiro (financeiro.manage).';
    end if;
  else
    raise exception 'Tipo de documento desconhecido: "%".', p_document_type;
  end if;

  perform public.assert_company_not_suspended();

  select * into v_row from public.numbering_sequences
  where company_id = v_company_id and document_type = p_document_type
  for update;

  if not found then
    raise exception 'Sequência de numeração não configurada para "%".', p_document_type;
  end if;

  v_period_key := case v_row.reinicio
    when 'anual' then to_char(now(), 'YYYY')
    when 'mensal' then to_char(now(), 'YYYY-MM')
    else ''
  end;

  if v_period_key is distinct from v_row.current_period_key then
    v_row.current_value := 0;
  end if;

  v_row.current_value := v_row.current_value + 1;

  update public.numbering_sequences
  set current_value = v_row.current_value,
      current_period_key = v_period_key
  where id = v_row.id;

  v_number := v_row.prefixo
    || (case when v_row.incluir_ano then to_char(now(), 'YYYY') else '' end)
    || (case when v_row.incluir_mes then to_char(now(), 'MM') else '' end)
    || lpad(v_row.current_value::text, v_row.digitos, '0')
    || v_row.sufixo;

  return v_number;
end;
$$;
