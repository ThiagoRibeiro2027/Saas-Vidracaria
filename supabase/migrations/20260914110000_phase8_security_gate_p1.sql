-- Fase 8 (reaberta) — Security Gate P1: corrige SEC-005, SEC-007, SEC-009
-- (hardening estrutural) e SEC-012, da auditoria técnica de 14/09/2026.
-- Ver docs internos: plano-remediacao-auditoria.md (Fase P1).
--
-- Fora desta migration:
--   - SEC-008 já foi mitigado em 13/09/2026 (20260913210000_topico10_t3_
--     code_review_fixes.sql): next_document_number() exige has_permission()
--     para os dois document_type com consumidor real hoje (orcamento,
--     pedido). Tipos futuros continuam sem gate por decisão original de
--     T15, revisitada quando tiverem consumidor.
--   - SEC-010 (rate limiting de login/MFA/upload) depende de parâmetros de
--     política (janela, limite de tentativas, backoff) que não estão
--     definidos em nenhum ADR nem no Prompt Mestre de Segurança (item 26
--     só diz "avaliar e implementar") — decisão do responsável do produto,
--     fora do escopo desta migration.
--   - SEC-011 (enable_signup) foi feito em supabase/config.toml, não é
--     mudança de schema.

-- =========================================================================
-- SEC-007 — assert_company_not_suspended() só era chamado por
-- register_file(); upsert_pessoa/upsert_obra/upsert_item/set_pessoa_papel
-- (TÓPICO 2) ficavam de fora, permitindo cadastro/edição mesmo com empresa
-- suspensa (só o upload de arquivo era bloqueado). Mesmo texto de
-- 20260913180000_topico2_cadastros.sql, só acrescentando a chamada no
-- mesmo ponto onde register_file() já a tem (depois do gate de permissão,
-- antes de qualquer leitura/escrita de negócio).
-- =========================================================================

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

  -- Normaliza pra só dígitos antes de comparar/gravar — sem isso,
  -- "11.222.333/0001-81" e "11222333000181" não colidem no UNIQUE parcial
  -- (pessoas_company_documento_unique), e a mesma pessoa jurídica pode ser
  -- cadastrada duas vezes só por formatação diferente.
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
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'nome', p_nome, 'documento', p_documento, 'situacao', p_situacao
    ))
  );

  return v_id;
end;
$$;

create or replace function public.set_pessoa_papel(
  p_pessoa_id uuid,
  p_papel text,
  p_ativo boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pessoas', 'manage') then
    raise exception 'Sem permissão para gerenciar pessoas (pessoas.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if p_papel not in ('CLIENTE', 'FORNECEDOR') then
    raise exception 'Papel inválido: "%".', p_papel;
  end if;
  if not exists (select 1 from public.pessoas where id = p_pessoa_id and company_id = v_company_id) then
    raise exception 'Pessoa não encontrada nesta empresa.';
  end if;

  insert into public.pessoa_papeis (pessoa_id, papel, ativo)
  values (p_pessoa_id, p_papel, p_ativo)
  on conflict (pessoa_id, papel) do update
  set ativo = excluded.ativo
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.pessoa_papel_set', 'pessoa', p_pessoa_id, p_papel,
    jsonb_build_object('papel', p_papel, 'ativo', p_ativo)
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
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'pessoa_id', p_pessoa_id, 'nome', p_nome, 'situacao', p_situacao
    ))
  );

  return v_id;
end;
$$;

