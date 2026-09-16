-- Auditoria 2 (Mapa_Fases_Lacunas_Risco.md, 15/09/2026) — bloco P1,
-- aprovado pelo responsável do produto na sequência do bloco P0
-- (20260915020000_auditoria_15092026_p0.sql). Fecha F01 (residual), F03,
-- F11, F12, F23 e F24. F10 (paginação de exportação), F16 (política de
-- senha) e F17 (limites de imagem) são só app-layer/config — sem mudança
-- de schema, ver respectivos arquivos em src/ e supabase/config.toml.

-- =========================================================================
-- F03 — soft-delete de arquivo não impedia acesso lógico: files_select
-- não checava deleted_at, então getSignedUrlAction() (src/app/files/
-- actions.ts) continuava gerando signed URL pra um arquivo já "removido".
-- O objeto físico permanece no Storage (purge físico é decisão futura,
-- fora deste escopo — Mapa §11); aqui só fechamos o acesso lógico.
-- =========================================================================

drop policy if exists files_select on public.files;
create policy files_select on public.files for select
  using (
    deleted_at is null
    and (
      (company_id = (select public.current_company_id()) and (select public.has_permission('files', 'read')))
      or (select public.is_platform_admin_mfa_verified())
    )
  );

-- =========================================================================
-- F12 — profiles.company_id precisa ser estruturalmente imutável. Hoje
-- nenhum fluxo administrativo troca a empresa de um usuário (T14/T17 nem
-- existem ainda), mas nada no banco impede uma escrita futura (ou um
-- UPDATE em massa por engano) de mover um profile de tenant sem reconciliar
-- roles/permissões — quebrando o isolamento que profiles.company_id
-- sustenta em cascata (current_company_id(), toda RLS de tenant). Trigger
-- bloqueia a mudança agora; um fluxo administrativo de transferência real
-- (com revogação/reconciliação de papéis) fica para quando for definido em
-- ADR, e pode desabilitar o trigger explicitamente na própria migration
-- que o implementar.
-- =========================================================================

create or replace function public.prevent_profile_company_change()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'profiles.company_id é imutável (Mapa_Fases_Lacunas_Risco.md F12): não há fluxo administrativo de transferência de usuário entre empresas definido em ADR. Se este UPDATE é intencional, revise a regra antes de prosseguir.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_company_id_immutable on public.profiles;
create trigger profiles_company_id_immutable
before update on public.profiles
for each row execute function public.prevent_profile_company_change();

-- =========================================================================
-- F11 — minimização de PII em snapshot de auditoria. upsert_pessoa()/
-- upsert_obra() gravavam to_jsonb(v_before) inteiro em activity_logs.
-- metadata a cada edição — documento (CPF/CNPJ), telefone, email e
-- endereço completo da pessoa anterior ficavam preservados indefinidamente
-- dentro do log de auditoria, além do que a rastreabilidade de negócio
-- exige (ADR-010 — minimização). audit_changed_fields() troca o snapshot
-- de valores por só os nomes dos campos alterados (ex.: {"changed":
-- ["telefone","email"]}); em criação (v_before nulo), todos os campos
-- fornecidos entram como "changed" — não há "antes" pra comparar.
-- =========================================================================

create or replace function public.audit_changed_fields(v_before jsonb, v_after jsonb)
returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(a.key order by a.key), array[]::text[])
  from jsonb_each(v_after) a
  where v_before is null or (a.value is distinct from (v_before -> a.key));
$$;

