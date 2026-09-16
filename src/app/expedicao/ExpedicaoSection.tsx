"use client";

import {
  criarExpedicaoAction,
  adicionarItemExpedicaoAction,
  removerItemExpedicaoAction,
  conferirExpedicaoAction,
  registrarSaidaExpedicaoAction,
  cancelarExpedicaoAction,
  confirmarEntregaItemExpedicaoAction,
  registrarOcorrenciaExpedicaoAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string };
type Pedido = { id: string; numero: string; pessoa_id: string; obra_id: string | null };
type PedidoItem = { id: string; pedido_id: string; item_id: string; quantidade: number };
type OrdemProducao = {
  id: string;
  pedido_item_id: string;
  status: string;
  status_qualidade: "pendente" | "aprovado" | "bloqueado";
  quantidade_produzida: number;
};
type Expedicao = {
  id: string;
  pedido_id: string;
  numero: string;
  status: "preparando" | "conferida" | "expedida" | "cancelada";
  motivo_cancelamento: string | null;
};
type ExpedicaoItem = {
  id: string;
  expedicao_id: string;
  pedido_item_id: string;
  quantidade: number;
  quantidade_entregue: number;
  quantidade_pendente: number;
};
type Ocorrencia = { id: string; expedicao_id: string; descricao: string; registrado_em: string };

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const STATUS_LABEL: Record<Expedicao["status"], string> = {
  preparando: "Preparando",
  conferida: "Conferida",
  expedida: "Expedida",
  cancelada: "Cancelada",
};

const STATUS_COLOR: Record<Expedicao["status"], string> = {
  preparando: "#6b7a75",
  conferida: "#1f5d57",
  expedida: "#1f5d57",
  cancelada: "#9b2c2c",
};

