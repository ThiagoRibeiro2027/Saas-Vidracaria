import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

// TÓPICO 7 — Compras, Fase 9 da ADR-011 (docs/ADR-011 — Compras v1.0.md):
// configuração consolidada (§38 + fechamento). Hub de navegação só —
// nenhum formulário novo. Cada parâmetro das Fases 1-8 já tem sua própria
// tela; esta página só mostra quantos registros existem em cada área e
// linka pra onde configurá-los, sem duplicar mecanismo nenhum.
export default async function ComprasConfiguracoesPage() {
  const supabase = await createClient();

  const { data: canView } = await supabase.rpc("has_permission", { p_resource: "compras", p_action: "view" });

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar as configurações de compras desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { count: fornecedoresCount },
    { count: itemFornecedoresCount },
    { count: materiaisAlternativosCount },
    { count: politicasCount },
    { count: feriadosCount },
    { count: alcadasCount },
    { count: orcamentosCount },
    { count: criteriosCount },
  ] = await Promise.all([
    supabase.from("fornecedor_dados").select("id", { count: "exact", head: true }),
    supabase.from("item_fornecedores").select("id", { count: "exact", head: true }),
    supabase.from("item_materiais_alternativos").select("id", { count: "exact", head: true }).eq("ativo", true),
    supabase.from("politicas_abastecimento").select("id", { count: "exact", head: true }),
    supabase.from("calendario_feriados").select("id", { count: "exact", head: true }),
    supabase.from("compras_alcada_etapas").select("id", { count: "exact", head: true }).eq("ativo", true),
    supabase.from("orcamentos_compra").select("id", { count: "exact", head: true }),
    supabase.from("criterios_avaliacao_fornecedor").select("id", { count: "exact", head: true }),
  ]);

  const areas = [
    { titulo: "Fornecedores e dados comerciais", contagem: fornecedoresCount, unidade: "fornecedor(es) com dados comerciais", href: "/compras" },
    { titulo: "Fornecedor por item", contagem: itemFornecedoresCount, unidade: "vínculo(s) item×fornecedor", href: "/compras" },
    { titulo: "Materiais alternativos", contagem: materiaisAlternativosCount, unidade: "equivalência(s) ativa(s)", href: "/compras" },
    { titulo: "Políticas de abastecimento", contagem: politicasCount, unidade: "política(s) configurada(s)", href: "/compras" },
    { titulo: "Calendário de feriados", contagem: feriadosCount, unidade: "feriado(s) cadastrado(s)", href: "/compras/mapa" },
    { titulo: "Alçada de aprovação", contagem: alcadasCount, unidade: "etapa(s) ativa(s)", href: "/compras/cotacoes" },
    { titulo: "Orçamentos por categoria/período", contagem: orcamentosCount, unidade: "orçamento(s) definido(s)", href: "/compras/orcamento" },
    { titulo: "Critérios de avaliação de fornecedor", contagem: criteriosCount, unidade: "critério(s) com peso configurado (default: 20% cada)", href: "/compras/fornecedores" },
  ];

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 7 — Compras (Fase 9 da ADR-011)</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Configurações do módulo de Compras</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Painel de navegação — cada parâmetro já tem sua própria tela de edição; aqui só um resumo
          de quanto está configurado em cada área. <Link href="/compras/dashboard">← Voltar para o Dashboard</Link>
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
          {areas.map((a) => (
            <Link key={a.titulo} href={a.href} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ background: "#fff", border: "1px solid #eef1ef", borderRadius: "8px", padding: "14px", height: "100%" }}>
                <h3 style={{ fontSize: "13px", margin: "0 0 6px", color: "#1f5d57" }}>{a.titulo}</h3>
                <p style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 4px" }}>{a.contagem ?? 0}</p>
                <p style={{ fontSize: "11px", color: "#6b7a75", margin: 0 }}>{a.unidade}</p>
              </div>
            </Link>
          ))}
        </div>
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
