-- TÓPICO 17 — RH completo (ROTEIRO §5.1, aprovação explícita do
-- responsável do produto em 22/09/2026 para atacar este tópico depois de
-- fechar a frente de UI). A migration 20260916050000 cobriu só o recorte
-- mínimo do §11 (funcionários, vínculo com usuário, desligamento). Esta
-- migration completa o que o próprio §11 previu para "etapa seguinte":
--
--   §6 "documentos do colaborador":
--     - documentos de admissão: NÃO ganham tabela nova — reaproveitam a
--       infraestrutura genérica já existente (public.files, item 19-22 do
--       Prompt Mestre), com entity_type='funcionario' e entity_id=
--       funcionarios.id, o mesmo padrão que TÓPICO 16 já usa para evidência
--       fotográfica de instalação (entity_type='instalacao'). Criar uma
--       tabela paralela só para "documento" duplicaria o que já existe.
--     - certificações e treinamentos (inclui segurança): funcionario_
--       certificacoes;
--     - EPI (entrega e validade): funcionario_epis;
--     - habilitação para operar equipamento específico: funcionario_
--       habilitacoes, referenciando recursos_produtivos (TÓPICO 4 §31),
--       que já modela máquina/equipamento — não duplica esse cadastro.
--   §7 "afastamentos e férias": funcionario_afastamentos — datas e motivo,
--     sem cálculo de valor/encargo (fora do escopo por §8).
--
-- Ainda fora do escopo (§8, decisão consciente do próprio tópico, não um
-- corte nosso): folha de pagamento, encargos, rescisão, escala/jornada,
-- ponto/frequência.
--
-- Decisões de recorte replicadas do padrão já estabelecido em
-- 20260916050000_topico17_rh.sql:
--   - Reaproveito public.permissions rh.view/rh.manage — já cobre "acesso
--     restrito por permissão" (§9); não crio uma permissão por subtabela,
--     o que fragmentaria sem necessidade um módulo que já é só um.
--   - SELECT de todas as tabelas novas exige rh.view (mesma razão do LGPD
--     que já vale para funcionarios — dado de saúde/segurança do
--     trabalho é tão sensível quanto o cadastro base).
--   - Toda escrita é só via função SECURITY DEFINER (upsert_*/remover_*);
--     nenhuma policy de INSERT/UPDATE/DELETE para `authenticated`, mesmo
--     padrão de funcionarios/files.
--   - upsert_* bloqueia quando o funcionário-alvo está com status
--     'desligado' — mesma regra que upsert_funcionario já aplica a si
--     mesmo (evita crescer o cadastro de alguém que não é mais
--     colaborador); remover_* não bloqueia, porque corrigir/remover um
--     lançamento errado feito antes do desligamento continua legítimo.
--   - funcionario_habilitacoes.recurso_produtivo_id só aceita recurso do
--     tipo 'maquina' ou 'equipamento' — "habilitação para operar
--     equipamento", não para operar uma linha, um posto ou outra pessoa
--     (§6 é explícito nos exemplos: forno de têmpera, mesa de corte,
--     etc.).

-- =========================================================================
-- 1. funcionario_certificacoes — certificações, treinamentos e
--    treinamentos de segurança (§6).
-- =========================================================================

create table public.funcionario_certificacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  tipo text not null check (tipo in ('certificacao', 'treinamento', 'treinamento_seguranca')),
  nome text not null,
  data_conclusao date not null,
  data_validade date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funcionario_certificacoes_validade_check check (data_validade is null or data_validade >= data_conclusao)
);
comment on table public.funcionario_certificacoes is
  'TÓPICO 17 §6 — certificações, treinamentos e treinamentos de segurança do colaborador. Documento físico (se houver) fica em public.files, entity_type=funcionario.';
create index funcionario_certificacoes_funcionario_id_idx on public.funcionario_certificacoes (funcionario_id);
create index funcionario_certificacoes_company_id_idx on public.funcionario_certificacoes (company_id);

create trigger set_updated_at before update on public.funcionario_certificacoes
  for each row execute function public.set_updated_at();

alter table public.funcionario_certificacoes enable row level security;
create policy funcionario_certificacoes_select on public.funcionario_certificacoes for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('rh', 'view')));

revoke all on public.funcionario_certificacoes from anon, authenticated;
grant select on public.funcionario_certificacoes to authenticated;

-- =========================================================================
-- 2. funcionario_epis — controle de entrega e validade de EPI (§6).
-- =========================================================================

