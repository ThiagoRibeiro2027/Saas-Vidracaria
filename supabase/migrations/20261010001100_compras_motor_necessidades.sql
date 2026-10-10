-- Compras completo (T7) — Fase 3 da ADR-011 (docs/ADR-011 — Compras
-- v1.0.md): motor de necessidades, saldo projetado, consolidação e mapa
-- de compras futuras (TÓPICO 7 §1, §3, §4, §7, §8, conclusão de §9, §11,
-- §12). Depende das Fases 1 (fornecedor/lead time/política de
-- abastecimento) e 2 (conversão de unidade/peça dimensional) já
-- entregues.
--
-- Decisões de escopo tomadas com o responsável do produto (23/09/2026,
-- via chat, ADR-011 §5):
--   - "Risco de ruptura" (§12): dias até a necessidade mais próxima vs.
--     lead time do fornecedor principal — crítico se a ruptura cai
--     dentro do lead time, atenção se cai entre 1x e 2x o lead time, ok
--     caso contrário. Item sem fornecedor/lead time configurado usa
--     horizonte fixo de 30 dias.
--   - Excedente (§9, conclusão): sob demanda, ao consultar — sem rotina
--     agendada (não existe infraestrutura de job periódico no projeto).
--     A "conclusão" de fato do §9 é ligar o que a Fase 2 já construiu
--     (peça dimensional com sobra reaproveitável) ao cálculo de
--     necessidade líquida: item com dimensao_tipo configurado passa a
--     descontar a soma das peças disponíveis (não o saldo escalar) — é
--     isso que faz uma sobra registrada na Fase 2 reduzir ou eliminar
--     automaticamente uma necessidade futura, sem UI de vínculo manual.
--
-- `origem` de necessidades_compra ganha só 'estoque_minimo',
-- 'ponto_reposicao' e 'consolidada' — não 'planejamento'/
-- 'consumo_previsto'/'perda_prevista' como uma leitura solta do TÓPICO 7
-- sugeriria: nenhum desses três tem fonte de dado real no schema hoje
-- (não existe previsão de demanda nem fórmula de perda prevista definida
-- em ADR nenhum) — CLAUDE.md veda regra de negócio sem base em ADR.
-- Ficam para quando (e se) esses dados existirem de verdade.

alter table public.necessidades_compra
  drop constraint necessidades_compra_origem_check;
alter table public.necessidades_compra
  add constraint necessidades_compra_origem_check check (
    origem in ('pedido', 'producao', 'manual', 'estoque_minimo', 'ponto_reposicao', 'consolidada')
  );

-- =========================================================================
-- criar_necessidade_compra() — mesma assinatura, só a validação de origem
-- widened pras 3 novas origens desta fase.
-- =========================================================================

