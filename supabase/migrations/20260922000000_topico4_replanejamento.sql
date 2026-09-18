-- TÓPICO 4 — Fase 6e da ampliação de escopo (ADR-002 v2.3, plano
-- aprovado pelo responsável do produto em 2026-09-22): replanejamento
-- orientado por eventos (§10), última sub-fase do bloco §5-10 (6a
-- planejamento → 6b sequenciamento → 6c decisão/simulação → 6d
-- horizonte/congelamento → 6e replanejamento). Fecha o bloco completo.
--
-- "Recalcular os impactos" e "apresentar alternativas" (§10) já existem
-- e são sempre ao vivo, nunca cacheados: calcular_ranking_
-- sequenciamento() (Fase 6b) e calcular_capacidade_recurso()/
-- listar_gargalos() (Fase 5) recalculam do estado atual a cada chamada —
-- qualquer mudança de prioridade, recurso, capacidade ou cancelamento já
-- se reflete neles automaticamente. simular_alteracao_programacao()
-- (Fase 6c) já é "apresentar alternativas" sem alterar nada. O que falta
-- é só "identificar os eventos" — hoje o PCP só percebe que algo mudou
-- se abrir a tela e comparar de memória.
--
-- Decisão de escopo: listar_eventos_replanejamento() é só um filtro
-- sobre activity_logs (histórico único do sistema) pra um conjunto
-- curado de ações que correspondem aos exemplos do §10 com dado real —
-- mesma disciplina de recorte de toda a Fase 6:
--   cancelamento -> producao.ordem_cancelada
--   alteração de engenharia -> engenharia.versao_liberada
--   quebra de máquina -> producao.manutencao_corretiva_iniciada
--   manutenção -> producao.manutencao_preventiva_programada
--   alteração de capacidade -> producao.recurso_produtivo_editado /
--     producao.recurso_produtivo_situacao_alterada
--   alteração de prioridade / novo pedido prioritário ->
--     producao.prioridade_definida
--   perda / retrabalho -> producao.apontamento_registrado com
--     quantidade_rejeitada/quantidade_retrabalho > 0
-- Fora de escopo, com razão específica: falta/chegada de material e
-- atraso de vidro (§20-22 não implementado); ausência de operador (sem
-- controle de presença no projeto); alteração de prazo — pedidos.
-- previsao_entrega nunca ganhou função de edição em nenhuma fase (grep
-- amplo confirma: só é setado na conversão do orçamento) — não há
-- evento real pra capturar porque a própria ação de editar não existe.
--
-- Nenhuma lógica de cálculo nova, nenhuma tabela nova, nenhuma mutação.

create or replace function public.listar_eventos_replanejamento(p_dias int default 7)
returns table (
  id uuid,
  action text,
  categoria text,
  entity_type text,
  entity_id uuid,
  description text,
  metadata jsonb,
  criado_por_nome text,
  criado_em timestamptz
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
  if p_dias is null or p_dias <= 0 then
    raise exception 'Dias deve ser maior que zero.';
  end if;

  return query
  select
    al.id, al.action,
    case al.action
      when 'producao.ordem_cancelada' then 'cancelamento'
      when 'engenharia.versao_liberada' then 'alteracao_engenharia'
      when 'producao.manutencao_corretiva_iniciada' then 'quebra_maquina'
      when 'producao.manutencao_preventiva_programada' then 'manutencao'
      when 'producao.recurso_produtivo_editado' then 'alteracao_capacidade'
      when 'producao.recurso_produtivo_situacao_alterada' then 'alteracao_capacidade'
      when 'producao.prioridade_definida' then 'alteracao_prioridade'
      when 'producao.apontamento_registrado' then 'perda_retrabalho'
    end as categoria,
    al.entity_type, al.entity_id, al.description, al.metadata,
    prof.display_name, al.created_at
  from public.activity_logs al
  left join public.profiles prof on prof.id = al.user_id
  where al.company_id = v_company_id
    and al.created_at >= now() - (p_dias || ' days')::interval
    and (
      al.action in (
        'producao.ordem_cancelada', 'engenharia.versao_liberada', 'producao.manutencao_corretiva_iniciada',
        'producao.manutencao_preventiva_programada', 'producao.recurso_produtivo_editado',
        'producao.recurso_produtivo_situacao_alterada', 'producao.prioridade_definida'
      )
      or (
        al.action = 'producao.apontamento_registrado'
        and (
          coalesce((al.metadata->>'quantidade_rejeitada')::numeric, 0) > 0
          or coalesce((al.metadata->>'quantidade_retrabalho')::numeric, 0) > 0
        )
      )
    )
  order by al.created_at desc;
end;
$$;

grant execute on function public.listar_eventos_replanejamento(int) to authenticated;
