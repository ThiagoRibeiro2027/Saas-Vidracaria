import { createClient } from "@/lib/supabase/server";
import EstoqueSection from "./EstoqueSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

type TabSlug = "saldo" | "reserva" | "sobra";

// TÓPICO 6 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// novembro: "o que a fábrica faz"). Só saldo, reserva para o pedido,
// consumo e registro de sobra — sem localização, lote/serial, peça física
// individual, motor de compatibilidade de sobra ou inventário. Saldo é
// escalar (quantidade na unidade do item, não peça física).
export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
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

  const [
    { data: itens },
    { data: saldos },
    { data: pedidos },
    { data: pedidoItens },
    { data: reservas },
    { data: pessoas },
    { data: obras },
  ] = await Promise.all([
    supabase.from("itens").select("id, codigo, descricao, tipo, unidade_principal").order("codigo"),
    supabase.from("estoque_saldos").select("*"),
    supabase.from("pedidos").select("*").eq("status", "liberado").order("created_at", { ascending: false }),
    supabase.from("pedido_itens").select("*"),
    supabase.from("estoque_reservas").select("*"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
  ]);

  const saldoPorItem = new Map((saldos ?? []).map((s) => [s.item_id, s] as const));

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    const list = pedidoItensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    pedidoItensPorPedido.set(pi.pedido_id, list);
  }

  // Reserva "ativa" (status='reservado') é a única relevante para decidir
  // se a tela mostra Reservar/Liberar/Consumir; reservas liberadas/
  // consumidas ficam só no histórico (activity_logs / estoque_movimentacoes).
  const reservaAtivaPorPedidoItem = new Map(
    (reservas ?? []).filter((r) => r.status === "reservado").map((r) => [r.pedido_item_id, r] as const),
  );

  const availableTabs: { slug: TabSlug; label: string }[] = [
    { slug: "saldo", label: "Saldo por item" },
    { slug: "reserva", label: "Reserva para pedidos" },
    ...(canManage ? [{ slug: "sobra" as const, label: "Registrar sobra" }] : []),
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === tab) ? (tab as TabSlug) : "saldo";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 6 — Estoque</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Saldo, reservas e sobras</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: saldo por item, reserva para o pedido (com reserva parcial quando
        falta disponível), consumo e registro de sobra. Sem localização, lote/serial ou
        inventário.
      </p>

      <div className="mt-6">
        <EstoqueSection
          activeTab={activeTab}
          itens={itens ?? []}
          saldoPorItem={saldoPorItem}
          pedidos={pedidos ?? []}
          pedidoItensPorPedido={pedidoItensPorPedido}
          reservaAtivaPorPedidoItem={reservaAtivaPorPedidoItem}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          canManage={!!canManage}
        />
      </div>
    </div>
  );
}
