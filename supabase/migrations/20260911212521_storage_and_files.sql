-- Fase 3 — Storage e Arquivos
-- Prompt Mestre de Segurança itens 19-22: bucket privado, metadados fora
-- do PostgreSQL binário, autorização por tenant e auditoria de upload.
-- Nenhuma regra de negócio de módulo (Tópicos 2-14) entra aqui — apenas a
-- infraestrutura genérica de arquivo, associável a qualquer entidade futura
-- via (entity_type, entity_id), no mesmo padrão já usado por activity_logs.

-- =========================================================================
-- 1. BUCKET PRIVADO (item 19/20 — nunca público, nunca binário no Postgres)
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-files',
  'company-files',
  false,
  20971520, -- 20 MiB — limite técnico de proteção contra abuso (item 21/25); revisar por plano na Fase 6
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- =========================================================================
-- 2. METADADOS (Postgres → metadados; Storage → arquivo físico, item 19)
-- =========================================================================

create table public.files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  uploaded_by uuid not null references auth.users(id),
  entity_type text not null,
  entity_id uuid,
  bucket_id text not null default 'company-files',
  storage_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint files_storage_path_unique unique (bucket_id, storage_path)
);
comment on table public.files is
  'Metadados de arquivos do Storage privado. O binário nunca entra no Postgres (Prompt Mestre item 19). Ligação com entidades de negócio (pedido, projeto, etc.) via entity_type/entity_id, seguindo o mesmo padrão de activity_logs, pois nenhuma dessas entidades existe ainda nesta fase.';

create index files_company_entity_idx on public.files (company_id, entity_type, entity_id) where deleted_at is null;

-- =========================================================================
-- 3. FUNÇÕES — única via de escrita, company_id/uploaded_by sempre
--    derivados do servidor (auth.uid()), nunca aceitos como parâmetro
--    (Prompt Mestre item 4/15: nunca confiar em dado vindo do cliente).
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
begin
  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada não pode registrar arquivos.';
  end if;
  if not public.has_permission('files', 'upload') then
    raise exception 'Sem permissão para enviar arquivos.';
  end if;
  -- O chamador já fez o upload físico (respeitando a RLS de storage.objects,
  -- que também exige este prefixo); aqui confirmamos que o caminho registrado
  -- realmente pertence ao tenant do usuário autenticado antes de gravar.
  if split_part(p_storage_path, '/', 1) <> v_company_id::text then
    raise exception 'Caminho de armazenamento fora do escopo da empresa.';
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

-- Soft delete (item 16): mantém o objeto no Storage para eventual
-- restauração; apenas oculta o metadado das listagens da aplicação.
create or replace function public.delete_file(p_file_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if not public.has_permission('files', 'delete') then
    raise exception 'Sem permissão para remover arquivos.';
  end if;

  update public.files
  set deleted_at = now(), deleted_by = auth.uid()
  where id = p_file_id
    and company_id = v_company_id
    and deleted_at is null;

  if not found then
    raise exception 'Arquivo não encontrado nesta empresa.';
  end if;

  perform public.log_activity('file.delete', 'file', p_file_id);
end;
$$;

-- =========================================================================
-- 4. RLS — public.files (mesmo padrão de activity_logs)
-- =========================================================================

alter table public.files enable row level security;

create policy files_select on public.files for select
  using (
    (company_id = public.current_company_id() and public.has_permission('files', 'read'))
    or public.is_platform_admin()
  );

-- Nenhuma policy de INSERT/UPDATE/DELETE para `authenticated`: toda escrita
-- passa por register_file()/delete_file() (SECURITY DEFINER acima).

revoke all on public.files from anon, authenticated;
grant select on public.files to authenticated;
grant execute on function public.register_file(text, uuid, text, text, text, bigint, integer, integer) to authenticated;
grant execute on function public.delete_file(uuid) to authenticated;

-- =========================================================================
-- 5. RLS — storage.objects, isolamento por prefixo company_id (item 20)
--    Aplica-se somente ao bucket company-files; outros buckets futuros
--    (se houver) precisarão de suas próprias policies.
-- =========================================================================

create policy company_files_select on storage.objects for select
  using (
    bucket_id = 'company-files'
    and (
      public.is_platform_admin() -- suporte, só leitura (item 552: acesso de suporte é auditável à parte)
      or (storage.foldername(name))[1] = public.current_company_id()::text
    )
  );

create policy company_files_insert on storage.objects for insert
  with check (
    bucket_id = 'company-files'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy company_files_delete on storage.objects for delete
  using (
    bucket_id = 'company-files'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );
