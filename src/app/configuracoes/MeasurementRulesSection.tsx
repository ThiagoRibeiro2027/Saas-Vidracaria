"use client";

import { upsertMeasurementRuleAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";

type Row = {
  id: string;
  tipo_item: string;
  exige_medicao_confirmada: boolean;
  ativo: boolean;
};

export default function MeasurementRulesSection({ rows, canManage }: { rows: Row[]; canManage: boolean }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Regra de medição</h2>
      <p className="mt-1 text-xs text-text-muted">
        Itens sob medida: liberação para produção fica impedida sem medida confirmada. Itens
        padrão/catálogo: o sistema apenas sinaliza, sem impedir (TÓPICO 15 §31.5).
      </p>
      <DenseTable className="mt-2">
        <thead>
          <DenseTableHeaderRow>
            <Th>Tipo de item</Th>
            <Th>Exige medição confirmada</Th>
            <Th>Ativo</Th>
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RowForm key={row.id} row={row} canManage={canManage} />
          ))}
          {canManage && <RowForm row={null} canManage={canManage} />}
        </tbody>
      </DenseTable>
    </section>
  );
}

function RowForm({ row, canManage }: { row: Row | null; canManage: boolean }) {
  return (
    <tr>
      <Td colSpan={3}>
        <form action={upsertMeasurementRuleAction} className="flex flex-wrap items-center gap-1.5">
          <Input
            name="tipo_item"
            placeholder="tipo de item"
            defaultValue={row?.tipo_item ?? ""}
            readOnly={!!row}
            required
            disabled={!canManage}
            className="w-44"
          />
          <label className="flex items-center gap-1 text-xs text-text">
            <input
              type="checkbox"
              name="exige_medicao_confirmada"
              defaultChecked={row?.exige_medicao_confirmada ?? true}
              disabled={!canManage}
              className="accent-primary"
            />
            Impede sem medição confirmada
          </label>
          <label className="flex items-center gap-1 text-xs text-text">
            <input type="checkbox" name="ativo" defaultChecked={row?.ativo ?? true} disabled={!canManage} className="accent-primary" />
            Ativo
          </label>
          {canManage && (
            <Button type="submit" variant="primary">
              {row ? "Salvar" : "Adicionar"}
            </Button>
          )}
        </form>
      </Td>
    </tr>
  );
}
