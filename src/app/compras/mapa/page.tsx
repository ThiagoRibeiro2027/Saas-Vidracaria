import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import MapaComprasSection from "./MapaComprasSection";

// TÓPICO 7 — Compras, Fase 3 da ADR-011: mapa de compras futuras (§12),
// motor de necessidades por política de abastecimento (§1/§8) e
// calendário de feriados (§11, usado por calcular_data_recomendada_
// compra()). Consolidação de necessidades (§7) e saldo projetado por
// item (§4) existem como RPC (consolidar_necessidades/
// calcular_saldo_projetado) mas ainda sem tela dedicada nesta fase.
export default async function MapaComprasPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "compras", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "compras", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o mapa de compras futuras desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: mapa }, { data: feriados }] = await Promise.all([
    supabase.rpc("mapa_compras_futuras"),
    supabase.from("calendario_feriados").select("*").order("data"),
  ]);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 7 — Compras (Fase 3 da ADR-011)</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Mapa de compras futuras</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Necessidade aberta × saldo disponível (peça dimensional quando o item tem controle por
          peça, Fase 2; saldo escalar nos demais) × data recomendada de compra (lead time do
          fornecedor principal, ajustado por fim de semana/feriado). Risco: crítico (ruptura dentro
          do lead time), atenção (entre 1x e 2x o lead time, ou sem data prevista), ok (sem ruptura
          projetada). <Link href="/compras">← Voltar para Compras</Link>
        </p>

        <MapaComprasSection mapa={mapa ?? []} feriados={feriados ?? []} canManage={!!canManage} />
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
