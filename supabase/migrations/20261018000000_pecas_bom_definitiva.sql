-- BOM sugerida → definitiva — Fase H do plano de evolução da BOM leve,
-- última das 4 fases aprovadas em 23/09/2026. Fecha o ciclo que a Fase G
-- deixou em aberto: o motor de regras (Fase G) só simulava, sem gravar
-- nada; esta fase persiste a sugestão por pedido_item, deixa a
-- Engenharia ajustar manualmente antes de aprovar, e só depois de
-- aprovada ("definitiva") ela vira o que Suprimentos (Fase C) de fato
-- soma para necessidade de compra — em vez da expansão ao vivo via
-- peca_composicao usada até aqui.
--
-- Sem emenda nova ao ADR: já estava coberta pela emenda do §4.5 v2.8
-- ("BOM sugerida→definitiva com workflow de revisão — fase futura
-- distinta, mediante nova aprovação" — a aprovação é esta, dada em
-- 23/09/2026 ao aprovar as 4 fases).
--
-- pedido_item_bom_itens é sempre FOLHA (matéria-prima/insumo/material
-- auxiliar) — nunca guarda subconjunto: a expansão recursiva já resolve
-- a hierarquia inteira (Fase E) no momento de gerar a sugestão, e ajuste
-- manual só aceita material folha (não faz sentido a Engenharia "ajustar"
-- um subconjunto aqui, isso é composição de peça, Fase A/E). Regra do
-- motor (Fase G) só é avaliada no nível da peça do próprio pedido_item —
-- subconjuntos dentro dela são expandidos com a composição base deles,
-- sem regra própria aplicada (nenhuma característica de subconjunto é
-- capturada por pedido_item nesta fase).

create table public.pedido_item_bom (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_item_id uuid not null references public.pedido_itens(id) on delete cascade,
  peca_id uuid not null references public.pecas(id),
  status text not null default 'sugerida' check (status in ('sugerida', 'definitiva')),
  aprovado_por uuid references public.profiles(id),
  aprovado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedido_item_bom_unique unique (pedido_item_id)
);
comment on table public.pedido_item_bom is 'Fase H — cabeçalho da BOM sugerida/definitiva de um pedido_item específico. Único por pedido_item (unique). "sugerida" pode ser regenerada/ajustada; "definitiva" é travada (sem UPDATE possível nesta fase).';
create index pedido_item_bom_company_id_idx on public.pedido_item_bom (company_id);

create table public.pedido_item_bom_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_item_bom_id uuid not null references public.pedido_item_bom(id) on delete cascade,
  material_item_id uuid not null references public.itens(id),
  quantidade_por_unidade numeric(14, 4) not null check (quantidade_por_unidade > 0),
  origem text not null check (origem in ('base', 'regra', 'manual')),
  created_at timestamptz not null default now(),
  constraint pedido_item_bom_itens_unique unique (pedido_item_bom_id, material_item_id)
);
comment on table public.pedido_item_bom_itens is 'Fase H — linha da BOM (sempre item folha: matéria-prima/insumo/material auxiliar, nunca subconjunto), já com a hierarquia da peça achatada. origem registra se veio da composição base, de uma regra do motor, ou de ajuste manual da Engenharia.';
create index pedido_item_bom_itens_company_id_idx on public.pedido_item_bom_itens (company_id);
create index pedido_item_bom_itens_bom_id_idx on public.pedido_item_bom_itens (pedido_item_bom_id);

alter table public.pedido_item_bom enable row level security;
create policy pedido_item_bom_select on public.pedido_item_bom for select
  using (company_id = (select public.current_company_id()));
grant select on public.pedido_item_bom to authenticated;

alter table public.pedido_item_bom_itens enable row level security;
create policy pedido_item_bom_itens_select on public.pedido_item_bom_itens for select
  using (company_id = (select public.current_company_id()));
grant select on public.pedido_item_bom_itens to authenticated;

create trigger set_updated_at before update on public.pedido_item_bom
  for each row execute function public.set_updated_at();

-- =========================================================================
-- gerar_bom_sugerida_pedido_item() — gera (ou regenera, se ainda
-- "sugerida") a sugestão: composição base da peça + regras ativas
-- (mesma avaliação de simular_bom_sugerida, Fase G) no nível 1, depois
-- expandida recursivamente por toda a hierarquia (Fase E) até sobrar só
-- folha. Regenerar apaga as linhas antigas e grava as novas — só
-- permitido enquanto o status ainda for "sugerida".
-- =========================================================================

