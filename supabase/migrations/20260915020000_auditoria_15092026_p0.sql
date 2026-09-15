-- Correções P0 da segunda auditoria independente (15/09/2026,
-- Mapa_Fases_Lacunas_Risco.md) — achados que a própria auditoria classifica
-- como defeito de fundação/módulo já entregue, não lacuna de roadmap
-- (T8/T9/T16 continuam de fora, por decisão do responsável do produto).
-- Escopo desta migration, por aprovação explícita do responsável do
-- produto (só P0):
--
--   F02 — register_file() tinha race condition de quota (SELECT sum() e
--         INSERT em passos separados, sem lock) e confiava no tamanho
--         informado pelo cliente em vez do tamanho real do objeto.
--   F04 — assert_company_not_suspended() só existia em T2/T4; T15, T10,
--         T3, T5 e T6 escreviam normalmente com empresa suspensa.
--   F05 — quantidade_fisica podia ficar abaixo de quantidade_reservada
--         (cada coluna só tinha CHECK >= 0 isolado).
--   F06 — consumir_reserva() não validava saldo físico suficiente antes
--         de decrementar; o CHECK de coluna intercepta, mas com erro bruto
--         de constraint em vez de mensagem de negócio.
--   F07 — cancelar_ordem_producao() (T4) cancelava a OP sem liberar a
--         reserva de estoque do pedido_item, deixando-a presa.
--   F08 — cancelar_pedido() não encerrava pedido_pendencias abertas.
--   F09 — next_document_number() só negava por permissão os tipos com
--         consumidor real (orcamento/pedido/ordem_producao); qualquer
--         outro tipo passava sem gate nenhum (allow-by-default).
--   F13 — isolamento de tenant em pedido_itens/estoque_* dependia só de
--         company_id replicado + join dentro de cada função, sem FK
--         composta garantindo o isolamento no schema.
--
-- Fora de escopo (P1/P2, não pedido nesta rodada): F01 residual (mime/size
-- do register_file ainda vem do cliente na resposta ao usuário, só o valor
-- usado pra quota/gravação passou a ser o real), F03 (soft-delete ainda
-- baixável), F10 (exportação sem paginação), F11/F12 (não confirmados como
-- bug atual), F15/F16/F17/F23.

-- =========================================================================
-- F02 — register_file(): lock por empresa (serializa concorrência) e usa o
-- tamanho real do objeto no Storage (metadata->>'size'), não o parâmetro
-- informado pelo cliente, tanto pra checar quota quanto pro que é gravado
-- em files.size_bytes.
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

  -- Lock por empresa: sem isso, duas chamadas concorrentes liam a mesma
  -- soma de uso antes de qualquer uma gravar, e a quota podia ser
  -- ultrapassada (achado F02 da auditoria de 15/09/2026).
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
-- F13 — FK composta (coluna, company_id) nas relações mais sensíveis, pra
-- que um RPC futuro que esqueça o join de tenant seja barrado pelo schema,
-- não só pela disciplina de quem escreve a função.
-- =========================================================================

alter table public.itens add constraint itens_id_company_unique unique (id, company_id);
alter table public.pedidos add constraint pedidos_id_company_unique unique (id, company_id);

-- pedido_itens precisa do próprio company_id pra ser referenciada por FK
-- composta (e pra ser, ela mesma, o lado "muitos" de uma FK composta pra
-- pedidos/itens). Backfill a partir do pedido pai — todo pedido_item
-- existente já pertence a um pedido com company_id definido.
alter table public.pedido_itens add column company_id uuid;
update public.pedido_itens pi set company_id = p.company_id
from public.pedidos p where p.id = pi.pedido_id;
alter table public.pedido_itens alter column company_id set not null;
alter table public.pedido_itens add constraint pedido_itens_company_id_fkey
  foreign key (company_id) references public.companies(id);
alter table public.pedido_itens add constraint pedido_itens_id_company_unique
  unique (id, company_id);

alter table public.pedido_itens drop constraint pedido_itens_pedido_id_fkey;
alter table public.pedido_itens add constraint pedido_itens_pedido_id_fkey
  foreign key (pedido_id, company_id) references public.pedidos(id, company_id) on delete cascade;

alter table public.pedido_itens drop constraint pedido_itens_item_id_fkey;
alter table public.pedido_itens add constraint pedido_itens_item_id_fkey
  foreign key (item_id, company_id) references public.itens(id, company_id);

alter table public.estoque_saldos drop constraint estoque_saldos_item_id_fkey;
alter table public.estoque_saldos add constraint estoque_saldos_item_id_fkey
  foreign key (item_id, company_id) references public.itens(id, company_id);

alter table public.estoque_reservas drop constraint estoque_reservas_item_id_fkey;
alter table public.estoque_reservas add constraint estoque_reservas_item_id_fkey
  foreign key (item_id, company_id) references public.itens(id, company_id);

