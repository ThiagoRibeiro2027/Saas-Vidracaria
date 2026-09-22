"use client";

import { upsertApprovalThresholdAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

type Row = {
  id: string;
  processo: string;
  valor_minimo: number;
  role_id: string;
  ativo: boolean;
};

type Role = { id: string; key: string; name: string; company_id: string | null };

export default function ApprovalThresholdsSection({
  rows,
  roles,
  canManage,
}: {
  rows: Row[];
  roles: Role[];
  canManage: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Alçada de aprovação</h2>
      <p className="mt-1 text-xs text-text-muted">
        Valor mínimo que exige aprovação e o perfil que aprova, por processo. Recorte de M1 — sem
        aprovação sequencial/paralela, delegação ou escalonamento (TÓPICO 15 §8).
      </p>
      <div className="mt-2 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Processo</Th>
              <Th>Valor mínimo</Th>
              <Th>Perfil aprovador</Th>
              <Th>Ativo</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowForm key={row.id} row={row} roles={roles} canManage={canManage} />
            ))}
            {canManage && <RowForm row={null} roles={roles} canManage={canManage} />}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

function RowForm({ row, roles, canManage }: { row: Row | null; roles: Role[]; canManage: boolean }) {
  return (
    <tr>
      <Td colSpan={4}>
        <form action={upsertApprovalThresholdAction} className="flex flex-wrap items-center gap-1.5">
          <Input
            name="processo"
            placeholder="processo (ex.: orcamento_aprovacao)"
            defaultValue={row?.processo ?? ""}
            readOnly={!!row}
            required
            disabled={!canManage}
            className="w-52"
          />
          <Input
            name="valor_minimo"
            type="number"
            step="0.01"
            min={0}
            placeholder="Valor mínimo"
            defaultValue={row?.valor_minimo ?? ""}
            required
            disabled={!canManage}
            className="w-28"
          />
          <Select name="role_id" defaultValue={row?.role_id ?? ""} required disabled={!canManage}>
            <option value="" disabled>
              Perfil aprovador
            </option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
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
