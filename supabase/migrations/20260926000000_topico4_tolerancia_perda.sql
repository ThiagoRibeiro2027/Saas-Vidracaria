-- TÓPICO 4 — Fase 7f da ampliação de escopo (ADR-002 §4.7): tolerância de
-- perdas configurável com alerta, fecha §30 ("consumo e perdas
-- comparando planejado × real, com tolerâncias configuráveis e alerta")
-- e o item "tolerâncias de perdas" do §51. Decisão do responsável do
-- produto em 2026-09-19 ("ok, conforme recomendado").
--
-- Reaproveita 100% do que já existe, sem inventar dado novo:
-- cutting_margin_settings/get_cutting_margin() (T15, TÓPICO 15 §31.4) já
-- É a margem de quebra técnica planejada, configurável por empresa
-- (material_tipo + processo → percentual) — só nunca foi comparada
-- contra a perda real de uma OP. Mesma chave de busca já usada por
-- lista_corte() (T4 §54): get_cutting_margin(itens.classificacao, '').
--
-- Fórmula adotada (decisão registrada aqui, não no ADR — é detalhe de
-- cálculo, não de escopo): perda tolerada = quantidade_planejada ×
-- percentual / 100. Denominador é o PLANEJADO, não o produzido — a
-- tolerância é definida no momento do planejamento, antes de saber
-- quanto será de fato produzido, mesmo espírito de "planejado × real"
-- do §30. percentual é armazenado como número percentual puro (3 =
-- 3%), mesma convenção de cutting_margin_settings.percentual.
--
-- OP sem margem configurada para o material/processo (get_cutting_margin
-- retorna null): "excedida" também fica null — nunca vira alerta falso
-- por falta de configuração, mesmo tratamento que lista_corte() já dá
-- pra margem não configurada (Arquitetura Mestre 6.3: perda real nunca
-- se confunde com margem de quebra planejada).
--
-- Alerta = sinal passivo no painel (mesmo padrão já decidido pra
-- gargalos na Fase 5c: "sem notificação ativa, decisão do responsável
-- do produto") — não integra com ADR-007/Notificações, que não existe
-- no schema ainda (mesmo motivo de "regras de notificação do PCP" ter
-- ficado fora do §51 nesta ampliação).

create or replace function public.verificar_tolerancia_perda(p_ordem_producao_id uuid)
returns table (
  quantidade_planejada numeric,
  quantidade_perdida numeric,
  percentual_tolerancia numeric,
  perda_tolerada numeric,
  excedida boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
  v_op public.ordens_producao;
  v_classificacao text;
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

  select i.classificacao into v_classificacao
  from public.pedido_itens pit
  join public.itens i on i.id = pit.item_id
  where pit.id = v_op.pedido_item_id;

  v_percentual := public.get_cutting_margin(v_classificacao, '');
  v_tolerada := case when v_percentual is null then null else v_op.quantidade_planejada * v_percentual / 100 end;

  return query select
    v_op.quantidade_planejada,
    v_op.quantidade_perdida,
    v_percentual,
    v_tolerada,
    case when v_tolerada is null then null else v_op.quantidade_perdida > v_tolerada end;
end;
$$;

grant execute on function public.verificar_tolerancia_perda(uuid) to authenticated;
