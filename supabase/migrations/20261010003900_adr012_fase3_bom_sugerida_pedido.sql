-- ADR-012, Fase 3 — Composição vira BOM sugerida no Pedido (aprovada em
-- 27/09/2026, "pode seguir" explícito do responsável do produto). Reabre a
-- decisão de 26/09/2026 (TÓPICO 10 §9) de não copiar nada automaticamente
-- na conversão orçamento→pedido.
--
-- converter_orcamento_em_pedido() deixa de copiar itens em lote
-- (INSERT...SELECT) e passa a copiar linha a linha, preservando a
-- correspondência (pedido_itens.orcamento_item_id) e propagando as
-- características capturadas no orçamento (orcamento_item_caracteristicas
-- -> pedido_item_caracteristicas) — só assim a composição calculada no
-- orçamento (peca_composicao + peca_regras, mesmo motor de
-- calcular_custo_orcamento_item) pode alimentar a BOM sugerida do pedido
-- (pedido_item_bom, já existente desde a Fase H) no momento da conversão.
--
-- Decisão operacional (§5 da ADR, resolvida em chat em 27/09/2026, depois
-- de bloquear o código desta fase): se a Engenharia aprovar uma BOM
-- definitiva diferente da composição que formou o preço no orçamento, o
-- preço já aprovado/faturado NUNCA muda sozinho — fica congelado. O que
-- muda é que aprovar_bom_definitiva() passa a comparar o custo congelado
-- (pedido_itens.custo_unitario, copiado do orçamento) contra o custo real
-- da BOM definitiva (mesma fonte de custo do §2.3: pedido_compra_itens.
-- custo_unitario mais recente) e, se houver diferença, registra uma
-- sugestão de atualização de preço (pedido_item_divergencia_preco) — nunca
-- aplicada automaticamente. Um humano com pedidos.manage decide, via
-- aplicar_atualizacao_preco_bom() ou ignorar_divergencia_preco_bom(), se
-- segue com a atualização do preço já enviado ao cliente ou mantém como
-- está — a decisão e o motivo ficam auditados.
--
-- Não muda nesta fase (ADR §3/§6): nenhum comportamento do motor de
-- regras/BOM já existente do lado da Engenharia (gerar_bom_sugerida_
-- pedido_item(), ajustar_item_bom_pedido_item(), aprovar_bom_definitiva()
-- continuam com as mesmas assinaturas e os mesmos gates; a única adição em
-- aprovar_bom_definitiva() é o registro da divergência, no fim, depois de
-- toda a lógica já existente). Documento fiscal (ADR-004) não é tocado
-- automaticamente por esta fase — se o operador decidir atualizar o preço
-- de um pedido já faturado, o ajuste fiscal correspondente é um fluxo
-- manual já existente, fora deste escopo.

-- =========================================================================
-- 1. pedido_itens ganha orcamento_item_id (correspondência linha a linha)
--    e custo_unitario (base congelada pra comparação com a BOM definitiva).
--    Ambos nullable: pedido_itens já existentes (convertidos antes desta
--    migration) ficam com os dois null — comportamento degradado (sem
--    divergência calculável), não quebrado, igual ao resto do ADR-012.
-- =========================================================================

alter table public.pedido_itens
  add column orcamento_item_id uuid references public.orcamento_itens(id),
  add column custo_unitario numeric(14, 2) check (custo_unitario is null or custo_unitario >= 0);
comment on table public.pedido_itens is 'Cópia linha a linha de orcamento_itens no momento da conversão (ADR-012 Fase 3 — antes era INSERT...SELECT em lote, sem correspondência rastreável). orcamento_item_id preserva a origem; custo_unitario é a base de custo congelada usada pra formar o preço, comparada depois contra a BOM definitiva em aprovar_bom_definitiva(). O preço em si (preco_unitario) nunca muda sozinho — só por decisão explícita via aplicar_atualizacao_preco_bom().';

