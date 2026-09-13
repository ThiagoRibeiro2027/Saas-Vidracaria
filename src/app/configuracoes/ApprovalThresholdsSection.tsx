"use client";

import { upsertApprovalThresholdAction } from "./actions";

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

const sectionTitleStyle = { fontSize: "14px", margin: "0 0 4px" } as const;
const hintStyle = { fontSize: "12px", color: "#6b7a75", margin: "0 0 10px" } as const;
const thStyle = { padding: "6px 8px" } as const;
const tdStyle = { padding: "6px 8px" } as const;
const inputStyle = {
  padding: "4px 6px",
  borderRadius: "4px",
  border: "1px solid #dae2de",
  fontSize: "12px",
} as const;
const labelStyle = { display: "flex", alignItems: "center", gap: "4px", color: "#3e4d49" } as const;
const buttonStyle = {
  background: "#1f5d57",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  padding: "4px 10px",
  fontSize: "12px",
  cursor: "pointer",
} as const;
