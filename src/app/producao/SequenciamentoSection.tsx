"use client";

import { useActionState } from "react";
import {
  definirPesoSequenciamentoAction,
  decidirSequenciamentoAction,
  simularAlteracaoProgramacaoAction,
  type SimulacaoState,
} from "./actions";
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

type CapacidadeResumo = {
  recurso_produtivo_id: string;
  capacidade_disponivel_horas: number;
  capacidade_necessaria_horas_antes: number;
  capacidade_necessaria_horas_depois: number;
  classificacao_antes: string;
  classificacao_depois: string;
  operacao_antes?: RecomendacaoRow | null;
  operacao_depois?: RecomendacaoRow | null;
  outras_operacoes_afetadas: {
    ordem_producao_numero: string;
    descricao_operacao: string;
    classificacao_antes: string;
    classificacao_depois: string;
    posicao_antes: number;
    posicao_depois: number;
  }[];
};
type SimulacaoResultado = { recurso_atual: CapacidadeResumo; recurso_novo: CapacidadeResumo | null };

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

const DECISOES: { value: string; label: string }[] = [
  { value: "aceitar", label: "Aceitar" },
  { value: "modificar", label: "Modificar" },
  { value: "manual", label: "Definir manualmente" },
  { value: "rejeitar", label: "Rejeitar" },
  { value: "ignorar", label: "Ignorar" },
];

function num(v: number) {
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function ResumoRecurso({ titulo, resumo }: { titulo: string; resumo: CapacidadeResumo }) {
  return (
    <div style={{ marginTop: "4px" }}>
      <strong>{titulo}</strong>: {num(resumo.capacidade_necessaria_horas_antes)}h → {num(resumo.capacidade_necessaria_horas_depois)}h
      necessárias de {num(resumo.capacidade_disponivel_horas)}h disponíveis ({resumo.classificacao_antes} → {resumo.classificacao_depois})
      {resumo.operacao_depois && (
        <div>
          Operação simulada: {CLASSIFICACAO_LABEL[resumo.operacao_depois.classificacao]}, posição {resumo.operacao_depois.posicao_recomendada}ª —{" "}
          {resumo.operacao_depois.explicacao}
        </div>
      )}
      {resumo.outras_operacoes_afetadas.length > 0 && (
        <div>
          Outras operações afetadas:{" "}
          {resumo.outras_operacoes_afetadas
            .map((o) => `${o.ordem_producao_numero} (${o.classificacao_antes}→${o.classificacao_depois}, ${o.posicao_antes}ª→${o.posicao_depois}ª)`)
            .join("; ")}
        </div>
      )}
    </div>
  );
}

function SimulacaoForm({ opLoteOperacaoId, recursosOpcoes }: { opLoteOperacaoId: string; recursosOpcoes: RecursoProdutivo[] }) {
  const [state, formAction, pending] = useActionState<SimulacaoState, FormData>(simularAlteracaoProgramacaoAction, undefined);
  const resultado = state?.data as SimulacaoResultado | undefined;

  return (
    <div>
      <form action={formAction} style={{ display: "flex", flexWrap: "wrap", gap: "3px", alignItems: "center" }}>
        <input type="hidden" name="op_lote_operacao_id" value={opLoteOperacaoId} />
        <span style={{ color: "#1f5d57" }}>Simular:</span>
        <select name="novo_recurso_produtivo_id" defaultValue="" style={{ ...inputStyle, width: "110px", fontSize: "11px" }}>
          <option value="">recurso (opcional)</option>
          {recursosOpcoes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.codigo}
            </option>
          ))}
        </select>
        <input name="nova_data_planejada_inicio" type="date" style={{ ...inputStyle, width: "115px", fontSize: "11px" }} />
        <input name="nova_data_planejada_fim" type="date" style={{ ...inputStyle, width: "115px", fontSize: "11px" }} />
        <select name="nova_prioridade" defaultValue="" style={{ ...inputStyle, width: "90px", fontSize: "11px" }}>
          <option value="">prioridade (opc.)</option>
          {[1, 2, 3, 4, 5].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: "#6b7a75" }}>
          {pending ? "Simulando..." : "Simular"}
        </button>
      </form>
      {state?.error && <p style={{ color: "#9b2c2c", margin: "4px 0 0" }}>{state.error}</p>}
      {resultado && (
        <div style={{ marginTop: "4px", border: "1px dashed #dae2de", borderRadius: "4px", padding: "6px", color: "#3e4d49" }}>
          <em>Não altera a programação real — só pré-visualização.</em>
          <ResumoRecurso titulo="Recurso atual" resumo={resultado.recurso_atual} />
          {resultado.recurso_novo && <ResumoRecurso titulo="Recurso novo" resumo={resultado.recurso_novo} />}
        </div>
      )}
    </div>
  );
}

