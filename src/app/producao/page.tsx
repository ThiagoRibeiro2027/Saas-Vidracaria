import { createClient } from "@/lib/supabase/server";
import ProducaoSection, { type ListaCorteRow } from "./ProducaoSection";
import RoteirosSection from "./RoteirosSection";

// TÓPICO 4 — Fase 1 (ADR-002 v2.2, 2026-09-16): OP parcial (um pedido_item
// pode ter várias OPs, desde que a soma não ultrapasse a quantidade do
// item), situação clara (liberada/liberada com restrição/bloqueada) e
// engenharia liberada versionada.
// Fase 2 (2026-09-17): roteiro produtivo configurável por item (§15) e
// acompanhamento por operação (§16) — item sem roteiro ativo gera OP com
// uma única operação genérica "Produção". Ainda sem lote fabril, produção
// paralela/transferência entre recursos ou capacidade/recursos formais —
// isso entra nas fases seguintes do roadmap. Só pedidos liberados entram
// aqui (ADR-002 §6: Liberação → Engenharia → Produção).
export default async function ProducaoPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "producao", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "producao", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Produção desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: pedidos },
    { data: pedidoItens },
    { data: itens },
    { data: pessoas },
    { data: obras },
    { data: ordens },
    { data: engenhariaVersoes },
    { data: opOperacoes },
    { data: roteiros },
    { data: roteiroOperacoes },
  ] = await Promise.all([
    supabase.from("pedidos").select("*").eq("status", "liberado").order("created_at", { ascending: false }),
    supabase.from("pedido_itens").select("*"),
    supabase.from("itens").select("id, codigo, descricao, tipo"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
    supabase.from("ordens_producao").select("*").order("created_at", { ascending: true }),
    supabase.from("engenharia_versoes").select("*").eq("situacao", "liberada"),
    supabase.from("op_operacoes").select("*").order("sequencia", { ascending: true }),
    supabase.from("roteiros_produtivos").select("*").order("created_at", { ascending: true }),
    supabase.from("roteiro_operacoes").select("*").order("sequencia", { ascending: true }),
  ]);

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    const list = pedidoItensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    pedidoItensPorPedido.set(pi.pedido_id, list);
  }

  // TÓPICO 4 §11-12: um pedido_item pode ter várias OPs (produção parcial).
  const ordensPorPedidoItem = new Map<string, NonNullable<typeof ordens>>();
  for (const op of ordens ?? []) {
    const list = ordensPorPedidoItem.get(op.pedido_item_id) ?? [];
    list.push(op);
    ordensPorPedidoItem.set(op.pedido_item_id, list);
  }

  const engenhariaVigentePorPedidoItem = new Map(
    (engenhariaVersoes ?? []).map((v) => [v.pedido_item_id, v] as const),
  );

  // TÓPICO 4 §16: acompanhamento por operação — snapshot de op_operacoes
  // por OP, criado em criar_ordem_producao() a partir do roteiro ativo do
  // item (ou operação única "Produção" quando não há roteiro).
  const opOperacoesPorOrdem = new Map<string, NonNullable<typeof opOperacoes>>();
  for (const o of opOperacoes ?? []) {
    const list = opOperacoesPorOrdem.get(o.ordem_producao_id) ?? [];
    list.push(o);
    opOperacoesPorOrdem.set(o.ordem_producao_id, list);
  }

  // TÓPICO 4 §15: roteiros configurados pela empresa, agrupados por item.
  const operacoesPorRoteiro = new Map<string, NonNullable<typeof roteiroOperacoes>>();
  for (const ro of roteiroOperacoes ?? []) {
    const list = operacoesPorRoteiro.get(ro.roteiro_id) ?? [];
    list.push(ro);
    operacoesPorRoteiro.set(ro.roteiro_id, list);
  }

  // Bloqueio por medida (TÓPICO 16 §7) é por pedido, não por item — resolvido
  // aqui (server) pra decidir se o botão "Criar OP" aparece habilitado.
  const bloqueioPorPedido = new Map<string, boolean>();
  await Promise.all(
    (pedidos ?? []).map(async (p) => {
      const { data } = await supabase.rpc("pedido_bloqueado_por_medicao", { p_pedido_id: p.id });
      bloqueioPorPedido.set(p.id, !!data);
    }),
  );

  // Lista de corte (§54) é função de leitura, não entidade armazenada —
  // resolvida aqui pra cada OP existente e passada pronta, sem round-trip
  // client-side (mesmo padrão zero-JS-extra do resto do módulo).
  const listaCortePorOrdem = new Map<string, ListaCorteRow[]>();
  await Promise.all(
    (ordens ?? []).map(async (o) => {
      const { data } = await supabase.rpc("lista_corte", { p_ordem_producao_id: o.id });
      listaCortePorOrdem.set(o.id, data ?? []);
    }),
  );

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 4 — Produção</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Ordens de produção</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Ordens de produção por item de pedido liberado, com produção parcial (uma ou várias OPs
          por item), engenharia liberada versionada, roteiro produtivo configurável com
          acompanhamento por operação, conclusão e lista de corte. Ainda sem sequenciamento, lote
          fabril, produção paralela/transferência entre recursos ou capacidade/recursos formais.
        </p>

        <ProducaoSection
          pedidos={pedidos ?? []}
          pedidoItensPorPedido={pedidoItensPorPedido}
          itens={itens ?? []}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          ordensPorPedidoItem={ordensPorPedidoItem}
          engenhariaVigentePorPedidoItem={engenhariaVigentePorPedidoItem}
          bloqueioPorPedido={bloqueioPorPedido}
          listaCortePorOrdem={listaCortePorOrdem}
          opOperacoesPorOrdem={opOperacoesPorOrdem}
          canManage={!!canManage}
        />

        <RoteirosSection
          itens={itens ?? []}
          roteiros={roteiros ?? []}
          operacoesPorRoteiro={operacoesPorRoteiro}
          canManage={!!canManage}
        />
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
  background: "#f5f7f5",
  padding: "48px 16px",
} as const;

const cardStyle = {
  background: "#fff",
  padding: "32px",
  borderRadius: "8px",
  width: "960px",
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px -12px rgba(0,0,0,.18)",
} as const;

const eyebrowStyle = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "#1f5d57",
  margin: 0,
} as const;
