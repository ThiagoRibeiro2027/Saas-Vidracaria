-- TÓPICO 13 — Integrações, Fase 6: exportação genérica em CSV (ADR-002
-- §4.17, decisão do responsável do produto em 26/09/2026). O próprio §37
-- do Prompt TÓPICO 13 ("Escopo do MVP") lista "importação/exportação"
-- como prioridade de infraestrutura do MVP — diferente de cartões,
-- certificados digitais ou APIs de terceiros, que não aparecem nessa
-- lista. Importação (§29) já tinha uma base real desde
-- 20260929000000 (CSV, Pessoas/Itens, com prévia/dry-run). Exportação
-- (§30) só existia como exportação LGPD de portabilidade (a própria
-- conta) — nada de exportação de listagem de negócio.
--
-- Recorte: só CSV (mesma decisão já usada na importação — "arquitetura
-- preparada para outros formatos" fica satisfeita porque o parsing/
-- geração fica isolado numa função por entidade; trocar o formato de
-- saída não muda a leitura). Sem PDF, sem exportação agendada (seria
-- sobreposição com "relatórios agendados" do BI, que já ficou fora na
-- Fase 3 do T12). Cinco entidades, as com maior valor de uso no piloto:
-- pedidos, itens, pessoas, estoque, financeiro (só contas a receber
-- nesta fase — contas a pagar fica para quando houver demanda real).
--
-- Segurança: p_entidade é validado contra uma lista fixa (nunca um
-- identificador livre que o cliente controla sem checagem) e cada ramo
-- checa a MESMA permissão que a tela daquele módulo já exige
-- (pedidos.view, itens.view, pessoas.view, estoque.view,
-- financeiro.view) — nunca uma permissão nova e genérica de
-- "exportação" que contornaria o controle de acesso por módulo já
-- existente. Isso segue a mesma lógica do item 8 das regras de
-- segurança do CLAUDE.md (função genérica não é API livre pra o cliente
-- controlar "ação" sem restrição): aqui "ação" é sempre "exportar", só
-- a entidade varia, e a entidade é sempre checada contra a permissão
-- real daquele módulo.
create or replace function public.exportar_dados_csv(
  p_entidade text,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_resultado jsonb;
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if p_entidade not in ('pedidos', 'itens', 'pessoas', 'estoque', 'financeiro') then
    raise exception 'Entidade de exportação inválida: %', p_entidade;
  end if;
  if p_data_inicio is not null and p_data_fim is not null and p_data_fim < p_data_inicio then
    raise exception 'Data de fim não pode ser anterior à data de início.';
  end if;

  if p_entidade = 'pedidos' then
    if not public.has_permission('pedidos', 'view') then
      raise exception 'Sem permissão para exportar pedidos (pedidos.view).';
    end if;
    select jsonb_agg(to_jsonb(t)) into v_resultado from (
      select p.numero, p.data_pedido, p.status, p.previsao_entrega, pe.nome as cliente,
             coalesce((select sum(pi.quantidade * pi.preco_unitario) from public.pedido_itens pi where pi.pedido_id = p.id), 0) as valor_total
      from public.pedidos p
      join public.pessoas pe on pe.id = p.pessoa_id
      where p.company_id = v_company_id
        and (p_data_inicio is null or p.data_pedido >= p_data_inicio)
        and (p_data_fim is null or p.data_pedido <= p_data_fim)
      order by p.data_pedido desc, p.numero desc
    ) t;

  elsif p_entidade = 'itens' then
    if not public.has_permission('itens', 'view') then
      raise exception 'Sem permissão para exportar itens (itens.view).';
    end if;
    select jsonb_agg(to_jsonb(t)) into v_resultado from (
      select codigo, descricao, tipo, classificacao, unidade_principal, situacao
      from public.itens
      where company_id = v_company_id
        and (p_data_inicio is null or created_at::date >= p_data_inicio)
        and (p_data_fim is null or created_at::date <= p_data_fim)
      order by codigo
    ) t;

  elsif p_entidade = 'pessoas' then
    if not public.has_permission('pessoas', 'view') then
      raise exception 'Sem permissão para exportar pessoas (pessoas.view).';
    end if;
    select jsonb_agg(to_jsonb(t)) into v_resultado from (
      select tipo_documento, documento, nome, nome_fantasia, telefone, email, cidade, uf, situacao
      from public.pessoas
      where company_id = v_company_id
        and (p_data_inicio is null or created_at::date >= p_data_inicio)
        and (p_data_fim is null or created_at::date <= p_data_fim)
      order by nome
    ) t;

  elsif p_entidade = 'estoque' then
    if not public.has_permission('estoque', 'view') then
      raise exception 'Sem permissão para exportar estoque (estoque.view).';
    end if;
    -- Estoque é posição atual ("quanto tem agora"), não fluxo num
    -- intervalo — sem filtro de período, mesmo raciocínio já usado no
    -- dashboard_operacional (Fase 2/3 do T12) para "itens_com_pendencia"
    -- e "titulos_vencidos".
    select jsonb_agg(to_jsonb(t)) into v_resultado from (
      select i.codigo, i.descricao, es.quantidade_fisica, es.quantidade_reservada,
             (es.quantidade_fisica - es.quantidade_reservada) as quantidade_disponivel
      from public.estoque_saldos es
      join public.itens i on i.id = es.item_id
      where es.company_id = v_company_id
      order by i.codigo
    ) t;

  elsif p_entidade = 'financeiro' then
    if not public.has_permission('financeiro', 'view') then
      raise exception 'Sem permissão para exportar financeiro (financeiro.view).';
    end if;
    -- Só contas a receber nesta fase — contas a pagar fica para quando
    -- houver demanda real, mesmo critério de corte já usado em outras
    -- fases deste projeto.
    select jsonb_agg(to_jsonb(t)) into v_resultado from (
      select tf.numero, pe.nome as cliente, tf.valor, tf.valor_recebido, tf.vencimento, tf.status
      from public.titulos_financeiros tf
      join public.pedidos p on p.id = tf.pedido_id
      join public.pessoas pe on pe.id = p.pessoa_id
      where tf.company_id = v_company_id
        and (p_data_inicio is null or tf.created_at::date >= p_data_inicio)
        and (p_data_fim is null or tf.created_at::date <= p_data_fim)
      order by tf.vencimento desc
    ) t;
  end if;

  return coalesce(v_resultado, '[]'::jsonb);
end;
$$;

grant execute on function public.exportar_dados_csv(text, date, date) to authenticated;
