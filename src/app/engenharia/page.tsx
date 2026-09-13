import { createClient } from "@/lib/supabase/server";
import EngenhariaSection from "./EngenhariaSection";

// TÓPICO 5 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// novembro: "o que a fábrica faz"). Só o vínculo pedido_item → medida de
// obra (TÓPICO 16 §7) — sem Produto/Projeto, BOM, revisão, motor de
// regras ou Solicitação de Engenharia. Só pedidos liberados entram aqui
// (ADR-002 §6: Liberação → Engenharia).
export default async function EngenhariaPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "engenharia", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "engenharia", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Engenharia desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: pedidos },
    { data: pedidoItens },
    { data: itensProducao },
    { data: pessoas },
    { data: obras },
    { data: itens },
  ] = await Promise.all([
    supabase.from("pedidos").select("*").eq("status", "liberado").order("created_at", { ascending: false }),
    supabase.from("pedido_itens").select("*"),
    supabase.from("itens_producao").select("*"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
    supabase.from("itens").select("id, codigo, descricao, tipo"),
  ]);

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    const list = pedidoItensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    pedidoItensPorPedido.set(pi.pedido_id, list);
  }

  const itemProducaoPorPedidoItem = new Map(
    (itensProducao ?? []).map((ip) => [ip.pedido_item_id, ip] as const),
  );

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 5 — Engenharia</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Itens a produzir</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do M1: medição em obra por item de pedido liberado, com confirmação antes
          da produção (TÓPICO 16 §7). Sem projeto técnico, BOM ou revisão.
        </p>

        <EngenhariaSection
          pedidos={pedidos ?? []}
          pedidoItensPorPedido={pedidoItensPorPedido}
          itemProducaoPorPedidoItem={itemProducaoPorPedidoItem}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          itens={itens ?? []}
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
