import { createClient } from "@/lib/supabase/server";
import PecasSection from "./PecasSection";

// Peças Fabricadas — Fase A do plano de 23/09/2026 (fila de produção,
// peças fabricadas e necessidades automáticas de suprimentos). Camada de
// BOM deliberadamente leve: uma peça (item do catálogo, tipo componente/
// produto_acabado) associada a uma lista plana de materiais (perfil/
// vidro/acessório/insumo) e quantidade por unidade — sem hierarquia
// Produto→Conjunto→Subconjunto nem motor de regras (isso é o Prompt
// TÓPICO 5 completo, fora de escopo). Habilita a Fase C (necessidades
// automáticas de Suprimentos) a somar material necessário por pedido.
export default async function PecasPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "pecas", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "pecas", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar as peças fabricadas desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: pecas }, { data: composicao }, { data: itens }] = await Promise.all([
    supabase.from("pecas").select("*").order("created_at", { ascending: false }),
    supabase.from("peca_composicao").select("*").order("created_at"),
    supabase
      .from("itens")
      .select("id, codigo, descricao, tipo, unidade_principal")
      .eq("situacao", "ativo")
      .order("codigo"),
  ]);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>PRODUÇÃO — PEÇAS FABRICADAS (BOM LEVE)</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Peças Fabricadas</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Camada leve de lista de materiais: uma peça (item do catálogo) e os perfis/vidro/
          acessórios/insumos que a compõem, com quantidade por unidade — comum a todos os projetos
          que usam essa peça. Sem hierarquia de conjunto/subconjunto e sem motor de regras nesta
          fase.
        </p>

        <PecasSection
          pecas={pecas ?? []}
          composicao={composicao ?? []}
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
