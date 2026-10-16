"use client";

import { useState } from "react";
import { LayoutGrid, Table2 } from "lucide-react";
import FilaProducaoSection, { type FilaProducaoRow } from "./FilaProducaoSection";
import FilaProducaoKanban, { type FilaProducaoKanbanRow } from "./FilaProducaoKanban";

// Desenho aprovado em conversa com o usuário (16/10/2026): cards e tabela
// continuam como duas visualizações da mesma fila — nada no componente de
// tabela (FilaProducaoSection) muda, só ganha um irmão novo (Kanban) e um
// alternador. Cards é o padrão por ser o motivo de toda esta frente.
export default function FilaProducaoView({
  linhas,
  pedidosKanban,
}: {
  linhas: FilaProducaoRow[];
  pedidosKanban: FilaProducaoKanbanRow[];
}) {
  const [visao, setVisao] = useState<"cards" | "tabela">("cards");

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Fila por pedido</h2>
        <div className="flex gap-1 rounded-md border border-border bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setVisao("cards")}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
              visao === "cards" ? "bg-primary-soft text-primary" : "text-text-muted hover:text-text"
            }`}
          >
            <LayoutGrid size={13} aria-hidden="true" />
            Cards
          </button>
          <button
            type="button"
            onClick={() => setVisao("tabela")}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
              visao === "tabela" ? "bg-primary-soft text-primary" : "text-text-muted hover:text-text"
            }`}
          >
            <Table2 size={13} aria-hidden="true" />
            Tabela
          </button>
        </div>
      </div>

      {visao === "cards" ? (
        <>
          <p className="mt-1 text-xs text-text-muted">
            Um card por pedido, organizado pela etapa real em que está (calculada automaticamente a partir
            da produção, expedição e instalação — nunca gravada). Arrastar dentro de uma coluna reordena a
            prioridade de execução de todas as OPs do pedido; mudar de coluna é automático, conforme o
            pedido avança de verdade.
          </p>
          <div className="mt-3">
            <FilaProducaoKanban pedidos={pedidosKanban} />
          </div>
        </>
      ) : (
        <div className="mt-3">
          <FilaProducaoSection linhas={linhas} />
        </div>
      )}
    </section>
  );
}
