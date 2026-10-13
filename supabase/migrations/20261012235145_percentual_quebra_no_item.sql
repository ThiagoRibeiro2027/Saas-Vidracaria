-- Melhorias do responsável do produto (item 4, 12/10/2026): o percentual de
-- quebra era configurado em Configurações por (tipo de material + processo),
-- em `cutting_margin_settings`, e valia igual para todo item daquele grupo.
-- Decisão do responsável: cada ITEM tem o seu próprio percentual, guardado no
-- cadastro do item — substitui totalmente a configuração por grupo (não fica
-- como um override opcional).
--
-- Nome da coluna `percentual_quebra` (não `percentual_perda`): esse segundo
-- nome já existe em `peca_composicao.percentual_perda` (ADR-012, perda de
-- corte do motor de precificação do configurador) — conceito diferente, para
-- não confundir os dois no código.
--
-- Coluna OPCIONAL (nullable, sem default): NULL preserva o significado atual
-- de "sem quebra conhecida pra este item" — é o valor que verificar_
-- tolerancia_perda() já tratava como "não alertar" (TÓPICO 4 §30/§51, teste
-- "sem margem de quebra configurada... nunca alerta falso"). Um 0 NOT NULL
-- teria o efeito oposto: qualquer perda, por menor que fosse, viraria alerta.
--
-- Backfill: para não apagar silenciosamente o percentual que já valia pra
-- cada item, herda o percentual "geral" (processo = '') já configurado pela
-- classificação do item em `cutting_margin_settings`, quando existir. Item
-- sem config correspondente fica NULL (igual ao comportamento atual).
--
-- `cutting_margin_settings`, `get_cutting_margin()`, `upsert_cutting_margin()`
-- e a tela de "Margem de quebra" em Configurações Gerais NÃO foram removidos
-- nesta migration — ficam como estão, mas deixam de alimentar o cálculo a
-- partir de agora (só os três pontos abaixo liam essa função). Ação de
-- limpeza dessa tela antiga fica para um passo seguinte, combinado com o
-- responsável do produto.

alter table public.itens
  add column percentual_quebra numeric(6, 3)
    check (percentual_quebra is null or percentual_quebra >= 0);
comment on column public.itens.percentual_quebra is
  'Melhorias 12/10/2026, item 4 — percentual de quebra próprio do item, substitui a configuração por tipo de material + processo (cutting_margin_settings, que fica só histórica).';

update public.itens i set percentual_quebra = cm.percentual
from public.cutting_margin_settings cm
where cm.company_id = i.company_id
  and cm.material_tipo = i.classificacao
  and cm.processo = ''
  and cm.ativo;

-- upsert_item() ganha o parâmetro no fim (default 0) — não quebra nenhum
-- chamador existente que não o informe. CREATE OR REPLACE com uma
-- assinatura de aridade diferente cria uma SOBRECARGA nova em vez de
-- substituir a antiga (Postgres só troca função quando nome+tipos+contagem
-- de parâmetros batem exatamente) — sem este DROP explícito, ficam duas
-- versões de upsert_item (7 e 8 argumentos) e a chamada nomeada por
-- PostgREST fica ambígua entre as duas, falhando silenciosamente.
drop function if exists public.upsert_item(uuid, text, text, text, text, text, text);

create or replace function public.upsert_item(
  p_id uuid, p_codigo text, p_descricao text, p_tipo text, p_classificacao text,
  p_unidade_principal text, p_situacao text default 'ativo',
  p_percentual_quebra numeric default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_before public.itens;
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('itens', 'manage') then
    raise exception 'Sem permissão para gerenciar itens (itens.manage).';
  end if;
  perform public.assert_company_not_suspended();
  if p_codigo is null or btrim(p_codigo) = '' or p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Código e descrição são obrigatórios.';
  end if;
  if p_unidade_principal is null or btrim(p_unidade_principal) = '' then
    raise exception 'Unidade principal é obrigatória.';
  end if;
  if p_tipo not in (
    'materia_prima', 'insumo', 'componente', 'produto_intermediario',
    'produto_acabado', 'material_auxiliar', 'embalagem', 'servico', 'outro'
  ) then
    raise exception 'Tipo inválido: "%".', p_tipo;
  end if;
  if p_situacao not in ('ativo', 'inativo') then
    raise exception 'Situação inválida: "%".', p_situacao;
  end if;
  if p_percentual_quebra is not null and p_percentual_quebra < 0 then
    raise exception 'Percentual de quebra não pode ser negativo.';
  end if;

  if p_id is not null then
    select * into v_before from public.itens
    where id = p_id and company_id = v_company_id
    for update;
    if not found then
      raise exception 'Item não encontrado nesta empresa.';
    end if;

    update public.itens set
      codigo = p_codigo, descricao = p_descricao, tipo = p_tipo,
      classificacao = p_classificacao, unidade_principal = p_unidade_principal,
      situacao = p_situacao, percentual_quebra = p_percentual_quebra
    where id = p_id
    returning id into v_id;
  else
    insert into public.itens (
      company_id, codigo, descricao, tipo, classificacao, unidade_principal,
      situacao, percentual_quebra
    )
    values (
      v_company_id, p_codigo, p_descricao, p_tipo, p_classificacao, p_unidade_principal,
      p_situacao, p_percentual_quebra
    )
    returning id into v_id;
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_company_id, auth.uid(), 'cadastro.item_upserted', 'item', v_id, p_codigo,
    jsonb_build_object('before', to_jsonb(v_before), 'after', jsonb_build_object(
      'codigo', p_codigo, 'tipo', p_tipo, 'classificacao', p_classificacao,
      'situacao', p_situacao, 'percentual_quebra', p_percentual_quebra
    ))
  );

  return v_id;
