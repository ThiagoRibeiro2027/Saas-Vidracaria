"use client";

import { useState } from "react";
import { definirPrioridadeOpAction, programarOperacaoAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

export type ProgramacaoRow = {
  op_lote_operacao_id: string;
  ordem_producao_id: string;
  ordem_producao_numero: string;
  prioridade: number;
  item_codigo: string;
  item_descricao: string;
  previsao_entrega: string | null;
  descricao_operacao: string;
  sequencia: number;
  status: "planejada" | "em_andamento" | "concluida";
  quantidade_planejada: number;
  saldo: number;
  recurso_produtivo_id: string | null;
  recurso_codigo: string | null;
  recurso_nome: string | null;
  setor: string | null;
  data_planejada_inicio: string | null;
  data_planejada_fim: string | null;
};

const PRIORIDADE_LABEL: Record<number, string> = {
  1: "1 — mais urgente",
  2: "2",
  3: "3 — normal",
  4: "4",
  5: "5 — menos urgente",
};

const fmtData = (v: string | null) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString("pt-BR") : "—");

export default function ProgramacaoSection({
  linhas,
  recursosOpcoes,
  setoresOpcoes,
  canManage,
}: {
  linhas: ProgramacaoRow[];
  recursosOpcoes: { id: string; codigo: string; nome: string }[];
  setoresOpcoes: string[];
  canManage: boolean;
}) {
  const [filtroRecurso, setFiltroRecurso] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("");

  const linhasFiltradas = linhas.filter((l) => {
    if (filtroRecurso && l.recurso_produtivo_id !== filtroRecurso) return false;
    if (filtroSetor && l.setor !== filtroSetor) return false;
    return true;
  });

  return (
    <section>
      <h2 style={sectionTitleStyle}>Programação (TÓPICO 4 §5)</h2>
      <p style={hintStyle}>
        Prioridade da OP e datas planejadas por operação/recurso — base pro PCP planejar. Prazo
        prometido vem do pedido (previsão de entrega). Sem sequenciamento, simulação, congelamento
        ou replanejamento automáticos ainda (§6-10, sub-fases seguintes).
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
        <select value={filtroRecurso} onChange={(e) => setFiltroRecurso(e.target.value)} style={{ ...inputStyle, width: "160px" }}>
          <option value="">Todos os recursos</option>
          {recursosOpcoes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.codigo} — {r.nome}
            </option>
          ))}
        </select>
        <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)} style={{ ...inputStyle, width: "140px" }}>
          <option value="">Todos os setores</option>
          {setoresOpcoes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
            <th style={thStyle}>OP / Item</th>
            <th style={thStyle}>Prazo</th>
            <th style={thStyle}>Prioridade</th>
            <th style={thStyle}>Operação</th>
            <th style={thStyle}>Recurso</th>
            <th style={thStyle}>Planejado / saldo</th>
            <th style={thStyle}>Datas planejadas</th>
          </tr>
        </thead>
        <tbody>
          {linhasFiltradas.map((l) => (
            <tr key={l.op_lote_operacao_id} style={{ borderBottom: "1px solid #f4f6f5", verticalAlign: "top" }}>
              <td style={tdStyle}>
                {l.ordem_producao_numero}
                <div style={{ color: "#6b7a75", fontSize: "11px" }}>
                  {l.item_codigo} — {l.item_descricao}
                </div>
              </td>
              <td style={tdStyle}>{fmtData(l.previsao_entrega)}</td>
              <td style={tdStyle}>
                {canManage ? (
                  <form action={definirPrioridadeOpAction} style={{ display: "flex", gap: "3px", alignItems: "center" }}>
                    <input type="hidden" name="ordem_producao_id" value={l.ordem_producao_id} />
                    <select name="prioridade" defaultValue={l.prioridade} style={{ ...inputStyle, width: "110px", fontSize: "11px" }}>
                      {[1, 2, 3, 4, 5].map((p) => (
                        <option key={p} value={p}>
                          {PRIORIDADE_LABEL[p]}
                        </option>
                      ))}
                    </select>
                    <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px" }}>
                      Salvar
                    </button>
                  </form>
                ) : (
                  PRIORIDADE_LABEL[l.prioridade] ?? l.prioridade
                )}
              </td>
              <td style={tdStyle}>
                {l.sequencia}. {l.descricao_operacao}
                <div style={{ color: "#6b7a75", fontSize: "11px" }}>{l.status}</div>
              </td>
              <td style={tdStyle}>
                {l.recurso_codigo ? `${l.recurso_codigo} — ${l.recurso_nome}` : "—"}
                {l.setor && <div style={{ color: "#6b7a75", fontSize: "11px" }}>{l.setor}</div>}
              </td>
              <td style={tdStyle}>
                {Number(l.quantidade_planejada).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} / {Number(l.saldo).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
              </td>
              <td style={tdStyle}>
                {canManage ? (
                  <form action={programarOperacaoAction} style={{ display: "flex", flexWrap: "wrap", gap: "3px", alignItems: "center" }}>
                    <input type="hidden" name="op_lote_operacao_id" value={l.op_lote_operacao_id} />
                    <input
                      name="data_planejada_inicio"
                      type="date"
                      defaultValue={l.data_planejada_inicio ?? ""}
                      style={{ ...inputStyle, width: "125px", fontSize: "11px" }}
                    />
                    <input
                      name="data_planejada_fim"
                      type="date"
                      defaultValue={l.data_planejada_fim ?? ""}
                      style={{ ...inputStyle, width: "125px", fontSize: "11px" }}
                    />
                    <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px" }}>
                      Programar
                    </button>
                  </form>
                ) : (
                  `${fmtData(l.data_planejada_inicio)} – ${fmtData(l.data_planejada_fim)}`
                )}
              </td>
            </tr>
          ))}
          {linhasFiltradas.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={7}>
                <span style={{ color: "#6b7a75" }}>Nenhuma operação encontrada com os filtros atuais.</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