alter table public.estoque_reservas drop constraint estoque_reservas_pedido_id_fkey;
alter table public.estoque_reservas add constraint estoque_reservas_pedido_id_fkey
  foreign key (pedido_id, company_id) references public.pedidos(id, company_id);

alter table public.estoque_reservas drop constraint estoque_reservas_pedido_item_id_fkey;
alter table public.estoque_reservas add constraint estoque_reservas_pedido_item_id_fkey
  foreign key (pedido_item_id, company_id) references public.pedido_itens(id, company_id);

-- estoque_movimentacoes.pedido_id/pedido_item_id são nullable (nem toda
-- movimentação vem de pedido) — FK composta em MATCH SIMPLE (padrão do
-- Postgres) não exige o par quando uma das colunas é null, então continua
-- opcional pros tipos que não referenciam pedido (ex.: ajuste).
alter table public.estoque_movimentacoes drop constraint estoque_movimentacoes_item_id_fkey;
alter table public.estoque_movimentacoes add constraint estoque_movimentacoes_item_id_fkey
  foreign key (item_id, company_id) references public.itens(id, company_id);

alter table public.estoque_movimentacoes drop constraint estoque_movimentacoes_pedido_id_fkey;
alter table public.estoque_movimentacoes add constraint estoque_movimentacoes_pedido_id_fkey
  foreign key (pedido_id, company_id) references public.pedidos(id, company_id);

alter table public.estoque_movimentacoes drop constraint estoque_movimentacoes_pedido_item_id_fkey;
alter table public.estoque_movimentacoes add constraint estoque_movimentacoes_pedido_item_id_fkey
  foreign key (pedido_item_id, company_id) references public.pedido_itens(id, company_id);

-- =========================================================================
-- F05 — segunda camada de defesa: mesmo que um RPC futuro esqueça de
-- comparar físico×reservado (como ajustar_saldo() fazia até esta
-- migration), o banco rejeita a escrita. ajustar_saldo() abaixo já dá a
-- mensagem de negócio antes de chegar aqui.
-- =========================================================================

alter table public.estoque_saldos
  add constraint estoque_saldos_fisica_gte_reservada check (quantidade_fisica >= quantidade_reservada);

-- =========================================================================
-- F04 — suspensão uniforme (T15, T10, T3, T5, T6) via assert_tenant_write(),
-- o helper único introduzido no code-review de 15/09/2026 especificamente
-- pra esse esquecimento ficar estruturalmente mais difícil. F09
-- (next_document_number deny-by-default), F06 (consumir_reserva valida
-- físico), F07 (cancelar_ordem_producao libera reserva) e F08 (cancelar_
-- pedido encerra pendências) vão junto, nas funções onde já se aplicam.
-- =========================================================================

-- ---- T15 — Configurações ------------------------------------------------

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

  -- F09: allow-list fechada — tipo desconhecido é negado por padrão, não
  -- aceito silenciosamente (antes só orcamento/pedido/ordem_producao eram
  -- checados; qualquer outro passava sem gate nenhum).
  if p_document_type = 'orcamento' then
    if not public.has_permission('orcamentos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de orçamento (orcamentos.manage).';
    end if;
  elsif p_document_type = 'pedido' then
    if not public.has_permission('pedidos', 'manage') then
      raise exception 'Sem permissão para emitir numeração de pedido (pedidos.manage).';
    end if;
  elsif p_document_type = 'ordem_producao' then
    if not public.has_permission('producao', 'manage') then
      raise exception 'Sem permissão para emitir numeração de ordem de produção (producao.manage).';
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

create or replace function public.upsert_numbering_sequence(
  p_document_type text,
  p_prefixo text,
  p_sufixo text,
  p_digitos int,
  p_incluir_ano boolean,
  p_incluir_mes boolean,
  p_reinicio text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before public.numbering_sequences;
  v_id uuid;
begin
  if p_reinicio not in ('nunca', 'anual', 'mensal') then
    raise exception 'Reinício inválido: "%".', p_reinicio;
  end if;

  select * into v_before from public.numbering_sequences
  where company_id = v_company_id and document_type = p_document_type
  for update;

  insert into public.numbering_sequences (
    company_id, document_type, prefixo, sufixo, digitos, incluir_ano, incluir_mes, reinicio
  ) values (
    v_company_id, p_document_type, p_prefixo, p_sufixo, p_digitos, p_incluir_ano, p_incluir_mes, p_reinicio
  )
  on conflict (company_id, document_type) do update
  set prefixo = excluded.prefixo,
      sufixo = excluded.sufixo,
      digitos = excluded.digitos,
      incluir_ano = excluded.incluir_ano,
      incluir_mes = excluded.incluir_mes,
      reinicio = excluded.reinicio
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.numbering_sequence_upserted', 'numbering_sequence', v_id,
    p_document_type,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'prefixo', p_prefixo, 'sufixo', p_sufixo, 'digitos', p_digitos,
      'incluir_ano', p_incluir_ano, 'incluir_mes', p_incluir_mes, 'reinicio', p_reinicio
    ))
  );

  return v_id;
