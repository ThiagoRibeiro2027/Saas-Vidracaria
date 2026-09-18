-- TÓPICO 4 — Fase 5b da ampliação de escopo (ADR-002 v2.3, plano
-- aprovado pelo responsável do produto em 2026-09-17): manutenção e
-- impacto no PCP (§33-36), segunda de 3 sub-fases (5a recursos e
-- capacidade → 5b → 5c gargalos).
--
-- O cadastro de equipamentos do §33 já está coberto por
-- recursos_produtivos (Fase 5a) — mesma lista de situações. Esta fase
-- só acrescenta o que faltava: localizacao (§33), manutenção preventiva
-- (§34), corretiva (§35) e análise de impacto no PCP (§36).
--
-- Decisões de recorte desta fase:
--   - "Operações compatíveis" do §33 não vira uma matriz de
--     compatibilidade formal — a "busca por recursos alternativos" do
--     §36 usa uma heurística simples (mesmo tipo de recurso, situação
--     disponível), sem inventar um cadastro de compatibilidade que
--     nenhum ADR detalha.
--   - Manutenção preventiva é só um agendamento (recurso, tipo,
--     periodicidade, próxima data, duração estimada) — sem ciclo de
--     vida próprio nem job agendado que recalcula a próxima data
--     automaticamente após passar; o PCP atualiza manualmente depois de
--     executada (job automático é Release 1).
--   - "Considerada na capacidade futura" (§34) = calcular_capacidade_
--     recurso() (Fase 5a) desconta as horas de manutenção preventiva
--     agendada dentro da janela de dias consultada. Não desconta a
--     capacidade do dia corrente por causa da situação atual do recurso
--     (em_manutencao/parado/etc.) — isso exigiria saber quantas horas do
--     dia já se passaram, o que não está definido em nenhum ADR.
--   - "Registrar a reprogramação" (§36) reaproveita o que já existe, sem
--     motor novo: transferir_recurso_operacao() (Fase 3, §13) pra
--     operação com produção dividida entre recursos; trocar_recurso_
--     operacao() (nova, só troca direta) pro caso comum de recurso
--     único. Decisão de reprogramar continua manual — sem sequenciamento
--     automático (§6-10 não existem).

-- =========================================================================
-- 1. recursos_produtivos ganha localizacao (§33).
-- =========================================================================

alter table public.recursos_produtivos add column localizacao text;

drop function if exists public.criar_recurso_produtivo(text, text, text, text, numeric);