create or replace function public.upsert_item(
  p_id uuid,
  p_codigo text,
  p_descricao text,
  p_tipo text,
  p_classificacao text,
  p_unidade_principal text,
  p_situacao text default 'ativo'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.itens;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('itens', 'manage') then
    raise exception 'Sem permissão para gerenciar itens (itens.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if p_codigo is null or btrim(p_codigo) = '' or p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Código e descrição são obrigatórios.';
  end if;
  if p_unidade_principal is null or btrim(p_unidade_principal) = '' then
    raise exception 'Unidade principal é obrigatória.';
  end if;
  if p_tipo not in (
    'materia_prima', 'insumo', 'componente', 'produto_intermediario',
    'produto_acabado', 'material_auxiliar', 'embalagem', 'servico', 'outro'
  ) then
    raise exception 'Tipo inválido: "%".', p_tipo;
  end if;
  if p_situacao not in ('ativo', 'inativo') then
    raise exception 'Situação inválida: "%".', p_situacao;
  end if;

  if p_id is not null then
    select * into v_before from public.itens
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Item não encontrado nesta empresa.';
    end if;

    update public.itens set
      codigo = p_codigo, descricao = p_descricao, tipo = p_tipo,
      classificacao = p_classificacao, unidade_principal = p_unidade_principal,
      situacao = p_situacao
    where id = p_id
    returning id into v_id;
  else
    insert into public.itens (company_id, codigo, descricao, tipo, classificacao, unidade_principal, situacao)
    values (v_company_id, p_codigo, p_descricao, p_tipo, p_classificacao, p_unidade_principal, p_situacao)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.item_upserted', 'item', v_id, p_codigo,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'codigo', p_codigo, 'tipo', p_tipo, 'classificacao', p_classificacao, 'situacao', p_situacao
    ))
  );

  return v_id;
end;
$$;

-- =========================================================================
-- SEC-009 — RBAC não validava estruturalmente que o papel atribuído
-- pertence ao mesmo tenant do usuário. Hoje não existe nenhuma via de
-- escrita em user_roles exposta a authenticated (só service role, a partir
-- do servidor Next.js — a tela de atribuir papel do TÓPICO 14 ainda não foi
-- construída), então isto é hardening estrutural preventivo, não a
-- correção de um bypass já explorável hoje: quando esse fluxo existir,
-- este trigger garante a invariante independente do que o código da
-- aplicação faça. Roles globais (company_id nulo, os templates de
-- seed.sql) continuam válidos para qualquer empresa — mesma regra já usada
-- em roles_select/role_permissions_select/user_roles_select.
-- =========================================================================

create or replace function public.validate_user_role_tenant()
returns trigger
language plpgsql set search_path = public as $$
declare
  v_role_company_id uuid;
  v_profile_company_id uuid;
begin
  select company_id into v_role_company_id from public.roles where id = new.role_id;
  select company_id into v_profile_company_id from public.profiles where id = new.profile_id;

  if v_role_company_id is not null and v_role_company_id is distinct from v_profile_company_id then
    raise exception 'SEC-009: o papel atribuído pertence a outra empresa (role.company_id = %, profile.company_id = %).',
      v_role_company_id, v_profile_company_id;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_user_role_tenant on public.user_roles;
create trigger validate_user_role_tenant
  before insert or update on public.user_roles
  for each row execute function public.validate_user_role_tenant();