end;
$$;

create or replace function public.upsert_cutting_margin(
  p_material_tipo text,
  p_processo text,
  p_percentual numeric,
  p_ativo boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before public.cutting_margin_settings;
  v_id uuid;
begin
  select * into v_before from public.cutting_margin_settings
  where company_id = v_company_id and material_tipo = p_material_tipo and processo = p_processo
  for update;

  insert into public.cutting_margin_settings (company_id, material_tipo, processo, percentual, ativo)
  values (v_company_id, p_material_tipo, p_processo, p_percentual, p_ativo)
  on conflict (company_id, material_tipo, processo) do update
  set percentual = excluded.percentual,
      ativo = excluded.ativo
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.cutting_margin_upserted', 'cutting_margin_setting', v_id,
    p_material_tipo || coalesce(nullif('/' || p_processo, '/'), ''),
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object('percentual', p_percentual, 'ativo', p_ativo))
  );

  return v_id;
end;
$$;

create or replace function public.upsert_measurement_rule(
  p_tipo_item text,
  p_exige_medicao_confirmada boolean,
  p_ativo boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before public.measurement_rules;
  v_id uuid;
begin
  select * into v_before from public.measurement_rules
  where company_id = v_company_id and tipo_item = p_tipo_item
  for update;

  insert into public.measurement_rules (company_id, tipo_item, exige_medicao_confirmada, ativo)
  values (v_company_id, p_tipo_item, p_exige_medicao_confirmada, p_ativo)
  on conflict (company_id, tipo_item) do update
  set exige_medicao_confirmada = excluded.exige_medicao_confirmada,
      ativo = excluded.ativo
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.measurement_rule_upserted', 'measurement_rule', v_id,
    p_tipo_item,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object('exige_medicao_confirmada', p_exige_medicao_confirmada, 'ativo', p_ativo))
  );

  return v_id;
end;
$$;

create or replace function public.upsert_approval_threshold(
  p_processo text,
  p_valor_minimo numeric,
  p_role_id uuid,
  p_ativo boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before public.approval_thresholds;
  v_id uuid;
begin
  if not exists (
    select 1 from public.roles
    where id = p_role_id and (company_id = v_company_id or company_id is null)
  ) then
    raise exception 'Perfil aprovador inválido para esta empresa.';
  end if;

  select * into v_before from public.approval_thresholds
  where company_id = v_company_id and processo = p_processo
  for update;

  insert into public.approval_thresholds (company_id, processo, valor_minimo, role_id, ativo)
  values (v_company_id, p_processo, p_valor_minimo, p_role_id, p_ativo)
  on conflict (company_id, processo) do update
  set valor_minimo = excluded.valor_minimo,
      role_id = excluded.role_id,
      ativo = excluded.ativo
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.approval_threshold_upserted', 'approval_threshold', v_id,
    p_processo,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object('valor_minimo', p_valor_minimo, 'role_id', p_role_id, 'ativo', p_ativo))
  );

  return v_id;
end;
$$;

-- ---- T10 — Comercial (orçamentos) ---------------------------------------

create or replace function public.upsert_orcamento(
  p_id uuid,
  p_pessoa_id uuid,
  p_obra_id uuid,
  p_validade date,
  p_condicao_comercial text,
  p_observacoes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('orcamentos', 'manage');
  v_before public.orcamentos;
  v_id uuid;
  v_numero text;
begin
  if not exists (
    select 1 from public.pessoas p
    join public.pessoa_papeis pp on pp.pessoa_id = p.id
    where p.id = p_pessoa_id and p.company_id = v_company_id
      and pp.papel = 'CLIENTE' and pp.ativo
  ) then
    raise exception 'A pessoa vinculada ao orçamento precisa ter o papel CLIENTE ativo.';
  end if;
  if p_obra_id is not null and not exists (
    select 1 from public.obras where id = p_obra_id and company_id = v_company_id and pessoa_id = p_pessoa_id
  ) then
    raise exception 'A obra informada não pertence a esta empresa ou não é desta pessoa.';
  end if;

  if p_id is not null then
    select * into v_before from public.orcamentos
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Orçamento não encontrado nesta empresa.';
    end if;
    if v_before.status <> 'rascunho' then
      raise exception 'Só é possível editar orçamento em rascunho (status atual: %).', v_before.status;
    end if;

    update public.orcamentos set
      pessoa_id = p_pessoa_id, obra_id = p_obra_id, validade = p_validade,
      condicao_comercial = p_condicao_comercial, observacoes = p_observacoes
    where id = p_id
    returning id into v_id;
    v_numero := v_before.numero;
  else
    v_numero := public.next_document_number('orcamento');
    insert into public.orcamentos (
      company_id, numero, pessoa_id, obra_id, responsavel_id, validade, condicao_comercial, observacoes
    ) values (
      v_company_id, v_numero, p_pessoa_id, p_obra_id, auth.uid(), p_validade, p_condicao_comercial, p_observacoes
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_upserted', 'orcamento', v_id, v_numero,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'pessoa_id', p_pessoa_id, 'obra_id', p_obra_id, 'validade', p_validade
    ))
  );

  return v_id;