-- =========================================================================
-- 2. pedido_item_divergencia_preco — sugestão de atualização de preço,
--    gerada quando aprovar_bom_definitiva() encontra custo da BOM
--    definitiva diferente do congelado. Um humano decide (pendente ->
--    aplicada/ignorada); nunca aplicada sozinha.
-- =========================================================================

create table public.pedido_item_divergencia_preco (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pedido_item_id uuid not null references public.pedido_itens(id) on delete cascade,
  custo_congelado numeric(14, 2) not null,
  custo_bom_efetiva numeric(14, 2) not null,
  custo_bom_efetiva_parcial boolean not null default false,
  preco_congelado numeric(14, 2) not null,
  preco_sugerido numeric(14, 2) not null,
  delta_custo numeric(14, 2) not null,
  status text not null default 'pendente' check (status in ('pendente', 'aplicada', 'ignorada')),
  decidido_por uuid references public.profiles(id),
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedido_item_divergencia_preco_unique unique (pedido_item_id)
);
comment on table public.pedido_item_divergencia_preco is 'ADR-012 Fase 3 — sugestão de atualização de preço quando a BOM definitiva (Engenharia) diverge do custo que formou o preço no orçamento. custo_bom_efetiva_parcial=true quando algum material da BOM definitiva não tinha histórico de custo (pedido_compra_itens) — mesma filosofia de "nunca assumir zero" do §2.3. status="pendente" é só sugestão; o preço do pedido_item só muda via aplicar_atualizacao_preco_bom(), decisão explícita e auditada.';
create index pedido_item_divergencia_preco_company_id_idx on public.pedido_item_divergencia_preco (company_id);
create index pedido_item_divergencia_preco_pendentes_idx on public.pedido_item_divergencia_preco (company_id) where status = 'pendente';

alter table public.pedido_item_divergencia_preco enable row level security;
create policy pedido_item_divergencia_preco_select on public.pedido_item_divergencia_preco for select
  using (company_id = (select public.current_company_id()));
grant select on public.pedido_item_divergencia_preco to authenticated;

create trigger set_updated_at before update on public.pedido_item_divergencia_preco
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 3. gerar_bom_sugerida_a_partir_da_conversao() — helper interno (sem
--    grant a authenticated: confia em p_company_id/p_peca_id recebidos do
--    chamador, que já validou o tenant — nunca exposto direto via RPC).
--    Mesma expansão de peca_composicao + peca_regras que gerar_bom_
--    sugerida_pedido_item() já faz (Fase H), duplicada aqui de propósito
--    em vez de reaproveitada: converter_orcamento_em_pedido() roda sob
--    pedidos.manage, não engenharia.manage, e gerar_bom_sugerida_pedido_
--    item() já testada não deveria mudar de gate nem ser tocada nesta
--    fase (ADR-012 §7 — risco fica isolado em converter_orcamento_em_
--    pedido(), a função que a própria ADR já apontou como a arriscada).
-- =========================================================================

create or replace function public.gerar_bom_sugerida_a_partir_da_conversao(
  p_pedido_item_id uuid, p_company_id uuid, p_peca_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_bom_id uuid;
  v_comp record;
  v_regra record;
  v_valor_numero numeric;
  v_valor_texto text;
  v_condicao_bate boolean;
  v_nivel1 jsonb := '{}'::jsonb;
  v_origem_nivel1 jsonb := '{}'::jsonb;
begin
  for v_comp in select pc.material_item_id, pc.quantidade_por_unidade from public.peca_composicao pc where pc.peca_id = p_peca_id
  loop
    v_nivel1 := v_nivel1 || jsonb_build_object(v_comp.material_item_id::text, v_comp.quantidade_por_unidade);
    v_origem_nivel1 := v_origem_nivel1 || jsonb_build_object(v_comp.material_item_id::text, 'base');
  end loop;

  for v_regra in
    select pr.*, pcar.tipo as caract_tipo
    from public.peca_regras pr
    join public.peca_caracteristicas pcar on pcar.id = pr.caracteristica_id
    where pr.peca_id = p_peca_id and pr.company_id = p_company_id and pr.ativo = true
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

  insert into public.pedido_item_bom (company_id, pedido_item_id, peca_id, status)
  values (p_company_id, p_pedido_item_id, p_peca_id, 'sugerida')
  returning id into v_bom_id;

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
  select p_company_id, v_bom_id, mat_id, sum(qtd),
    case when bool_or(origem = 'regra') then 'regra' else 'base' end
  from expansao
  where not exists (select 1 from public.pecas sp2 where sp2.item_id = expansao.mat_id)
  group by mat_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    p_company_id, auth.uid(), 'comercial.bom_sugerida_gerada_na_conversao', 'pedido_item_bom', v_bom_id, null,
    jsonb_build_object('pedido_item_id', p_pedido_item_id)
  );

  return v_bom_id;
