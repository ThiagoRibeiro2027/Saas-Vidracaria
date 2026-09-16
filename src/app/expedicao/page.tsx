import { createClient } from "@/lib/supabase/server";
import ExpedicaoSection from "./ExpedicaoSection";

// TÓPICO 9 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// dezembro: "saída, campo e homologação"). Separação, conferência,
// romaneio e saída, com suporte a expedição parcial (ADR-002 §4.8) — um
// pedido liberado pode ter várias expedições. Integra com T4/T8 só por
// leitura: item só entra numa expedição se a OP estiver concluída e
// aprovada pela qualidade, respeitando a quantidade já usada por outras
// expedições ativas do mesmo pedido_item.
export default async function ExpedicaoPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "expedicao", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "expedicao", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Expedição desta empresa.
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
    { data: expedicoes },
    { data: expedicaoItens },
    { data: ocorrencias },
  ] = await Promise.all([
    supabase.from("pedidos").select("id, numero, pessoa_id, obra_id").eq("status", "liberado").order("created_at", { ascending: false }),
    supabase.from("pedido_itens").select("id, pedido_id, item_id, quantidade"),
    supabase.from("itens").select("id, codigo, descricao"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
    supabase.from("ordens_producao").select("id, pedido_item_id, status, status_qualidade, quantidade_produzida"),
    supabase.from("expedicoes").select("*").order("created_at", { ascending: false }),
    supabase.from("expedicao_itens").select("*"),
    supabase.from("ocorrencias_expedicao").select("*").order("registrado_em", { ascending: true }),
  ]);

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    const list = pedidoItensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    pedidoItensPorPedido.set(pi.pedido_id, list);
  }

  const ordemPorPedidoItem = new Map((ordens ?? []).map((o) => [o.pedido_item_id, o] as const));

  const expedicoesPorPedido = new Map<string, NonNullable<typeof expedicoes>>();
  for (const exp of expedicoes ?? []) {
    const list = expedicoesPorPedido.get(exp.pedido_id) ?? [];
    list.push(exp);
    expedicoesPorPedido.set(exp.pedido_id, list);
  }

  const statusPorExpedicao = new Map((expedicoes ?? []).map((e) => [e.id, e.status] as const));

  const itensPorExpedicao = new Map<string, NonNullable<typeof expedicaoItens>>();
  const jaUsadoPorPedidoItem = new Map<string, number>();
  for (const item of expedicaoItens ?? []) {
    const list = itensPorExpedicao.get(item.expedicao_id) ?? [];
    list.push(item);
    itensPorExpedicao.set(item.expedicao_id, list);

    if (statusPorExpedicao.get(item.expedicao_id) !== "cancelada") {
      jaUsadoPorPedidoItem.set(
        item.pedido_item_id,
        (jaUsadoPorPedidoItem.get(item.pedido_item_id) ?? 0) + Number(item.quantidade),
      );
    }
  }

  const ocorrenciasPorExpedicao = new Map<string, NonNullable<typeof ocorrencias>>();
  for (const oc of ocorrencias ?? []) {
    const list = ocorrenciasPorExpedicao.get(oc.expedicao_id) ?? [];
    list.push(oc);
    ocorrenciasPorExpedicao.set(oc.expedicao_id, list);
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 9 — Expedição</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Separação, conferência e saída</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do M1: separação, conferência, romaneio e saída, com suporte a expedição
          parcial. Item só pode ser expedido depois de produzido e aprovado pela qualidade.
        </p>

        <ExpedicaoSection
          pedidos={pedidos ?? []}
          pedidoItensPorPedido={pedidoItensPorPedido}
          itens={itens ?? []}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          ordemPorPedidoItem={ordemPorPedidoItem}
          expedicoesPorPedido={expedicoesPorPedido}
          itensPorExpedicao={itensPorExpedicao}
          ocorrenciasPorExpedicao={ocorrenciasPorExpedicao}
          jaUsadoPorPedidoItem={jaUsadoPorPedidoItem}
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
