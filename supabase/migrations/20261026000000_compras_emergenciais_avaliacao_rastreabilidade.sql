-- Compras completo (T7) — Fase 8 da ADR-011 (docs/ADR-011 — Compras
-- v1.0.md): Compras emergenciais, avaliação de fornecedores,
-- rastreabilidade completa (TÓPICO 7 §32, §35, §39; verificação de §37).
--
-- §32 (emergencial): variante das entidades já criadas, não uma entidade
-- nova. solicitacoes_compra/pedidos_compra ganham `urgencia`
-- ('normal'/'emergencial'). Responsável já existe (solicitante_id) e
-- justificativa já existe (solicitacoes_compra.justificativa) — só
-- motivo e impacto são campos genuinamente novos. criar_compra_
-- emergencial() é um wrapper literal: chama criar_solicitacao_compra()
-- (sem mudar a assinatura dela — nenhum novo overload) e faz um UPDATE
-- de acompanhamento nos campos emergenciais da linha recém-criada.
-- gerar_pedido_compra_de_cotacao() (Fase 6, mesma assinatura) passa a
-- copiar a urgencia da SC de origem pro(s) PC(s) gerado(s) — nenhum
-- parâmetro novo, sem risco de overload.
--
-- §35 (avaliação): pesos por critério configuráveis por empresa
-- (criterios_avaliacao_fornecedor) — decisão de escopo confirmada com o
-- responsável do produto (pesos iguais, 20% cada, como default até a
-- empresa configurar o próprio). Os 8 indicadores do Prompt (prazo,
-- atraso, divergências, rejeições, qualidade, preço, ocorrências, volume)
-- são condensados em 5 critérios calculáveis a partir de dado real já
-- existente (Fase 5/7): atraso funde em prazo; qualidade e ocorrências
-- fundem em divergências (tipo='qualidade' já é um dos tipos de
-- divergência). Cada critério vira um sub-score 0-100; quando o dado
-- necessário não existe pro período (ex.: nenhuma proposta com prazo_
-- entrega_dias informado), o critério é OMITIDO da média em vez de
-- forçado a 0 — não inventa reputação ruim por falta de dado.
--
-- §39 (rastreabilidade): em vez de tentar reconstruir o vínculo
-- recebimento→estoque_movimentacoes só pelo texto do motivo (frágil),
-- estoque_movimentacoes ganha `recebimento_item_id` (nullable, só
-- preenchido pelas duas funções da Fase 7 que criam movimentação de
-- compra/devolução). Isso NÃO muda a assinatura de ajustar_saldo() — a
-- ligação é feita de fora, por um UPDATE na mesma função que já chama
-- ajustar_saldo(), reaproveitando o id que ele já retorna.
-- Rastreabilidade "consumo" (quem especificamente consumiu um lote
-- recebido) não é reconstruível pra item de controle escalar — uma vez
-- que a entrada se funde em estoque_saldos.quantidade_fisica, a origem
-- física individual se perde por desenho (T6, decisão de estoque
-- escalar). rastrear_necessidade()/rastrear_material() vão até
-- "estoque" (a movimentação de entrada) e documentam essa fronteira
-- explicitamente no jsonb retornado, em vez de fabricar um vínculo que
-- o modelo de dados não sustenta.

-- =========================================================================
-- estoque_movimentacoes.recebimento_item_id — ligação de rastreabilidade
-- (§39), só preenchida por finalizar_conferencia_recebimento() (tipo=
-- 'compra') e registrar_devolucao_compra() (tipo='devolucao').
-- =========================================================================

alter table public.estoque_movimentacoes
  add column recebimento_item_id uuid references public.recebimento_itens(id);
create index estoque_movimentacoes_recebimento_item_id_idx on public.estoque_movimentacoes (recebimento_item_id);

