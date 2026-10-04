import { createClient } from "@/lib/supabase/server";
import EngenhariaSection from "./EngenhariaSection";
import ItensSection from "./ItensSection";
import PecasSection from "../pecas/PecasSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

type TabSlug = "fabricar" | "itens" | "pre-engenharia";

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
export default async function EngenhariaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
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
    ...(canViewFabricar ? [{ slug: "fabricar" as const, label: "Itens a fabricar" }] : []),
    ...(canViewItens ? [{ slug: "itens" as const, label: "Cadastro de itens" }] : []),
    ...(canViewPecas ? [{ slug: "pre-engenharia" as const, label: "Pré-engenharia" }] : []),
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === tab) ? (tab as TabSlug) : availableTabs[0].slug;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 5 — Engenharia</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Engenharia</h1>
      <p className="mt-1 text-sm text-text">
        Itens a fabricar (medição em obra e BOM do pedido liberado), cadastro de itens (produtos e
        materiais) e pré-engenharia (peças configuráveis: composição, características e regras do
        configurador).
      </p>

      <div className="mt-6">
        {activeTab === "fabricar" && canViewFabricar && (
          <FabricarTab supabase={supabase} canManage={!!canManageFabricar} />
        )}
        {activeTab === "itens" && canViewItens && (
          <ItensTab supabase={supabase} canManage={!!canManageItens} />
        )}
        {activeTab === "pre-engenharia" && canViewPecas && (
          <PreEngenhariaTab supabase={supabase} canManage={!!canManagePecas} />
        )}
      </div>
    </div>
  );
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function FabricarTab({ supabase, canManage }: { supabase: Supabase; canManage: boolean }) {
  const [
    { data: pedidos },
    { data: pedidoItens },
    { data: itensProducao },
    { data: pessoas },
    { data: obras },
    { data: itens },
    { data: pecas },
  ] = await Promise.all([
    supabase.from("pedidos").select("*").eq("status", "liberado").order("created_at", { ascending: false }),
    supabase.from("pedido_itens").select("*"),
    supabase.from("itens_producao").select("*"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
    supabase.from("itens").select("id, codigo, descricao, tipo"),
    supabase.from("pecas").select("id, item_id"),
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
      pedidoItensPorPedido={pedidoItensPorPedido}
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

async function ItensTab({ supabase, canManage }: { supabase: Supabase; canManage: boolean }) {
  const { data: itens } = await supabase.from("itens").select("*").order("codigo");
  return <ItensSection rows={itens ?? []} canManage={canManage} />;
}

async function PreEngenhariaTab({ supabase, canManage }: { supabase: Supabase; canManage: boolean }) {
  const [{ data: pecas }, { data: composicao }, { data: itens }, { data: comprimentosBarra }] = await Promise.all([
    supabase.from("pecas").select("*").order("created_at", { ascending: false }),
    supabase.from("peca_composicao").select("*").order("created_at"),
    supabase
      .from("itens")
      .select("id, codigo, descricao, tipo, unidade_principal")
      .eq("situacao", "ativo")
      .order("codigo"),
    // ADR-012 Fase 2 — comprimentos de barra candidatos por composição.
    supabase.from("peca_composicao_comprimentos_barra").select("*").order("comprimento_metros"),
  ]);

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
    { id: string; nome: string; tipo: string; unidade: string | null; opcoes: string[] | null; obrigatoria: boolean; papel_dimensional: "largura" | "altura" | null }[]
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

  return (
    <PecasSection
      pecas={pecas ?? []}
      composicao={composicao ?? []}
      itens={itens ?? []}
      revisoesPorPeca={revisoesPorPeca}
      caracteristicasPorPeca={caracteristicasPorPeca}
      regrasPorPeca={regrasPorPeca}
      comprimentosPorComposicao={comprimentosPorComposicao}
      canManage={canManage}
    />
  );
}