create or replace function public.upsert_pessoa(
  p_id uuid,
  p_tipo_documento text,
  p_documento text,
  p_nome text,
  p_nome_fantasia text,
  p_telefone text,
  p_email text,
  p_logradouro text,
  p_cidade text,
  p_uf text,
  p_cep text,
  p_situacao text default 'ativo'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.pessoas;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pessoas', 'manage') then
    raise exception 'Sem permissão para gerenciar pessoas (pessoas.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome é obrigatório.';
  end if;
  if p_situacao not in ('ativo', 'inativo', 'bloqueado') then
    raise exception 'Situação inválida: "%".', p_situacao;
  end if;

  if p_documento is not null then
    p_documento := nullif(regexp_replace(p_documento, '\D', '', 'g'), '');
  end if;

  if p_id is not null then
    select * into v_before from public.pessoas
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Pessoa não encontrada nesta empresa.';
    end if;

    update public.pessoas set
      tipo_documento = p_tipo_documento, documento = p_documento, nome = p_nome,
      nome_fantasia = p_nome_fantasia, telefone = p_telefone, email = p_email,
      logradouro = p_logradouro, cidade = p_cidade, uf = p_uf, cep = p_cep,
      situacao = p_situacao
    where id = p_id
    returning id into v_id;
  else
    insert into public.pessoas (
      company_id, tipo_documento, documento, nome, nome_fantasia, telefone,
      email, logradouro, cidade, uf, cep, situacao
    ) values (
      v_company_id, p_tipo_documento, p_documento, p_nome, p_nome_fantasia, p_telefone,
      p_email, p_logradouro, p_cidade, p_uf, p_cep, p_situacao
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.pessoa_upserted', 'pessoa', v_id, p_nome,
    jsonb_build_object(
      'changed', public.audit_changed_fields(
        case when v_before.id is null then null else to_jsonb(v_before) end,
        jsonb_build_object(
          'tipo_documento', p_tipo_documento, 'documento', p_documento, 'nome', p_nome,
          'nome_fantasia', p_nome_fantasia, 'telefone', p_telefone, 'email', p_email,
          'logradouro', p_logradouro, 'cidade', p_cidade, 'uf', p_uf, 'cep', p_cep,
          'situacao', p_situacao
        )
      )
    )
  );

  return v_id;
end;
$$;

create or replace function public.upsert_obra(
  p_id uuid,
  p_pessoa_id uuid,
  p_nome text,
  p_logradouro text,
  p_cidade text,
  p_uf text,
  p_cep text,
  p_situacao text default 'ativo'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.obras;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('obras', 'manage') then
    raise exception 'Sem permissão para gerenciar obras (obras.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome da obra é obrigatório.';
  end if;
  if p_situacao not in ('ativo', 'inativo') then
    raise exception 'Situação inválida: "%".', p_situacao;
  end if;
  if not exists (
    select 1 from public.pessoas p
    join public.pessoa_papeis pp on pp.pessoa_id = p.id
    where p.id = p_pessoa_id and p.company_id = v_company_id
      and pp.papel = 'CLIENTE' and pp.ativo
  ) then
    raise exception 'A pessoa vinculada à obra precisa ter o papel CLIENTE ativo.';
  end if;

  if p_id is not null then
    select * into v_before from public.obras
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Obra não encontrada nesta empresa.';
    end if;

    update public.obras set
      pessoa_id = p_pessoa_id, nome = p_nome, logradouro = p_logradouro,
      cidade = p_cidade, uf = p_uf, cep = p_cep, situacao = p_situacao
    where id = p_id
    returning id into v_id;
  else
    insert into public.obras (company_id, pessoa_id, nome, logradouro, cidade, uf, cep, situacao)
    values (v_company_id, p_pessoa_id, p_nome, p_logradouro, p_cidade, p_uf, p_cep, p_situacao)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.obra_upserted', 'obra', v_id, p_nome,
    jsonb_build_object(
      'changed', public.audit_changed_fields(
        case when v_before.id is null then null else to_jsonb(v_before) end,
        jsonb_build_object(
          'pessoa_id', p_pessoa_id, 'nome', p_nome, 'logradouro', p_logradouro,
          'cidade', p_cidade, 'uf', p_uf, 'cep', p_cep, 'situacao', p_situacao
        )
      )
    )
  );

  return v_id;
end;
$$;

-- =========================================================================
-- F01 (residual) — a RLS de storage.objects (SEC-002/003, já fechada em
-- phase8_security_gate_p0.sql) exige tenant + has_permission('files',
-- 'upload'), mas isso não fecha o segundo caminho que o Mapa aponta: um
-- upload feito direto na Data API (sem passar por src/lib/storage/
-- upload.ts) nunca chama register_file(), então o objeto físico existe
-- sem metadado — fora da quota (F02), sem o pipeline de validação de bytes
-- (fileValidation.ts) e sem entrada em activity_logs. RLS não consegue
-- inspecionar o conteúdo do arquivo pra bloquear isso na hora do INSERT;
-- o fechamento estrutural possível hoje é reconciliação periódica: todo
-- objeto do bucket sem public.files correspondente depois de uma janela de
-- tolerância é órfão (upload nunca legitimado por register_file()) e é
-- purgado. Função restrita a service_role — nunca deve ser chamada pela
-- aplicação com a sessão do usuário.
-- =========================================================================

create or replace function public.find_orphaned_storage_objects(p_older_than interval default '1 hour')
returns table (bucket_id text, name text)
language sql stable security definer set search_path = public as $$
  select o.bucket_id, o.name
  from storage.objects o
  left join public.files f
    on f.bucket_id = o.bucket_id and f.storage_path = o.name
  where o.bucket_id = 'company-files'
    and f.id is null
    and o.created_at < now() - p_older_than;
$$;

revoke all on function public.find_orphaned_storage_objects(interval) from public, anon, authenticated;
grant execute on function public.find_orphaned_storage_objects(interval) to service_role;

-- =========================================================================
-- F23 — observabilidade mínima pré-M1 (ADR-009 §5). §5.1 exige separar
-- observabilidade técnica de auditoria de negócio (activity_logs); até
-- agora só existia console.error espalhado (ex.: src/app/api/cron/
-- security-alerts/route.ts), sem registro consultável nem ponto único de
-- captura. system_events cobre o mínimo do §5.2 (falhas de storage/job) —
-- a ferramenta/alertas sofisticados do §5.5/§5.6 continuam decisão futura,
-- como o próprio ADR já previa. category é um enum fechado (item 8 do
-- CLAUDE.md: função de auditoria não aceita "action" livre sem restrição).
-- =========================================================================

create table public.system_events (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'app_error', 'auth_failure_volume', 'integration_failure',
    'storage_failure', 'job_failure'
  )),
  severity text not null default 'error' check (severity in ('info', 'warning', 'error', 'critical')),
  company_id uuid references public.companies(id),
  correlation_id uuid,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);
