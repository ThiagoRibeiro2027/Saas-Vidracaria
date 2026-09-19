import { createClient } from "@/lib/supabase/server";
import EngenhariaSection from "./EngenhariaSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

// TÓPICO 5 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// novembro: "o que a fábrica faz"). Só o vínculo pedido_item → medida de
// obra (TÓPICO 16 §7) — sem Produto/Projeto, BOM, revisão, motor de
// regras ou Solicitação de Engenharia. Só pedidos liberados entram aqui
// (ADR-002 §6: Liberação → Engenharia).
export default async function EngenhariaPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "engenharia", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "engenharia", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Engenharia desta empresa." />
      </div>
    );
  }

  const [
    { data: pedidos },
    { data: pedidoItens },
    { data: itensProducao },
    { data: pessoas },
    { data: obras },
    { data: itens },
  ] = await Promise.all([
    supabase.from("pedidos").select("*").eq("status", "liberado").order("created_at", { ascending: false }),
    supabase.from("pedido_itens").select("*"),
    supabase.from("itens_producao").select("*"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
    supabase.from("itens").select("id, codigo, descricao, tipo"),
  ]);

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    const list = pedidoItensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    pedidoItensPorPedido.set(pi.pedido_id, list);
  }

  const itemProducaoPorPedidoItem = new Map(
    (itensProducao ?? []).map((ip) => [ip.pedido_item_id, ip] as const),
  );

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 5 — Engenharia</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Itens a produzir</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: medição em obra por item de pedido liberado, com confirmação antes
        da produção (TÓPICO 16 §7). Sem projeto técnico, BOM ou revisão.
      </p>

      <div className="mt-6">
        <EngenhariaSection
          pedidos={pedidos ?? []}
          pedidoItensPorPedido={pedidoItensPorPedido}
          itemProducaoPorPedidoItem={itemProducaoPorPedidoItem}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          itens={itens ?? []}
          canManage={!!canManage}
        />
      </div>
    </div>
  );
}
