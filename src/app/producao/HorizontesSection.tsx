"use client";

import { criarHorizonteProgramacaoAction, removerHorizonteProgramacaoAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

export type HorizonteProgramacao = {
  id: string;
  tipo: "longo_prazo" | "flexivel" | "congelado";
  data_inicio: string;
  data_fim: string;
  motivo: string | null;
};

const TIPO_LABEL: Record<HorizonteProgramacao["tipo"], string> = {
  longo_prazo: "Longo prazo",
  flexivel: "Flexível",
  congelado: "🔒 Congelado",
};

const TIPO_COLOR: Record<HorizonteProgramacao["tipo"], string> = {
  longo_prazo: "#6b7a75",
  flexivel: "#1f5d57",
  congelado: "#9b2c2c",
};

const fmt = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString("pt-BR");

export default function HorizontesSection({
  horizontes,
  canManage,
}: {
  horizontes: HorizonteProgramacao[];
  canManage: boolean;
}) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Horizonte e congelamento da programação (TÓPICO 4 §9)</h2>
      <p style={hintStyle}>
        Períodos configurados pela empresa (longo prazo, flexível, congelado). Alterar a data
        planejada de uma operação (programar/decidir sequenciamento) dentro de um período
        congelado exige a permissão producao.reprogramar_congelado, além de producao.manage.
        Períodos podem se sobrepor.
      </p>

      {canManage && (
        <form
          action={criarHorizonteProgramacaoAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "16px" }}
        >
          <select name="tipo" required style={{ ...inputStyle, width: "110px" }} defaultValue="">
            <option value="" disabled>
              Tipo...
            </option>
            <option value="longo_prazo">Longo prazo</option>
            <option value="flexivel">Flexível</option>
            <option value="congelado">Congelado</option>
          </select>
          <input name="data_inicio" type="date" required style={{ ...inputStyle, width: "125px" }} />
          <input name="data_fim" type="date" required style={{ ...inputStyle, width: "125px" }} />
          <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "160px" }} />
          <button type="submit" style={buttonStyle}>
            Criar período
          </button>
        </form>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
            <th style={thStyle}>Tipo</th>
            <th style={thStyle}>Período</th>
            <th style={thStyle}>Motivo</th>
            {canManage && <th style={thStyle}></th>}
          </tr>
        </thead>
        <tbody>
          {horizontes.map((h) => (
            <tr key={h.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
              <td style={tdStyle}>
                <span style={{ fontFamily: "monospace", color: TIPO_COLOR[h.tipo] }}>{TIPO_LABEL[h.tipo]}</span>
              </td>
              <td style={tdStyle}>
                {fmt(h.data_inicio)} – {fmt(h.data_fim)}
              </td>
              <td style={tdStyle}>{h.motivo ?? "—"}</td>
              {canManage && (
                <td style={tdStyle}>
                  <form action={removerHorizonteProgramacaoAction}>
                    <input type="hidden" name="id" value={h.id} />
                    <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: "#6b7a75" }}>
                      Remover
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
          {horizontes.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={canManage ? 4 : 3}>
                <span style={{ color: "#6b7a75" }}>Nenhum período configurado ainda.</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