comment on table public.system_events is
  'ADR-009 §5.1 — observabilidade técnica (erros, falhas de storage/job/integração), nunca eventos de negócio (isso é activity_logs). §5.4: message/context nunca devem carregar segredos, tokens ou PII desnecessária ao diagnóstico — responsabilidade de quem chama log_system_event().';

create index system_events_created_at_idx on public.system_events (created_at desc);
create index system_events_company_id_idx on public.system_events (company_id) where company_id is not null;

alter table public.system_events enable row level security;

-- Só platform_admin com MFA verificado lê — é dado operacional da
-- plataforma, não um recurso de tenant (mesmo padrão de is_platform_admin_
-- mfa_verified() já usado nas demais tabelas de fundação).
create policy system_events_select on public.system_events for select
  using ((select public.is_platform_admin_mfa_verified()));

revoke all on public.system_events from anon, authenticated;
grant select on public.system_events to authenticated; -- RLS acima restringe de fato

create or replace function public.log_system_event(
  p_category text,
  p_message text,
  p_severity text default 'error',
  p_company_id uuid default null,
  p_correlation_id uuid default null,
  p_context jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.system_events (category, severity, company_id, correlation_id, message, context)
  values (p_category, p_severity, p_company_id, p_correlation_id, p_message, p_context)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.log_system_event(text, text, text, uuid, uuid, jsonb) to authenticated;

-- =========================================================================
-- F24 — support-access de platform_admin precisa de trilha antes de uso
-- real. is_platform_admin_mfa_verified() (phase8_security_gate_p0.sql) já
-- exige AAL2 pra exercer o bypass cross-tenant nas policies de leitura
-- (companies/company_units/profiles/roles/activity_logs/subscriptions/
-- files) — o que faltava era registrar QUANDO esse bypass é efetivamente
-- exercido. Redesenhar as duas telas de admin (Fase 4 Auditoria, Fase 6
-- Governança) pra exigir uma justificativa por empresa antes de cada
-- acesso mudaria comportamento já aprovado dessas fases (hoje são painéis
-- cross-tenant por natureza, sem conceito de "sessão por empresa") — fica
-- como decisão de produto em aberto. O que dá pra fechar agora sem
-- redesenho: uma trilha de acesso sempre que a visão cross-tenant é
-- carregada.
-- =========================================================================

create or replace function public.log_platform_admin_access(p_view text, p_context jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin_mfa_verified() then
    raise exception 'Apenas platform_admin com MFA verificado pode registrar acesso de suporte.';
  end if;
  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (null, auth.uid(), 'platform.support_access', 'platform_admin_view', null, p_view, p_context);
end;
$$;

grant execute on function public.log_platform_admin_access(text, jsonb) to authenticated;
