import { createClient } from "@/lib/supabase/server";
import FilaProducaoSection, { type FilaProducaoRow } from "./FilaProducaoSection";

// Fila de Produção — Fase B do plano de 23/09/2026 (fila por pedido de
// cliente, peças fabricadas reutilizáveis e necessidades automáticas de
// suprimentos). Tela nova e separada de /producao (que já tem 9 seções),
// só leitura sobre listar_fila_producao() — nenhuma tabela/coluna/permissão
// nova, reaproveita producao.view já seedada.
export default async function FilaProducaoPage() {
  const supabase = await createClient();

  const { data: canView } = await supabase.rpc("has_permission", {
    p_resource: "producao",
    p_action: "view",
  });

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar a produção desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const { data: fila } = await supabase.rpc("listar_fila_producao", {
    p_pessoa_id: null,
    p_obra_id: null,
    p_status_op: null,
  });

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>PRODUÇÃO — FILA POR PEDIDO</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Fila de Produção</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Painel de leitura agregando ordens de produção de todos os pedidos, agrupadas por
          cliente/obra/pedido — pensado pro chão de fábrica ver de uma vez só o que está em fila,
          sem abrir cada pedido individualmente. Gestão de OP/lote/roteiro continua em Produção.
        </p>

        <FilaProducaoSection linhas={(fila as FilaProducaoRow[]) ?? []} />
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
  width: "1100px",
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
