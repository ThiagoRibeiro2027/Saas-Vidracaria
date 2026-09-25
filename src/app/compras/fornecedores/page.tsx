import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import FornecedoresComprasSection from "./FornecedoresComprasSection";

// TÓPICO 7 — Compras, Fase 8 da ADR-011 (docs/ADR-011 — Compras v1.0.md):
// compras emergenciais (filtro, criação fica em /compras/solicitacoes),
// avaliação de fornecedores (§35, pesos configuráveis por critério) e
// rastreabilidade completa (§39). Busca de rastreabilidade usa query
// string (GET simples) em vez de Server Action, já que é uma consulta de
// leitura sem efeito colateral — mais simples que useActionState aqui.
export default async function FornecedoresComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ necessidade_id?: string; movimentacao_id?: string }>;
}) {
  const { necessidade_id, movimentacao_id } = await searchParams;
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
            Você não tem permissão para visualizar fornecedores e avaliações desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: pessoas },
    { data: pessoaPapeis },
    { data: criterios },
    { data: avaliacoes },
    { data: solicitacoesEmergenciais },
    { data: pedidosEmergenciais },
  ] = await Promise.all([
    supabase.from("pessoas").select("id, nome, nome_fantasia").order("nome"),
    supabase.from("pessoa_papeis").select("pessoa_id, papel, ativo"),
    supabase.from("criterios_avaliacao_fornecedor").select("*"),
    supabase.from("fornecedor_avaliacoes").select("*").order("created_at", { ascending: false }),
    supabase.from("solicitacoes_compra").select("id, numero, status, emergencial_motivo, emergencial_impacto, created_at").eq("urgencia", "emergencial").order("created_at", { ascending: false }),
    supabase.from("pedidos_compra").select("id, numero, status, pessoa_id, created_at").eq("urgencia", "emergencial").order("created_at", { ascending: false }),
  ]);

  const fornecedorIds = new Set(
    (pessoaPapeis ?? []).filter((pp) => pp.papel === "FORNECEDOR" && pp.ativo).map((pp) => pp.pessoa_id),
  );
  const fornecedores = (pessoas ?? []).filter((p) => fornecedorIds.has(p.id));

  let rastreioNecessidade: { ok: boolean; data: unknown } | null = null;
  if (necessidade_id) {
    const { data, error } = await supabase.rpc("rastrear_necessidade", { p_necessidade_compra_id: necessidade_id });
    rastreioNecessidade = { ok: !error, data: error ? error.message : data };
  }

  let rastreioMaterial: { ok: boolean; data: unknown } | null = null;
  if (movimentacao_id) {
    const { data, error } = await supabase.rpc("rastrear_material", { p_estoque_movimentacao_id: movimentacao_id });
    rastreioMaterial = { ok: !error, data: error ? error.message : data };
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 7 — Compras (Fase 8 da ADR-011)</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Fornecedores: avaliação, emergenciais e rastreabilidade</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Avaliação com peso por critério configurável (default 20% cada até a empresa configurar o
          próprio). Rastreabilidade vai até a entrada em estoque — consumo específico de um lote
          recebido não é reconstruível para item de controle escalar (T6).{" "}
          <Link href="/compras/solicitacoes">← Voltar para Solicitações</Link>
        </p>

        <FornecedoresComprasSection
          fornecedores={fornecedores}
          criterios={criterios ?? []}
          avaliacoes={avaliacoes ?? []}
          solicitacoesEmergenciais={solicitacoesEmergenciais ?? []}
          pedidosEmergenciais={pedidosEmergenciais ?? []}
          rastreioNecessidade={rastreioNecessidade}
          rastreioMaterial={rastreioMaterial}
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
