-- TÓPICO 4 — Fase 5a da ampliação de escopo (ADR-002 v2.3, plano
-- aprovado pelo responsável do produto em 2026-09-17): recursos
-- produtivos e capacidade (§31-32), primeira de 3 sub-fases (5a → 5b
-- manutenção §33-36 → 5c gargalos §37).
--
-- Decisão de escopo (aprovada pelo responsável do produto): os campos de
-- "recurso" hoje texto livre (roteiro_operacoes.recurso_necessario da
-- Fase 2, op_lote_operacao_recursos.recurso da Fase 3) migram pra
-- referenciar o cadastro formal novo (recursos_produtivos), em vez de
-- coexistir como dois modelos separados.
--
-- Decisões de recorte desta fase:
--   - "Turnos e jornadas" (§31) viram um único campo simples
--     (capacidade_horas_dia por recurso) — sem calendário completo de
--     turnos, exceções e feriados, que é Release 1. É o corte mínimo pra
--     ter um número de "disponível" utilizável sem inventar um sistema
--     de calendário que nenhum ADR pede em detalhe.
--   - "Necessidade" de capacidade é calculada a partir de
--     tempo_previsto_minutos × saldo pendente das op_lote_operacoes que
--     referenciam o recurso — reaproveita o campo que a Fase 2 já
--     criava (até aqui, sem consumidor real).
--   - Sem sequenciamento nem simulação (§6-10 não existem ainda):
--     calcular_capacidade_recurso()/listar_capacidade_recursos() são
--     leitura/alerta pro PCP decidir, não um motor de decisão.
--   - Backfill: valores de texto livre já existentes viram recursos_
--     produtivos com tipo='equipamento' por padrão (placeholder, já que
--     o texto livre não guardava o tipo) — precisam de revisão manual de
--     classificação depois da migração, registrado em comentário de
--     coluna.

-- =========================================================================
-- 1. recursos_produtivos — cadastro (§31-32).
-- =========================================================================

create table public.recursos_produtivos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  codigo text not null,
  nome text not null,
  tipo text not null check (tipo in ('maquina', 'equipamento', 'linha', 'posto', 'equipe', 'operador', 'ferramenta', 'dispositivo')),
  setor text,
  capacidade_horas_dia numeric(6, 2) check (capacidade_horas_dia is null or capacidade_horas_dia > 0),
  situacao text not null default 'disponivel' check (situacao in (
    'disponivel', 'em_producao', 'programado_manutencao', 'em_manutencao', 'parado',
    'indisponivel', 'aguardando_peca', 'aguardando_ferramenta', 'aguardando_operador', 'bloqueado', 'outros'
  )),
  motivo_situacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recursos_produtivos_company_codigo_unique unique (company_id, codigo)
);
comment on table public.recursos_produtivos is 'TÓPICO 4 §31-32 — cadastro de recursos produtivos (máquina/equipamento/linha/posto/equipe/operador/ferramenta/dispositivo). capacidade_horas_dia é um modelo simples (sem turnos/calendário — Release 1). situacao segue os valores do §33.';
create index recursos_produtivos_company_id_idx on public.recursos_produtivos (company_id);

create trigger set_updated_at before update on public.recursos_produtivos
  for each row execute function public.set_updated_at();

alter table public.recursos_produtivos enable row level security;
create policy recursos_produtivos_select on public.recursos_produtivos for select
  using (company_id = (select public.current_company_id()));
grant select on public.recursos_produtivos to authenticated;

