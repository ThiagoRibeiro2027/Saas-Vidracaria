import { createClient } from "@/lib/supabase/server";
import PessoasSection from "./PessoasSection";
import ObrasSection from "./ObrasSection";
import ImportacaoSection from "./ImportacaoSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { ENTIDADES_IMPORTACAO, RECURSOS_IMPORTACAO } from "./importacao-entidades";

type TabSlug = "pessoas" | "obras" | "importacao";

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
    { data: canManageItens },
  ] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "pessoas", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "pessoas", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "obras", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "obras", p_action: "manage" }),
    // itens.manage ainda é consultado aqui — só para decidir se a aba
    // Importação (que inclui a entidade "itens") aparece. O cadastro de
    // itens em si (CRUD) subiu para Engenharia → Cadastro de itens
    // (2026-10-04).
    supabase.rpc("has_permission", { p_resource: "itens", p_action: "manage" }),
  ]);

  if (!canViewPessoas && !canViewObras && !canManageItens) {
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
  const [{ data: pessoas }, { data: papeis }, { data: obras }] = await Promise.all([
    precisaPessoas
      ? supabase.from("pessoas").select("*").order("nome")
      : Promise.resolve({ data: [] }),
    precisaPessoas
      ? supabase.from("pessoa_papeis").select("*")
      : Promise.resolve({ data: [] }),
    canViewObras ? supabase.from("obras").select("*").order("nome") : Promise.resolve({ data: [] }),
  ]);

  // Quais blocos de importação este usuário pode usar. Sem isto a aba
  // oferecia os 24 a qualquer um que a enxergasse, e quem tem só
  // itens.manage descobria que não podia importar RH ao tentar. O gate
  // real continua no banco — aqui é só não oferecer o que vai falhar.
  const permissoesImportacao = await Promise.all(
    RECURSOS_IMPORTACAO.map(async (recurso) => {
      const { data } = await supabase.rpc("has_permission", { p_resource: recurso, p_action: "manage" });
      return [recurso, !!data] as const;
    }),
  );
  const recursosPermitidos = new Set(permissoesImportacao.filter(([, pode]) => pode).map(([r]) => r));
  const entidadesPermitidas = ENTIDADES_IMPORTACAO.filter((e) =>
    recursosPermitidos.has(e.recursoPermissao),
  ).map((e) => e.chave);

  // Histórico de importações (TÓPICO 13 §29, Fase 7). A policy de SELECT
  // de public.importacoes já filtra por empresa E pela permissão do módulo
  // da entidade, então o que voltar aqui é só o que este usuário pode ver —
  // o gate abaixo é só pra não consultar à toa quem nem enxerga a aba.
  const { data: historicoImportacoes } =
    canManagePessoas || canManageItens
      ? await supabase
          .from("importacoes")
          .select(
            "id, entidade, arquivo_nome, total_linhas, novos, atualizados, invalidos, duplicados, origem_importacao_id, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(20)
      : { data: [] };

  const availableTabs: { slug: TabSlug; label: string }[] = [
    ...(canViewPessoas ? [{ slug: "pessoas" as const, label: "Pessoas" }] : []),
    ...(canViewObras ? [{ slug: "obras" as const, label: "Obras" }] : []),
    ...(canManagePessoas || canManageItens ? [{ slug: "importacao" as const, label: "Importação" }] : []),
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === tab) ? (tab as TabSlug) : availableTabs[0].slug;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 2 — Cadastros</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Cadastros da empresa</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: pessoas (clientes e fornecedores são papéis da mesma pessoa) e
        obras. O cadastro de itens está em Engenharia → Cadastro de itens.
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
        {activeTab === "importacao" && (canManagePessoas || canManageItens) && (
          <ImportacaoSection
            historico={historicoImportacoes ?? []}
            entidadesPermitidas={entidadesPermitidas}
          />
        )}
      </div>
    </div>
  );
}
