import { createClient } from "@/lib/supabase/server";
import FiscalSection from "./FiscalSection";

// ADR-004 — Estratégia Fiscal, recorte mínimo do MVP (§9.2): estrutura de
// registro/rastreabilidade de documento fiscal, sem emissão, cancelamento
// fiscal real, inutilização ou transmissão (§9.3 — fora do piloto da JR
// Box, §9.1: o faturamento permanece no sistema atual da empresa).
export default async function FiscalPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "fiscal", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "fiscal", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Fiscal desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const { data: documentos } = await supabase.from("documentos_fiscais").select("*").order("created_at", { ascending: false });

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>ADR-004 — Fiscal</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Fiscal</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do MVP: registro e rastreabilidade de documentos fiscais. Sem emissão
          real neste piloto.
        </p>

        <FiscalSection rows={documentos ?? []} canManage={!!canManage} />
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