end;
$$;

create or replace function public.upsert_orcamento_item(
  p_id uuid,
  p_orcamento_id uuid,
  p_item_id uuid,
  p_quantidade numeric,
  p_preco_unitario numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('orcamentos', 'manage');
  v_orcamento public.orcamentos;
  v_before public.orcamento_itens;
  v_id uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if p_preco_unitario is null or p_preco_unitario < 0 then
    raise exception 'Preço unitário inválido.';
  end if;

  select * into v_orcamento from public.orcamentos
  where id = p_orcamento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'rascunho' then
    raise exception 'Só é possível alterar itens de orçamento em rascunho (status atual: %).', v_orcamento.status;
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id and situacao = 'ativo') then
    raise exception 'Item não encontrado ou inativo nesta empresa.';
  end if;

  if p_id is not null then
    select * into v_before from public.orcamento_itens
    where id = p_id and orcamento_id = p_orcamento_id
    for update;
    if not found then
      raise exception 'Item do orçamento não encontrado.';
    end if;

    update public.orcamento_itens set
      item_id = p_item_id, quantidade = p_quantidade, preco_unitario = p_preco_unitario
    where id = p_id
    returning id into v_id;
  else
    insert into public.orcamento_itens (orcamento_id, item_id, quantidade, preco_unitario)
    values (p_orcamento_id, p_item_id, p_quantidade, p_preco_unitario)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_item_upserted', 'orcamento_item', v_id, v_orcamento.numero,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'orcamento_id', p_orcamento_id, 'item_id', p_item_id, 'quantidade', p_quantidade, 'preco_unitario', p_preco_unitario
    ))
  );

  return v_id;
end;
$$;

create or replace function public.remove_orcamento_item(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('orcamentos', 'manage');
  v_orcamento_id uuid;
  v_orcamento public.orcamentos;
  v_item public.orcamento_itens;
begin
  select orcamento_id into v_orcamento_id from public.orcamento_itens where id = p_id;
  if not found then
    raise exception 'Item do orçamento não encontrado nesta empresa.';
  end if;

  select * into v_orcamento from public.orcamentos
  where id = v_orcamento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item do orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'rascunho' then
    raise exception 'Só é possível remover item de orçamento em rascunho (status atual: %).', v_orcamento.status;
  end if;

  select * into v_item from public.orcamento_itens where id = p_id;
  if not found then
    raise exception 'Item do orçamento não encontrado nesta empresa.';
  end if;

  delete from public.orcamento_itens where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_item_removed', 'orcamento_item', p_id, v_orcamento.numero,
    jsonb_build_object('before', to_jsonb(v_item))
  );
end;
$$;

create or replace function public.decidir_orcamento(
  p_id uuid,
  p_decisao text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('orcamentos', 'manage');
  v_before public.orcamentos;
  v_total numeric;
  v_threshold public.approval_thresholds;
begin
  if p_decisao not in ('aprovado', 'rejeitado') then
    raise exception 'Decisão inválida: "%".', p_decisao;
  end if;

  select * into v_before from public.orcamentos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_before.status <> 'rascunho' then
    raise exception 'Só é possível decidir orçamento em rascunho (status atual: %).', v_before.status;
  end if;

  v_total := public.orcamento_valor_total(p_id);

  if p_decisao = 'aprovado' then
    if v_total <= 0 then
      raise exception 'Orçamento sem itens não pode ser aprovado.';
    end if;

    select * into v_threshold from public.approval_thresholds
    where company_id = v_company_id and processo = 'orcamento' and ativo;

    if found and v_total >= v_threshold.valor_minimo and not public.is_platform_admin() then
      if not exists (
        select 1 from public.user_roles ur
        where ur.profile_id = auth.uid() and ur.role_id = v_threshold.role_id
          and ur.valid_from <= now() and (ur.valid_until is null or ur.valid_until > now())
      ) then
        raise exception 'Aprovação de orçamento a partir de R$ % exige o perfil aprovador configurado em Configurações.', v_threshold.valor_minimo;
      end if;
    end if;
  end if;

  update public.orcamentos set status = p_decisao where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_decidido', 'orcamento', p_id, v_before.numero,
    jsonb_build_object('decisao', p_decisao, 'valor_total', v_total)
  );

  return p_id;
end;
$$;

create or replace function public.cancelar_orcamento(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('orcamentos', 'manage');
  v_before public.orcamentos;
begin
  select * into v_before from public.orcamentos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_before.status not in ('rascunho', 'aprovado') then
    raise exception 'Orçamento com status "%" não pode ser cancelado.', v_before.status;
  end if;
  if exists (select 1 from public.pedidos where orcamento_id = p_id) then
    raise exception 'Este orçamento já foi convertido em pedido — cancele ou resolva o pedido em vez disso.';
  end if;

  update public.orcamentos set status = 'cancelado' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_cancelado', 'orcamento', p_id, v_before.numero,
    jsonb_build_object('status_anterior', v_before.status)
  );

  return p_id;
