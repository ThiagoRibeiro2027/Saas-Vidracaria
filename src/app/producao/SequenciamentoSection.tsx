"use client";

import { definirPesoSequenciamentoAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

export type RecomendacaoRow = {
  op_lote_operacao_id: string;
  ordem_producao_id: string;
  ordem_producao_numero: string;
  descricao_operacao: string;
  prioridade: number;
  previsao_entrega: string | null;
  dias_para_prazo: number | null;
  perfil: string | null;
  ferramenta: string | null;
  processo: string | null;
  setup_compartilhado_count: number;
  posicao_atual: number;
  posicao_recomendada: number;
  classificacao: "risco" | "oportunidade" | "recomendado";
  explicacao: string;
};

type Peso = { criterio: "prazo" | "prioridade" | "setup_compartilhado"; peso: number };
type RecursoProdutivo = { id: string; codigo: string; nome: string };

const CLASSIFICACAO_LABEL: Record<RecomendacaoRow["classificacao"], string> = {
  risco: "🔴 Risco",
  oportunidade: "🟡 Oportunidade",
  recomendado: "🟢 Recomendado",
};

const CLASSIFICACAO_COLOR: Record<RecomendacaoRow["classificacao"], string> = {
  risco: "#9b2c2c",
  oportunidade: "#b7791f",
  recomendado: "#1f5d57",
};

const CRITERIO_LABEL: Record<Peso["criterio"], string> = {
  prazo: "Prazo",
  prioridade: "Prioridade",
  setup_compartilhado: "Setup compartilhado",
};

const CRITERIOS: Peso["criterio"][] = ["prazo", "prioridade", "setup_compartilhado"];

export default function SequenciamentoSection({
  recursos,
  recomendacaoPorRecurso,
  pesos,
  recursosEmGargalo,
  canManage,
}: {
  recursos: RecursoProdutivo[];
  recomendacaoPorRecurso: Map<string, RecomendacaoRow[]>;
  pesos: Peso[];
  recursosEmGargalo: Set<string>;
  canManage: boolean;
}) {
  const pesoPorCriterio = new Map(pesos.map((p) => [p.criterio, p.peso] as const));

  return (
    <section>
      <h2 style={sectionTitleStyle}>Sequenciamento inteligente (TÓPICO 4 §6)</h2>
      <p style={hintStyle}>
        Recomendação de ordem por recurso, baseada em regras e pesos configuráveis (prazo,
        prioridade e setup compartilhado — perfil/ferramenta/processo iguais entre operações
        pendentes) — não é IA autônoma nem otimização automática. O sistema recomenda; a decisão de
        aceitar, rejeitar ou modificar continua com o usuário autorizado (§7, ainda sem registro de
        decisão nem simulação — próxima sub-fase).
      </p>

      {canManage && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginBottom: "16px" }}>
          {CRITERIOS.map((c) => (
            <form key={c} action={definirPesoSequenciamentoAction} style={{ display: "flex", gap: "3px", alignItems: "center" }}>
              <input type="hidden" name="criterio" value={c} />
              <label style={{ fontSize: "11px", color: "#3e4d49" }}>{CRITERIO_LABEL[c]}</label>
              <input
                name="peso"
                type="number"
                min="0"
                step="0.5"
                defaultValue={pesoPorCriterio.get(c) ?? 1}
                style={{ ...inputStyle, width: "60px", fontSize: "11px" }}
              />
              <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px" }}>
                Salvar
              </button>
            </form>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {recursos.map((r) => {
          const linhas = recomendacaoPorRecurso.get(r.id) ?? [];
          return (
            <details key={r.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "8px 10px" }}>
              <summary style={{ fontSize: "12px", cursor: "pointer" }}>
                <strong>
                  {r.codigo} — {r.nome}
                </strong>{" "}
                ({linhas.length} operação(ões) pendente(s))
                {recursosEmGargalo.has(r.id) && (
                  <span style={{ color: "#9b2c2c", marginLeft: "6px" }}>⚠ recurso em gargalo (ver painel Gargalos acima)</span>
                )}
              </summary>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "6px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                    <th style={thStyle}>OP / operação</th>
                    <th style={thStyle}>Prazo</th>
                    <th style={thStyle}>Prioridade</th>
                    <th style={thStyle}>Setup</th>
                    <th style={thStyle}>Posição atual → recomendada</th>
                    <th style={thStyle}>Classificação</th>
                    <th style={thStyle}>Explicação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.op_lote_operacao_id} style={{ borderBottom: "1px solid #f4f6f5", verticalAlign: "top" }}>
                      <td style={tdStyle}>
                        {l.ordem_producao_numero}
                        <div style={{ color: "#6b7a75" }}>{l.descricao_operacao}</div>
                      </td>
                      <td style={tdStyle}>
                        {l.previsao_entrega ? new Date(`${l.previsao_entrega}T00:00:00`).toLocaleDateString("pt-BR") : "—"}
                        {l.dias_para_prazo != null && l.dias_para_prazo < 0 && (
                          <div style={{ color: "#9b2c2c" }}>{Math.abs(l.dias_para_prazo)}d atrasada</div>
                        )}
                      </td>
                      <td style={tdStyle}>{l.prioridade}</td>
                      <td style={tdStyle}>
                        {l.perfil || l.ferramenta || l.processo ? [l.perfil, l.ferramenta, l.processo].filter(Boolean).join(" / ") : "—"}
                        {l.setup_compartilhado_count > 0 && (
                          <div style={{ color: "#6b7a75" }}>compartilha com {l.setup_compartilhado_count}</div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {l.posicao_atual}ª → {l.posicao_recomendada}ª
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: "monospace", color: CLASSIFICACAO_COLOR[l.classificacao] }}>
                          {CLASSIFICACAO_LABEL[l.classificacao]}
                        </span>
                      </td>
                      <td style={tdStyle}>{l.explicacao}</td>
                    </tr>
                  ))}
                  {linhas.length === 0 && (
                    <tr>
                      <td style={tdStyle} colSpan={7}>
                        <span style={{ color: "#6b7a75" }}>Nenhuma operação pendente usando este recurso.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </details>
          );
        })}
        {recursos.length === 0 && <p style={hintStyle}>Nenhum recurso produtivo cadastrado ainda.</p>}
      </div>
    </section>
  );
}
