-- TÓPICO 18 — Contratos, fecha as duas lacunas que o recorte mínimo
-- (20261005000000) e o "completo" (20261029000000/20261103020000)
-- deixaram de propósito pra depois, conforme o próprio comentário de
-- 20261005000000: §8 (documentos anexos) e o gancho de §10 (referência
-- externa de assinatura — nunca a integração real com provedor, que
-- continua fora por decisão consciente do doc).
--
-- §10 é só um campo — sem lógica nenhuma, nada pra validar.
--
-- §8 reaproveita a infraestrutura genérica de files/register_file()
-- (nenhuma tabela nova), mas precisa do MESMO cuidado que RH já teve em
-- 20261010000000_code_review_fixes_2.sql: sem um gate específico por
-- entity_type, qualquer usuário com a permissão genérica files.upload/
-- files.read/files.delete (ex.: alguém que só anexa arquivo em outro
-- módulo) conseguiria anexar, ler o nome ou apagar o documento de um
-- contrato de terceiro sem ter contratos.manage/contratos.view — mesma
-- classe de vazamento de metadado já corrigida pra
-- entity_type='funcionario_documento'. Este arquivo estende o mesmo
-- padrão para entity_type='contrato' em register_file()/files_select, e
-- fecha uma lacuna que já existia mesmo pro caso de RH: delete_file()
-- nunca teve nenhum gate por entity_type (nem quando o RH foi corrigido)
-- — qualquer um com files.delete podia apagar documento de RH ou,
-- agora, de contrato. Corrigido aqui pros dois entity_type já sensíveis
-- que existem hoje.

alter table public.contratos add column assinatura_referencia_externa text;
comment on column public.contratos.assinatura_referencia_externa is
  'TÓPICO 18 §10 — gancho pra assinatura eletrônica futura (ex.: id de envelope do DocuSign/Clicksign). Só um campo de referência livre; nenhum provedor é integrado nesta fase.';

-- =========================================================================
-- 1. upsert_contrato() — ganha p_assinatura_referencia_externa
-- =========================================================================

drop function if exists public.upsert_contrato(uuid, text, uuid, uuid, uuid, uuid, text, date, date, text, numeric, text, text, date, date, int, text);

