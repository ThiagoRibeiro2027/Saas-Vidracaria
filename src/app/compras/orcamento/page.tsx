import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import OrcamentoComprasSection from "./OrcamentoComprasSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";

// TÓPICO 7 — Compras, Fase 6 da ADR-011: orçado×comprometido×realizado
// (§33). "categoria" reaproveita itens.classificacao (T2). "Realizado"
// nasce do Financeiro real (titulos_pagar), não de um ledger paralelo.
export default async function OrcamentoComprasPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "compras", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "compras", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o orçamento de compras desta empresa." />
      </div>
    );
  }

  const { data: orcamentos } = await supabase.from("orcamentos_compra").select("*").order("categoria");

  const linhas = await Promise.all(
    (orcamentos ?? []).map(async (o) => {
      const { data } = await supabase.rpc("calcular_orcado_comprometido_realizado", {
        p_categoria: o.categoria,
        p_periodo_inicio: o.periodo_inicio,
        p_periodo_fim: o.periodo_fim,
      });
      const linha = data?.[0] as { orcado: number; comprometido: number; realizado: number } | undefined;
      return { ...o, comprometido: linha?.comprometido ?? 0, realizado: linha?.realizado ?? 0 };
    }),
  );

  return (
    <>
      <PageHeader breadcrumb={["Compras"]} title="Orçado × Realizado" />
      <div className="mx-auto max-w-7xl p-6">
        <p className="text-sm text-text">
          Categoria reaproveita a classificação do item (T2). Comprometido soma pedidos de compra
          emitidos/confirmados no período; realizado soma pagamentos de títulos a pagar (Financeiro
          real) — nada é calculado num ledger paralelo. <Link href="/compras/pedidos">← Voltar para Pedidos</Link>
        </p>

        <div className="mt-6">
          <OrcamentoComprasSection linhas={linhas} canManage={!!canManage} />
        </div>
      </div>
    </>
  );
}
