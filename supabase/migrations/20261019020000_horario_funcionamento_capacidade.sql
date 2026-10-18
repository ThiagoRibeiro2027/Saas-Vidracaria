-- Melhorias do responsável do produto (18/10/2026), item 2 da nova rodada (1ª etapa):
-- a capacidade disponível em "Recursos e capacidade" era capacidade_horas_dia
-- × 7 dias corridos, contando sábado e domingo. Agora a empresa cadastra o
-- HORÁRIO DE FUNCIONAMENTO (dia da semana, início, fim, intervalo) e a
-- capacidade só conta os dias úteis da janela.
--
-- Decisões: (a) a capacidade do RECURSO (capacidade_horas_dia) vale nos dias
-- em que a empresa trabalha, sem limitar pelas horas da empresa (uma máquina
-- pode rodar mais que o expediente); recurso sem capacidade segue valendo 0;
-- (b) p_dias continua sendo a janela em dias corridos (as assinaturas de
-- calcular_capacidade_recurso / listar_capacidade_recursos / listar_gargalos
-- não mudam); (c) o helper _dias_uteis_na_janela() é o ponto único onde a 2ª
-- etapa (feriados nacionais/municipais e calendário mensal) vai encaixar,
-- sem tocar de novo nas funções de capacidade.

create table public.company_work_schedule (
  company_id uuid not null references public.companies(id),
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0 = domingo (igual extract(dow))
  trabalha boolean not null default false,
  inicio time,
  fim time,
  almoco_minutos integer not null default 0 check (almoco_minutos >= 0),
  horas numeric(4, 2) not null default 0 check (horas >= 0 and horas <= 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, dia_semana),
  constraint company_work_schedule_horario_valido check (
    not trabalha or (inicio is not null and fim is not null and fim > inicio and horas > 0)
  )
);
comment on table public.company_work_schedule is 'Melhorias 18/10/2026, item 2 — horário de funcionamento da empresa por dia da semana (0=domingo..6=sábado). horas = (fim − início) − intervalo, calculada em upsert_company_work_schedule(). Base dos dias úteis da capacidade produtiva.';

create trigger set_updated_at before update on public.company_work_schedule
  for each row execute function public.set_updated_at();

alter table public.company_work_schedule enable row level security;
create policy company_work_schedule_select on public.company_work_schedule for select
  using (company_id = (select public.current_company_id()));
grant select on public.company_work_schedule to authenticated;

-- Padrão: segunda a sexta, 08:00–17:00 com 1 h de intervalo (8 h); sábado e
-- domingo sem expediente. Empresas novas ganham por trigger; as existentes,
-- pelo backfill abaixo.
create or replace function public.seed_default_work_schedule()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.company_work_schedule (company_id, dia_semana, trabalha, inicio, fim, almoco_minutos, horas)
  select new.id, d, d between 1 and 5,
         case when d between 1 and 5 then time '08:00' end,
         case when d between 1 and 5 then time '17:00' end,
         case when d between 1 and 5 then 60 else 0 end,
         case when d between 1 and 5 then 8 else 0 end
  from generate_series(0, 6) d
  on conflict (company_id, dia_semana) do nothing;
  return new;
end;
$$;

create trigger seed_default_work_schedule after insert on public.companies
  for each row execute function public.seed_default_work_schedule();

insert into public.company_work_schedule (company_id, dia_semana, trabalha, inicio, fim, almoco_minutos, horas)
select c.id, d, d between 1 and 5,
       case when d between 1 and 5 then time '08:00' end,
       case when d between 1 and 5 then time '17:00' end,
       case when d between 1 and 5 then 60 else 0 end,
       case when d between 1 and 5 then 8 else 0 end
from public.companies c
cross join generate_series(0, 6) d
on conflict (company_id, dia_semana) do nothing;

