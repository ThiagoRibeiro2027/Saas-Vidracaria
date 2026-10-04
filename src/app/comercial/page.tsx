import { createClient } from "@/lib/supabase/server";
import OrcamentosSection from "./OrcamentosSection";
import OportunidadesSection from "./OportunidadesSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

type TabSlug = "orcamentos" | "oportunidades";

// TÓPICO 10 — orçamento simples (cabeçalho + itens + decisão), recorte
// mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0). Oportunidades e
// funil comercial fixo são ampliação de escopo aprovada em ADR-002 v2.4
// (19/09/2026) — ainda sem versionamento de orçamento, proposta formal ou
// formação de custo. A conversão real em Pedido é do TÓPICO 3.
//
// As três seções viraram abas (?tab=) em vez de empilhadas na mesma tela —
// são destinos independentes (o usuário abre um de cada vez), ao contrário
// de Estoque/Pedidos/Instalação, onde as seções formam uma sequência e
// continuam empilhadas de propósito. Todo o fetch abaixo continua
// acontecendo sempre (não só da aba ativa): Orçamentos depende de
// `oportunidadesAbertas` pro próprio formulário, então não dá pra pular a
// consulta de oportunidades sem quebrar a aba de Orçamentos.
export default async function ComercialPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    pagina?: string;
    por_pagina?: string;
    // Oportunidades pagina com um nome de parâmetro próprio (ver
    // Paginacao.tsx) — a mesma rota tem duas listas paginadas, cada aba com
    // a sua, senão paginar uma bagunçava a página atual da outra.
    op_pagina?: string;
    op_por_pagina?: string;
  }>;
}) {
  const {
    tab,
    pagina: paginaParam,
    por_pagina: porPaginaParam,
    op_pagina: opPaginaParam,
    op_por_pagina: opPorPaginaParam,
  } = await searchParams;
  const supabase = await createClient();

  const [
    { data: canView },
    { data: canManage },
    { data: canViewOportunidades },
    { data: canManageOportunidades },
    { data: canViewPropostas },
    { data: canManagePropostas },
    { data: canManagePedidos },
  ] = await Promise.all([
    supabase.rpc("has_permission", {
      p_resource: "orcamentos",
      p_action: "view",
    }),
    supabase.rpc("has_permission", {
      p_resource: "orcamentos",
      p_action: "manage",
    }),
    supabase.rpc("has_permission", {
      p_resource: "oportunidades",
      p_action: "view",
    }),
    supabase.rpc("has_permission", {
      p_resource: "oportunidades",
      p_action: "manage",
    }),
    supabase.rpc("has_permission", {
      p_resource: "propostas",
      p_action: "view",
    }),
    supabase.rpc("has_permission", {
      p_resource: "propostas",
      p_action: "manage",
    }),
    // "Propostas" e "Conversão de orçamentos" fundidas dentro do orçamento
    // (ver OrcamentosSection.tsx) — a conversão em pedido continua exigindo
    // a permissão do módulo Pedidos, não a de Comercial.
    supabase.rpc("has_permission", {
      p_resource: "pedidos",
      p_action: "manage",
    }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Comercial desta empresa." />
      </div>
    );
  }

  // obras/itens vêm SEM filtro de situacao: uma obra/item inativado depois
  // de referenciado por um orçamento ainda precisa aparecer (rótulo + guard
  // de seleção atual no formulário de edição) — o filtro pra "ativo" fica só
  // na hora de montar a lista de opções selecionáveis, dentro da seção.
  // Orçamentos são paginados no servidor (a lista cresce sem limite): conta
  // o total, ajusta a página pedida ao total real e lê só a faixa certa. Os
  // itens e totais abaixo também são buscados só pros orçamentos da página.
  const { pagina: paginaPedida, porPagina } = lerParametrosPaginacao({
    pagina: paginaParam,
    por_pagina: porPaginaParam,
  });
  const { count: totalOrcamentos } = await supabase
    .from("orcamentos")
    .select("id", { count: "exact", head: true });
  const { paginacao, from, to } = calcularPaginacao(
    paginaPedida,
    porPagina,
    totalOrcamentos ?? 0,
  );
  const { data: orcamentos } = await supabase
    .from("orcamentos")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);
  const orcamentoIds = (orcamentos ?? []).map((o) => o.id);
  const { data: orcamentoItens } =
    orcamentoIds.length > 0
      ? await supabase
          .from("orcamento_itens")
          .select("*")
          .in("orcamento_id", orcamentoIds)
      : { data: [] as never[] };

  // Oportunidades: mesmo padrão de paginação no servidor dos Orçamentos,
  // com parâmetro de URL próprio (op_pagina/op_por_pagina).
  const { pagina: opPaginaPedida, porPagina: opPorPagina } = lerParametrosPaginacao({
    pagina: opPaginaParam,
    por_pagina: opPorPaginaParam,
  });
  const { count: totalOportunidades } = canViewOportunidades
    ? await supabase.from("oportunidades").select("id", { count: "exact", head: true })
    : { count: 0 };
  const {
    paginacao: paginacaoOportunidades,
    from: opFrom,
    to: opTo,
  } = calcularPaginacao(opPaginaPedida, opPorPagina, totalOportunidades ?? 0);

  const [
    { data: pessoas },
    { data: papeis },
    { data: obras },
    { data: itens },
    { data: pecas },
    { data: oportunidadesPagina },
    { data: oportunidadesAbertasData },
    { data: propostas },
    { data: pedidosGerados },
  ] = await Promise.all([
    supabase.from("pessoas").select("id, nome").order("nome"),
    supabase.from("pessoa_papeis").select("pessoa_id, papel, ativo"),
    supabase
      .from("obras")
      .select("id, nome, pessoa_id, situacao")
      .order("nome"),
    supabase
      .from("itens")
      .select("id, codigo, descricao, unidade_principal, situacao")
      .order("codigo"),
    supabase.from("pecas").select("id, item_id"),
    canViewOportunidades
      ? supabase
          .from("oportunidades")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(opFrom, opTo)
      : Promise.resolve({ data: [] as never[] }),
    // Lista completa (não paginada) das oportunidades abertas, pro
    // formulário de orçamento vincular — independe de qual página da aba
    // Oportunidades está sendo exibida. Só os campos que o formulário usa.
    canViewOportunidades
      ? supabase
          .from("oportunidades")
          .select("id, descricao, pessoa_id, estagio")
          .neq("estagio", "ganha")
          .neq("estagio", "perdida")
      : Promise.resolve({ data: [] as never[] }),
    // Proposta e conversão em pedido (abaixo) ficam dentro do próprio
    // orçamento — só dos orçamentos desta página, não da empresa inteira.
    canViewPropostas && orcamentoIds.length > 0
      ? supabase
          .from("propostas")
          .select("*")
          .in("orcamento_id", orcamentoIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    canManagePedidos && orcamentoIds.length > 0
      ? supabase
          .from("pedidos")
          .select("id, numero, orcamento_id")
          .in("orcamento_id", orcamentoIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const clienteIds = new Set(
    (papeis ?? [])
      .filter((pp) => pp.papel === "CLIENTE" && pp.ativo)
      .map((pp) => pp.pessoa_id),
  );
  const clientesElegiveis = (pessoas ?? []).filter((p) => clienteIds.has(p.id));

  const itensPorOrcamento = new Map<string, typeof orcamentoItens>();
  for (const oi of orcamentoItens ?? []) {
    const list = itensPorOrcamento.get(oi.orcamento_id) ?? [];
    list.push(oi);
    itensPorOrcamento.set(oi.orcamento_id, list);
  }

  // TÓPICO 10 §9 — orcamento_item cujo item é uma peça configurável
  // ganha a lista de características + valor já informado (se houver).
  // Mesmo padrão de N chamadas via Promise.all já usado em
  // engenharia/page.tsx pro equivalente do lado do Pedido.
  const pecaIdPorItemId = new Map((pecas ?? []).map((p) => [p.item_id, p.id]));

  // ADR-012 v1.1 — definições das características de cada peça configurável,
  // pro formulário do item mostrar os campos assim que a peça é escolhida
  // (antes de o item existir). Só quem edita orçamento precisa delas.
  const caracteristicasPorItemId = new Map<
    string,
    {
      id: string;
      nome: string;
      tipo: string;
      unidade: string | null;
      opcoes: string[] | null;
      obrigatoria: boolean;
      papel_dimensional: string | null;
    }[]
  >();
  if (canManage) {
    await Promise.all(
      (pecas ?? []).map(async (p) => {
        const { data } = await supabase.rpc(
          "listar_caracteristicas_configurador",
          { p_item_id: p.item_id },
        );
        caracteristicasPorItemId.set(p.item_id, data ?? []);
      }),
    );
  }
  const caracteristicasPorOrcamentoItem = new Map<
    string,
    {
      peca_caracteristica_id: string;
      nome: string;
      tipo: string;
      unidade: string | null;
      obrigatoria: boolean;
      valor_numero: number | null;
      valor_texto: string | null;
    }[]
  >();
  await Promise.all(
    (orcamentoItens ?? [])
      .filter((oi) => pecaIdPorItemId.has(oi.item_id))
      .map(async (oi) => {
        const { data } = await supabase.rpc(
          "listar_valores_caracteristicas_orcamento_item",
          { p_orcamento_item_id: oi.id },
        );
        if (data && data.length > 0)
          caracteristicasPorOrcamentoItem.set(oi.id, data);
      }),
  );

  // Mesma fórmula usada por decidir_orcamento() pra checar a alçada
  // (approval_thresholds) — uma única fonte de verdade via RPC, em vez de
  // recalcular o total no client com uma soma que poderia divergir da soma
  // usada pra decidir se a alçada se aplica.
  const totaisEntries = await Promise.all(
    (orcamentos ?? []).map(async (o) => {
      const { data } = await supabase.rpc("orcamento_valor_total", {
        p_orcamento_id: o.id,
      });
      return [o.id, Number(data ?? 0)] as const;
    }),
  );
  const totais = new Map(totaisEntries);

  const oportunidadesAbertas = oportunidadesAbertasData ?? [];

  // Proposta e pedido viram ações dentro do próprio orçamento (ver
  // OrcamentosSection.tsx) — agrupadas por orçamento aqui, já que cada
  // orçamento aprovado pode ter várias propostas ao longo do tempo (ex.:
  // uma cancelada e outra gerada depois), mas no máximo um pedido.
  const propostasPorOrcamentoId = new Map<string, typeof propostas>();
  for (const p of propostas ?? []) {
    const list = propostasPorOrcamentoId.get(p.orcamento_id) ?? [];
    list.push(p);
    propostasPorOrcamentoId.set(p.orcamento_id, list);
  }
  const pedidoPorOrcamentoId = new Map(
    (pedidosGerados ?? []).map((p) => [p.orcamento_id, p]),
  );

  const availableTabs: { slug: TabSlug; label: string }[] = [
    { slug: "orcamentos", label: "Orçamentos" },
    ...(canViewOportunidades
      ? [{ slug: "oportunidades" as const, label: "Oportunidades" }]
      : []),
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === tab)
    ? (tab as TabSlug)
    : "orcamentos";

  return (
    <div className="mx-auto max-w-7xl p-6">
      <p className="font-mono text-[11px] text-primary">
        TÓPICO 10 — Comercial
      </p>
      <h1 className="mt-1 text-lg font-semibold text-text">Comercial</h1>

      {activeTab === "orcamentos" && (
        <div className="mt-6">
          <OrcamentosSection
            orcamentos={orcamentos ?? []}
            itensPorOrcamento={
              itensPorOrcamento as Map<
                string,
                NonNullable<typeof orcamentoItens>
              >
            }
            totais={totais}
            paginacao={paginacao}
            clientesElegiveis={clientesElegiveis}
            todasPessoas={pessoas ?? []}
            obras={obras ?? []}
            itens={itens ?? []}
            caracteristicasPorItemId={caracteristicasPorItemId}
            caracteristicasPorOrcamentoItem={caracteristicasPorOrcamentoItem}
            oportunidadesAbertas={oportunidadesAbertas}
            canManage={!!canManage}
            propostasPorOrcamentoId={
              propostasPorOrcamentoId as Map<
                string,
                NonNullable<typeof propostas>
              >
            }
            canViewPropostas={!!canViewPropostas}
            canManagePropostas={!!canManagePropostas}
            pedidoPorOrcamentoId={pedidoPorOrcamentoId}
            canManagePedidos={!!canManagePedidos}
          />
        </div>
      )}

      {activeTab === "oportunidades" && canViewOportunidades && (
        <div className="mt-6">
          <OportunidadesSection
            oportunidades={oportunidadesPagina ?? []}
            paginacao={paginacaoOportunidades}
            todasPessoas={pessoas ?? []}
            canManage={!!canManageOportunidades}
          />
        </div>
      )}
    </div>
  );
}
