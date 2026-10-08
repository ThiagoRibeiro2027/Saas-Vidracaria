import { createClient } from "@/lib/supabase/server";
import EstoqueSection from "./EstoqueSection";
import VisaoGeralSection from "./VisaoGeralSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

type TabSlug = "geral" | "saldo" | "reserva" | "sobra" | "dimensional";

// TÓPICO 6 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// novembro: "o que a fábrica faz"). Só saldo, reserva para o pedido,
// consumo e registro de sobra — sem localização, lote/serial, peça física
// individual, motor de compatibilidade de sobra ou inventário. Saldo é
// escalar (quantidade na unidade do item, não peça física).
//
// 2026-10-04: tela larga + aba "Visão geral" nova + paginação server-side
// em Saldo (catálogo de itens) e Reserva (pedidos liberados), lazy por
// aba. `itens` continua um lookup leve sempre buscado (usado nos
// dropdowns de Sobra/Dimensional, não só no Saldo) — a versão paginada é
// separada, só pro Saldo exibir. Peças dimensionais (Fase 2 ADR-011)
// continuam buscadas inteiras — são agrupadas por item, e o número de
// itens com controle dimensional tende a ser pequeno; não há paginação
// real aí nesta etapa, só o tratamento de linha compacta.
export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    sd_pagina?: string;
    sd_por_pagina?: string;
    rs_pagina?: string;
    rs_por_pagina?: string;
  }>;
}) {
  const { tab, sd_pagina: sdPaginaParam, sd_por_pagina: sdPorPaginaParam, rs_pagina: rsPaginaParam, rs_por_pagina: rsPorPaginaParam } =
    await searchParams;
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "estoque", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "estoque", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Estoque desta empresa." />
      </div>
    );
  }

  const availableTabs: { slug: TabSlug; label: string }[] = [
    { slug: "geral", label: "Visão geral" },
    { slug: "saldo", label: "Saldo por item" },
    { slug: "reserva", label: "Reserva para pedidos" },
    ...(canManage ? [{ slug: "sobra" as const, label: "Registrar sobra" }] : []),
    { slug: "dimensional", label: "Peças dimensionais" },
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === tab) ? (tab as TabSlug) : "geral";

  // Lookup leve e sempre buscado — usado em Sobra (dropdown), Dimensional
  // (filtro + conversor) e para resolver nomes em Reserva. Colunas
  // completas porque Dimensional precisa de dimensao_tipo/peso.
  const { data: itens } = await supabase
    .from("itens")
    .select("id, codigo, descricao, tipo, unidade_principal, dimensao_tipo, peso_por_unidade_dimensao")
    .order("codigo");

  // Visão geral — contagens leves (head:true), só com a aba ativa.
  const [
    { count: itensCount },
    { count: pecasDisponiveisCount },
    { count: pedidosLiberadosCount },
    { count: reservasAtivasCount },
  ] =
    activeTab === "geral"
      ? await Promise.all([
          supabase.from("itens").select("id", { count: "exact", head: true }),
          supabase.from("itens_pecas_dimensionais").select("id", { count: "exact", head: true }).eq("situacao", "disponivel"),
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "liberado"),
          supabase.from("estoque_reservas").select("id", { count: "exact", head: true }).eq("status", "reservado"),
        ])
      : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];

  // Saldo — catálogo de itens paginado, só com a aba ativa.
  const { pagina: sdPaginaPedida, porPagina: sdPorPagina } = lerParametrosPaginacao({
    pagina: sdPaginaParam,
    por_pagina: sdPorPaginaParam,
  });
  const { count: totalItens } = activeTab === "saldo" ? await supabase.from("itens").select("id", { count: "exact", head: true }) : { count: 0 };
  const { paginacao: sdPaginacao, from: sdFrom, to: sdTo } = calcularPaginacao(sdPaginaPedida, sdPorPagina, totalItens ?? 0);
  const { data: itensSaldoPagina } =
    activeTab === "saldo"
      ? await supabase
          .from("itens")
          .select("id, codigo, descricao, tipo, unidade_principal, dimensao_tipo, peso_por_unidade_dimensao")
          .order("codigo")
          .range(sdFrom, sdTo)
      : { data: [] as never[] };
  const itensSaldoIds = (itensSaldoPagina ?? []).map((i) => i.id);
  const { data: saldosPagina } =
    itensSaldoIds.length > 0 ? await supabase.from("estoque_saldos").select("*").in("item_id", itensSaldoIds) : { data: [] as never[] };
  const saldoPorItem = new Map((saldosPagina ?? []).map((s) => [s.item_id, s] as const));

  // Reserva — pedidos liberados paginados, só com a aba ativa.
  const { pagina: rsPaginaPedida, porPagina: rsPorPagina } = lerParametrosPaginacao({
    pagina: rsPaginaParam,
    por_pagina: rsPorPaginaParam,
  });
  const { count: totalPedidosReserva } =
    activeTab === "reserva" ? await supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "liberado") : { count: 0 };
  const { paginacao: rsPaginacao, from: rsFrom, to: rsTo } = calcularPaginacao(rsPaginaPedida, rsPorPagina, totalPedidosReserva ?? 0);
  const { data: pedidos } =
    activeTab === "reserva"
      ? await supabase.from("pedidos").select("*").eq("status", "liberado").order("created_at", { ascending: false }).range(rsFrom, rsTo)
      : { data: [] as never[] };
  const pedidoIds = (pedidos ?? []).map((p) => p.id);

  const [{ data: pedidoItens }, { data: reservas }, { data: pessoas }, { data: obras }] = await Promise.all([
    pedidoIds.length > 0 ? supabase.from("pedido_itens").select("*").in("pedido_id", pedidoIds) : Promise.resolve({ data: [] as never[] }),
    pedidoIds.length > 0 ? supabase.from("estoque_reservas").select("*").in("pedido_id", pedidoIds) : Promise.resolve({ data: [] as never[] }),
    activeTab === "reserva" ? supabase.from("pessoas").select("id, nome") : Promise.resolve({ data: [] as never[] }),
    activeTab === "reserva" ? supabase.from("obras").select("id, nome") : Promise.resolve({ data: [] as never[] }),
  ]);

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    pedidoItensPorPedido.set(pi.pedido_id, [...(pedidoItensPorPedido.get(pi.pedido_id) ?? []), pi]);
  }

  // Reserva "ativa" (status='reservado') é a única relevante para decidir
  // se a tela mostra Reservar/Liberar/Consumir; reservas liberadas/
  // consumidas ficam só no histórico (activity_logs / estoque_movimentacoes).
  const reservaAtivaPorPedidoItem = new Map(
    (reservas ?? []).filter((r) => r.status === "reservado").map((r) => [r.pedido_item_id, r] as const),
  );

  // Dimensional — peças físicas, buscadas inteiras só com a aba ativa (ver
  // nota no topo do arquivo sobre o porquê de não paginar aqui).
  const { data: pecasDimensionais } =
    activeTab === "dimensional"
      ? await supabase
          .from("itens_pecas_dimensionais")
          .select("id, item_id, identificador, quantidade_original, quantidade_disponivel, situacao, observacao, created_at")
          .order("created_at", { ascending: false })
      : { data: [] as never[] };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 6 — Estoque</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Saldo, reservas e sobras</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: saldo por item, reserva para o pedido (com reserva parcial quando
        falta disponível), consumo e registro de sobra. Sem localização, lote/serial ou
        inventário.
      </p>

      <div className="mt-6">
        {activeTab === "geral" && (
          <VisaoGeralSection
            indicadores={{
              itens: itensCount ?? 0,
              pecasDimensionaisDisponiveis: pecasDisponiveisCount ?? 0,
              pedidosLiberados: pedidosLiberadosCount ?? 0,
              reservasAtivas: reservasAtivasCount ?? 0,
            }}
          />
        )}

        <EstoqueSection
          activeTab={activeTab}
          itens={itens ?? []}
          itensSaldoPagina={itensSaldoPagina ?? []}
          sdPaginacao={sdPaginacao}
          saldoPorItem={saldoPorItem}
          pedidos={pedidos ?? []}
          rsPaginacao={rsPaginacao}
          pedidoItensPorPedido={pedidoItensPorPedido}
          reservaAtivaPorPedidoItem={reservaAtivaPorPedidoItem}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          pecasDimensionais={pecasDimensionais ?? []}
          canManage={!!canManage}
        />
      </div>
    </div>
  );
}