function OperacaoRecomendadaRow({
  l,
  recursosOpcoes,
  canManage,
}: {
  l: RecomendacaoRow;
  recursosOpcoes: RecursoProdutivo[];
  canManage: boolean;
}) {
  return (
    <>
      <tr style={{ borderBottom: "1px solid #f4f6f5", verticalAlign: "top" }}>
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
          {l.setup_compartilhado_count > 0 && <div style={{ color: "#6b7a75" }}>compartilha com {l.setup_compartilhado_count}</div>}
        </td>
        <td style={tdStyle}>
          {l.posicao_atual}ª → {l.posicao_recomendada}ª
        </td>
        <td style={tdStyle}>
          <span style={{ fontFamily: "monospace", color: CLASSIFICACAO_COLOR[l.classificacao] }}>{CLASSIFICACAO_LABEL[l.classificacao]}</span>
        </td>
        <td style={tdStyle}>{l.explicacao}</td>
      </tr>
      {canManage && (
      <tr style={{ borderBottom: "1px solid #eef1ef" }}>
        <td style={{ ...tdStyle, background: "#fafcfb" }} colSpan={7}>
          <form
            action={decidirSequenciamentoAction}
            style={{ display: "flex", flexWrap: "wrap", gap: "3px", alignItems: "center", marginBottom: "4px" }}
          >
            <input type="hidden" name="op_lote_operacao_id" value={l.op_lote_operacao_id} />
            <span style={{ color: "#1f5d57" }}>Decisão (§7):</span>
            <select name="decisao" required style={{ ...inputStyle, width: "150px", fontSize: "11px" }} defaultValue="">
              <option value="" disabled>
                escolha...
              </option>
              {DECISOES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <select name="novo_recurso_produtivo_id" defaultValue="" style={{ ...inputStyle, width: "110px", fontSize: "11px" }}>
              <option value="">recurso (se mudar)</option>
              {recursosOpcoes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.codigo}
                </option>
              ))}
            </select>
            <input name="nova_data_planejada_inicio" type="date" style={{ ...inputStyle, width: "115px", fontSize: "11px" }} />
            <input name="nova_data_planejada_fim" type="date" style={{ ...inputStyle, width: "115px", fontSize: "11px" }} />
            <select name="nova_prioridade" defaultValue="" style={{ ...inputStyle, width: "90px", fontSize: "11px" }}>
              <option value="">prioridade (opc.)</option>
              {[1, 2, 3, 4, 5].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "140px", fontSize: "11px" }} />
            <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px" }}>
              Registrar decisão
            </button>
          </form>
          <SimulacaoForm opLoteOperacaoId={l.op_lote_operacao_id} recursosOpcoes={recursosOpcoes} />
        </td>
      </tr>
      )}
    </>
  );
}

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
      <h2 style={sectionTitleStyle}>Sequenciamento inteligente (TÓPICO 4 §6-8)</h2>
      <p style={hintStyle}>
        Recomendação de ordem por recurso, baseada em regras e pesos configuráveis (prazo,
        prioridade e setup compartilhado) — não é IA autônoma nem otimização automática. O sistema
        recomenda e simula; a decisão de aceitar, rejeitar, modificar ou ignorar continua com o
        usuário autorizado (§7). Simular (§8) nunca altera a programação real — só pré-visualização,
        até o usuário confirmar registrando uma decisão.
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
          const recursosOpcoes = recursos.filter((rr) => rr.id !== r.id);
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
                    <OperacaoRecomendadaRow key={l.op_lote_operacao_id} l={l} recursosOpcoes={recursosOpcoes} canManage={canManage} />
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
