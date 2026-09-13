"use client";

import { upsertCuttingMarginAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, labelStyle, buttonStyle } from "./styles";

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
      <h2 style={sectionTitleStyle}>Margem de quebra</h2>
      <p style={hintStyle}>
        Quantidade técnica planejada por material (linha com processo em branco = valor padrão),
        sobreposta pela combinação específica material + processo quando houver.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Material</th>
              <th style={thStyle}>Processo</th>
              <th style={thStyle}>Percentual (%)</th>
              <th style={thStyle}>Ativo</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowForm key={row.id} row={row} canManage={canManage} />
            ))}
            {canManage && <RowForm row={null} canManage={canManage} />}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowForm({ row, canManage }: { row: Row | null; canManage: boolean }) {
  return (
    <tr style={{ borderBottom: "1px solid #eef1ef" }}>
      <td style={tdStyle} colSpan={canManage ? 5 : 4}>
        <form
          action={upsertCuttingMarginAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
        >
          <input
            name="material_tipo"
            placeholder="tipo de material"
            defaultValue={row?.material_tipo ?? ""}
            readOnly={!!row}
            required
            disabled={!canManage}
            style={{ ...inputStyle, width: "140px" }}
          />
          <input
            name="processo"
            placeholder="processo (opcional = padrão)"
            defaultValue={row?.processo ?? ""}
            readOnly={!!row}
            disabled={!canManage}
            style={{ ...inputStyle, width: "160px" }}
          />
          <input
            name="percentual"
            type="number"
            step="0.001"
            min={0}
            placeholder="%"
            defaultValue={row?.percentual ?? ""}
            required
            disabled={!canManage}
            style={{ ...inputStyle, width: "80px" }}
          />
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