create table public.funcionario_epis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  tipo_epi text not null,
  ca text,
  data_entrega date not null,
  data_validade date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funcionario_epis_validade_check check (data_validade is null or data_validade >= data_entrega)
);
comment on table public.funcionario_epis is
  'TÓPICO 17 §6 — controle de entrega e validade de Equipamento de Proteção Individual. ca = Certificado de Aprovação do equipamento (opcional, texto livre).';
create index funcionario_epis_funcionario_id_idx on public.funcionario_epis (funcionario_id);
create index funcionario_epis_company_id_idx on public.funcionario_epis (company_id);

create trigger set_updated_at before update on public.funcionario_epis
  for each row execute function public.set_updated_at();

alter table public.funcionario_epis enable row level security;
create policy funcionario_epis_select on public.funcionario_epis for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('rh', 'view')));

revoke all on public.funcionario_epis from anon, authenticated;
grant select on public.funcionario_epis to authenticated;

-- =========================================================================
-- 3. funcionario_habilitacoes — habilitação para operar equipamento
--    específico (§6), referenciando o cadastro de recursos produtivos já
--    existente (TÓPICO 4 §31) em vez de duplicá-lo.
-- =========================================================================

create table public.funcionario_habilitacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  recurso_produtivo_id uuid not null references public.recursos_produtivos(id),
  data_obtencao date not null,
  data_validade date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funcionario_habilitacoes_validade_check check (data_validade is null or data_validade >= data_obtencao),
  constraint funcionario_habilitacoes_unique unique (funcionario_id, recurso_produtivo_id)
);
comment on table public.funcionario_habilitacoes is
  'TÓPICO 17 §6 — habilitação do colaborador para operar um recurso produtivo específico (máquina/equipamento, TÓPICO 4 §31), ex.: forno de têmpera, mesa de corte de vidro. Uma linha por par funcionário/recurso — renovação atualiza data_obtencao/data_validade na mesma linha em vez de acumular histórico.';
create index funcionario_habilitacoes_funcionario_id_idx on public.funcionario_habilitacoes (funcionario_id);
create index funcionario_habilitacoes_company_id_idx on public.funcionario_habilitacoes (company_id);

create trigger set_updated_at before update on public.funcionario_habilitacoes
  for each row execute function public.set_updated_at();

alter table public.funcionario_habilitacoes enable row level security;
create policy funcionario_habilitacoes_select on public.funcionario_habilitacoes for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('rh', 'view')));

revoke all on public.funcionario_habilitacoes from anon, authenticated;
grant select on public.funcionario_habilitacoes to authenticated;

-- =========================================================================
-- 4. funcionario_afastamentos — férias e afastamentos (§7): datas e
--    motivo, sem cálculo de valor/encargo (§8).
-- =========================================================================

create table public.funcionario_afastamentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  tipo text not null check (tipo in ('ferias', 'afastamento')),
  data_inicio date not null,
  data_fim date,
  motivo text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funcionario_afastamentos_datas_check check (data_fim is null or data_fim >= data_inicio)
);
comment on table public.funcionario_afastamentos is
  'TÓPICO 17 §7 — períodos de férias/afastamento do colaborador. data_fim nula = período em curso. Sem cálculo de valores/encargos (§8, fora de escopo).';
create index funcionario_afastamentos_funcionario_id_idx on public.funcionario_afastamentos (funcionario_id);
create index funcionario_afastamentos_company_id_idx on public.funcionario_afastamentos (company_id);

create trigger set_updated_at before update on public.funcionario_afastamentos
  for each row execute function public.set_updated_at();

alter table public.funcionario_afastamentos enable row level security;
create policy funcionario_afastamentos_select on public.funcionario_afastamentos for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('rh', 'view')));

revoke all on public.funcionario_afastamentos from anon, authenticated;
grant select on public.funcionario_afastamentos to authenticated;

-- =========================================================================
-- 5. Função auxiliar — valida funcionário ativo/afastado (não desligado)
--    na empresa do chamador. Reaproveitada pelas 4 funções de upsert
--    abaixo em vez de repetir a mesma checagem 4 vezes.
-- =========================================================================

