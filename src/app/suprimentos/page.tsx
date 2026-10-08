import { createClient } from "@/lib/supabase/server";
import SuprimentosSection from "./SuprimentosSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

// TÓPICO 7 — Suprimentos e Compras, recorte mínimo do MVP (ADR-002 §4.18,
// que prevalece sobre a menção mais ampla do PLANO DE ENTREGA §6 — ver
// cabeçalho da migration 20260916020000): só registro e acompanhamento de
// necessidade de compra. Sem fornecedor, cotação, pedido de compra ou
// recebimento — a efetivação da compra acontece fora do SaaS neste recorte.
//
// 2026-10-04: tela larga + paginação server-side (lista que cresce a cada
// necessidade identificada). As ações por linha já ficavam atrás de um
// clique (AcoesNecessidade/RegistrarRecebimentoForm) — nada a mudar aí.
export default async function SuprimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; por_pagina?: string }>;
}) {
  const { pagina: paginaParam, por_pagina: porPaginaParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "suprimentos", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "suprimentos", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Suprimentos desta empresa." />
      </div>
    );
  }

  const { pagina: paginaPedida, porPagina } = lerParametrosPaginacao({
    pagina: paginaParam,
    por_pagina: porPaginaParam,
  });
  const { count: totalNecessidades } = await supabase.from("necessidades_compra").select("id", { count: "exact", head: true });
  const { paginacao, from, to } = calcularPaginacao(paginaPedida, porPagina, totalNecessidades ?? 0);

  const [{ data: necessidades }, { data: itens }, { data: pedidos }, { data: ordensProducao }] = await Promise.all([
    supabase.from("necessidades_compra").select("*").order("created_at", { ascending: false }).range(from, to),
    supabase.from("itens").select("id, codigo, descricao, unidade_principal").eq("situacao", "ativo").order("codigo"),
    supabase.from("pedidos").select("id, numero").eq("status", "liberado").order("numero"),
    supabase.from("ordens_producao").select("id, numero, pedido_id").order("numero"),
  ]);

  return (
    <>
      <PageHeader breadcrumb={["Suprimentos"]} title="Suprimentos e Compras" />
      <div className="mx-auto max-w-7xl p-6">
      <p className="text-sm text-text">
        Recorte mínimo do MVP: registrar necessidade de material e acompanhar até atendida ou
        cancelada. Sem cotação, pedido de compra ou recebimento. Necessidades também podem ser
        geradas automaticamente a partir de um pedido ou ordem de produção com peças cadastradas
        (Fase C, plano de 23/09/2026) — item sem peça associada fica de fora, siga lançando manual.
      </p>

      <div className="mt-6">
        <SuprimentosSection
          rows={necessidades ?? []}
          paginacao={paginacao}
          itens={itens ?? []}
          pedidos={pedidos ?? []}
          ordensProducao={ordensProducao ?? []}
          canManage={!!canManage}
        />
      </div>
      </div>
    </>
  );
}
