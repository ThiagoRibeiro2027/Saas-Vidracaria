-- TÓPICO 17 — RH completo (ROTEIRO §5.1, PLANO DE ENTREGA §6 M3). O
-- recorte mínimo (20260916050000_topico17_rh.sql) cobriu exatamente o que
-- o §11 do próprio doc priorizou: cadastro de funcionários, vínculo com
-- usuário, desligamento. "Cadastro de equipes" já estava coberto desde o
-- TÓPICO 16 (equipes_instalacao/equipe_membros) — nada a fazer ali.
--
-- Esta migration fecha o que o §11 explicitamente adiou "para etapa
-- seguinte": §6 (documentos, EPI, habilitações) e §7 (afastamentos e
-- férias).
--
-- §6 — DOCUMENTOS DO COLABORADOR: o próprio §6 lista quatro coisas
-- (documento de admissão, certificação/treinamento, EPI, habilitação
-- para operar equipamento) com o mesmo formato — nome, data de
-- referência, validade opcional, observação. Uma estrutura genérica só,
-- discriminada por `tipo`, em vez de quatro tabelas quase idênticas
-- (mesmo raciocínio já usado no TÓPICO 18 pros três tipos de contrato).
-- "Habilitação para equipamento" é lista de exemplo no doc ("ex.: forno
-- de têmpera, mesa de corte..."), não um enum fechado — `nome` fica texto
-- livre, mesmo padrão de itens.classificacao (TÓPICO 2).
--
-- Anexo do documento em si (PDF do certificado, foto da entrega de EPI):
-- a estrutura genérica de files/register_file() (Fase 3) já suporta
-- qualquer entidade nova via (entity_type, entity_id) sem nenhuma mudança
-- de schema — quem quiser anexar usa a tela de Arquivos com
-- entity_type='funcionario_documento'. Não construo tela de upload
-- dedicada aqui, mesmo padrão de contenção do TÓPICO 18 (contratos
-- também não ganhou tela de upload nesta fase).
--
-- §7 — AFASTAMENTOS E FÉRIAS: "registro simples... sem cálculo de
-- valores ou encargos" — datas + motivo, correção via cancelamento
-- (nunca edição livre nem exclusão física, mesmo padrão de
-- documentos_fiscais). Deliberadamente DESACOPLADO de funcionarios.status
-- — a migration original já documentava isso: "funcionarios.status já
-- cobre 'afastado' como estado simples, sem registro de período/motivo
-- separado" foi decisão consciente de não amarrar as duas coisas agora;
-- esta migration é a extensão aditiva que aquele comentário já previa,
-- não uma correção. Sincronizar status automaticamente com o período é
-- regra de negócio nova que o doc não pede — fica pra quando for
-- validado no piloto.
--
-- Nenhuma permissão nova: documentos e afastamentos são extensão do
-- mesmo módulo RH, então reusam rh.view/rh.manage — dado pessoal sensível
-- (LGPD, §9), mesmo gate que já existia pra funcionarios.
--
-- Checklist de segurança (CLAUDE.md): RLS com gate explícito rh.view/
-- rh.manage, SECURITY DEFINER com search_path controlado, sem grant a
-- PUBLIC/anon, current_company_id() nunca aceito do cliente, empresa
-- suspensa bloqueia escrita, teste negativo e de isolamento em
-- scripts/test-rh.mjs.

-- =========================================================================
-- 1. DOCUMENTOS DO COLABORADOR (§6)
-- =========================================================================

create table public.funcionario_documentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  funcionario_id uuid not null references public.funcionarios(id),
  tipo text not null check (tipo in ('admissao', 'certificacao', 'epi', 'habilitacao')),
  nome text not null,
  data_referencia date,
  validade date,
  observacoes text,
  status text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  motivo_cancelamento text,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.funcionario_documentos is
  'TÓPICO 17 §6 — documento de admissão, certificação/treinamento, EPI e habilitação de equipamento numa estrutura genérica só (`tipo`). Anexo de arquivo usa a tela de Arquivos (entity_type=''funcionario_documento''), sem tela dedicada nesta fase. "cancelado" é correção interna (registro errado), nunca exclusão física.';
create index funcionario_documentos_company_id_idx on public.funcionario_documentos (company_id);
create index funcionario_documentos_funcionario_id_idx on public.funcionario_documentos (funcionario_id);

create trigger set_updated_at before update on public.funcionario_documentos
  for each row execute function public.set_updated_at();

alter table public.funcionario_documentos enable row level security;
create policy funcionario_documentos_select on public.funcionario_documentos for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('rh', 'view')));

grant select on public.funcionario_documentos to authenticated;

create or replace function public.registrar_documento_funcionario(
  p_funcionario_id uuid,
  p_tipo text,
  p_nome text,
  p_data_referencia date default null,
  p_validade date default null,
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_funcionario public.funcionarios;
  v_id uuid;
begin
  if p_tipo not in ('admissao', 'certificacao', 'epi', 'habilitacao') then
    raise exception 'Tipo de documento inválido: "%".', p_tipo;
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do documento é obrigatório.';
  end if;
  if p_validade is not null and p_data_referencia is not null and p_validade < p_data_referencia then
    raise exception 'Validade não pode ser anterior à data de referência.';
  end if;

  select * into v_funcionario from public.funcionarios
  where id = p_funcionario_id and company_id = v_company_id;
  if not found then
    raise exception 'Funcionário não encontrado nesta empresa.';
  end if;
  if v_funcionario.status = 'desligado' then
    raise exception 'Não é possível registrar documento para funcionário desligado.';
  end if;

  insert into public.funcionario_documentos (
    company_id, funcionario_id, tipo, nome, data_referencia, validade, observacoes, criado_por
  ) values (
    v_company_id, p_funcionario_id, p_tipo, p_nome, p_data_referencia, p_validade, p_observacoes, auth.uid()
  )
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'rh.documento_registrado', 'funcionario_documento', v_id, p_nome,
    jsonb_build_object('funcionario_id', p_funcionario_id, 'tipo', p_tipo, 'validade', p_validade)
  );

  return v_id;