create or replace function public.criar_recurso_produtivo(
  p_codigo text, p_nome text, p_tipo text, p_setor text default null, p_capacidade_horas_dia numeric default null
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

  insert into public.recursos_produtivos (company_id, codigo, nome, tipo, setor, capacidade_horas_dia)
  values (v_company_id, btrim(p_codigo), btrim(p_nome), p_tipo, p_setor, p_capacidade_horas_dia)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_criado', 'recurso_produtivo', v_id, p_nome, jsonb_build_object('tipo', p_tipo));

  return v_id;
end;
$$;

grant execute on function public.criar_recurso_produtivo(text, text, text, text, numeric) to authenticated;

create or replace function public.editar_recurso_produtivo(
  p_id uuid, p_nome text, p_setor text default null, p_capacidade_horas_dia numeric default null
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

  update public.recursos_produtivos set nome = btrim(p_nome), setor = p_setor, capacidade_horas_dia = p_capacidade_horas_dia
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_editado', 'recurso_produtivo', p_id, p_nome, null);
end;
$$;

grant execute on function public.editar_recurso_produtivo(uuid, text, text, numeric) to authenticated;

create or replace function public.atualizar_situacao_recurso(p_id uuid, p_situacao text, p_motivo text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  if p_situacao not in (
    'disponivel', 'em_producao', 'programado_manutencao', 'em_manutencao', 'parado',
    'indisponivel', 'aguardando_peca', 'aguardando_ferramenta', 'aguardando_operador', 'bloqueado', 'outros'
  ) then
    raise exception 'Situação inválida: %.', p_situacao;
  end if;

  update public.recursos_produtivos set situacao = p_situacao, motivo_situacao = p_motivo
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.recurso_produtivo_situacao_alterada', 'recurso_produtivo', p_id, p_motivo,
    jsonb_build_object('situacao', p_situacao)
  );
end;
$$;

grant execute on function public.atualizar_situacao_recurso(uuid, text, text) to authenticated;

create or replace function public.desativar_recurso_produtivo(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
begin
  update public.recursos_produtivos set ativo = false where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_desativado', 'recurso_produtivo', p_id, null, null);
end;
$$;

grant execute on function public.desativar_recurso_produtivo(uuid) to authenticated;

-- =========================================================================
-- 2. Migração de "recurso" texto livre pra recurso_produtivo_id.
--    Backfill primeiro (cria 1 recurso_produtivo por valor distinto já
--    usado, por empresa), depois troca a coluna.
-- =========================================================================

insert into public.recursos_produtivos (company_id, codigo, nome, tipo)
select distinct company_id, recurso_necessario, recurso_necessario, 'equipamento'
from public.roteiro_operacoes
where recurso_necessario is not null and btrim(recurso_necessario) <> ''
on conflict (company_id, codigo) do nothing;

insert into public.recursos_produtivos (company_id, codigo, nome, tipo)
select distinct company_id, recurso_necessario, recurso_necessario, 'equipamento'
from public.op_lote_operacoes
where recurso_necessario is not null and btrim(recurso_necessario) <> ''
on conflict (company_id, codigo) do nothing;

insert into public.recursos_produtivos (company_id, codigo, nome, tipo)
select distinct company_id, recurso, recurso, 'equipamento'
from public.op_lote_operacao_recursos
where recurso is not null and btrim(recurso) <> ''
on conflict (company_id, codigo) do nothing;

alter table public.roteiro_operacoes add column recurso_produtivo_id uuid references public.recursos_produtivos(id);
update public.roteiro_operacoes ro set recurso_produtivo_id = rp.id
from public.recursos_produtivos rp
where rp.company_id = ro.company_id and rp.codigo = ro.recurso_necessario;
alter table public.roteiro_operacoes drop column recurso_necessario;
comment on column public.roteiro_operacoes.recurso_produtivo_id is 'TÓPICO 4 §32 — recurso formal exigido pela operação (opcional). Migrado de texto livre em 20260917030000; valores pré-existentes viraram recursos_produtivos com tipo=equipamento por padrão — revisar classificação manualmente.';

alter table public.op_lote_operacoes add column recurso_produtivo_id uuid references public.recursos_produtivos(id);
update public.op_lote_operacoes olo set recurso_produtivo_id = rp.id
from public.recursos_produtivos rp
where rp.company_id = olo.company_id and rp.codigo = olo.recurso_necessario;
alter table public.op_lote_operacoes drop column recurso_necessario;

alter table public.op_lote_operacao_recursos add column recurso_produtivo_id uuid references public.recursos_produtivos(id);
update public.op_lote_operacao_recursos olor set recurso_produtivo_id = rp.id
from public.recursos_produtivos rp
where rp.company_id = olor.company_id and rp.codigo = olor.recurso;
alter table public.op_lote_operacao_recursos alter column recurso_produtivo_id set not null;
alter table public.op_lote_operacao_recursos drop column recurso;

-- =========================================================================
-- 3. Funções que referenciavam o texto livre — atualizadas pra
--    recurso_produtivo_id.
-- =========================================================================

create or replace function public.criar_op_lote_operacoes(
  p_company_id uuid, p_ordem_producao_id uuid, p_item_id uuid, p_op_lote_id uuid, p_quantidade numeric
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_roteiro_id uuid;
  v_roteiro_operacao record;
begin
  select id into v_roteiro_id from public.roteiros_produtivos
  where item_id = p_item_id and company_id = p_company_id and ativo;

  if v_roteiro_id is not null then
    for v_roteiro_operacao in
      select * from public.roteiro_operacoes where roteiro_id = v_roteiro_id order by sequencia
    loop
      insert into public.op_lote_operacoes (
        company_id, ordem_producao_id, op_lote_id, roteiro_operacao_id, sequencia, descricao, recurso_produtivo_id,
        tempo_previsto_minutos, requisitos, criterios_qualidade, equipamentos_alternativos, quantidade_planejada
      ) values (
        p_company_id, p_ordem_producao_id, p_op_lote_id, v_roteiro_operacao.id, v_roteiro_operacao.sequencia,
        v_roteiro_operacao.descricao, v_roteiro_operacao.recurso_produtivo_id, v_roteiro_operacao.tempo_previsto_minutos,
        v_roteiro_operacao.requisitos, v_roteiro_operacao.criterios_qualidade, v_roteiro_operacao.equipamentos_alternativos,
        p_quantidade
      );
    end loop;
  else
    insert into public.op_lote_operacoes (company_id, ordem_producao_id, op_lote_id, sequencia, descricao, quantidade_planejada)
    values (p_company_id, p_ordem_producao_id, p_op_lote_id, 1, 'Produção', p_quantidade);
  end if;
end;
$$;

drop function if exists public.adicionar_operacao_roteiro(uuid, int, text, text, numeric, text, text, text);

create function public.adicionar_operacao_roteiro(
  p_roteiro_id uuid,
  p_sequencia int,
  p_descricao text,
  p_recurso_produtivo_id uuid default null,
  p_tempo_previsto_minutos numeric default null,
  p_requisitos text default null,
  p_criterios_qualidade text default null,
  p_equipamentos_alternativos text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_id uuid;
begin
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição da operação é obrigatória.';
  end if;
  if p_sequencia is null or p_sequencia <= 0 then
    raise exception 'Sequência deve ser maior que zero.';
  end if;
  if not exists (select 1 from public.roteiros_produtivos where id = p_roteiro_id and company_id = v_company_id) then
    raise exception 'Roteiro não encontrado nesta empresa.';
  end if;
  if p_recurso_produtivo_id is not null and not exists (
    select 1 from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id
  ) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.roteiro_operacoes (
    company_id, roteiro_id, sequencia, descricao, recurso_produtivo_id,
    tempo_previsto_minutos, requisitos, criterios_qualidade, equipamentos_alternativos
  ) values (
    v_company_id, p_roteiro_id, p_sequencia, btrim(p_descricao), p_recurso_produtivo_id,
    p_tempo_previsto_minutos, p_requisitos, p_criterios_qualidade, p_equipamentos_alternativos
  ) returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.operacao_roteiro_adicionada', 'roteiro_produtivo', p_roteiro_id, p_descricao,
    jsonb_build_object('roteiro_operacao_id', v_id, 'sequencia', p_sequencia)
  );

  return v_id;
end;
$$;

grant execute on function public.adicionar_operacao_roteiro(uuid, int, text, uuid, numeric, text, text, text) to authenticated;

drop function if exists public.alocar_recurso_operacao(uuid, text, numeric);

create function public.alocar_recurso_operacao(
  p_op_lote_operacao_id uuid, p_recurso_produtivo_id uuid, p_quantidade numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_operacao public.op_lote_operacoes;
  v_ja_alocado numeric;
  v_id uuid;
begin
  if p_recurso_produtivo_id is null then
    raise exception 'Recurso é obrigatório.';
  end if;
  if not exists (select 1 from public.recursos_produtivos where id = p_recurso_produtivo_id and company_id = v_company_id) then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select * into v_operacao from public.op_lote_operacoes
  where id = p_op_lote_operacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;

  select coalesce(sum(quantidade_alocada), 0) into v_ja_alocado
  from public.op_lote_operacao_recursos where op_lote_operacao_id = p_op_lote_operacao_id;

  if v_ja_alocado + p_quantidade > v_operacao.quantidade_planejada then
    raise exception 'Quantidade alocada (%) somada à já alocada (%) excede o planejado da operação (%).',
      p_quantidade, v_ja_alocado, v_operacao.quantidade_planejada;
  end if;

  insert into public.op_lote_operacao_recursos (company_id, op_lote_operacao_id, recurso_produtivo_id, quantidade_alocada)
  values (v_company_id, p_op_lote_operacao_id, p_recurso_produtivo_id, p_quantidade)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.recurso_alocado', 'op_lote_operacao', p_op_lote_operacao_id, null,
    jsonb_build_object('op_lote_operacao_recurso_id', v_id, 'recurso_produtivo_id', p_recurso_produtivo_id, 'quantidade', p_quantidade)
  );

  return v_id;
end;
$$;

grant execute on function public.alocar_recurso_operacao(uuid, uuid, numeric) to authenticated;

drop function if exists public.transferir_recurso_operacao(uuid, text, numeric);

create function public.transferir_recurso_operacao(
  p_op_lote_operacao_recurso_id uuid, p_recurso_produtivo_destino_id uuid, p_quantidade numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_origem public.op_lote_operacao_recursos;
  v_destino public.op_lote_operacao_recursos;
  v_saldo numeric;
  v_id uuid;
begin
  if p_recurso_produtivo_destino_id is null then
    raise exception 'Recurso de destino é obrigatório.';
  end if;
  if not exists (select 1 from public.recursos_produtivos where id = p_recurso_produtivo_destino_id and company_id = v_company_id) then
    raise exception 'Recurso produtivo de destino não encontrado nesta empresa.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select * into v_origem from public.op_lote_operacao_recursos
  where id = p_op_lote_operacao_recurso_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Recurso de origem não encontrado nesta empresa.';
  end if;

  v_saldo := v_origem.quantidade_alocada - v_origem.quantidade_produzida;
  if p_quantidade > v_saldo then
    raise exception 'Quantidade a transferir (%) excede o saldo do recurso de origem (%).', p_quantidade, v_saldo;
  end if;

  update public.op_lote_operacao_recursos set
    quantidade_alocada = quantidade_alocada - p_quantidade,
    status = case
      when quantidade_produzida = 0 then status
      when quantidade_produzida >= quantidade_alocada - p_quantidade then 'concluida'
      else 'em_andamento'
    end
  where id = p_op_lote_operacao_recurso_id;

  select * into v_destino from public.op_lote_operacao_recursos
  where op_lote_operacao_id = v_origem.op_lote_operacao_id and recurso_produtivo_id = p_recurso_produtivo_destino_id and company_id = v_company_id
  for update;

  if found then
    update public.op_lote_operacao_recursos set
      quantidade_alocada = quantidade_alocada + p_quantidade,
      status = case
        when quantidade_produzida = 0 then status
        when quantidade_produzida >= quantidade_alocada + p_quantidade then 'concluida'
        else 'em_andamento'
      end
    where id = v_destino.id;
    v_id := v_destino.id;
  else
    insert into public.op_lote_operacao_recursos (
      company_id, op_lote_operacao_id, recurso_produtivo_id, quantidade_alocada, transferido_de_id
    ) values (
      v_company_id, v_origem.op_lote_operacao_id, p_recurso_produtivo_destino_id, p_quantidade, p_op_lote_operacao_recurso_id
    ) returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.recurso_transferido', 'op_lote_operacao_recurso', p_op_lote_operacao_recurso_id, null,
    jsonb_build_object(
      'origem_id', p_op_lote_operacao_recurso_id, 'destino_id', v_id, 'quantidade', p_quantidade,
      'recurso_produtivo_destino_id', p_recurso_produtivo_destino_id
    )
  );

  return v_id;
end;
$$;

grant execute on function public.transferir_recurso_operacao(uuid, uuid, numeric) to authenticated;

-- =========================================================================
-- 4. calcular_capacidade_recurso() / listar_capacidade_recursos() —
--    TÓPICO 4 §31: capacidade disponível × necessária. Necessidade soma
--    tempo_previsto_minutos × saldo pendente das op_lote_operacoes que
--    referenciam o recurso. Leitura/alerta pro PCP — sem sequenciamento
--    nem simulação (§6-10 não implementados).
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

  v_disponivel := coalesce(v_recurso.capacidade_horas_dia, 0) * p_dias;

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
      when v_disponivel = 0 then 'sem_capacidade_cadastrada'
      when v_necessaria > v_disponivel then 'sobrecarga'
      when v_necessaria = 0 then 'ociosa'
      else 'normal'
    end;
end;
$$;

grant execute on function public.calcular_capacidade_recurso(uuid, int) to authenticated;

create or replace function public.listar_capacidade_recursos(p_dias int default 7)
returns table (
  recurso_produtivo_id uuid,
  codigo text,
  nome text,
  tipo text,
  situacao text,
  capacidade_disponivel_horas numeric,
  capacidade_necessaria_horas numeric,
  saldo_horas numeric,
  classificacao text
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

  return query
  select r.id, r.codigo, r.nome, r.tipo, r.situacao,
    c.capacidade_disponivel_horas, c.capacidade_necessaria_horas, c.saldo_horas, c.classificacao
  from public.recursos_produtivos r
  cross join lateral public.calcular_capacidade_recurso(r.id, p_dias) c
  where r.company_id = v_company_id and r.ativo
  order by r.codigo;
end;
$$;

grant execute on function public.listar_capacidade_recursos(int) to authenticated;
