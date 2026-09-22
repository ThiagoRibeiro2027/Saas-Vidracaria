import { createClient } from "@/lib/supabase/server";
import NumberingSequencesSection from "./NumberingSequencesSection";
import CuttingMarginsSection from "./CuttingMarginsSection";
import MeasurementRulesSection from "./MeasurementRulesSection";
import ApprovalThresholdsSection from "./ApprovalThresholdsSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { Tabs } from "@/components/ui/Tabs";

type TabSlug = "numeracao" | "quebra" | "medicao" | "alcada";

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
  ]);

  const availableTabs: { slug: TabSlug; label: string }[] = [
    { slug: "numeracao", label: "Numeração" },
    { slug: "quebra", label: "Margem de quebra" },
    { slug: "medicao", label: "Regra de medição" },
    { slug: "alcada", label: "Alçada de aprovação" },
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === tab) ? (tab as TabSlug) : "numeracao";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 15 — Configurações</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Configurações da empresa</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: numeração, margem de quebra, regra de medição e alçada de
        aprovação. Não substitui os cadastros dos módulos operacionais (item 1 do TÓPICO 15).
      </p>

      <div className="mt-6">
        <Tabs tabs={availableTabs} active={activeTab} basePath="/configuracoes" />
      </div>

      <div className="mt-6">
        {activeTab === "numeracao" && (
          <NumberingSequencesSection rows={numberingSequences ?? []} canManage={!!canManage} />
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
      </div>
    </div>
  );
}
