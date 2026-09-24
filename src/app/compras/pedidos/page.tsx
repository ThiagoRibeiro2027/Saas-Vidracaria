import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import PedidosComprasSection from "./PedidosComprasSection";

// TÓPICO 7 — Compras, Fase 6 da ADR-011: Pedido de Compra formal (§24) e
// compras recorrentes via contrato de fornecedor (§25, T18). PC só nasce
// de cotação selecionada com alçada já aprovada (gerar_pedido_compra_de_
// cotacao()) — um PC por fornecedor distinto entre as seleções.
export default async function PedidosComprasPage() {
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
            Você não tem permissão para visualizar pedidos de compra desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: cotacoes },
    { data: aprovacoes },
    { data: pedidosCompra },
    { data: pedidoItens },
    { data: programacoes },
    { data: titulos },
    { data: itens },
    { data: pessoas },
    { data: contratos },
  ] = await Promise.all([
    supabase.from("cotacoes").select("id, numero, status, aprovacao_id").eq("status", "selecionada"),
    supabase.from("compras_aprovacoes").select("id, status"),
    supabase.from("pedidos_compra").select("*").order("created_at", { ascending: false }),
    supabase.from("pedido_compra_itens").select("*"),
    supabase.from("pedido_compra_programacoes").select("*").order("data_entrega"),
    supabase.from("titulos_pagar").select("*"),
    supabase.from("itens").select("id, codigo, descricao"),
    supabase.from("pessoas").select("id, nome, nome_fantasia"),
    supabase.from("contratos").select("id, numero, tipo, pessoa_id, status").eq("tipo", "fornecedor"),
  ]);

  const aprovacaoPorId = new Map((aprovacoes ?? []).map((a) => [a.id, a]));
  const cotacoesGeraveis = (cotacoes ?? []).filter((c) => {
    const aprov = c.aprovacao_id ? aprovacaoPorId.get(c.aprovacao_id) : undefined;
    return aprov?.status === "aprovada";
  });
  const pcComGerado = new Set((pedidosCompra ?? []).map((pc) => pc.cotacao_id));
  const cotacoesParaGerar = cotacoesGeraveis.filter((c) => !pcComGerado.has(c.id));

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 7 — Compras (Fase 6 da ADR-011)</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Pedidos de compra</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Só cotação selecionada e já aprovada pela alçada pode virar Pedido de Compra — um PC por
          fornecedor distinto. Vincule um contrato de fornecedor (T18) e programe entregas futuras
          para compra recorrente (§25). <Link href="/compras/cotacoes">← Voltar para Cotações</Link>
        </p>

        <PedidosComprasSection
          cotacoesParaGerar={cotacoesParaGerar}
          pedidosCompra={pedidosCompra ?? []}
          pedidoItens={pedidoItens ?? []}
          programacoes={programacoes ?? []}
          titulos={titulos ?? []}
          itens={itens ?? []}
          pessoas={pessoas ?? []}
          contratos={contratos ?? []}
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
  width: "1040px",
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
