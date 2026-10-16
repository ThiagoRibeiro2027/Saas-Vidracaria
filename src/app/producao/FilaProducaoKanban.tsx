"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatarData } from "@/lib/formato/data";
import { definirPrioridadePedidoAction } from "./actions";

type Estagio = "aguardando_liberacao" | "planejada" | "em_producao" | "expedicao" | "instalacao" | "concluida";

export type FilaProducaoKanbanRow = {
  pedido_id: string;
  pedido_numero: string;
  pessoa_id: string;
  pessoa_nome: string;
  obra_id: string | null;
  obra_nome: string | null;
  previsao_entrega: string | null;
  estagio: Estagio;
  prioridade: number | null;
  total_ops: number;
  ops_concluidas: number;
  tem_op_bloqueada: boolean;
  tem_pendencia: boolean;
  material_separado: boolean;
  producao_iniciada_em: string | null;
};

// Ordem e vocabulário do quadro Kanban — desenho fechado em conversa com o
// usuário, 16/10/2026. "Aguardando liberação" cobre pedidos recebido/em
// conferência/pendente (confirmado pelo cliente, mas ainda dependendo de
// algum processo — ex. engenharia — para liberar a produção). Pedidos
// cancelados nunca chegam aqui (listar_fila_producao_kanban já filtra).
const ESTAGIO_ORDEM: Estagio[] = [
  "aguardando_liberacao",
  "planejada",
  "em_producao",
  "expedicao",
  "instalacao",
  "concluida",
];

const ESTAGIO_LABEL: Record<Estagio, string> = {
  aguardando_liberacao: "Aguardando liberação",
  planejada: "Planejada",
  em_producao: "Em produção",
  expedicao: "Expedição",
  instalacao: "Instalação",
  concluida: "Concluída",
};

const ESTAGIO_DOT: Record<Estagio, string> = {
  aguardando_liberacao: "bg-text-muted",
  planejada: "bg-text-muted",
  em_producao: "bg-primary",
  expedicao: "bg-warning",
  instalacao: "bg-primary",
  concluida: "bg-success",
};

// Arrastar só reordena prioridade dentro da coluna (nunca entre colunas —
// isso evolui sozinho conforme a produção/expedição/instalação avançam de
// verdade). Sem OP ainda (aguardando liberação/planejada sem OP) não tem o
// que reordenar; pedido concluído não tem motivo prático pra reordenar.
function podeArrastar(row: FilaProducaoKanbanRow) {
  return row.total_ops > 0 && row.estagio !== "concluida";
}

export default function FilaProducaoKanban({ pedidos }: { pedidos: FilaProducaoKanbanRow[] }) {
  const [rows, setRows] = useState(pedidos);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const colunas = useMemo(() => {
    const grupos = new Map<Estagio, FilaProducaoKanbanRow[]>();
    ESTAGIO_ORDEM.forEach((e) => grupos.set(e, []));
    rows.forEach((r) => grupos.get(r.estagio)?.push(r));
    return grupos;
  }, [rows]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ativo = rows.find((r) => r.pedido_id === active.id);
    const destino = rows.find((r) => r.pedido_id === over.id);
    if (!ativo || !destino || ativo.estagio !== destino.estagio || !podeArrastar(ativo)) return;

    const colunaAtual = colunas.get(ativo.estagio) ?? [];
    const indiceAntigo = colunaAtual.findIndex((r) => r.pedido_id === active.id);
    const indiceNovo = colunaAtual.findIndex((r) => r.pedido_id === over.id);
    if (indiceAntigo === -1 || indiceNovo === -1) return;

    const reordenada = arrayMove(colunaAtual, indiceAntigo, indiceNovo);
    // Prioridade (1-5) é um campo de nível discreto, não uma posição livre —
    // arrastar "entra no grupo" de quem ficou vizinho na nova posição.
    const vizinho = reordenada[indiceNovo + 1] ?? reordenada[indiceNovo - 1];
    const novaPrioridade = vizinho?.prioridade ?? ativo.prioridade;

    setErro(null);
    setRows((atual) => {
      const outras = atual.filter((r) => r.estagio !== ativo.estagio);
      const atualizada =
        novaPrioridade == null
          ? reordenada
          : reordenada.map((r) => (r.pedido_id === ativo.pedido_id ? { ...r, prioridade: novaPrioridade } : r));
      return [...outras, ...atualizada];
    });

    if (novaPrioridade == null || novaPrioridade === ativo.prioridade) return;

    startTransition(async () => {
      try {
        await definirPrioridadePedidoAction(ativo.pedido_id, novaPrioridade);
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Não foi possível reordenar a prioridade.");
        setRows(pedidos);
      }
    });
  }

  return (
    <div>
      {erro && <p className="mb-2 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{erro}</p>}
      <DndContext
        id="fila-producao-kanban"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ESTAGIO_ORDEM.map((estagio) => {
            const itens = colunas.get(estagio) ?? [];
            return (
              <div key={estagio} className="flex w-64 flex-shrink-0 flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <span className={`h-2 w-2 rounded-full ${ESTAGIO_DOT[estagio]}`} />
                  <span className="text-sm font-medium text-text">{ESTAGIO_LABEL[estagio]}</span>
                  <span className="text-xs text-text-muted">{itens.length}</span>
                </div>
                <SortableContext items={itens.map((i) => i.pedido_id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2">
                    {itens.map((row) => (
                      <CardPedido key={row.pedido_id} row={row} arrastavel={podeArrastar(row)} />
                    ))}
                    {itens.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-text-muted">
                        Nenhum pedido
                      </div>
                    )}
                  </div>
                </SortableContext>
              </div>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}

function CardPedido({ row, arrastavel }: { row: FilaProducaoKanbanRow; arrastavel: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.pedido_id,
    disabled: !arrastavel,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: row.estagio === "concluida" ? 0.75 : isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-text">{row.pedido_numero}</span>
        <div className="flex items-center gap-1.5">
          {row.material_separado && (
            <Lock size={12} className="text-text-muted" aria-label="Material já separado para produção" />
          )}
          {arrastavel && (
            <button
              {...attributes}
              {...listeners}
              type="button"
              style={{ touchAction: "none" }}
              className="cursor-grab text-text-muted hover:text-text"
              aria-label="Arrastar para reordenar prioridade dentro da coluna"
            >
              <GripVertical size={14} />
            </button>
          )}
        </div>
      </div>
      <p className="mt-0.5 text-xs text-text-secondary">{row.pessoa_nome}</p>
      {row.obra_nome && <p className="text-xs text-text-muted">{row.obra_nome}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {row.prioridade != null && (
          <Badge variant={row.prioridade <= 2 ? "warning" : "neutral"}>Prioridade {row.prioridade}</Badge>
        )}
        {row.tem_op_bloqueada && <Badge variant="danger">Bloqueada</Badge>}
        {row.tem_pendencia && <Badge variant="warning">Pendência aberta</Badge>}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
        <span>Previsão {formatarData(row.previsao_entrega)}</span>
        {row.total_ops > 0 && (
          <span>
            {row.ops_concluidas}/{row.total_ops} OPs
          </span>
        )}
      </div>
    </div>
  );
}
