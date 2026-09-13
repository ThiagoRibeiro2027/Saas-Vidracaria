"use client";

import { upsertApprovalThresholdAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, labelStyle, buttonStyle } from "./styles";

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
      <h2 style={sectionTitleStyle}>Alçada de aprovação</h2>
      <p style={hintStyle}>
        Valor mínimo que exige aprovação e o perfil que aprova, por processo. Recorte de M1 — sem
        aprovação sequencial/paralela, delegação ou escalonamento (TÓPICO 15 §8).
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Processo</th>
              <th style={thStyle}>Valor mínimo</th>
              <th style={thStyle}>Perfil aprovador</th>
              <th style={thStyle}>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowForm key={row.id} row={row} roles={roles} canManage={canManage} />
            ))}
            {canManage && <RowForm row={null} roles={roles} canManage={canManage} />}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowForm({ row, roles, canManage }: { row: Row | null; roles: Role[]; canManage: boolean }) {
  return (
    <tr style={{ borderBottom: "1px solid #eef1ef" }}>
      <td style={tdStyle} colSpan={4}>
        <form
          action={upsertApprovalThresholdAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
        >
          <input
            name="processo"
            placeholder="processo (ex.: orcamento_aprovacao)"
            defaultValue={row?.processo ?? ""}
            readOnly={!!row}
            required
            disabled={!canManage}
            style={{ ...inputStyle, width: "200px" }}
          />
          <input
            name="valor_minimo"
            type="number"
            step="0.01"
            min={0}
            placeholder="Valor mínimo"
            defaultValue={row?.valor_minimo ?? ""}
            required
            disabled={!canManage}
            style={{ ...inputStyle, width: "110px" }}
          />
          <select name="role_id" defaultValue={row?.role_id ?? ""} required disabled={!canManage} style={inputStyle}>
            <option value="" disabled>
              Perfil aprovador
            </option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <label style={labelStyle}>
            <input type="checkbox" name="ativo" defaultChecked={row?.ativo ?? true} disabled={!canManage} />
            Ativo
          </label>
          {canManage && (
            <button type="submit" style={buttonStyle}>
              {row ? "Salvar" : "Adicionar"}
            </button>
          )}
        </form>
      </td>
    </tr>
  );
}

