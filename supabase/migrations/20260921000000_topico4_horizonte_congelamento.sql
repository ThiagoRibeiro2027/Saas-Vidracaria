-- TÓPICO 4 — Fase 6d da ampliação de escopo (ADR-002 v2.3, plano
-- aprovado pelo responsável do produto em 2026-09-21): horizonte e
-- congelamento da programação (§9), quarta sub-fase do bloco §5-10 (6a
-- planejamento → 6b sequenciamento → 6c decisão/simulação → 6d
-- horizonte/congelamento → 6e replanejamento).
--
-- Sub-fase mais simples do bloco até aqui — sem fórmula nem critério de
-- negócio pra inventar, só um controle de acesso adicional sobre uma
-- escrita que já existe (programar_operacao(), Fase 6a).
--
-- Decisões de recorte desta fase:
--   - Horizontes são períodos configuráveis por empresa (longo_prazo/
--     flexivel/congelado), não um calendário de turnos. Podem se
--     sobrepor — são classificações que a empresa atribui a janelas de
--     tempo, não uma partição exclusiva do calendário; exigir não-
--     sobreposição seria inventar uma regra que o §9 não pede.
--   - Só programar_operacao() (Fase 6a) fica protegida. O título do §9 é
--     "Horizonte e Congelamento da PROGRAMAÇÃO" — a programação é a
--     data planejada, não o recurso nem a prioridade da OP (que é da OP
--     inteira, podendo ter operações em janelas diferentes). decidir_
--     sequenciamento() (Fase 6c) já chama programar_operacao()
--     internamente pra aplicar mudança de data — a proteção vale ali
--     também, sem tocar naquela função.
--   - A checagem cobre a data ATUAL da operação E a NOVA data proposta —
--     só checar a atual deixaria brecha (mover uma operação sem data pra
--     dentro do período congelado não exigiria nada).
--   - "Manter histórico" (§9) já é activity_logs, que toda chamada de
--     programar_operacao() já grava desde a Fase 6a — nada novo aqui.

-- =========================================================================
-- 1. producao_horizontes — TÓPICO 4 §9. Mesmo padrão de tabela de
--    configuração simples de recursos_produtivos (Fase 5a): RLS select
--    direta + grant select, sem função listar_* dedicada.
-- =========================================================================

create table public.producao_horizontes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  tipo text not null check (tipo in ('longo_prazo', 'flexivel', 'congelado')),
  data_inicio date not null,
  data_fim date not null,
  motivo text,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint producao_horizontes_datas_check check (data_fim >= data_inicio)
);
comment on table public.producao_horizontes is 'TÓPICO 4 §9 — períodos de planejamento configurados pela empresa (longo prazo/flexível/congelado). Podem se sobrepor. Alterar a programação (programar_operacao) dentro de um período "congelado" exige producao.reprogramar_congelado.';
create index producao_horizontes_company_id_idx on public.producao_horizontes (company_id);

alter table public.producao_horizontes enable row level security;
create policy producao_horizontes_select on public.producao_horizontes for select
  using (company_id = (select public.current_company_id()));
grant select on public.producao_horizontes to authenticated;

create or replace function public.criar_horizonte_programacao(
  p_tipo text, p_data_inicio date, p_data_fim date, p_motivo text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_id uuid;
begin
  if p_tipo not in ('longo_prazo', 'flexivel', 'congelado') then
    raise exception 'Tipo de horizonte inválido: %.', p_tipo;
  end if;
  if p_data_inicio is null or p_data_fim is null then
    raise exception 'Data de início e fim são obrigatórias.';
  end if;
  if p_data_fim < p_data_inicio then
    raise exception 'Data de fim (%) não pode ser anterior à de início (%).', p_data_fim, p_data_inicio;
  end if;

  insert into public.producao_horizontes (company_id, tipo, data_inicio, data_fim, motivo, criado_por)
  values (v_company_id, p_tipo, p_data_inicio, p_data_fim, p_motivo, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.horizonte_criado', 'producao_horizonte', v_id, p_motivo,
    jsonb_build_object('tipo', p_tipo, 'data_inicio', p_data_inicio, 'data_fim', p_data_fim)
  );

  return v_id;
end;
$$;

grant execute on function public.criar_horizonte_programacao(text, date, date, text) to authenticated;

create or replace function public.remover_horizonte_programacao(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  delete from public.producao_horizontes where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Horizonte de programação não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.horizonte_removido', 'producao_horizonte', p_id, null, null);
end;
$$;

grant execute on function public.remover_horizonte_programacao(uuid) to authenticated;

-- =========================================================================
-- 2. data_em_periodo_congelado() / assert_pode_reprogramar() —
--    guarda de congelamento sobre programar_operacao() (Fase 6a).
-- =========================================================================

create or replace function public.data_em_periodo_congelado(p_data date)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null or p_data is null then
    return false;
  end if;
  return exists (
    select 1 from public.producao_horizontes
    where company_id = v_company_id and tipo = 'congelado' and p_data between data_inicio and data_fim
  );
end;
$$;

grant execute on function public.data_em_periodo_congelado(date) to authenticated;

-- Interna (sem grant) — só chamada de dentro de programar_operacao().
create or replace function public.assert_pode_reprogramar(
  p_op_lote_operacao_id uuid, p_nova_data_inicio date, p_nova_data_fim date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_data_atual date;
  v_protegido boolean := false;
begin
  select data_planejada_inicio into v_data_atual
  from public.op_lote_operacoes where id = p_op_lote_operacao_id and company_id = v_company_id;

  if public.data_em_periodo_congelado(v_data_atual)
    or public.data_em_periodo_congelado(p_nova_data_inicio)
    or public.data_em_periodo_congelado(p_nova_data_fim)
  then
    v_protegido := true;
  end if;

  if v_protegido and not public.has_permission('producao', 'reprogramar_congelado') then
    raise exception 'Operação dentro de período congelado (TÓPICO 4 §9) — requer permissão producao.reprogramar_congelado.';
  end if;
end;
$$;

-- programar_operacao() (Fase 6a) — mesma assinatura, ganha a guarda de
-- congelamento logo após assert_tenant_write.
create or replace function public.programar_operacao(
  p_op_lote_operacao_id uuid, p_data_planejada_inicio date, p_data_planejada_fim date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  perform public.assert_pode_reprogramar(p_op_lote_operacao_id, p_data_planejada_inicio, p_data_planejada_fim);

  if p_data_planejada_inicio is not null and p_data_planejada_fim is not null
    and p_data_planejada_fim < p_data_planejada_inicio then
    raise exception 'Data planejada de fim (%) não pode ser anterior à de início (%).', p_data_planejada_fim, p_data_planejada_inicio;
  end if;

  update public.op_lote_operacoes set
    data_planejada_inicio = p_data_planejada_inicio,
    data_planejada_fim = p_data_planejada_fim
  where id = p_op_lote_operacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.operacao_programada', 'op_lote_operacao', p_op_lote_operacao_id, null,
    jsonb_build_object('data_planejada_inicio', p_data_planejada_inicio, 'data_planejada_fim', p_data_planejada_fim)
  );
end;
$$;
