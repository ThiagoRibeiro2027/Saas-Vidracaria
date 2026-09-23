-- Segunda rodada de correções do code review (T13/T17/T18/Fiscal/BI).
-- Itens de segregação de função e trava de revinculação pós-aprovação
-- (Fiscal) foram levados ao responsável do produto e mantidos como
-- estão de propósito — não são bug, ver migration 20261009000000.
-- Os três itens abaixo são fixes de verdade.

-- =========================================================================
-- 1. next_document_number() — a cada novo tipo de documento (8 vezes até
--    aqui: orcamento, proposta, pedido, ordem_producao, expedicao,
--    instalacao, titulo_financeiro, contrato) a função inteira era
--    copiada de novo com um novo `elsif`. O comentário da própria
--    migration F09 (20260915020000) já registra que esse padrão causou
--    um bug real antes ("qualquer outro tipo passava sem gate nenhum").
--    Troca o allow-list se/elsif por uma tabela de referência — adicionar
--    um tipo de documento novo no futuro vira um INSERT na tabela, não
--    uma edição desta função compartilhada por 8 módulos.
--
--    Um documento pode exigir mais de uma permissão alternativa (OR) —
--    é o caso de ordem_producao (producao.planejar OU producao.manage,
--    TÓPICO 4 §50) — por isso a chave não é (document_type), é
--    (document_type, resource, action): qualquer linha satisfeita libera.
-- =========================================================================

create table public.numbering_document_types (
  document_type text not null,
  resource text not null,
  action text not null,
  primary key (document_type, resource, action)
);
comment on table public.numbering_document_types is
  'Catálogo global (sem company_id) de qual permissão emite numeração de cada tipo de documento — next_document_number() consulta esta tabela em vez de um if/elsif fixo. Mais de uma linha pro mesmo document_type = qualquer uma das permissões libera (OR).';

alter table public.numbering_document_types enable row level security;
create policy numbering_document_types_select on public.numbering_document_types for select
  using (true); -- catálogo global, não contém dado de tenant (mesmo padrão de public.permissions)

grant select on public.numbering_document_types to authenticated;

insert into public.numbering_document_types (document_type, resource, action) values
  ('orcamento', 'orcamentos', 'manage'),
  ('proposta', 'propostas', 'manage'),
  ('pedido', 'pedidos', 'manage'),
  ('ordem_producao', 'producao', 'planejar'),
  ('ordem_producao', 'producao', 'manage'),
  ('expedicao', 'expedicao', 'manage'),
  ('instalacao', 'instalacao', 'manage'),
  ('titulo_financeiro', 'financeiro', 'manage'),
  ('contrato', 'contratos', 'manage');

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

  if not exists (select 1 from public.numbering_document_types where document_type = p_document_type) then
    raise exception 'Tipo de documento desconhecido: "%".', p_document_type;
  end if;

  if not exists (
    select 1 from public.numbering_document_types ndt
    where ndt.document_type = p_document_type and public.has_permission(ndt.resource, ndt.action)
  ) then
    raise exception 'Sem permissão para emitir numeração de "%".', p_document_type;
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

-- =========================================================================
-- 2. register_file()/files_select — anexo de documento de RH
--    (entity_type='funcionario_documento') só exigia a permissão
--    genérica files.upload/files.read, não rh.view/rh.manage — qualquer
--    pessoa com acesso a Arquivos por outro motivo (ex.: anexar arquivo
--    em pedido) conseguia anexar ou ler metadado de documento de RH
--    (nome do arquivo, ex.: "Atestado_medico.pdf") de qualquer
--    funcionário da empresa, sem nenhuma permissão de RH — vazamento de
--    metadado LGPD. Corrigido só para este entity_type específico (não
--    generaliza pra um mapeamento module-aware de todo entity_type —
--    isso mudaria comportamento de todos os módulos que usam Arquivos,
--    decisão maior que fica fora deste fix pontual).
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
  v_real_size_bytes bigint;
