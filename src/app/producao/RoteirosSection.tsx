"use client";

import {
  criarRoteiroProdutivoAction,
  adicionarOperacaoRoteiroAction,
  removerOperacaoRoteiroAction,
  desativarRoteiroAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type Item = { id: string; codigo: string; descricao: string; tipo: string };
type Roteiro = { id: string; item_id: string; nome: string; ativo: boolean };
type RoteiroOperacao = {
  id: string;
  roteiro_id: string;
  sequencia: number;
  descricao: string;
  recurso_produtivo_id: string | null;
  tempo_previsto_minutos: number | null;
  requisitos: string | null;
  criterios_qualidade: string | null;
  equipamentos_alternativos: string | null;
  perfil: string | null;
  ferramenta: string | null;
  processo: string | null;
};
type RecursoProdutivo = { id: string; codigo: string; nome: string };

export default function RoteirosSection({
  itens,
  roteiros,
  operacoesPorRoteiro,
  recursos,
  canManage,
}: {
  itens: Item[];
  roteiros: Roteiro[];
  operacoesPorRoteiro: Map<string, RoteiroOperacao[]>;
  recursos: RecursoProdutivo[];
  canManage: boolean;
}) {
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };
  const recursoLabel = (id: string | null) => {
    if (!id) return "—";
    const r = recursos.find((rr) => rr.id === id);
    return r ? `${r.codigo} — ${r.nome}` : "(recurso removido)";
  };

  const roteirosPorItem = new Map<string, Roteiro[]>();
  for (const r of roteiros) {
    const list = roteirosPorItem.get(r.item_id) ?? [];
    list.push(r);
    roteirosPorItem.set(r.item_id, list);
  }

  return (
    <section>
      <h2 style={sectionTitleStyle}>Roteiros produtivos (TÓPICO 4 §15)</h2>
      <p style={hintStyle}>
        Sequência de operações (Corte → Usinagem → Montagem → Inspeção, por exemplo) que toda nova
        ordem de produção desse item vai seguir. Item sem roteiro ativo gera OP com uma única
        operação genérica &quot;Produção&quot; — configurar um roteiro aqui é opcional. Perfil/
        ferramenta/processo (opcionais) são usados pelo Sequenciamento (§6) pra detectar setup
        compartilhado entre operações pendentes do mesmo recurso.
      </p>

      {canManage && (
        <form
          action={criarRoteiroProdutivoAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "16px" }}
        >
          <select name="item_id" required style={{ ...inputStyle, width: "260px" }}>
            <option value="">Selecione o item...</option>
            {itens.map((it) => (
              <option key={it.id} value={it.id}>
                {it.codigo} — {it.descricao}
              </option>
            ))}
          </select>
          <input name="nome" placeholder="Nome do roteiro" required style={{ ...inputStyle, width: "180px" }} />
          <button type="submit" style={buttonStyle}>
            Criar roteiro
          </button>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {[...roteirosPorItem.entries()].map(([itemId, rs]) => (
          <div key={itemId} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
            <strong style={{ fontSize: "13px" }}>{itemLabel(itemId)}</strong>
            {rs.map((r) => {
              const operacoes = (operacoesPorRoteiro.get(r.id) ?? []).slice().sort((a, b) => a.sequencia - b.sequencia);
              return (
                <div key={r.id} style={{ marginTop: "8px", opacity: r.ativo ? 1 : 0.55 }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "baseline", fontSize: "12px" }}>
                    <span>{r.nome}</span>
                    <span style={{ color: r.ativo ? "#1f5d57" : "#6b7a75", fontFamily: "monospace" }}>
                      {r.ativo ? "Ativo" : "Inativo"}
                    </span>
                    {canManage && r.ativo && (
                      <form action={desativarRoteiroAction}>
                        <input type="hidden" name="roteiro_id" value={r.id} />
                        <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: "#6b7a75" }}>
                          Desativar
                        </button>
                      </form>
                    )}
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "6px" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                        <th style={thStyle}>Seq.</th>
                        <th style={thStyle}>Operação</th>
                        <th style={thStyle}>Recurso</th>
                        <th style={thStyle}>Tempo prev. (min)</th>
                        <th style={thStyle}>Setup (perfil/ferramenta/processo)</th>
                        {canManage && <th style={thStyle}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {operacoes.map((op) => (
                        <tr key={op.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                          <td style={tdStyle}>{op.sequencia}</td>
                          <td style={tdStyle}>{op.descricao}</td>
                          <td style={tdStyle}>{recursoLabel(op.recurso_produtivo_id)}</td>
                          <td style={tdStyle}>{op.tempo_previsto_minutos ?? "—"}</td>
                          <td style={tdStyle}>
                            {op.perfil || op.ferramenta || op.processo
                              ? [op.perfil, op.ferramenta, op.processo].filter(Boolean).join(" / ")
                              : "—"}
                          </td>
                          {canManage && (
                            <td style={tdStyle}>
                              <form action={removerOperacaoRoteiroAction}>
                                <input type="hidden" name="roteiro_operacao_id" value={op.id} />
                                <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: "#9b2c2c" }}>
                                  Remover
                                </button>
                              </form>
                            </td>
                          )}
                      </tr>
                      ))}
                      {operacoes.length === 0 && (
                        <tr>
                          <td style={tdStyle} colSpan={canManage ? 6 : 5}>
                            <span style={{ color: "#6b7a75" }}>Roteiro sem operações ainda.</span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {canManage && r.ativo && (
                    <form
                      action={adicionarOperacaoRoteiroAction}
                      style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px", alignItems: "center" }}
                    >
                      <input type="hidden" name="roteiro_id" value={r.id} />
                      <input name="sequencia" type="number" min="1" step="1" placeholder="seq." required style={{ ...inputStyle, width: "50px" }} />
                      <input name="descricao" placeholder="descrição" required style={{ ...inputStyle, width: "120px" }} />
                      <select name="recurso_produtivo_id" style={{ ...inputStyle, width: "150px" }} defaultValue="">
                        <option value="">Recurso (opcional)</option>
                        {recursos.map((rec) => (
                          <option key={rec.id} value={rec.id}>
                            {rec.codigo} — {rec.nome}
                          </option>
                        ))}
                      </select>
                      <input name="tempo_previsto_minutos" type="number" min="0" step="0.01" placeholder="min (opcional)" style={{ ...inputStyle, width: "90px" }} />
                      <input name="perfil" placeholder="perfil (opcional)" style={{ ...inputStyle, width: "100px" }} />
                      <input name="ferramenta" placeholder="ferramenta (opcional)" style={{ ...inputStyle, width: "100px" }} />
                      <input name="processo" placeholder="processo (opcional)" style={{ ...inputStyle, width: "100px" }} />
                      <button type="submit" style={buttonStyle}>
                        Adicionar operação
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {roteirosPorItem.size === 0 && <p style={hintStyle}>Nenhum roteiro configurado ainda.</p>}
      </div>
    </section>
  );
}
