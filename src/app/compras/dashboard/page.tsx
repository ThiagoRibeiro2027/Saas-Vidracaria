import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import ComprasDashboard from "./ComprasDashboard";
import { inputStyle, buttonStyle } from "../../configuracoes/styles";

// TÓPICO 7 — Compras, Fase 9 da ADR-011 (docs/ADR-011 — Compras v1.0.md):
// dashboard (§38), mesmo padrão de /bi (dashboard_operacional()) — filtro
// de período via querystring, página 100% leitura, sem Server Action.
// Gate compras.view (não bi.view): é o dashboard do módulo Compras, mesma
// convenção já usada em mapa_compras_futuras()/rastrear_necessidade().
export default async function ComprasDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ data_inicio?: string | string[]; data_fim?: string | string[] }>;
}) {
  const params = await searchParams;
  const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const dataInicio = primeiro(params.data_inicio)?.trim() || null;
  const dataFim = primeiro(params.data_fim)?.trim() || null;

  const supabase = await createClient();

  const { data: canView } = await supabase.rpc("has_permission", { p_resource: "compras", p_action: "view" });

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o dashboard de compras desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const { data, error } = await supabase.rpc("dashboard_compras", {
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
  });

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 7 — Compras (Fase 9 da ADR-011)</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Dashboard de Compras</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Indicadores consolidados de necessidades, solicitações, cotações, aprovações, pedidos,
          recebimentos, financeiro, fornecedores e lead time. Necessidades futuras/risco de ruptura
          detalhado ficam em <Link href="/compras/mapa">/compras/mapa</Link>.{" "}
          <Link href="/compras/configuracoes">Configurações do módulo →</Link>
        </p>

        <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}>
          <label style={{ fontSize: "12px", color: "#3e4d49" }}>
            De <input name="data_inicio" type="date" defaultValue={dataInicio ?? ""} style={inputStyle} />
          </label>
          <label style={{ fontSize: "12px", color: "#3e4d49" }}>
            Até <input name="data_fim" type="date" defaultValue={dataFim ?? ""} style={inputStyle} />
          </label>
          <button type="submit" style={buttonStyle}>Filtrar</button>
          {(dataInicio || dataFim) && (
            <a href="/compras/dashboard" style={{ fontSize: "12px", color: "#3e4d49" }}>Limpar período</a>
          )}
        </form>

        {error && <p style={{ fontSize: "13px", color: "#9b2c2c" }}>Não foi possível carregar o dashboard: {error.message}</p>}
        {!error && data && <ComprasDashboard data={data} />}
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
  width: "1080px",
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
