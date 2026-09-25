"use client";

import { useMemo, useState } from "react";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle } from "../configuracoes/styles";

export type FilaProducaoRow = {
  pedido_id: string;
  pedido_numero: string;
  pessoa_id: string;
  pessoa_nome: string;
  obra_id: string | null;
  obra_nome: string | null;
  previsao_entrega: string | null;
  ordem_producao_id: string;
  ordem_producao_numero: string;
  prioridade: number;
  item_codigo: string;
  item_descricao: string;
  quantidade_planejada: number;
  quantidade_produzida: number;
  quantidade_perdida: number;
  status: "planejada" | "em_producao" | "concluida" | "cancelada";
  situacao: "liberada" | "liberada_com_restricao" | "bloqueada";
  lotes_total: number;
  lotes_concluidos: number;
};

const STATUS_LABEL: Record<FilaProducaoRow["status"], string> = {
  planejada: "Planejada",
  em_producao: "Em produção",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const SITUACAO_LABEL: Record<FilaProducaoRow["situacao"], string> = {
  liberada: "Liberada",
  liberada_com_restricao: "Liberada c/ restrição",
  bloqueada: "Bloqueada",
};

const SITUACAO_COLOR: Record<FilaProducaoRow["situacao"], string> = {
  liberada: "#1f5d57",
  liberada_com_restricao: "#a15c00",
  bloqueada: "#9b2c2c",
};

const fmtData = (v: string | null) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString("pt-BR") : "—");

export default function FilaProducaoSection({ linhas }: { linhas: FilaProducaoRow[] }) {
  const [filtroPessoa, setFiltroPessoa] = useState("");
  const [filtroObra, setFiltroObra] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  const pessoaOpcoes = useMemo(() => {
    const map = new Map<string, string>();
    linhas.forEach((l) => map.set(l.pessoa_id, l.pessoa_nome));
    return Array.from(map, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [linhas]);

  const obraOpcoes = useMemo(() => {
    const map = new Map<string, string>();
    linhas.forEach((l) => {
      if (l.obra_id && l.obra_nome) map.set(l.obra_id, l.obra_nome);
    });
    return Array.from(map, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [linhas]);

  const linhasFiltradas = linhas.filter((l) => {
    if (filtroPessoa && l.pessoa_id !== filtroPessoa) return false;
    if (filtroObra && l.obra_id !== filtroObra) return false;
    if (filtroStatus && l.status !== filtroStatus) return false;
    return true;
  });

  const pedidosAgrupados = useMemo(() => {
    const grupos = new Map<string, FilaProducaoRow[]>();
    linhasFiltradas.forEach((l) => {
      const grupo = grupos.get(l.pedido_id) ?? [];
      grupo.push(l);
      grupos.set(l.pedido_id, grupo);
    });
    return Array.from(grupos.values());
  }, [linhasFiltradas]);

  return (
    <section>
      <h2 style={sectionTitleStyle}>Fila por pedido</h2>
      <p style={hintStyle}>
        Ordens de produção agrupadas por pedido de cliente, ordenadas por prioridade e previsão de
        entrega (mesma prioridade já usada em Produção → Programação). Progresso de lotes é
        concluídos/total de op_lotes da OP.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
        <select value={filtroPessoa} onChange={(e) => setFiltroPessoa(e.target.value)} style={{ ...inputStyle, width: "200px" }}>
          <option value="">Todos os clientes</option>
          {pessoaOpcoes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <select value={filtroObra} onChange={(e) => setFiltroObra(e.target.value)} style={{ ...inputStyle, width: "180px" }}>
          <option value="">Todas as obras</option>
          {obraOpcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={{ ...inputStyle, width: "160px" }}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </div>

      {pedidosAgrupados.length === 0 && <p style={hintStyle}>Nenhuma ordem de produção encontrada com esses filtros.</p>}

      {pedidosAgrupados.map((grupo) => {
        const primeira = grupo[0];
        return (
          <div
            key={primeira.pedido_id}
            style={{ border: "1px solid #dae2de", borderRadius: "6px", marginBottom: "12px", overflow: "hidden" }}
          >
            <div
              style={{
                background: "#f5f7f5",
                padding: "8px 10px",
                display: "flex",
                flexWrap: "wrap",
                gap: "4px 16px",
                fontSize: "12.5px",
              }}
            >
              <strong>Pedido {primeira.pedido_numero}</strong>
              <span>{primeira.pessoa_nome}</span>
              {primeira.obra_nome && <span style={{ color: "#6b7a75" }}>Obra: {primeira.obra_nome}</span>}
              <span style={{ color: "#6b7a75" }}>Previsão de entrega: {fmtData(primeira.previsao_entrega)}</span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                  <th style={thStyle}>OP</th>
                  <th style={thStyle}>Item</th>
                  <th style={thStyle}>Prioridade</th>
                  <th style={thStyle}>Planejado</th>
                  <th style={thStyle}>Produzido</th>
                  <th style={thStyle}>Perdido</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Situação</th>
                  <th style={thStyle}>Lotes</th>
                </tr>
              </thead>
              <tbody>
                {grupo.map((op) => (
                  <tr key={op.ordem_producao_id} style={{ borderBottom: "1px solid #f2f4f2" }}>
                    <td style={tdStyle}>{op.ordem_producao_numero}</td>
                    <td style={tdStyle}>
                      {op.item_codigo} — {op.item_descricao}
                    </td>
                    <td style={tdStyle}>{op.prioridade}</td>
                    <td style={tdStyle}>{op.quantidade_planejada}</td>
                    <td style={tdStyle}>{op.quantidade_produzida}</td>
                    <td style={tdStyle}>{op.quantidade_perdida}</td>
                    <td style={tdStyle}>{STATUS_LABEL[op.status]}</td>
                    <td style={{ ...tdStyle, color: SITUACAO_COLOR[op.situacao] }}>{SITUACAO_LABEL[op.situacao]}</td>
                    <td style={tdStyle}>
                      {op.lotes_total > 0 ? `${op.lotes_concluidos}/${op.lotes_total}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}