create or replace function public.finalizar_conferencia_recebimento(p_recebimento_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_recebimento public.recebimentos_pedido_compra;
  v_item record;
  v_qtd_recusada numeric;
  v_qtd_aceita numeric;
  v_necessidade_id uuid;
  v_mov_id uuid;
begin
  select * into v_recebimento from public.recebimentos_pedido_compra where id = p_recebimento_id and company_id = v_company_id;
  if not found then
    raise exception 'Recebimento não encontrado nesta empresa.';
  end if;
  if v_recebimento.status <> 'em_conferencia' then
    raise exception 'Só é possível finalizar conferência de um recebimento em_conferencia (status atual: %).', v_recebimento.status;
  end if;
  if exists (
    select 1 from public.divergencias_recebimento dr
    join public.recebimento_itens ri on ri.id = dr.recebimento_item_id
    where ri.recebimento_id = p_recebimento_id and dr.status = 'aberta'
  ) then
    raise exception 'Existem divergências abertas neste recebimento — trate todas antes de finalizar a conferência.';
  end if;

  for v_item in select * from public.recebimento_itens where recebimento_id = p_recebimento_id loop
    select coalesce(sum(dr.quantidade_divergente), 0) into v_qtd_recusada
    from public.divergencias_recebimento dr
    where dr.recebimento_item_id = v_item.id and dr.status = 'tratada' and dr.decisao = 'recusar';

    v_qtd_aceita := v_item.quantidade_recebida - v_qtd_recusada;
    if v_qtd_aceita < 0 then
      v_qtd_aceita := 0;
    end if;

    update public.recebimento_itens set quantidade_aceita = v_qtd_aceita, status = 'conferido' where id = v_item.id;

    if v_qtd_aceita > 0 then
      v_mov_id := public.ajustar_saldo(
        v_item.item_id, v_qtd_aceita,
        format('Recebimento %s do pedido de compra.', v_recebimento.numero),
        'compra'
      );
      update public.estoque_movimentacoes set recebimento_item_id = v_item.id where id = v_mov_id;
    end if;

    select nc.id into v_necessidade_id
    from public.pedido_compra_itens pci
    join public.cotacao_itens ci on ci.id = pci.cotacao_item_id
    join public.solicitacao_compra_itens sci on sci.id = ci.solicitacao_compra_item_id
    join public.necessidades_compra nc on nc.id = sci.necessidade_compra_id
    where pci.id = v_item.pedido_compra_item_id and nc.status = 'atendida';

    if v_necessidade_id is not null then
      update public.necessidades_compra set
        status = 'recebida', quantidade_recebida = v_qtd_aceita, data_recebimento = now(), recebido_por = auth.uid()
      where id = v_necessidade_id;
    end if;
  end loop;

  update public.recebimentos_pedido_compra set status = 'conferido' where id = p_recebimento_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.conferencia_finalizada', 'recebimento_pedido_compra', p_recebimento_id, v_recebimento.numero);

  return p_recebimento_id;
end;
$$;

create or replace function public.registrar_devolucao_compra(
  p_recebimento_item_id uuid,
  p_quantidade numeric,
  p_motivo text,
  p_divergencia_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_item public.recebimento_itens;
  v_ja_devolvido numeric;
  v_id uuid;
  v_mov_id uuid;
begin
  select * into v_item from public.recebimento_itens where id = p_recebimento_item_id and company_id = v_company_id;
  if not found then
    raise exception 'Item de recebimento não encontrado nesta empresa.';
  end if;
  if v_item.status <> 'conferido' or v_item.quantidade_aceita is null then
    raise exception 'Só é possível devolver item já conferido.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade da devolução deve ser maior que zero.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Motivo da devolução é obrigatório.';
  end if;
  if p_divergencia_id is not null and not exists (
    select 1 from public.divergencias_recebimento where id = p_divergencia_id and company_id = v_company_id and recebimento_item_id = p_recebimento_item_id
  ) then
    raise exception 'Divergência não encontrada para este item de recebimento.';
  end if;

  select coalesce(sum(quantidade), 0) into v_ja_devolvido from public.devolucoes_compra
  where recebimento_item_id = p_recebimento_item_id and status = 'registrada';
  if v_ja_devolvido + p_quantidade > v_item.quantidade_aceita then
    raise exception 'Quantidade a devolver (%) excederia a quantidade aceita do item (%, já devolvido %).',
      v_ja_devolvido + p_quantidade, v_item.quantidade_aceita, v_ja_devolvido;
  end if;

  v_mov_id := public.ajustar_saldo(v_item.item_id, -p_quantidade, p_motivo, 'devolucao');
  update public.estoque_movimentacoes set recebimento_item_id = v_item.id where id = v_mov_id;

  insert into public.devolucoes_compra (company_id, recebimento_item_id, divergencia_id, quantidade, motivo, registrado_por)
  values (v_company_id, p_recebimento_item_id, p_divergencia_id, p_quantidade, p_motivo, auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'compras.devolucao_registrada', 'recebimento_item', p_recebimento_item_id, p_motivo,
    jsonb_build_object('quantidade', p_quantidade)
  );

  return v_id;
end;
$$;

-- =========================================================================
-- Compras emergenciais (§32) — solicitacoes_compra/pedidos_compra ganham
-- urgencia. justificativa reaproveita a coluna já existente; responsável
-- reaproveita solicitante_id.
-- =========================================================================

alter table public.solicitacoes_compra
  add column urgencia text not null default 'normal' check (urgencia in ('normal', 'emergencial')),
  add column emergencial_motivo text,
  add column emergencial_impacto text,
  add constraint solicitacoes_compra_emergencial_check check (
    urgencia = 'normal' or (emergencial_motivo is not null and emergencial_impacto is not null and justificativa is not null)
  );
comment on column public.solicitacoes_compra.urgencia is 'Fase 8 da ADR-011 (TÓPICO 7 §32) — emergencial exige motivo/impacto (esta linha) e justificativa (coluna já existente) preenchidos, verificado por CHECK. Responsável já é solicitante_id; aprovação segue a mesma alçada de cotação/PC (Fase 5/6), sem regra especial.';

alter table public.pedidos_compra
  add column urgencia text not null default 'normal' check (urgencia in ('normal', 'emergencial'));
comment on column public.pedidos_compra.urgencia is 'Fase 8 da ADR-011 — copiada da(s) solicitação(ões) de compra de origem em gerar_pedido_compra_de_cotacao() (emergencial se qualquer item selecionado vier de SC emergencial); motivo/impacto ficam só na SC de origem, rastreável via pedido_compra_itens -> cotacao_itens -> solicitacao_compra_itens -> solicitacoes_compra.';

create or replace function public.gerar_pedido_compra_de_cotacao(p_cotacao_id uuid)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_cotacao public.cotacoes;
  v_aprovacao public.compras_aprovacoes;
  v_pessoa_id uuid;
  v_pc_id uuid;
  v_numero text;
  v_urgencia text;
  v_ids uuid[] := '{}';
begin
  select * into v_cotacao from public.cotacoes where id = p_cotacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Cotação não encontrada nesta empresa.';
  end if;
  if v_cotacao.status <> 'selecionada' then
    raise exception 'Só é possível gerar pedido de compra de uma cotação selecionada (status atual: %).', v_cotacao.status;
  end if;
  if v_cotacao.aprovacao_id is null then
    raise exception 'Cotação sem aprovação vinculada.';
  end if;
  select * into v_aprovacao from public.compras_aprovacoes where id = v_cotacao.aprovacao_id;
  if v_aprovacao.status <> 'aprovada' then
    raise exception 'Cotação ainda não aprovada pela alçada (status atual: %).', v_aprovacao.status;
  end if;
  if exists (select 1 from public.pedidos_compra where cotacao_id = p_cotacao_id) then
    raise exception 'Já existe pedido de compra gerado para esta cotação.';
  end if;

  select sc.urgencia into v_urgencia from public.solicitacoes_compra sc where sc.id = v_cotacao.solicitacao_compra_id;

  for v_pessoa_id in
    select distinct cp.pessoa_id
    from public.cotacao_selecoes cs
    join public.cotacao_propostas cp on cp.id = cs.cotacao_proposta_id
    join public.cotacao_itens ci on ci.id = cs.cotacao_item_id
    where ci.cotacao_id = p_cotacao_id
  loop
    v_numero := public.next_document_number('pedido_compra');
    insert into public.pedidos_compra (company_id, numero, cotacao_id, pessoa_id, urgencia)
    values (v_company_id, v_numero, p_cotacao_id, v_pessoa_id, coalesce(v_urgencia, 'normal'))
    returning id into v_pc_id;

    insert into public.pedido_compra_itens (company_id, pedido_compra_id, cotacao_item_id, item_id, quantidade, preco_unitario, custo_unitario)
    select v_company_id, v_pc_id, cs.cotacao_item_id, sci.item_id, cs.quantidade, cp.preco_unitario, cp.custo_unitario
    from public.cotacao_selecoes cs
    join public.cotacao_propostas cp on cp.id = cs.cotacao_proposta_id
    join public.cotacao_itens ci on ci.id = cs.cotacao_item_id
    join public.solicitacao_compra_itens sci on sci.id = ci.solicitacao_compra_item_id
    where ci.cotacao_id = p_cotacao_id and cp.pessoa_id = v_pessoa_id;

    v_ids := v_ids || v_pc_id;

    insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
    values (v_company_id, auth.uid(), 'compras.pedido_compra_gerado', 'pedido_compra', v_pc_id, v_numero);
  end loop;

  return v_ids;
end;
$$;

create function public.criar_compra_emergencial(
  p_setor text,
  p_motivo text,
  p_justificativa text,
  p_impacto text,
  p_prioridade text default 'urgente'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_id uuid;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Motivo da compra emergencial é obrigatório.';
  end if;
  if p_justificativa is null or btrim(p_justificativa) = '' then
    raise exception 'Justificativa é obrigatória.';
  end if;
  if p_impacto is null or btrim(p_impacto) = '' then
    raise exception 'Impacto operacional é obrigatório.';
  end if;

  v_id := public.criar_solicitacao_compra(p_setor, p_prioridade, p_justificativa);

  update public.solicitacoes_compra set
    urgencia = 'emergencial', emergencial_motivo = p_motivo, emergencial_impacto = p_impacto
  where id = v_id and company_id = v_company_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'compras.compra_emergencial_criada', 'solicitacao_compra', v_id, p_justificativa,
    jsonb_build_object('motivo', p_motivo, 'impacto', p_impacto)
  );

  return v_id;
end;
$$;

grant execute on function public.criar_compra_emergencial(text, text, text, text, text) to authenticated;

-- =========================================================================
-- Avaliação de fornecedores (§35) — critérios com peso configurável por
-- empresa; sub-scores 0-100 calculados de dado real (Fase 5/7); default
-- de 20% cada quando a empresa não configurou (decisão confirmada com o
-- responsável do produto).
-- =========================================================================

create table public.criterios_avaliacao_fornecedor (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  chave text not null check (chave in ('prazo', 'divergencias', 'rejeicoes', 'preco', 'volume')),
  peso numeric(5, 2) not null check (peso >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint criterios_avaliacao_fornecedor_unique unique (company_id, chave)
);
comment on table public.criterios_avaliacao_fornecedor is 'Fase 8 da ADR-011 (TÓPICO 7 §35) — peso por critério de avaliação, configurável por empresa. Critério sem linha aqui usa o default de 20 (peso igual entre os 5, decisão confirmada com o responsável do produto) em avaliar_fornecedor().';
create index criterios_avaliacao_fornecedor_company_id_idx on public.criterios_avaliacao_fornecedor (company_id);

alter table public.criterios_avaliacao_fornecedor enable row level security;
create policy criterios_avaliacao_fornecedor_select on public.criterios_avaliacao_fornecedor for select
  using (company_id = (select public.current_company_id()));
grant select on public.criterios_avaliacao_fornecedor to authenticated;

create trigger set_updated_at before update on public.criterios_avaliacao_fornecedor
  for each row execute function public.set_updated_at();

create function public.upsert_criterio_avaliacao_fornecedor(p_chave text, p_peso numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_id uuid;
begin
  if p_chave not in ('prazo', 'divergencias', 'rejeicoes', 'preco', 'volume') then
    raise exception 'Critério inválido: "%".', p_chave;
  end if;
  if p_peso is null or p_peso < 0 then
    raise exception 'Peso inválido.';
  end if;

  insert into public.criterios_avaliacao_fornecedor (company_id, chave, peso)
  values (v_company_id, p_chave, p_peso)
  on conflict (company_id, chave) do update set peso = excluded.peso, updated_at = now()
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.criterio_avaliacao_definido', 'criterio_avaliacao_fornecedor', v_id, p_chave);

  return v_id;
end;
$$;

grant execute on function public.upsert_criterio_avaliacao_fornecedor(text, numeric) to authenticated;

create table public.fornecedor_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pessoa_id uuid not null references public.pessoas(id),
  periodo_inicio date not null,
  periodo_fim date not null,
  score numeric(5, 2),
  detalhamento jsonb not null,
  avaliado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint fornecedor_avaliacoes_periodo_check check (periodo_fim >= periodo_inicio)
);
comment on table public.fornecedor_avaliacoes is 'Fase 8 da ADR-011 (TÓPICO 7 §35) — snapshot append-only de uma avaliação de fornecedor (avaliar_fornecedor()); nunca sobrescrita, cada chamada gera uma nova linha. detalhamento traz o sub-score e os números brutos de cada critério, inclusive os critérios omitidos por falta de dado.';
create index fornecedor_avaliacoes_company_id_idx on public.fornecedor_avaliacoes (company_id);
create index fornecedor_avaliacoes_pessoa_id_idx on public.fornecedor_avaliacoes (pessoa_id);

alter table public.fornecedor_avaliacoes enable row level security;
create policy fornecedor_avaliacoes_select on public.fornecedor_avaliacoes for select
  using (company_id = (select public.current_company_id()));
grant select on public.fornecedor_avaliacoes to authenticated;

create function public.avaliar_fornecedor(p_pessoa_id uuid, p_periodo_inicio date, p_periodo_fim date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('compras', 'manage');
  v_peso_prazo numeric; v_peso_divergencias numeric; v_peso_rejeicoes numeric; v_peso_preco numeric; v_peso_volume numeric;
  v_score_prazo numeric; v_score_divergencias numeric; v_score_rejeicoes numeric; v_score_preco numeric; v_score_volume numeric;
  v_total_recebidos int; v_total_com_prazo int; v_no_prazo int;
  v_itens_recebidos int; v_itens_divergentes int;
  v_qtd_recebida numeric; v_qtd_aceita numeric;
  v_media_preco numeric; v_desvio_preco numeric; v_qtd_pontos_preco int;
  v_volume_fornecedor numeric; v_volume_maximo numeric;
  v_soma_pesos numeric := 0;
  v_soma_ponderada numeric := 0;
  v_id uuid;
begin
  if not exists (
    select 1 from public.pessoas p
    join public.pessoa_papeis pp on pp.pessoa_id = p.id
    where p.id = p_pessoa_id and p.company_id = v_company_id and pp.papel = 'FORNECEDOR' and pp.ativo
  ) then
    raise exception 'Pessoa não encontrada nesta empresa ou sem papel FORNECEDOR ativo.';
  end if;
  if p_periodo_inicio is null or p_periodo_fim is null or p_periodo_fim < p_periodo_inicio then
    raise exception 'Período inválido.';
  end if;

  select peso into v_peso_prazo from public.criterios_avaliacao_fornecedor where company_id = v_company_id and chave = 'prazo';
  select peso into v_peso_divergencias from public.criterios_avaliacao_fornecedor where company_id = v_company_id and chave = 'divergencias';
  select peso into v_peso_rejeicoes from public.criterios_avaliacao_fornecedor where company_id = v_company_id and chave = 'rejeicoes';
  select peso into v_peso_preco from public.criterios_avaliacao_fornecedor where company_id = v_company_id and chave = 'preco';
  select peso into v_peso_volume from public.criterios_avaliacao_fornecedor where company_id = v_company_id and chave = 'volume';
  v_peso_prazo := coalesce(v_peso_prazo, 20);
  v_peso_divergencias := coalesce(v_peso_divergencias, 20);
  v_peso_rejeicoes := coalesce(v_peso_rejeicoes, 20);
  v_peso_preco := coalesce(v_peso_preco, 20);
  v_peso_volume := coalesce(v_peso_volume, 20);

  -- prazo: % de recebimentos até a data esperada (criação do PC + prazo_entrega_dias
  -- da proposta vencedora), só entre PCs cuja proposta informou prazo_entrega_dias.
  select count(*), count(*) filter (where r.data_recebimento <= (pc.created_at::date + cp.prazo_entrega_dias))
    into v_total_com_prazo, v_no_prazo
  from public.recebimentos_pedido_compra r
  join public.pedidos_compra pc on pc.id = r.pedido_compra_id
  join public.recebimento_itens ri on ri.recebimento_id = r.id
  join public.pedido_compra_itens pci on pci.id = ri.pedido_compra_item_id
  join public.cotacao_itens ci on ci.id = pci.cotacao_item_id
  join public.cotacao_propostas cp on cp.cotacao_item_id = ci.id and cp.pessoa_id = p_pessoa_id
  where pc.company_id = v_company_id and pc.pessoa_id = p_pessoa_id and r.status <> 'cancelado'
    and cp.prazo_entrega_dias is not null
    and r.data_recebimento between p_periodo_inicio and p_periodo_fim;
  if coalesce(v_total_com_prazo, 0) > 0 then
    v_score_prazo := 100.0 * v_no_prazo / v_total_com_prazo;
  end if;

  -- divergências: % de itens recebidos SEM nenhuma divergência registrada.
  select count(distinct ri.id) into v_itens_recebidos
  from public.recebimento_itens ri
  join public.recebimentos_pedido_compra r on r.id = ri.recebimento_id
  join public.pedidos_compra pc on pc.id = r.pedido_compra_id
  where pc.company_id = v_company_id and pc.pessoa_id = p_pessoa_id and r.status <> 'cancelado'
    and r.data_recebimento between p_periodo_inicio and p_periodo_fim;
  select count(distinct ri.id) into v_itens_divergentes
  from public.recebimento_itens ri
  join public.recebimentos_pedido_compra r on r.id = ri.recebimento_id
  join public.pedidos_compra pc on pc.id = r.pedido_compra_id
  join public.divergencias_recebimento dr on dr.recebimento_item_id = ri.id
  where pc.company_id = v_company_id and pc.pessoa_id = p_pessoa_id and r.status <> 'cancelado'
    and r.data_recebimento between p_periodo_inicio and p_periodo_fim;
  if coalesce(v_itens_recebidos, 0) > 0 then
    v_score_divergencias := 100.0 * (v_itens_recebidos - v_itens_divergentes) / v_itens_recebidos;
  end if;

  -- rejeições: % da quantidade recebida (já conferida) que foi de fato aceita.
  select coalesce(sum(ri.quantidade_recebida), 0), coalesce(sum(ri.quantidade_aceita), 0)
    into v_qtd_recebida, v_qtd_aceita
  from public.recebimento_itens ri
  join public.recebimentos_pedido_compra r on r.id = ri.recebimento_id
  join public.pedidos_compra pc on pc.id = r.pedido_compra_id
  where pc.company_id = v_company_id and pc.pessoa_id = p_pessoa_id and r.status <> 'cancelado'
    and ri.status = 'conferido' and r.data_recebimento between p_periodo_inicio and p_periodo_fim;
  if v_qtd_recebida > 0 then
    v_score_rejeicoes := 100.0 * v_qtd_aceita / v_qtd_recebida;
  end if;

  -- preço: estabilidade (100 - coeficiente de variação em %, limitado a 0) no
  -- histórico de propostas do período; precisa de pelo menos 2 pontos.
  select count(*), avg(preco), stddev_samp(preco) into v_qtd_pontos_preco, v_media_preco, v_desvio_preco
  from public.historico_precos_item_fornecedor
  where company_id = v_company_id and pessoa_id = p_pessoa_id
    and registrado_em::date between p_periodo_inicio and p_periodo_fim;
  if coalesce(v_qtd_pontos_preco, 0) >= 2 and v_media_preco > 0 then
    v_score_preco := greatest(0, 100 - (100.0 * coalesce(v_desvio_preco, 0) / v_media_preco));
  end if;

  -- volume: valor comprado deste fornecedor no período, relativo ao maior
  -- volume entre todos os fornecedores com PC no mesmo período (0-100).
  select coalesce(sum(pci.quantidade * pci.preco_unitario), 0) into v_volume_fornecedor
  from public.pedido_compra_itens pci
  join public.pedidos_compra pc on pc.id = pci.pedido_compra_id
  where pc.company_id = v_company_id and pc.pessoa_id = p_pessoa_id and pc.status <> 'cancelado'
    and pc.created_at::date between p_periodo_inicio and p_periodo_fim;
  select max(volume) into v_volume_maximo from (
    select coalesce(sum(pci.quantidade * pci.preco_unitario), 0) as volume
    from public.pedido_compra_itens pci
    join public.pedidos_compra pc on pc.id = pci.pedido_compra_id
    where pc.company_id = v_company_id and pc.status <> 'cancelado'
      and pc.created_at::date between p_periodo_inicio and p_periodo_fim
    group by pc.pessoa_id
  ) volumes;
  if coalesce(v_volume_maximo, 0) > 0 then
    v_score_volume := 100.0 * v_volume_fornecedor / v_volume_maximo;
  end if;

  if v_score_prazo is not null then v_soma_pesos := v_soma_pesos + v_peso_prazo; v_soma_ponderada := v_soma_ponderada + v_score_prazo * v_peso_prazo; end if;
  if v_score_divergencias is not null then v_soma_pesos := v_soma_pesos + v_peso_divergencias; v_soma_ponderada := v_soma_ponderada + v_score_divergencias * v_peso_divergencias; end if;
  if v_score_rejeicoes is not null then v_soma_pesos := v_soma_pesos + v_peso_rejeicoes; v_soma_ponderada := v_soma_ponderada + v_score_rejeicoes * v_peso_rejeicoes; end if;
  if v_score_preco is not null then v_soma_pesos := v_soma_pesos + v_peso_preco; v_soma_ponderada := v_soma_ponderada + v_score_preco * v_peso_preco; end if;
  if v_score_volume is not null then v_soma_pesos := v_soma_pesos + v_peso_volume; v_soma_ponderada := v_soma_ponderada + v_score_volume * v_peso_volume; end if;

  insert into public.fornecedor_avaliacoes (company_id, pessoa_id, periodo_inicio, periodo_fim, score, detalhamento, avaliado_por)
  values (
    v_company_id, p_pessoa_id, p_periodo_inicio, p_periodo_fim,
    case when v_soma_pesos > 0 then round(v_soma_ponderada / v_soma_pesos, 2) else null end,
    jsonb_build_object(
      'prazo', jsonb_build_object('peso', v_peso_prazo, 'score', v_score_prazo, 'recebimentos_no_prazo', v_no_prazo, 'recebimentos_com_prazo_conhecido', v_total_com_prazo),
      'divergencias', jsonb_build_object('peso', v_peso_divergencias, 'score', v_score_divergencias, 'itens_recebidos', v_itens_recebidos, 'itens_divergentes', v_itens_divergentes),
      'rejeicoes', jsonb_build_object('peso', v_peso_rejeicoes, 'score', v_score_rejeicoes, 'quantidade_recebida', v_qtd_recebida, 'quantidade_aceita', v_qtd_aceita),
      'preco', jsonb_build_object('peso', v_peso_preco, 'score', v_score_preco, 'pontos', v_qtd_pontos_preco, 'media', v_media_preco, 'desvio', v_desvio_preco),
      'volume', jsonb_build_object('peso', v_peso_volume, 'score', v_score_volume, 'volume_fornecedor', v_volume_fornecedor, 'volume_maximo_periodo', v_volume_maximo)
    ),
    auth.uid()
  )
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'compras.fornecedor_avaliado', 'fornecedor_avaliacao', v_id, null);

  return v_id;
end;
$$;

grant execute on function public.avaliar_fornecedor(uuid, date, date) to authenticated;

-- =========================================================================
-- Rastreabilidade (§39) — necessidade↔SC↔cotação↔negociação↔aprovação↔
-- PC↔recebimento↔estoque, e consulta reversa a partir de uma movimentação
-- de estoque. montar_rastreabilidade_pedido_item() é interna (não
-- concedida a authenticated) — hub compartilhado pelos dois pontos de
-- entrada públicos.
-- =========================================================================

create function public.montar_rastreabilidade_pedido_item(p_pedido_compra_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'pedido_compra_item', jsonb_build_object('id', pci.id, 'item_id', pci.item_id, 'quantidade', pci.quantidade, 'preco_unitario', pci.preco_unitario),
    'pedido_compra', jsonb_build_object('id', pc.id, 'numero', pc.numero, 'status', pc.status, 'urgencia', pc.urgencia, 'pessoa_id', pc.pessoa_id, 'created_at', pc.created_at),
    'cotacao', jsonb_build_object('id', cot.id, 'numero', cot.numero, 'status', cot.status),
    'negociacoes', coalesce((
      select jsonb_agg(jsonb_build_object('rodada', cn.rodada, 'preco_anterior', cn.preco_anterior, 'preco_novo', cn.preco_novo, 'created_at', cn.created_at) order by cn.rodada)
      from public.cotacao_negociacoes cn where cn.cotacao_proposta_id in (select cp2.id from public.cotacao_propostas cp2 where cp2.cotacao_item_id = ci.id)
    ), '[]'::jsonb),
    'aprovacao', (
      select jsonb_build_object('id', ap.id, 'status', ap.status, 'etapas', coalesce((
        select jsonb_agg(jsonb_build_object('ordem', ae.ordem, 'status', ae.status, 'decidido_por', ae.decidido_por, 'decidido_em', ae.decidido_em) order by ae.ordem)
        from public.compras_aprovacao_etapas ae where ae.compra_aprovacao_id = ap.id
      ), '[]'::jsonb))
      from public.compras_aprovacoes ap where ap.id = cot.aprovacao_id
    ),
    'solicitacao_compra', jsonb_build_object('id', sc.id, 'numero', sc.numero, 'status', sc.status, 'urgencia', sc.urgencia, 'emergencial_motivo', sc.emergencial_motivo, 'emergencial_impacto', sc.emergencial_impacto),
    'necessidade_compra', (select jsonb_build_object('id', nc.id, 'status', nc.status, 'origem', nc.origem) from public.necessidades_compra nc where nc.id = sci.necessidade_compra_id),
    'recebimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recebimento_numero', r.numero, 'data_recebimento', r.data_recebimento,
        'quantidade_recebida', ri.quantidade_recebida, 'quantidade_aceita', ri.quantidade_aceita, 'status', ri.status,
        'lotes', coalesce((select jsonb_agg(jsonb_build_object('numero_lote', l.numero_lote, 'quantidade', l.quantidade)) from public.lotes_recebimento l where l.recebimento_item_id = ri.id), '[]'::jsonb),
        'divergencias', coalesce((select jsonb_agg(jsonb_build_object('tipo', d.tipo, 'status', d.status, 'decisao', d.decisao)) from public.divergencias_recebimento d where d.recebimento_item_id = ri.id), '[]'::jsonb),
        'devolucoes', coalesce((select jsonb_agg(jsonb_build_object('quantidade', dc.quantidade, 'motivo', dc.motivo, 'status', dc.status)) from public.devolucoes_compra dc where dc.recebimento_item_id = ri.id), '[]'::jsonb),
        'estoque_movimentacao', (select jsonb_build_object('id', em.id, 'tipo', em.tipo, 'quantidade', em.quantidade, 'created_at', em.created_at) from public.estoque_movimentacoes em where em.recebimento_item_id = ri.id and em.tipo = 'compra')
      ))
      from public.recebimento_itens ri
      join public.recebimentos_pedido_compra r on r.id = ri.recebimento_id
      where ri.pedido_compra_item_id = pci.id
    ), '[]'::jsonb),
    'nota', 'Rastreabilidade vai até a entrada em estoque (movimentação tipo=compra). Consumo posterior específico deste lote não é reconstruível — o modelo de estoque é escalar (T6): a entrada se funde em estoque_saldos.quantidade_fisica e a origem física individual se perde por desenho, exceto para item com controle dimensional por peça (T7 Fase 2, itens_pecas_dimensionais).'
  ) into v_result
  from public.pedido_compra_itens pci
  join public.pedidos_compra pc on pc.id = pci.pedido_compra_id
  join public.cotacao_itens ci on ci.id = pci.cotacao_item_id
  join public.cotacoes cot on cot.id = ci.cotacao_id
  join public.solicitacao_compra_itens sci on sci.id = ci.solicitacao_compra_item_id
  join public.solicitacoes_compra sc on sc.id = sci.solicitacao_compra_id
  where pci.id = p_pedido_compra_item_id;

  return v_result;