end;
$$;

-- ---- T3 — Pedidos --------------------------------------------------------

create or replace function public.converter_orcamento_em_pedido(p_orcamento_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_orcamento public.orcamentos;
  v_pedido_id uuid;
  v_numero text;
begin
  select * into v_orcamento from public.orcamentos
  where id = p_orcamento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'aprovado' then
    raise exception 'Só é possível converter orçamento aprovado (status atual: %).', v_orcamento.status;
  end if;
  if exists (select 1 from public.pedidos where orcamento_id = p_orcamento_id) then
    raise exception 'Este orçamento já foi convertido em pedido.';
  end if;
  if exists (
    select 1 from public.orcamento_itens oi
    join public.itens i on i.id = oi.item_id
    where oi.orcamento_id = p_orcamento_id and i.situacao <> 'ativo'
  ) then
    raise exception 'Orçamento tem item(ns) inativo(s) desde a aprovação — reative o item ou cancele este orçamento e crie outro antes de converter.';
  end if;

  v_numero := public.next_document_number('pedido');

  insert into public.pedidos (
    company_id, numero, orcamento_id, pessoa_id, obra_id, responsavel_id, observacoes
  ) values (
    v_company_id, v_numero, p_orcamento_id, v_orcamento.pessoa_id, v_orcamento.obra_id, auth.uid(), v_orcamento.observacoes
  )
  returning id into v_pedido_id;

  -- F13: pedido_itens agora carrega o próprio company_id (FK composta com
  -- pedidos/itens) — precisa ser populado na cópia.
  insert into public.pedido_itens (company_id, pedido_id, item_id, quantidade, preco_unitario)
  select v_company_id, v_pedido_id, oi.item_id, oi.quantidade, oi.preco_unitario
  from public.orcamento_itens oi
  where oi.orcamento_id = p_orcamento_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pedido_convertido_de_orcamento', 'pedido', v_pedido_id, v_numero,
    jsonb_build_object('orcamento_id', p_orcamento_id, 'orcamento_numero', v_orcamento.numero)
  );

  return v_pedido_id;
end;
$$;

create or replace function public.iniciar_conferencia_pedido(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_before public.pedidos;
begin
  select * into v_before from public.pedidos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_before.status <> 'recebido' then
    raise exception 'Só é possível iniciar conferência a partir de "recebido" (status atual: %).', v_before.status;
  end if;

  update public.pedidos set status = 'em_conferencia' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.conferencia_iniciada', 'pedido', p_id, v_before.numero, '{}'::jsonb
  );

  return p_id;
end;
$$;

create or replace function public.abrir_pendencia_pedido(p_id uuid, p_descricao text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_pedido public.pedidos;
  v_pendencia_id uuid;
begin
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição da pendência é obrigatória.';
  end if;

  select * into v_pedido from public.pedidos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_pedido.status not in ('em_conferencia', 'pendente') then
    raise exception 'Só é possível abrir pendência com o pedido em conferência (status atual: %).', v_pedido.status;
  end if;

  insert into public.pedido_pendencias (pedido_id, descricao, aberta_por)
  values (p_id, p_descricao, auth.uid())
  returning id into v_pendencia_id;

  if v_pedido.status <> 'pendente' then
    update public.pedidos set status = 'pendente' where id = p_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pendencia_aberta', 'pedido_pendencia', v_pendencia_id, v_pedido.numero,
    jsonb_build_object('pedido_id', p_id, 'descricao', p_descricao)
  );

  return v_pendencia_id;
end;
$$;

create or replace function public.resolver_pendencia_pedido(p_pendencia_id uuid, p_resolucao text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_pendencia public.pedido_pendencias;
  v_pedido public.pedidos;
  v_abertas_restantes int;
begin
  select pp.* into v_pendencia from public.pedido_pendencias pp
  join public.pedidos p on p.id = pp.pedido_id
  where pp.id = p_pendencia_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Pendência não encontrada nesta empresa.';
  end if;
  if v_pendencia.resolvida then
    raise exception 'Pendência já resolvida.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pendencia.pedido_id for update;
  if v_pedido.status = 'cancelado' then
    raise exception 'Pedido está cancelado — não é possível resolver pendência.';
  end if;

  update public.pedido_pendencias set
    resolvida = true, resolvida_por = auth.uid(), resolvida_em = now(), resolucao = p_resolucao
  where id = p_pendencia_id;

  select count(*) into v_abertas_restantes from public.pedido_pendencias
  where pedido_id = v_pedido.id and not resolvida and id <> p_pendencia_id;

  if v_abertas_restantes = 0 and v_pedido.status = 'pendente' then
    update public.pedidos set status = 'em_conferencia' where id = v_pedido.id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pendencia_resolvida', 'pedido_pendencia', p_pendencia_id, v_pedido.numero,
    jsonb_build_object('pedido_id', v_pedido.id, 'resolucao', p_resolucao, 'pendencias_abertas_restantes', v_abertas_restantes)
  );

  return p_pendencia_id;