-- Escrita: a semana inteira de uma vez (jsonb com até 7 itens
-- {dia_semana, trabalha, inicio, fim, almoco_minutos}). As horas do dia são
-- calculadas aqui, nunca confiadas ao navegador.
create or replace function public.upsert_company_work_schedule(p_dias jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before jsonb;
  v_item jsonb;
  v_dia smallint;
  v_trabalha boolean;
  v_inicio time;
  v_fim time;
  v_almoco integer;
  v_horas numeric;
begin
  if p_dias is null or jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) = 0 then
    raise exception 'Informe os dias de funcionamento.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.dia_semana), '[]'::jsonb) into v_before
  from public.company_work_schedule s where s.company_id = v_company_id;

  for v_item in select * from jsonb_array_elements(p_dias) loop
    v_dia := (v_item ->> 'dia_semana')::smallint;
    if v_dia is null or v_dia < 0 or v_dia > 6 then
      raise exception 'Dia da semana inválido: "%".', v_item ->> 'dia_semana';
    end if;
    v_trabalha := coalesce((v_item ->> 'trabalha')::boolean, false);
    v_almoco := coalesce(nullif(v_item ->> 'almoco_minutos', '')::integer, 0);
    if v_almoco < 0 then
      raise exception 'O intervalo não pode ser negativo.';
    end if;

    if v_trabalha then
      v_inicio := nullif(v_item ->> 'inicio', '')::time;
      v_fim := nullif(v_item ->> 'fim', '')::time;
      if v_inicio is null or v_fim is null then
        raise exception 'Informe início e fim do expediente nos dias de funcionamento.';
      end if;
      if v_fim <= v_inicio then
        raise exception 'O fim do expediente deve ser depois do início.';
      end if;
      v_horas := round(extract(epoch from (v_fim - v_inicio)) / 3600.0 - v_almoco / 60.0, 2);
      if v_horas <= 0 then
        raise exception 'O intervalo não pode ser maior ou igual ao expediente.';
      end if;
    else
      v_inicio := null; v_fim := null; v_horas := 0; v_almoco := 0;
    end if;

    insert into public.company_work_schedule (company_id, dia_semana, trabalha, inicio, fim, almoco_minutos, horas)
    values (v_company_id, v_dia, v_trabalha, v_inicio, v_fim, v_almoco, v_horas)
    on conflict (company_id, dia_semana) do update set
      trabalha = excluded.trabalha, inicio = excluded.inicio, fim = excluded.fim,
      almoco_minutos = excluded.almoco_minutos, horas = excluded.horas;
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.horario_funcionamento_upserted', 'company_work_schedule', null, null,
    jsonb_build_object('before', v_before, 'after', p_dias)
  );
end;
$$;

revoke all on function public.upsert_company_work_schedule(jsonb) from public, anon;
grant execute on function public.upsert_company_work_schedule(jsonb) to authenticated;

-- Dias úteis na janela [p_inicio, p_inicio + p_dias). Interna (sem grant para
-- authenticated: recebe company_id): só é chamada por funções SECURITY
-- DEFINER já escopadas à empresa do usuário. Empresa SEM nenhuma linha de
-- horário (não deveria ocorrer depois do backfill) cai no comportamento
-- antigo: todos os dias da janela contam.
create or replace function public._dias_uteis_na_janela(p_company_id uuid, p_inicio date, p_dias integer)
returns integer
language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from public.company_work_schedule where company_id = p_company_id) then p_dias
    else coalesce((
      select count(*)::integer
      from generate_series(p_inicio, p_inicio + (p_dias - 1), interval '1 day') g
      join public.company_work_schedule s
        on s.company_id = p_company_id and s.dia_semana = extract(dow from g)::smallint and s.trabalha
    ), 0)
  end;
$$;

revoke all on function public._dias_uteis_na_janela(uuid, date, integer) from public, anon, authenticated;

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
  v_dias_uteis integer;
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

  -- Melhorias 18/10/2026, item 2: a capacidade vale só nos DIAS ÚTEIS da empresa
  -- dentro da janela (antes era horas/dia × p_dias corridos, fins de semana
  -- incluídos). p_dias continua sendo a janela em dias corridos.
  v_dias_uteis := public._dias_uteis_na_janela(v_company_id, current_date, p_dias);

  v_disponivel := coalesce(v_recurso.capacidade_horas_dia, 0) * v_dias_uteis - v_manutencao_horas;

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
