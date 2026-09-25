"use client";

import { upsertOrcamentoCompraAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../../configuracoes/styles";

type Linha = {
  id: string;
  categoria: string;
  periodo_inicio: string;
  periodo_fim: string;
  valor_orcado: number;
  comprometido: number;
  realizado: number;
};

function formatarData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

export default function OrcamentoComprasSection({ linhas, canManage }: { linhas: Linha[]; canManage: boolean }) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Orçamentos por categoria e período</h2>

      {canManage && (
        <form action={upsertOrcamentoCompraAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
          <input name="categoria" placeholder="categoria (classificação do item)" required style={{ ...inputStyle, width: "180px" }} />
          <input name="periodo_inicio" type="date" required style={inputStyle} />
          <input name="periodo_fim" type="date" required style={inputStyle} />
          <input name="valor_orcado" type="number" min="0" step="0.01" placeholder="valor orçado (R$)" required style={{ ...inputStyle, width: "130px" }} />
          <button type="submit" style={buttonStyle}>Salvar orçamento</button>
        </form>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Categoria</th>
              <th style={thStyle}>Período</th>
              <th style={thStyle}>Orçado</th>
              <th style={thStyle}>Comprometido</th>
              <th style={thStyle}>Realizado</th>
              <th style={thStyle}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const saldo = Number(l.valor_orcado) - Number(l.comprometido) - Number(l.realizado);
              return (
                <tr key={l.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{l.categoria}</td>
                  <td style={tdStyle}>{formatarData(l.periodo_inicio)} — {formatarData(l.periodo_fim)}</td>
                  <td style={tdStyle}>R$ {Number(l.valor_orcado).toFixed(2)}</td>
                  <td style={tdStyle}>R$ {Number(l.comprometido).toFixed(2)}</td>
                  <td style={tdStyle}>R$ {Number(l.realizado).toFixed(2)}</td>
                  <td style={{ ...tdStyle, color: saldo < 0 ? "#9b2c2c" : "#1f5d57", fontWeight: 600 }}>R$ {saldo.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {linhas.length === 0 && <p style={hintStyle}>Nenhum orçamento configurado ainda.</p>}
      </div>
    </section>
  );
}
