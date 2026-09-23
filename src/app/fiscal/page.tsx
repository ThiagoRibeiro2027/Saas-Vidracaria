import { createClient } from "@/lib/supabase/server";
import FiscalSection from "./FiscalSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

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
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Fiscal desta empresa." />
      </div>
    );
  }

  const [{ data: documentos }, { data: tentativas }] = await Promise.all([
    supabase.from("documentos_fiscais").select("*").order("created_at", { ascending: false }),
    supabase.from("documento_fiscal_tentativas").select("*").order("numero_tentativa", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">ADR-004 — Fiscal</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Fiscal</h1>
      <p className="mt-1 text-sm text-text">
        Registro e rastreabilidade de documentos fiscais, com histórico de tentativas de
        processamento e reprocessamento controlado (§7-8). Sem emissão real, cancelamento fiscal
        real, inutilização ou transmissão neste piloto (§9.1/§9.3) — nenhuma tentativa aqui chama
        um provedor de verdade.
      </p>

      <div className="mt-6">
        <FiscalSection rows={documentos ?? []} tentativas={tentativas ?? []} canManage={!!canManage} />
      </div>
    </div>
  );
}
