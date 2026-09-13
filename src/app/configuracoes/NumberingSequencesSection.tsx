"use client";

import { upsertNumberingSequenceAction } from "./actions";

// Lista fixa e curta para o M1 — sem UI de criar tipo de documento
// arbitrário (T3/T4/T10, que consumiriam isso, ainda não existem).
const DOCUMENT_TYPES = [
  { key: "orcamento", label: "Orçamento" },
  { key: "pedido", label: "Pedido" },
  { key: "ordem_producao", label: "Ordem de produção" },
] as const;

type Row = {
  document_type: string;
  prefixo: string;
  sufixo: string;
  digitos: number;
  incluir_ano: boolean;
  incluir_mes: boolean;
  reinicio: "nunca" | "anual" | "mensal";
  current_value: number;
};

export default function NumberingSequencesSection({
  rows,
  canManage,
}: {
  rows: Row[];
  canManage: boolean;
}) {
  const byType = new Map(rows.map((r) => [r.document_type, r]));

  return (
    <section>
      <h2 style={sectionTitleStyle}>Numeração</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {DOCUMENT_TYPES.map(({ key, label }) => {
          const row = byType.get(key);
          return (
            <form
              key={key}
              action={upsertNumberingSequenceAction}
              style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "12px" }}
            >
              <input type="hidden" name="document_type" value={key} />
              <span style={{ width: "140px" }}>{label}</span>
              <input
                name="prefixo"
                placeholder="Prefixo"
                defaultValue={row?.prefixo ?? ""}
                disabled={!canManage}
                style={{ ...inputStyle, width: "70px" }}
              />
              <input
                name="sufixo"
                placeholder="Sufixo"
                defaultValue={row?.sufixo ?? ""}
                disabled={!canManage}
                style={{ ...inputStyle, width: "70px" }}
              />
              <label style={labelStyle}>
                Dígitos
                <input
                  name="digitos"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={row?.digitos ?? 6}
                  disabled={!canManage}
                  style={{ ...inputStyle, width: "50px" }}
                />
              </label>
              <label style={labelStyle}>
                <input type="checkbox" name="incluir_ano" defaultChecked={row?.incluir_ano ?? false} disabled={!canManage} />
                Ano
              </label>
              <label style={labelStyle}>
                <input type="checkbox" name="incluir_mes" defaultChecked={row?.incluir_mes ?? false} disabled={!canManage} />
                Mês
              </label>
              <select name="reinicio" defaultValue={row?.reinicio ?? "nunca"} disabled={!canManage} style={inputStyle}>
                <option value="nunca">Sem reinício</option>
                <option value="anual">Reinício anual</option>
                <option value="mensal">Reinício mensal</option>
              </select>
              <span style={{ color: "#6b7a75" }}>Atual: {row?.current_value ?? 0}</span>
              {canManage && (
                <button type="submit" style={buttonStyle}>
                  Salvar
                </button>
              )}
            </form>
          );
        })}
      </div>
    </section>
  );
}

const sectionTitleStyle = { fontSize: "14px", margin: "0 0 10px" } as const;
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
