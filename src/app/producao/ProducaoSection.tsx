"use client";

import {
  liberarEngenhariaAction,
  criarOrdemProducaoAction,
  liberarLoteProducaoAction,
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
  situacao: "liberada" | "liberada_com_restricao" | "bloqueada";
  motivo_bloqueio: string | null;
  origem_bloqueio: string | null;
  impacto_bloqueio: string | null;
  acao_necessaria: string | null;
};
type EngenhariaVersao = {
  id: string;
  pedido_item_id: string;
  versao: number;
  liberado_em: string;
  observacoes: string | null;
};
type OpLote = {
  id: string;
  ordem_producao_id: string;
  numero: number;
  quantidade_planejada: number;
  quantidade_produzida: number;
  quantidade_rejeitada: number;
  saldo: number;
  status: "liberado" | "em_andamento" | "concluido";
};
type OpOperacao = {
  id: string;
  ordem_producao_id: string;
  op_lote_id: string;
  sequencia: number;
  descricao: string;
  recurso_necessario: string | null;
  quantidade_planejada: number;
  quantidade_produzida: number;
  quantidade_rejeitada: number;
  quantidade_retrabalho: number;
  saldo: number;
  status: "planejada" | "em_andamento" | "concluida";
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

const SITUACAO_LABEL: Record<OrdemProducao["situacao"], string> = {
  liberada: "Liberada",
  liberada_com_restricao: "Liberada com restrição",
  bloqueada: "Bloqueada",
};

const SITUACAO_COLOR: Record<OrdemProducao["situacao"], string> = {
  liberada: "#1f5d57",
  liberada_com_restricao: "#b7791f",
  bloqueada: "#9b2c2c",
};

const LOTE_STATUS_LABEL: Record<OpLote["status"], string> = {
  liberado: "Liberado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

const LOTE_STATUS_COLOR: Record<OpLote["status"], string> = {
  liberado: "#6b7a75",
  em_andamento: "#b7791f",
  concluido: "#1f5d57",
};

const OPERACAO_STATUS_LABEL: Record<OpOperacao["status"], string> = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

const OPERACAO_STATUS_COLOR: Record<OpOperacao["status"], string> = {
  planejada: "#6b7a75",
  em_andamento: "#b7791f",
  concluida: "#1f5d57",
};

export default function ProducaoSection({
  pedidos,
  pedidoItensPorPedido,
  itens,
  pessoas,
  obras,
  ordensPorPedidoItem,
  engenhariaVigentePorPedidoItem,
  bloqueioPorPedido,
  listaCortePorOrdem,
  opLotesPorOrdem,
  opOperacoesPorLote,
  canManage,
}: {
  pedidos: Pedido[];
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  itens: Item[];
  pessoas: Pessoa[];
  obras: Obra[];
  ordensPorPedidoItem: Map<string, OrdemProducao[]>;
  engenhariaVigentePorPedidoItem: Map<string, EngenhariaVersao>;
  bloqueioPorPedido: Map<string, boolean>;
  listaCortePorOrdem: Map<string, ListaCorteRow[]>;
  opLotesPorOrdem: Map<string, OpLote[]>;
  opOperacoesPorLote: Map<string, OpOperacao[]>;
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
      <p style={hintStyle}>
        Um item pode ter mais de uma OP (produção parcial) — a soma das quantidades planejadas nunca
        ultrapassa a quantidade do item, mas pode ficar menor enquanto houver saldo ainda não
        planejado.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {pedidos.map((ped) => {
          const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];
          const bloqueado = bloqueioPorPedido.get(ped.id) ?? false;
          const itensComOP = itensDoPedido.filter((pi) => (ordensPorPedidoItem.get(pi.id) ?? []).length > 0);

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
                    Há item com medida em obra não confirmada (TÓPICO 16 §7) — novas OPs deste pedido
                    nascem bloqueadas até a medida ser confirmada.
                  </span>
                )}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "8px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                    <th style={thStyle}>Item</th>
                    <th style={thStyle}>Qtd. pedido</th>
                    <th style={thStyle}>Engenharia</th>
                    <th style={thStyle}>Saldo p/ planejar</th>
                    <th style={thStyle}>Ordens de produção</th>
                  </tr>
                </thead>
                <tbody>
                  {itensDoPedido.map((pi) => {
                    const ops = ordensPorPedidoItem.get(pi.id) ?? [];
                    const planejado = ops
                      .filter((op) => op.status !== "cancelada")
                      .reduce((acc, op) => acc + Number(op.quantidade_planejada), 0);
                    const saldo = Number(pi.quantidade) - planejado;
                    const engenharia = engenhariaVigentePorPedidoItem.get(pi.id);

                    return (
                      <tr key={pi.id} style={{ borderBottom: "1px solid #f4f6f5", verticalAlign: "top" }}>
                        <td style={tdStyle}>{itemLabel(pi.item_id)}</td>
                        <td style={tdStyle}>{num(pi.quantidade)}</td>
                        <td style={tdStyle}>
                          {engenharia ? (
                            <div style={{ color: "#1f5d57" }}>
                              v{engenharia.versao} — {new Date(engenharia.liberado_em).toLocaleDateString("pt-BR")}
                            </div>
                          ) : (
                            <span style={{ color: "#6b7a75" }}>Não liberada</span>
                          )}
                          {canManage && (
                            <form action={liberarEngenhariaAction} style={{ marginTop: "4px" }}>
                              <input type="hidden" name="pedido_item_id" value={pi.id} />
                              <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px" }}>
                                {engenharia ? "Liberar nova versão" : "Liberar engenharia"}
                              </button>
                            </form>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {num(Math.max(saldo, 0))}
                          {canManage && saldo > 0 && (
                            <form
                              action={criarOrdemProducaoAction}
                              style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px", alignItems: "center" }}
                            >
                              <input type="hidden" name="pedido_item_id" value={pi.id} />
                              <input
                                name="quantidade"
                                type="number"
                                step="0.001"
                                min="0"
                                max={saldo}
                                placeholder={`até ${num(saldo)}`}
                                style={{ ...inputStyle, width: "80px" }}
                              />
                              <label style={{ ...hintStyle, display: "flex", gap: "3px", alignItems: "center", margin: 0 }}>
                                <input type="checkbox" name="liberar_integralmente" defaultChecked />
                                liberar integralmente
                              </label>
                              <button type="submit" style={buttonStyle}>
                                Criar OP
                              </button>
                            </form>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {ops.map((op) => (
                              <div
                                key={op.id}
                                style={{ border: "1px solid #eef1ef", borderRadius: "4px", padding: "6px 8px" }}
                              >
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "baseline" }}>
                                  <strong>{op.numero}</strong>
                                  <span style={{ fontFamily: "monospace", color: STATUS_COLOR[op.status] }}>
                                    {STATUS_LABEL[op.status]}
                                  </span>
                                  <span style={{ fontFamily: "monospace", color: SITUACAO_COLOR[op.situacao] }}>
                                    {SITUACAO_LABEL[op.situacao]}
                                  </span>
                                  <span>
                                    produzida {num(op.quantidade_produzida)} / {num(op.quantidade_planejada)}
                                  </span>
                                  <span>perdida {num(op.quantidade_perdida)}</span>
                                </div>
                                {op.situacao === "bloqueada" && (
                                  <p style={{ ...hintStyle, color: "#9b2c2c", margin: "4px 0 0" }}>
                                    {op.motivo_bloqueio} {op.impacto_bloqueio} Ação necessária:{" "}
                                    {op.acao_necessaria}
                                  </p>
                                )}
                                {(() => {
                                  const lotes = (opLotesPorOrdem.get(op.id) ?? []).slice().sort((a, b) => a.numero - b.numero);
                                  const podeMexer = canManage && (op.status === "planejada" || op.status === "em_producao");
                                  const jaLiberado = lotes.reduce((acc, l) => acc + Number(l.quantidade_planejada), 0);
                                  const saldoNaoLiberado = Number(op.quantidade_planejada) - jaLiberado;
                                  const todasOperacoes = lotes.flatMap((l) => opOperacoesPorLote.get(l.id) ?? []);
                                  const todasConcluidas = todasOperacoes.length > 0 && todasOperacoes.every((o) => o.status === "concluida");
                                  return (
                                    <>
                                      {lotes.map((lote) => {
                                        const operacoes = (opOperacoesPorLote.get(lote.id) ?? [])
                                          .slice()
                                          .sort((a, b) => a.sequencia - b.sequencia);
                                        return (
                                          <div key={lote.id} style={{ marginTop: "6px" }}>
                                            <div style={{ display: "flex", gap: "6px", alignItems: "baseline", fontSize: "11px" }}>
                                              <strong>Lote {lote.numero}</strong>
                                              <span style={{ fontFamily: "monospace", color: LOTE_STATUS_COLOR[lote.status] }}>
                                                {LOTE_STATUS_LABEL[lote.status]}
                                              </span>
                                              <span>
                                                {num(lote.quantidade_produzida)} / {num(lote.quantidade_planejada)}
                                              </span>
                                            </div>
                                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "2px" }}>
                                              <thead>
                                                <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                                                  <th style={thStyle}>Operação</th>
                                                  <th style={thStyle}>Status</th>
                                                  <th style={thStyle}>Produzido</th>
                                                  <th style={thStyle}>Rejeitado</th>
                                                  <th style={thStyle}>Retrabalho</th>
                                                  <th style={thStyle}>Saldo</th>
                                                  {podeMexer && <th style={thStyle}></th>}
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {operacoes.map((o) => (
                                                  <tr key={o.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                                                    <td style={tdStyle}>
                                                      {o.sequencia}. {o.descricao}
                                                    </td>
                                                    <td style={tdStyle}>
                                                      <span style={{ fontFamily: "monospace", color: OPERACAO_STATUS_COLOR[o.status] }}>
                                                        {OPERACAO_STATUS_LABEL[o.status]}
                                                      </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                      {num(o.quantidade_produzida)} / {num(o.quantidade_planejada)}
                                                    </td>
                                                    <td style={tdStyle}>{num(o.quantidade_rejeitada)}</td>
                                                    <td style={tdStyle}>{num(o.quantidade_retrabalho)}</td>
                                                    <td style={tdStyle}>{num(o.saldo)}</td>
                                                    {podeMexer && (
                                                      <td style={tdStyle}>
                                                        {o.status !== "concluida" && (
                                                          <form
                                                            action={apontarProducaoAction}
                                                            style={{ display: "flex", flexWrap: "wrap", gap: "3px", alignItems: "center" }}
                                                          >
                                                            <input type="hidden" name="op_lote_operacao_id" value={o.id} />
                                                            <input
                                                              name="quantidade_produzida"
                                                              type="number"
                                                              step="0.001"
                                                              min="0"
                                                              placeholder="produzida"
                                                              style={{ ...inputStyle, width: "62px" }}
                                                            />
                                                            <input
                                                              name="quantidade_rejeitada"
                                                              type="number"
                                                              step="0.001"
                                                              min="0"
                                                              placeholder="rejeitada"
                                                              style={{ ...inputStyle, width: "62px" }}
                                                            />
                                                            <input
                                                              name="quantidade_retrabalho"
                                                              type="number"
                                                              step="0.001"
                                                              min="0"
                                                              placeholder="retrabalho"
                                                              style={{ ...inputStyle, width: "62px" }}
                                                            />
                                                            <input
                                                              name="observacao"
                                                              placeholder="obs. (opcional)"
                                                              style={{ ...inputStyle, width: "100px" }}
                                                            />
                                                            <button type="submit" style={buttonStyle}>
                                                              Apontar
                                                            </button>
                                                          </form>
                                                        )}
                                                      </td>
                                                    )}
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        );
                                      })}
                                      {lotes.length === 0 && (
                                        <p style={{ ...hintStyle, margin: "4px 0 0" }}>
                                          Nenhum lote liberado ainda — libere um lote pra começar a apontar (TÓPICO 4 §12).
                                        </p>
                                      )}
                                      {podeMexer && saldoNaoLiberado > 0 && (
                                        <form
                                          action={liberarLoteProducaoAction}
                                          style={{ display: "flex", gap: "4px", marginTop: "6px", alignItems: "center" }}
                                        >
                                          <input type="hidden" name="ordem_producao_id" value={op.id} />
                                          <input
                                            name="quantidade"
                                            type="number"
                                            step="0.001"
                                            min="0"
                                            max={saldoNaoLiberado}
                                            placeholder={`até ${num(saldoNaoLiberado)}`}
                                            style={{ ...inputStyle, width: "80px" }}
                                          />
                                          <button type="submit" style={buttonStyle}>
                                            Liberar lote
                                          </button>
                                        </form>
                                      )}
                                      {podeMexer && (
                                        <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
                                          <form action={concluirOrdemProducaoAction}>
                                            <input type="hidden" name="ordem_producao_id" value={op.id} />
                                            <button
                                              type="submit"
                                              style={buttonStyle}
                                              disabled={op.quantidade_produzida < op.quantidade_planejada || !todasConcluidas}
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
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            ))}
                            {ops.length === 0 && <span style={{ color: "#6b7a75" }}>Sem OP</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {itensDoPedido.length === 0 && (
                    <tr>
                      <td style={tdStyle} colSpan={5}>
                        <span style={{ color: "#6b7a75" }}>Pedido sem itens.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {itensComOP.length > 0 && (
                <details style={{ marginTop: "8px" }}>
                  <summary style={{ fontSize: "12px", color: "#1f5d57", cursor: "pointer" }}>Lista de corte</summary>
                  {itensComOP.map((pi) =>
                    (ordensPorPedidoItem.get(pi.id) ?? []).map((op) => {
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
                    }),
                  )}
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
