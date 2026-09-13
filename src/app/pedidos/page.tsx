import { createClient } from "@/lib/supabase/server";
import PedidosSection from "./PedidosSection";

// TÓPICO 3 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// outubro: "entrada do pedido", último item da sequência T2 → T10 → T3).
// Único caminho de criação é converter um orçamento aprovado (TÓPICO 10) —
// sem cadastro direto nem importação neste recorte. Status cobre só até
// "liberado"; em andamento/concluído dependem do TÓPICO 4 (novembro).
export default async function PedidosPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "pedidos", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "pedidos", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Pedidos desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: pedidos },
    { data: pedidoItens },
    { data: pendencias },
    { data: orcamentosAprovados },
    { data: orcamentoItens },
    { data: pessoas },
    { data: obras },
    { data: itens },
  ] = await Promise.all([
    supabase.from("pedidos").select("*").order("created_at", { ascending: false }),
    supabase.from("pedido_itens").select("*"),
    supabase.from("pedido_pendencias").select("*").order("aberta_em", { ascending: false }),
    supabase.from("orcamentos").select("*").eq("status", "aprovado"),
    supabase.from("orcamento_itens").select("*"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
    supabase.from("itens").select("id, codigo, descricao"),
  ]);

  const orcamentosConvertidos = new Set((pedidos ?? []).map((p) => p.orcamento_id));
  const orcamentosDisponiveis = (orcamentosAprovados ?? []).filter((o) => !orcamentosConvertidos.has(o.id));
  // orcamentosAprovados cobre também os já convertidos (conversão não muda o
  // status do orçamento) — reaproveitado aqui pra mostrar a origem no card
  // do pedido, sem uma segunda consulta.
  const numeroOrcamentoPorId = new Map((orcamentosAprovados ?? []).map((o) => [o.id, o.numero]));

  const itensPorOrcamento = new Map<string, NonNullable<typeof orcamentoItens>>();
  for (const oi of orcamentoItens ?? []) {
    const list = itensPorOrcamento.get(oi.orcamento_id) ?? [];
    list.push(oi);
    itensPorOrcamento.set(oi.orcamento_id, list);
  }

  const itensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    const list = itensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    itensPorPedido.set(pi.pedido_id, list);
  }

  const pendenciasPorPedido = new Map<string, NonNullable<typeof pendencias>>();
  for (const pd of pendencias ?? []) {
    const list = pendenciasPorPedido.get(pd.pedido_id) ?? [];
    list.push(pd);
    pendenciasPorPedido.set(pd.pedido_id, list);
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 3 — Pedidos</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Pedidos</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do M1: conversão de orçamento aprovado, conferência, pendências e
          liberação. Sem cadastro direto de pedido, importação ou acompanhamento de produção
          (TÓPICO 4).
        </p>

        <PedidosSection
          pedidos={pedidos ?? []}
          itensPorPedido={itensPorPedido}
          pendenciasPorPedido={pendenciasPorPedido}
          numeroOrcamentoPorId={numeroOrcamentoPorId}
          orcamentosDisponiveis={orcamentosDisponiveis}
          itensPorOrcamento={itensPorOrcamento}
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
