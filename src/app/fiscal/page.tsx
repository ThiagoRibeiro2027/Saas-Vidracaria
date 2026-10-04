import { createClient } from "@/lib/supabase/server";
import FiscalSection from "./FiscalSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

// ADR-004 — Estratégia Fiscal, completo: estrutura de registro/
// rastreabilidade do documento (§9.2) mais conferência/aprovação/
// rejeição/pendência no nível do documento (§6, migration
// 20261007000000). Sem emissão, cancelamento fiscal real, inutilização
// ou transmissão (§9.3 — fora do piloto da JR Box, §9.1: o faturamento
// permanece no sistema atual da empresa).
export default async function FiscalPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; por_pagina?: string }>;
}) {
  const { pagina: paginaParam, por_pagina: porPaginaParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "fiscal", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "fiscal", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Fiscal desta empresa." />
      </div>
    );
  }

  const { pagina: paginaPedida, porPagina } = lerParametrosPaginacao({
    pagina: paginaParam,
    por_pagina: porPaginaParam,
  });
  const { count: totalDocumentos } = await supabase.from("documentos_fiscais").select("id", { count: "exact", head: true });
  const { paginacao, from, to } = calcularPaginacao(paginaPedida, porPagina, totalDocumentos ?? 0);

  const { data: documentos } = await supabase
    .from("documentos_fiscais")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);
  const documentoIds = (documentos ?? []).map((d) => d.id);

  const { data: tentativas } =
    documentoIds.length > 0
      ? await supabase
          .from("documento_fiscal_tentativas")
          .select("*")
          .in("documento_fiscal_id", documentoIds)
          .order("numero_tentativa", { ascending: false })
      : { data: [] as never[] };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <p className="font-mono text-[11px] text-primary">ADR-004 — Fiscal</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Fiscal</h1>
      <p className="mt-1 text-sm text-text">
        Registro, rastreabilidade e avaliação (conferência/aprovação/rejeição/pendência, §6) de
        documentos fiscais, com histórico de tentativas de processamento e reprocessamento
        controlado (§7-8). Sem emissão real, cancelamento fiscal real, inutilização ou transmissão
        neste piloto (§9.1/§9.3) — nenhuma tentativa aqui chama um provedor de verdade.
      </p>

      <div className="mt-6">
        <FiscalSection
          rows={documentos ?? []}
          paginacao={paginacao}
          tentativas={tentativas ?? []}
          canManage={!!canManage}
        />
      </div>
    </div>
  );
}
