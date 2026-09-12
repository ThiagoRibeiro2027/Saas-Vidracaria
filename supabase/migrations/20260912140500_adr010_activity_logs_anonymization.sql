-- ADR-010 — Proteção de Dados Pessoais e LGPD, §6: um pedido de exclusão de
-- titular não apaga a trilha de auditoria; os campos pessoais do titular
-- (identificação, e-mail, IP, user agent) são anonimizados de forma
-- irreversível, por procedimento próprio, restrito e auditado.
--
-- Isso exige ajustar deliberadamente o trigger activity_logs_immutable
-- (criado na Fase 4, 20260911231124_audit_events.sql), que hoje bloqueia
-- UPDATE/DELETE para qualquer role sem exceção — o próprio comentário
-- daquela migration já previa este ajuste: "se uma política de retenção
-- precisar de expurgo controlado no futuro, ela deverá remover/ajustar este
-- trigger de forma deliberada e auditada, não contorná-lo silenciosamente".
--
-- DELETE continua bloqueado sempre, sem exceção nenhuma — anonimização é
-- UPDATE dos campos pessoais, nunca remoção da linha (ADR-010 §6: "não
-- apaga a trilha de auditoria").

alter table public.activity_logs
  add column anonymized_at timestamptz;

comment on column public.activity_logs.anonymized_at is
  'Preenchido quando os campos pessoais desta linha (user_id, ip_address, user_agent) foram anonimizados via anonymize_activity_logs_for_user() (ADR-010 §6). NULL = nunca anonimizado.';

-- =========================================================================
-- Trigger: passa a distinguir DELETE (sempre bloqueado) de UPDATE (bloqueado
-- por padrão, liberado apenas dentro do procedimento controlado de
-- anonimização, identificado por uma GUC de transação — nunca por edição
-- direta, nem por service role, nem por administrador de tenant). Mesmo
-- dentro do procedimento, o fato registrado é travado: só os campos
-- pessoais e o marcador anonymized_at podem mudar.
-- =========================================================================

create or replace function public.prevent_activity_log_mutation()
returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Logs de auditoria são imutáveis — DELETE não é permitido (Prompt Mestre item 18).';
  end if;

  if current_setting('app.activity_logs_anonymization', true) is distinct from 'on' then
    raise exception 'Logs de auditoria são imutáveis — UPDATE não é permitido fora do procedimento de anonimização (ADR-010 §6).';
  end if;

  if new.id is distinct from old.id
     or new.company_id is distinct from old.company_id
     or new.action is distinct from old.action
     or new.entity_type is distinct from old.entity_type
     or new.entity_id is distinct from old.entity_id
     or new.description is distinct from old.description
     or new.metadata is distinct from old.metadata
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Anonimização não pode alterar o fato registrado (ADR-010 §6) — apenas user_id, ip_address, user_agent e anonymized_at.';
  end if;

  return new;
end;
$$;

-- =========================================================================
-- Procedimento de anonimização — restrito a platform_admin, jamais
-- contornável por usuário comum nem por administrador de tenant (ADR-010
-- §6). Anonimiza todas as linhas de activity_logs de um titular (em
-- qualquer empresa em que tenham sido geradas), preservando o fato — o
-- quê, quando, sobre qual entidade — e registrando que a anonimização
-- ocorreu, sem reintroduzir o dado removido.
-- =========================================================================

create or replace function public.anonymize_activity_logs_for_user(
  p_user_id uuid,
  p_reason text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_company_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Apenas administradores de plataforma podem anonimizar registros de auditoria (ADR-010 §6).';
  end if;
  if p_user_id is null then
    raise exception 'Usuário alvo da anonimização é obrigatório.';
  end if;

  select company_id into v_company_id from public.profiles where id = p_user_id;

  perform set_config('app.activity_logs_anonymization', 'on', true);

  update public.activity_logs
  set user_id = null,
      ip_address = null,
      user_agent = null,
      anonymized_at = now()
  where user_id = p_user_id
    and anonymized_at is null;

  get diagnostics v_count = row_count;

  perform set_config('app.activity_logs_anonymization', 'off', true);

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'lgpd.activity_logs_anonymized', 'profile', p_user_id,
    p_reason, jsonb_build_object('rows_anonymized', v_count)
  );

  return v_count;
end;
$$;

grant execute on function public.anonymize_activity_logs_for_user(uuid, text) to authenticated;
