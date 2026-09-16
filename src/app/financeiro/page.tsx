import { createClient } from "@/lib/supabase/server";
import FinanceiroSection from "./FinanceiroSection";

// TÓPICO 11 — Financeiro, recorte mínimo do MVP (ADR-002 §4.14, que
// prevalece sobre a seção 34 do prompt completo do tópico — ver cabeçalho
// da migration 20260916030000): só título a receber vinculado a pedido,
// parcelas planejadas, status básico e registro de recebimento. Sem plano
// de contas, contas a pagar, conciliação, DRE, empréstimos ou comissões.
export default async function FinanceiroPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }, { data: canReceber }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "receber" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Financeiro desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: titulos }, { data: pedidosLiberados }, { data: pessoas }] = await Promise.all([
    supabase.from("titulos_financeiros").select("*").order("vencimento"),
    supabase.from("pedidos").select("id, numero, pessoa_id").eq("status", "liberado"),
    supabase.from("pessoas").select("id, nome"),
  ]);

  const pedidosComTitulo = new Set((titulos ?? []).map((t) => t.pedido_id));
  const pedidosSemTitulo = (pedidosLiberados ?? []).filter((p) => !pedidosComTitulo.has(p.id));
  const nomePorPedido = new Map((pedidosLiberados ?? []).map((p) => [p.id, p]));
  const nomePorPessoa = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 11 — Financeiro</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Financeiro</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do MVP: títulos a receber vinculados ao pedido, com parcelas planejadas e
          registro de recebimento. Sem plano de contas, contas a pagar, conciliação ou DRE.
        </p>

        <FinanceiroSection
          titulos={titulos ?? []}
          pedidosSemTitulo={pedidosSemTitulo}
          nomePorPedido={nomePorPedido}
          nomePorPessoa={nomePorPessoa}
          canManage={!!canManage}
          canReceber={!!canReceber}
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
