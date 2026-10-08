import type { TableHTMLAttributes, HTMLAttributes } from "react";
import { Table } from "./Table";

// ADR-013 (Identidade D), §2.3 — tabela densa com cabeçalho destacado.
// Reaproveita Table/Th/Td de src/components/ui/Table.tsx como base (nada
// muda lá, pra não afetar as dezenas de telas que já usam esses três) —
// esta é só a caixa com borda + o fundo do cabeçalho, que cada tela
// aplica por cima. Célula de ação continua sendo o Button existente
// (variant="secondary" size="sm"), sem componente novo pra isso.
export function DenseTable({ className = "", ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto border border-border bg-surface">
      <Table className={className} {...props} />
    </div>
  );
}

export function DenseTableHeaderRow({ className = "", ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`bg-tone-amber-soft ${className}`} {...props} />;
}