-- =========================================================================
-- SEC-012 — Quota de Storage era só monitorada (company_usage()), nunca
-- aplicada: um tenant podia consumir Storage indefinidamente. register_file()
-- passa a bloquear quando o novo arquivo estouraria max_storage_bytes do
-- plano. Empresa sem plano/assinatura (max_storage_bytes nulo) continua sem
-- limite — mesma semântica de "sem plano = sem teto" que company_usage()
-- já usa (LEFT JOIN, decisão original da Fase 6: "tenants de script de
-- teste" não devem quebrar por não terem assinatura).
-- =========================================================================

create or replace function public.register_file(
  p_entity_type text,
  p_entity_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_width integer default null,
  p_height integer default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_id uuid;
  v_max_storage_bytes bigint;
  v_current_usage bigint;
begin
  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada não pode registrar arquivos.';
  end if;
  if not public.has_permission('files', 'upload') then
    raise exception 'Sem permissão para enviar arquivos.';
  end if;
  perform public.assert_company_not_suspended();
  if split_part(p_storage_path, '/', 1) <> v_company_id::text then
    raise exception 'Caminho de armazenamento fora do escopo da empresa.';
  end if;

  select p.max_storage_bytes into v_max_storage_bytes
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.company_id = v_company_id;

  if v_max_storage_bytes is not null then
    select coalesce(sum(size_bytes), 0) into v_current_usage
    from public.files
    where company_id = v_company_id and deleted_at is null;

    if v_current_usage + p_size_bytes > v_max_storage_bytes then
      raise exception 'Limite de armazenamento do plano excedido (% de % bytes já em uso).',
        v_current_usage, v_max_storage_bytes;
    end if;
  end if;

  insert into public.files (
    company_id, uploaded_by, entity_type, entity_id, storage_path,
    original_name, mime_type, size_bytes, width, height
  ) values (
    v_company_id, auth.uid(), p_entity_type, p_entity_id, p_storage_path,
    p_original_name, p_mime_type, p_size_bytes, p_width, p_height
  ) returning id into v_id;

  perform public.log_activity(
    'file.upload', 'file', v_id, p_original_name,
    jsonb_build_object('mime_type', p_mime_type, 'size_bytes', p_size_bytes)
  );

  return v_id;
end;
$$;

-- =========================================================================
-- SEC-005 — log_activity() é a única via de escrita em activity_logs, mas
-- era exposta inteira (qualquer `action`) a `authenticated` — um usuário
-- podia fabricar um evento como "admin.granted"/"permission.changed" sem a
-- operação real ter acontecido. Toda função de negócio já chama
-- log_activity() internamente (não muda: chamada de dentro de uma
-- SECURITY DEFINER não depende de GRANT, só o dono da função precisa
-- poder executá-la, e o dono é o mesmo em todas as funções deste schema).
--
-- O que muda: log_activity() deixa de ser chamável diretamente por
-- `authenticated`; log_client_event() — nova função, granted a
-- `authenticated` — passa a ser o único ponto de entrada direto do
-- cliente, e só aceita a lista fechada de eventos que hoje são reportados
-- pelo próprio Next.js sem passar por uma função de negócio (login/logout/
-- MFA/export — auth.mfa_enrolled, auth.mfa_verified, auth.login_success,
-- auth.logout, governance.data_exported; ver src/app/mfa/**/actions.ts,
-- src/app/export/actions.ts, src/app/login/actions.ts). O prefixo
-- "test.%" fica liberado deliberadamente para as suítes automatizadas
-- (scripts/test-*.mjs) seedarem linhas de teste sem precisar de uma
-- função de negócio por cenário — nenhuma ação real do produto usa esse
-- prefixo, então não abre nenhum caminho pra fabricar um evento sensível.
-- =========================================================================

create or replace function public.log_client_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_description text default null,
  p_metadata jsonb default null,
  p_ip_address inet default null,
  p_user_agent text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not (
    p_action = any(array[
      'auth.mfa_enrolled', 'auth.mfa_verified', 'auth.login_success',
      'auth.logout', 'governance.data_exported'
    ])
    or p_action like 'test.%'
  ) then
    raise exception 'SEC-005: ação de auditoria "%" não pode ser reportada diretamente pelo cliente — eventos de negócio são gerados automaticamente pela função que executa a operação.', p_action;
  end if;

  return public.log_activity(
    p_action, p_entity_type, p_entity_id, p_description, p_metadata, p_ip_address, p_user_agent
  );
end;
$$;

grant execute on function public.log_client_event(text, text, uuid, text, jsonb, inet, text) to authenticated;

do $$
declare
  v_oid oid;
begin
  select p.oid into v_oid from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'log_activity';

  if v_oid is null then
    raise exception 'SEC-005: função public.log_activity não encontrada.';
  end if;

  execute format('revoke execute on function %s from authenticated', v_oid::regprocedure);
end $$;
