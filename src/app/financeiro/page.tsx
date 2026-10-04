import { createClient } from "@/lib/supabase/server";
import FinanceiroSection from "./FinanceiroSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

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
//
// 2026-10-04: mesmo tratamento de layout já aplicado nos demais módulos
// — tela larga e as 4 listas que crescem sem limite (títulos a receber/
// pagar, cobranças, movimentações) paginadas no servidor, cada uma com
// seu próprio par de parâmetros (a mesma rota tem as 4, sem abas).
// Contas bancárias, alçada e confirmações pendentes continuam sem
// paginação — são configuração/fila operacional, não histórico que
// cresce (poucas linhas, usadas também como opção nos formulários).
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{
    tr_pagina?: string;
    tr_por_pagina?: string;
    tp_pagina?: string;
    tp_por_pagina?: string;
    cb_pagina?: string;
    cb_por_pagina?: string;
    mv_pagina?: string;
    mv_por_pagina?: string;
  }>;
}) {
  const params = await searchParams;
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
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Financeiro desta empresa." />
      </div>
    );
  }

  const { pagina: trPaginaPedida, porPagina: trPorPagina } = lerParametrosPaginacao({ pagina: params.tr_pagina, por_pagina: params.tr_por_pagina });
  const { pagina: tpPaginaPedida, porPagina: tpPorPagina } = lerParametrosPaginacao({ pagina: params.tp_pagina, por_pagina: params.tp_por_pagina });
  const { pagina: cbPaginaPedida, porPagina: cbPorPagina } = lerParametrosPaginacao({ pagina: params.cb_pagina, por_pagina: params.cb_por_pagina });
  const { pagina: mvPaginaPedida, porPagina: mvPorPagina } = lerParametrosPaginacao({ pagina: params.mv_pagina, por_pagina: params.mv_por_pagina });

  const [{ count: totalTitulos }, { count: totalTitulosPagar }, { count: totalCobrancas }, { count: totalMovimentacoes }] = await Promise.all([
    supabase.from("titulos_financeiros").select("id", { count: "exact", head: true }),
    supabase.from("titulos_pagar").select("id", { count: "exact", head: true }),
    supabase.from("cobrancas").select("id", { count: "exact", head: true }),
    supabase.from("movimentacoes_bancarias").select("id", { count: "exact", head: true }),
  ]);
  const { paginacao: trPaginacao, from: trFrom, to: trTo } = calcularPaginacao(trPaginaPedida, trPorPagina, totalTitulos ?? 0);
  const { paginacao: tpPaginacao, from: tpFrom, to: tpTo } = calcularPaginacao(tpPaginaPedida, tpPorPagina, totalTitulosPagar ?? 0);
  const { paginacao: cbPaginacao, from: cbFrom, to: cbTo } = calcularPaginacao(cbPaginaPedida, cbPorPagina, totalCobrancas ?? 0);
  const { paginacao: mvPaginacao, from: mvFrom, to: mvTo } = calcularPaginacao(mvPaginaPedida, mvPorPagina, totalMovimentacoes ?? 0);

  const [{ data: titulos }, { data: pedidosLiberados }, { data: pessoas }] = await Promise.all([
    supabase.from("titulos_financeiros").select("*").order("vencimento").range(trFrom, trTo),
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
    supabase.from("titulos_pagar").select("*, pedidos_compra(numero, pessoa_id)").order("vencimento").range(tpFrom, tpTo),
    supabase.from("financeiro_alcada_etapas").select("*, roles(name)").eq("processo", "titulo_pagar").order("ordem"),
    supabase
      .from("financeiro_aprovacao_etapas")
      .select("*, roles(name), financeiro_aprovacoes(entidade_id, valor, processo)")
      .eq("status", "pendente")
      .order("ordem"),
    supabase.from("cobrancas").select("*, titulos_financeiros(numero)").order("created_at", { ascending: false }).range(cbFrom, cbTo),
    supabase.from("movimentacoes_bancarias").select("*").order("data_movimento", { ascending: false }).range(mvFrom, mvTo),
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
    <div className="mx-auto max-w-7xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 11 — Financeiro</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Financeiro</h1>
      <p className="mt-1 text-sm text-text">
        Títulos a receber (vinculados a pedido) e a pagar (vinculados a pedido de compra), conta
        bancária, alçada de pagamento, cobrança (boleto/PIX) e conciliação manual de movimentação
        bancária. Nenhum provedor bancário real conectado; sem plano de contas ou DRE.
      </p>

      <div className="mt-6">
        <FinanceiroSection
          titulos={titulos ?? []}
          trPaginacao={trPaginacao}
          pedidosSemTitulo={pedidosSemTitulo}
          nomePorPedido={nomePorPedido}
          nomePorPessoa={nomePorPessoa}
          contasBancarias={contasBancarias ?? []}
          titulosPagar={titulosPagar ?? []}
          tpPaginacao={tpPaginacao}
          alcadaEtapas={alcadaEtapas ?? []}
          aprovacoesPendentes={aprovacoesPendentes ?? []}
          numeroPorTituloPagar={numeroPorTituloPagar}
          statusAprovacaoPorTitulo={statusAprovacaoPorTitulo}
          cobrancas={cobrancas ?? []}
          cbPaginacao={cbPaginacao}
          movimentacoes={movimentacoes ?? []}
          mvPaginacao={mvPaginacao}
          roles={roles ?? []}
          canManage={!!canManage}
          canReceber={!!canReceber}
          canPagar={!!canPagar}
          canAprovar={!!canAprovar}
        />
      </div>
    </div>
  );
}