end;
$$;

create function public.rastrear_necessidade(p_necessidade_compra_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_necessidade public.necessidades_compra;
  v_pedido_compra_item_id uuid;
  v_compra_direta record;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('compras', 'view') then
    raise exception 'Sem permissão para consultar compras (compras.view).';
  end if;

  select * into v_necessidade from public.necessidades_compra where id = p_necessidade_compra_id and company_id = v_company_id;
  if not found then
    raise exception 'Necessidade de compra não encontrada nesta empresa.';
  end if;

  select pci.id into v_pedido_compra_item_id
  from public.solicitacao_compra_itens sci
  join public.cotacao_itens ci on ci.solicitacao_compra_item_id = sci.id
  join public.pedido_compra_itens pci on pci.cotacao_item_id = ci.id
  where sci.necessidade_compra_id = p_necessidade_compra_id and sci.company_id = v_company_id
  limit 1;

  if v_pedido_compra_item_id is not null then
    return jsonb_build_object('necessidade_compra', to_jsonb(v_necessidade)) || public.montar_rastreabilidade_pedido_item(v_pedido_compra_item_id);
  end if;

  select id, motivo, justificativa, status into v_compra_direta from public.compras_diretas where necessidade_compra_id = p_necessidade_compra_id limit 1;
  if found then
    return jsonb_build_object(
      'necessidade_compra', to_jsonb(v_necessidade),
      'compra_direta', jsonb_build_object('id', v_compra_direta.id, 'motivo', v_compra_direta.motivo, 'justificativa', v_compra_direta.justificativa, 'status', v_compra_direta.status),
      'nota', 'Compra direta (§2) não passa por SC/cotação/PC — não há recebimento formal desta fase pra rastrear (recebimento leve, T7 Fase D, se usado, fica em necessidades_compra.status/quantidade_recebida diretamente).'
    );
  end if;

  return jsonb_build_object('necessidade_compra', to_jsonb(v_necessidade), 'nota', 'Necessidade ainda não vinculada a nenhuma solicitação de compra, cotação ou compra direta.');
end;
$$;

grant execute on function public.rastrear_necessidade(uuid) to authenticated;

create function public.rastrear_material(p_estoque_movimentacao_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_mov public.estoque_movimentacoes;
  v_pedido_compra_item_id uuid;
  v_necessidade_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('compras', 'view') then
    raise exception 'Sem permissão para consultar compras (compras.view).';
  end if;

  select * into v_mov from public.estoque_movimentacoes where id = p_estoque_movimentacao_id and company_id = v_company_id;
  if not found then
    raise exception 'Movimentação de estoque não encontrada nesta empresa.';
  end if;
  if v_mov.recebimento_item_id is null then
    return jsonb_build_object('estoque_movimentacao', jsonb_build_object('id', v_mov.id, 'tipo', v_mov.tipo, 'quantidade', v_mov.quantidade), 'nota', 'Movimentação não originada de um recebimento de pedido de compra (ex.: ajuste manual, entrada de sobra, consumo/reserva de pedido de venda) — sem cadeia de Compras pra rastrear.');
  end if;

  select ri.pedido_compra_item_id into v_pedido_compra_item_id from public.recebimento_itens ri where ri.id = v_mov.recebimento_item_id;

  select sci.necessidade_compra_id into v_necessidade_id
  from public.pedido_compra_itens pci
  join public.cotacao_itens ci on ci.id = pci.cotacao_item_id
  join public.solicitacao_compra_itens sci on sci.id = ci.solicitacao_compra_item_id
  where pci.id = v_pedido_compra_item_id;

  return jsonb_build_object('estoque_movimentacao', jsonb_build_object('id', v_mov.id, 'tipo', v_mov.tipo, 'quantidade', v_mov.quantidade, 'necessidade_compra_id', v_necessidade_id))
    || public.montar_rastreabilidade_pedido_item(v_pedido_compra_item_id);
end;
$$;

grant execute on function public.rastrear_material(uuid) to authenticated;
