import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

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
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar as configurações de compras desta empresa." />
      </div>
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
    <>
      <PageHeader breadcrumb={["Compras"]} title="Configurações" />
      <div className="mx-auto max-w-7xl p-6">
        <p className="text-sm text-text">
          Painel de navegação — cada parâmetro já tem sua própria tela de edição; aqui só um resumo
          de quanto está configurado em cada área. <Link href="/compras/dashboard">← Voltar para o Dashboard</Link>
        </p>

        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {areas.map((a) => (
            <Link key={a.titulo} href={a.href} className="no-underline">
              <Card padding="sm" className="h-full transition-colors hover:border-primary">
                <h3 className="mb-1.5 text-xs font-semibold text-primary">{a.titulo}</h3>
                <p className="mb-1 text-xl font-bold text-text">{a.contagem ?? 0}</p>
                <p className="text-[11px] text-text-muted">{a.unidade}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
