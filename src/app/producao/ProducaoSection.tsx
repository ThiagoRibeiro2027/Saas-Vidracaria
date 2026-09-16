"use client";

import {
  criarOrdemProducaoAction,
  apontarProducaoAction,
  concluirOrdemProducaoAction,
  cancelarOrdemProducaoAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string; tipo: string };
type Pedido = { id: string; numero: string; pessoa_id: string; obra_id: string | null };
type PedidoItem = { id: string; pedido_id: string; item_id: string; quantidade: number };
type OrdemProducao = {
  id: string;
  pedido_item_id: string;
  numero: string;
  quantidade_planejada: number;
  quantidade_produzida: number;
  quantidade_perdida: number;
  status: "planejada" | "em_producao" | "concluida" | "cancelada";
};
export type ListaCorteRow = {
  item_codigo: string;
  item_descricao: string;
  ambiente: string | null;
  largura_mm: number | null;
  altura_mm: number | null;
  quantidade: number;
  margem_quebra_percentual: number | null;
  responsavel: string | null;
  emitido_em: string;
};

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const STATUS_LABEL: Record<OrdemProducao["status"], string> = {
  planejada: "Planejada",
  em_producao: "Em produção",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const STATUS_COLOR: Record<OrdemProducao["status"], string> = {
  planejada: "#6b7a75",
  em_producao: "#1f5d57",
  concluida: "#1f5d57",
  cancelada: "#9b2c2c",
};

export default function ProducaoSection({
  pedidos,
  pedidoItensPorPedido,
  itens,
  pessoas,
  obras,
  ordemPorPedidoItem,
  bloqueioPorPedido,
  listaCortePorOrdem,
  canManage,
}: {
  pedidos: Pedido[];
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  itens: Item[];
  pessoas: Pessoa[];
  obras: Obra[];
  ordemPorPedidoItem: Map<string, OrdemProducao>;
  bloqueioPorPedido: Map<string, boolean>;
  listaCortePorOrdem: Map<string, ListaCorteRow[]>;
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  return (
    <section>
      <h2 style={sectionTitleStyle}>Pedidos liberados — itens e ordens de produção</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {pedidos.map((ped) => {
          const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];
          const bloqueado = bloqueioPorPedido.get(ped.id) ?? false;
          const itensComOP = itensDoPedido.filter((pi) => ordemPorPedidoItem.get(pi.id));

          return (
            <div key={ped.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "baseline", fontSize: "12px" }}
              >
                <strong style={{ fontSize: "13px" }}>{ped.numero}</strong>
                <span>{pessoaNome(ped.pessoa_id)}</span>
                <span style={{ color: "#6b7a75" }}>{obraNome(ped.obra_id)}</span>
                {bloqueado && (
                  <span style={{ color: "#b7791f" }}>
                    Bloqueado para produção: há item com medida em obra não confirmada (TÓPICO 16 §7).
                  </span>
                )}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "8px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                    <th style={thStyle}>Item</th>
                    <th style={thStyle}>Qtd. pedido</th>
                    <th style={thStyle}>OP</th>
                    <th style={thStyle}>Produzida</th>
                    <th style={thStyle}>Perdida</th>
                    {canManage && <th style={thStyle}></th>}
                  </tr>
                </thead>
                <tbody>
                  {itensDoPedido.map((pi) => {
                    const op = ordemPorPedidoItem.get(pi.id);
                    return (
                      <tr key={pi.id} style={{ borderBottom: "1px solid #f4f6f5", verticalAlign: "top" }}>
                        <td style={tdStyle}>{itemLabel(pi.item_id)}</td>
                        <td style={tdStyle}>{num(pi.quantidade)}</td>
                        <td style={tdStyle}>
                          {op ? (
                            <>
                              <div>{op.numero}</div>
                              <div style={{ fontFamily: "monospace", color: STATUS_COLOR[op.status] }}>
                                {STATUS_LABEL[op.status]}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: "#6b7a75" }}>Sem OP</span>
                          )}
                        </td>
                        <td style={tdStyle}>{op ? num(op.quantidade_produzida) : "—"}</td>
                        <td style={tdStyle}>{op ? num(op.quantidade_perdida) : "—"}</td>
                        {canManage && (
                          <td style={tdStyle}>
                            {!op && (
                              <form action={criarOrdemProducaoAction}>
                                <input type="hidden" name="pedido_item_id" value={pi.id} />
                                <button type="submit" style={buttonStyle} disabled={bloqueado}>
                                  Criar OP
                                </button>
                              </form>
                            )}
                            {op && (op.status === "planejada" || op.status === "em_producao") && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                <form
                                  action={apontarProducaoAction}
                                  style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}
                                >
                                  <input type="hidden" name="ordem_producao_id" value={op.id} />
                                  <input
                                    name="quantidade_produzida"
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    placeholder="produzida"
                                    style={{ ...inputStyle, width: "70px" }}
                                  />
                                  <input
                                    name="quantidade_perdida"
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    placeholder="perdida"
                                    style={{ ...inputStyle, width: "70px" }}
                                  />
                                  <input
                                    name="observacao"
                                    placeholder="observação (opcional)"
                                    style={{ ...inputStyle, width: "140px" }}
                                  />
                                  <button type="submit" style={buttonStyle}>
                                    Apontar
                                  </button>
                                </form>
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <form action={concluirOrdemProducaoAction}>
                                    <input type="hidden" name="ordem_producao_id" value={op.id} />
                                    <button
                                      type="submit"
                                      style={buttonStyle}
                                      disabled={op.quantidade_produzida < op.quantidade_planejada}
                                    >
                                      Concluir
                                    </button>
                                  </form>
                                  <form action={cancelarOrdemProducaoAction}>
                                    <input type="hidden" name="ordem_producao_id" value={op.id} />
                                    <input type="hidden" name="motivo" value="Cancelada pelo operador" />
                                    <button type="submit" style={{ ...buttonStyle, background: "#6b7a75" }}>
                                      Cancelar
                                    </button>
                                  </form>
                                </div>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {itensDoPedido.length === 0 && (
                    <tr>
                      <td style={tdStyle} colSpan={canManage ? 6 : 5}>
                        <span style={{ color: "#6b7a75" }}>Pedido sem itens.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {itensComOP.length > 0 && (
                <details style={{ marginTop: "8px" }}>
                  <summary style={{ fontSize: "12px", color: "#1f5d57", cursor: "pointer" }}>Lista de corte</summary>
                  {itensComOP.map((pi) => {
                    const op = ordemPorPedidoItem.get(pi.id)!;
                    const rows = listaCortePorOrdem.get(op.id) ?? [];
                    const primeira = rows[0];
                    return (
                      <div key={op.id} style={{ marginTop: "6px" }}>
                        <p style={hintStyle}>
                          OP {op.numero}
                          {primeira &&
                            ` — emitida por ${primeira.responsavel ?? "—"} em ${new Date(
                              primeira.emitido_em,
                            ).toLocaleString("pt-BR")}`}
                        </p>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                          <thead>
                            <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                              <th style={thStyle}>Item</th>
                              <th style={thStyle}>Ambiente</th>
                              <th style={thStyle}>Largura (mm)</th>
                              <th style={thStyle}>Altura (mm)</th>
                              <th style={thStyle}>Qtd.</th>
                              <th style={thStyle}>Margem de quebra</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, idx) => (
                              <tr key={idx} style={{ borderBottom: "1px solid #f4f6f5" }}>
                                <td style={tdStyle}>
                                  {row.item_codigo} — {row.item_descricao}
                                </td>
                                <td style={tdStyle}>{row.ambiente ?? "—"}</td>
                                <td style={tdStyle}>{row.largura_mm != null ? num(row.largura_mm) : "—"}</td>
                                <td style={tdStyle}>{row.altura_mm != null ? num(row.altura_mm) : "—"}</td>
                                <td style={tdStyle}>{num(row.quantidade)}</td>
                                <td style={tdStyle}>
                                  {row.margem_quebra_percentual != null
                                    ? `${num(row.margem_quebra_percentual)}%`
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                            {rows.length === 0 && (
                              <tr>
                                <td style={tdStyle} colSpan={6}>
                                  <span style={{ color: "#6b7a75" }}>Sem dados de medida para este item.</span>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </details>
              )}
            </div>
          );
        })}
        {pedidos.length === 0 && (
          <p style={hintStyle}>Nenhum pedido liberado ainda — a produção só entra depois da liberação (TÓPICO 3).</p>
        )}
      </div>
    </section>
  );
}
