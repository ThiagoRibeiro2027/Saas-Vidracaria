import { createClient } from "@/lib/supabase/server";
import SuprimentosSection from "./SuprimentosSection";

// TÓPICO 7 — Suprimentos e Compras, recorte mínimo do MVP (ADR-002 §4.18,
// que prevalece sobre a menção mais ampla do PLANO DE ENTREGA §6 — ver
// cabeçalho da migration 20260916020000): só registro e acompanhamento de
// necessidade de compra. Sem fornecedor, cotação, pedido de compra ou
// recebimento — a efetivação da compra acontece fora do SaaS neste recorte.
export default async function SuprimentosPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "suprimentos", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "suprimentos", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Suprimentos desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: necessidades }, { data: itens }] = await Promise.all([
    supabase.from("necessidades_compra").select("*").order("created_at", { ascending: false }),
    supabase.from("itens").select("id, codigo, descricao, unidade_principal").eq("situacao", "ativo").order("codigo"),
  ]);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 7 — Suprimentos</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Suprimentos e Compras</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do MVP: registrar necessidade de material e acompanhar até atendida ou
          cancelada. Sem cotação, pedido de compra ou recebimento.
        </p>

        <SuprimentosSection rows={necessidades ?? []} itens={itens ?? []} canManage={!!canManage} />
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
