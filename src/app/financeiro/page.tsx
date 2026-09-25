import { createClient } from "@/lib/supabase/server";
import FinanceiroSection from "./FinanceiroSection";

// TÓPICO 11 — Financeiro, recorte mínimo do MVP (ADR-002 §4.14, que
// prevalece sobre a seção 34 do prompt completo do tópico — ver cabeçalho
// da migration 20260916030000): só título a receber vinculado a pedido,
// parcelas planejadas, status básico e registro de recebimento.
//
// TÓPICO 13 §6, Fase 5 (ADR-002 §4.14/§4.17, emenda de 25/09/2026): abre
// exatamente contas a pagar, cobrança e conciliação — conta bancária,
// título a pagar (já existia desde ADR-011) com alçada de pagamento,
// cobrança (boleto/PIX) sobre título a receber e conciliação manual de
// movimentação bancária. Nenhum provedor bancário real conectado; sem
// plano de contas, DRE, empréstimos ou comissões.
export default async function FinanceiroPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }, { data: canReceber }, { data: canPagar }, { data: canAprovar }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "receber" }),
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "pagar" }),
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "aprovar" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Financeiro desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: titulos }, { data: pedidosLiberados }, { data: pessoas }] = await Promise.all([
    supabase.from("titulos_financeiros").select("*").order("vencimento"),
    supabase.from("pedidos").select("id, numero, pessoa_id").eq("status", "liberado"),
    supabase.from("pessoas").select("id, nome"),
  ]);

  const pedidosComTitulo = new Set((titulos ?? []).map((t) => t.pedido_id));
  const pedidosSemTitulo = (pedidosLiberados ?? []).filter((p) => !pedidosComTitulo.has(p.id));
  const nomePorPedido = new Map((pedidosLiberados ?? []).map((p) => [p.id, p]));
  const nomePorPessoa = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));

  const [
    { data: contasBancarias },
    { data: titulosPagar },
    { data: alcadaEtapas },
    { data: aprovacoesPendentes },
    { data: cobrancas },
    { data: movimentacoes },
    { data: roles },
  ] = await Promise.all([
    supabase.from("contas_bancarias").select("*").order("banco"),
    supabase.from("titulos_pagar").select("*, pedidos_compra(numero, pessoa_id)").order("vencimento"),
    supabase.from("financeiro_alcada_etapas").select("*, roles(name)").eq("processo", "titulo_pagar").order("ordem"),
    supabase
      .from("financeiro_aprovacao_etapas")
      .select("*, roles(name), financeiro_aprovacoes(entidade_id, valor, processo)")
      .eq("status", "pendente")
      .order("ordem"),
    supabase.from("cobrancas").select("*, titulos_financeiros(numero)").order("created_at", { ascending: false }),
    supabase.from("movimentacoes_bancarias").select("*").order("data_movimento", { ascending: false }),
    supabase.from("roles").select("id, name").is("company_id", null),
  ]);

  const { data: aprovacoesTituloPagar } = await supabase
    .from("financeiro_aprovacoes")
    .select("entidade_id, status")
    .eq("processo", "titulo_pagar")
    .order("created_at", { ascending: false });

  // financeiro_aprovacoes.entidade_id é genérico (uuid, sem FK) — resolve
  // manualmente pro número do título a pagar aparecer na tela. A primeira
  // ocorrência por título (mais recente, por causa do order acima) é a
  // situação de aprovação vigente.
  const numeroPorTituloPagar = new Map((titulosPagar ?? []).map((t) => [t.id, t.numero]));
  const statusAprovacaoPorTitulo = new Map<string, string>();
  for (const a of aprovacoesTituloPagar ?? []) {
    if (!statusAprovacaoPorTitulo.has(a.entidade_id)) statusAprovacaoPorTitulo.set(a.entidade_id, a.status);
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 11 — Financeiro</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Financeiro</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Títulos a receber (vinculados a pedido) e a pagar (vinculados a pedido de compra), conta
          bancária, alçada de pagamento, cobrança (boleto/PIX) e conciliação manual de movimentação
          bancária. Nenhum provedor bancário real conectado; sem plano de contas ou DRE.
        </p>

        <FinanceiroSection
          titulos={titulos ?? []}
          pedidosSemTitulo={pedidosSemTitulo}
          nomePorPedido={nomePorPedido}
          nomePorPessoa={nomePorPessoa}
          contasBancarias={contasBancarias ?? []}
          titulosPagar={titulosPagar ?? []}
          alcadaEtapas={alcadaEtapas ?? []}
          aprovacoesPendentes={aprovacoesPendentes ?? []}
          numeroPorTituloPagar={numeroPorTituloPagar}
          statusAprovacaoPorTitulo={statusAprovacaoPorTitulo}
          cobrancas={cobrancas ?? []}
          movimentacoes={movimentacoes ?? []}
          roles={roles ?? []}
          canManage={!!canManage}
          canReceber={!!canReceber}
          canPagar={!!canPagar}
          canAprovar={!!canAprovar}
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
