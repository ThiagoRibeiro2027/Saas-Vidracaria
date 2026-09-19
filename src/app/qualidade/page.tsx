import { createClient } from "@/lib/supabase/server";
import QualidadeSection from "./QualidadeSection";

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
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Qualidade desta empresa.
          </p>
        </div>
      </main>
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
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 8 — Qualidade</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Inspeção de ordens de produção</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do M1: inspeção simples de OP concluída (aprovação/reprovação cobrindo a
          quantidade produzida), retrabalho e reinspeção. Sem plano de amostragem nem gestão de
          instrumentos.
        </p>

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
