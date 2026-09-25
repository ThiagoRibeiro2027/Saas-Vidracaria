import { createClient } from "@/lib/supabase/server";
import IntegracoesSection from "./IntegracoesSection";

// TÓPICO 13 — Integrações, recorte mínimo do MVP (Fase 1, ADR-002 v2.5
// §4.17): Central de Integrações (configurar/ativar/desativar) e fonte
// oficial por tipo de informação. Sem nenhum conector externo real —
// "testar conexão" e "sincronizar" ficam pra quando existir o primeiro
// conector de verdade (ver cabeçalho da migration 20261004000000).
export default async function IntegracoesPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "integracoes", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "integracoes", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar a Central de Integrações desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: catalogo }, { data: integracoes }, { data: fontesOficiais }, { data: logs }] = await Promise.all([
    supabase.from("integracoes_catalogo").select("*").order("categoria").order("nome"),
    supabase.from("integracoes").select("*, integracoes_catalogo(key, nome, categoria)").order("created_at", { ascending: false }),
    supabase.from("integracao_fonte_oficial").select("*").order("tipo_informacao"),
    supabase
      .from("activity_logs")
      .select("id, action, description, metadata, created_at")
      .like("action", "integracoes.%")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 13 — INTEGRAÇÕES</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Central de Integrações</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do MVP (Fase 1): registro e ativação de conectores, fila técnica com
          idempotência/retry (sem UI própria ainda) e fonte oficial por tipo de informação. Nenhum
          conector externo real está ligado nesta fase — o catálogo abaixo só documenta os
          ganchos preparados (ERP genérico, provedor de NF-e).
        </p>

        <IntegracoesSection
          catalogo={catalogo ?? []}
          integracoes={integracoes ?? []}
          fontesOficiais={fontesOficiais ?? []}
          logs={logs ?? []}
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
