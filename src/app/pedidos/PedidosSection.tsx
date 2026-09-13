"use client";

import {
  converterOrcamentoAction,
  iniciarConferenciaAction,
  abrirPendenciaAction,
  resolverPendenciaAction,
  liberarPedidoAction,
  cancelarPedidoAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string };

type Orcamento = {
  id: string;
  numero: string;
  pessoa_id: string;
  obra_id: string | null;
};

type OrcamentoItem = { item_id: string; quantidade: number; preco_unitario: number };

type Pedido = {
  id: string;
  numero: string;
  orcamento_id: string;
  pessoa_id: string;
  obra_id: string | null;
  data_pedido: string;
  previsao_entrega: string | null;
  status: "recebido" | "em_conferencia" | "pendente" | "liberado" | "cancelado";
};

type PedidoItem = { id: string; item_id: string; quantidade: number; preco_unitario: number };

type Pendencia = {
  id: string;
  pedido_id: string;
  descricao: string;
  aberta_em: string;
  resolvida: boolean;
  resolucao: string | null;
};

const STATUS_LABEL: Record<Pedido["status"], string> = {
  recebido: "Recebido",
  em_conferencia: "Em conferência",
  pendente: "Pendente",
  liberado: "Liberado",
  cancelado: "Cancelado",
};

const STATUS_COLOR: Record<Pedido["status"], string> = {
  recebido: "#6b7a75",
  em_conferencia: "#1f5d57",
  pendente: "#b7791f",
  liberado: "#1f5d57",
  cancelado: "#9b2c2c",
};