end;
$$;

create or replace function public.liberar_pedido(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_before public.pedidos;
  v_pendencias_abertas int;
begin
  select * into v_before from public.pedidos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_before.status <> 'em_conferencia' then
    raise exception 'Só é possível liberar pedido em conferência, sem pendência aberta (status atual: %).', v_before.status;
  end if;

  select count(*) into v_pendencias_abertas from public.pedido_pendencias
  where pedido_id = p_id and not resolvida;
  if v_pendencias_abertas > 0 then
    raise exception 'Pedido tem % pendência(s) aberta(s) — resolva antes de liberar.', v_pendencias_abertas;
  end if;

  update public.pedidos set status = 'liberado' where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pedido_liberado', 'pedido', p_id, v_before.numero, '{}'::jsonb
  );

  return p_id;
end;
$$;

-- F08: encerra automaticamente as pendências abertas do pedido cancelado
-- (opção A da auditoria — evita registro eternamente aberto apontando pra
-- um pedido que não vai mais avançar).
create or replace function public.cancelar_pedido(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_before public.pedidos;
  v_pendencias_encerradas int;
begin
  select * into v_before from public.pedidos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_before.status not in ('recebido', 'em_conferencia', 'pendente') then
    raise exception 'Pedido com status "%" não pode ser cancelado.', v_before.status;
  end if;

  update public.pedidos set status = 'cancelado' where id = p_id;

  update public.pedido_pendencias set
    resolvida = true, resolvida_por = auth.uid(), resolvida_em = now(),
    resolucao = coalesce(resolucao, 'Encerrada automaticamente pelo cancelamento do pedido.')
  where pedido_id = p_id and not resolvida;
  get diagnostics v_pendencias_encerradas = row_count;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pedido_cancelado', 'pedido', p_id, v_before.numero,
    jsonb_build_object('status_anterior', v_before.status, 'pendencias_encerradas_automaticamente', v_pendencias_encerradas)
  );

  return p_id;
end;
$$;

-- ---- T5 — Engenharia -----------------------------------------------------

create or replace function public.criar_item_producao(p_pedido_item_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_pedido_item public.pedido_itens;
  v_pedido public.pedidos;
  v_id uuid;
begin
  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido_item.pedido_id;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível iniciar engenharia para item de pedido liberado (status atual: %).', v_pedido.status;
  end if;
  if exists (select 1 from public.itens_producao where pedido_item_id = p_pedido_item_id) then
    raise exception 'Este item de pedido já tem item de produção na Engenharia.';
  end if;

  insert into public.itens_producao (company_id, pedido_id, pedido_item_id)
  values (v_company_id, v_pedido.id, p_pedido_item_id)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.item_producao_criado', 'item_producao', v_id, v_pedido.numero,
    jsonb_build_object('pedido_id', v_pedido.id, 'pedido_item_id', p_pedido_item_id)
  );

  return v_id;
end;
$$;

create or replace function public.registrar_medicao(
  p_id uuid,
  p_ambiente text,
  p_largura_mm numeric,
  p_altura_mm numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_before public.itens_producao;
begin
  if p_largura_mm is null or p_largura_mm <= 0 or p_altura_mm is null or p_altura_mm <= 0 then
    raise exception 'Largura e altura devem ser maiores que zero.';
  end if;

  select * into v_before from public.itens_producao
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de produção não encontrado nesta empresa.';
  end if;

  update public.itens_producao set
    ambiente = p_ambiente,
    largura_mm = p_largura_mm,
    altura_mm = p_altura_mm,
    medida_registrada_por = auth.uid(),
    medida_registrada_em = now(),
    medida_confirmada = false,
    medida_confirmada_por = null,
    medida_confirmada_em = null
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.medicao_registrada', 'item_producao', p_id, p_ambiente,
    jsonb_build_object(
      'before', jsonb_build_object(
        'ambiente', v_before.ambiente, 'largura_mm', v_before.largura_mm, 'altura_mm', v_before.altura_mm,
        'medida_confirmada', v_before.medida_confirmada
      ),
      'after', jsonb_build_object('ambiente', p_ambiente, 'largura_mm', p_largura_mm, 'altura_mm', p_altura_mm)
    )
  );

  return p_id;
end;
$$;

create or replace function public.confirmar_medicao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_before public.itens_producao;
begin
  select * into v_before from public.itens_producao
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Item de produção não encontrado nesta empresa.';
  end if;
  if v_before.largura_mm is null or v_before.altura_mm is null then
    raise exception 'Registre a medida antes de confirmar.';
  end if;
  if v_before.medida_confirmada then
    raise exception 'Medida já confirmada.';
  end if;

  update public.itens_producao set
    medida_confirmada = true, medida_confirmada_por = auth.uid(), medida_confirmada_em = now()
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.medicao_confirmada', 'item_producao', p_id, v_before.ambiente,
    jsonb_build_object('largura_mm', v_before.largura_mm, 'altura_mm', v_before.altura_mm)
  );

  return p_id;
