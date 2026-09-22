"use client";

import { upsertCuttingMarginAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td } from "@/components/ui/Table";

type Row = {
  id: string;
  material_tipo: string;
  processo: string;
  percentual: number;
  ativo: boolean;
};

export default function CuttingMarginsSection({ rows, canManage }: { rows: Row[]; canManage: boolean }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Margem de quebra</h2>
      <p className="mt-1 text-xs text-text-muted">
        Quantidade técnica planejada por material (linha com processo em branco = valor padrão),
        sobreposta pela combinação específica material + processo quando houver.
      </p>
      <div className="mt-2 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Material</Th>
              <Th>Processo</Th>
              <Th>Percentual (%)</Th>
              <Th>Ativo</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowForm key={row.id} row={row} canManage={canManage} />
            ))}
            {canManage && <RowForm row={null} canManage={canManage} />}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

function RowForm({ row, canManage }: { row: Row | null; canManage: boolean }) {
  return (
    <tr>
      <Td colSpan={canManage ? 5 : 4}>
        <form action={upsertCuttingMarginAction} className="flex flex-wrap items-center gap-1.5">
          <Input
            name="material_tipo"
            placeholder="tipo de material"
            defaultValue={row?.material_tipo ?? ""}
            readOnly={!!row}
            required
            disabled={!canManage}
            className="w-36"
          />
          <Input
            name="processo"
            placeholder="processo (opcional = padrão)"
            defaultValue={row?.processo ?? ""}
            readOnly={!!row}
            disabled={!canManage}
            className="w-40"
          />
          <Input
            name="percentual"
            type="number"
            step="0.001"
            min={0}
            placeholder="%"
            defaultValue={row?.percentual ?? ""}
            required
            disabled={!canManage}
            className="w-20"
          />
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
