"use client";

import { upsertCompanyMeasurementUnitAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";

export type CompanyMeasurementUnitRow = {
  id: string;
  unidade: string;
  descricao: string | null;
  ativo: boolean;
};

// Melhorias 12/10/2026, item 8 — a empresa escolhe quais unidades de medida
// usa; o cadastro de item (Engenharia) passa a oferecer só as unidades
// ativas aqui, num dropdown, em vez de texto livre. Itens já cadastrados com
// outro texto (ex.: "m" minúsculo, de antes desta tela existir) continuam
// como estão — decisão do responsável do produto foi não normalizar o que
// já existe, só orientar daqui pra frente.
export default function UnidadesMedidaSection({
  rows,
  canManage,
}: {
  rows: CompanyMeasurementUnitRow[];
  canManage: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Unidades de medida</h2>
      <p className="mt-1 text-xs text-text-muted">
        Unidades padrão que esta empresa usa. O cadastro de item (Engenharia) só oferece as
        marcadas como ativas. Itens já cadastrados com outra unidade não são alterados por esta
        tela — continuam como estão até alguém editar o item.
      </p>
      <DenseTable className="mt-2">
        <thead>
          <DenseTableHeaderRow>
            <Th>Unidade</Th>
            <Th>Descrição</Th>
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

function RowForm({ row, canManage }: { row: CompanyMeasurementUnitRow | null; canManage: boolean }) {
  return (
    <tr>
      <Td colSpan={3}>
        <form action={upsertCompanyMeasurementUnitAction} className="flex flex-wrap items-center gap-1.5">
          <Input
            name="unidade"
            placeholder="unidade (ex.: M2)"
            defaultValue={row?.unidade ?? ""}
            readOnly={!!row}
            required
            disabled={!canManage}
            className="w-24"
          />
          <Input
            name="descricao"
            placeholder="descrição (opcional)"
            defaultValue={row?.descricao ?? ""}
            disabled={!canManage}
            className="w-44"
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