end;
$$;

-- =========================================================================
-- 4. converter_orcamento_em_pedido() — linha a linha (era INSERT...SELECT
--    em lote). Toda validação anterior preservada; só a cópia dos itens
--    muda, mais a propagação de características e o auto-seed da BOM
--    sugerida pra item que for peça configurável.
-- =========================================================================

create or replace function public.converter_orcamento_em_pedido(p_orcamento_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_orcamento public.orcamentos;
  v_pedido_id uuid;
  v_numero text;
  v_oi public.orcamento_itens;
  v_pedido_item_id uuid;
  v_peca_id uuid;
begin
  select * into v_orcamento from public.orcamentos
  where id = p_orcamento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'aprovado' then
    raise exception 'Só é possível converter orçamento aprovado (status atual: %).', v_orcamento.status;
  end if;
  if exists (select 1 from public.pedidos where orcamento_id = p_orcamento_id) then
    raise exception 'Este orçamento já foi convertido em pedido.';
  end if;
  if exists (
    select 1 from public.orcamento_itens oi
    join public.itens i on i.id = oi.item_id
    where oi.orcamento_id = p_orcamento_id and i.situacao <> 'ativo'
  ) then
    raise exception 'Orçamento tem item(ns) inativo(s) desde a aprovação — reative o item ou cancele este orçamento e crie outro antes de converter.';
  end if;

  v_numero := public.next_document_number('pedido');

  insert into public.pedidos (
    company_id, numero, orcamento_id, pessoa_id, obra_id, responsavel_id, observacoes
  ) values (
    v_company_id, v_numero, p_orcamento_id, v_orcamento.pessoa_id, v_orcamento.obra_id, auth.uid(), v_orcamento.observacoes
  )
  returning id into v_pedido_id;

  for v_oi in select * from public.orcamento_itens where orcamento_id = p_orcamento_id
  loop
    insert into public.pedido_itens (company_id, pedido_id, item_id, quantidade, preco_unitario, custo_unitario, orcamento_item_id)
    values (v_company_id, v_pedido_id, v_oi.item_id, v_oi.quantidade, v_oi.preco_unitario, v_oi.custo_unitario, v_oi.id)
    returning id into v_pedido_item_id;

    insert into public.pedido_item_caracteristicas (company_id, pedido_item_id, peca_caracteristica_id, valor_numero, valor_texto)
    select v_company_id, v_pedido_item_id, oic.peca_caracteristica_id, oic.valor_numero, oic.valor_texto
    from public.orcamento_item_caracteristicas oic
    where oic.orcamento_item_id = v_oi.id;

    select id into v_peca_id from public.pecas where item_id = v_oi.item_id and company_id = v_company_id;
    if found then
      perform public.gerar_bom_sugerida_a_partir_da_conversao(v_pedido_item_id, v_company_id, v_peca_id);
    end if;
    v_peca_id := null;
  end loop;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'pedidos.pedido_convertido_de_orcamento', 'pedido', v_pedido_id, v_numero,
    jsonb_build_object('orcamento_id', p_orcamento_id, 'orcamento_numero', v_orcamento.numero)
  );

  return v_pedido_id;
end;
$$;

grant execute on function public.converter_orcamento_em_pedido(uuid) to authenticated;

-- =========================================================================
-- 5. aprovar_bom_definitiva() — mesma função, mesmo gate, mesma trava;
--    só adiciona a detecção de divergência de preço no fim, depois de
--    toda a lógica já existente e já testada.
-- =========================================================================

