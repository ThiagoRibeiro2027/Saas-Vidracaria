-- Melhorias do responsável do produto (18/10/2026), item "Recursos e capacidade",
-- 2ª etapa: calendário da empresa com feriados nacionais e municipais.
--
-- A 1ª etapa (20261019020000) fez a capacidade contar só os dias úteis do
-- horário de funcionamento. Aqui o "dia útil" passa a considerar também:
--   - feriados nacionais (calculados pela função, sem tabela de dados: datas
--     fixas + as que dependem da Páscoa) — bloqueiam o dia por padrão;
--   - pontos facultativos (Carnaval, Corpus Christi) — aparecem no calendário,
--     mas só bloqueiam se a empresa ligar essa opção;
--   - exceções cadastradas pela empresa: feriado municipal, ponte e folga
--     (dia sem produção) e dia extra (dia COM produção, mesmo que seja fim de
--     semana ou feriado; horas opcionais).
-- Uma exceção da empresa sempre vale mais que o feriado nacional (ex.: dia
-- extra num feriado nacional em que a empresa decide produzir).
--
-- O ponto único é _info_dia_empresa(): a capacidade (_dias_uteis_na_janela) e
-- o calendário mensal da tela leem dele, então nunca divergem.

create table public.company_calendar_settings (
  company_id uuid primary key references public.companies(id),
  considerar_feriados_nacionais boolean not null default true,
  considerar_pontos_facultativos boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.company_calendar_settings is 'Calendário da empresa (capacidade): se feriados nacionais e pontos facultativos bloqueiam a produção. Sem linha = padrão (nacionais sim, facultativos não).';

create trigger set_updated_at before update on public.company_calendar_settings
  for each row execute function public.set_updated_at();

alter table public.company_calendar_settings enable row level security;
create policy company_calendar_settings_select on public.company_calendar_settings for select
  using (company_id = (select public.current_company_id()));
grant select on public.company_calendar_settings to authenticated;

create table public.company_calendar_exceptions (
  company_id uuid not null references public.companies(id),
  data date not null,
  tipo text not null check (tipo in ('feriado_municipal', 'ponte', 'folga', 'dia_extra')),
  descricao text not null check (btrim(descricao) <> ''),
  trabalha boolean not null,
  horas numeric(4, 2) check (horas is null or (horas > 0 and horas <= 24)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, data),
  constraint company_calendar_exceptions_trabalha_coerente check (trabalha = (tipo = 'dia_extra')),
  constraint company_calendar_exceptions_horas_so_dia_extra check (horas is null or tipo = 'dia_extra')
);
comment on table public.company_calendar_exceptions is 'Exceções do calendário da empresa por data: feriado municipal/ponte/folga (sem produção) e dia extra (com produção). Prevalece sobre os feriados nacionais.';

create trigger set_updated_at before update on public.company_calendar_exceptions
  for each row execute function public.set_updated_at();

alter table public.company_calendar_exceptions enable row level security;
create policy company_calendar_exceptions_select on public.company_calendar_exceptions for select
  using (company_id = (select public.current_company_id()));
grant select on public.company_calendar_exceptions to authenticated;

-- Domingo de Páscoa (algoritmo gregoriano anônimo, de Meeus/Jones/Butcher).
create or replace function public._pascoa(p_ano integer)
returns date
language plpgsql immutable as $$
declare
  a int := p_ano % 19;
  b int := p_ano / 100;
  c int := p_ano % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7;
  m int := (a + 11 * h + 22 * l) / 451;
  mes int := (h + l - 7 * m + 114) / 31;
  dia int := ((h + l - 7 * m + 114) % 31) + 1;
begin
  return make_date(p_ano, mes, dia);
end;
$$;

-- Feriados nacionais e pontos facultativos do ano. Dados públicos, sem
-- dependência de tenant: pode ser chamada por qualquer usuário autenticado.
create or replace function public.feriados_nacionais(p_ano integer)
returns table (data date, nome text, tipo text)
language plpgsql immutable set search_path = public as $$
declare
  v_pascoa date := public._pascoa(p_ano);
begin
  if p_ano is null or p_ano < 1900 or p_ano > 2200 then
    raise exception 'Ano inválido.';
  end if;
  return query
  select * from (values
    (make_date(p_ano, 1, 1), 'Confraternização Universal', 'feriado_nacional'),
    (v_pascoa - 48, 'Carnaval (segunda-feira)', 'ponto_facultativo'),
    (v_pascoa - 47, 'Carnaval (terça-feira)', 'ponto_facultativo'),
    (v_pascoa - 2, 'Sexta-feira Santa', 'feriado_nacional'),
    (make_date(p_ano, 4, 21), 'Tiradentes', 'feriado_nacional'),
    (make_date(p_ano, 5, 1), 'Dia do Trabalho', 'feriado_nacional'),
    (v_pascoa + 60, 'Corpus Christi', 'ponto_facultativo'),
    (make_date(p_ano, 9, 7), 'Independência do Brasil', 'feriado_nacional'),
    (make_date(p_ano, 10, 12), 'Nossa Senhora Aparecida', 'feriado_nacional'),
    (make_date(p_ano, 11, 2), 'Finados', 'feriado_nacional'),
    (make_date(p_ano, 11, 15), 'Proclamação da República', 'feriado_nacional'),
    (make_date(p_ano, 12, 25), 'Natal', 'feriado_nacional')
  ) as t(data, nome, tipo)
  union all
  -- Dia Nacional de Zumbi e da Consciência Negra: feriado nacional desde 2024 (Lei 14.759/2023).
  select make_date(p_ano, 11, 20), 'Consciência Negra', 'feriado_nacional' where p_ano >= 2024
  order by 1;
end;
$$;

grant execute on function public.feriados_nacionais(integer) to authenticated;

-- Fonte única do "esse dia a empresa produz?". Interna (recebe company_id).
-- Empresa SEM nenhuma linha de horário cai no comportamento antigo (todo dia conta).
create or replace function public._info_dia_empresa(p_company_id uuid, p_data date)
returns table (trabalha boolean, horas numeric, origem text, descricao text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_sched public.company_work_schedule;
  v_exc public.company_calendar_exceptions;
  v_set public.company_calendar_settings;
  v_fer record;
begin
  select * into v_sched from public.company_work_schedule
  where company_id = p_company_id and dia_semana = extract(dow from p_data)::smallint;
  if not found and not exists (select 1 from public.company_work_schedule where company_id = p_company_id) then
    return query select true, null::numeric, 'sem_horario'::text, null::text;
    return;
  end if;

  select * into v_exc from public.company_calendar_exceptions where company_id = p_company_id and data = p_data;
  if found then
    if v_exc.trabalha then
      return query select true, coalesce(v_exc.horas, nullif(v_sched.horas, 0), 8::numeric), 'dia_extra'::text, v_exc.descricao;
    else
      return query select false, 0::numeric, v_exc.tipo, v_exc.descricao;
    end if;
    return;
  end if;

  select * into v_set from public.company_calendar_settings where company_id = p_company_id;
  select f.nome, f.tipo into v_fer from public.feriados_nacionais(extract(year from p_data)::integer) f where f.data = p_data;
  if found then
    if v_fer.tipo = 'feriado_nacional' and coalesce(v_set.considerar_feriados_nacionais, true) then
      return query select false, 0::numeric, 'feriado_nacional'::text, v_fer.nome;
      return;
    elsif v_fer.tipo = 'ponto_facultativo' and coalesce(v_set.considerar_pontos_facultativos, false) then
      return query select false, 0::numeric, 'ponto_facultativo'::text, v_fer.nome;
      return;
    end if;
  end if;

  return query select coalesce(v_sched.trabalha, false), coalesce(v_sched.horas, 0), 'semana'::text, null::text;
end;
$$;

revoke all on function public._info_dia_empresa(uuid, date) from public, anon, authenticated;

-- Dias úteis na janela [p_inicio, p_inicio + p_dias): agora com feriados e exceções.
create or replace function public._dias_uteis_na_janela(p_company_id uuid, p_inicio date, p_dias integer)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(count(*) filter (where i.trabalha), 0)::integer
  from generate_series(p_inicio, p_inicio + (p_dias - 1), interval '1 day') g
  cross join lateral public._info_dia_empresa(p_company_id, g::date) i;
$$;

revoke all on function public._dias_uteis_na_janela(uuid, date, integer) from public, anon, authenticated;

-- Calendário do mês para a tela (Configurações → Calendário).
create or replace function public.calendario_mensal(p_ano integer, p_mes integer)
returns table (data date, dia_semana smallint, trabalha boolean, horas numeric, origem text, descricao text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_inicio date;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('configuracoes', 'view') then
    raise exception 'Sem permissão para consultar as configurações (configuracoes.view).';
  end if;
  if p_ano is null or p_ano < 1900 or p_ano > 2200 or p_mes is null or p_mes < 1 or p_mes > 12 then
    raise exception 'Mês inválido.';
  end if;
  v_inicio := make_date(p_ano, p_mes, 1);

  return query
  select g::date, extract(dow from g)::smallint, i.trabalha, i.horas, i.origem, i.descricao
  from generate_series(v_inicio, (v_inicio + interval '1 month' - interval '1 day')::date, interval '1 day') g
  cross join lateral public._info_dia_empresa(v_company_id, g::date) i
  order by 1;
end;
$$;

grant execute on function public.calendario_mensal(integer, integer) to authenticated;

create or replace function public.upsert_calendar_settings(p_feriados_nacionais boolean, p_pontos_facultativos boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before public.company_calendar_settings;
begin
  if p_feriados_nacionais is null or p_pontos_facultativos is null then
    raise exception 'Informe as duas opções.';
  end if;
  select * into v_before from public.company_calendar_settings where company_id = v_company_id for update;

  insert into public.company_calendar_settings (company_id, considerar_feriados_nacionais, considerar_pontos_facultativos)
  values (v_company_id, p_feriados_nacionais, p_pontos_facultativos)
  on conflict (company_id) do update set
    considerar_feriados_nacionais = excluded.considerar_feriados_nacionais,
    considerar_pontos_facultativos = excluded.considerar_pontos_facultativos;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.calendario_opcoes_upserted', 'company_calendar_settings', null, null,
    jsonb_build_object('before', to_jsonb(v_before),
      'after', jsonb_build_object('considerar_feriados_nacionais', p_feriados_nacionais, 'considerar_pontos_facultativos', p_pontos_facultativos))
  );
end;
$$;

revoke all on function public.upsert_calendar_settings(boolean, boolean) from public, anon;
grant execute on function public.upsert_calendar_settings(boolean, boolean) to authenticated;

create or replace function public.upsert_calendar_exception(
  p_data date, p_tipo text, p_descricao text, p_horas numeric default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before public.company_calendar_exceptions;
begin
  if p_data is null then
    raise exception 'Informe a data.';
  end if;
  if p_tipo not in ('feriado_municipal', 'ponte', 'folga', 'dia_extra') then
    raise exception 'Tipo inválido: "%".', p_tipo;
  end if;
  if btrim(coalesce(p_descricao, '')) = '' then
    raise exception 'Informe uma descrição.';
  end if;
  if p_horas is not null and (p_tipo <> 'dia_extra' or p_horas <= 0 or p_horas > 24) then
    raise exception 'Horas só se aplicam a dia extra e devem estar entre 0 e 24.';
  end if;

  select * into v_before from public.company_calendar_exceptions where company_id = v_company_id and data = p_data for update;

  insert into public.company_calendar_exceptions (company_id, data, tipo, descricao, trabalha, horas)
  values (v_company_id, p_data, p_tipo, btrim(p_descricao), p_tipo = 'dia_extra', p_horas)
  on conflict (company_id, data) do update set
    tipo = excluded.tipo, descricao = excluded.descricao, trabalha = excluded.trabalha, horas = excluded.horas;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.calendario_excecao_upserted', 'company_calendar_exception', null, p_data::text,
    jsonb_build_object('before', to_jsonb(v_before),
      'after', jsonb_build_object('data', p_data, 'tipo', p_tipo, 'descricao', btrim(p_descricao), 'horas', p_horas))
  );
end;
$$;

revoke all on function public.upsert_calendar_exception(date, text, text, numeric) from public, anon;
grant execute on function public.upsert_calendar_exception(date, text, text, numeric) to authenticated;

create or replace function public.remove_calendar_exception(p_data date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_before public.company_calendar_exceptions;
begin
  select * into v_before from public.company_calendar_exceptions where company_id = v_company_id and data = p_data for update;
  if not found then
    raise exception 'Não há exceção cadastrada nessa data.';
  end if;

  delete from public.company_calendar_exceptions where company_id = v_company_id and data = p_data;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'config.calendario_excecao_removida', 'company_calendar_exception', null, p_data::text,
    jsonb_build_object('before', to_jsonb(v_before))
  );
end;
$$;

revoke all on function public.remove_calendar_exception(date) from public, anon;
grant execute on function public.remove_calendar_exception(date) to authenticated;
