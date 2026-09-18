-- TÓPICO 4 — Fase 5c da ampliação de escopo (ADR-002 v2.3, plano
-- aprovado pelo responsável do produto em 2026-09-17): gargalos (§37),
-- última de 3 sub-fases (5a recursos e capacidade → 5b manutenção →
-- 5c). Fecha o §31-37 completo.
--
-- A identificação de gargalo em si já existe desde a Fase 5a:
-- listar_capacidade_recursos() já classifica 'sobrecarga' exatamente
-- pelo critério do §37 ("Usinagem: 50h disponíveis / 75h necessárias →
-- gargalo"). listar_gargalos() é só um recorte com nome de primeira
-- classe sobre essa mesma conta — não duplica lógica de cálculo.
--
-- Decisão de escopo (aprovada pelo responsável do produto): "o gargalo
-- deverá influenciar sequenciamento, priorização, simulações,
-- replanejamento" (§37) continua fora — esses conceitos não existem
-- (§6-10). "Alertas" fica como sinal passivo no painel de Produção (o
-- PCP abre a tela pra ver), sem integrar com o módulo de Notificações
-- (§4.12) — quem quiser saber quais operações estão em risco por causa
-- de um gargalo reaproveita analisar_impacto_manutencao() (Fase 5b),
-- resolvido no server component da tela, sem função SQL nova pra isso.

create or replace function public.listar_gargalos(p_dias int default 7)
returns table (
  recurso_produtivo_id uuid,
  codigo text,
  nome text,
  tipo text,
  capacidade_disponivel_horas numeric,
  capacidade_necessaria_horas numeric,
  saldo_horas numeric
)
language plpgsql security definer set search_path = public as $$
begin
  -- listar_capacidade_recursos() já valida empresa/permissão e escopa
  -- por company_id — sem repetir isso aqui.
  return query
  select lcr.recurso_produtivo_id, lcr.codigo, lcr.nome, lcr.tipo,
    lcr.capacidade_disponivel_horas, lcr.capacidade_necessaria_horas, lcr.saldo_horas
  from public.listar_capacidade_recursos(p_dias) lcr
  where lcr.classificacao = 'sobrecarga';
end;
$$;

grant execute on function public.listar_gargalos(int) to authenticated;