create or replace function public.criar_necessidade_compra(
  p_item_id uuid,
  p_quantidade numeric,
  p_data_necessaria date default null,
  p_origem text default 'manual',
  p_observacoes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_id uuid;
begin
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if p_quantidade <= 0 then
    raise exception 'Quantidade precisa ser maior que zero.';
  end if;
  if p_origem not in ('pedido', 'producao', 'manual', 'estoque_minimo', 'ponto_reposicao', 'consolidada') then
    raise exception 'Origem inválida: "%".', p_origem;
  end if;

  insert into public.necessidades_compra (company_id, item_id, quantidade, data_necessaria, origem, observacoes, criado_por)
  values (v_company_id, p_item_id, p_quantidade, p_data_necessaria, p_origem, p_observacoes, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'suprimentos.necessidade_criada', 'necessidade_compra', v_id, p_observacoes,
    jsonb_build_object('item_id', p_item_id, 'quantidade', p_quantidade, 'origem', p_origem)
  );

  return v_id;
end;
$$;

-- =========================================================================
-- calendario_feriados — TÓPICO 7 §11 (lead time). Config de empresa,
-- mesmo domínio de T15 — gate configuracoes.manage/view, não compras.*.
-- =========================================================================

create table public.calendario_feriados (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  data date not null,
  descricao text,
  created_at timestamptz not null default now(),
  constraint calendario_feriados_unique unique (company_id, data)
);
comment on table public.calendario_feriados is 'Fase 3 da ADR-011 (TÓPICO 7 §11) — feriados da empresa, usados por calcular_data_recomendada_compra() para não recomendar compra em dia não útil.';
create index calendario_feriados_company_id_idx on public.calendario_feriados (company_id);

alter table public.calendario_feriados enable row level security;
create policy calendario_feriados_select on public.calendario_feriados for select
  using (company_id = (select public.current_company_id()));
grant select on public.calendario_feriados to authenticated;

create function public.upsert_feriado(p_data date, p_descricao text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
  v_id uuid;
begin
  if p_data is null then
    raise exception 'Data é obrigatória.';
  end if;

  insert into public.calendario_feriados (company_id, data, descricao)
  values (v_company_id, p_data, p_descricao)
  on conflict (company_id, data) do update set descricao = excluded.descricao
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'configuracoes.feriado_definido', 'calendario_feriados', v_id, p_descricao);

  return v_id;
end;
$$;

grant execute on function public.upsert_feriado(date, text) to authenticated;

create function public.remover_feriado(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('configuracoes', 'manage');
begin
  delete from public.calendario_feriados where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Feriado não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'configuracoes.feriado_removido', 'calendario_feriados', p_id, null);

  return p_id;
end;
$$;

grant execute on function public.remover_feriado(uuid) to authenticated;

-- =========================================================================
-- necessidade_consolidacao — TÓPICO 7 §7. Liga cada necessidade filha
-- (cancelada) à necessidade consolidada nova, pra nunca perder a
-- rastreabilidade (exigência explícita do §7).
-- =========================================================================

create table public.necessidade_consolidacao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  necessidade_compra_id uuid not null references public.necessidades_compra(id),
  necessidade_origem_id uuid not null references public.necessidades_compra(id),
  created_at timestamptz not null default now(),
  constraint necessidade_consolidacao_origem_unique unique (necessidade_origem_id)
);
comment on table public.necessidade_consolidacao is 'Fase 3 da ADR-011 (TÓPICO 7 §7) — rastreabilidade da consolidação: cada linha liga uma necessidade filha (cancelada) à necessidade consolidada nova que a substituiu.';
create index necessidade_consolidacao_company_id_idx on public.necessidade_consolidacao (company_id);
create index necessidade_consolidacao_compra_id_idx on public.necessidade_consolidacao (necessidade_compra_id);

alter table public.necessidade_consolidacao enable row level security;
create policy necessidade_consolidacao_select on public.necessidade_consolidacao for select
  using (company_id = (select public.current_company_id()));
grant select on public.necessidade_consolidacao to authenticated;

-- =========================================================================
-- calcular_necessidade_liquida_item() — motor de necessidades (§3),
-- interno (não concedido a authenticated — só chamado de dentro de outra
-- função já gated). Generaliza o que gerar_necessidades_de_pedido()/
-- gerar_necessidades_de_ordem_producao() já faziam, com duas mudanças:
--   1. Saldo disponível vem das peças dimensionais (Fase 2) quando o item
--      tem dimensao_tipo configurado, não do saldo escalar — é isso que
--      fecha o §9 (sobra reaproveitável reduz necessidade automaticamente).
--   2. "Já sinalizado" agora soma TODA necessidade aberta do item,
--      qualquer origem — antes só somava origem in ('pedido','producao');
--      com as novas origens desta fase (estoque_minimo/ponto_reposicao),
--      manter o filtro antigo duplicaria necessidade pro mesmo item.
-- =========================================================================

create function public.calcular_necessidade_liquida_item(p_company_id uuid, p_item_id uuid, p_quantidade_bruta numeric)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_dimensao_tipo text;
  v_disponivel numeric;
  v_ja_sinalizado numeric;
