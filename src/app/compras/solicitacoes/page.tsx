import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import SolicitacoesComprasSection from "./SolicitacoesComprasSection";

// TÓPICO 7 — Compras, Fase 4 da ADR-011: Solicitação de Compra (§16) e
// Compras Diretas (§2). Item de SC com necessidade_compra_id vinculada
// só atende a necessidade (atender_necessidade_compra() já existente) no
// envio da SC — rascunho é edição local, sem efeito colateral.
export default async function SolicitacoesComprasPage() {
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
            Você não tem permissão para visualizar solicitações de compra desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: solicitacoes },
    { data: itensSolicitacao },
    { data: comprasDiretas },
    { data: itens },
    { data: necessidades },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("solicitacoes_compra").select("*").order("created_at", { ascending: false }),
    supabase.from("solicitacao_compra_itens").select("*"),
    supabase.from("compras_diretas").select("*").order("created_at", { ascending: false }),
    supabase
      .from("itens")
      .select("id, codigo, descricao, unidade_principal, tipo")
      .in("tipo", ["materia_prima", "insumo", "material_auxiliar"])
      .eq("situacao", "ativo")
      .order("codigo"),
    supabase.from("necessidades_compra").select("id, item_id, quantidade, origem").eq("status", "aberta"),
    supabase.from("profiles").select("id, display_name").order("display_name"),
  ]);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 7 — Compras (Fase 4 da ADR-011)</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Solicitações de compra e compras diretas</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          SC em rascunho pode ganhar/perder item livremente; ao enviar, cada item com necessidade
          vinculada atende essa necessidade automaticamente. Compra direta é um bypass deliberado da
          SC — sempre exige motivo e justificativa. Cotação e Pedido de Compra formal ainda não
          existem (fases futuras). <Link href="/compras">← Voltar para Compras</Link>
        </p>

        <SolicitacoesComprasSection
          solicitacoes={solicitacoes ?? []}
          itensSolicitacao={itensSolicitacao ?? []}
          comprasDiretas={comprasDiretas ?? []}
          itens={itens ?? []}
          necessidades={necessidades ?? []}
          profiles={profiles ?? []}
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