export default function PedidosSection({
  pedidos,
  itensPorPedido,
  pendenciasPorPedido,
  numeroOrcamentoPorId,
  orcamentosDisponiveis,
  itensPorOrcamento,
  pessoas,
  obras,
  itens,
  canManage,
}: {
  pedidos: Pedido[];
  itensPorPedido: Map<string, PedidoItem[]>;
  pendenciasPorPedido: Map<string, Pendencia[]>;
  numeroOrcamentoPorId: Map<string, string>;
  orcamentosDisponiveis: Orcamento[];
  itensPorOrcamento: Map<string, OrcamentoItem[]>;
  pessoas: Pessoa[];
  obras: Obra[];
  itens: Item[];
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  return (
    <>
      {canManage && (
        <section>
          <h2 style={sectionTitleStyle}>Orçamentos aprovados aguardando conversão</h2>
          {orcamentosDisponiveis.length === 0 ? (
            <p style={hintStyle}>Nenhum orçamento aprovado pendente de conversão.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {orcamentosDisponiveis.map((orc) => {
                const orcItens = itensPorOrcamento.get(orc.id) ?? [];
                return (
                  <div
                    key={orc.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                      alignItems: "center",
                      fontSize: "12px",
                      border: "1px solid #dae2de",
                      borderRadius: "6px",
                      padding: "8px 10px",
                    }}
                  >
                    <strong>{orc.numero}</strong>
                    <span>{pessoaNome(orc.pessoa_id)}</span>
                    <span style={{ color: "#6b7a75" }}>{obraNome(orc.obra_id)}</span>
                    <span style={{ color: "#6b7a75" }}>{orcItens.length} item(ns)</span>
                    <form action={converterOrcamentoAction} style={{ marginLeft: "auto" }}>
                      <input type="hidden" name="orcamento_id" value={orc.id} />
                      <button type="submit" style={buttonStyle}>
                        Converter em pedido
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 style={sectionTitleStyle}>Pedidos</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {pedidos.map((ped) => {
            const pedItens = itensPorPedido.get(ped.id) ?? [];
            const pendenciasDoPedido = pendenciasPorPedido.get(ped.id) ?? [];
            const pendenciasAbertas = pendenciasDoPedido.filter((p) => !p.resolvida);

            return (
              <div key={ped.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "baseline", fontSize: "12px" }}>
                  <strong style={{ fontSize: "13px" }}>{ped.numero}</strong>
                  <span>{pessoaNome(ped.pessoa_id)}</span>
                  <span style={{ color: "#6b7a75" }}>{obraNome(ped.obra_id)}</span>
                  <span style={{ color: "#6b7a75" }}>{ped.data_pedido}</span>
                  <span style={{ color: "#6b7a75" }}>
                    origem: {numeroOrcamentoPorId.get(ped.orcamento_id) ?? "(orçamento removido)"}
                  </span>
                  <span style={{ fontFamily: "monospace", color: STATUS_COLOR[ped.status] }}>
                    {STATUS_LABEL[ped.status]}
                  </span>
                  {pendenciasAbertas.length > 0 && (
                    <span style={{ color: "#b7791f" }}>
                      {pendenciasAbertas.length} pendência(s) aberta(s)
                    </span>
                  )}
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "8px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                      <th style={thStyle}>Item</th>
                      <th style={thStyle}>Qtd</th>
                      <th style={thStyle}>Preço unit.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedItens.map((pi) => (
                      <tr key={pi.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                        <td style={tdStyle}>{itemLabel(pi.item_id)}</td>
                        <td style={tdStyle}>{pi.quantidade}</td>
                        <td style={tdStyle}>
                          {pi.preco_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {pendenciasDoPedido.length > 0 && (
                  <div style={{ marginTop: "8px" }}>
                    <h3 style={{ fontSize: "12px", margin: "0 0 4px", color: "#3e4d49" }}>Pendências</h3>
                    <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {pendenciasDoPedido.map((pd) => (
                        <li key={pd.id}>
                          {pd.resolvida ? (
                            <span style={{ color: "#6b7a75" }}>
                              <s>{pd.descricao}</s> — resolvida{pd.resolucao ? `: ${pd.resolucao}` : ""}
                            </span>
                          ) : (
                            <span>
                              {pd.descricao}
                              {canManage && (
                                <form
                                  action={resolverPendenciaAction}
                                  style={{ display: "inline-flex", gap: "4px", marginLeft: "8px" }}
                                >
                                  <input type="hidden" name="id" value={pd.id} />
                                  <input
                                    name="resolucao"
                                    placeholder="resolução (opcional)"
                                    style={{ ...inputStyle, width: "160px" }}
                                  />
                                  <button type="submit" style={buttonStyle}>
                                    Resolver
                                  </button>
                                </form>
                              )}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {canManage && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px", alignItems: "center" }}>
                    {ped.status === "recebido" && (
                      <form action={iniciarConferenciaAction}>
                        <input type="hidden" name="id" value={ped.id} />
                        <button type="submit" style={buttonStyle}>
                          Iniciar conferência
                        </button>
                      </form>
                    )}

                    {(ped.status === "em_conferencia" || ped.status === "pendente") && (
                      <form
                        action={abrirPendenciaAction}
                        style={{ display: "flex", gap: "6px", alignItems: "center" }}
                      >
                        <input type="hidden" name="id" value={ped.id} />
                        <input
                          name="descricao"
                          placeholder="descrever pendência"
                          required
                          style={{ ...inputStyle, width: "180px" }}
                        />
                        <button type="submit" style={buttonStyle}>
                          Abrir pendência
                        </button>
                      </form>
                    )}

                    {ped.status === "em_conferencia" && (
                      <form action={liberarPedidoAction}>
                        <input type="hidden" name="id" value={ped.id} />
                        <button type="submit" style={buttonStyle}>
                          Liberar
                        </button>
                      </form>
                    )}

                    {(ped.status === "recebido" || ped.status === "em_conferencia" || ped.status === "pendente") && (
                      <form action={cancelarPedidoAction}>
                        <input type="hidden" name="id" value={ped.id} />
                        <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>
                          Cancelar
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {pedidos.length === 0 && <p style={hintStyle}>Nenhum pedido ainda.</p>}
        </div>
      </section>
    </>
  );
}
