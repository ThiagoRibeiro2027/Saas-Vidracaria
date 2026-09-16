import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import InstalacaoSection from "./InstalacaoSection";

// TÓPICO 16 — lado ESCRITÓRIO do recorte mínimo do M1. A execução em campo
// (iniciar/registrar execução, concluir, dano, ocorrência, aceite) já tem
// tela própria em /campo (PWA offline, ADR-008) — esta tela cobre o que
// falta: gestão de equipes, agendamento da instalação (criar_instalacao),
// montagem dos itens antes da execução (só o que T9/Expedição já entregou,
// líquido do que outras instalações ativas do mesmo item já reservaram),
// cancelamento e a decisão (aprovar/rejeitar) sobre solicitação de nova
// fabricação por dano em obra (TÓPICO 16 §8) — permissão própria
// (instalacao.decidir_dano), separada de quem executa ou agenda.
export default async function InstalacaoPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }, { data: canDecidirDano }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "instalacao", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "instalacao", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "instalacao", p_action: "decidir_dano" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar o módulo Instalação desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: pedidos },
    { data: pedidoItens },
    { data: itens },
    { data: pessoas },
    { data: obras },
    { data: profiles },
    { data: equipes },
    { data: equipeMembros },
    { data: instalacoes },
    { data: instalacaoItens },
    { data: expedicoes },
    { data: expedicaoItens },
    { data: ocorrencias },
    { data: danos },
    { data: solicitacoes },
  ] = await Promise.all([
    supabase.from("pedidos").select("id, numero, pessoa_id, obra_id").eq("status", "liberado").order("created_at", { ascending: false }),
    supabase.from("pedido_itens").select("id, pedido_id, item_id, quantidade"),
    supabase.from("itens").select("id, codigo, descricao"),
    supabase.from("pessoas").select("id, nome"),
    supabase.from("obras").select("id, nome"),
    supabase.from("profiles").select("id, display_name").order("display_name"),
    supabase.from("equipes_instalacao").select("*").order("nome"),
    supabase.from("equipe_membros").select("*"),
    supabase.from("instalacoes").select("*").order("created_at", { ascending: false }),
    supabase.from("instalacao_itens").select("*"),
    supabase.from("expedicoes").select("id, status"),
    supabase.from("expedicao_itens").select("expedicao_id, pedido_item_id, quantidade_entregue"),
    supabase.from("ocorrencias_instalacao").select("*").order("registrado_em", { ascending: true }),
    supabase.from("danos_instalacao").select("*").order("registrado_em", { ascending: true }),
    supabase.from("solicitacoes_nova_fabricacao").select("*").order("solicitado_em", { ascending: true }),
  ]);

  const pedidoItensPorPedido = new Map<string, NonNullable<typeof pedidoItens>>();
  for (const pi of pedidoItens ?? []) {
    const list = pedidoItensPorPedido.get(pi.pedido_id) ?? [];
    list.push(pi);
    pedidoItensPorPedido.set(pi.pedido_id, list);
  }

  const equipeMembrosPorEquipe = new Map<string, NonNullable<typeof equipeMembros>>();
  for (const m of equipeMembros ?? []) {
    const list = equipeMembrosPorEquipe.get(m.equipe_id) ?? [];
    list.push(m);
    equipeMembrosPorEquipe.set(m.equipe_id, list);
  }

  const instalacoesPorPedido = new Map<string, NonNullable<typeof instalacoes>>();
  for (const inst of instalacoes ?? []) {
    const list = instalacoesPorPedido.get(inst.pedido_id) ?? [];
    list.push(inst);
    instalacoesPorPedido.set(inst.pedido_id, list);
  }

  const itensPorInstalacao = new Map<string, NonNullable<typeof instalacaoItens>>();
  const jaUsadoInstalacaoPorPedidoItem = new Map<string, number>();
  const statusPorInstalacao = new Map((instalacoes ?? []).map((i) => [i.id, i.status] as const));
  for (const item of instalacaoItens ?? []) {
    const list = itensPorInstalacao.get(item.instalacao_id) ?? [];
    list.push(item);
    itensPorInstalacao.set(item.instalacao_id, list);

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
      entreguePorPedidoItem.set(
        ei.pedido_item_id,
        (entreguePorPedidoItem.get(ei.pedido_item_id) ?? 0) + Number(ei.quantidade_entregue),
      );
    }
  }

  const ocorrenciasPorInstalacao = new Map<string, NonNullable<typeof ocorrencias>>();
  for (const oc of ocorrencias ?? []) {
    const list = ocorrenciasPorInstalacao.get(oc.instalacao_id) ?? [];
    list.push(oc);
    ocorrenciasPorInstalacao.set(oc.instalacao_id, list);
  }

  const danosPorInstalacaoItem = new Map<string, NonNullable<typeof danos>>();
  for (const d of danos ?? []) {
    const list = danosPorInstalacaoItem.get(d.instalacao_item_id) ?? [];
    list.push(d);
    danosPorInstalacaoItem.set(d.instalacao_item_id, list);
  }

  const solicitacoesPendentesPorDano = new Map(
    (solicitacoes ?? []).filter((s) => s.status === "pendente").map((s) => [s.dano_id, s] as const),
  );

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 16 — Instalação (escritório)</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Equipes, agenda e nova fabricação</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo do M1: equipes, agendamento e montagem dos itens de instalação, e a
          decisão sobre solicitação de nova fabricação por dano. A execução em campo (início,
          apontamento, conclusão, ocorrência, dano, aceite) fica na PWA de{" "}
          <Link href="/campo" style={{ color: "#1f5d57" }}>
            Instalação — Campo
          </Link>
          .
        </p>

        <InstalacaoSection
          pedidos={pedidos ?? []}
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
          danosPorInstalacaoItem={danosPorInstalacaoItem}
          solicitacoesPendentesPorDano={solicitacoesPendentesPorDano}
          canManage={!!canManage}
          canDecidirDano={!!canDecidirDano}
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