begin
  select dimensao_tipo into v_dimensao_tipo from public.itens where id = p_item_id and company_id = p_company_id;

  if v_dimensao_tipo is not null then
    select coalesce(sum(pd.quantidade_disponivel), 0) into v_disponivel
    from public.itens_pecas_dimensionais pd
    where pd.company_id = p_company_id and pd.item_id = p_item_id and pd.situacao = 'disponivel';
  else
    select coalesce(es.quantidade_fisica, 0) - coalesce(es.quantidade_reservada, 0) into v_disponivel
    from public.estoque_saldos es
    where es.company_id = p_company_id and es.item_id = p_item_id;
    v_disponivel := coalesce(v_disponivel, 0);
  end if;

  select coalesce(sum(nc.quantidade), 0) into v_ja_sinalizado
  from public.necessidades_compra nc
  where nc.company_id = p_company_id and nc.item_id = p_item_id and nc.status = 'aberta';

  return p_quantidade_bruta - v_disponivel - v_ja_sinalizado;
end;
$$;

-- =========================================================================
-- gerar_necessidades_de_pedido() / gerar_necessidades_de_ordem_producao()
-- — mesma assinatura e mesmo comportamento externo (idempotência, rejeição
-- de pedido não liberado, item sem peça ignorado), só reaproveitando o
-- helper acima em vez de repetir o cálculo de saldo/já-sinalizado.
-- =========================================================================

create or replace function public.gerar_necessidades_de_pedido(p_pedido_id uuid)
returns table (item_id uuid, item_codigo text, item_descricao text, quantidade_gerada numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_pedido public.pedidos;
  v_linha record;
  v_falta numeric;
  v_gerados int := 0;
  v_itens_gerados jsonb := '[]'::jsonb;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id and company_id = v_company_id;
  if not found then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;
  if v_pedido.status <> 'liberado' then
    raise exception 'Só é possível gerar necessidades para pedido liberado (status atual: %).', v_pedido.status;
  end if;

  for v_linha in
    with recursive expansao_ao_vivo as (
      select pc.material_item_id as mat_id, pi.quantidade * pc.quantidade_por_unidade as qtd_total
      from public.pedido_itens pi
      join public.pecas p on p.item_id = pi.item_id and p.company_id = v_company_id
      join public.peca_composicao pc on pc.peca_id = p.id
      where pi.pedido_id = p_pedido_id
        and not exists (select 1 from public.pedido_item_bom pib where pib.pedido_item_id = pi.id and pib.status = 'definitiva')
      union all
      select pc2.material_item_id, e.qtd_total * pc2.quantidade_por_unidade
      from expansao_ao_vivo e
      join public.pecas sp on sp.item_id = e.mat_id
      join public.peca_composicao pc2 on pc2.peca_id = sp.id
    ),
    via_bom_definitiva as (
      select pib_i.material_item_id as mat_id, pi.quantidade * pib_i.quantidade_por_unidade as qtd_total
      from public.pedido_itens pi
      join public.pedido_item_bom pib on pib.pedido_item_id = pi.id and pib.status = 'definitiva' and pib.company_id = v_company_id
      join public.pedido_item_bom_itens pib_i on pib_i.pedido_item_bom_id = pib.id
      where pi.pedido_id = p_pedido_id
    ),
    tudo as (
      select ev.mat_id, ev.qtd_total from expansao_ao_vivo ev
      where not exists (select 1 from public.pecas sp2 where sp2.item_id = ev.mat_id)
      union all
      select vbd.mat_id, vbd.qtd_total from via_bom_definitiva vbd
    )
    select t.mat_id, i.codigo as mat_codigo, i.descricao as mat_descricao, sum(t.qtd_total) as necessario
    from tudo t
    join public.itens i on i.id = t.mat_id
    group by t.mat_id, i.codigo, i.descricao
  loop
    v_falta := public.calcular_necessidade_liquida_item(v_company_id, v_linha.mat_id, v_linha.necessario);
    if v_falta > 0 then
      perform public.criar_necessidade_compra(
        v_linha.mat_id, v_falta, null, 'pedido',
        format('Gerado automaticamente a partir do pedido %s.', v_pedido.numero)
      );
      v_gerados := v_gerados + 1;
      v_itens_gerados := v_itens_gerados || jsonb_build_object('item_id', v_linha.mat_id, 'quantidade', v_falta);
      return query select v_linha.mat_id, v_linha.mat_codigo, v_linha.mat_descricao, v_falta;
    end if;
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'suprimentos.necessidades_geradas_de_pedido', 'pedido', p_pedido_id, v_pedido.numero,
    jsonb_build_object('count', v_gerados, 'items', v_itens_gerados)
  );
