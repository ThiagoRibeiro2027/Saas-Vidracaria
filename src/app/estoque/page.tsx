import { createClient } from "@/lib/supabase/server";
import EstoqueSection from "./EstoqueSection";
import VisaoGeralSection from "./VisaoGeralSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

type TabSlug = "geral" | "saldo" | "reserva" | "sobra" | "dimensional";

// ADR-013 (Identidade D), Fase 3.
const TAB_TITLE: Record<TabSlug, string> = {
  geral: "Visão geral",
  saldo: "Saldo por item",
  reserva: "Reserva para pedidos",
  sobra: "Registrar sobra",
  dimensional: "Peças dimensionais",
};

// TÓPICO 6 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// novembro: "o que a fábrica faz"). Só saldo, reserva para o pedido,
// consumo e registro de sobra — sem localização, lote/serial, peça física
// individual, motor de compatibilidade de sobra ou inventário. Saldo é
// escalar (quantidade na unidade do item, não peça física).
//
// 2026-10-04: tela larga + aba "Visão geral" nova + paginação server-side
// em Saldo (catálogo de itens) e Reserva (pedidos liberados), lazy por
// aba. `itens` continua um lookup leve sempre buscado (usado nos
// dropdowns de Sobra, não só no Saldo) — a versão paginada é separada,
// só pro Saldo exibir.
//
// 2026-10-10: Dimensional ganhou paginação própria também — a lista que
// de fato cresce sem limite é a de peças físicas registradas (nunca
// deletadas, só passam a "esgotada"), não o catálogo de itens com
// controle dimensional. Por isso pagina-se pelo ITEM (mesmo padrão já
// usado em Qualidade/Reserva: página de itens → busca peças só dos itens
// daquela página) em vez de paginar peça a peça, o que quebraria o
// agrupamento visual por item.
export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    sd_pagina?: string;
    sd_por_pagina?: string;
    rs_pagina?: string;
    rs_por_pagina?: string;
    dm_pagina?: string;
    dm_por_pagina?: string;
    sd_q?: string;
    sd_ordenar?: string;
    sd_tipo?: string;
    rs_q?: string;
    rs_ordenar?: string;
    dm_q?: string;
    dm_ordenar?: string;
    dm_dimensao?: string;
  }>;
}) {
  const {
    tab,
    sd_pagina: sdPaginaParam,
    sd_por_pagina: sdPorPaginaParam,
    rs_pagina: rsPaginaParam,
    rs_por_pagina: rsPorPaginaParam,
    dm_pagina: dmPaginaParam,
    dm_por_pagina: dmPorPaginaParam,
    sd_q: sdQ,
    sd_ordenar: sdOrdenar,
    sd_tipo: sdTipoParam,
    rs_q: rsQ,
    rs_ordenar: rsOrdenar,
    dm_q: dmQ,
    dm_ordenar: dmOrdenar,
    dm_dimensao: dmDimensaoParam,
  } = await searchParams;
  const supabase = await createClient();

  // 2026-10-11: busca/ordenação/filtro nas 3 listas paginadas (prefixo de
  // parâmetro próprio por lista).
  const SD_ORDENAVEIS = ["codigo", "descricao", "tipo"] as const;
  const RS_ORDENAVEIS = ["numero", "created_at"] as const;
  const DM_ORDENAVEIS = ["codigo", "descricao"] as const;

  function lerOrdenacao(valor: string | undefined, permitidas: readonly string[]) {
    const [campo, direcao] = valor?.split(":") ?? [null, null];
    return campo && permitidas.includes(campo) ? { campo, ascending: direcao === "asc" } : null;
  }

  const sdBusca = sdQ?.trim() || null;
  const sdTipo = sdTipoParam?.trim() || null;
  const sdOrdenacao = lerOrdenacao(sdOrdenar, SD_ORDENAVEIS);

  const rsBusca = rsQ?.trim() || null;
  const rsOrdenacao = lerOrdenacao(rsOrdenar, RS_ORDENAVEIS);

  const dmBusca = dmQ?.trim() || null;
  const dmDimensao = dmDimensaoParam === "linear" || dmDimensaoParam === "area" ? dmDimensaoParam : null;
  const dmOrdenacao = lerOrdenacao(dmOrdenar, DM_ORDENAVEIS);

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
  let sdCountQuery = supabase.from("itens").select("id", { count: "exact", head: true });
  if (sdBusca) sdCountQuery = sdCountQuery.or(`codigo.ilike.%${sdBusca}%,descricao.ilike.%${sdBusca}%`);
  if (sdTipo) sdCountQuery = sdCountQuery.eq("tipo", sdTipo);
  const { count: totalItens } = activeTab === "saldo" ? await sdCountQuery : { count: 0 };
  const { paginacao: sdPaginacao, from: sdFrom, to: sdTo } = calcularPaginacao(sdPaginaPedida, sdPorPagina, totalItens ?? 0);
  let sdQuery = supabase
    .from("itens")
    .select("id, codigo, descricao, tipo, unidade_principal, dimensao_tipo, peso_por_unidade_dimensao");
  if (sdBusca) sdQuery = sdQuery.or(`codigo.ilike.%${sdBusca}%,descricao.ilike.%${sdBusca}%`);
  if (sdTipo) sdQuery = sdQuery.eq("tipo", sdTipo);
  sdQuery = sdOrdenacao ? sdQuery.order(sdOrdenacao.campo, { ascending: sdOrdenacao.ascending }) : sdQuery.order("codigo");
  const { data: itensSaldoPagina } = activeTab === "saldo" ? await sdQuery.range(sdFrom, sdTo) : { data: [] as never[] };
  const itensSaldoIds = (itensSaldoPagina ?? []).map((i) => i.id);
  const { data: saldosPagina } =
    itensSaldoIds.length > 0 ? await supabase.from("estoque_saldos").select("*").in("item_id", itensSaldoIds) : { data: [] as never[] };
  const saldoPorItem = new Map((saldosPagina ?? []).map((s) => [s.item_id, s] as const));

  // Reserva — pedidos liberados paginados, só com a aba ativa.
  const { pagina: rsPaginaPedida, porPagina: rsPorPagina } = lerParametrosPaginacao({
    pagina: rsPaginaParam,
    por_pagina: rsPorPaginaParam,
  });
  let rsCountQuery = supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "liberado");
  if (rsBusca) rsCountQuery = rsCountQuery.ilike("numero", `%${rsBusca}%`);
  const { count: totalPedidosReserva } = activeTab === "reserva" ? await rsCountQuery : { count: 0 };
  const { paginacao: rsPaginacao, from: rsFrom, to: rsTo } = calcularPaginacao(rsPaginaPedida, rsPorPagina, totalPedidosReserva ?? 0);
  let rsQuery = supabase.from("pedidos").select("*").eq("status", "liberado");
  if (rsBusca) rsQuery = rsQuery.ilike("numero", `%${rsBusca}%`);
  rsQuery = rsOrdenacao
    ? rsQuery.order(rsOrdenacao.campo, { ascending: rsOrdenacao.ascending })
    : rsQuery.order("created_at", { ascending: false });
  const { data: pedidos } = activeTab === "reserva" ? await rsQuery.range(rsFrom, rsTo) : { data: [] as never[] };
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

  // Dimensional — catálogo de itens com controle dimensional, paginado;
  // peças físicas buscadas só para os itens da página atual (ver nota no
  // topo do arquivo).
  const { pagina: dmPaginaPedida, porPagina: dmPorPagina } = lerParametrosPaginacao({
    pagina: dmPaginaParam,
    por_pagina: dmPorPaginaParam,
  });
  let dmCountQuery = supabase.from("itens").select("id", { count: "exact", head: true }).not("dimensao_tipo", "is", null);
  if (dmBusca) dmCountQuery = dmCountQuery.or(`codigo.ilike.%${dmBusca}%,descricao.ilike.%${dmBusca}%`);
  if (dmDimensao) dmCountQuery = dmCountQuery.eq("dimensao_tipo", dmDimensao);
  const { count: totalItensDimensional } = activeTab === "dimensional" ? await dmCountQuery : { count: 0 };
  const { paginacao: dmPaginacao, from: dmFrom, to: dmTo } = calcularPaginacao(dmPaginaPedida, dmPorPagina, totalItensDimensional ?? 0);
  let dmQuery = supabase
    .from("itens")
    .select("id, codigo, descricao, tipo, unidade_principal, dimensao_tipo, peso_por_unidade_dimensao")
    .not("dimensao_tipo", "is", null);
  if (dmBusca) dmQuery = dmQuery.or(`codigo.ilike.%${dmBusca}%,descricao.ilike.%${dmBusca}%`);
  if (dmDimensao) dmQuery = dmQuery.eq("dimensao_tipo", dmDimensao);
  dmQuery = dmOrdenacao ? dmQuery.order(dmOrdenacao.campo, { ascending: dmOrdenacao.ascending }) : dmQuery.order("codigo");
  const { data: itensDimensionalPagina } = activeTab === "dimensional" ? await dmQuery.range(dmFrom, dmTo) : { data: [] as never[] };
  const itensDimensionalIds = (itensDimensionalPagina ?? []).map((i) => i.id);
  const { data: pecasDimensionais } =
    itensDimensionalIds.length > 0
      ? await supabase
          .from("itens_pecas_dimensionais")
          .select("id, item_id, identificador, quantidade_original, quantidade_disponivel, situacao, observacao, created_at")
          .in("item_id", itensDimensionalIds)
          .order("created_at", { ascending: false })
      : { data: [] as never[] };

  return (
    <>
      <PageHeader breadcrumb={["Estoque"]} title={TAB_TITLE[activeTab]} />
      <div className="mx-auto max-w-7xl p-6">
      <p className="text-sm text-text">
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
          itensDimensionalPagina={itensDimensionalPagina ?? []}
          dmPaginacao={dmPaginacao}
          pecasDimensionais={pecasDimensionais ?? []}
          canManage={!!canManage}
        />
      </div>
      </div>
    </>
  );
}