create or replace function public.gerar_bom_sugerida_pedido_item(p_pedido_item_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_item_id uuid;
  v_peca_id uuid;
  v_bom_id uuid;
  v_status text;
  v_comp record;
  v_regra record;
  v_valor_numero numeric;
  v_valor_texto text;
  v_condicao_bate boolean;
  v_nivel1 jsonb := '{}'::jsonb;
  v_origem_nivel1 jsonb := '{}'::jsonb;
  v_linhas_geradas int;
begin
  select pi.item_id into v_item_id from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.id = p_pedido_item_id and p.company_id = v_company_id;
  if not found then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  select id into v_peca_id from public.pecas where item_id = v_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Este item não é uma peça configurável (sem BOM cadastrada).';
  end if;

  select id, status into v_bom_id, v_status from public.pedido_item_bom where pedido_item_id = p_pedido_item_id and company_id = v_company_id;
  if found and v_status = 'definitiva' then
    raise exception 'BOM já está definitiva — não é possível gerar sugestão de novo.';
  end if;

  for v_comp in select pc.material_item_id, pc.quantidade_por_unidade from public.peca_composicao pc where pc.peca_id = v_peca_id
  loop
    v_nivel1 := v_nivel1 || jsonb_build_object(v_comp.material_item_id::text, v_comp.quantidade_por_unidade);
    v_origem_nivel1 := v_origem_nivel1 || jsonb_build_object(v_comp.material_item_id::text, 'base');
  end loop;

  for v_regra in
    select pr.*, pcar.tipo as caract_tipo
    from public.peca_regras pr
    join public.peca_caracteristicas pcar on pcar.id = pr.caracteristica_id
    where pr.peca_id = v_peca_id and pr.company_id = v_company_id and pr.ativo = true
    order by pr.created_at
  loop
    select pic.valor_numero, pic.valor_texto
      into v_valor_numero, v_valor_texto
    from public.pedido_item_caracteristicas pic
    where pic.pedido_item_id = p_pedido_item_id and pic.peca_caracteristica_id = v_regra.caracteristica_id;
    if not found then
      continue;
    end if;

    v_condicao_bate := case
      when v_regra.caract_tipo = 'numero' then
        case v_regra.operador
          when '>' then v_valor_numero > v_regra.valor_comparacao_numero
          when '>=' then v_valor_numero >= v_regra.valor_comparacao_numero
          when '<' then v_valor_numero < v_regra.valor_comparacao_numero
          when '<=' then v_valor_numero <= v_regra.valor_comparacao_numero
          when '=' then v_valor_numero = v_regra.valor_comparacao_numero
          else v_valor_numero <> v_regra.valor_comparacao_numero
        end
      else
        case v_regra.operador
          when '=' then v_valor_texto = v_regra.valor_comparacao_texto
          else v_valor_texto <> v_regra.valor_comparacao_texto
        end
    end;

    if v_condicao_bate then
      if v_regra.acao = 'remover_material' then
        v_nivel1 := v_nivel1 - v_regra.acao_material_item_id::text;
        v_origem_nivel1 := v_origem_nivel1 - v_regra.acao_material_item_id::text;
      else
        v_nivel1 := v_nivel1 || jsonb_build_object(v_regra.acao_material_item_id::text, v_regra.acao_quantidade);
        v_origem_nivel1 := v_origem_nivel1 || jsonb_build_object(v_regra.acao_material_item_id::text, 'regra');
      end if;
    end if;
  end loop;

  if v_bom_id is null then
    insert into public.pedido_item_bom (company_id, pedido_item_id, peca_id, status)
    values (v_company_id, p_pedido_item_id, v_peca_id, 'sugerida')
    returning id into v_bom_id;
  else
    delete from public.pedido_item_bom_itens where pedido_item_bom_id = v_bom_id;
  end if;

  insert into public.pedido_item_bom_itens (company_id, pedido_item_bom_id, material_item_id, quantidade_por_unidade, origem)
  with recursive expansao as (
    select (kv.key)::uuid as mat_id, (kv.value)::numeric as qtd,
      coalesce(v_origem_nivel1 ->> kv.key, 'base') as origem
    from jsonb_each_text(v_nivel1) kv
    union all
    select pc.material_item_id, e.qtd * pc.quantidade_por_unidade, e.origem
    from expansao e
    join public.pecas sp on sp.item_id = e.mat_id
    join public.peca_composicao pc on pc.peca_id = sp.id
  )
  select v_company_id, v_bom_id, mat_id, sum(qtd),
    case when bool_or(origem = 'regra') then 'regra' else 'base' end
  from expansao
  where not exists (select 1 from public.pecas sp2 where sp2.item_id = expansao.mat_id)
  group by mat_id;

  get diagnostics v_linhas_geradas = row_count;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.bom_sugerida_gerada', 'pedido_item_bom', v_bom_id, null,
    jsonb_build_object('pedido_item_id', p_pedido_item_id, 'linhas', v_linhas_geradas)
  );

  return v_bom_id;
