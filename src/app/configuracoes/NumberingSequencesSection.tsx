"use client";

import { upsertNumberingSequenceAction } from "./actions";
import { sectionTitleStyle, inputStyle, labelStyle, buttonStyle } from "./styles";

// Lista fixa — sem UI de criar tipo de documento arbitrário. Achado do
// code-review (16/09/2026): 'expedicao' (T9) e 'instalacao' (T16) já
// tinham ficado de fora dessa lista desde que esses módulos entraram —
// sem esta tela, next_document_number() nunca tem sequência configurada
// pra eles, e criar_expedicao()/criar_instalacao()/gerar_titulos_pedido()
// falham sempre com "Sequência de numeração não configurada". Adicionado
// 'titulo_financeiro' (T11) junto, mesmo problema recém-introduzido.
const DOCUMENT_TYPES = [
  { key: "orcamento", label: "Orçamento" },
  { key: "pedido", label: "Pedido" },
  { key: "ordem_producao", label: "Ordem de produção" },
  { key: "expedicao", label: "Expedição" },
  { key: "instalacao", label: "Instalação" },
  { key: "titulo_financeiro", label: "Título financeiro" },
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