end;
$$;

create or replace function public.gerar_necessidades_de_ordem_producao(p_ordem_producao_id uuid)
returns table (item_id uuid, item_codigo text, item_descricao text, quantidade_gerada numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_op public.ordens_producao;
  v_linha record;
  v_falta numeric;
  v_gerados int := 0;
  v_itens_gerados jsonb := '[]'::jsonb;
begin
  select * into v_op from public.ordens_producao where id = p_ordem_producao_id and company_id = v_company_id;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;

  for v_linha in
    with recursive expansao_ao_vivo as (
      select pc.material_item_id as mat_id, v_op.quantidade_planejada * pc.quantidade_por_unidade as qtd_total
      from public.pedido_itens pi
      join public.pecas p on p.item_id = pi.item_id and p.company_id = v_company_id
      join public.peca_composicao pc on pc.peca_id = p.id
      where pi.id = v_op.pedido_item_id
        and not exists (select 1 from public.pedido_item_bom pib where pib.pedido_item_id = pi.id and pib.status = 'definitiva')
      union all
      select pc2.material_item_id, e.qtd_total * pc2.quantidade_por_unidade
      from expansao_ao_vivo e
      join public.pecas sp on sp.item_id = e.mat_id
      join public.peca_composicao pc2 on pc2.peca_id = sp.id
    ),
    via_bom_definitiva as (
      select pib_i.material_item_id as mat_id, v_op.quantidade_planejada * pib_i.quantidade_por_unidade as qtd_total
      from public.pedido_itens pi
      join public.pedido_item_bom pib on pib.pedido_item_id = pi.id and pib.status = 'definitiva' and pib.company_id = v_company_id
      join public.pedido_item_bom_itens pib_i on pib_i.pedido_item_bom_id = pib.id
      where pi.id = v_op.pedido_item_id
    ),
    tudo as (
      select ev.mat_id, ev.qtd_total from expansao_ao_vivo ev
      where not exists (select 1 from public.pecas sp2 where sp2.item_id = ev.mat_id)
      union all
      select vbd.mat_id, vbd.qtd_total from via_bom_definitiva vbd
    )
    select t.mat_id, i.codigo as mat_codigo, i.descricao as mat_descricao, sum(t.qtd_total) as necessario
    from tudo t
    join public.itens i on i.id = t.mat_id
    group by t.mat_id, i.codigo, i.descricao
  loop
    v_falta := public.calcular_necessidade_liquida_item(v_company_id, v_linha.mat_id, v_linha.necessario);
    if v_falta > 0 then
      perform public.criar_necessidade_compra(
        v_linha.mat_id, v_falta, null, 'producao',
        format('Gerado automaticamente a partir da ordem de produção %s.', v_op.numero)
      );
      v_gerados := v_gerados + 1;
      v_itens_gerados := v_itens_gerados || jsonb_build_object('item_id', v_linha.mat_id, 'quantidade', v_falta);
      return query select v_linha.mat_id, v_linha.mat_codigo, v_linha.mat_descricao, v_falta;
    end if;
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'suprimentos.necessidades_geradas_de_producao', 'ordem_producao', p_ordem_producao_id, v_op.numero,
    jsonb_build_object('count', v_gerados, 'items', v_itens_gerados)
  );
end;
$$;

