import { createClient } from "@/lib/supabase/server";
import SuprimentosSection from "./SuprimentosSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

// TÓPICO 7 — Suprimentos e Compras, recorte mínimo do MVP (ADR-002 §4.18,
// que prevalece sobre a menção mais ampla do PLANO DE ENTREGA §6 — ver
// cabeçalho da migration 20260916020000): só registro e acompanhamento de
// necessidade de compra. Sem fornecedor, cotação, pedido de compra ou
// recebimento — a efetivação da compra acontece fora do SaaS neste recorte.
//
// 2026-10-04: tela larga + paginação server-side (lista que cresce a cada
// necessidade identificada). As ações por linha já ficavam atrás de um
// clique (AcoesNecessidade/RegistrarRecebimentoForm) — nada a mudar aí.
//
// 2026-10-11: busca por observação, ordenação por data/quantidade/status
// (allow-list fixa) e filtro por status/origem. Sem busca por item — a
// tabela guarda só item_id, buscar por código/descrição exigiria join,
// fora do escopo deste piloto.
const SUPRIMENTOS_ORDENAVEIS = ["created_at", "quantidade", "status"] as const;
const NECESSIDADE_STATUS_VALORES = ["aberta", "atendida", "cancelada", "recebida"] as const;
const NECESSIDADE_ORIGEM_VALORES = ["manual", "pedido", "producao"] as const;

export default async function SuprimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; por_pagina?: string; q?: string; ordenar?: string; status?: string; origem?: string }>;
}) {
  const { pagina: paginaParam, por_pagina: porPaginaParam, q, ordenar, status: statusParam, origem: origemParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "suprimentos", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "suprimentos", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Suprimentos desta empresa." />
      </div>
    );
  }

  const { pagina: paginaPedida, porPagina } = lerParametrosPaginacao({
    pagina: paginaParam,
    por_pagina: porPaginaParam,
  });

  const termoBusca = q?.trim() || null;
  const status = (NECESSIDADE_STATUS_VALORES as readonly string[]).includes(statusParam ?? "") ? statusParam! : null;
  const origem = (NECESSIDADE_ORIGEM_VALORES as readonly string[]).includes(origemParam ?? "") ? origemParam! : null;
  const [ordenarCampo, ordenarDirecao] = ordenar?.split(":") ?? [null, null];
  const ordenacao =
    ordenarCampo && (SUPRIMENTOS_ORDENAVEIS as readonly string[]).includes(ordenarCampo)
      ? { campo: ordenarCampo, ascending: ordenarDirecao === "asc" }
      : null;

  let countQuery = supabase.from("necessidades_compra").select("id", { count: "exact", head: true });
  if (termoBusca) countQuery = countQuery.ilike("observacoes", `%${termoBusca}%`);
  if (status) countQuery = countQuery.eq("status", status);
  if (origem) countQuery = countQuery.eq("origem", origem);
  const { count: totalNecessidades } = await countQuery;
  const { paginacao, from, to } = calcularPaginacao(paginaPedida, porPagina, totalNecessidades ?? 0);

  let necessidadesQuery = supabase.from("necessidades_compra").select("*");
  if (termoBusca) necessidadesQuery = necessidadesQuery.ilike("observacoes", `%${termoBusca}%`);
  if (status) necessidadesQuery = necessidadesQuery.eq("status", status);
  if (origem) necessidadesQuery = necessidadesQuery.eq("origem", origem);
  necessidadesQuery = ordenacao
    ? necessidadesQuery.order(ordenacao.campo, { ascending: ordenacao.ascending })
    : necessidadesQuery.order("created_at", { ascending: false });

  const [{ data: necessidades }, { data: itens }, { data: pedidos }, { data: ordensProducao }] = await Promise.all([
    necessidadesQuery.range(from, to),
    supabase.from("itens").select("id, codigo, descricao, unidade_principal").eq("situacao", "ativo").order("codigo"),
    supabase.from("pedidos").select("id, numero").eq("status", "liberado").order("numero"),
    supabase.from("ordens_producao").select("id, numero, pedido_id").order("numero"),
  ]);

  return (
    <>
      <PageHeader breadcrumb={["Suprimentos"]} title="Suprimentos e Compras" />
      <div className="mx-auto max-w-7xl p-6">
      <p className="text-sm text-text">
        Recorte mínimo do MVP: registrar necessidade de material e acompanhar até atendida ou
        cancelada. Sem cotação, pedido de compra ou recebimento. Necessidades também podem ser
        geradas automaticamente a partir de um pedido ou ordem de produção com peças cadastradas
        (Fase C, plano de 23/09/2026) — item sem peça associada fica de fora, siga lançando manual.
      </p>

      <div className="mt-6">
        <SuprimentosSection
          rows={necessidades ?? []}
          paginacao={paginacao}
          itens={itens ?? []}
          pedidos={pedidos ?? []}
          ordensProducao={ordensProducao ?? []}
          canManage={!!canManage}
        />
      </div>
      </div>
    </>
  );
}
