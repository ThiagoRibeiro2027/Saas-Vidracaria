import { createClient } from "@/lib/supabase/server";
import BIDashboard from "./BIDashboard";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
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
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar os indicadores desta empresa." />
      </div>
    );
  }

  const { data, error } = await supabase.rpc("dashboard_operacional", {
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
  });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 12 — BI</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Indicadores</h1>
      <p className="mt-1 text-sm text-text">
        Indicadores operacionais básicos, com filtro de período. Sem KPI versionado, drill-down,
        análise preditiva, dashboards por área, metas, alertas ou assistente analítico.
      </p>

      <form method="get" className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md bg-page-bg p-3">
        <label className="text-xs text-text">
          De{" "}
          <input name="data_inicio" type="date" defaultValue={dataInicio ?? ""} style={inputStyle} />
        </label>
        <label className="text-xs text-text">
          Até{" "}
          <input name="data_fim" type="date" defaultValue={dataFim ?? ""} style={inputStyle} />
        </label>
        <button type="submit" style={buttonStyle}>
          Filtrar
        </button>
        {(dataInicio || dataFim) && (
          <a href="/bi" className="text-xs text-text">
            Limpar período
          </a>
        )}
      </form>

      {error && <p className="mt-3 text-sm text-danger">Não foi possível carregar os indicadores: {error.message}</p>}
      {!error && data && (
        <div className="mt-6">
          <BIDashboard data={data} />
        </div>
      )}
    </div>
  );
}
