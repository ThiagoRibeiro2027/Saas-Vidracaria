import { createClient } from "@/lib/supabase/server";
import ExpedicaoSection from "./ExpedicaoSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

// TÓPICO 9 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// dezembro: "saída, campo e homologação"). Separação, conferência,
// romaneio e saída, com suporte a expedição parcial (ADR-002 §4.8) — um
// pedido liberado pode ter várias expedições. Integra com T4/T8 só por
// leitura: item só entra numa expedição se a OP estiver concluída e
// aprovada pela qualidade, respeitando a quantidade já usada por outras
// expedições ativas do mesmo pedido_item.
//
// 2026-10-04: tela larga + paginação server-side nos pedidos liberados
// (nível superior da lista) + linha compacta que expande (mesmo
// tratamento já aplicado nos outros módulos). Expedições/itens/
// ocorrências passam a ser buscados só para os pedidos da página atual.
export default async function ExpedicaoPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; por_pagina?: string }>;
}) {
  const { pagina: paginaParam, por_pagina: porPaginaParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "expedicao", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "expedicao", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Expedição desta empresa." />
      </div>
    );
  }

  const { pagina: paginaPedida, porPagina } = lerParametrosPaginacao({
    pagina: paginaParam,
    por_pagina: porPaginaParam,
  });
  const { count: totalPedidos } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("status", "liberado");
  const { paginacao, from, to } = calcularPaginacao(paginaPedida, porPagina, totalPedidos ?? 0);

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id, numero, pessoa_id, obra_id")
    .eq("status", "liberado")
    .order("created_at", { ascending: false })
    .range(from, to);
  const pedidoIds = (pedidos ?? []).map((p) => p.id);

  const [{ data: pedidoItens }, { data: itens }, { data: pessoas }, { data: obras }, { data: ordens }, { data: expedicoes }] =
    await Promise.all([
      pedidoIds.length > 0
        ? supabase.from("pedido_itens").select("id, pedido_id, item_id, quantidade").in("pedido_id", pedidoIds)
        : Promise.resolve({ data: [] as never[] }),
      supabase.from("itens").select("id, codigo, descricao"),
      supabase.from("pessoas").select("id, nome"),
      supabase.from("obras").select("id, nome"),
      pedidoIds.length > 0
        ? supabase.from("ordens_producao").select("id, pedido_item_id, status, status_qualidade, quantidade_produzida")
        : Promise.resolve({ data: [] as never[] }),
      pedidoIds.length > 0
        ? supabase.from("expedicoes").select("*").in("pedido_id", pedidoIds).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as never[] }),
    ]);

  const expedicaoIds = (expedicoes ?? []).map((e) => e.id);
  const [{ data: expedicaoItens }, { data: ocorrencias }] = await Promise.all([
    expedicaoIds.length > 0
      ? supabase.from("expedicao_itens").select("*").in("expedicao_id", expedicaoIds)
      : Promise.resolve({ data: [] as never[] }),
    expedicaoIds.length > 0
      ? supabase.from("ocorrencias_expedicao").select("*").in("expedicao_id", expedicaoIds).order("registrado_em", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    pedidoItensPorPedido.set(pi.pedido_id, [...(pedidoItensPorPedido.get(pi.pedido_id) ?? []), pi]);
  }

  const ordemPorPedidoItem = new Map((ordens ?? []).map((o) => [o.pedido_item_id, o] as const));

  const expedicoesPorPedido = new Map<string, NonNullable<typeof expedicoes>>();
  for (const exp of expedicoes ?? []) {
    expedicoesPorPedido.set(exp.pedido_id, [...(expedicoesPorPedido.get(exp.pedido_id) ?? []), exp]);
  }

  const statusPorExpedicao = new Map((expedicoes ?? []).map((e) => [e.id, e.status] as const));

  const itensPorExpedicao = new Map<string, NonNullable<typeof expedicaoItens>>();
  const jaUsadoPorPedidoItem = new Map<string, number>();
  for (const item of expedicaoItens ?? []) {
    itensPorExpedicao.set(item.expedicao_id, [...(itensPorExpedicao.get(item.expedicao_id) ?? []), item]);

    if (statusPorExpedicao.get(item.expedicao_id) !== "cancelada") {
      jaUsadoPorPedidoItem.set(
        item.pedido_item_id,
        (jaUsadoPorPedidoItem.get(item.pedido_item_id) ?? 0) + Number(item.quantidade),
      );
    }
  }

  const ocorrenciasPorExpedicao = new Map<string, NonNullable<typeof ocorrencias>>();
  for (const oc of ocorrencias ?? []) {
    ocorrenciasPorExpedicao.set(oc.expedicao_id, [...(ocorrenciasPorExpedicao.get(oc.expedicao_id) ?? []), oc]);
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 9 — Expedição</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Separação, conferência e saída</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: separação, conferência, romaneio e saída, com suporte a expedição
        parcial. Item só pode ser expedido depois de produzido e aprovado pela qualidade.
      </p>

      <div className="mt-6">
        <ExpedicaoSection
          pedidos={pedidos ?? []}
          paginacao={paginacao}
          pedidoItensPorPedido={pedidoItensPorPedido}
          itens={itens ?? []}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          ordemPorPedidoItem={ordemPorPedidoItem}
          expedicoesPorPedido={expedicoesPorPedido}
          itensPorExpedicao={itensPorExpedicao}
          ocorrenciasPorExpedicao={ocorrenciasPorExpedicao}
          jaUsadoPorPedidoItem={jaUsadoPorPedidoItem}
          canManage={!!canManage}
        />
      </div>
    </div>
  );
}
