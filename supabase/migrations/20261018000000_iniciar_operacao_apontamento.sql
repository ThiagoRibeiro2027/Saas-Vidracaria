-- Melhorias do responsável do produto (item 10, 17/10/2026): apontamento da
-- produção pelo operador, no celular, por operação do roteiro, com hora de
-- início e de fim. Antes o "início" só nascia no 1º apontamento de
-- quantidade (iniciada_em = coalesce(iniciada_em, now()) em apontar_
-- producao) — sem ação própria de "Iniciar" e sem registrar QUEM iniciou.
-- O fim já existia: concluida_em é gravado quando a operação atinge a
-- quantidade planejada, então apontar_producao() continua sendo o "Finalizar"
-- (informa produzido/perdido/retrabalho) e esta migration só acrescenta o
-- "Iniciar". apontar_producao() não muda (operação ainda 'planejada' continua
-- aceitando apontamento direto, comportamento anterior preservado).

alter table public.op_lote_operacoes
  add column iniciada_por uuid references public.profiles(id);

comment on column public.op_lote_operacoes.iniciada_por is
  'Melhorias 17/10/2026, item 10 — operador que tocou "Iniciar" (iniciar_operacao_lote). NULL em operações iniciadas só por apontamento de quantidade.';

create or replace function public.iniciar_operacao_lote(p_op_lote_operacao_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('producao', 'manage');
  v_operacao public.op_lote_operacoes;
  v_op public.ordens_producao;
begin
  select * into v_operacao from public.op_lote_operacoes
  where id = p_op_lote_operacao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Operação de lote não encontrada nesta empresa.';
  end if;
  if v_operacao.status <> 'planejada' then
    raise exception 'Esta operação já foi iniciada (situação atual: %).', v_operacao.status;
  end if;

  select * into v_op from public.ordens_producao where id = v_operacao.ordem_producao_id for update;
  if v_op.status not in ('planejada', 'em_producao') then
    raise exception 'Só é possível iniciar operação de OP planejada ou em produção (status atual: %).', v_op.status;
  end if;

  perform public.recalcular_situacao_ordem_producao(v_op.id);
  select * into v_op from public.ordens_producao where id = v_op.id;
  if v_op.situacao = 'bloqueada' then
    raise exception 'Ordem de produção bloqueada (%): %. Ação necessária: %',
      v_op.origem_bloqueio, v_op.motivo_bloqueio, v_op.acao_necessaria;
  end if;

  update public.op_lote_operacoes set
    status = 'em_andamento',
    iniciada_em = now(),
    iniciada_por = auth.uid()
  where id = p_op_lote_operacao_id;

  update public.ordens_producao set status = 'em_producao'
  where id = v_op.id and status = 'planejada';

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'producao.operacao_iniciada', 'ordem_producao', v_op.id, v_operacao.descricao,
    jsonb_build_object('op_lote_operacao_id', p_op_lote_operacao_id, 'sequencia', v_operacao.sequencia)
  );
end;
$$;

grant execute on function public.iniciar_operacao_lote(uuid) to authenticated;