create or replace function public.upsert_contrato(
  p_id uuid,
  p_tipo text,
  p_pessoa_id uuid,
  p_obra_id uuid,
  p_pedido_id uuid,
  p_funcionario_id uuid,
  p_objeto text,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_renovacao text default 'manual',
  p_valor numeric default null,
  p_forma_pagamento text default null,
  p_observacoes text default null,
  p_garantia_inicio date default null,
  p_garantia_fim date default null,
  p_parcelas int default null,
  p_reajuste_previsto text default null,
  p_assinatura_referencia_externa text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('contratos', 'manage');
  v_before public.contratos;
  v_numero text;
  v_id uuid;
begin
  if p_tipo not in ('cliente', 'fornecedor', 'funcionario') then
    raise exception 'Tipo de contrato inválido: "%".', p_tipo;
  end if;
  if p_objeto is null or btrim(p_objeto) = '' then
    raise exception 'Objeto do contrato é obrigatório.';
  end if;
  if p_renovacao not in ('manual', 'automatica') then
    raise exception 'Renovação inválida: "%".', p_renovacao;
  end if;
  if p_data_inicio is not null and p_data_fim is not null and p_data_fim < p_data_inicio then
    raise exception 'Data de fim não pode ser anterior à data de início.';
  end if;
  if (p_garantia_inicio is not null or p_garantia_fim is not null) and p_tipo <> 'cliente' then
    raise exception 'Garantia só é aplicável a contrato com cliente.';
  end if;
  if p_garantia_inicio is not null and p_garantia_fim is not null and p_garantia_fim < p_garantia_inicio then
    raise exception 'Fim da garantia não pode ser anterior ao início da garantia.';
  end if;
  if p_parcelas is not null and p_parcelas <= 0 then
    raise exception 'Número de parcelas precisa ser maior que zero.';
  end if;

  if p_tipo = 'cliente' then
    if p_pessoa_id is null or p_funcionario_id is not null then
      raise exception 'Contrato com cliente exige pessoa e não referencia funcionário.';
    end if;
    if not exists (
      select 1 from public.pessoas p
      join public.pessoa_papeis pp on pp.pessoa_id = p.id
      where p.id = p_pessoa_id and p.company_id = v_company_id
        and pp.papel = 'CLIENTE' and pp.ativo
    ) then
      raise exception 'A pessoa vinculada ao contrato precisa ter o papel CLIENTE ativo.';
    end if;
    if p_obra_id is not null and not exists (
      select 1 from public.obras where id = p_obra_id and company_id = v_company_id and pessoa_id = p_pessoa_id
    ) then
      raise exception 'Obra não encontrada nesta empresa para esta pessoa.';
    end if;
    if p_pedido_id is not null and not exists (
      select 1 from public.pedidos where id = p_pedido_id and company_id = v_company_id and pessoa_id = p_pessoa_id
    ) then
      raise exception 'Pedido não encontrado nesta empresa para esta pessoa.';
    end if;
  elsif p_tipo = 'fornecedor' then
    if p_pessoa_id is null or p_funcionario_id is not null or p_obra_id is not null or p_pedido_id is not null then
      raise exception 'Contrato com fornecedor exige só pessoa, sem obra/pedido/funcionário.';
    end if;
    if not exists (
      select 1 from public.pessoas p
      join public.pessoa_papeis pp on pp.pessoa_id = p.id
      where p.id = p_pessoa_id and p.company_id = v_company_id
        and pp.papel = 'FORNECEDOR' and pp.ativo
    ) then
      raise exception 'A pessoa vinculada ao contrato precisa ter o papel FORNECEDOR ativo.';
    end if;
  else -- funcionario
    if p_funcionario_id is null or p_pessoa_id is not null or p_obra_id is not null or p_pedido_id is not null then
      raise exception 'Contrato com funcionário exige só funcionário, sem pessoa/obra/pedido.';
    end if;
    if not exists (select 1 from public.funcionarios where id = p_funcionario_id and company_id = v_company_id) then
      raise exception 'Funcionário não encontrado nesta empresa.';
    end if;
  end if;

  if p_id is not null then
    select * into v_before from public.contratos
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Contrato não encontrado nesta empresa.';
    end if;
    if v_before.status <> 'rascunho' then
      raise exception 'Só é possível editar contrato em rascunho (status atual: %).', v_before.status;
    end if;
    if v_before.tipo <> p_tipo then
      raise exception 'Não é possível mudar o tipo de um contrato existente.';
    end if;

    update public.contratos set
      pessoa_id = p_pessoa_id, obra_id = p_obra_id, pedido_id = p_pedido_id, funcionario_id = p_funcionario_id,
      objeto = p_objeto, data_inicio = p_data_inicio, data_fim = p_data_fim, renovacao = p_renovacao,
      valor = p_valor, forma_pagamento = p_forma_pagamento, observacoes = p_observacoes,
      garantia_inicio = p_garantia_inicio, garantia_fim = p_garantia_fim,
      parcelas = p_parcelas, reajuste_previsto = p_reajuste_previsto,
      assinatura_referencia_externa = p_assinatura_referencia_externa
    where id = p_id
    returning id into v_id;
  else
    v_numero := public.next_document_number('contrato');

    insert into public.contratos (
      company_id, numero, tipo, pessoa_id, obra_id, pedido_id, funcionario_id, objeto,
      data_inicio, data_fim, renovacao, valor, forma_pagamento, observacoes, criado_por,
      garantia_inicio, garantia_fim, parcelas, reajuste_previsto, assinatura_referencia_externa
    ) values (
      v_company_id, v_numero, p_tipo, p_pessoa_id, p_obra_id, p_pedido_id, p_funcionario_id, p_objeto,
      p_data_inicio, p_data_fim, p_renovacao, p_valor, p_forma_pagamento, p_observacoes, auth.uid(),
      p_garantia_inicio, p_garantia_fim, p_parcelas, p_reajuste_previsto, p_assinatura_referencia_externa
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), case when p_id is null then 'contratos.criado' else 'contratos.editado' end,
    'contrato', v_id, p_objeto,
    jsonb_build_object('tipo', p_tipo, 'before', to_jsonb(v_before))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_contrato(uuid, text, uuid, uuid, uuid, uuid, text, date, date, text, numeric, text, text, date, date, int, text, text) to authenticated;

-- =========================================================================
-- 2. register_file() — ganha gate contratos.manage pra entity_type='contrato'
--    (mesmo padrão do gate de rh.manage pra 'funcionario_documento',
--    20261010000000). Assinatura não muda.
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
  if p_entity_type = 'contrato' and not public.has_permission('contratos', 'manage') then
    raise exception 'Sem permissão para anexar documento de contrato (contratos.manage).';
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

-- =========================================================================
-- 3. files_select — mesma extensão pra 'contrato'
-- =========================================================================

drop policy if exists files_select on public.files;
create policy files_select on public.files for select
  using (
    deleted_at is null
    and (
      (
        company_id = (select public.current_company_id())
        and (select public.has_permission('files', 'read'))
        and (entity_type <> 'funcionario_documento' or (select public.has_permission('rh', 'view')))
        and (entity_type <> 'contrato' or (select public.has_permission('contratos', 'view')))
      )
      or (select public.is_platform_admin_mfa_verified())
    )
  );

-- =========================================================================
-- 4. delete_file() — nunca teve gate por entity_type, nem quando RH foi
--    corrigido (achado de passagem ao construir o anexo de contrato:
--    qualquer um com files.delete apagava documento de RH ou de contrato
--    de terceiro). Fecha pros dois entity_type sensíveis que existem hoje.
-- =========================================================================

create or replace function public.delete_file(p_file_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_file public.files;
begin
  if not public.has_permission('files', 'delete') then
    raise exception 'Sem permissão para remover arquivos.';
  end if;

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
$$;
