-- ADR-012, Fase 4 — Mão de obra automática (aprovada em 27/09/2026, "pode
-- seguir" explícito do responsável do produto). Usa os roteiros produtivos
-- e recursos já existentes (TÓPICO 4) pra estimar custo de mão de obra por
-- operação, substituindo o campo manual previsto no §2.5 da Fase 1 — que
-- na prática nunca chegou a ser construído (orcamento_itens não tinha
-- nenhuma coluna de mão de obra até esta migration).
--
-- Decisão operacional (§5 da ADR, resolvida em chat em 27/09/2026, depois
-- de bloquear o código desta fase): custo/hora vive em recursos_
-- produtivos (novo campo custo_hora), não em roteiro_operacoes — casa com
-- o texto da própria ADR ("custo/hora... por recurso produtivo") e com o
-- cadastro que já existe (TÓPICO 4 §31-32).
--
-- Mesma filosofia das Fases 1-3: nunca assume zero silenciosamente. Sem
-- roteiro ativo pro item, ou com operação sem tempo/recurso/custo_hora
-- definido, o cálculo soma o que consegue e avisa explicitamente o que
-- falta — o vendedor decide se aplica o resultado (calcular_mao_obra_
-- orcamento_item() é leitura pura) ou mantém a mão de obra manual/vazia.
-- Mão de obra fica separada de custo_unitario/preco_unitario — não entra
-- na margem calculada (preço-custo)/preço já estabelecida (TÓPICO 10
-- §12-14): o vendedor vê o número e decide o preço, nunca autoridade
-- cega (ADR-012 §3).

-- =========================================================================
-- 1. recursos_produtivos ganha custo_hora — fonte única de custo de mão
--    de obra por recurso, decisão do responsável do produto.
-- =========================================================================

alter table public.recursos_produtivos
  add column custo_hora numeric(10, 2) check (custo_hora is null or custo_hora >= 0);
comment on column public.recursos_produtivos.custo_hora is 'ADR-012 Fase 4 — custo por hora deste recurso (R$/h), usado por calcular_mao_obra_orcamento_item() pra estimar o custo de cada operação do roteiro (tempo_previsto_minutos/60 × custo_hora). Null = recurso sem custo definido; operação que o usa fica em "operacoes_sem_custo" no cálculo, nunca conta como zero.';

drop function if exists public.criar_recurso_produtivo(text, text, text, text, numeric);

create or replace function public.criar_recurso_produtivo(
  p_codigo text, p_nome text, p_tipo text, p_setor text default null, p_capacidade_horas_dia numeric default null,
  p_custo_hora numeric default null
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
  if p_custo_hora is not null and p_custo_hora < 0 then
    raise exception 'Custo/hora inválido.';
  end if;

  insert into public.recursos_produtivos (company_id, codigo, nome, tipo, setor, capacidade_horas_dia, custo_hora)
  values (v_company_id, btrim(p_codigo), btrim(p_nome), p_tipo, p_setor, p_capacidade_horas_dia, p_custo_hora)
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_criado', 'recurso_produtivo', v_id, p_nome, jsonb_build_object('tipo', p_tipo));

  return v_id;
end;
$$;

grant execute on function public.criar_recurso_produtivo(text, text, text, text, numeric, numeric) to authenticated;

drop function if exists public.editar_recurso_produtivo(uuid, text, text, numeric);

create or replace function public.editar_recurso_produtivo(
  p_id uuid, p_nome text, p_setor text default null, p_capacidade_horas_dia numeric default null,
  p_custo_hora numeric default null
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
  if p_custo_hora is not null and p_custo_hora < 0 then
    raise exception 'Custo/hora inválido.';
  end if;

  update public.recursos_produtivos
  set nome = btrim(p_nome), setor = p_setor, capacidade_horas_dia = p_capacidade_horas_dia, custo_hora = p_custo_hora
  where id = p_id and company_id = v_company_id;
  if not found then
    raise exception 'Recurso produtivo não encontrado nesta empresa.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, auth.uid(), 'producao.recurso_produtivo_editado', 'recurso_produtivo', p_id, p_nome, jsonb_build_object('custo_hora', p_custo_hora));
end;
$$;

grant execute on function public.editar_recurso_produtivo(uuid, text, text, numeric, numeric) to authenticated;

-- =========================================================================
-- 2. orcamento_itens/pedido_itens ganham custo_mao_obra — campo separado
--    de custo_unitario (material), preenchido à mão ou pelo resultado de
--    calcular_mao_obra_orcamento_item(), igual ao padrão já usado pra
--    custo_unitario desde a Fase 1/TÓPICO 10 §12-14.
-- =========================================================================

alter table public.orcamento_itens
  add column custo_mao_obra numeric(14, 2) check (custo_mao_obra is null or custo_mao_obra >= 0);
comment on column public.orcamento_itens.custo_mao_obra is 'ADR-012 Fase 4 — custo estimado de mão de obra (R$), separado de custo_unitario (material). Preenchido à mão ou a partir de calcular_mao_obra_orcamento_item() — nunca automático/silencioso. Null = não informado (mesmo comportamento de custo_unitario).';

alter table public.pedido_itens
  add column custo_mao_obra numeric(14, 2) check (custo_mao_obra is null or custo_mao_obra >= 0);
comment on column public.pedido_itens.custo_mao_obra is 'ADR-012 Fase 4 — cópia congelada de orcamento_itens.custo_mao_obra no momento da conversão, mesmo padrão de custo_unitario (Fase 3). Só informativo nesta fase — não entra no cálculo de divergência de preço (esse continua olhando só o custo de material via BOM).';

-- =========================================================================
-- 3. calcular_mao_obra_orcamento_item() — leitura pura, mesmo padrão de
--    calcular_custo_orcamento_item() (Fase 1): o vendedor decide se aplica
--    o resultado via upsert_orcamento_item(), nunca automático.
-- =========================================================================

create or replace function public.calcular_mao_obra_orcamento_item(p_orcamento_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_item_id uuid;
  v_roteiro_id uuid;
  v_operacao record;
  v_custo_operacao numeric;
  v_custo_total numeric := 0;
  v_operacoes jsonb := '[]'::jsonb;
  v_operacoes_sem_custo jsonb := '[]'::jsonb;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('orcamentos', 'view') then
    raise exception 'Sem permissão para consultar orçamentos (orcamentos.view).';
  end if;

  select oi.item_id into v_item_id from public.orcamento_itens oi
  join public.orcamentos o on o.id = oi.orcamento_id
  where oi.id = p_orcamento_item_id and o.company_id = v_company_id;
  if not found then
    raise exception 'Item de orçamento não encontrado nesta empresa.';
  end if;

  select id into v_roteiro_id from public.roteiros_produtivos
  where item_id = v_item_id and company_id = v_company_id and ativo;
  if not found then
    -- Sem roteiro ativo cadastrado pro item — motor não se aplica; a
    -- tela cai pro campo manual (mesmo padrão de "aplica_configurador").
    return jsonb_build_object('tem_roteiro', false);
  end if;

  for v_operacao in
    select ro.id, ro.sequencia, ro.descricao, ro.tempo_previsto_minutos, ro.recurso_produtivo_id,
      rp.nome as recurso_nome, rp.custo_hora
    from public.roteiro_operacoes ro
    left join public.recursos_produtivos rp on rp.id = ro.recurso_produtivo_id and rp.company_id = v_company_id
    where ro.roteiro_id = v_roteiro_id
    order by ro.sequencia
  loop
    if v_operacao.tempo_previsto_minutos is null or v_operacao.recurso_produtivo_id is null or v_operacao.custo_hora is null then
      v_operacoes_sem_custo := v_operacoes_sem_custo || jsonb_build_object(
        'operacao_id', v_operacao.id, 'sequencia', v_operacao.sequencia, 'descricao', v_operacao.descricao,
        'motivo', case
          when v_operacao.tempo_previsto_minutos is null then 'sem_tempo_previsto'
          when v_operacao.recurso_produtivo_id is null then 'sem_recurso_definido'
          else 'recurso_sem_custo_hora'
        end
      );
    else
      v_custo_operacao := round((v_operacao.tempo_previsto_minutos / 60.0) * v_operacao.custo_hora, 2);
      v_custo_total := v_custo_total + v_custo_operacao;
      v_operacoes := v_operacoes || jsonb_build_object(
        'operacao_id', v_operacao.id, 'sequencia', v_operacao.sequencia, 'descricao', v_operacao.descricao,
        'recurso_nome', v_operacao.recurso_nome, 'tempo_previsto_minutos', v_operacao.tempo_previsto_minutos,
        'custo_hora', v_operacao.custo_hora, 'custo_operacao', v_custo_operacao
      );
    end if;
  end loop;

  return jsonb_build_object(
    'tem_roteiro', true, 'custo_total', round(v_custo_total, 2),
    'operacoes', v_operacoes, 'operacoes_sem_custo', v_operacoes_sem_custo
  );
end;
$$;

grant execute on function public.calcular_mao_obra_orcamento_item(uuid) to authenticated;

-- =========================================================================
-- 4. upsert_orcamento_item() ganha p_custo_mao_obra (trailing, default
--    null) — mesmo padrão de "assinatura muda, precisa DROP explícito"
--    já usado quando ganhou p_custo_unitario (20261002000000).
-- =========================================================================

drop function if exists public.upsert_orcamento_item(uuid, uuid, uuid, numeric, numeric, numeric);

create or replace function public.upsert_orcamento_item(
  p_id uuid,
  p_orcamento_id uuid,
  p_item_id uuid,
  p_quantidade numeric,
  p_preco_unitario numeric,
  p_custo_unitario numeric default null,
  p_custo_mao_obra numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('orcamentos', 'manage');
  v_orcamento public.orcamentos;
  v_before public.orcamento_itens;
  v_id uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;
  if p_preco_unitario is null or p_preco_unitario < 0 then
    raise exception 'Preço unitário inválido.';
  end if;
  if p_custo_unitario is not null and p_custo_unitario < 0 then
    raise exception 'Custo unitário inválido.';
  end if;
  if p_custo_mao_obra is not null and p_custo_mao_obra < 0 then
    raise exception 'Custo de mão de obra inválido.';
  end if;

  select * into v_orcamento from public.orcamentos
  where id = p_orcamento_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta empresa.';
  end if;
  if v_orcamento.status <> 'rascunho' then
    raise exception 'Só é possível alterar itens de orçamento em rascunho (status atual: %).', v_orcamento.status;
  end if;
  if not exists (select 1 from public.itens where id = p_item_id and company_id = v_company_id and situacao = 'ativo') then
    raise exception 'Item não encontrado ou inativo nesta empresa.';
  end if;

  if p_id is not null then
    select * into v_before from public.orcamento_itens
    where id = p_id and orcamento_id = p_orcamento_id
    for update;
    if not found then
      raise exception 'Item do orçamento não encontrado.';
    end if;

    update public.orcamento_itens set
      item_id = p_item_id, quantidade = p_quantidade, preco_unitario = p_preco_unitario,
      custo_unitario = p_custo_unitario, custo_mao_obra = p_custo_mao_obra
    where id = p_id
    returning id into v_id;
  else
    insert into public.orcamento_itens (orcamento_id, item_id, quantidade, preco_unitario, custo_unitario, custo_mao_obra)
    values (p_orcamento_id, p_item_id, p_quantidade, p_preco_unitario, p_custo_unitario, p_custo_mao_obra)
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'comercial.orcamento_item_upserted', 'orcamento_item', v_id, v_orcamento.numero,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'orcamento_id', p_orcamento_id, 'item_id', p_item_id, 'quantidade', p_quantidade,
      'preco_unitario', p_preco_unitario, 'custo_unitario', p_custo_unitario, 'custo_mao_obra', p_custo_mao_obra
    ))
  );

  return v_id;
end;
$$;

grant execute on function public.upsert_orcamento_item(uuid, uuid, uuid, numeric, numeric, numeric, numeric) to authenticated;

-- =========================================================================
-- 5. converter_orcamento_em_pedido() — mesma função da Fase 3, só
--    acrescenta a cópia de custo_mao_obra na linha a linha já existente.
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
    insert into public.pedido_itens (company_id, pedido_id, item_id, quantidade, preco_unitario, custo_unitario, custo_mao_obra, orcamento_item_id)
    values (v_company_id, v_pedido_id, v_oi.item_id, v_oi.quantidade, v_oi.preco_unitario, v_oi.custo_unitario, v_oi.custo_mao_obra, v_oi.id)
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
