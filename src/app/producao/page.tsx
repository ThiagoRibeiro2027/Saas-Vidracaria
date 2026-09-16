import { createClient } from "@/lib/supabase/server";
import ProducaoSection, { type ListaCorteRow } from "./ProducaoSection";

// TÓPICO 4 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// dezembro: "o que a fábrica faz"). Uma OP por pedido_item (sem OP parcial/
// paralela/lote fabril), apontamento de quantidade produzida/perdida,
// conclusão e lista de corte (§54) — sem sequenciamento, roteiro
// operação-a-operação ou capacidade/recursos. Só pedidos liberados entram
// aqui (ADR-002 §6: Liberação → Engenharia → Produção), respeitando o
// bloqueio por medida não confirmada (TÓPICO 16 §7).
export default async function ProducaoPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "producao", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "producao", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Produção desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: pedidos },
    { data: pedidoItens },
    { data: itens },
    { data: pessoas },
    { data: obras },
    { data: ordens },
  ] = await Promise.all([
    supabase.from("pedidos").select("*").eq("status", "liberado").order("created_at", { ascending: false }),
    supabase.from("pedido_itens").select("*"),
    supabase.from("itens").select("id, codigo, descricao, tipo"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
    supabase.from("ordens_producao").select("*"),
  ]);

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    const list = pedidoItensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    pedidoItensPorPedido.set(pi.pedido_id, list);
  }

  const ordemPorPedidoItem = new Map((ordens ?? []).map((o) => [o.pedido_item_id, o] as const));

  // Bloqueio por medida (TÓPICO 16 §7) é por pedido, não por item — resolvido
  // aqui (server) pra decidir se o botão "Criar OP" aparece habilitado.
  const bloqueioPorPedido = new Map<string, boolean>();
  await Promise.all(
    (pedidos ?? []).map(async (p) => {
      const { data } = await supabase.rpc("pedido_bloqueado_por_medicao", { p_pedido_id: p.id });
      bloqueioPorPedido.set(p.id, !!data);
    }),
  );

  // Lista de corte (§54) é função de leitura, não entidade armazenada —
  // resolvida aqui pra cada OP existente e passada pronta, sem round-trip
  // client-side (mesmo padrão zero-JS-extra do resto do módulo).
  const listaCortePorOrdem = new Map<string, ListaCorteRow[]>();
  await Promise.all(
    (ordens ?? []).map(async (o) => {
      const { data } = await supabase.rpc("lista_corte", { p_ordem_producao_id: o.id });
      listaCortePorOrdem.set(o.id, data ?? []);
    }),
  );

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 4 — Produção</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Ordens de produção</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do M1: uma ordem de produção por item de pedido liberado, apontamento de
          quantidade produzida e perdida, conclusão e lista de corte. Sem sequenciamento, lote
          fabril ou roteiro operação-a-operação.
        </p>

        <ProducaoSection
          pedidos={pedidos ?? []}
          pedidoItensPorPedido={pedidoItensPorPedido}
          itens={itens ?? []}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          ordemPorPedidoItem={ordemPorPedidoItem}
          bloqueioPorPedido={bloqueioPorPedido}
          listaCortePorOrdem={listaCortePorOrdem}
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