end;
$$;

grant execute on function public.gerar_bom_sugerida_pedido_item(uuid) to authenticated;

-- =========================================================================
-- ajustar_item_bom_pedido_item() / remover_item_bom_pedido_item() —
-- ajuste manual da Engenharia, só enquanto "sugerida". Só aceita item
-- folha (matéria-prima/insumo/material_auxiliar) — subconjunto não pode
-- ser ajustado aqui, isso é composição de peça (Fase A/E).
-- =========================================================================

create or replace function public.ajustar_item_bom_pedido_item(
  p_pedido_item_bom_id uuid, p_material_item_id uuid, p_quantidade_por_unidade numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_bom public.pedido_item_bom;
  v_material public.itens;
  v_id uuid;
begin
  select * into v_bom from public.pedido_item_bom where id = p_pedido_item_bom_id and company_id = v_company_id;
  if not found then
    raise exception 'BOM do pedido não encontrada nesta empresa.';
  end if;
  if v_bom.status <> 'sugerida' then
    raise exception 'Só é possível ajustar BOM ainda sugerida (status atual: %).', v_bom.status;
  end if;
  if p_quantidade_por_unidade is null or p_quantidade_por_unidade <= 0 then
    raise exception 'Quantidade precisa ser maior que zero.';
  end if;

  select * into v_material from public.itens where id = p_material_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de material não encontrado nesta empresa.';
  end if;
  if v_material.tipo not in ('materia_prima', 'insumo', 'material_auxiliar') then
    raise exception 'Ajuste manual de BOM só aceita matéria-prima/insumo/material auxiliar, não peça — "%".', v_material.codigo;
  end if;

  insert into public.pedido_item_bom_itens (company_id, pedido_item_bom_id, material_item_id, quantidade_por_unidade, origem)
  values (v_company_id, p_pedido_item_bom_id, p_material_item_id, p_quantidade_por_unidade, 'manual')
  on conflict (pedido_item_bom_id, material_item_id)
  do update set quantidade_por_unidade = excluded.quantidade_por_unidade, origem = 'manual'
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'engenharia.bom_item_ajustado', 'pedido_item_bom_itens', v_id, v_material.codigo,
    jsonb_build_object('pedido_item_bom_id', p_pedido_item_bom_id, 'quantidade_por_unidade', p_quantidade_por_unidade)
  );

  return v_id;
end;
$$;

grant execute on function public.ajustar_item_bom_pedido_item(uuid, uuid, numeric) to authenticated;

create or replace function public.remover_item_bom_pedido_item(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_bom_id uuid;
  v_status text;
begin
  select pib_i.pedido_item_bom_id into v_bom_id
  from public.pedido_item_bom_itens pib_i
  where pib_i.id = p_id and pib_i.company_id = v_company_id;
  if not found then
    raise exception 'Linha de BOM não encontrada nesta empresa.';
  end if;

  select status into v_status from public.pedido_item_bom where id = v_bom_id;
  if v_status <> 'sugerida' then
    raise exception 'Só é possível remover linha de BOM ainda sugerida (status atual: %).', v_status;
  end if;

  delete from public.pedido_item_bom_itens where id = p_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'engenharia.bom_item_removido', 'pedido_item_bom_itens', p_id, null);
end;
$$;

grant execute on function public.remover_item_bom_pedido_item(uuid) to authenticated;

-- =========================================================================
-- aprovar_bom_definitiva() — trava a BOM. Sem "voltar atrás" nesta fase
-- (reabrir definitiva pra sugerida de novo fica pra decisão futura, se
-- a operação real mostrar que precisa).
-- =========================================================================

