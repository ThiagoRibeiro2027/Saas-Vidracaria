import { createClient } from "@/lib/supabase/server";
import PedidosSection from "./PedidosSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

// TÓPICO 3 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// outubro: "entrada do pedido", último item da sequência T2 → T10 → T3).
// Único caminho de criação é converter um orçamento aprovado (TÓPICO 10) —
// sem cadastro direto nem importação neste recorte. Status cobre só até
// "liberado"; em andamento/concluído dependem do TÓPICO 4 (novembro).
//
// A conversão em si (botão "Converter em pedido") deixou de ter tela própria
// aqui — virou uma ação dentro do orçamento aprovado (comercial, ADR-002
// v2.5 — fusão decidida com o usuário em 2026-10-03), que redireciona pra cá
// com `?pedido=<id>` já selecionado.
//
// 2026-10-04: mesmo tratamento de layout já aplicado em Orçamentos e
// Engenharia — tela larga, lista paginada no servidor e detalhe/ações em
// modal em vez de empilhado abaixo da tabela.
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string; pagina?: string; por_pagina?: string }>;
}) {
  const { pedido: pedidoInicialId, pagina: paginaParam, por_pagina: porPaginaParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "pedidos", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "pedidos", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Pedidos desta empresa." />
      </div>
    );
  }

  const { pagina: paginaPedida, porPagina } = lerParametrosPaginacao({
    pagina: paginaParam,
    por_pagina: porPaginaParam,
  });
  const { count: totalPedidos } = await supabase.from("pedidos").select("id", { count: "exact", head: true });
  const { paginacao, from, to } = calcularPaginacao(paginaPedida, porPagina, totalPedidos ?? 0);

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);
  const pedidoIds = (pedidos ?? []).map((p) => p.id);

  const [{ data: pedidoItens }, { data: pendencias }, { data: orcamentosAprovados }, { data: pessoas }, { data: obras }, { data: itens }] =
    await Promise.all([
      pedidoIds.length > 0
        ? supabase.from("pedido_itens").select("*").in("pedido_id", pedidoIds)
        : Promise.resolve({ data: [] as never[] }),
      pedidoIds.length > 0
        ? supabase.from("pedido_pendencias").select("*").in("pedido_id", pedidoIds).order("aberta_em", { ascending: false })
        : Promise.resolve({ data: [] as never[] }),
      // Só pra legenda "Origem" na lista de pedidos (número do orçamento que
      // originou cada um) — a conversão em si não mora mais aqui.
      supabase.from("orcamentos").select("id, numero").eq("status", "aprovado"),
      supabase.from("pessoas").select("id, nome"),
      supabase.from("obras").select("id, nome"),
      supabase.from("itens").select("id, codigo, descricao"),
    ]);

  // ADR-012 Fase 3 — sugestão de atualização de preço quando a BOM
  // definitiva da Engenharia diverge do custo que formou o preço no
  // orçamento. Só pendentes: aplicada/ignorada já foi decidida e não
  // precisa mais aparecer aqui.
  const pedidoItemIds = (pedidoItens ?? []).map((pi) => pi.id);
  const { data: divergencias } =
    canManage && pedidoItemIds.length > 0
      ? await supabase
          .from("pedido_item_divergencia_preco")
          .select("*")
          .eq("status", "pendente")
          .in("pedido_item_id", pedidoItemIds)
      : { data: null };
  const divergenciasPorPedidoItem = new Map((divergencias ?? []).map((d) => [d.pedido_item_id, d]));

  const numeroOrcamentoPorId = new Map((orcamentosAprovados ?? []).map((o) => [o.id, o.numero]));

  const itensPorPedido = new Map<string, typeof pedidoItens>();
  for (const pi of pedidoItens ?? []) {
    const list = itensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    itensPorPedido.set(pi.pedido_id, list);
  }

  const pendenciasPorPedido = new Map<string, typeof pendencias>();
  for (const pd of pendencias ?? []) {
    const list = pendenciasPorPedido.get(pd.pedido_id) ?? [];
    list.push(pd);
    pendenciasPorPedido.set(pd.pedido_id, list);
  }

  return (
    <>
      <PageHeader breadcrumb={["Comercial"]} title="Pedidos" />
      <div className="mx-auto max-w-7xl p-6">
      <p className="text-sm text-text">
        Recorte mínimo do M1: conversão de orçamento aprovado, conferência, pendências e
        liberação. Sem cadastro direto de pedido, importação ou acompanhamento de produção
        (TÓPICO 4).
      </p>

      <div className="mt-6">
        <PedidosSection
          pedidos={pedidos ?? []}
          paginacao={paginacao}
          itensPorPedido={itensPorPedido as Map<string, NonNullable<typeof pedidoItens>>}
          pendenciasPorPedido={pendenciasPorPedido as Map<string, NonNullable<typeof pendencias>>}
          numeroOrcamentoPorId={numeroOrcamentoPorId}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          itens={itens ?? []}
          divergenciasPorPedidoItem={divergenciasPorPedidoItem}
          canManage={!!canManage}
          pedidoInicialId={pedidoInicialId ?? null}
        />
      </div>
      </div>
    </>
  );
}
