import { createClient } from "@/lib/supabase/server";
import BIDashboard from "./BIDashboard";

// TÓPICO 12 — BI, recorte mínimo do MVP (ADR-002 §4.16): só indicadores
// operacionais básicos, sem KPI versionado, drill-down, DRE ou assistente
// analítico (ver cabeçalho da migration 20260916060000). Página 100%
// leitura — sem Server Actions, sem Client Component (dashboard_
// operacional() já devolve tudo pronto num único jsonb).
export default async function BIPage() {
  const supabase = await createClient();

  const { data: canView } = await supabase.rpc("has_permission", { p_resource: "bi", p_action: "view" });

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar os indicadores desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const { data, error } = await supabase.rpc("dashboard_operacional");

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 12 — BI</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Indicadores</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do MVP: indicadores operacionais básicos de acompanhamento do fluxo.
        </p>

        {error && (
          <p style={{ fontSize: "13px", color: "#9b2c2c" }}>Não foi possível carregar os indicadores: {error.message}</p>
        )}
        {!error && data && <BIDashboard data={data} />}
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