begin
  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada não pode registrar arquivos.';
  end if;
  if not public.has_permission('files', 'upload') then
    raise exception 'Sem permissão para enviar arquivos.';
  end if;
  if p_entity_type = 'funcionario_documento' and not public.has_permission('rh', 'manage') then
    raise exception 'Sem permissão para anexar documento de RH (rh.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if split_part(p_storage_path, '/', 1) <> v_company_id::text then
    raise exception 'Caminho de armazenamento fora do escopo da empresa.';
  end if;

  select (obj.metadata->>'size')::bigint into v_real_size_bytes
  from storage.objects obj
  where obj.bucket_id = 'company-files' and obj.name = p_storage_path;

  if v_real_size_bytes is null then
    raise exception 'Objeto não encontrado no Storage para o caminho informado — envie o arquivo antes de registrar.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));

  select p.max_storage_bytes into v_max_storage_bytes
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.company_id = v_company_id;

  if v_max_storage_bytes is not null then
    select coalesce(sum(size_bytes), 0) into v_current_usage
    from public.files
    where company_id = v_company_id and deleted_at is null;

    if v_current_usage + v_real_size_bytes > v_max_storage_bytes then
      raise exception 'Limite de armazenamento do plano excedido (% de % bytes já em uso).',
        v_current_usage, v_max_storage_bytes;
    end if;
  end if;

  insert into public.files (
    company_id, uploaded_by, entity_type, entity_id, storage_path,
    original_name, mime_type, size_bytes, width, height
  ) values (
    v_company_id, auth.uid(), p_entity_type, p_entity_id, p_storage_path,
    p_original_name, p_mime_type, v_real_size_bytes, p_width, p_height
  ) returning id into v_id;

  perform public.log_activity(
    'file.upload', 'file', v_id, p_original_name,
    jsonb_build_object('mime_type', p_mime_type, 'size_bytes', v_real_size_bytes)
  );

  return v_id;
end;
$$;

drop policy if exists files_select on public.files;
create policy files_select on public.files for select
  using (
    (
      company_id = public.current_company_id()
      and public.has_permission('files', 'read')
      and (entity_type <> 'funcionario_documento' or public.has_permission('rh', 'view'))
    )
    or public.is_platform_admin()
  );

-- =========================================================================
-- 3. ativar_contrato() — validava só status='rascunho' e data_inicio
--    preenchida; não reconferia se a pessoa vinculada ainda tem o papel
--    CLIENTE/FORNECEDOR ativo (podia ter sido desativado depois da
--    criação do rascunho) nem se o funcionário vinculado ainda existe.
--    upsert_contrato() já faz essa validação na criação/edição — repete
--    aqui no momento da ativação, mesma regra, sem inventar critério
--    novo.
-- =========================================================================

create or replace function public.ativar_contrato(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('contratos', 'manage');
  v_row public.contratos;
begin
  select * into v_row from public.contratos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Contrato não encontrado nesta empresa.';
  end if;
  if v_row.status <> 'rascunho' then
    raise exception 'Só é possível ativar contrato em rascunho (status atual: %).', v_row.status;
  end if;
  if v_row.data_inicio is null then
    raise exception 'Data de início é obrigatória para ativar o contrato.';
  end if;

  if v_row.tipo = 'cliente' then
    if not exists (
      select 1 from public.pessoas p
      join public.pessoa_papeis pp on pp.pessoa_id = p.id
      where p.id = v_row.pessoa_id and p.company_id = v_company_id
        and pp.papel = 'CLIENTE' and pp.ativo
    ) then
      raise exception 'A pessoa vinculada ao contrato não tem mais o papel CLIENTE ativo — corrija antes de ativar.';
    end if;
  elsif v_row.tipo = 'fornecedor' then
    if not exists (
      select 1 from public.pessoas p
      join public.pessoa_papeis pp on pp.pessoa_id = p.id
      where p.id = v_row.pessoa_id and p.company_id = v_company_id
        and pp.papel = 'FORNECEDOR' and pp.ativo
    ) then
      raise exception 'A pessoa vinculada ao contrato não tem mais o papel FORNECEDOR ativo — corrija antes de ativar.';
    end if;
  else -- funcionario
    if not exists (select 1 from public.funcionarios where id = v_row.funcionario_id and company_id = v_company_id) then
      raise exception 'O funcionário vinculado ao contrato não foi encontrado nesta empresa.';
    end if;
  end if;

  update public.contratos set status = 'vigente', ativado_em = now() where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'contratos.ativado', 'contrato', p_id, v_row.numero);

  return p_id;
end;
$$;