end;
$$;

-- Achado 4 da auditoria de segurança (12/10/2026): função NOVA (mesmo via
-- CREATE OR REPLACE com assinatura diferente, que no Postgres gera um objeto
-- novo, não substitui o antigo) nasce sem EXECUTE pra authenticated — regra 7
-- do CLAUDE.md, grant explícito por função, nunca herdado por acidente. A
-- versão de 7 argumentos tinha o grant; a de 8 (acima) precisa do seu próprio.
grant execute on function public.upsert_item(
  uuid, text, text, text, text, text, text, numeric
) to authenticated;

-- Os três pontos que liam get_cutting_margin(classificação, '') passam a ler
-- o percentual do próprio item (corpo idêntico, só a origem do percentual).
create or replace function public.lista_corte(p_ordem_producao_id uuid)
returns table (
  ordem_producao_id uuid, numero text, pedido_numero text, pessoa_nome text,
  obra_nome text, ambiente text, item_codigo text, item_descricao text,
  largura_mm numeric, altura_mm numeric, quantidade numeric,
  margem_quebra_percentual numeric, responsavel text, emitido_em timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_op public.ordens_producao;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
  end if;

  select * into v_op from public.ordens_producao where id = p_ordem_producao_id and company_id = v_company_id;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;

  return query
  select
    v_op.id,
    v_op.numero,
    p.numero,
    pe.nome,
    o.nome,
    ip.ambiente,
    i.codigo,
    i.descricao,
    ip.largura_mm,
    ip.altura_mm,
    v_op.quantidade_planejada,
    i.percentual_quebra,
    prof.display_name,
    now()
  from public.pedido_itens pit
  join public.pedidos p on p.id = pit.pedido_id
  join public.pessoas pe on pe.id = p.pessoa_id
  left join public.obras o on o.id = p.obra_id
  join public.itens i on i.id = pit.item_id
  left join public.itens_producao ip on ip.pedido_item_id = pit.id
  left join public.profiles prof on prof.id = auth.uid()
  where pit.id = v_op.pedido_item_id;
end;
$$;

create or replace function public.lista_corte_lote_fabril(p_lote_fabril_id uuid)
returns table (
  lote_fabril_item_id uuid, ordem_producao_id uuid, ordem_producao_numero text,
  op_lote_numero integer, pedido_numero text, pessoa_nome text, obra_nome text,
  ambiente text, item_codigo text, item_descricao text, largura_mm numeric,
  altura_mm numeric, quantidade numeric, margem_quebra_percentual numeric,
  responsavel text, emitido_em timestamptz
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
  if not exists (select 1 from public.lotes_fabris where id = p_lote_fabril_id and company_id = v_company_id) then
    raise exception 'Lote fabril não encontrado nesta empresa.';
  end if;

  return query
  select
    lfi.id,
    ord.id,
    ord.numero,
    ol.numero,
    p.numero,
    pe.nome,
    o.nome,
    ip.ambiente,
    i.codigo,
    i.descricao,
    ip.largura_mm,
    ip.altura_mm,
    lfi.quantidade,
    i.percentual_quebra,
    prof.display_name,
    now()
  from public.lote_fabril_itens lfi
  join public.op_lotes ol on ol.id = lfi.op_lote_id
  join public.ordens_producao ord on ord.id = ol.ordem_producao_id
  join public.pedido_itens pit on pit.id = ord.pedido_item_id
  join public.pedidos p on p.id = pit.pedido_id
  join public.pessoas pe on pe.id = p.pessoa_id
  left join public.obras o on o.id = p.obra_id
  join public.itens i on i.id = pit.item_id
  left join public.itens_producao ip on ip.pedido_item_id = pit.id
  left join public.profiles prof on prof.id = auth.uid()
  where lfi.lote_fabril_id = p_lote_fabril_id;
end;
$$;

create or replace function public.verificar_tolerancia_perda(p_ordem_producao_id uuid)
returns table (
  quantidade_planejada numeric, quantidade_perdida numeric,
  percentual_tolerancia numeric, perda_tolerada numeric, excedida boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_op public.ordens_producao;
  v_percentual numeric;
  v_tolerada numeric;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if not public.has_permission('producao', 'view') then
    raise exception 'Sem permissão para consultar produção (producao.view).';
  end if;

  select * into v_op from public.ordens_producao where id = p_ordem_producao_id and company_id = v_company_id;
  if not found then
    raise exception 'Ordem de produção não encontrada nesta empresa.';
  end if;

  select i.percentual_quebra into v_percentual
  from public.pedido_itens pit
  join public.itens i on i.id = pit.item_id
  where pit.id = v_op.pedido_item_id;

  v_tolerada := case when v_percentual is null then null else v_op.quantidade_planejada * v_percentual / 100 end;

  return query select
    v_op.quantidade_planejada,
    v_op.quantidade_perdida,
    v_percentual,
    v_tolerada,
    case when v_tolerada is null then null else v_op.quantidade_perdida > v_tolerada end;
end;
$$;