-- =========================================================================
-- gerar_necessidades_de_politica_abastecimento() — TÓPICO 7 §1/§8. Cobre
-- política tipo estoque_minimo/seguranca/ponto_reposicao (tipo
-- sob_demanda não gera nada automático, por definição). Aplica lote
-- mínimo/múltiplo da própria política (§8, "compra acima da
-- necessidade" arredondada pro lote configurado). Gate compras.manage —
-- capacidade nova desta ADR, não o suprimentos.manage do ciclo leve.
-- =========================================================================

create function public.gerar_necessidades_de_politica_abastecimento(p_item_id uuid default null)
returns table (item_id uuid, item_codigo text, item_descricao text, origem_gerada text, quantidade_gerada numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_linha record;
  v_falta numeric;
  v_origem text;
  v_gerados int := 0;
begin
  for v_linha in
    select pa.item_id, i.codigo, i.descricao, pa.tipo, pa.lote_minimo, pa.multiplo,
      case pa.tipo
        when 'seguranca' then pa.estoque_seguranca
        when 'ponto_reposicao' then pa.ponto_reposicao
        else pa.estoque_minimo
      end as alvo
    from public.politicas_abastecimento pa
    join public.itens i on i.id = pa.item_id
    where pa.company_id = v_company_id
      and pa.tipo in ('estoque_minimo', 'seguranca', 'ponto_reposicao')
      and (p_item_id is null or pa.item_id = p_item_id)
  loop
    if coalesce(v_linha.alvo, 0) <= 0 then
      continue;
    end if;

    v_falta := public.calcular_necessidade_liquida_item(v_company_id, v_linha.item_id, v_linha.alvo);
    if v_falta <= 0 then
      continue;
    end if;

    if v_linha.multiplo is not null and v_linha.multiplo > 0 then
      v_falta := ceil(v_falta / v_linha.multiplo) * v_linha.multiplo;
    end if;
    if v_linha.lote_minimo is not null and v_falta < v_linha.lote_minimo then
      v_falta := v_linha.lote_minimo;
    end if;

    v_origem := case when v_linha.tipo = 'ponto_reposicao' then 'ponto_reposicao' else 'estoque_minimo' end;

    perform public.criar_necessidade_compra(
      v_linha.item_id, v_falta, null, v_origem,
      format('Gerado automaticamente pela política de abastecimento (%s).', v_linha.tipo)
    );
    v_gerados := v_gerados + 1;
    return query select v_linha.item_id, v_linha.codigo, v_linha.descricao, v_origem, v_falta;
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'compras.necessidades_geradas_de_politica', 'politicas_abastecimento', p_item_id, null,
    jsonb_build_object('count', v_gerados)
  );
end;
$$;

grant execute on function public.gerar_necessidades_de_politica_abastecimento(uuid) to authenticated;

-- =========================================================================
-- consolidar_necessidades() — TÓPICO 7 §7. Exige mesmo item, todas
-- abertas; soma quantidade, usa a data_necessaria mais próxima; cancela
-- as originais preservando o vínculo em necessidade_consolidacao.
-- =========================================================================

create function public.consolidar_necessidades(p_necessidade_ids uuid[], p_observacoes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_qtd_ids int;
  v_qtd_encontrados int;
  v_qtd_itens_distintos int;
  v_item_id uuid;
  v_soma numeric;
  v_data_min date;
  v_nova_id uuid;
  v_id uuid;
begin
  if p_necessidade_ids is null or array_length(p_necessidade_ids, 1) < 2 then
    raise exception 'Informe ao menos 2 necessidades para consolidar.';
  end if;
  v_qtd_ids := array_length(p_necessidade_ids, 1);

  -- uuid não tem agregado min()/max() nativo no Postgres — count/sum bastam
  -- pra validar; o item_id em si é lido à parte depois da validação.
  select count(*), count(distinct item_id), sum(quantidade), min(data_necessaria)
    into v_qtd_encontrados, v_qtd_itens_distintos, v_soma, v_data_min
  from public.necessidades_compra
  where id = any(p_necessidade_ids) and company_id = v_company_id and status = 'aberta';

  if v_qtd_encontrados <> v_qtd_ids then
    raise exception 'Uma ou mais necessidades não foram encontradas, não pertencem a esta empresa ou não estão abertas.';
  end if;
  if v_qtd_itens_distintos <> 1 then
    raise exception 'Só é possível consolidar necessidades do mesmo item.';
  end if;

  select item_id into v_item_id from public.necessidades_compra where id = p_necessidade_ids[1];

  insert into public.necessidades_compra (company_id, item_id, quantidade, data_necessaria, origem, status, observacoes, criado_por)
  values (v_company_id, v_item_id, v_soma, v_data_min, 'consolidada', 'aberta', p_observacoes, auth.uid())
  returning id into v_nova_id;

  update public.necessidades_compra
  set status = 'cancelada', motivo_cancelamento = 'Consolidada em nova necessidade.'
  where id = any(p_necessidade_ids) and company_id = v_company_id;

  foreach v_id in array p_necessidade_ids loop
    insert into public.necessidade_consolidacao (company_id, necessidade_compra_id, necessidade_origem_id)
    values (v_company_id, v_nova_id, v_id);
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'compras.necessidades_consolidadas', 'necessidades_compra', v_nova_id, p_observacoes,
    jsonb_build_object('necessidade_ids_origem', p_necessidade_ids, 'quantidade_total', v_soma)
  );

  return v_nova_id;
end;
$$;

grant execute on function public.consolidar_necessidades(uuid[], text) to authenticated;

-- =========================================================================
-- calcular_saldo_projetado() / calcular_data_recomendada_compra() /
-- mapa_compras_futuras() — leitura, TÓPICO 7 §4/§11/§12. Gate compras.view
-- (padrão manual, mesmo de listar_composicao_peca).
-- =========================================================================

create function public.calcular_saldo_projetado(p_item_id uuid)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_dimensao_tipo text;
  v_disponivel numeric;
  v_necessidade_aberta numeric;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('compras', 'view') then
    raise exception 'Sem permissão para consultar compras (compras.view).';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;

  select dimensao_tipo into v_dimensao_tipo from public.itens where id = p_item_id;
  if v_dimensao_tipo is not null then
    select coalesce(sum(pd.quantidade_disponivel), 0) into v_disponivel
    from public.itens_pecas_dimensionais pd
    where pd.company_id = v_company_id and pd.item_id = p_item_id and pd.situacao = 'disponivel';
  else
    select coalesce(es.quantidade_fisica, 0) - coalesce(es.quantidade_reservada, 0) into v_disponivel
    from public.estoque_saldos es where es.company_id = v_company_id and es.item_id = p_item_id;
    v_disponivel := coalesce(v_disponivel, 0);
  end if;

  select coalesce(sum(quantidade), 0) into v_necessidade_aberta
  from public.necessidades_compra where company_id = v_company_id and item_id = p_item_id and status = 'aberta';

  return v_disponivel - v_necessidade_aberta;
end;
$$;

grant execute on function public.calcular_saldo_projetado(uuid) to authenticated;

create function public.calcular_data_recomendada_compra(p_item_id uuid, p_data_necessaria date, p_fornecedor_id uuid default null)
returns date
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lead_time integer;
  v_data date;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('compras', 'view') then
    raise exception 'Sem permissão para consultar compras (compras.view).';
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id) then
    raise exception 'Item não encontrado nesta empresa.';
  end if;
  if p_data_necessaria is null then
    raise exception 'Data necessária é obrigatória.';
  end if;

  if p_fornecedor_id is not null then
    select fd.lead_time_dias into v_lead_time
    from public.fornecedor_dados fd
    where fd.company_id = v_company_id and fd.pessoa_id = p_fornecedor_id;
  else
    select fd.lead_time_dias into v_lead_time
    from public.item_fornecedores itf
    join public.fornecedor_dados fd on fd.pessoa_id = itf.pessoa_id and fd.company_id = itf.company_id
    where itf.company_id = v_company_id and itf.item_id = p_item_id and itf.principal
    limit 1;
  end if;
  v_lead_time := coalesce(v_lead_time, 30);

  v_data := p_data_necessaria - v_lead_time;
  while extract(dow from v_data) in (0, 6) or exists (
    select 1 from public.calendario_feriados where company_id = v_company_id and data = v_data
  ) loop
    v_data := v_data - 1;
  end loop;

  return v_data;
