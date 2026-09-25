import { createClient } from "@/lib/supabase/server";
import RHSection from "./RHSection";

// TÓPICO 17 — RH completo: cadastro de funcionários, vínculo com usuário,
// desligamento com revogação de acesso (recorte mínimo, migration
// 20260916050000), mais documentos/EPI/habilitações e afastamentos/
// férias (§6-7, migration 20261006000000). "Cadastro de equipes" já foi
// antecipado no TÓPICO 16 (equipes_instalacao).
export default async function RHPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "rh", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "rh", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo RH desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: funcionarios }, { data: unidades }, { data: profiles }, { data: documentos }, { data: afastamentos }] = await Promise.all([
    supabase.from("funcionarios").select("*").order("nome"),
    supabase.from("company_units").select("id, name").eq("active", true).order("name"),
    supabase.from("profiles").select("id, display_name, login_identifier").eq("active", true).order("display_name"),
    supabase.from("funcionario_documentos").select("*").order("created_at", { ascending: false }),
    supabase.from("funcionario_afastamentos").select("*").order("data_inicio", { ascending: false }),
  ]);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 17 — RH</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>RH</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do MVP: cadastro de funcionários, vínculo com usuário e desligamento.
          Dados pessoais sensíveis (LGPD) — visível só a quem tem permissão explícita.
        </p>

        <RHSection
          rows={funcionarios ?? []}
          unidades={unidades ?? []}
          profiles={profiles ?? []}
          documentos={documentos ?? []}
          afastamentos={afastamentos ?? []}
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
  width: "960px",
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