end;
$$;

grant execute on function public.registrar_documento_funcionario(uuid, text, text, date, date, text) to authenticated;

create or replace function public.cancelar_documento_funcionario(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_row public.funcionario_documentos;
begin
  select * into v_row from public.funcionario_documentos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Documento não encontrado nesta empresa.';
  end if;
  if v_row.status = 'cancelado' then
    raise exception 'Documento já está cancelado.';
  end if;

  update public.funcionario_documentos
  set status = 'cancelado', motivo_cancelamento = p_motivo
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'rh.documento_cancelado', 'funcionario_documento', p_id, p_motivo);

  return p_id;
end;
$$;

grant execute on function public.cancelar_documento_funcionario(uuid, text) to authenticated;

-- =========================================================================
-- 2. AFASTAMENTOS E FÉRIAS (§7)
-- =========================================================================

create table public.funcionario_afastamentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  funcionario_id uuid not null references public.funcionarios(id),
  tipo text not null check (tipo in ('afastamento', 'ferias')),
  data_inicio date not null,
  data_fim date,
  motivo text,
  observacoes text,
  status text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  motivo_cancelamento text,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funcionario_afastamentos_datas_check check (data_fim is null or data_fim >= data_inicio)
);
comment on table public.funcionario_afastamentos is
  'TÓPICO 17 §7 — registro simples de período (afastamento ou férias), sem cálculo de valores/encargos. Deliberadamente desacoplado de funcionarios.status (ver cabeçalho da migration). data_fim nula = período em aberto; encerrar_afastamento() fecha; cancelar_afastamento() corrige registro errado sem apagar.';
create index funcionario_afastamentos_company_id_idx on public.funcionario_afastamentos (company_id);
create index funcionario_afastamentos_funcionario_id_idx on public.funcionario_afastamentos (funcionario_id);

create trigger set_updated_at before update on public.funcionario_afastamentos
  for each row execute function public.set_updated_at();

alter table public.funcionario_afastamentos enable row level security;
create policy funcionario_afastamentos_select on public.funcionario_afastamentos for select
  using (company_id = (select public.current_company_id()) and (select public.has_permission('rh', 'view')));

grant select on public.funcionario_afastamentos to authenticated;

create or replace function public.registrar_afastamento(
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
  v_funcionario public.funcionarios;
  v_id uuid;
begin
  if p_tipo not in ('afastamento', 'ferias') then
    raise exception 'Tipo de período inválido: "%".', p_tipo;
  end if;
  if p_data_inicio is null then
    raise exception 'Data de início é obrigatória.';
  end if;
  if p_data_fim is not null and p_data_fim < p_data_inicio then
    raise exception 'Data de fim não pode ser anterior à data de início.';
  end if;

  select * into v_funcionario from public.funcionarios
  where id = p_funcionario_id and company_id = v_company_id;
  if not found then
    raise exception 'Funcionário não encontrado nesta empresa.';
  end if;
  if v_funcionario.status = 'desligado' then
    raise exception 'Não é possível registrar período para funcionário desligado.';
  end if;

  insert into public.funcionario_afastamentos (
    company_id, funcionario_id, tipo, data_inicio, data_fim, motivo, observacoes, criado_por
  ) values (
    v_company_id, p_funcionario_id, p_tipo, p_data_inicio, p_data_fim, p_motivo, p_observacoes, auth.uid()
  )
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'rh.afastamento_registrado', 'funcionario_afastamento', v_id, p_motivo,
    jsonb_build_object('funcionario_id', p_funcionario_id, 'tipo', p_tipo, 'data_inicio', p_data_inicio, 'data_fim', p_data_fim)
  );

  return v_id;
end;
$$;

grant execute on function public.registrar_afastamento(uuid, text, date, date, text, text) to authenticated;

create or replace function public.encerrar_afastamento(p_id uuid, p_data_fim date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_row public.funcionario_afastamentos;
begin
  if p_data_fim is null then
    raise exception 'Data de fim é obrigatória para encerrar o período.';
  end if;

  select * into v_row from public.funcionario_afastamentos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Período não encontrado nesta empresa.';
  end if;
  if v_row.status = 'cancelado' then
    raise exception 'Período cancelado não pode ser encerrado.';
  end if;
  if v_row.data_fim is not null then
    raise exception 'Período já tem data de fim registrada.';
  end if;
  if p_data_fim < v_row.data_inicio then
    raise exception 'Data de fim não pode ser anterior à data de início.';
  end if;

  update public.funcionario_afastamentos set data_fim = p_data_fim where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'rh.afastamento_encerrado', 'funcionario_afastamento', p_id, p_data_fim::text);

  return p_id;
end;
$$;

grant execute on function public.encerrar_afastamento(uuid, date) to authenticated;

create or replace function public.cancelar_afastamento(p_id uuid, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('rh', 'manage');
  v_row public.funcionario_afastamentos;
begin
  select * into v_row from public.funcionario_afastamentos
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Período não encontrado nesta empresa.';
  end if;
  if v_row.status = 'cancelado' then
    raise exception 'Período já está cancelado.';
  end if;

  update public.funcionario_afastamentos
  set status = 'cancelado', motivo_cancelamento = p_motivo
  where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'rh.afastamento_cancelado', 'funcionario_afastamento', p_id, p_motivo);

  return p_id;
end;
$$;

grant execute on function public.cancelar_afastamento(uuid, text) to authenticated;
