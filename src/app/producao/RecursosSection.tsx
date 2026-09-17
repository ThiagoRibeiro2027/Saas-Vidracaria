"use client";

import { criarRecursoProdutivoAction, atualizarSituacaoRecursoAction, desativarRecursoProdutivoAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type RecursoProdutivo = {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  setor: string | null;
  capacidade_horas_dia: number | null;
  situacao: string;
  motivo_situacao: string | null;
  ativo: boolean;
};
export type CapacidadeRecursoRow = {
  recurso_produtivo_id: string;
  capacidade_disponivel_horas: number;
  capacidade_necessaria_horas: number;
  saldo_horas: number;
  classificacao: "sem_capacidade_cadastrada" | "sobrecarga" | "ociosa" | "normal";
};

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const TIPO_LABEL: Record<string, string> = {
  maquina: "Máquina",
  equipamento: "Equipamento",
  linha: "Linha",
  posto: "Posto",
  equipe: "Equipe",
  operador: "Operador",
  ferramenta: "Ferramenta",
  dispositivo: "Dispositivo",
};

const SITUACAO_LABEL: Record<string, string> = {
  disponivel: "Disponível",
  em_producao: "Em produção",
  programado_manutencao: "Programado p/ manutenção",
  em_manutencao: "Em manutenção",
  parado: "Parado",
  indisponivel: "Indisponível",
  aguardando_peca: "Aguardando peça",
  aguardando_ferramenta: "Aguardando ferramenta",
  aguardando_operador: "Aguardando operador",
  bloqueado: "Bloqueado",
  outros: "Outros",
};

const SITUACAO_COLOR: Record<string, string> = {
  disponivel: "#1f5d57",
  em_producao: "#1f5d57",
  programado_manutencao: "#b7791f",
  em_manutencao: "#9b2c2c",
  parado: "#9b2c2c",
  indisponivel: "#9b2c2c",
  aguardando_peca: "#b7791f",
  aguardando_ferramenta: "#b7791f",
  aguardando_operador: "#b7791f",
  bloqueado: "#9b2c2c",
  outros: "#6b7a75",
};

const CLASSIFICACAO_LABEL: Record<CapacidadeRecursoRow["classificacao"], string> = {
  sem_capacidade_cadastrada: "Sem capacidade cadastrada",
  sobrecarga: "Sobrecarga",
  ociosa: "Ociosa",
  normal: "Normal",
};

const CLASSIFICACAO_COLOR: Record<CapacidadeRecursoRow["classificacao"], string> = {
  sem_capacidade_cadastrada: "#6b7a75",
  sobrecarga: "#9b2c2c",
  ociosa: "#b7791f",
  normal: "#1f5d57",
};

const SITUACOES = Object.keys(SITUACAO_LABEL);
const TIPOS = Object.keys(TIPO_LABEL);

export default function RecursosSection({
  recursos,
  capacidadePorRecurso,
  canManage,
}: {
  recursos: RecursoProdutivo[];
  capacidadePorRecurso: Map<string, CapacidadeRecursoRow>;
  canManage: boolean;
}) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Recursos produtivos e capacidade (TÓPICO 4 §31-32)</h2>
      <p style={hintStyle}>
        Máquinas, equipamentos, linhas, postos, equipes, operadores, ferramentas e dispositivos.
        Capacidade disponível (horas/dia × 7 dias) × necessária (tempo previsto das operações
        pendentes que usam o recurso) — leitura pro PCP decidir, sem sequenciamento automático.
      </p>

      {canManage && (
        <form
          action={criarRecursoProdutivoAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "16px" }}
        >
          <input name="codigo" placeholder="Código" required style={{ ...inputStyle, width: "90px" }} />
          <input name="nome" placeholder="Nome" required style={{ ...inputStyle, width: "150px" }} />
          <select name="tipo" required style={{ ...inputStyle, width: "120px" }} defaultValue="">
            <option value="" disabled>
              Tipo...
            </option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </select>
          <input name="setor" placeholder="Setor (opcional)" style={{ ...inputStyle, width: "100px" }} />
          <input
            name="capacidade_horas_dia"
            type="number"
            min="0"
            step="0.5"
            placeholder="h/dia (opcional)"
            style={{ ...inputStyle, width: "100px" }}
          />
          <button type="submit" style={buttonStyle}>
            Criar recurso
          </button>
        </form>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
            <th style={thStyle}>Recurso</th>
            <th style={thStyle}>Tipo</th>
            <th style={thStyle}>Situação</th>
            <th style={thStyle}>Disponível (h)</th>
            <th style={thStyle}>Necessário (h)</th>
            <th style={thStyle}>Saldo</th>
            <th style={thStyle}>Classificação</th>
            {canManage && <th style={thStyle}></th>}
          </tr>
        </thead>
        <tbody>
          {recursos.map((r) => {
            const cap = capacidadePorRecurso.get(r.id);
            return (
              <tr key={r.id} style={{ borderBottom: "1px solid #f4f6f5", verticalAlign: "top" }}>
                <td style={tdStyle}>
                  {r.codigo} — {r.nome}
                  {r.setor && <div style={{ color: "#6b7a75", fontSize: "11px" }}>{r.setor}</div>}
                </td>
                <td style={tdStyle}>{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                <td style={tdStyle}>
                  <span style={{ fontFamily: "monospace", color: SITUACAO_COLOR[r.situacao] ?? "#6b7a75" }}>
                    {SITUACAO_LABEL[r.situacao] ?? r.situacao}
                  </span>
                  {r.motivo_situacao && <div style={{ color: "#6b7a75", fontSize: "11px" }}>{r.motivo_situacao}</div>}
                  {canManage && (
                    <form
                      action={atualizarSituacaoRecursoAction}
                      style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "4px", alignItems: "center" }}
                    >
                      <input type="hidden" name="id" value={r.id} />
                      <select name="situacao" defaultValue={r.situacao} style={{ ...inputStyle, width: "150px", fontSize: "11px" }}>
                        {SITUACOES.map((s) => (
                          <option key={s} value={s}>
                            {SITUACAO_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "110px", fontSize: "11px" }} />
                      <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px" }}>
                        Atualizar
                      </button>
                    </form>
                  )}
                </td>
                <td style={tdStyle}>{cap ? num(cap.capacidade_disponivel_horas) : "—"}</td>
                <td style={tdStyle}>{cap ? num(cap.capacidade_necessaria_horas) : "—"}</td>
                <td style={tdStyle}>{cap ? num(cap.saldo_horas) : "—"}</td>
                <td style={tdStyle}>
                  {cap && (
                    <span style={{ fontFamily: "monospace", color: CLASSIFICACAO_COLOR[cap.classificacao] }}>
                      {CLASSIFICACAO_LABEL[cap.classificacao]}
                    </span>
                  )}
                </td>
                {canManage && (
                  <td style={tdStyle}>
                    <form action={desativarRecursoProdutivoAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: "#6b7a75" }}>
                        Desativar
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            );
          })}
          {recursos.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={canManage ? 8 : 7}>
                <span style={{ color: "#6b7a75" }}>Nenhum recurso produtivo cadastrado ainda.</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
