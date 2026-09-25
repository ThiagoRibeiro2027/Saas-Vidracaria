"use client";

import { gerarNecessidadesPoliticaAction, upsertFeriadoAction, removerFeriadoAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../../configuracoes/styles";

type LinhaMapa = {
  item_id: string;
  item_codigo: string;
  item_descricao: string;
  necessidade_aberta: number;
  saldo_disponivel: number;
  saldo_projetado: number;
  data_necessaria_mais_proxima: string | null;
  lead_time_dias: number;
  data_recomendada_compra: string | null;
  risco: "critico" | "atencao" | "ok";
};

type Feriado = { id: string; data: string; descricao: string | null };

const RISCO_LABEL: Record<string, string> = { critico: "🔴 Crítico", atencao: "🟡 Atenção", ok: "🟢 Ok" };
const RISCO_COLOR: Record<string, string> = { critico: "#9b2c2c", atencao: "#8a6d1a", ok: "#1f5d57" };

function formatarData(data: string | null) {
  return data ? new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR") : "—";
}

export default function MapaComprasSection({
  mapa,
  feriados,
  canManage,
}: {
  mapa: LinhaMapa[];
  feriados: Feriado[];
  canManage: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <section>
        <h2 style={sectionTitleStyle}>Necessidades × risco de ruptura</h2>
        {canManage && (
          <form action={gerarNecessidadesPoliticaAction} style={{ marginBottom: "10px" }}>
            <button type="submit" style={buttonStyle}>
              Gerar necessidades das políticas de abastecimento
            </button>
          </form>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>Necessidade aberta</th>
                <th style={thStyle}>Saldo disponível</th>
                <th style={thStyle}>Saldo projetado</th>
                <th style={thStyle}>Necessária em</th>
                <th style={thStyle}>Lead time</th>
                <th style={thStyle}>Recomendação de compra</th>
                <th style={thStyle}>Risco</th>
              </tr>
            </thead>
            <tbody>
              {mapa.map((linha) => (
                <tr key={linha.item_id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{linha.item_codigo} — {linha.item_descricao}</td>
                  <td style={tdStyle}>{linha.necessidade_aberta}</td>
                  <td style={tdStyle}>{linha.saldo_disponivel}</td>
                  <td style={tdStyle}>{linha.saldo_projetado}</td>
                  <td style={tdStyle}>{formatarData(linha.data_necessaria_mais_proxima)}</td>
                  <td style={tdStyle}>{linha.lead_time_dias}d</td>
                  <td style={tdStyle}>{formatarData(linha.data_recomendada_compra)}</td>
                  <td style={{ ...tdStyle, color: RISCO_COLOR[linha.risco], fontWeight: 600 }}>{RISCO_LABEL[linha.risco]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mapa.length === 0 && <p style={hintStyle}>Nenhuma necessidade aberta no momento.</p>}
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Calendário de feriados</h2>
        <p style={hintStyle}>Usado por &quot;Recomendação de compra&quot; acima — nunca recomenda comprar num fim de semana ou feriado.</p>

        {canManage && (
          <form action={upsertFeriadoAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
            <input name="data" type="date" required style={inputStyle} />
            <input name="descricao" placeholder="descrição (opcional)" style={{ ...inputStyle, width: "180px" }} />
            <button type="submit" style={buttonStyle}>
              Adicionar feriado
            </button>
          </form>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Data</th>
                <th style={thStyle}>Descrição</th>
                {canManage && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {feriados.map((f) => (
                <tr key={f.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{formatarData(f.data)}</td>
                  <td style={tdStyle}>{f.descricao ?? "—"}</td>
                  {canManage && (
                    <td style={tdStyle}>
                      <form action={removerFeriadoAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
                          Remover
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {feriados.length === 0 && <p style={hintStyle}>Nenhum feriado cadastrado.</p>}
        </div>
      </section>
    </div>
  );
}
