import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import ComprasSection from "./ComprasSection";

// TÓPICO 7 — Compras, Fase 1 da ADR-011 (docs/ADR-011 — Compras v1.0.md,
// aprovada 23/09/2026): escopo literal completo do módulo de Compras,
// entregue em 10 fases. Esta é a Fase 1 — fornecedor, fornecedor/material
// alternativo por item e política de abastecimento. Fornecedor continua
// sendo pessoas/pessoa_papeis (T2, papel FORNECEDOR) — fornecedor_dados só
// acrescenta os campos comerciais que T2 deixou de fora de propósito
// ("isso é enriquecimento comercial... fora do recorte de M1").
export default async function ComprasPage() {
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
            Você não tem permissão para visualizar o módulo Compras desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: pessoas },
    { data: pessoaPapeis },
    { data: fornecedorDados },
    { data: itens },
    { data: itemFornecedores },
    { data: materiaisAlternativos },
    { data: politicas },
  ] = await Promise.all([
    supabase.from("pessoas").select("id, nome, nome_fantasia").order("nome"),
    supabase.from("pessoa_papeis").select("pessoa_id, papel, ativo"),
    supabase.from("fornecedor_dados").select("*"),
    supabase
      .from("itens")
      .select("id, codigo, descricao, tipo, unidade_principal")
      .in("tipo", ["materia_prima", "insumo", "material_auxiliar"])
      .eq("situacao", "ativo")
      .order("codigo"),
    supabase.from("item_fornecedores").select("*").order("prioridade"),
    supabase.from("item_materiais_alternativos").select("*").eq("ativo", true),
    supabase.from("politicas_abastecimento").select("*"),
  ]);

  const fornecedorIds = new Set(
    (pessoaPapeis ?? []).filter((pp) => pp.papel === "FORNECEDOR" && pp.ativo).map((pp) => pp.pessoa_id),
  );
  const fornecedores = (pessoas ?? []).filter((p) => fornecedorIds.has(p.id));

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 7 — Compras (escopo completo, ADR-011, 9 fases)</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Fornecedores e políticas de abastecimento</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Módulo completo de Compras (ADR-011, escopo aprovado em 23/09/2026): cadastro comercial do
          fornecedor, fornecedor principal/alternativo por item, material alternativo e política de
          abastecimento (Fase 1, esta página). Recebimento leve continua em <code>/suprimentos</code>,
          sem mudança — é um ciclo independente do recebimento completo desta Fase 7 abaixo.
          Motor de necessidades e mapa de compras futuras (Fase 3) ficam em{" "}
          <Link href="/compras/mapa">/compras/mapa</Link>. Solicitação de compra, compras diretas e
          compra emergencial (Fases 4 e 8) ficam em{" "}
          <Link href="/compras/solicitacoes">/compras/solicitacoes</Link>. Cotação, negociação e
          alçada (Fase 5) ficam em <Link href="/compras/cotacoes">/compras/cotacoes</Link>.
          Pedido de compra e orçado×comprometido×realizado (Fase 6) ficam em{" "}
          <Link href="/compras/pedidos">/compras/pedidos</Link> e{" "}
          <Link href="/compras/orcamento">/compras/orcamento</Link>. Recebimento, conferência,
          lote, divergência e devolução (Fase 7) ficam em{" "}
          <Link href="/compras/recebimentos">/compras/recebimentos</Link>. Avaliação de
          fornecedores e rastreabilidade completa (Fase 8) ficam em{" "}
          <Link href="/compras/fornecedores">/compras/fornecedores</Link>. Dashboard e configuração
          consolidada (Fase 9) ficam em <Link href="/compras/dashboard">/compras/dashboard</Link> e{" "}
          <Link href="/compras/configuracoes">/compras/configuracoes</Link>.
        </p>

        <ComprasSection
          fornecedores={fornecedores}
          fornecedorDados={fornecedorDados ?? []}
          itens={itens ?? []}
          itemFornecedores={itemFornecedores ?? []}
          materiaisAlternativos={materiaisAlternativos ?? []}
          politicas={politicas ?? []}
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