end;
$$;

-- ---- T6 — Estoque ---------------------------------------------------------

-- F05: além do CHECK de tabela (defesa em profundidade), a mensagem de
-- negócio já barra aqui, antes de qualquer escrita.
create or replace function public.ajustar_saldo(
  p_item_id uuid,
  p_quantidade_delta numeric,
  p_motivo text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('estoque', 'manage');
  v_saldo public.estoque_saldos;
  v_mov_id uuid;
  v_nova_fisica numeric;
begin
  if p_quantidade_delta is null or p_quantidade_delta = 0 then
    raise exception 'Quantidade do ajuste não pode ser zero.';
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

  v_nova_fisica := v_saldo.quantidade_fisica + p_quantidade_delta;

  if v_nova_fisica < 0 then
    raise exception 'Ajuste deixaria o saldo físico negativo (atual: %, ajuste: %).', v_saldo.quantidade_fisica, p_quantidade_delta;
  end if;
  if v_nova_fisica < v_saldo.quantidade_reservada then
    raise exception 'Ajuste deixaria o físico (%) abaixo do reservado (%) — libere reservas antes de reduzir o saldo.',
      v_nova_fisica, v_saldo.quantidade_reservada;
  end if;

  update public.estoque_saldos set quantidade_fisica = v_nova_fisica
  where id = v_saldo.id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, motivo, created_by)
  values (v_company_id, p_item_id, 'ajuste', p_quantidade_delta, p_motivo, auth.uid())
  returning id into v_mov_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.saldo_ajustado', 'estoque_movimentacao', v_mov_id, p_motivo,
    jsonb_build_object('item_id', p_item_id, 'delta', p_quantidade_delta, 'saldo_fisico_anterior', v_saldo.quantidade_fisica)
  );

  return v_mov_id;
end;
$$;

create or replace function public.reservar_para_pedido_item(p_pedido_item_id uuid)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('estoque', 'manage');
  v_pedido_item public.pedido_itens;
  v_pedido public.pedidos;
  v_saldo public.estoque_saldos;
  v_disponivel numeric;
  v_reservar numeric;
  v_reserva_id uuid;
begin
  select pi.* into v_pedido_item from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido_item.pedido_id;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível reservar estoque para pedido liberado (status atual: %).', v_pedido.status;
  end if;
  if exists (select 1 from public.estoque_reservas where pedido_item_id = p_pedido_item_id and status = 'reservado') then
    raise exception 'Já existe reserva ativa para este item de pedido — libere antes de reservar de novo.';
  end if;

  insert into public.estoque_saldos (company_id, item_id)
  values (v_company_id, v_pedido_item.item_id)
  on conflict (company_id, item_id) do nothing;

  select * into v_saldo from public.estoque_saldos
  where company_id = v_company_id and item_id = v_pedido_item.item_id
  for update;

  v_disponivel := v_saldo.quantidade_fisica - v_saldo.quantidade_reservada;
  v_reservar := least(v_pedido_item.quantidade, greatest(v_disponivel, 0));

  if v_reservar <= 0 then
    return 0;
  end if;

  insert into public.estoque_reservas (company_id, item_id, pedido_id, pedido_item_id, quantidade)
  values (v_company_id, v_pedido_item.item_id, v_pedido.id, p_pedido_item_id, v_reservar)
  returning id into v_reserva_id;

  update public.estoque_saldos set quantidade_reservada = quantidade_reservada + v_reservar
  where id = v_saldo.id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, pedido_id, pedido_item_id, created_by)
  values (v_company_id, v_pedido_item.item_id, 'reserva', v_reservar, v_pedido.id, p_pedido_item_id, auth.uid());

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.reserva_criada', 'estoque_reserva', v_reserva_id, v_pedido.numero,
    jsonb_build_object(
      'pedido_item_id', p_pedido_item_id, 'quantidade_necessaria', v_pedido_item.quantidade,
      'quantidade_reservada', v_reservar, 'falta', v_pedido_item.quantidade - v_reservar
    )
  );

  return v_reservar;
end;
$$;