create function public.criar_recurso_produtivo(
  p_codigo text, p_nome text, p_tipo text, p_setor text default null, p_capacidade_horas_dia numeric default null,
  p_localizacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_id uuid;
begin
  if p_codigo is null or btrim(p_codigo) = '' then
    raise exception 'Código do recurso é obrigatório.';
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do recurso é obrigatório.';
  end if;
  if p_tipo not in ('maquina', 'equipamento', 'linha', 'posto', 'equipe', 'operador', 'ferramenta', 'dispositivo') then
    raise exception 'Tipo de recurso inválido: %.', p_tipo;
  end if;
  if p_capacidade_horas_dia is not null and p_capacidade_horas_dia <= 0 then
    raise exception 'Capacidade em horas/dia deve ser maior que zero.';
  end if;

  insert into public.recursos_produtivos (company_id, codigo, nome, tipo, setor, capacidade_horas_dia, localizacao)
  values (v_company_id, btrim(p_codigo), btrim(p_nome), p_tipo, p_setor, p_capacidade_horas_dia, p_localizacao)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_criado', 'recurso_produtivo', v_id, p_nome, jsonb_build_object('tipo', p_tipo));

  return v_id;
end;
$$;

grant execute on function public.criar_recurso_produtivo(text, text, text, text, numeric, text) to authenticated;

drop function if exists public.editar_recurso_produtivo(uuid, text, text, numeric);

create function public.editar_recurso_produtivo(
  p_id uuid, p_nome text, p_setor text default null, p_capacidade_horas_dia numeric default null, p_localizacao text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome do recurso é obrigatório.';
  end if;
  if p_capacidade_horas_dia is not null and p_capacidade_horas_dia <= 0 then
    raise exception 'Capacidade em horas/dia deve ser maior que zero.';
  end if;

  update public.recursos_produtivos set
    nome = btrim(p_nome), setor = p_setor, capacidade_horas_dia = p_capacidade_horas_dia, localizacao = p_localizacao
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_editado', 'recurso_produtivo', p_id, p_nome, null);
end;
$$;

grant execute on function public.editar_recurso_produtivo(uuid, text, text, numeric, text) to authenticated;

-- =========================================================================
-- 2. manutencoes_preventivas — TÓPICO 4 §34.
-- =========================================================================

create table public.manutencoes_preventivas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  recurso_produtivo_id uuid not null references public.recursos_produtivos(id),
  tipo text not null,
  periodicidade_dias int check (periodicidade_dias is null or periodicidade_dias > 0),
  proxima_data date not null,
  duracao_estimada_horas numeric(6, 2) check (duracao_estimada_horas is null or duracao_estimada_horas > 0),
  responsavel_id uuid references public.profiles(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.manutencoes_preventivas is 'TÓPICO 4 §34 — agendamento de manutenção preventiva. Sem ciclo de vida próprio nem job automático: PCP atualiza proxima_data manualmente após executar. calcular_capacidade_recurso() desconta duracao_estimada_horas das que caem dentro da janela consultada.';
create index manutencoes_preventivas_recurso_id_idx on public.manutencoes_preventivas (recurso_produtivo_id);

create trigger set_updated_at before update on public.manutencoes_preventivas
  for each row execute function public.set_updated_at();

alter table public.manutencoes_preventivas enable row level security;
create policy manutencoes_preventivas_select on public.manutencoes_preventivas for select
  using (company_id = (select public.current_company_id()));
grant select on public.manutencoes_preventivas to authenticated;

create or replace function public.programar_manutencao_preventiva(
  p_recurso_produtivo_id uuid, p_tipo text, p_proxima_data date, p_periodicidade_dias int default null,
  p_duracao_estimada_horas numeric default null, p_responsavel_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_id uuid;
begin
  if p_tipo is null or btrim(p_tipo) = '' then
    raise exception 'Tipo de manutenção é obrigatório.';
  end if;
  if p_proxima_data is null then
    raise exception 'Próxima data é obrigatória.';
  end if;
  if p_periodicidade_dias is not null and p_periodicidade_dias <= 0 then
    raise exception 'Periodicidade deve ser maior que zero.';
  end if;
  if p_duracao_estimada_horas is not null and p_duracao_estimada_horas <= 0 then
    raise exception 'Duração estimada deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;
  if p_responsavel_id is not null and not exists (select 1 from public.profiles where id = p_responsavel_id and company_id = v_company_id) then
    raise exception 'Responsável não encontrado nesta empresa.';
  end if;

  insert into public.manutencoes_preventivas (
    company_id, recurso_produtivo_id, tipo, periodicidade_dias, proxima_data, duracao_estimada_horas, responsavel_id
  ) values (
    v_company_id, p_recurso_produtivo_id, btrim(p_tipo), p_periodicidade_dias, p_proxima_data, p_duracao_estimada_horas, p_responsavel_id
  ) returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.manutencao_preventiva_programada', 'recurso_produtivo', p_recurso_produtivo_id, p_tipo,
    jsonb_build_object('manutencao_preventiva_id', v_id, 'proxima_data', p_proxima_data)
  );

  return v_id;
end;
$$;

grant execute on function public.programar_manutencao_preventiva(uuid, text, date, int, numeric, uuid) to authenticated;

create or replace function public.editar_manutencao_preventiva(
  p_id uuid, p_proxima_data date, p_periodicidade_dias int default null,
  p_duracao_estimada_horas numeric default null, p_responsavel_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  if p_proxima_data is null then
    raise exception 'Próxima data é obrigatória.';
  end if;
  if p_periodicidade_dias is not null and p_periodicidade_dias <= 0 then
    raise exception 'Periodicidade deve ser maior que zero.';
  end if;
  if p_duracao_estimada_horas is not null and p_duracao_estimada_horas <= 0 then
    raise exception 'Duração estimada deve ser maior que zero.';
  end if;
  if p_responsavel_id is not null and not exists (select 1 from public.profiles where id = p_responsavel_id and company_id = v_company_id) then
    raise exception 'Responsável não encontrado nesta empresa.';
  end if;

  update public.manutencoes_preventivas set
    proxima_data = p_proxima_data, periodicidade_dias = p_periodicidade_dias,
    duracao_estimada_horas = p_duracao_estimada_horas, responsavel_id = p_responsavel_id
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Manutenção preventiva não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.manutencao_preventiva_editada', 'manutencao_preventiva', p_id, null,
    jsonb_build_object('proxima_data', p_proxima_data)
  );
end;
$$;

grant execute on function public.editar_manutencao_preventiva(uuid, date, int, numeric, uuid) to authenticated;

create or replace function public.cancelar_manutencao_preventiva(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  update public.manutencoes_preventivas set ativo = false where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Manutenção preventiva não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.manutencao_preventiva_cancelada', 'manutencao_preventiva', p_id, null, null);
end;
$$;

grant execute on function public.cancelar_manutencao_preventiva(uuid) to authenticated;

-- =========================================================================
-- 3. manutencoes_corretivas — TÓPICO 4 §35.
-- =========================================================================

create table public.manutencoes_corretivas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  recurso_produtivo_id uuid not null references public.recursos_produtivos(id),
  inicio_parada timestamptz not null default now(),
  problema text not null,
  motivo text,
  responsavel_id uuid references public.profiles(id),
  previsao_retorno timestamptz,
  retorno_efetivo timestamptz,
  pecas text,
  servicos text,
  observacoes text,
  status text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  created_at timestamptz not null default now()
);
comment on table public.manutencoes_corretivas is 'TÓPICO 4 §35 — parada não planejada. iniciar_manutencao_corretiva() muda recursos_produtivos.situacao pra em_manutencao; encerrar_manutencao_corretiva() devolve pra disponivel.';
create index manutencoes_corretivas_recurso_id_idx on public.manutencoes_corretivas (recurso_produtivo_id);
-- No máximo uma manutenção corretiva aberta por recurso.
create unique index manutencoes_corretivas_aberta_unique on public.manutencoes_corretivas (recurso_produtivo_id) where status = 'aberta';

alter table public.manutencoes_corretivas enable row level security;
create policy manutencoes_corretivas_select on public.manutencoes_corretivas for select
  using (company_id = (select public.current_company_id()));
grant select on public.manutencoes_corretivas to authenticated;

create or replace function public.iniciar_manutencao_corretiva(
  p_recurso_produtivo_id uuid, p_problema text, p_motivo text default null,
  p_previsao_retorno timestamptz default null, p_responsavel_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_id uuid;
begin
  if p_problema is null or btrim(p_problema) = '' then
    raise exception 'Descrição do problema é obrigatória.';
  end if;
  if not exists (select 1 from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;
  if p_responsavel_id is not null and not exists (select 1 from public.profiles where id = p_responsavel_id and company_id = v_company_id) then
    raise exception 'Responsável não encontrado nesta empresa.';
  end if;
  if exists (select 1 from public.manutencoes_corretivas where recurso_produtivo_id = p_recurso_produtivo_id and status = 'aberta') then
    raise exception 'Já existe manutenção corretiva aberta para este recurso.';
  end if;

  insert into public.manutencoes_corretivas (
    company_id, recurso_produtivo_id, problema, motivo, previsao_retorno, responsavel_id
  ) values (
    v_company_id, p_recurso_produtivo_id, btrim(p_problema), p_motivo, p_previsao_retorno, p_responsavel_id
  ) returning id into v_id;

  update public.recursos_produtivos set situacao = 'em_manutencao', motivo_situacao = p_problema
  where id = p_recurso_produtivo_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.manutencao_corretiva_iniciada', 'recurso_produtivo', p_recurso_produtivo_id, p_problema,
    jsonb_build_object('manutencao_corretiva_id', v_id)
  );

  return v_id;
end;
$$;

grant execute on function public.iniciar_manutencao_corretiva(uuid, text, text, timestamptz, uuid) to authenticated;

create or replace function public.encerrar_manutencao_corretiva(
  p_id uuid, p_pecas text default null, p_servicos text default null, p_observacoes text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_manutencao public.manutencoes_corretivas;
begin
  select * into v_manutencao from public.manutencoes_corretivas
  where id = p_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Manutenção corretiva não encontrada nesta empresa.';
  end if;
  if v_manutencao.status = 'encerrada' then
    raise exception 'Manutenção corretiva já encerrada.';
  end if;

  update public.manutencoes_corretivas set
    status = 'encerrada', retorno_efetivo = now(), pecas = p_pecas, servicos = p_servicos, observacoes = p_observacoes
  where id = p_id;

  update public.recursos_produtivos set situacao = 'disponivel', motivo_situacao = null
  where id = v_manutencao.recurso_produtivo_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.manutencao_corretiva_encerrada', 'manutencao_corretiva', p_id, null,
    jsonb_build_object('recurso_produtivo_id', v_manutencao.recurso_produtivo_id)
  );
end;
$$;

grant execute on function public.encerrar_manutencao_corretiva(uuid, text, text, text) to authenticated;

-- =========================================================================
-- 4. calcular_capacidade_recurso() — desconta manutenção preventiva
--    agendada dentro da janela de dias consultada (§34).
-- =========================================================================

create or replace function public.calcular_capacidade_recurso(p_recurso_produtivo_id uuid, p_dias int default 7)
returns table (
  recurso_produtivo_id uuid,
  capacidade_disponivel_horas numeric,
  capacidade_necessaria_horas numeric,
  saldo_horas numeric,
  classificacao text
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_recurso public.recursos_produtivos;
  v_disponivel numeric;
  v_necessaria numeric;
  v_manutencao_horas numeric;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
  end if;
  if p_dias is null or p_dias <= 0 then
    raise exception 'Dias deve ser maior que zero.';
  end if;

  select * into v_recurso from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id;
  if not found then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  select coalesce(sum(mp.duracao_estimada_horas), 0) into v_manutencao_horas
  from public.manutencoes_preventivas mp
  where mp.recurso_produtivo_id = p_recurso_produtivo_id
    and mp.company_id = v_company_id
    and mp.ativo
    and mp.proxima_data >= current_date
    and mp.proxima_data < current_date + p_dias;

  v_disponivel := coalesce(v_recurso.capacidade_horas_dia, 0) * p_dias - v_manutencao_horas;

  -- Alias obrigatório: sem ele, "recurso_produtivo_id" é ambíguo entre a
  -- coluna de retorno da função (RETURNS TABLE) e a coluna da tabela.
  select coalesce(sum((olo.quantidade_planejada - olo.quantidade_produzida) * olo.tempo_previsto_minutos / 60.0), 0)
  into v_necessaria
  from public.op_lote_operacoes olo
  where olo.recurso_produtivo_id = p_recurso_produtivo_id
    and olo.company_id = v_company_id
    and olo.status <> 'concluida'
    and olo.tempo_previsto_minutos is not null;

  return query select
    v_recurso.id,
    v_disponivel,
    v_necessaria,
    v_disponivel - v_necessaria,
    case
      when v_disponivel <= 0 then 'sobrecarga'
      when v_necessaria > v_disponivel then 'sobrecarga'
      when v_necessaria = 0 then 'ociosa'
      else 'normal'
    end;
end;
$$;

grant execute on function public.calcular_capacidade_recurso(uuid, int) to authenticated;

-- =========================================================================
-- 5. analisar_impacto_manutencao() / listar_recursos_alternativos() /
--    trocar_recurso_operacao() — TÓPICO 4 §36.
-- =========================================================================

create or replace function public.analisar_impacto_manutencao(p_recurso_produtivo_id uuid)
returns table (
  origem text,
  op_lote_operacao_id uuid,
  op_lote_operacao_recurso_id uuid,
  ordem_producao_id uuid,
  ordem_producao_numero text,
  descricao_operacao text,
  saldo_pendente numeric,
  impacto_horas numeric
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
  end if;
  if not exists (select 1 from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  return query
  select
    'operacao'::text,
    olo.id,
    null::uuid,
    olo.ordem_producao_id,
    ord.numero,
    olo.descricao,
    olo.quantidade_planejada - olo.quantidade_produzida,
    case when olo.tempo_previsto_minutos is not null
      then (olo.quantidade_planejada - olo.quantidade_produzida) * olo.tempo_previsto_minutos / 60.0
      else null end
  from public.op_lote_operacoes olo
  join public.ordens_producao ord on ord.id = olo.ordem_producao_id
  where olo.recurso_produtivo_id = p_recurso_produtivo_id
    and olo.company_id = v_company_id
    and olo.status <> 'concluida'

  union all

  select
    'split_recurso'::text,
    olo.id,
    olor.id,
    olo.ordem_producao_id,
    ord.numero,
    olo.descricao,
    olor.quantidade_alocada - olor.quantidade_produzida,
    case when olo.tempo_previsto_minutos is not null
      then (olor.quantidade_alocada - olor.quantidade_produzida) * olo.tempo_previsto_minutos / 60.0
      else null end
  from public.op_lote_operacao_recursos olor
  join public.op_lote_operacoes olo on olo.id = olor.op_lote_operacao_id
  join public.ordens_producao ord on ord.id = olo.ordem_producao_id
  where olor.recurso_produtivo_id = p_recurso_produtivo_id
    and olor.company_id = v_company_id
    and olor.status <> 'concluida';
end;
$$;

grant execute on function public.analisar_impacto_manutencao(uuid) to authenticated;

create or replace function public.listar_recursos_alternativos(p_recurso_produtivo_id uuid)
returns table (id uuid, codigo text, nome text)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_tipo text;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
  end if;

  select r.tipo into v_tipo from public.recursos_produtivos r where r.id = p_recurso_produtivo_id and r.company_id = v_company_id;
  if not found then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  return query
  select r.id, r.codigo, r.nome from public.recursos_produtivos r
  where r.company_id = v_company_id and r.tipo = v_tipo and r.situacao = 'disponivel' and r.ativo and r.id <> p_recurso_produtivo_id
  order by r.codigo;
end;
$$;

grant execute on function public.listar_recursos_alternativos(uuid) to authenticated;

create or replace function public.trocar_recurso_operacao(
  p_op_lote_operacao_id uuid, p_novo_recurso_produtivo_id uuid, p_motivo text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_operacao public.op_lote_operacoes;
  v_recurso_anterior_id uuid;
begin
  if p_novo_recurso_produtivo_id is null then
    raise exception 'Novo recurso é obrigatório.';
  end if;
  if not exists (select 1 from public.recursos_produtivos where id = p_novo_recurso_produtivo_id and company_id = v_company_id) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  select * into v_operacao from public.op_lote_operacoes
  where id = p_op_lote_operacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;
  if v_operacao.status = 'concluida' then
    raise exception 'Operação já concluída não pode trocar de recurso.';
  end if;

  v_recurso_anterior_id := v_operacao.recurso_produtivo_id;

  update public.op_lote_operacoes set recurso_produtivo_id = p_novo_recurso_produtivo_id
  where id = p_op_lote_operacao_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.recurso_operacao_trocado', 'op_lote_operacao', p_op_lote_operacao_id, p_motivo,
    jsonb_build_object('recurso_anterior_id', v_recurso_anterior_id, 'recurso_novo_id', p_novo_recurso_produtivo_id)
  );
end;
$$;

grant execute on function public.trocar_recurso_operacao(uuid, uuid, text) to authenticated;