end;
$$;

grant execute on function public.calcular_data_recomendada_compra(uuid, date, uuid) to authenticated;

create function public.mapa_compras_futuras()
returns table (
  item_id uuid,
  item_codigo text,
  item_descricao text,
  necessidade_aberta numeric,
  saldo_disponivel numeric,
  saldo_projetado numeric,
  data_necessaria_mais_proxima date,
  lead_time_dias integer,
  data_recomendada_compra date,
  risco text
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('compras', 'view') then
    raise exception 'Sem permissão para consultar compras (compras.view).';
  end if;

  return query
  with necessidades_abertas as (
    select nc.item_id, sum(nc.quantidade) as total, min(nc.data_necessaria) as data_mais_proxima
    from public.necessidades_compra nc
    where nc.company_id = v_company_id and nc.status = 'aberta'
    group by nc.item_id
  ),
  saldo as (
    select i.id as item_id,
      case when i.dimensao_tipo is not null then (
        select coalesce(sum(pd.quantidade_disponivel), 0) from public.itens_pecas_dimensionais pd
        where pd.company_id = v_company_id and pd.item_id = i.id and pd.situacao = 'disponivel'
      ) else (
        select coalesce(es.quantidade_fisica, 0) - coalesce(es.quantidade_reservada, 0) from public.estoque_saldos es
        where es.company_id = v_company_id and es.item_id = i.id
      ) end as disponivel
    from public.itens i
    where i.company_id = v_company_id
  ),
  lead as (
    select itf.item_id, fd.lead_time_dias
    from public.item_fornecedores itf
    join public.fornecedor_dados fd on fd.pessoa_id = itf.pessoa_id and fd.company_id = itf.company_id
    where itf.company_id = v_company_id and itf.principal
  ),
  base as (
    select
      na.item_id,
      i.codigo as item_codigo,
      i.descricao as item_descricao,
      na.total as necessidade_aberta,
      coalesce(s.disponivel, 0) as saldo_disponivel,
      coalesce(s.disponivel, 0) - na.total as saldo_projetado,
      na.data_mais_proxima as data_necessaria_mais_proxima,
      coalesce(l.lead_time_dias, 30) as lead_time_dias
    from necessidades_abertas na
    join public.itens i on i.id = na.item_id
    left join saldo s on s.item_id = na.item_id
    left join lead l on l.item_id = na.item_id
  ),
  classificado as (
    select b.*,
      case
        when b.saldo_projetado >= 0 then 'ok'
        when b.data_necessaria_mais_proxima is null then 'atencao'
        when b.data_necessaria_mais_proxima - current_date <= b.lead_time_dias then 'critico'
        when b.data_necessaria_mais_proxima - current_date <= b.lead_time_dias * 2 then 'atencao'
        else 'ok'
      end as risco
    from base b
  )
  select
    c.item_id, c.item_codigo, c.item_descricao, c.necessidade_aberta, c.saldo_disponivel, c.saldo_projetado,
    c.data_necessaria_mais_proxima, c.lead_time_dias,
    case when c.data_necessaria_mais_proxima is not null
      then public.calcular_data_recomendada_compra(c.item_id, c.data_necessaria_mais_proxima, null)
      else null end,
    c.risco
  from classificado c
  order by c.risco = 'critico' desc, c.risco = 'atencao' desc, c.data_necessaria_mais_proxima nulls last;
end;
$$;

grant execute on function public.mapa_compras_futuras() to authenticated;
