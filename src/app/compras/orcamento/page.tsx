import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import OrcamentoComprasSection from "./OrcamentoComprasSection";

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
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o orçamento de compras desta empresa.
          </p>
        </div>
      </main>
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
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 7 — Compras (Fase 6 da ADR-011)</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Orçado × comprometido × realizado</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Categoria reaproveita a classificação do item (T2). Comprometido soma pedidos de compra
          emitidos/confirmados no período; realizado soma pagamentos de títulos a pagar (Financeiro
          real) — nada é calculado num ledger paralelo. <Link href="/compras/pedidos">← Voltar para Pedidos</Link>
        </p>

        <OrcamentoComprasSection linhas={linhas} canManage={!!canManage} />
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
  background: "#f5f7f5",
  padding: "48px 16px",
} as const;

const cardStyle = {
  background: "#fff",
  padding: "32px",
  borderRadius: "8px",
  width: "960px",
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px -12px rgba(0,0,0,.18)",
} as const;

const eyebrowStyle = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "#1f5d57",
  margin: 0,
} as const;