create or replace function public.aprovar_bom_definitiva(p_pedido_item_bom_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_status text;
begin
  select status into v_status from public.pedido_item_bom where id = p_pedido_item_bom_id and company_id = v_company_id;
  if not found then
    raise exception 'BOM do pedido não encontrada nesta empresa.';
  end if;
  if v_status <> 'sugerida' then
    raise exception 'BOM já está definitiva.';
  end if;
  if not exists (select 1 from public.pedido_item_bom_itens where pedido_item_bom_id = p_pedido_item_bom_id) then
    raise exception 'Não é possível aprovar uma BOM sem nenhum material.';
  end if;

  update public.pedido_item_bom
  set status = 'definitiva', aprovado_por = auth.uid(), aprovado_em = now()
  where id = p_pedido_item_bom_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'engenharia.bom_definitiva_aprovada', 'pedido_item_bom', p_pedido_item_bom_id, null);

  return p_pedido_item_bom_id;
end;
$$;

grant execute on function public.aprovar_bom_definitiva(uuid) to authenticated;

create or replace function public.listar_bom_pedido_item(p_pedido_item_id uuid)
returns table (
  pedido_item_bom_id uuid, status text, aprovado_por uuid, aprovado_em timestamptz,
  pedido_item_bom_item_id uuid, material_item_id uuid, material_codigo text, material_descricao text,
  quantidade_por_unidade numeric, origem text
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('engenharia', 'view') then
    raise exception 'Sem permissão para consultar engenharia (engenharia.view).';
  end if;
  if not exists (
    select 1 from public.pedido_itens pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = p_pedido_item_id and p.company_id = v_company_id
  ) then
    raise exception 'Item de pedido não encontrado nesta empresa.';
  end if;

  return query
  select pib.id, pib.status, pib.aprovado_por, pib.aprovado_em,
    pib_i.id, pib_i.material_item_id, i.codigo, i.descricao, pib_i.quantidade_por_unidade, pib_i.origem
  from public.pedido_item_bom pib
  left join public.pedido_item_bom_itens pib_i on pib_i.pedido_item_bom_id = pib.id
  left join public.itens i on i.id = pib_i.material_item_id
  where pib.pedido_item_id = p_pedido_item_id and pib.company_id = v_company_id
  order by i.codigo;
end;
$$;

grant execute on function public.listar_bom_pedido_item(uuid) to authenticated;

-- =========================================================================
-- gerar_necessidades_de_pedido() / gerar_necessidades_de_ordem_producao()
-- (Fase C) — passam a preferir a BOM definitiva (Fase H) quando existe
-- pra um pedido_item; sem definitiva, continuam expandindo ao vivo via
-- peca_composicao (comportamento inalterado, Fase E) — mesma assinatura.
-- =========================================================================

create or replace function public.gerar_necessidades_de_pedido(p_pedido_id uuid)
returns table (item_id uuid, item_codigo text, item_descricao text, quantidade_gerada numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('suprimentos', 'manage');
  v_pedido public.pedidos;
  v_linha record;
  v_disponivel numeric;
  v_ja_sinalizado numeric;
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
    select coalesce(es.quantidade_fisica, 0) - coalesce(es.quantidade_reservada, 0)
      into v_disponivel
    from public.estoque_saldos es
    where es.company_id = v_company_id and es.item_id = v_linha.mat_id;
    v_disponivel := coalesce(v_disponivel, 0);

    select coalesce(sum(nc.quantidade), 0) into v_ja_sinalizado
    from public.necessidades_compra nc
    where nc.company_id = v_company_id and nc.item_id = v_linha.mat_id
      and nc.origem in ('pedido', 'producao') and nc.status = 'aberta';

    v_falta := v_linha.necessario - v_disponivel - v_ja_sinalizado;
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
  v_disponivel numeric;
  v_ja_sinalizado numeric;
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
    select coalesce(es.quantidade_fisica, 0) - coalesce(es.quantidade_reservada, 0)
      into v_disponivel
    from public.estoque_saldos es
    where es.company_id = v_company_id and es.item_id = v_linha.mat_id;
    v_disponivel := coalesce(v_disponivel, 0);

    select coalesce(sum(nc.quantidade), 0) into v_ja_sinalizado
    from public.necessidades_compra nc
    where nc.company_id = v_company_id and nc.item_id = v_linha.mat_id
      and nc.origem in ('pedido', 'producao') and nc.status = 'aberta';

    v_falta := v_linha.necessario - v_disponivel - v_ja_sinalizado;
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
