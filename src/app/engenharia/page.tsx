import { createClient } from "@/lib/supabase/server";
import EngenhariaSection from "./EngenhariaSection";
import ItensSection from "./ItensSection";
import PecasSection from "../pecas/PecasSection";
import VisaoGeralSection from "./VisaoGeralSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

type TabSlug = "geral" | "fabricar" | "itens" | "pre-engenharia";

// ADR-013 (Identidade D), Fase 4.
const TAB_TITLE: Record<TabSlug, string> = {
  geral: "Visão geral",
  fabricar: "Itens a fabricar",
  itens: "Cadastro de itens",
  "pre-engenharia": "Pré-engenharia",
};

// TÓPICO 5 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// novembro: "o que a fábrica faz"): vínculo pedido_item → medida de obra
// (TÓPICO 16 §7). Ampliado pelas Fases F/G/H do plano de evolução da BOM
// leve (23/09/2026, ADR-002 §4.5 v2.8): características configuráveis
// por pedido_item, simulação/geração da BOM sugerida pelo motor de
// regras, e aprovação da BOM definitiva que Suprimentos passa a
// consumir. Sem Produto/Projeto, biblioteca técnica ou Solicitação de
// Engenharia — isso segue fora do MVP. Só pedidos liberados entram aqui
// (ADR-002 §6: Liberação → Engenharia).
//
// 2026-10-04: três rotinas que viviam em telas separadas (Engenharia,
// Peças Fabricadas e o botão Itens dentro de Cadastros) viraram abas
// desta mesma página — "pré-engenharia" é como a empresa já identifica
// o cadastro das peças configuráveis, e o cadastro de itens é insumo
// direto da composição dessas peças, então faz sentido ficar junto.
//
// 2026-10-04 (2): mesmo tratamento de layout já aplicado em Orçamentos
// (Comercial) — tela larga, lista paginada no servidor e detalhe/edição
// em modal em vez de tudo empilhado na tela. Como as 3 abas carregam os
// dados sob demanda (só a aba ativa busca algo), todas usam os mesmos
// nomes de parâmetro de paginação (`pagina`/`por_pagina`) sem colidir —
// trocar de aba é navegação cheia (href sem querystring), que já limpa
// a paginação da aba anterior.
export default async function EngenhariaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; pagina?: string; por_pagina?: string }>;
}) {
  const { tab, pagina: paginaParam, por_pagina: porPaginaParam } = await searchParams;
  const supabase = await createClient();

  const [
    { data: canViewFabricar },
    { data: canManageFabricar },
    { data: canViewItens },
    { data: canManageItens },
    { data: canViewPecas },
    { data: canManagePecas },
  ] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "engenharia", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "engenharia", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "itens", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "itens", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "pecas", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "pecas", p_action: "manage" }),
  ]);

  if (!canViewFabricar && !canViewItens && !canViewPecas) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Engenharia desta empresa." />
      </div>
    );
  }

  const availableTabs: { slug: TabSlug; label: string }[] = [
    { slug: "geral", label: "Visão geral" },
    ...(canViewFabricar ? [{ slug: "fabricar" as const, label: "Itens a fabricar" }] : []),
    ...(canViewItens ? [{ slug: "itens" as const, label: "Cadastro de itens" }] : []),
    ...(canViewPecas ? [{ slug: "pre-engenharia" as const, label: "Pré-engenharia" }] : []),
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === tab) ? (tab as TabSlug) : "geral";

  const { pagina: paginaPedida, porPagina } = lerParametrosPaginacao({
    pagina: paginaParam,
    por_pagina: porPaginaParam,
  });

  // Visão geral — contagens leves (head:true), sem nenhuma consulta pesada
  // nova. Só busca quando a aba está ativa, mesmo padrão lazy-por-aba já
  // usado nas outras 3 abas desta rota.
  const [
    { count: pedidosAguardandoCount },
    { count: itensAtivosCount },
    { count: pecasCount },
    { count: itensDimensionalCount },
  ] =
    activeTab === "geral"
      ? await Promise.all([
          supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "liberado"),
          supabase.from("itens").select("id", { count: "exact", head: true }).eq("situacao", "ativo"),
          supabase.from("pecas").select("id", { count: "exact", head: true }),
          supabase.from("itens").select("id", { count: "exact", head: true }).not("dimensao_tipo", "is", null),
        ])
      : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];

  return (
    <>
      <PageHeader breadcrumb={["Engenharia"]} title={TAB_TITLE[activeTab]} />
      <div className="mx-auto max-w-7xl p-6">
      <p className="text-sm text-text">
        Itens a fabricar (medição em obra e BOM do pedido liberado), cadastro de itens (produtos e
        materiais) e pré-engenharia (peças configuráveis: composição, características e regras do
        configurador).
      </p>

      <div className="mt-6">
        {activeTab === "geral" && (
          <VisaoGeralSection
            indicadores={{
              pedidosAguardandoFabricacao: pedidosAguardandoCount ?? 0,
              itensAtivos: itensAtivosCount ?? 0,
              pecasConfiguraveis: pecasCount ?? 0,
              itensComControleDimensional: itensDimensionalCount ?? 0,
            }}
          />
        )}
        {activeTab === "fabricar" && canViewFabricar && (
          <FabricarTab supabase={supabase} pagina={paginaPedida} porPagina={porPagina} canManage={!!canManageFabricar} />
        )}
        {activeTab === "itens" && canViewItens && (
          <ItensTab supabase={supabase} pagina={paginaPedida} porPagina={porPagina} canManage={!!canManageItens} />
        )}
        {activeTab === "pre-engenharia" && canViewPecas && (
          <PreEngenhariaTab supabase={supabase} pagina={paginaPedida} porPagina={porPagina} canManage={!!canManagePecas} />
        )}
      </div>
      </div>
    </>
  );
}

