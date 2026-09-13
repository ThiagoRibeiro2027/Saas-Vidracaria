-- ADR-010 §6 / Security Gate Fase 8, item 2.2: fechar o gap de reidentificação
-- residual via files.uploaded_by / files.deleted_by (FK direta para
-- auth.users). Decisão registrada: não é SET NULL nem tombstone dedicado — a
-- FK continua íntegra (preserva "quem fez upload/delete"), mas passa a
-- apontar para um registro de profiles já anonimizado. O e-mail em
-- auth.users é tratado à parte, via Admin API
-- (src/lib/audit/anonymizeDataSubject.ts), porque SECURITY DEFINER em
-- PL/pgSQL não tem como chamar a API do GoTrue — só a tabela auth.users
-- teria que ser escrita direto via SQL, o que deixaria auth.identities
-- (identity_data->>'email') com o e-mail original intacto, reabrindo o mesmo
-- tipo de gap que este item resolve.

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

  -- Escurece identidade em profiles — display_name/contact_email deixam de
  -- conter dado original; login_identifier vira um valor sintético (mantém
  -- a constraint de unicidade por empresa). FKs estruturais (files.*_by
  -- inclusive) continuam apontando para este id, agora anonimizado.
  update public.profiles
  set display_name = 'Titular anonimizado',
      contact_email = null,
      login_identifier = 'anonimizado-' || p_user_id::text
  where id = p_user_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'lgpd.activity_logs_anonymized', 'profile', p_user_id,
    p_reason, jsonb_build_object('rows_anonymized', v_count, 'profile_anonymized', true)
  );

  return v_count;
end;
$$;
