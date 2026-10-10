import { createClient } from "@/lib/supabase/server";
import FinanceiroSection from "./FinanceiroSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

type TabSlug = "geral" | "receber" | "contas" | "alcada" | "confirm" | "pagar" | "cobranca" | "mov";

// ADR-013 (Identidade D), Fase 4.
const TAB_TITLE: Record<TabSlug, string> = {
  geral: "Visão geral",
  receber: "Títulos a receber",
  contas: "Contas bancárias",
  alcada: "Alçada",
  confirm: "Confirmações",
  pagar: "Títulos a pagar",
  cobranca: "Cobranças",
  mov: "Movimentação",
};

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
// 2026-10-04: as 7 seções (antes sempre empilhadas na mesma tela) viram
// abas — "Visão geral" é nova, com indicadores somados a partir dos
// dados já lidos (sem nenhuma consulta pesada extra). Só a aba ativa
// busca sua lista paginada; as listas "em aberto" (usadas como opção em
// formulários de outras abas — gerar cobrança, conciliar) são buscadas
// à parte, inteiras e sem paginação — um título em aberto não some do
// formulário só porque caiu numa página diferente da lista principal.
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    tr_pagina?: string;
    tr_por_pagina?: string;
    tp_pagina?: string;
    tp_por_pagina?: string;
    cb_pagina?: string;
    cb_por_pagina?: string;
    mv_pagina?: string;
    mv_por_pagina?: string;
    tr_q?: string;
    tr_ordenar?: string;
    tr_status?: string;
    tp_q?: string;
    tp_ordenar?: string;
    tp_status?: string;
    cb_q?: string;
    cb_ordenar?: string;
    cb_status?: string;
    mv_q?: string;
    mv_ordenar?: string;
    mv_conciliado?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // 2026-10-11: busca/ordenação/filtro nas 4 listas paginadas (prefixo de
  // parâmetro próprio por lista, mesmo padrão já usado pra paginação).
  const TR_ORDENAVEIS = ["numero", "vencimento", "status"] as const;
  const TP_ORDENAVEIS = ["numero", "vencimento", "status"] as const;
  const CB_ORDENAVEIS = ["numero", "vencimento", "status"] as const;
  const MV_ORDENAVEIS = ["data_movimento", "valor"] as const;
  const TITULO_STATUS_VALORES = ["aberto", "parcial", "pago", "cancelado"] as const;
  const COBRANCA_STATUS_VALORES = ["gerada", "paga", "vencida", "cancelada"] as const;

  function lerOrdenacao(valor: string | undefined, permitidas: readonly string[]) {
    const [campo, direcao] = valor?.split(":") ?? [null, null];
    return campo && permitidas.includes(campo) ? { campo, ascending: direcao === "asc" } : null;
  }

  const trBusca = params.tr_q?.trim() || null;
  const trStatus = (TITULO_STATUS_VALORES as readonly string[]).includes(params.tr_status ?? "") ? params.tr_status! : null;
  const trOrdenacao = lerOrdenacao(params.tr_ordenar, TR_ORDENAVEIS);

  const tpBusca = params.tp_q?.trim() || null;
  const tpStatus = (TITULO_STATUS_VALORES as readonly string[]).includes(params.tp_status ?? "") ? params.tp_status! : null;
  const tpOrdenacao = lerOrdenacao(params.tp_ordenar, TP_ORDENAVEIS);

  const cbBusca = params.cb_q?.trim() || null;
  const cbStatus = (COBRANCA_STATUS_VALORES as readonly string[]).includes(params.cb_status ?? "") ? params.cb_status! : null;
  const cbOrdenacao = lerOrdenacao(params.cb_ordenar, CB_ORDENAVEIS);

  const mvBusca = params.mv_q?.trim() || null;
  const mvConciliado = params.mv_conciliado === "sim" ? true : params.mv_conciliado === "nao" ? false : null;
  const mvOrdenacao = lerOrdenacao(params.mv_ordenar, MV_ORDENAVEIS);

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

  const availableTabs: { slug: TabSlug; label: string }[] = [
    { slug: "geral", label: "Visão geral" },
    { slug: "receber", label: "Títulos a receber" },
    { slug: "contas", label: "Contas bancárias" },
    { slug: "alcada", label: "Alçada" },
    ...(canAprovar ? [{ slug: "confirm" as const, label: "Confirmações" }] : []),
    { slug: "pagar", label: "Títulos a pagar" },
    { slug: "cobranca", label: "Cobranças" },
    { slug: "mov", label: "Movimentação" },
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === params.tab) ? (params.tab as TabSlug) : "geral";

  const { pagina: trPaginaPedida, porPagina: trPorPagina } = lerParametrosPaginacao({ pagina: params.tr_pagina, por_pagina: params.tr_por_pagina });
  const { pagina: tpPaginaPedida, porPagina: tpPorPagina } = lerParametrosPaginacao({ pagina: params.tp_pagina, por_pagina: params.tp_por_pagina });
  const { pagina: cbPaginaPedida, porPagina: cbPorPagina } = lerParametrosPaginacao({ pagina: params.cb_pagina, por_pagina: params.cb_por_pagina });
  const { pagina: mvPaginaPedida, porPagina: mvPorPagina } = lerParametrosPaginacao({ pagina: params.mv_pagina, por_pagina: params.mv_por_pagina });

  // Listas "em aberto" — pequenas por natureza (fecham com o tempo, ao
  // contrário do histórico completo) e usadas como opção em formulários
  // de várias abas (gerar cobrança, conciliar movimentação) e nos
  // cartões da Visão geral. Buscadas inteiras, nunca paginadas.
  const [
    { data: pedidosLiberados },
    { data: pedidoIdsComTituloData },
    { data: pessoas },
    { data: contasBancarias },
    { data: alcadaEtapas },
    { data: aprovacoesPendentes },
    { data: titulosAbertos },
    { data: titulosPagarAbertos },
    { data: cobrancasGeradas },
    { data: roles },
    { count: naoConciliadoCount },
  ] = await Promise.all([
    supabase.from("pedidos").select("id, numero, pessoa_id").eq("status", "liberado"),
    supabase.from("titulos_financeiros").select("pedido_id"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("contas_bancarias").select("*").order("banco"),
    supabase.from("financeiro_alcada_etapas").select("*, roles(name)").eq("processo", "titulo_pagar").order("ordem"),
    supabase
      .from("financeiro_aprovacao_etapas")
      .select("*, roles(name), financeiro_aprovacoes(entidade_id, valor, processo)")
      .eq("status", "pendente")
      .order("ordem"),
    supabase
      .from("titulos_financeiros")
      .select("id, numero, saldo_pendente, vencimento")
      .in("status", ["aberto", "parcial"])
      .order("vencimento"),
    supabase
      .from("titulos_pagar")
      .select("id, numero, saldo_pendente")
      .in("status", ["aberto", "parcial"])
      .order("vencimento"),
    supabase.from("cobrancas").select("id, numero").eq("status", "gerada"),
    supabase.from("roles").select("id, name").is("company_id", null),
    supabase.from("movimentacoes_bancarias").select("id", { count: "exact", head: true }).eq("conciliado", false),
  ]);

  const pedidosComTitulo = new Set((pedidoIdsComTituloData ?? []).map((t) => t.pedido_id));
  const pedidosSemTitulo = (pedidosLiberados ?? []).filter((p) => !pedidosComTitulo.has(p.id));
  const nomePorPedido = new Map((pedidosLiberados ?? []).map((p) => [p.id, p]));
  const nomePorPessoa = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));
  // Aprovação pendente só existe pra título ainda aberto/parcial — o
  // conjunto "em aberto" já cobre todo entidade_id que uma aprovação
  // pendente possa referenciar.
  const numeroPorTituloPagar = new Map((titulosPagarAbertos ?? []).map((t) => [t.id, t.numero]));

  const { data: aprovacoesTituloPagar } = await supabase
    .from("financeiro_aprovacoes")
    .select("entidade_id, status")
    .eq("processo", "titulo_pagar")
    .order("created_at", { ascending: false });

  // financeiro_aprovacoes.entidade_id é genérico (uuid, sem FK) — resolve
  // manualmente pro número do título a pagar aparecer na tela. A primeira
  // ocorrência por título (mais recente, por causa do order acima) é a
  // situação de aprovação vigente.
  const statusAprovacaoPorTitulo = new Map<string, string>();
  for (const a of aprovacoesTituloPagar ?? []) {
    if (!statusAprovacaoPorTitulo.has(a.entidade_id)) statusAprovacaoPorTitulo.set(a.entidade_id, a.status);
  }

  // Só a aba ativa busca a lista paginada — as outras 3 ficam de fora
  // (mesmo padrão já usado em Engenharia/Pré-engenharia).
  let trCountQuery = supabase.from("titulos_financeiros").select("id", { count: "exact", head: true });
  if (trBusca) trCountQuery = trCountQuery.ilike("numero", `%${trBusca}%`);
  if (trStatus) trCountQuery = trCountQuery.eq("status", trStatus);
  const { count: totalTitulos } = activeTab === "receber" ? await trCountQuery : { count: 0 };
  const { paginacao: trPaginacao, from: trFrom, to: trTo } = calcularPaginacao(trPaginaPedida, trPorPagina, totalTitulos ?? 0);
  let trQuery = supabase.from("titulos_financeiros").select("*");
  if (trBusca) trQuery = trQuery.ilike("numero", `%${trBusca}%`);
  if (trStatus) trQuery = trQuery.eq("status", trStatus);
  trQuery = trOrdenacao ? trQuery.order(trOrdenacao.campo, { ascending: trOrdenacao.ascending }) : trQuery.order("vencimento");
  const { data: titulos } = activeTab === "receber" ? await trQuery.range(trFrom, trTo) : { data: [] as never[] };

  let tpCountQuery = supabase.from("titulos_pagar").select("id", { count: "exact", head: true });
  if (tpBusca) tpCountQuery = tpCountQuery.ilike("numero", `%${tpBusca}%`);
  if (tpStatus) tpCountQuery = tpCountQuery.eq("status", tpStatus);
  const { count: totalTitulosPagar } = activeTab === "pagar" ? await tpCountQuery : { count: 0 };
  const { paginacao: tpPaginacao, from: tpFrom, to: tpTo } = calcularPaginacao(tpPaginaPedida, tpPorPagina, totalTitulosPagar ?? 0);
  let tpQuery = supabase.from("titulos_pagar").select("*, pedidos_compra(numero, pessoa_id)");
  if (tpBusca) tpQuery = tpQuery.ilike("numero", `%${tpBusca}%`);
  if (tpStatus) tpQuery = tpQuery.eq("status", tpStatus);
  tpQuery = tpOrdenacao ? tpQuery.order(tpOrdenacao.campo, { ascending: tpOrdenacao.ascending }) : tpQuery.order("vencimento");
  const { data: titulosPagar } = activeTab === "pagar" ? await tpQuery.range(tpFrom, tpTo) : { data: [] as never[] };

  let cbCountQuery = supabase.from("cobrancas").select("id", { count: "exact", head: true });
  if (cbBusca) cbCountQuery = cbCountQuery.ilike("numero", `%${cbBusca}%`);
  if (cbStatus) cbCountQuery = cbCountQuery.eq("status", cbStatus);
  const { count: totalCobrancas } = activeTab === "cobranca" ? await cbCountQuery : { count: 0 };
  const { paginacao: cbPaginacao, from: cbFrom, to: cbTo } = calcularPaginacao(cbPaginaPedida, cbPorPagina, totalCobrancas ?? 0);
  let cbQuery = supabase.from("cobrancas").select("*, titulos_financeiros(numero)");
  if (cbBusca) cbQuery = cbQuery.ilike("numero", `%${cbBusca}%`);
  if (cbStatus) cbQuery = cbQuery.eq("status", cbStatus);
  cbQuery = cbOrdenacao
    ? cbQuery.order(cbOrdenacao.campo, { ascending: cbOrdenacao.ascending })
    : cbQuery.order("created_at", { ascending: false });
  const { data: cobrancas } = activeTab === "cobranca" ? await cbQuery.range(cbFrom, cbTo) : { data: [] as never[] };

  let mvCountQuery = supabase.from("movimentacoes_bancarias").select("id", { count: "exact", head: true });
  if (mvBusca) mvCountQuery = mvCountQuery.ilike("descricao", `%${mvBusca}%`);
  if (mvConciliado !== null) mvCountQuery = mvCountQuery.eq("conciliado", mvConciliado);
  const { count: totalMovimentacoes } = activeTab === "mov" ? await mvCountQuery : { count: 0 };
  const { paginacao: mvPaginacao, from: mvFrom, to: mvTo } = calcularPaginacao(mvPaginaPedida, mvPorPagina, totalMovimentacoes ?? 0);
  let mvQuery = supabase.from("movimentacoes_bancarias").select("*");
  if (mvBusca) mvQuery = mvQuery.ilike("descricao", `%${mvBusca}%`);
  if (mvConciliado !== null) mvQuery = mvQuery.eq("conciliado", mvConciliado);
  mvQuery = mvOrdenacao
    ? mvQuery.order(mvOrdenacao.campo, { ascending: mvOrdenacao.ascending })
    : mvQuery.order("data_movimento", { ascending: false });
  const { data: movimentacoes } = activeTab === "mov" ? await mvQuery.range(mvFrom, mvTo) : { data: [] as never[] };

  return (
    <>
      <PageHeader breadcrumb={["Financeiro"]} title={TAB_TITLE[activeTab]} />
      <div className="mx-auto max-w-7xl p-6">
      <p className="text-sm text-text">
        Títulos a receber (vinculados a pedido) e a pagar (vinculados a pedido de compra), conta
        bancária, alçada de pagamento, cobrança (boleto/PIX) e conciliação manual de movimentação
        bancária. Nenhum provedor bancário real conectado; sem plano de contas ou DRE.
      </p>

      <div className="mt-6">
        <FinanceiroSection
          activeTab={activeTab}
          titulosAbertos={titulosAbertos ?? []}
          titulosPagarAbertos={titulosPagarAbertos ?? []}
          cobrancasGeradas={cobrancasGeradas ?? []}
          naoConciliadoCount={naoConciliadoCount ?? 0}
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
    </>
  );
}