type Supabase = Awaited<ReturnType<typeof createClient>>;
type TabProps = { supabase: Supabase; pagina: number; porPagina: number; canManage: boolean };

async function FabricarTab({ supabase, pagina, porPagina, canManage }: TabProps) {
  const { count: totalPedidos } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("status", "liberado");
  const { paginacao, from, to } = calcularPaginacao(pagina, porPagina, totalPedidos ?? 0);

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("*")
    .eq("status", "liberado")
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);
  const pedidoIds = (pedidos ?? []).map((p) => p.id);

  const [{ data: pedidoItens }, { data: pessoas }, { data: obras }, { data: itens }, { data: pecas }] =
    await Promise.all([
      pedidoIds.length > 0
        ? supabase.from("pedido_itens").select("*").in("pedido_id", pedidoIds)
        : Promise.resolve({ data: [] as never[] }),
      supabase.from("pessoas").select("id, nome"),
      supabase.from("obras").select("id, nome"),
      supabase.from("itens").select("id, codigo, descricao, tipo"),
      supabase.from("pecas").select("id, item_id"),
    ]);

  const pedidoItensPorPedido = new Map<string, typeof pedidoItens>();
  for (const pi of pedidoItens ?? []) {
    const list = pedidoItensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    pedidoItensPorPedido.set(pi.pedido_id, list);
  }

  const pedidoItemIds = (pedidoItens ?? []).map((pi) => pi.id);
  const { data: itensProducao } =
    pedidoItemIds.length > 0
      ? await supabase.from("itens_producao").select("*").in("pedido_item_id", pedidoItemIds)
      : { data: [] as never[] };
  const itemProducaoPorPedidoItem = new Map(
    (itensProducao ?? []).map((ip) => [ip.pedido_item_id, ip] as const),
  );

  // Fase F (Peças/Configurador) — pedido_item cujo item é uma peça
  // configurável ganha a lista de características + valor já informado
  // (se houver). N chamadas sobre os pedido_itens já buscados, mesmo
  // padrão de Promise.all já usado em producao/page.tsx.
  const pecaIdPorItemId = new Map((pecas ?? []).map((p) => [p.item_id, p.id]));
  const caracteristicasPorPedidoItem = new Map<
    string,
    { peca_caracteristica_id: string; nome: string; tipo: string; unidade: string | null; obrigatoria: boolean; valor_numero: number | null; valor_texto: string | null }[]
  >();
  await Promise.all(
    (pedidoItens ?? [])
      .filter((pi) => pecaIdPorItemId.has(pi.item_id))
      .map(async (pi) => {
        const { data } = await supabase.rpc("listar_valores_caracteristicas_pedido_item", { p_pedido_item_id: pi.id });
        if (data && data.length > 0) caracteristicasPorPedidoItem.set(pi.id, data);
      }),
  );

  // Fase H — BOM sugerida/definitiva por pedido_item (gerada pelo motor
  // de regras, Fase G, e achatada pela hierarquia, Fase E). N chamadas
  // sobre os pedido_itens já buscados, mesmo padrão de Promise.all já
  // usado em producao/page.tsx.
  const bomPorPedidoItem = new Map<
    string,
    {
      pedido_item_bom_id: string; status: string; aprovado_por: string | null; aprovado_em: string | null;
      pedido_item_bom_item_id: string | null; material_item_id: string | null; material_codigo: string | null;
      material_descricao: string | null; quantidade_por_unidade: number | null; origem: string | null;
    }[]
  >();
  await Promise.all(
    (pedidoItens ?? [])
      .filter((pi) => pecaIdPorItemId.has(pi.item_id))
      .map(async (pi) => {
        const { data } = await supabase.rpc("listar_bom_pedido_item", { p_pedido_item_id: pi.id });
        if (data && data.length > 0) bomPorPedidoItem.set(pi.id, data);
      }),
  );

  return (
    <EngenhariaSection
      pedidos={pedidos ?? []}
      paginacao={paginacao}
      pedidoItensPorPedido={pedidoItensPorPedido as Map<string, NonNullable<typeof pedidoItens>>}
      itemProducaoPorPedidoItem={itemProducaoPorPedidoItem}
      pessoas={pessoas ?? []}
      obras={obras ?? []}
      itens={itens ?? []}
      caracteristicasPorPedidoItem={caracteristicasPorPedidoItem}
      bomPorPedidoItem={bomPorPedidoItem}
      pecaIdPorItemId={pecaIdPorItemId}
      canManage={canManage}
    />
  );
}

