import { createClient } from "@/lib/supabase/server";
import QualidadeSection from "./QualidadeSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

// TÓPICO 8 — recorte mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0,
// dezembro: "saída, campo e homologação"). Inspeção simples de OP
// concluída (aprovação/reprovação cobrindo a quantidade_produzida
// inteira), retrabalho e reinspeção — sem plano de amostragem, gestão de
// instrumentos ou disposições além de retrabalho. Qualidade é autoridade
// PARALELA à de Produção (status_qualidade nunca altera ordens_producao.
// status).
export default async function QualidadePage() {
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

  const [
    { data: ordens },
    { data: pedidos },
    { data: pedidoItens },
    { data: itens },
    { data: pessoas },
    { data: obras },
    { data: inspecoes },
    { data: naoConformidades },
  ] = await Promise.all([
    supabase.from("ordens_producao").select("*").eq("status", "concluida").order("created_at", { ascending: false }),
    supabase.from("pedidos").select("id, numero, pessoa_id, obra_id"),
    supabase.from("pedido_itens").select("id, pedido_id, item_id"),
    supabase.from("itens").select("id, codigo, descricao"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
    supabase.from("inspecoes_qualidade").select("*").order("inspecionado_em", { ascending: true }),
    supabase.from("nao_conformidades").select("*").order("aberta_em", { ascending: true }),
  ]);

  const inspecoesPorOrdem = new Map<string, NonNullable<typeof inspecoes>>();
  for (const insp of inspecoes ?? []) {
    const list = inspecoesPorOrdem.get(insp.ordem_producao_id) ?? [];
    list.push(insp);
    inspecoesPorOrdem.set(insp.ordem_producao_id, list);
  }

  const ncsPorOrdem = new Map<string, NonNullable<typeof naoConformidades>>();
  for (const nc of naoConformidades ?? []) {
    const list = ncsPorOrdem.get(nc.ordem_producao_id) ?? [];
    list.push(nc);
    ncsPorOrdem.set(nc.ordem_producao_id, list);
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
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 8 — Qualidade</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Inspeção de ordens de produção</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: inspeção simples de OP concluída (aprovação/reprovação cobrindo a
        quantidade produzida), retrabalho e reinspeção. Sem plano de amostragem nem gestão de
        instrumentos.
      </p>

      <div className="mt-6">
        <QualidadeSection
          ordens={ordens ?? []}
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
  );
}
