import { createClient } from "@/lib/supabase/server";
import PedidosSection from "./PedidosSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

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
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  const { pedido: pedidoInicialId } = await searchParams;
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

  const [{ data: pedidos }, { data: pedidoItens }, { data: pendencias }, { data: orcamentosAprovados }, { data: pessoas }, { data: obras }, { data: itens }] =
    await Promise.all([
      supabase.from("pedidos").select("*").order("created_at", { ascending: false }),
      supabase.from("pedido_itens").select("*"),
      supabase.from("pedido_pendencias").select("*").order("aberta_em", { ascending: false }),
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
  const { data: divergencias } = canManage
    ? await supabase.from("pedido_item_divergencia_preco").select("*").eq("status", "pendente")
    : { data: null };
  const divergenciasPorPedidoItem = new Map((divergencias ?? []).map((d) => [d.pedido_item_id, d]));

  const numeroOrcamentoPorId = new Map((orcamentosAprovados ?? []).map((o) => [o.id, o.numero]));

  const itensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    const list = itensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    itensPorPedido.set(pi.pedido_id, list);
  }

  const pendenciasPorPedido = new Map<string, NonNullable<typeof pendencias>>();
  for (const pd of pendencias ?? []) {
    const list = pendenciasPorPedido.get(pd.pedido_id) ?? [];
    list.push(pd);
    pendenciasPorPedido.set(pd.pedido_id, list);
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 3 — Pedidos</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Pedidos</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: conversão de orçamento aprovado, conferência, pendências e
        liberação. Sem cadastro direto de pedido, importação ou acompanhamento de produção
        (TÓPICO 4).
      </p>

      <div className="mt-6">
        <PedidosSection
          pedidos={pedidos ?? []}
          itensPorPedido={itensPorPedido}
          pendenciasPorPedido={pendenciasPorPedido}
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
  );
}
