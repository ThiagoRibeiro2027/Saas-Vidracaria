"use client";

import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";

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

const CATEGORIA_TONE: Record<EventoReplanejamento["categoria"], "warning" | "danger"> = {
  cancelamento: "danger",
  alteracao_engenharia: "warning",
  quebra_maquina: "danger",
  manutencao: "warning",
  alteracao_capacidade: "warning",
  alteracao_prioridade: "warning",
  perda_retrabalho: "danger",
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
      <h2 className="text-sm font-semibold text-text">Replanejamento (TÓPICO 4 §10)</h2>
      <p className="mt-1 text-xs text-text-muted">
        Eventos recentes (últimos 7 dias) que podem exigir reavaliar a programação — cancelamento,
        alteração de engenharia, manutenção/quebra de máquina, alteração de capacidade ou
        prioridade, perda/retrabalho. Sinal passivo pro PCP conferir: abra Sequenciamento (pra
        OP/operação) ou Recursos/Gargalos (pra recurso) — os dois já recalculam a partir do estado
        atual, sem nenhum recálculo automático nem alteração da programação aqui.
      </p>

      <div className="mt-3">
        <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Evento</Th>
              <Th>Referência</Th>
              <Th>Descrição</Th>
              <Th>Quem</Th>
              <Th>Quando</Th>
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {eventos.map((e) => (
              <tr key={e.id} className="align-top">
                <Td>
                  <StatusPill tone={CATEGORIA_TONE[e.categoria]}>{CATEGORIA_LABEL[e.categoria]}</StatusPill>
                </Td>
                <Td>{referencia(e)}</Td>
                <Td>{e.description ?? "—"}</Td>
                <Td>{e.criado_por_nome ?? "—"}</Td>
                <Td>{new Date(e.criado_em).toLocaleString("pt-BR")}</Td>
              </tr>
            ))}
            {eventos.length === 0 && (
              <tr>
                <Td colSpan={5}>
                  <span className="text-text-muted">Nenhum evento de replanejamento nos últimos dias.</span>
                </Td>
              </tr>
            )}
          </tbody>
        </DenseTable>
      </div>
    </section>
  );
}
