"use client";

import {
  criarRecursoProdutivoAction,
  atualizarSituacaoRecursoAction,
  desativarRecursoProdutivoAction,
  programarManutencaoPreventivaAction,
  cancelarManutencaoPreventivaAction,
  iniciarManutencaoCorretivaAction,
  encerrarManutencaoCorretivaAction,
  trocarRecursoOperacaoAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type RecursoProdutivo = {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  setor: string | null;
  localizacao: string | null;
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
export type ManutencaoPreventivaRow = {
  id: string;
  recurso_produtivo_id: string;
  tipo: string;
  periodicidade_dias: number | null;
  proxima_data: string;
  duracao_estimada_horas: number | null;
};
export type ManutencaoCorretivaRow = {
  id: string;
  recurso_produtivo_id: string;
  inicio_parada: string;
  problema: string;
  motivo: string | null;
  status: "aberta" | "encerrada";
};
export type ImpactoManutencaoRow = {
  origem: "operacao" | "split_recurso";
  op_lote_operacao_id: string;
  op_lote_operacao_recurso_id: string | null;
  ordem_producao_numero: string;
  descricao_operacao: string;
  saldo_pendente: number;
  impacto_horas: number | null;
};
type RecursoAlternativo = { id: string; codigo: string; nome: string };
export type GargaloRow = {
  recurso_produtivo_id: string;
  codigo: string;
  nome: string;
  tipo: string;
  capacidade_disponivel_horas: number;
  capacidade_necessaria_horas: number;
  saldo_horas: number;
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
  preventivasPorRecurso,
  corretivaAbertaPorRecurso,
  impactoPorRecurso,
  alternativosPorRecurso,
  gargalos,
  canManage,
}: {
  recursos: RecursoProdutivo[];
  capacidadePorRecurso: Map<string, CapacidadeRecursoRow>;
  preventivasPorRecurso: Map<string, ManutencaoPreventivaRow[]>;
  corretivaAbertaPorRecurso: Map<string, ManutencaoCorretivaRow>;
  impactoPorRecurso: Map<string, ImpactoManutencaoRow[]>;
  alternativosPorRecurso: Map<string, RecursoAlternativo[]>;
  gargalos: GargaloRow[];
  canManage: boolean;
}) {
  return (
    <section>
      {gargalos.length > 0 && (
        <div style={{ border: "1px solid #9b2c2c", borderRadius: "6px", padding: "10px 12px", marginBottom: "16px" }}>
          <strong style={{ fontSize: "12px", color: "#9b2c2c" }}>
            Gargalos (TÓPICO 4 §37) — {gargalos.length} recurso(s) com necessidade acima da capacidade disponível
          </strong>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "6px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                <th style={thStyle}>Recurso</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Disponível (h)</th>
                <th style={thStyle}>Necessário (h)</th>
                <th style={thStyle}>Déficit (h)</th>
                <th style={thStyle}>Operações em risco</th>
              </tr>
            </thead>
            <tbody>
              {gargalos.map((g) => {
                const impacto = impactoPorRecurso.get(g.recurso_produtivo_id) ?? [];
                return (
                  <tr key={g.recurso_produtivo_id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                    <td style={tdStyle}>
                      {g.codigo} — {g.nome}
                    </td>
                    <td style={tdStyle}>{TIPO_LABEL[g.tipo] ?? g.tipo}</td>
                    <td style={tdStyle}>{num(g.capacidade_disponivel_horas)}</td>
                    <td style={tdStyle}>{num(g.capacidade_necessaria_horas)}</td>
                    <td style={tdStyle}>{num(Math.abs(g.saldo_horas))}</td>
                    <td style={tdStyle}>
                      {impacto.length === 0
                        ? "—"
                        : impacto.map((i) => `${i.ordem_producao_numero} (${num(i.saldo_pendente)})`).join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
          <input name="localizacao" placeholder="Localização (opcional)" style={{ ...inputStyle, width: "110px" }} />
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
                  {(r.setor || r.localizacao) && (
                    <div style={{ color: "#6b7a75", fontSize: "11px" }}>
                      {[r.setor, r.localizacao].filter(Boolean).join(" — ")}
                    </div>
                  )}
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

      <h3 style={{ ...sectionTitleStyle, fontSize: "13px", marginTop: "20px" }}>
        Manutenção e impacto no PCP (TÓPICO 4 §33-36)
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {recursos.map((r) => {
          const corretiva = corretivaAbertaPorRecurso.get(r.id);
          const preventivas = preventivasPorRecurso.get(r.id) ?? [];
          const impacto = impactoPorRecurso.get(r.id) ?? [];
          const alternativos = alternativosPorRecurso.get(r.id) ?? [];

          return (
            <div key={r.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "8px 10px" }}>
              <strong style={{ fontSize: "12px" }}>
                {r.codigo} — {r.nome}
              </strong>

              <div style={{ marginTop: "6px" }}>
                {corretiva ? (
                  <div>
                    <p style={{ ...hintStyle, color: "#9b2c2c", margin: 0 }}>
                      Corretiva aberta desde {new Date(corretiva.inicio_parada).toLocaleString("pt-BR")}: {corretiva.problema}
                      {corretiva.motivo && ` (${corretiva.motivo})`}
                    </p>
                    {canManage && (
                      <form
                        action={encerrarManutencaoCorretivaAction}
                        style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "4px", alignItems: "center" }}
                      >
                        <input type="hidden" name="id" value={corretiva.id} />
                        <input name="pecas" placeholder="peças (opcional)" style={{ ...inputStyle, width: "100px", fontSize: "11px" }} />
                        <input name="servicos" placeholder="serviços (opcional)" style={{ ...inputStyle, width: "100px", fontSize: "11px" }} />
                        <input name="observacoes" placeholder="observações (opcional)" style={{ ...inputStyle, width: "120px", fontSize: "11px" }} />
                        <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px" }}>
                          Encerrar corretiva
                        </button>
                      </form>
                    )}
                  </div>
                ) : (
                  canManage && (
                    <form
                      action={iniciarManutencaoCorretivaAction}
                      style={{ display: "flex", flexWrap: "wrap", gap: "3px", alignItems: "center" }}
                    >
                      <input type="hidden" name="recurso_produtivo_id" value={r.id} />
                      <input name="problema" placeholder="problema" required style={{ ...inputStyle, width: "140px", fontSize: "11px" }} />
                      <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "110px", fontSize: "11px" }} />
                      <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: "#9b2c2c" }}>
                        Iniciar corretiva
                      </button>
                    </form>
                  )
                )}
              </div>

              <details style={{ marginTop: "6px" }}>
                <summary style={{ fontSize: "11px", color: "#1f5d57", cursor: "pointer" }}>
                  Manutenção preventiva ({preventivas.length})
                </summary>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "4px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                      <th style={thStyle}>Tipo</th>
                      <th style={thStyle}>Próxima data</th>
                      <th style={thStyle}>Periodicidade (dias)</th>
                      <th style={thStyle}>Duração (h)</th>
                      {canManage && <th style={thStyle}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {preventivas.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                        <td style={tdStyle}>{p.tipo}</td>
                        <td style={tdStyle}>{new Date(p.proxima_data).toLocaleDateString("pt-BR")}</td>
                        <td style={tdStyle}>{p.periodicidade_dias ?? "—"}</td>
                        <td style={tdStyle}>{p.duracao_estimada_horas ?? "—"}</td>
                        {canManage && (
                          <td style={tdStyle}>
                            <form action={cancelarManutencaoPreventivaAction}>
                              <input type="hidden" name="id" value={p.id} />
                              <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: "#6b7a75" }}>
                                Cancelar
                              </button>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                    {preventivas.length === 0 && (
                      <tr>
                        <td style={tdStyle} colSpan={canManage ? 5 : 4}>
                          <span style={{ color: "#6b7a75" }}>Nenhuma manutenção preventiva programada.</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {canManage && (
                  <form
                    action={programarManutencaoPreventivaAction}
                    style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "4px", alignItems: "center" }}
                  >
                    <input type="hidden" name="recurso_produtivo_id" value={r.id} />
                    <input name="tipo" placeholder="tipo" required style={{ ...inputStyle, width: "100px", fontSize: "11px" }} />
                    <input name="proxima_data" type="date" required style={{ ...inputStyle, width: "130px", fontSize: "11px" }} />
                    <input
                      name="periodicidade_dias"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="período (dias, opc.)"
                      style={{ ...inputStyle, width: "110px", fontSize: "11px" }}
                    />
                    <input
                      name="duracao_estimada_horas"
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="duração h (opc.)"
                      style={{ ...inputStyle, width: "100px", fontSize: "11px" }}
                    />
                    <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px" }}>
                      Programar
                    </button>
                  </form>
                )}
              </details>

              <details style={{ marginTop: "6px" }}>
                <summary style={{ fontSize: "11px", color: "#1f5d57", cursor: "pointer" }}>
                  Análise de impacto ({impacto.length} operação(ões) pendente(s))
                </summary>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "4px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                      <th style={thStyle}>OP</th>
                      <th style={thStyle}>Operação</th>
                      <th style={thStyle}>Saldo pendente</th>
                      <th style={thStyle}>Impacto (h)</th>
                      {canManage && <th style={thStyle}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {impacto.map((i, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f4f6f5" }}>
                        <td style={tdStyle}>{i.ordem_producao_numero}</td>
                        <td style={tdStyle}>{i.descricao_operacao}</td>
                        <td style={tdStyle}>{num(i.saldo_pendente)}</td>
                        <td style={tdStyle}>{i.impacto_horas != null ? num(i.impacto_horas) : "—"}</td>
                        {canManage && (
                          <td style={tdStyle}>
                            {i.origem === "operacao" && alternativos.length > 0 && (
                              <form
                                action={trocarRecursoOperacaoAction}
                                style={{ display: "flex", flexWrap: "wrap", gap: "3px", alignItems: "center" }}
                              >
                                <input type="hidden" name="op_lote_operacao_id" value={i.op_lote_operacao_id} />
                                <select name="novo_recurso_produtivo_id" required style={{ ...inputStyle, width: "130px", fontSize: "11px" }}>
                                  <option value="">Trocar pra...</option>
                                  {alternativos.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.codigo} — {a.nome}
                                    </option>
                                  ))}
                                </select>
                                <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px" }}>
                                  Trocar
                                </button>
                              </form>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {impacto.length === 0 && (
                      <tr>
                        <td style={tdStyle} colSpan={canManage ? 5 : 4}>
                          <span style={{ color: "#6b7a75" }}>Nenhuma operação pendente usando este recurso.</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </details>
            </div>
          );
        })}
        {recursos.length === 0 && <p style={hintStyle}>Nenhum recurso produtivo cadastrado ainda.</p>}
      </div>
    </section>
  );
}
