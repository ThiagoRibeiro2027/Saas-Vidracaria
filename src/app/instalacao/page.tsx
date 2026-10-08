import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import InstalacaoSection, { type DanoExibicao } from "./InstalacaoSection";
import VisaoGeralSection from "./VisaoGeralSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

type TabSlug = "geral" | "equipes" | "agenda" | "danos";

// TÓPICO 16 — lado ESCRITÓRIO do recorte mínimo do M1. A execução em campo
// (iniciar/registrar execução, concluir, dano, ocorrência, aceite) já tem
// tela própria em /campo (PWA offline, ADR-008) — esta tela cobre o que
// falta: gestão de equipes, agendamento da instalação (criar_instalacao),
// montagem dos itens antes da execução (só o que T9/Expedição já entregou,
// líquido do que outras instalações ativas do mesmo item já reservaram),
// cancelamento e a decisão (aprovar/rejeitar) sobre solicitação de nova
// fabricação por dano em obra (TÓPICO 16 §8) — permissão própria
// (instalacao.decidir_dano), separada de quem executa ou agenda.
//
// 2026-10-04: tela larga + aba "Visão geral" nova (indicadores) + paginação
// server-side em Agenda (pedidos liberados) e Danos (solicitações
// pendentes, agora buscadas direto da tabela dona em vez de varrer todas
// as instalações da empresa) + linha compacta que expande em consulta
// primeiro, ações atrás de botão. Equipes continua um catálogo pequeno,
// sempre buscado inteiro (mesmo tratamento de "unidades"/"papéis" em
// outros módulos) — não há necessidade real de paginar.
export default async function InstalacaoPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    ag_pagina?: string;
    ag_por_pagina?: string;
    dn_pagina?: string;
    dn_por_pagina?: string;
  }>;
}) {
  const {
    tab,
    ag_pagina: agPaginaParam,
    ag_por_pagina: agPorPaginaParam,
    dn_pagina: dnPaginaParam,
    dn_por_pagina: dnPorPaginaParam,
  } = await searchParams;
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }, { data: canDecidirDano }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "instalacao", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "instalacao", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "instalacao", p_action: "decidir_dano" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Instalação desta empresa." />
      </div>
    );
  }

  const availableTabs: { slug: TabSlug; label: string }[] = [
    { slug: "geral", label: "Visão geral" },
    { slug: "equipes", label: "Equipes" },
    { slug: "agenda", label: "Agenda de instalação" },
    { slug: "danos", label: "Danos em obra" },
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === tab) ? (tab as TabSlug) : "geral";

  // Lookups pequenos e usados por mais de uma aba — sempre buscados.
  const [{ data: itens }, { data: pessoas }, { data: obras }, { data: profiles }, { data: equipes }, { data: equipeMembros }] =
    await Promise.all([
      supabase.from("itens").select("id, codigo, descricao"),
      supabase.from("pessoas").select("id, nome"),
      supabase.from("obras").select("id, nome"),
      supabase.from("profiles").select("id, display_name").order("display_name"),
      supabase.from("equipes_instalacao").select("*").order("nome"),
      supabase.from("equipe_membros").select("*"),
    ]);

  const equipeMembrosPorEquipe = new Map<string, NonNullable<typeof equipeMembros>>();
  for (const m of equipeMembros ?? []) {
    equipeMembrosPorEquipe.set(m.equipe_id, [...(equipeMembrosPorEquipe.get(m.equipe_id) ?? []), m]);
  }

  // Visão geral — contagens leves (head:true), só quando a aba está ativa.
  const [
    { count: equipesAtivasCount },
    { count: instalacoesAgendadasCount },
    { count: instalacoesEmExecucaoCount },
    { count: danosPendentesCount },
  ] =
    activeTab === "geral"
      ? await Promise.all([
          supabase.from("equipes_instalacao").select("id", { count: "exact", head: true }).eq("ativo", true),
          supabase.from("instalacoes").select("id", { count: "exact", head: true }).eq("status", "agendada"),
          supabase.from("instalacoes").select("id", { count: "exact", head: true }).eq("status", "em_execucao"),
          supabase.from("solicitacoes_nova_fabricacao").select("id", { count: "exact", head: true }).eq("status", "pendente"),
        ])
      : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];

  // Agenda — pedidos liberados, paginados, só buscados com a aba ativa.
  const { pagina: agPaginaPedida, porPagina: agPorPagina } = lerParametrosPaginacao({
    pagina: agPaginaParam,
    por_pagina: agPorPaginaParam,
  });
  const { count: totalPedidos } =
    activeTab === "agenda" ? await supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "liberado") : { count: 0 };
  const { paginacao: agPaginacao, from: agFrom, to: agTo } = calcularPaginacao(agPaginaPedida, agPorPagina, totalPedidos ?? 0);
  const { data: pedidos } =
    activeTab === "agenda"
      ? await supabase
          .from("pedidos")
          .select("id, numero, pessoa_id, obra_id")
          .eq("status", "liberado")
          .order("created_at", { ascending: false })
          .range(agFrom, agTo)
      : { data: [] as never[] };
  const pedidoIds = (pedidos ?? []).map((p) => p.id);

  const [{ data: pedidoItens }, { data: instalacoes }, { data: expedicoes }] = await Promise.all([
    pedidoIds.length > 0
      ? supabase.from("pedido_itens").select("id, pedido_id, item_id, quantidade").in("pedido_id", pedidoIds)
      : Promise.resolve({ data: [] as never[] }),
    pedidoIds.length > 0
      ? supabase.from("instalacoes").select("*").in("pedido_id", pedidoIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    pedidoIds.length > 0
      ? supabase.from("expedicoes").select("id, status, pedido_id").in("pedido_id", pedidoIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    pedidoItensPorPedido.set(pi.pedido_id, [...(pedidoItensPorPedido.get(pi.pedido_id) ?? []), pi]);
  }

  const instalacoesPorPedido = new Map<string, NonNullable<typeof instalacoes>>();
  for (const inst of instalacoes ?? []) {
    instalacoesPorPedido.set(inst.pedido_id, [...(instalacoesPorPedido.get(inst.pedido_id) ?? []), inst]);
  }

  const instalacaoIds = (instalacoes ?? []).map((i) => i.id);
  const expedicaoIds = (expedicoes ?? []).map((e) => e.id);
  const [{ data: instalacaoItens }, { data: ocorrencias }, { data: expedicaoItens }] = await Promise.all([
    instalacaoIds.length > 0 ? supabase.from("instalacao_itens").select("*").in("instalacao_id", instalacaoIds) : Promise.resolve({ data: [] as never[] }),
    instalacaoIds.length > 0
      ? supabase.from("ocorrencias_instalacao").select("*").in("instalacao_id", instalacaoIds).order("registrado_em", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
    expedicaoIds.length > 0
      ? supabase.from("expedicao_itens").select("expedicao_id, pedido_item_id, quantidade_entregue").in("expedicao_id", expedicaoIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const itensPorInstalacao = new Map<string, NonNullable<typeof instalacaoItens>>();
  const jaUsadoInstalacaoPorPedidoItem = new Map<string, number>();
  const statusPorInstalacao = new Map((instalacoes ?? []).map((i) => [i.id, i.status] as const));
  for (const item of instalacaoItens ?? []) {
    itensPorInstalacao.set(item.instalacao_id, [...(itensPorInstalacao.get(item.instalacao_id) ?? []), item]);
    if (statusPorInstalacao.get(item.instalacao_id) !== "cancelada") {
      jaUsadoInstalacaoPorPedidoItem.set(
        item.pedido_item_id,
        (jaUsadoInstalacaoPorPedidoItem.get(item.pedido_item_id) ?? 0) + Number(item.quantidade),
      );
    }
  }

  const statusPorExpedicao = new Map((expedicoes ?? []).map((e) => [e.id, e.status] as const));
  const entreguePorPedidoItem = new Map<string, number>();
  for (const ei of expedicaoItens ?? []) {
    if (statusPorExpedicao.get(ei.expedicao_id) === "expedida") {
      entreguePorPedidoItem.set(ei.pedido_item_id, (entreguePorPedidoItem.get(ei.pedido_item_id) ?? 0) + Number(ei.quantidade_entregue));
    }
  }

  const ocorrenciasPorInstalacao = new Map<string, NonNullable<typeof ocorrencias>>();
  for (const oc of ocorrencias ?? []) {
    ocorrenciasPorInstalacao.set(oc.instalacao_id, [...(ocorrenciasPorInstalacao.get(oc.instalacao_id) ?? []), oc]);
  }

  // Danos — busca direto da tabela dona (solicitacoes_nova_fabricacao
  // pendentes), paginada, em vez de varrer todas as instalações da
  // empresa pra depois filtrar em memória. Só buscado com a aba ativa.
  const { pagina: dnPaginaPedida, porPagina: dnPorPagina } = lerParametrosPaginacao({
    pagina: dnPaginaParam,
    por_pagina: dnPorPaginaParam,
  });
  const { count: totalSolicitacoes } =
    activeTab === "danos"
      ? await supabase.from("solicitacoes_nova_fabricacao").select("id", { count: "exact", head: true }).eq("status", "pendente")
      : { count: 0 };
  const { paginacao: dnPaginacao, from: dnFrom, to: dnTo } = calcularPaginacao(dnPaginaPedida, dnPorPagina, totalSolicitacoes ?? 0);
  const { data: solicitacoesPagina } =
    activeTab === "danos"
      ? await supabase
          .from("solicitacoes_nova_fabricacao")
          .select("*")
          .eq("status", "pendente")
          .order("solicitado_em", { ascending: true })
          .range(dnFrom, dnTo)
      : { data: [] as never[] };

  const danoIdsPagina = (solicitacoesPagina ?? []).map((s) => s.dano_id);
  const { data: danosPagina } =
    danoIdsPagina.length > 0 ? await supabase.from("danos_instalacao").select("*").in("id", danoIdsPagina) : { data: [] as never[] };

  const instalacaoItemIdsPagina = (danosPagina ?? []).map((d) => d.instalacao_item_id);
  const { data: instalacaoItensDanos } =
    instalacaoItemIdsPagina.length > 0
      ? await supabase.from("instalacao_itens").select("id, instalacao_id, pedido_item_id").in("id", instalacaoItemIdsPagina)
      : { data: [] as never[] };

  const instalacaoIdsDanos = [...new Set((instalacaoItensDanos ?? []).map((ii) => ii.instalacao_id))];
  const pedidoItemIdsDanos = (instalacaoItensDanos ?? []).map((ii) => ii.pedido_item_id);
  const [{ data: instalacoesDanos }, { data: pedidoItensDanos }] = await Promise.all([
    instalacaoIdsDanos.length > 0 ? supabase.from("instalacoes").select("id, numero").in("id", instalacaoIdsDanos) : Promise.resolve({ data: [] as never[] }),
    pedidoItemIdsDanos.length > 0 ? supabase.from("pedido_itens").select("id, item_id").in("id", pedidoItemIdsDanos) : Promise.resolve({ data: [] as never[] }),
  ]);
  const itemIdsDanos = (pedidoItensDanos ?? []).map((pi) => pi.item_id);
  const { data: itensDanos } =
    itemIdsDanos.length > 0 ? await supabase.from("itens").select("id, codigo, descricao").in("id", itemIdsDanos) : { data: [] as never[] };

  const instalacaoByIdDanos = new Map((instalacoesDanos ?? []).map((i) => [i.id, i] as const));
  const pedidoItemByIdDanos = new Map((pedidoItensDanos ?? []).map((pi) => [pi.id, pi] as const));
  const itemByIdDanos = new Map((itensDanos ?? []).map((it) => [it.id, it] as const));
  const instalacaoItemByIdDanos = new Map((instalacaoItensDanos ?? []).map((ii) => [ii.id, ii] as const));
  const danoByIdPagina = new Map((danosPagina ?? []).map((d) => [d.id, d] as const));

  const danos: DanoExibicao[] = (solicitacoesPagina ?? []).map((s) => {
    const dano = danoByIdPagina.get(s.dano_id);
    const ii = dano ? instalacaoItemByIdDanos.get(dano.instalacao_item_id) : undefined;
    const inst = ii ? instalacaoByIdDanos.get(ii.instalacao_id) : undefined;
    const pi = ii ? pedidoItemByIdDanos.get(ii.pedido_item_id) : undefined;
    const it = pi ? itemByIdDanos.get(pi.item_id) : undefined;
    return {
      solicitacaoId: s.id,
      instalacaoNumero: inst?.numero ?? "(instalação removida)",
      itemLabel: it ? `${it.codigo} — ${it.descricao}` : "(item removido)",
      quantidade: dano ? Number(dano.quantidade) : 0,
      causa: dano?.causa ?? "—",
      descricao: dano?.descricao ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-7xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 16 — Instalação (escritório)</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Equipes, agenda e nova fabricação</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: equipes, agendamento e montagem dos itens de instalação, e a
        decisão sobre solicitação de nova fabricação por dano. A execução em campo (início,
        apontamento, conclusão, ocorrência, dano, aceite) fica na PWA de{" "}
        <Link href="/campo" className="text-primary">
          Instalação — Campo
        </Link>
        .
      </p>

      <div className="mt-6">
        {activeTab === "geral" && (
          <VisaoGeralSection
            indicadores={{
              equipesAtivas: equipesAtivasCount ?? 0,
              instalacoesAgendadas: instalacoesAgendadasCount ?? 0,
              instalacoesEmExecucao: instalacoesEmExecucaoCount ?? 0,
              danosPendentes: danosPendentesCount ?? 0,
            }}
          />
        )}

        <InstalacaoSection
          activeTab={activeTab}
          pedidos={pedidos ?? []}
          agPaginacao={agPaginacao}
          pedidoItensPorPedido={pedidoItensPorPedido}
          itens={itens ?? []}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          profiles={profiles ?? []}
          equipes={equipes ?? []}
          equipeMembrosPorEquipe={equipeMembrosPorEquipe}
          instalacoesPorPedido={instalacoesPorPedido}
          itensPorInstalacao={itensPorInstalacao}
          entreguePorPedidoItem={entreguePorPedidoItem}
          jaUsadoInstalacaoPorPedidoItem={jaUsadoInstalacaoPorPedidoItem}
          ocorrenciasPorInstalacao={ocorrenciasPorInstalacao}
          danos={danos}
          dnPaginacao={dnPaginacao}
          canManage={!!canManage}
          canDecidirDano={!!canDecidirDano}
        />
      </div>
    </div>
  );
}
