import { createClient } from "@/lib/supabase/server";
import BIDashboard from "./BIDashboard";
import { inputStyle, buttonStyle } from "../configuracoes/styles";

// TÓPICO 12 — BI, Fase 2 ainda básica (ADR-002 v2.6 §4.16): indicadores
// operacionais básicos + filtro de período + quatro indicadores
// calculados (ticket médio, conversão orçamento→pedido, taxa de não
// conformidade, OTIF básico). Sem KPI versionado, drill-down, DRE ou
// assistente analítico (ver cabeçalho da migration 20261008000000).
// Filtro via querystring (GET) — página continua 100% leitura, sem
// Server Action nem Client Component pro filtro em si.
export default async function BIPage({
  searchParams,
}: {
  searchParams: Promise<{ data_inicio?: string | string[]; data_fim?: string | string[] }>;
}) {
  const params = await searchParams;
  // Next.js entrega string[] quando a chave se repete na querystring
  // (ex.: ?data_inicio=a&data_inicio=b) — usa o primeiro valor.
  const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const dataInicio = primeiro(params.data_inicio)?.trim() || null;
  const dataFim = primeiro(params.data_fim)?.trim() || null;

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

  const { data, error } = await supabase.rpc("dashboard_operacional", {
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
  });

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 12 — BI</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Indicadores</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Indicadores operacionais básicos, com filtro de período. Sem KPI versionado, drill-down,
          análise preditiva, dashboards por área, metas, alertas ou assistente analítico.
        </p>

        <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}>
          <label style={{ fontSize: "12px", color: "#3e4d49" }}>
            De{" "}
            <input name="data_inicio" type="date" defaultValue={dataInicio ?? ""} style={inputStyle} />
          </label>
          <label style={{ fontSize: "12px", color: "#3e4d49" }}>
            Até{" "}
            <input name="data_fim" type="date" defaultValue={dataFim ?? ""} style={inputStyle} />
          </label>
          <button type="submit" style={buttonStyle}>
            Filtrar
          </button>
          {(dataInicio || dataFim) && (
            <a href="/bi" style={{ fontSize: "12px", color: "#3e4d49" }}>
              Limpar período
            </a>
          )}
        </form>

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