export default function ExpedicaoSection({
  pedidos,
  pedidoItensPorPedido,
  itens,
  pessoas,
  obras,
  ordemPorPedidoItem,
  expedicoesPorPedido,
  itensPorExpedicao,
  ocorrenciasPorExpedicao,
  jaUsadoPorPedidoItem,
  canManage,
}: {
  pedidos: Pedido[];
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  itens: Item[];
  pessoas: Pessoa[];
  obras: Obra[];
  ordemPorPedidoItem: Map<string, OrdemProducao>;
  expedicoesPorPedido: Map<string, Expedicao[]>;
  itensPorExpedicao: Map<string, ExpedicaoItem[]>;
  ocorrenciasPorExpedicao: Map<string, Ocorrencia[]>;
  jaUsadoPorPedidoItem: Map<string, number>;
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabel = (itemId: string) => {
    const it = itens.find((i) => i.id === itemId);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  return (
    <section>
      <h2 style={sectionTitleStyle}>Pedidos liberados — expedições</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {pedidos.map((ped) => {
          const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];
          const expedicoes = expedicoesPorPedido.get(ped.id) ?? [];

          const itensElegiveis = itensDoPedido
            .map((pi) => {
              const op = ordemPorPedidoItem.get(pi.id);
              const jaUsado = jaUsadoPorPedidoItem.get(pi.id) ?? 0;
              const disponivel = op && op.status === "concluida" && op.status_qualidade === "aprovado"
                ? Number(op.quantidade_produzida) - jaUsado
                : 0;
              return { pedidoItem: pi, disponivel };
            })
            .filter((x) => x.disponivel > 0);

          return (
            <div key={ped.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "baseline", fontSize: "12px" }}
              >
                <strong style={{ fontSize: "13px" }}>{ped.numero}</strong>
                <span>{pessoaNome(ped.pessoa_id)}</span>
                <span style={{ color: "#6b7a75" }}>{obraNome(ped.obra_id)}</span>
                {canManage && (
                  <form action={criarExpedicaoAction}>
                    <input type="hidden" name="pedido_id" value={ped.id} />
                    <button type="submit" style={buttonStyle}>
                      Nova expedição
                    </button>
                  </form>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                {expedicoes.map((exp) => {
                  const expItens = itensPorExpedicao.get(exp.id) ?? [];
                  const ocorrencias = ocorrenciasPorExpedicao.get(exp.id) ?? [];

                  return (
                    <div key={exp.id} style={{ border: "1px solid #eef1ef", borderRadius: "6px", padding: "8px 10px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "baseline", fontSize: "12px" }}>
                        <strong>{exp.numero}</strong>
                        <span style={{ fontFamily: "monospace", color: STATUS_COLOR[exp.status] }}>
                          {STATUS_LABEL[exp.status]}
                        </span>
                        {exp.status === "cancelada" && exp.motivo_cancelamento && (
                          <span style={{ color: "#6b7a75" }}>Motivo: {exp.motivo_cancelamento}</span>
                        )}
                      </div>

                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "6px" }}>
                        <thead>
                          <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                            <th style={thStyle}>Item</th>
                            <th style={thStyle}>Qtd.</th>
                            <th style={thStyle}>Entregue</th>
                            <th style={thStyle}>Pendente</th>
                            {canManage && <th style={thStyle}></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {expItens.map((ei) => {
                            const pi = itensDoPedido.find((p) => p.id === ei.pedido_item_id);
                            return (
                              <tr key={ei.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                                <td style={tdStyle}>{pi ? itemLabel(pi.item_id) : "(item removido)"}</td>
                                <td style={tdStyle}>{num(ei.quantidade)}</td>
                                <td style={tdStyle}>{num(ei.quantidade_entregue)}</td>
                                <td style={tdStyle}>{num(ei.quantidade_pendente)}</td>
                                {canManage && (
                                  <td style={tdStyle}>
                                    {exp.status === "preparando" && (
                                      <form action={removerItemExpedicaoAction}>
                                        <input type="hidden" name="id" value={ei.id} />
                                        <button type="submit" style={{ ...buttonStyle, background: "#6b7a75" }}>
                                          Remover
                                        </button>
                                      </form>
                                    )}
                                    {exp.status === "expedida" && ei.quantidade_pendente > 0 && (
                                      <form
                                        action={confirmarEntregaItemExpedicaoAction}
                                        style={{ display: "flex", gap: "4px" }}
                                      >
                                        <input type="hidden" name="id" value={ei.id} />
                                        <input
                                          name="quantidade_entregue"
                                          type="number"
                                          step="0.001"
                                          min="0.001"
                                          max={ei.quantidade_pendente}
                                          placeholder="entregue"
                                          required
                                          style={{ ...inputStyle, width: "70px" }}
                                        />
                                        <button type="submit" style={buttonStyle}>
                                          Confirmar entrega
                                        </button>
                                      </form>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                          {expItens.length === 0 && (
                            <tr>
                              <td style={tdStyle} colSpan={canManage ? 5 : 4}>
                                <span style={{ color: "#6b7a75" }}>Sem itens separados ainda.</span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                      {canManage && exp.status === "preparando" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                          {itensElegiveis.length > 0 && (
                            <form
                              action={adicionarItemExpedicaoAction}
                              style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}
                            >
                              <input type="hidden" name="expedicao_id" value={exp.id} />
                              <select name="pedido_item_id" defaultValue="" required style={inputStyle}>
                                <option value="" disabled>
                                  Item disponível
                                </option>
                                {itensElegiveis.map(({ pedidoItem, disponivel }) => (
                                  <option key={pedidoItem.id} value={pedidoItem.id}>
                                    {itemLabel(pedidoItem.item_id)} (disponível: {num(disponivel)})
                                  </option>
                                ))}
                              </select>
                              <input
                                name="quantidade"
                                type="number"
                                step="0.001"
                                min="0.001"
                                placeholder="quantidade"
                                required
                                style={{ ...inputStyle, width: "80px" }}
                              />
                              <button type="submit" style={buttonStyle}>
                                Adicionar item
                              </button>
                            </form>
                          )}
                          <div style={{ display: "flex", gap: "6px" }}>
                            <form action={conferirExpedicaoAction}>
                              <input type="hidden" name="expedicao_id" value={exp.id} />
                              <button type="submit" style={buttonStyle} disabled={expItens.length === 0}>
                                Conferir
                              </button>
                            </form>
                            <form
                              action={cancelarExpedicaoAction}
                              style={{ display: "flex", gap: "4px", alignItems: "center" }}
                            >
                              <input type="hidden" name="expedicao_id" value={exp.id} />
                              <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "140px" }} />
                              <button type="submit" style={{ ...buttonStyle, background: "#6b7a75" }}>
                                Cancelar
                              </button>
                            </form>
                          </div>
                        </div>
                      )}

                      {canManage && exp.status === "conferida" && (
                        <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                          <form action={registrarSaidaExpedicaoAction}>
                            <input type="hidden" name="expedicao_id" value={exp.id} />
                            <button type="submit" style={buttonStyle}>
                              Registrar saída
                            </button>
                          </form>
                          <form
                            action={cancelarExpedicaoAction}
                            style={{ display: "flex", gap: "4px", alignItems: "center" }}
                          >
                            <input type="hidden" name="expedicao_id" value={exp.id} />
                            <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "140px" }} />
                            <button type="submit" style={{ ...buttonStyle, background: "#6b7a75" }}>
                              Cancelar
                            </button>
                          </form>
                        </div>
                      )}

                      <div style={{ marginTop: "8px" }}>
                        <p style={{ ...hintStyle, margin: "0 0 4px" }}>Ocorrências</p>
                        {ocorrencias.map((oc) => (
                          <p key={oc.id} style={{ fontSize: "12px", margin: "0 0 2px" }}>
                            <span style={{ color: "#6b7a75" }}>
                              {new Date(oc.registrado_em).toLocaleString("pt-BR")} —{" "}
                            </span>
                            {oc.descricao}
                          </p>
                        ))}
                        {ocorrencias.length === 0 && <p style={{ ...hintStyle, margin: 0 }}>Nenhuma registrada.</p>}
                        {canManage && exp.status !== "cancelada" && (
                          <form
                            action={registrarOcorrenciaExpedicaoAction}
                            style={{ display: "flex", gap: "4px", marginTop: "4px" }}
                          >
                            <input type="hidden" name="expedicao_id" value={exp.id} />
                            <input
                              name="descricao"
                              placeholder="descrever ocorrência"
                              required
                              style={{ ...inputStyle, flex: 1 }}
                            />
                            <button type="submit" style={buttonStyle}>
                              Registrar ocorrência
                            </button>
                          </form>
                        )}
                      </div>

                      {expItens.length > 0 && (
                        <details style={{ marginTop: "8px" }}>
                          <summary style={{ fontSize: "12px", color: "#1f5d57", cursor: "pointer" }}>Romaneio</summary>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "6px" }}>
                            <thead>
                              <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                                <th style={thStyle}>Pedido</th>
                                <th style={thStyle}>Cliente</th>
                                <th style={thStyle}>Item</th>
                                <th style={thStyle}>Qtd.</th>
                                <th style={thStyle}>Entregue</th>
                                <th style={thStyle}>Pendente</th>
                              </tr>
                            </thead>
                            <tbody>
                              {expItens.map((ei) => {
                                const pi = itensDoPedido.find((p) => p.id === ei.pedido_item_id);
                                return (
                                  <tr key={ei.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                                    <td style={tdStyle}>{ped.numero}</td>
                                    <td style={tdStyle}>{pessoaNome(ped.pessoa_id)}</td>
                                    <td style={tdStyle}>{pi ? itemLabel(pi.item_id) : "(item removido)"}</td>
                                    <td style={tdStyle}>{num(ei.quantidade)}</td>
                                    <td style={tdStyle}>{num(ei.quantidade_entregue)}</td>
                                    <td style={tdStyle}>{num(ei.quantidade_pendente)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </details>
                      )}
                    </div>
                  );
                })}
                {expedicoes.length === 0 && (
                  <p style={hintStyle}>Nenhuma expedição criada ainda para este pedido.</p>
                )}
              </div>
            </div>
          );
        })}
        {pedidos.length === 0 && (
          <p style={hintStyle}>Nenhum pedido liberado ainda — a expedição só entra depois da liberação (TÓPICO 3).</p>
        )}
      </div>
    </section>
  );
}
