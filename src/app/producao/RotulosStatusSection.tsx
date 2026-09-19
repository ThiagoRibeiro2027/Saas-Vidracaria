"use client";

import { definirRotuloStatusProducaoAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

export type RotuloStatusRow = {
  campo: "status" | "situacao" | "status_qualidade";
  valor_interno: string;
  rotulo: string;
};

const CAMPO_LABEL: Record<RotuloStatusRow["campo"], string> = {
  status: "Status da OP",
  situacao: "Situação da OP",
  status_qualidade: "Status de qualidade",
};

export default function RotulosStatusSection({
  rotulos,
  canManage,
}: {
  rotulos: RotuloStatusRow[];
  canManage: boolean;
}) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Rótulos de status (TÓPICO 4 §41)</h2>
      <p style={hintStyle}>
        A empresa pode renomear como cada status aparece na tela. O valor interno (o que
        Qualidade/Expedição de fato leem pra liberar a próxima etapa) nunca muda — só o texto
        exibido. &quot;Pausada&quot; não está na lista porque a OP ainda não registra pausa/retomada
        com motivo (fora deste recorte).
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
            <th style={thStyle}>Campo</th>
            <th style={thStyle}>Valor interno</th>
            <th style={thStyle}>Rótulo</th>
            {canManage && <th style={thStyle}></th>}
          </tr>
        </thead>
        <tbody>
          {rotulos.map((r) => (
            <tr key={`${r.campo}.${r.valor_interno}`} style={{ borderBottom: "1px solid #f4f6f5" }}>
              <td style={tdStyle}>{CAMPO_LABEL[r.campo]}</td>
              <td style={tdStyle}>
                <span style={{ fontFamily: "monospace", color: "#6b7a75" }}>{r.valor_interno}</span>
              </td>
              <td style={tdStyle}>{r.rotulo}</td>
              {canManage && (
                <td style={tdStyle}>
                  <form
                    action={definirRotuloStatusProducaoAction}
                    style={{ display: "flex", gap: "6px", alignItems: "center" }}
                  >
                    <input type="hidden" name="campo" value={r.campo} />
                    <input type="hidden" name="valor_interno" value={r.valor_interno} />
                    <input
                      name="rotulo"
                      defaultValue={r.rotulo}
                      required
                      style={{ ...inputStyle, width: "180px" }}
                    />
                    <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 8px" }}>
                      Salvar
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
