import { createClient } from "@/lib/supabase/server";
import NumberingSequencesSection from "./NumberingSequencesSection";
import CuttingMarginsSection from "./CuttingMarginsSection";
import MeasurementRulesSection from "./MeasurementRulesSection";
import ApprovalThresholdsSection from "./ApprovalThresholdsSection";

// TÓPICO 15 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// seção 4): numeração, margem de quebra, regra de medição e alçadas de
// aprovação. Leitura das 4 tabelas é liberada a qualquer usuário
// autenticado da empresa (RLS só verifica company_id — módulos futuros vão
// precisar ler isso); a TELA em si exige configuracoes.view.
export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const { data: canView } = await supabase.rpc("has_permission", {
    p_resource: "configuracoes",
    p_action: "view",
  });

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar as configurações desta empresa.
          </p>
        </div>
      </main>
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

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 15 — Configurações</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Configurações da empresa</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do M1: numeração, margem de quebra, regra de medição e alçada de
          aprovação. Não substitui os cadastros dos módulos operacionais (item 1 do TÓPICO 15).
        </p>

        <NumberingSequencesSection rows={numberingSequences ?? []} canManage={!!canManage} />
        <CuttingMarginsSection rows={cuttingMargins ?? []} canManage={!!canManage} />
        <MeasurementRulesSection rows={measurementRules ?? []} canManage={!!canManage} />
        <ApprovalThresholdsSection
          rows={approvalThresholds ?? []}
          roles={roles ?? []}
          canManage={!!canManage}
        />
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
  width: "900px",
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