create or replace function public.aprovar_bom_definitiva(p_pedido_item_bom_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('engenharia', 'manage');
  v_status text;
  v_pedido_item public.pedido_itens;
  v_material record;
  v_custo_unit_material numeric;
  v_custo_efetivo numeric := 0;
  v_algum_sem_custo boolean := false;
  v_delta_custo numeric;
  v_margem numeric;
  v_preco_sugerido numeric;
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

  -- ADR-012 Fase 3 (decisão do responsável do produto, 27/09/2026): preço
  -- já aprovado/faturado fica sempre congelado — isto só registra a
  -- sugestão de atualização, nunca aplica. Só roda se o item tinha custo
  -- congelado (veio do configurador ou foi informado à mão em
  -- upsert_orcamento_item) — sem isso não há base de comparação.
  select pi.* into v_pedido_item
  from public.pedido_itens pi
  join public.pedido_item_bom pib on pib.pedido_item_id = pi.id
  where pib.id = p_pedido_item_bom_id;

  if v_pedido_item.custo_unitario is not null then
    v_custo_efetivo := 0;
    v_algum_sem_custo := false;

    for v_material in
      select pbi.material_item_id, pbi.quantidade_por_unidade
      from public.pedido_item_bom_itens pbi
      where pbi.pedido_item_bom_id = p_pedido_item_bom_id
    loop
      select pci.custo_unitario into v_custo_unit_material
      from public.pedido_compra_itens pci
      join public.pedidos_compra pc on pc.id = pci.pedido_compra_id and pc.company_id = v_company_id
      where pci.item_id = v_material.material_item_id and pci.company_id = v_company_id and pci.custo_unitario is not null
      order by pci.created_at desc
      limit 1;

      if v_custo_unit_material is null then
        v_algum_sem_custo := true;
      else
        v_custo_efetivo := v_custo_efetivo + (v_material.quantidade_por_unidade * v_custo_unit_material);
      end if;
    end loop;

    v_delta_custo := round(v_custo_efetivo, 2) - v_pedido_item.custo_unitario;

    if v_delta_custo <> 0 then
      v_margem := case when v_pedido_item.preco_unitario > 0
        then (v_pedido_item.preco_unitario - v_pedido_item.custo_unitario) / v_pedido_item.preco_unitario
        else 0 end;
      -- Mantém a mesma margem percentual já cobrada (convenção já
      -- estabelecida no TÓPICO 10 §12-14: margem = (preço-custo)/preço).
      -- Sem margem utilizável (preço 0 ou margem >= 100%), cai pra manter
      -- o markup em reais constante.
      v_preco_sugerido := case when v_margem < 1
        then round(v_custo_efetivo / (1 - v_margem), 2)
        else round(v_pedido_item.preco_unitario + v_delta_custo, 2) end;

      insert into public.pedido_item_divergencia_preco (
        company_id, pedido_item_id, custo_congelado, custo_bom_efetiva, custo_bom_efetiva_parcial,
        preco_congelado, preco_sugerido, delta_custo
      ) values (
        v_company_id, v_pedido_item.id, v_pedido_item.custo_unitario, round(v_custo_efetivo, 2), v_algum_sem_custo,
        v_pedido_item.preco_unitario, v_preco_sugerido, v_delta_custo
      )
      on conflict (pedido_item_id) do update set
        custo_bom_efetiva = excluded.custo_bom_efetiva, custo_bom_efetiva_parcial = excluded.custo_bom_efetiva_parcial,
        preco_sugerido = excluded.preco_sugerido, delta_custo = excluded.delta_custo,
        status = 'pendente', decidido_por = null, decidido_em = null, updated_at = now();

      insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
      values (
        v_company_id, auth.uid(), 'comercial.divergencia_preco_bom_detectada', 'pedido_item', v_pedido_item.id, null,
        jsonb_build_object(
          'custo_congelado', v_pedido_item.custo_unitario, 'custo_bom_efetiva', round(v_custo_efetivo, 2),
          'delta_custo', v_delta_custo, 'preco_sugerido', v_preco_sugerido, 'parcial', v_algum_sem_custo
        )
      );
    end if;
  end if;

  return p_pedido_item_bom_id;
end;
$$;

grant execute on function public.aprovar_bom_definitiva(uuid) to authenticated;

-- =========================================================================
-- 6. Decisão do operador sobre a sugestão — nunca automático.
-- =========================================================================

create or replace function public.aplicar_atualizacao_preco_bom(p_pedido_item_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_div public.pedido_item_divergencia_preco;
begin
  select * into v_div from public.pedido_item_divergencia_preco
  where pedido_item_id = p_pedido_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Nenhuma divergência de preço registrada para este item de pedido nesta empresa.';
  end if;
  if v_div.status <> 'pendente' then
    raise exception 'Esta divergência já foi decidida (status atual: %).', v_div.status;
  end if;

  update public.pedido_itens
  set preco_unitario = v_div.preco_sugerido, custo_unitario = v_div.custo_bom_efetiva
  where id = p_pedido_item_id;

  update public.pedido_item_divergencia_preco
  set status = 'aplicada', decidido_por = auth.uid(), decidido_em = now()
  where id = v_div.id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.preco_atualizado_pos_bom_definitiva', 'pedido_item', p_pedido_item_id, null,
    jsonb_build_object('preco_anterior', v_div.preco_congelado, 'preco_novo', v_div.preco_sugerido, 'custo_novo', v_div.custo_bom_efetiva)
  );
end;
$$;

grant execute on function public.aplicar_atualizacao_preco_bom(uuid) to authenticated;

create or replace function public.ignorar_divergencia_preco_bom(p_pedido_item_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('pedidos', 'manage');
  v_div public.pedido_item_divergencia_preco;
begin
  select * into v_div from public.pedido_item_divergencia_preco
  where pedido_item_id = p_pedido_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Nenhuma divergência de preço registrada para este item de pedido nesta empresa.';
  end if;
  if v_div.status <> 'pendente' then
    raise exception 'Esta divergência já foi decidida (status atual: %).', v_div.status;
  end if;

  update public.pedido_item_divergencia_preco
  set status = 'ignorada', decidido_por = auth.uid(), decidido_em = now()
  where id = v_div.id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'comercial.divergencia_preco_bom_ignorada', 'pedido_item', p_pedido_item_id, null);
end;
$$;

grant execute on function public.ignorar_divergencia_preco_bom(uuid) to authenticated;

create or replace function public.listar_divergencias_preco_pendentes(p_pedido_id uuid default null)
returns table (
  pedido_item_id uuid, pedido_id uuid, pedido_numero text, item_codigo text, item_descricao text,
  custo_congelado numeric, custo_bom_efetiva numeric, custo_bom_efetiva_parcial boolean,
  preco_congelado numeric, preco_sugerido numeric, delta_custo numeric, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('pedidos', 'view') then
    raise exception 'Sem permissão para consultar pedidos (pedidos.view).';
  end if;
  if p_pedido_id is not null and not exists (select 1 from public.pedidos where id = p_pedido_id and company_id = v_company_id) then
    raise exception 'Pedido não encontrado nesta empresa.';
  end if;

  return query
  select div.pedido_item_id, p.id, p.numero, i.codigo, i.descricao,
    div.custo_congelado, div.custo_bom_efetiva, div.custo_bom_efetiva_parcial,
    div.preco_congelado, div.preco_sugerido, div.delta_custo, div.created_at
  from public.pedido_item_divergencia_preco div
  join public.pedido_itens pi on pi.id = div.pedido_item_id
  join public.pedidos p on p.id = pi.pedido_id
  join public.itens i on i.id = pi.item_id
  where div.company_id = v_company_id and div.status = 'pendente'
    and (p_pedido_id is null or p.id = p_pedido_id)
  order by div.created_at;
end;
$$;

grant execute on function public.listar_divergencias_preco_pendentes(uuid) to authenticated;
