-- Melhorias do responsável do produto (18/10/2026): "Recursos e capacidade" deve
-- ser abastecido com as horas do horário de funcionamento (as horas efetivas
-- trabalhadas). Decisão: horas da empresa por padrão — recurso SEM horas
-- próprias usa as horas do dia no horário de funcionamento; recurso COM horas
-- próprias (capacidade_horas_dia) continua usando as dele (ex.: máquina em dois
-- turnos). Só calcular_capacidade_recurso() muda; listar_capacidade_recursos(),
-- listar_gargalos() e a simulação de decisão herdam.

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

  -- Melhorias 18/10/2026: a capacidade parte das HORAS do horário de
  -- funcionamento da empresa (as horas efetivamente trabalhadas). Para cada dia
  -- de produção da janela [hoje, hoje + p_dias), o recurso conta as horas
  -- PRÓPRIAS dele (capacidade_horas_dia, ex.: máquina em 2 turnos) quando
  -- cadastradas; sem horas próprias, conta as horas da empresa naquele dia
  -- (seg 8 h, sáb 4 h...). Dias sem produção (fim de semana, feriado, folga)
  -- não contam. Empresa sem horário cadastrado e recurso sem horas = 0.
  select coalesce(sum(coalesce(v_recurso.capacidade_horas_dia, i.horas, 0)), 0) into v_disponivel
  from generate_series(current_date, current_date + (p_dias - 1), interval '1 day') g
  cross join lateral public._info_dia_empresa(v_company_id, g::date) i
  where i.trabalha;

  v_disponivel := v_disponivel - v_manutencao_horas;

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