async function ItensTab({ supabase, pagina, porPagina, canManage }: TabProps) {
  const { count: totalItens } = await supabase.from("itens").select("id", { count: "exact", head: true });
  const { paginacao, from, to } = calcularPaginacao(pagina, porPagina, totalItens ?? 0);
  const { data: itens } = await supabase.from("itens").select("*").order("codigo").range(from, to);
  return <ItensSection rows={itens ?? []} paginacao={paginacao} canManage={canManage} />;
}

async function PreEngenhariaTab({ supabase, pagina, porPagina, canManage }: TabProps) {
  const { count: totalPecas } = await supabase.from("pecas").select("id", { count: "exact", head: true });
  const { paginacao, from, to } = calcularPaginacao(pagina, porPagina, totalPecas ?? 0);

  const [{ data: pecas }, { data: itens }] = await Promise.all([
    supabase.from("pecas").select("*").order("created_at", { ascending: false }).order("id").range(from, to),
    supabase
      .from("itens")
      .select("id, codigo, descricao, tipo, unidade_principal")
      .eq("situacao", "ativo")
      .order("codigo"),
  ]);
  const pecaIds = (pecas ?? []).map((p) => p.id);

  const { data: composicao } =
    pecaIds.length > 0
      ? await supabase.from("peca_composicao").select("*").in("peca_id", pecaIds).order("created_at")
      : { data: [] as never[] };
  const composicaoIds = (composicao ?? []).map((c) => c.id);

  // ADR-012 Fase 2 — comprimentos de barra candidatos por composição.
  const { data: comprimentosBarra } =
    composicaoIds.length > 0
      ? await supabase
          .from("peca_composicao_comprimentos_barra")
          .select("*")
          .in("peca_composicao_id", composicaoIds)
          .order("comprimento_metros")
      : { data: [] as never[] };

  const comprimentosPorComposicao = new Map<string, { id: string; item_id: string; comprimento_metros: number }[]>();
  for (const c of comprimentosBarra ?? []) {
    const list = comprimentosPorComposicao.get(c.peca_composicao_id) ?? [];
    list.push(c);
    comprimentosPorComposicao.set(c.peca_composicao_id, list);
  }

  // TÓPICO 5 Fase E — histórico de revisões por peça (leitura, N chamadas
  // sobre `pecas` já buscadas, mesmo padrão de Promise.all já usado em
  // producao/page.tsx para recursos/capacidade).
  const revisoesPorPeca = new Map<string, { revisao: number; motivo: string | null; created_at: string }[]>();
  await Promise.all(
    (pecas ?? []).map(async (p) => {
      const { data } = await supabase.rpc("listar_revisoes_peca", { p_peca_id: p.id });
      revisoesPorPeca.set(p.id, data ?? []);
    }),
  );

  // TÓPICO 5 Fase F — características configuráveis por peça.
  const caracteristicasPorPeca = new Map<
    string,
    {
      id: string; nome: string; tipo: string; unidade: string | null; opcoes: string[] | null;
      obrigatoria: boolean; papel_dimensional: "largura" | "altura" | null; template_id: string | null;
    }[]
  >();
  await Promise.all(
    (pecas ?? []).map(async (p) => {
      const { data } = await supabase.rpc("listar_caracteristicas_peca", { p_peca_id: p.id });
      caracteristicasPorPeca.set(p.id, data ?? []);
    }),
  );

  // TÓPICO 5 Fase G — regras (condição→ação) do motor básico por peça.
  const regrasPorPeca = new Map<
    string,
    {
      id: string; versao: number; substitui_regra_id: string | null;
      caracteristica_id: string; caracteristica_nome: string; operador: string;
      valor_comparacao_numero: number | null; valor_comparacao_texto: string | null;
      acao: string; acao_material_item_id: string; acao_material_codigo: string; acao_quantidade: number | null;
      ativo: boolean; motivo: string | null; created_at: string;
    }[]
  >();
  await Promise.all(
    (pecas ?? []).map(async (p) => {
      const { data } = await supabase.rpc("listar_regras_peca", { p_peca_id: p.id, p_somente_ativas: false });
      regrasPorPeca.set(p.id, data ?? []);
    }),
  );

  // Catálogo de variáveis configuráveis (2026-10-04) — categorias/templates
  // são da empresa inteira (não paginados junto com as peças); só o vínculo
  // peça↔categoria é escopado às peças desta página.
  const [{ data: variavelCategorias }, { data: variavelTemplates }] = await Promise.all([
    supabase.from("variavel_categorias").select("id, nome").order("nome"),
    supabase.from("variavel_templates").select("*").eq("ativo", true).order("nome"),
  ]);
  const { data: pecaCategoriasData } =
    pecaIds.length > 0
      ? await supabase.from("peca_categorias").select("peca_id, categoria_id").in("peca_id", pecaIds)
      : { data: [] as never[] };
  const categoriasPorPeca = new Map<string, string[]>();
  for (const pc of pecaCategoriasData ?? []) {
    const list = categoriasPorPeca.get(pc.peca_id) ?? [];
    list.push(pc.categoria_id);
    categoriasPorPeca.set(pc.peca_id, list);
  }

  return (
    <PecasSection
      pecas={pecas ?? []}
      paginacao={paginacao}
      composicao={composicao ?? []}
      itens={itens ?? []}
      revisoesPorPeca={revisoesPorPeca}
      caracteristicasPorPeca={caracteristicasPorPeca}
      regrasPorPeca={regrasPorPeca}
      comprimentosPorComposicao={comprimentosPorComposicao}
      variavelCategorias={variavelCategorias ?? []}
      variavelTemplates={variavelTemplates ?? []}
      categoriasPorPeca={categoriasPorPeca}
      canManage={canManage}
    />
  );
}
