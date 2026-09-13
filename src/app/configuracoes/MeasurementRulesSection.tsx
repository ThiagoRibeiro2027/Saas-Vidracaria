"use client";

import { upsertMeasurementRuleAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, labelStyle, buttonStyle } from "./styles";

type Row = {
  id: string;
  tipo_item: string;
  exige_medicao_confirmada: boolean;
  ativo: boolean;
};

export default function MeasurementRulesSection({ rows, canManage }: { rows: Row[]; canManage: boolean }) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Regra de medição</h2>
      <p style={hintStyle}>
        Itens sob medida: liberação para produção fica impedida sem medida confirmada. Itens
        padrão/catálogo: o sistema apenas sinaliza, sem impedir (TÓPICO 15 §31.5).
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Tipo de item</th>
              <th style={thStyle}>Exige medição confirmada</th>
              <th style={thStyle}>Ativo</th>
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
      <td style={tdStyle} colSpan={3}>
        <form
          action={upsertMeasurementRuleAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
        >
          <input
            name="tipo_item"
            placeholder="tipo de item"
            defaultValue={row?.tipo_item ?? ""}
            readOnly={!!row}
            required
            disabled={!canManage}
            style={{ ...inputStyle, width: "180px" }}
          />
          <label style={labelStyle}>
            <input
              type="checkbox"
              name="exige_medicao_confirmada"
              defaultChecked={row?.exige_medicao_confirmada ?? true}
              disabled={!canManage}
            />
            Impede sem medição confirmada
          </label>
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

