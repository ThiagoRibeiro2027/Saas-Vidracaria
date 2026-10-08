import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import ComprasDashboard from "./ComprasDashboard";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

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
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o dashboard de compras desta empresa." />
      </div>
    );
  }

  const { data, error } = await supabase.rpc("dashboard_compras", {
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
  });

  return (
    <>
      <PageHeader breadcrumb={["Compras"]} title="Dashboard" />
      <div className="mx-auto max-w-7xl p-6">
        <p className="text-sm text-text">
          Indicadores consolidados de necessidades, solicitações, cotações, aprovações, pedidos,
          recebimentos, financeiro, fornecedores e lead time. Necessidades futuras/risco de ruptura
          detalhado ficam em <Link href="/compras/mapa">/compras/mapa</Link>.{" "}
          <Link href="/compras/configuracoes">Configurações do módulo →</Link>
        </p>

        <form method="get" className="mt-4 flex flex-wrap items-center gap-1.5 rounded-md bg-page-bg p-3">
          <label className="flex items-center gap-1 text-xs text-text">
            De <Input name="data_inicio" type="date" defaultValue={dataInicio ?? ""} />
          </label>
          <label className="flex items-center gap-1 text-xs text-text">
            Até <Input name="data_fim" type="date" defaultValue={dataFim ?? ""} />
          </label>
          <Button type="submit" variant="primary">Filtrar</Button>
          {(dataInicio || dataFim) && (
            <a href="/compras/dashboard" className="text-xs text-text">Limpar período</a>
          )}
        </form>

        {error && <p className="mt-3 text-sm text-danger">Não foi possível carregar o dashboard: {error.message}</p>}
        {!error && data && (
          <div className="mt-4">
            <ComprasDashboard data={data} />
          </div>
        )}
      </div>
    </>
  );
}
