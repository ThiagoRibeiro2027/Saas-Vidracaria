import { createClient } from "@/lib/supabase/server";
import PecasSection from "./PecasSection";

// Peças Fabricadas — Fase A (BOM leve) + Fase E (hierarquia + revisão
// básica) do plano de 23/09/2026. Uma peça (item do catálogo, tipo
// componente/produto_acabado) associada a uma composição de materiais —
// que agora pode incluir outra peça já cadastrada como subconjunto, não
// só matéria-prima/insumo/material_auxiliar. Cada mudança estrutural
// grava uma revisão (histórico consultável). Motor de regras e workflow
// de aprovação (Prompt TÓPICO 5 completo) seguem fora de escopo.
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

  // TÓPICO 5 Fase E — histórico de revisões por peça (leitura, N chamadas
  // sobre `pecas` já buscadas, mesmo padrão de Promise.all já usado em
  // producao/page.tsx para recursos/capacidade).
  const revisoesPorPeca = new Map<string, { revisao: number; motivo: string | null; created_at: string }[]>();
  await Promise.all(
    (pecas ?? []).map(async (p) => {
      const { data } = await supabase.rpc("listar_revisoes_peca", { p_peca_id: p.id });
      revisoesPorPeca.set(p.id, data ?? []);
    }),
  );

  // TÓPICO 5 Fase F — características configuráveis por peça.
  const caracteristicasPorPeca = new Map<
    string,
    { id: string; nome: string; tipo: string; unidade: string | null; opcoes: string[] | null; obrigatoria: boolean }[]
  >();
  await Promise.all(
    (pecas ?? []).map(async (p) => {
      const { data } = await supabase.rpc("listar_caracteristicas_peca", { p_peca_id: p.id });
      caracteristicasPorPeca.set(p.id, data ?? []);
    }),
  );

  // TÓPICO 5 Fase G — regras (condição→ação) do motor básico por peça.
  const regrasPorPeca = new Map<
    string,
    {
      id: string; versao: number; substitui_regra_id: string | null;
      caracteristica_id: string; caracteristica_nome: string; operador: string;
      valor_comparacao_numero: number | null; valor_comparacao_texto: string | null;
      acao: string; acao_material_item_id: string; acao_material_codigo: string; acao_quantidade: number | null;
      ativo: boolean; motivo: string | null; created_at: string;
    }[]
  >();
  await Promise.all(
    (pecas ?? []).map(async (p) => {
      const { data } = await supabase.rpc("listar_regras_peca", { p_peca_id: p.id, p_somente_ativas: false });
      regrasPorPeca.set(p.id, data ?? []);
    }),
  );

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
          revisoesPorPeca={revisoesPorPeca}
          caracteristicasPorPeca={caracteristicasPorPeca}
          regrasPorPeca={regrasPorPeca}
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
