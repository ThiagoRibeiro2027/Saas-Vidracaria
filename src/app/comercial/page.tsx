import { createClient } from "@/lib/supabase/server";
import OrcamentosSection from "./OrcamentosSection";

// TÓPICO 10 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// outubro: "entrada do pedido", sequência T2 → T10 → T3). Só orçamento
// simples (cabeçalho + itens + decisão) — sem versionamento, proposta,
// oportunidades/funil ou formação de custo/preço. A conversão real em
// Pedido é do TÓPICO 3, que ainda não existe.
export default async function ComercialPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "orcamentos", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "orcamentos", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Comercial desta empresa.
          </p>
        </div>
      </main>
    );
  }

  // obras/itens vêm SEM filtro de situacao: uma obra/item inativado depois
  // de referenciado por um orçamento ainda precisa aparecer (rótulo + guard
  // de seleção atual no formulário de edição) — o filtro pra "ativo" fica só
  // na hora de montar a lista de opções selecionáveis, dentro da seção.
  const [{ data: orcamentos }, { data: orcamentoItens }, { data: pessoas }, { data: papeis }, { data: obras }, { data: itens }] =
    await Promise.all([
      supabase.from("orcamentos").select("*").order("created_at", { ascending: false }),
      supabase.from("orcamento_itens").select("*"),
      supabase.from("pessoas").select("id, nome").order("nome"),
      supabase.from("pessoa_papeis").select("pessoa_id, papel, ativo"),
      supabase.from("obras").select("id, nome, pessoa_id, situacao").order("nome"),
      supabase.from("itens").select("id, codigo, descricao, unidade_principal, situacao").order("codigo"),
    ]);

  const clienteIds = new Set(
    (papeis ?? []).filter((pp) => pp.papel === "CLIENTE" && pp.ativo).map((pp) => pp.pessoa_id),
  );
  const clientesElegiveis = (pessoas ?? []).filter((p) => clienteIds.has(p.id));

  const itensPorOrcamento = new Map<string, typeof orcamentoItens>();
  for (const oi of orcamentoItens ?? []) {
    const list = itensPorOrcamento.get(oi.orcamento_id) ?? [];
    list.push(oi);
    itensPorOrcamento.set(oi.orcamento_id, list);
  }

  // Mesma fórmula usada por decidir_orcamento() pra checar a alçada
  // (approval_thresholds) — uma única fonte de verdade via RPC, em vez de
  // recalcular o total no client com uma soma que poderia divergir da soma
  // usada pra decidir se a alçada se aplica.
  const totaisEntries = await Promise.all(
    (orcamentos ?? []).map(async (o) => {
      const { data } = await supabase.rpc("orcamento_valor_total", { p_orcamento_id: o.id });
      return [o.id, Number(data ?? 0)] as const;
    }),
  );
  const totais = new Map(totaisEntries);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 10 — Comercial</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Orçamentos</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do M1: orçamento simples com itens e decisão de aprovação, sem tabela de
          preços, descontos ou versionamento.
        </p>

        <OrcamentosSection
          orcamentos={orcamentos ?? []}
          itensPorOrcamento={itensPorOrcamento as Map<string, NonNullable<typeof orcamentoItens>>}
          totais={totais}
          clientesElegiveis={clientesElegiveis}
          todasPessoas={pessoas ?? []}
          obras={obras ?? []}
          itens={itens ?? []}
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
