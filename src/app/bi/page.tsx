import { createClient } from "@/lib/supabase/server";
import BIDashboard from "./BIDashboard";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

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
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar os indicadores desta empresa." />
      </div>
    );
  }

  const { data, error } = await supabase.rpc("dashboard_operacional");

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 12 — BI</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Indicadores</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do MVP: indicadores operacionais básicos de acompanhamento do fluxo.
      </p>

      {error && <p className="mt-3 text-sm text-danger">Não foi possível carregar os indicadores: {error.message}</p>}
      {!error && data && (
        <div className="mt-6">
          <BIDashboard data={data} />
        </div>
      )}
    </div>
  );
}
