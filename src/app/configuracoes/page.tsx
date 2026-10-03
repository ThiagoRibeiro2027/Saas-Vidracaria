import { createClient } from "@/lib/supabase/server";
import NumberingSequencesSection from "./NumberingSequencesSection";
import CuttingMarginsSection from "./CuttingMarginsSection";
import MeasurementRulesSection from "./MeasurementRulesSection";
import ApprovalThresholdsSection from "./ApprovalThresholdsSection";
import MargemPrecoSection from "./MargemPrecoSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

type TabSlug = "numeracao" | "quebra" | "medicao" | "alcada" | "preco";

// TÓPICO 15 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// seção 4): numeração, margem de quebra, regra de medição e alçadas de
// aprovação. Leitura das 4 tabelas é liberada a qualquer usuário
// autenticado da empresa (RLS só verifica company_id — módulos futuros vão
// precisar ler isso); a TELA em si exige configuracoes.view.
export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const { data: canView } = await supabase.rpc("has_permission", {
    p_resource: "configuracoes",
    p_action: "view",
  });

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar as configurações desta empresa." />
      </div>
    );
  }

  const { data: canManage } = await supabase.rpc("has_permission", {
    p_resource: "configuracoes",
    p_action: "manage",
  });

  const [
    { data: numberingSequences },
    { data: cuttingMargins },
    { data: measurementRules },
    { data: roles },
    { data: approvalThresholds },
    { data: documentTypes },
    { data: pricingSettings },
  ] = await Promise.all([
    supabase.from("numbering_sequences").select("*").order("document_type"),
    supabase
      .from("cutting_margin_settings")
      .select("*")
      .order("material_tipo")
      .order("processo"),
    supabase.from("measurement_rules").select("*").order("tipo_item"),
    supabase.from("roles").select("id, key, name, company_id").order("name"),
    supabase.from("approval_thresholds").select("*").order("processo"),
    // FIX (achado em teste manual, 27/09/2026): a lista de tipos de
    // documento numerável era fixa no componente e nunca acompanhou
    // novos tipos (Compras/ADR-011, Contratos) — puxa do catálogo real
    // (next_document_number() já consulta esta mesma tabela).
    supabase.from("numbering_document_types").select("document_type"),
    // ADR-012 v1.1 — no máximo uma linha por empresa (unique em company_id).
    supabase.from("pricing_settings").select("id, margem_percentual").maybeSingle(),
  ]);

  const documentTypeKeys = Array.from(new Set((documentTypes ?? []).map((d) => d.document_type))).sort();

  const availableTabs: { slug: TabSlug; label: string }[] = [
    { slug: "numeracao", label: "Numeração" },
    { slug: "quebra", label: "Margem de quebra" },
    { slug: "medicao", label: "Regra de medição" },
    { slug: "alcada", label: "Alçada de aprovação" },
    { slug: "preco", label: "Margem de preço" },
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === tab) ? (tab as TabSlug) : "numeracao";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 15 — Configurações</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Configurações da empresa</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: numeração, margem de quebra, regra de medição e alçada de
        aprovação, mais a margem de preço do orçamento (ADR-012). Não substitui os cadastros dos módulos operacionais (item 1 do TÓPICO 15).
      </p>

      <div className="mt-6">
        {activeTab === "numeracao" && (
          <NumberingSequencesSection
            rows={numberingSequences ?? []}
            documentTypeKeys={documentTypeKeys}
            canManage={!!canManage}
          />
        )}
        {activeTab === "quebra" && <CuttingMarginsSection rows={cuttingMargins ?? []} canManage={!!canManage} />}
        {activeTab === "medicao" && (
          <MeasurementRulesSection rows={measurementRules ?? []} canManage={!!canManage} />
        )}
        {activeTab === "alcada" && (
          <ApprovalThresholdsSection
            rows={approvalThresholds ?? []}
            roles={roles ?? []}
            canManage={!!canManage}
          />
        )}
        {activeTab === "preco" && <MargemPrecoSection row={pricingSettings ?? null} canManage={!!canManage} />}
      </div>
    </div>
  );
}
