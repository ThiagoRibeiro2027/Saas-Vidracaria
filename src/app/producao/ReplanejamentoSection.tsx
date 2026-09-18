"use client";

import { sectionTitleStyle, hintStyle, thStyle, tdStyle } from "../configuracoes/styles";

export type EventoReplanejamento = {
  id: string;
  action: string;
  categoria:
    | "cancelamento"
    | "alteracao_engenharia"
    | "quebra_maquina"
    | "manutencao"
    | "alteracao_capacidade"
    | "alteracao_prioridade"
    | "perda_retrabalho";
  entity_type: string;
  entity_id: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  criado_por_nome: string | null;
  criado_em: string;
};

const CATEGORIA_LABEL: Record<EventoReplanejamento["categoria"], string> = {
  cancelamento: "Cancelamento",
  alteracao_engenharia: "Alteração de engenharia",
  quebra_maquina: "Quebra de máquina",
  manutencao: "Manutenção",
  alteracao_capacidade: "Alteração de capacidade",
  alteracao_prioridade: "Alteração de prioridade",
  perda_retrabalho: "Perda / retrabalho",
};

const CATEGORIA_COLOR: Record<EventoReplanejamento["categoria"], string> = {
  cancelamento: "#9b2c2c",
  alteracao_engenharia: "#b7791f",
  quebra_maquina: "#9b2c2c",
  manutencao: "#b7791f",
  alteracao_capacidade: "#b7791f",
  alteracao_prioridade: "#1f5d57",
  perda_retrabalho: "#9b2c2c",
};

export default function ReplanejamentoSection({
  eventos,
  recursoLabelPorId,
  ordemNumeroPorId,
  itemLabelPorPedidoItemId,
}: {
  eventos: EventoReplanejamento[];
  recursoLabelPorId: Map<string, string>;
  ordemNumeroPorId: Map<string, string>;
  itemLabelPorPedidoItemId: Map<string, string>;
}) {
  const referencia = (e: EventoReplanejamento) => {
    if (e.entity_type === "recurso_produtivo") return recursoLabelPorId.get(e.entity_id) ?? "(recurso removido)";
    if (e.entity_type === "ordem_producao") return ordemNumeroPorId.get(e.entity_id) ?? "(OP removida)";
    if (e.entity_type === "pedido_item") return itemLabelPorPedidoItemId.get(e.entity_id) ?? "(item removido)";
    return `${e.entity_type} ${e.entity_id.slice(0, 8)}`;
  };

  return (
    <section>
      <h2 style={sectionTitleStyle}>Replanejamento (TÓPICO 4 §10)</h2>
      <p style={hintStyle}>
        Eventos recentes (últimos 7 dias) que podem exigir reavaliar a programação — cancelamento,
        alteração de engenharia, manutenção/quebra de máquina, alteração de capacidade ou
        prioridade, perda/retrabalho. Sinal passivo pro PCP conferir: abra Sequenciamento (pra
        OP/operação) ou Recursos/Gargalos (pra recurso) — os dois já recalculam a partir do estado
        atual, sem nenhum recálculo automático nem alteração da programação aqui.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
            <th style={thStyle}>Evento</th>
            <th style={thStyle}>Referência</th>
            <th style={thStyle}>Descrição</th>
            <th style={thStyle}>Quem</th>
            <th style={thStyle}>Quando</th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((e) => (
            <tr key={e.id} style={{ borderBottom: "1px solid #f4f6f5", verticalAlign: "top" }}>
              <td style={tdStyle}>
                <span style={{ fontFamily: "monospace", color: CATEGORIA_COLOR[e.categoria] }}>{CATEGORIA_LABEL[e.categoria]}</span>
              </td>
              <td style={tdStyle}>{referencia(e)}</td>
              <td style={tdStyle}>{e.description ?? "—"}</td>
              <td style={tdStyle}>{e.criado_por_nome ?? "—"}</td>
              <td style={tdStyle}>{new Date(e.criado_em).toLocaleString("pt-BR")}</td>
            </tr>
          ))}
          {eventos.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={5}>
                <span style={{ color: "#6b7a75" }}>Nenhum evento de replanejamento nos últimos dias.</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
