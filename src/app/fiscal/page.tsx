import { createClient } from "@/lib/supabase/server";
import FiscalSection from "./FiscalSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

// ADR-004 — Estratégia Fiscal, completo: estrutura de registro/
// rastreabilidade do documento (§9.2) mais conferência/aprovação/
// rejeição/pendência no nível do documento (§6, migration
// 20261007000000). Sem emissão, cancelamento fiscal real, inutilização
// ou transmissão (§9.3 — fora do piloto da JR Box, §9.1: o faturamento
// permanece no sistema atual da empresa).
//
// 2026-10-11: busca por número, ordenação por número/status/data
// (allow-list fixa) e filtro por status.
const FISCAL_ORDENAVEIS = ["numero", "status", "created_at"] as const;
const FISCAL_STATUS_VALORES = ["recebido", "em_conferencia", "aprovado", "rejeitado", "pendente", "cancelado"] as const;

export default async function FiscalPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; por_pagina?: string; q?: string; ordenar?: string; status?: string }>;
}) {
  const { pagina: paginaParam, por_pagina: porPaginaParam, q, ordenar, status: statusParam } = await searchParams;
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

  const termoBusca = q?.trim() || null;
  const status = (FISCAL_STATUS_VALORES as readonly string[]).includes(statusParam ?? "") ? statusParam! : null;
  const [ordenarCampo, ordenarDirecao] = ordenar?.split(":") ?? [null, null];
  const ordenacao =
    ordenarCampo && (FISCAL_ORDENAVEIS as readonly string[]).includes(ordenarCampo)
      ? { campo: ordenarCampo, ascending: ordenarDirecao === "asc" }
      : null;

  let countQuery = supabase.from("documentos_fiscais").select("id", { count: "exact", head: true });
  if (termoBusca) countQuery = countQuery.ilike("numero", `%${termoBusca}%`);
  if (status) countQuery = countQuery.eq("status", status);
  const { count: totalDocumentos } = await countQuery;
  const { paginacao, from, to } = calcularPaginacao(paginaPedida, porPagina, totalDocumentos ?? 0);

  let documentosQuery = supabase.from("documentos_fiscais").select("*");
  if (termoBusca) documentosQuery = documentosQuery.ilike("numero", `%${termoBusca}%`);
  if (status) documentosQuery = documentosQuery.eq("status", status);
  documentosQuery = ordenacao
    ? documentosQuery.order(ordenacao.campo, { ascending: ordenacao.ascending }).order("id")
    : documentosQuery.order("created_at", { ascending: false }).order("id");
  const { data: documentos } = await documentosQuery.range(from, to);
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
    <>
      <PageHeader breadcrumb={["Fiscal"]} title="Documentos fiscais" />
      <div className="mx-auto max-w-7xl p-6">
      <p className="text-sm text-text">
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
    </>
  );
}