create or replace function public.assert_funcionario_editavel(p_funcionario_id uuid, p_company_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  select status into v_status from public.funcionarios
  where id = p_funcionario_id and company_id = p_company_id;
  if not found then
    raise exception 'Funcionário não encontrado nesta empresa.';
  end if;
  if v_status = 'desligado' then
    raise exception 'Funcionário desligado não pode receber novos lançamentos de RH.';
  end if;
end;
$$;

-- =========================================================================
-- 6. funcionario_certificacoes — upsert/remover
-- =========================================================================

create or replace function public.upsert_funcionario_certificacao(
  p_id uuid,
  p_funcionario_id uuid,
  p_tipo text,
  p_nome text,
  p_data_conclusao date,
  p_data_validade date default null,
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_id uuid;
begin
  perform public.assert_funcionario_editavel(p_funcionario_id, v_company_id);
  if p_tipo not in ('certificacao', 'treinamento', 'treinamento_seguranca') then
    raise exception 'Tipo inválido: %.', p_tipo;
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome é obrigatório.';
  end if;
  if p_data_conclusao is null then
    raise exception 'Data de conclusão é obrigatória.';
  end if;

  if p_id is not null then
    update public.funcionario_certificacoes set
      tipo = p_tipo, nome = p_nome, data_conclusao = p_data_conclusao,
      data_validade = p_data_validade, observacoes = p_observacoes
    where id = p_id and company_id = v_company_id and funcionario_id = p_funcionario_id
    returning id into v_id;
    if not found then
      raise exception 'Registro não encontrado nesta empresa.';
    end if;
  else
    insert into public.funcionario_certificacoes (
      company_id, funcionario_id, tipo, nome, data_conclusao, data_validade, observacoes
    ) values (
      v_company_id, p_funcionario_id, p_tipo, p_nome, p_data_conclusao, p_data_validade, p_observacoes
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), case when p_id is null then 'rh.certificacao_registrada' else 'rh.certificacao_atualizada' end,
    'funcionario_certificacao', v_id, p_nome, jsonb_build_object('funcionario_id', p_funcionario_id, 'tipo', p_tipo)
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_funcionario_certificacao(uuid, uuid, text, text, date, date, text) to authenticated;

create or replace function public.remover_funcionario_certificacao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_funcionario_id uuid;
begin
  delete from public.funcionario_certificacoes
  where id = p_id and company_id = v_company_id
  returning funcionario_id into v_funcionario_id;
  if not found then
    raise exception 'Registro não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'rh.certificacao_removida', 'funcionario_certificacao', p_id, null, jsonb_build_object('funcionario_id', v_funcionario_id));

  return p_id;
end;
$$;

grant execute on function public.remover_funcionario_certificacao(uuid) to authenticated;

-- =========================================================================
-- 7. funcionario_epis — upsert/remover
-- =========================================================================

create or replace function public.upsert_funcionario_epi(
  p_id uuid,
  p_funcionario_id uuid,
  p_tipo_epi text,
  p_data_entrega date,
  p_ca text default null,
  p_data_validade date default null,
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_id uuid;
begin
  perform public.assert_funcionario_editavel(p_funcionario_id, v_company_id);
  if p_tipo_epi is null or btrim(p_tipo_epi) = '' then
    raise exception 'Tipo de EPI é obrigatório.';
  end if;
  if p_data_entrega is null then
    raise exception 'Data de entrega é obrigatória.';
  end if;

  if p_id is not null then
    update public.funcionario_epis set
      tipo_epi = p_tipo_epi, ca = p_ca, data_entrega = p_data_entrega,
      data_validade = p_data_validade, observacoes = p_observacoes
    where id = p_id and company_id = v_company_id and funcionario_id = p_funcionario_id
    returning id into v_id;
    if not found then
      raise exception 'Registro não encontrado nesta empresa.';
    end if;
  else
    insert into public.funcionario_epis (
      company_id, funcionario_id, tipo_epi, ca, data_entrega, data_validade, observacoes
    ) values (
      v_company_id, p_funcionario_id, p_tipo_epi, p_ca, p_data_entrega, p_data_validade, p_observacoes
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), case when p_id is null then 'rh.epi_registrado' else 'rh.epi_atualizado' end,
    'funcionario_epi', v_id, p_tipo_epi, jsonb_build_object('funcionario_id', p_funcionario_id)
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_funcionario_epi(uuid, uuid, text, date, text, date, text) to authenticated;

create or replace function public.remover_funcionario_epi(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_funcionario_id uuid;
begin
  delete from public.funcionario_epis
  where id = p_id and company_id = v_company_id
  returning funcionario_id into v_funcionario_id;
  if not found then
    raise exception 'Registro não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'rh.epi_removido', 'funcionario_epi', p_id, null, jsonb_build_object('funcionario_id', v_funcionario_id));

  return p_id;
end;
$$;

grant execute on function public.remover_funcionario_epi(uuid) to authenticated;

-- =========================================================================
-- 8. funcionario_habilitacoes — upsert/remover
-- =========================================================================

create or replace function public.upsert_funcionario_habilitacao(
  p_id uuid,
  p_funcionario_id uuid,
  p_recurso_produtivo_id uuid,
  p_data_obtencao date,
  p_data_validade date default null,
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_id uuid;
begin
  perform public.assert_funcionario_editavel(p_funcionario_id, v_company_id);
  if p_data_obtencao is null then
    raise exception 'Data de obtenção é obrigatória.';
  end if;
  if not exists (
    select 1 from public.recursos_produtivos
    where id = p_recurso_produtivo_id and company_id = v_company_id and tipo in ('maquina', 'equipamento')
  ) then
    raise exception 'Recurso produtivo não encontrado nesta empresa, ou não é do tipo máquina/equipamento.';
  end if;

  if p_id is not null then
    update public.funcionario_habilitacoes set
      recurso_produtivo_id = p_recurso_produtivo_id, data_obtencao = p_data_obtencao,
      data_validade = p_data_validade, observacoes = p_observacoes
    where id = p_id and company_id = v_company_id and funcionario_id = p_funcionario_id
    returning id into v_id;
    if not found then
      raise exception 'Registro não encontrado nesta empresa.';
    end if;
  else
    insert into public.funcionario_habilitacoes (
      company_id, funcionario_id, recurso_produtivo_id, data_obtencao, data_validade, observacoes
    ) values (
      v_company_id, p_funcionario_id, p_recurso_produtivo_id, p_data_obtencao, p_data_validade, p_observacoes
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), case when p_id is null then 'rh.habilitacao_registrada' else 'rh.habilitacao_atualizada' end,
    'funcionario_habilitacao', v_id, null, jsonb_build_object('funcionario_id', p_funcionario_id, 'recurso_produtivo_id', p_recurso_produtivo_id)
  );

  return v_id;
exception
  when unique_violation then
    raise exception 'Este funcionário já tem habilitação registrada para este recurso — edite a existente em vez de criar outra.';
end;
$$;

grant execute on function public.upsert_funcionario_habilitacao(uuid, uuid, uuid, date, date, text) to authenticated;

create or replace function public.remover_funcionario_habilitacao(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_funcionario_id uuid;
begin
  delete from public.funcionario_habilitacoes
  where id = p_id and company_id = v_company_id
  returning funcionario_id into v_funcionario_id;
  if not found then
    raise exception 'Registro não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'rh.habilitacao_removida', 'funcionario_habilitacao', p_id, null, jsonb_build_object('funcionario_id', v_funcionario_id));

  return p_id;
end;
$$;

grant execute on function public.remover_funcionario_habilitacao(uuid) to authenticated;

-- =========================================================================
-- 9. funcionario_afastamentos — upsert/remover
-- =========================================================================

create or replace function public.upsert_funcionario_afastamento(
  p_id uuid,
  p_funcionario_id uuid,
  p_tipo text,
  p_data_inicio date,
  p_data_fim date default null,
  p_motivo text default null,
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_id uuid;
begin
  perform public.assert_funcionario_editavel(p_funcionario_id, v_company_id);
  if p_tipo not in ('ferias', 'afastamento') then
    raise exception 'Tipo inválido: %.', p_tipo;
  end if;
  if p_data_inicio is null then
    raise exception 'Data de início é obrigatória.';
  end if;

  if p_id is not null then
    update public.funcionario_afastamentos set
      tipo = p_tipo, data_inicio = p_data_inicio, data_fim = p_data_fim,
      motivo = p_motivo, observacoes = p_observacoes
    where id = p_id and company_id = v_company_id and funcionario_id = p_funcionario_id
    returning id into v_id;
    if not found then
      raise exception 'Registro não encontrado nesta empresa.';
    end if;
  else
    insert into public.funcionario_afastamentos (
      company_id, funcionario_id, tipo, data_inicio, data_fim, motivo, observacoes
    ) values (
      v_company_id, p_funcionario_id, p_tipo, p_data_inicio, p_data_fim, p_motivo, p_observacoes
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), case when p_id is null then 'rh.afastamento_registrado' else 'rh.afastamento_atualizado' end,
    'funcionario_afastamento', v_id, p_motivo, jsonb_build_object('funcionario_id', p_funcionario_id, 'tipo', p_tipo)
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_funcionario_afastamento(uuid, uuid, text, date, date, text, text) to authenticated;

create or replace function public.remover_funcionario_afastamento(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_funcionario_id uuid;
begin
  delete from public.funcionario_afastamentos
  where id = p_id and company_id = v_company_id
  returning funcionario_id into v_funcionario_id;
  if not found then
    raise exception 'Registro não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'rh.afastamento_removido', 'funcionario_afastamento', p_id, null, jsonb_build_object('funcionario_id', v_funcionario_id));

  return p_id;
end;
$$;

grant execute on function public.remover_funcionario_afastamento(uuid) to authenticated;
