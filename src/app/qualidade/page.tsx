import { createClient } from "@/lib/supabase/server";
import QualidadeSection from "./QualidadeSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

// TÓPICO 8 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// dezembro: "saída, campo e homologação"). Inspeção simples de OP
// concluída (aprovação/reprovação cobrindo a quantidade_produzida
// inteira), retrabalho e reinspeção — sem plano de amostragem, gestão de
// instrumentos ou disposições além de retrabalho. Qualidade é autoridade
// PARALELA à de Produção (status_qualidade nunca altera ordens_producao.
// status).
//
// 2026-10-04: tela larga + paginação server-side nas OPs concluídas (lista
// que só cresce — nunca "esvazia") + linha compacta que expande (mesmo
// tratamento já aplicado nos outros módulos). Inspeções/não conformidades
// passam a ser buscadas só para as OPs da página atual, não a tabela
// inteira.
export default async function QualidadePage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; por_pagina?: string }>;
}) {
  const { pagina: paginaParam, por_pagina: porPaginaParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "qualidade", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "qualidade", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Qualidade desta empresa." />
      </div>
    );
  }

  const { pagina: paginaPedida, porPagina } = lerParametrosPaginacao({
    pagina: paginaParam,
    por_pagina: porPaginaParam,
  });
  const { count: totalOrdens } = await supabase
    .from("ordens_producao")
    .select("id", { count: "exact", head: true })
    .eq("status", "concluida");
  const { paginacao, from, to } = calcularPaginacao(paginaPedida, porPagina, totalOrdens ?? 0);

  const [{ data: ordens }, { data: pedidos }, { data: pedidoItens }, { data: itens }, { data: pessoas }, { data: obras }] =
    await Promise.all([
      supabase
        .from("ordens_producao")
        .select("*")
        .eq("status", "concluida")
        .order("created_at", { ascending: false })
        .range(from, to),
      supabase.from("pedidos").select("id, numero, pessoa_id, obra_id"),
      supabase.from("pedido_itens").select("id, pedido_id, item_id"),
      supabase.from("itens").select("id, codigo, descricao"),
      supabase.from("pessoas").select("id, nome"),
      supabase.from("obras").select("id, nome"),
    ]);

  const ordemIds = (ordens ?? []).map((o) => o.id);
  const [{ data: inspecoes }, { data: naoConformidades }] = await Promise.all([
    ordemIds.length > 0
      ? supabase.from("inspecoes_qualidade").select("*").in("ordem_producao_id", ordemIds).order("inspecionado_em", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
    ordemIds.length > 0
      ? supabase.from("nao_conformidades").select("*").in("ordem_producao_id", ordemIds).order("aberta_em", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const inspecoesPorOrdem = new Map<string, NonNullable<typeof inspecoes>>();
  for (const insp of inspecoes ?? []) {
    inspecoesPorOrdem.set(insp.ordem_producao_id, [...(inspecoesPorOrdem.get(insp.ordem_producao_id) ?? []), insp]);
  }

  const ncsPorOrdem = new Map<string, NonNullable<typeof naoConformidades>>();
  for (const nc of naoConformidades ?? []) {
    ncsPorOrdem.set(nc.ordem_producao_id, [...(ncsPorOrdem.get(nc.ordem_producao_id) ?? []), nc]);
  }

  // TÓPICO 4 §41 (Fase 7c) — rótulo de status_qualidade configurado em
  // /producao (producao.manage), exibido aqui só como leitura.
  const { data: rotulosStatus } = await supabase.rpc("rotulos_status_producao");
  const statusQualidadeLabels = new Map(
    ((rotulosStatus as { campo: string; valor_interno: string; rotulo: string }[]) ?? [])
      .filter((r) => r.campo === "status_qualidade")
      .map((r) => [r.valor_interno, r.rotulo] as const),
  );

  return (
    <>
      <PageHeader breadcrumb={["Produção"]} title="Inspeção de ordens de produção" />
      <div className="mx-auto max-w-7xl p-6">
      <p className="text-sm text-text">
        Recorte mínimo do M1: inspeção simples de OP concluída (aprovação/reprovação cobrindo a
        quantidade produzida), retrabalho e reinspeção. Sem plano de amostragem nem gestão de
        instrumentos.
      </p>

      <div className="mt-6">
        <QualidadeSection
          ordens={ordens ?? []}
          paginacao={paginacao}
          pedidos={pedidos ?? []}
          pedidoItens={pedidoItens ?? []}
          itens={itens ?? []}
          pessoas={pessoas ?? []}
          obras={obras ?? []}
          inspecoesPorOrdem={inspecoesPorOrdem}
          ncsPorOrdem={ncsPorOrdem}
          statusQualidadeLabels={statusQualidadeLabels}
          canManage={!!canManage}
        />
      </div>
      </div>
    </>
  );
}