-- F07: núcleo da liberação de reserva extraído sem o gate de permissão,
-- pra poder ser chamado internamente por cancelar_ordem_producao() (T4)
-- sem exigir que quem cancela uma OP também tenha estoque.manage. Sem
-- grant a authenticated de propósito — só liberar_reserva() (após checar
-- estoque.manage) e cancelar_ordem_producao() (após checar
-- producao.manage) chamam isto.
create or replace function public.liberar_reserva_interna(p_reserva_id uuid, p_company_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reserva public.estoque_reservas;
begin
  select * into v_reserva from public.estoque_reservas
  where id = p_reserva_id and company_id = p_company_id and status = 'reservado'
  for update;
  if not found then
    return;
  end if;

  update public.estoque_saldos set quantidade_reservada = quantidade_reservada - v_reserva.quantidade
  where company_id = p_company_id and item_id = v_reserva.item_id;

  update public.estoque_reservas set status = 'liberado' where id = p_reserva_id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, pedido_id, pedido_item_id, created_by)
  values (p_company_id, v_reserva.item_id, 'liberacao_reserva', v_reserva.quantidade, v_reserva.pedido_id, v_reserva.pedido_item_id, auth.uid());

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    p_company_id, auth.uid(), 'estoque.reserva_liberada', 'estoque_reserva', p_reserva_id, null,
    jsonb_build_object('item_id', v_reserva.item_id, 'quantidade', v_reserva.quantidade)
  );
end;
$$;

create or replace function public.liberar_reserva(p_reserva_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('estoque', 'manage');
  v_reserva public.estoque_reservas;
begin
  select * into v_reserva from public.estoque_reservas
  where id = p_reserva_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Reserva não encontrada nesta empresa.';
  end if;
  if v_reserva.status <> 'reservado' then
    raise exception 'Só é possível liberar reserva ativa (status atual: %).', v_reserva.status;
  end if;

  perform public.liberar_reserva_interna(p_reserva_id, v_company_id);

  return p_reserva_id;
end;
$$;

-- F06: valida saldo físico suficiente ANTES de decrementar, com mensagem
-- de negócio — antes disso, um físico insuficiente só era barrado pelo
-- CHECK de coluna, quebrando a transação com um erro bruto de constraint.
create or replace function public.consumir_reserva(p_reserva_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('estoque', 'manage');
  v_reserva public.estoque_reservas;
  v_saldo public.estoque_saldos;
begin
  select * into v_reserva from public.estoque_reservas
  where id = p_reserva_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Reserva não encontrada nesta empresa.';
  end if;
  if v_reserva.status <> 'reservado' then
    raise exception 'Só é possível consumir reserva ativa (status atual: %).', v_reserva.status;
  end if;

  select * into v_saldo from public.estoque_saldos
  where company_id = v_company_id and item_id = v_reserva.item_id
  for update;
  if v_saldo.quantidade_fisica < v_reserva.quantidade then
    raise exception 'Saldo físico insuficiente para consumir esta reserva (físico: %, reserva: %) — ajuste o saldo antes de consumir.',
      v_saldo.quantidade_fisica, v_reserva.quantidade;
  end if;

  update public.estoque_saldos set
    quantidade_fisica = quantidade_fisica - v_reserva.quantidade,
    quantidade_reservada = quantidade_reservada - v_reserva.quantidade
  where id = v_saldo.id;

  update public.estoque_reservas set status = 'consumido' where id = p_reserva_id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, pedido_id, pedido_item_id, created_by)
  values (v_company_id, v_reserva.item_id, 'consumo', v_reserva.quantidade, v_reserva.pedido_id, v_reserva.pedido_item_id, auth.uid());

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.reserva_consumida', 'estoque_reserva', p_reserva_id, null,
    jsonb_build_object('item_id', v_reserva.item_id, 'quantidade', v_reserva.quantidade)
  );

  return p_reserva_id;
end;
$$;

create or replace function public.registrar_entrada_sobra(
  p_item_id uuid,
  p_quantidade numeric,
  p_pedido_item_id uuid,
  p_observacao text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('estoque', 'manage');
  v_pedido_id uuid;
  v_mov_id uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade da sobra deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  if p_pedido_item_id is not null then
    select pi.pedido_id into v_pedido_id from public.pedido_itens pi
    join public.pedidos p on p.id = pi.pedido_id
    where pi.id = p_pedido_item_id and p.company_id = v_company_id;
    if v_pedido_id is null then
      raise exception 'Item de pedido não encontrado nesta empresa.';
    end if;
  end if;

  insert into public.estoque_saldos (company_id, item_id)
  values (v_company_id, p_item_id)
  on conflict (company_id, item_id) do nothing;

  update public.estoque_saldos set quantidade_fisica = quantidade_fisica + p_quantidade
  where company_id = v_company_id and item_id = p_item_id;

  insert into public.estoque_movimentacoes (company_id, item_id, tipo, quantidade, pedido_id, pedido_item_id, motivo, created_by)
  values (v_company_id, p_item_id, 'entrada_sobra', p_quantidade, v_pedido_id, p_pedido_item_id, p_observacao, auth.uid())
  returning id into v_mov_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'estoque.sobra_registrada', 'estoque_movimentacao', v_mov_id, p_observacao,
    jsonb_build_object('item_id', p_item_id, 'quantidade', p_quantidade, 'pedido_item_id', p_pedido_item_id)
  );

  return v_mov_id;
end;
$$;

-- ---- T4 — Produção (F07: libera reserva ao cancelar OP) -------------------

create or replace function public.cancelar_ordem_producao(p_ordem_producao_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
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
$$;
