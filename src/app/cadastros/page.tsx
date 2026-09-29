import { createClient } from "@/lib/supabase/server";
import PessoasSection from "./PessoasSection";
import ObrasSection from "./ObrasSection";
import ItensSection from "./ItensSection";
import ImportacaoSection from "./ImportacaoSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

type TabSlug = "pessoas" | "obras" | "itens" | "importacao";

// TÓPICO 2 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// outubro: "entrada do pedido"). Pessoa + Papéis (§4-6) em vez de tabelas
// separadas de cliente/fornecedor; Item unificado (§7-10) cobrindo
// produto/material; Obra é registro mínimo (fora do TÓPICO 2 — vem do
// TÓPICO 16/ADR-002 §4.9, dezembro), só o que T3 Pedidos precisa referenciar.
// Cada entidade tem sua própria permissão (pessoas/obras/itens .view/.manage)
// — a seção só aparece pra quem pode vê-la.
export default async function CadastrosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();

  const [
    { data: canViewPessoas },
    { data: canManagePessoas },
    { data: canViewObras },
    { data: canManageObras },
    { data: canViewItens },
    { data: canManageItens },
  ] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "pessoas", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "pessoas", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "obras", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "obras", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "itens", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "itens", p_action: "manage" }),
  ]);

  if (!canViewPessoas && !canViewObras && !canViewItens) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar os cadastros desta empresa." />
      </div>
    );
  }

  // ObrasSection precisa de pessoas + papéis pra montar o <select> de
  // cliente da obra, mesmo quando o papel do usuário só dá obras.view/manage
  // sem pessoas.view — RLS já libera a leitura de pessoas pra qualquer
  // autenticado da empresa (pessoas.view gate é só a exibição da seção
  // Pessoas em si, mais abaixo), então isso não vaza nenhum dado que a
  // policy já não deixasse ler.
  const precisaPessoas = canViewPessoas || canViewObras;
  const [{ data: pessoas }, { data: papeis }, { data: obras }, { data: itens }] = await Promise.all([
    precisaPessoas
      ? supabase.from("pessoas").select("*").order("nome")
      : Promise.resolve({ data: [] }),
    precisaPessoas
      ? supabase.from("pessoa_papeis").select("*")
      : Promise.resolve({ data: [] }),
    canViewObras ? supabase.from("obras").select("*").order("nome") : Promise.resolve({ data: [] }),
    canViewItens ? supabase.from("itens").select("*").order("codigo") : Promise.resolve({ data: [] }),
  ]);

  const availableTabs: { slug: TabSlug; label: string }[] = [
    ...(canViewPessoas ? [{ slug: "pessoas" as const, label: "Pessoas" }] : []),
    ...(canViewObras ? [{ slug: "obras" as const, label: "Obras" }] : []),
    ...(canViewItens ? [{ slug: "itens" as const, label: "Itens" }] : []),
    ...(canManagePessoas || canManageItens ? [{ slug: "importacao" as const, label: "Importação" }] : []),
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === tab) ? (tab as TabSlug) : availableTabs[0].slug;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 2 — Cadastros</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Cadastros da empresa</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: pessoas (clientes e fornecedores são papéis da mesma pessoa),
        obras e itens (produtos e materiais são o mesmo cadastro, diferenciados por tipo).
      </p>

      <div className="mt-6">
        {activeTab === "pessoas" && canViewPessoas && (
          <PessoasSection
            rows={pessoas ?? []}
            papeis={papeis ?? []}
            canManage={!!canManagePessoas}
          />
        )}
        {activeTab === "obras" && canViewObras && (
          <ObrasSection
            rows={obras ?? []}
            todasPessoas={pessoas ?? []}
            clienteIds={
              new Set(
                (papeis ?? [])
                  .filter((pp) => pp.papel === "CLIENTE" && pp.ativo)
                  .map((pp) => pp.pessoa_id),
              )
            }
            canManage={!!canManageObras}
          />
        )}
        {activeTab === "itens" && canViewItens && <ItensSection rows={itens ?? []} canManage={!!canManageItens} />}
        {activeTab === "importacao" && (canManagePessoas || canManageItens) && <ImportacaoSection />}
      </div>
    </div>
  );
}
