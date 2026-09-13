import { createClient } from "@/lib/supabase/server";
import EstoqueSection from "./EstoqueSection";

// TÓPICO 6 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// novembro: "o que a fábrica faz"). Só saldo, reserva para o pedido,
// consumo e registro de sobra — sem localização, lote/serial, peça física
// individual, motor de compatibilidade de sobra ou inventário. Saldo é
// escalar (quantidade na unidade do item, não peça física).
export default async function EstoquePage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "estoque", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "estoque", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Estoque desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: itens },
    { data: saldos },
    { data: pedidos },
    { data: pedidoItens },
    { data: reservas },
    { data: pessoas },
    { data: obras },
  ] = await Promise.all([
    supabase.from("itens").select("id, codigo, descricao, tipo, unidade_principal").order("codigo"),
    supabase.from("estoque_saldos").select("*"),
    supabase.from("pedidos").select("*").eq("status", "liberado").order("created_at", { ascending: false }),
    supabase.from("pedido_itens").select("*"),
    supabase.from("estoque_reservas").select("*"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
  ]);

  const saldoPorItem = new Map((saldos ?? []).map((s) => [s.item_id, s] as const));

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    const list = pedidoItensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    pedidoItensPorPedido.set(pi.pedido_id, list);
  }

  // Reserva "ativa" (status='reservado') é a única relevante para decidir
  // se a tela mostra Reservar/Liberar/Consumir; reservas liberadas/
  // consumidas ficam só no histórico (activity_logs / estoque_movimentacoes).
  const reservaAtivaPorPedidoItem = new Map(
    (reservas ?? []).filter((r) => r.status === "reservado").map((r) => [r.pedido_item_id, r] as const),
  );

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 6 — Estoque</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Saldo, reservas e sobras</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do M1: saldo por item, reserva para o pedido (com reserva parcial quando
          falta disponível), consumo e registro de sobra. Sem localização, lote/serial ou
          inventário.
        </p>

        <EstoqueSection
          itens={itens ?? []}
          saldoPorItem={saldoPorItem}
          pedidos={pedidos ?? []}
          pedidoItensPorPedido={pedidoItensPorPedido}
          reservaAtivaPorPedidoItem={reservaAtivaPorPedidoItem}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
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
