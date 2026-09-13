"use client";

import { upsertItemAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

const TIPOS = [
  ["materia_prima", "Matéria-prima"],
  ["insumo", "Insumo"],
  ["componente", "Componente"],
  ["produto_intermediario", "Produto intermediário"],
  ["produto_acabado", "Produto acabado"],
  ["material_auxiliar", "Material auxiliar"],
  ["embalagem", "Embalagem"],
  ["servico", "Serviço"],
  ["outro", "Outro"],
] as const;

type Item = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  classificacao: string | null;
  unidade_principal: string;
  situacao: "ativo" | "inativo";
};

export default function ItensSection({ rows, canManage }: { rows: Item[]; canManage: boolean }) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Itens</h2>
      <p style={hintStyle}>
        Produto e material são o mesmo cadastro (TÓPICO 2 §7-10), diferenciados pelo tipo.
        Classificação é texto livre — é o mesmo valor usado em Configurações → Margem de quebra e
        Regra de medição (ex.: <code>vidro_temperado</code>).
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Código</th>
              <th style={thStyle}>Descrição</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Classificação</th>
              <th style={thStyle}>Unidade</th>
              <th style={thStyle}>Situação</th>
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

function RowForm({ row, canManage }: { row: Item | null; canManage: boolean }) {
  return (
    <tr style={{ borderBottom: "1px solid #eef1ef" }}>
      <td style={tdStyle} colSpan={canManage ? 7 : 6}>
        <form
          action={upsertItemAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
        >
          {row && <input type="hidden" name="id" value={row.id} />}
          <input
            name="codigo"
            placeholder="código"
            defaultValue={row?.codigo ?? ""}
            readOnly={!!row}
            required
            disabled={!canManage}
            style={{ ...inputStyle, width: "110px" }}
          />
          <input
            name="descricao"
            placeholder="descrição"
            defaultValue={row?.descricao ?? ""}
            required
            disabled={!canManage}
            style={{ ...inputStyle, width: "200px" }}
          />
          <select name="tipo" defaultValue={row?.tipo ?? "materia_prima"} disabled={!canManage} style={inputStyle}>
            {TIPOS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            name="classificacao"
            placeholder="classificação (opcional)"
            defaultValue={row?.classificacao ?? ""}
            disabled={!canManage}
            style={{ ...inputStyle, width: "150px" }}
          />
          <input
            name="unidade_principal"
            placeholder="unidade (ex.: M2)"
            defaultValue={row?.unidade_principal ?? ""}
            required
            disabled={!canManage}
            style={{ ...inputStyle, width: "90px" }}
          />
          <select name="situacao" defaultValue={row?.situacao ?? "ativo"} disabled={!canManage} style={inputStyle}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
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
