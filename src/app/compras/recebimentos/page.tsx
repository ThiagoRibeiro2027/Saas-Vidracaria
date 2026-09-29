import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import RecebimentosComprasSection from "./RecebimentosComprasSection";

// TÓPICO 7 — Compras, Fase 7 da ADR-011 (docs/ADR-011 — Compras v1.0.md):
// Recebimento completo, conferência/qualidade, lote, divergência, devolução
// (§26 a §31, §36). Nenhuma entrada física de estoque acontece ao registrar
// o recebimento — só quando a conferência é finalizada (§26 "compra não
// significa estoque disponível"). §28 usa tabelas próprias desta fase
// (divergencias_recebimento), não inspecoes_qualidade/nao_conformidades
// (T8) — essas são hardwired a ordens_producao e não servem pra Recebimento
// (ver comentário no topo da migration desta fase).
export default async function RecebimentosComprasPage() {
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
            Você não tem permissão para visualizar recebimentos de compra desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: pedidosCompra },
    { data: pedidoItens },
    { data: recebimentos },
    { data: recebimentoItens },
    { data: lotes },
    { data: divergencias },
    { data: devolucoes },
    { data: itens },
    { data: pessoas },
  ] = await Promise.all([
    supabase.from("pedidos_compra").select("id, numero, pessoa_id, status").in("status", ["emitido", "confirmado"]),
    supabase.from("pedido_compra_itens").select("*"),
    supabase.from("recebimentos_pedido_compra").select("*").order("created_at", { ascending: false }),
    supabase.from("recebimento_itens").select("*"),
    supabase.from("lotes_recebimento").select("*"),
    supabase.from("divergencias_recebimento").select("*").order("created_at", { ascending: false }),
    supabase.from("devolucoes_compra").select("*").order("created_at", { ascending: false }),
    supabase.from("itens").select("id, codigo, descricao"),
    supabase.from("pessoas").select("id, nome, nome_fantasia"),
  ]);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 7 — Compras (Fase 7 da ADR-011)</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Recebimento, conferência e devoluções</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recebimento parcial/múltiplo contra um pedido de compra emitido/confirmado. A entrada em
          estoque só acontece ao finalizar a conferência — divergências abertas bloqueiam a
          finalização. Devolução só é possível sobre item já conferido (já entrou em estoque).{" "}
          <Link href="/compras/pedidos">← Voltar para Pedidos</Link>
        </p>

        <RecebimentosComprasSection
          pedidosCompra={pedidosCompra ?? []}
          pedidoItens={pedidoItens ?? []}
          recebimentos={recebimentos ?? []}
          recebimentoItens={recebimentoItens ?? []}
          lotes={lotes ?? []}
          divergencias={divergencias ?? []}
          devolucoes={devolucoes ?? []}
          itens={itens ?? []}
          pessoas={pessoas ?? []}
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
  width: "1080px",
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
