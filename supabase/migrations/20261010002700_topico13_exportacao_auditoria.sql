-- TÓPICO 13 — Integrações, Fase 6, correção pós-implementação
-- (26/09/2026): exportar_dados_csv() (20261010002600) não registrava
-- auditoria. A tentativa original era a Server Action
-- (src/app/integracoes/actions.ts) chamar log_client_event() depois do
-- RPC — corrigido antes de chegar a produção porque log_client_event()
-- só aceita uma lista fechada de eventos (auth.mfa_enrolled/verified,
-- auth.login_success/logout, governance.data_exported, test.%), e
-- "integracoes.dados_exportados" não está nela por design (item 8 das
-- regras de segurança do CLAUDE.md — evento de auditoria de negócio não
-- é reportado livremente pelo cliente). O padrão correto, já usado em
-- toda função de negócio deste schema, é a própria função SECURITY
-- DEFINER chamar log_activity() internamente — é o que esta migration
-- adiciona, sem mudar nenhuma regra de autorização ou consulta já
-- existente.
--
-- create or replace function não muda a assinatura (mesmos 3
-- parâmetros) — sem necessidade de drop.
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

  v_resultado := coalesce(v_resultado, '[]'::jsonb);

  perform public.log_activity(
    'integracoes.dados_exportados', p_entidade, null,
    format('Exportação de %s linha(s) de %s', jsonb_array_length(v_resultado), p_entidade),
    jsonb_build_object('entidade', p_entidade, 'data_inicio', p_data_inicio, 'data_fim', p_data_fim, 'linhas', jsonb_array_length(v_resultado))
  );

  return v_resultado;
end;
$$;

grant execute on function public.exportar_dados_csv(text, date, date) to authenticated;
