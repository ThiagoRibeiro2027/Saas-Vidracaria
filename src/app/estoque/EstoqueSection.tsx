"use client";

import {
  ajustarSaldoAction,
  reservarParaPedidoItemAction,
  liberarReservaAction,
  consumirReservaAction,
  registrarEntradaSobraAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string; tipo: string; unidade_principal: string };
type Saldo = { item_id: string; quantidade_fisica: number; quantidade_reservada: number };
type Pedido = { id: string; numero: string; pessoa_id: string; obra_id: string | null };
type PedidoItem = { id: string; pedido_id: string; item_id: string; quantidade: number };
type Reserva = { id: string; pedido_item_id: string; item_id: string; quantidade: number };

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default function EstoqueSection({
  itens,
  saldoPorItem,
  pedidos,
  pedidoItensPorPedido,
  reservaAtivaPorPedidoItem,
  pessoas,
  obras,
  canManage,
}: {
  itens: Item[];
  saldoPorItem: Map<string, Saldo>;
  pedidos: Pedido[];
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  reservaAtivaPorPedidoItem: Map<string, Reserva>;
  pessoas: Pessoa[];
  obras: Obra[];
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
      <section>
        <h2 style={sectionTitleStyle}>Saldo por item</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Físico</th>
              <th style={thStyle}>Reservado</th>
              <th style={thStyle}>Disponível</th>
              <th style={thStyle}>Unidade</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => {
              const saldo = saldoPorItem.get(it.id);
              const fisica = saldo?.quantidade_fisica ?? 0;
              const reservada = saldo?.quantidade_reservada ?? 0;
              return (
                <tr key={it.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                  <td style={tdStyle}>
                    {it.codigo} — {it.descricao}
                  </td>
                  <td style={tdStyle}>{num(fisica)}</td>
                  <td style={tdStyle}>{num(reservada)}</td>
                  <td style={tdStyle}>{num(fisica - reservada)}</td>
                  <td style={tdStyle}>{it.unidade_principal}</td>
                  {canManage && (
                    <td style={tdStyle}>
                      <form
                        action={ajustarSaldoAction}
                        style={{ display: "flex", gap: "4px", alignItems: "center" }}
                      >
                        <input type="hidden" name="item_id" value={it.id} />
                        <input
                          name="quantidade_delta"
                          type="number"
                          step="0.001"
                          placeholder="+/- qtd"
                          required
                          style={{ ...inputStyle, width: "70px" }}
                        />
                        <input
                          name="motivo"
                          placeholder="motivo"
                          required
                          style={{ ...inputStyle, width: "110px" }}
                        />
                        <button type="submit" style={buttonStyle}>
                          Ajustar
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
            {itens.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={canManage ? 6 : 5}>
                  <span style={{ color: "#6b7a75" }}>Nenhum item cadastrado.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p style={hintStyle}>
          Sem módulo de Compras ainda (TÓPICO 18, M2) — ajuste é o único jeito de estabelecer ou
          corrigir saldo neste recorte. Disponível = físico − reservado.
        </p>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Reserva para pedidos liberados</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {pedidos.map((ped) => {
            const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];
            return (
              <div key={ped.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "baseline", fontSize: "12px" }}>
                  <strong style={{ fontSize: "13px" }}>{ped.numero}</strong>
                  <span>{pessoaNome(ped.pessoa_id)}</span>
                  <span style={{ color: "#6b7a75" }}>{obraNome(ped.obra_id)}</span>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "8px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                      <th style={thStyle}>Item</th>
                      <th style={thStyle}>Necessário</th>
                      <th style={thStyle}>Reservado</th>
                      <th style={thStyle}>Falta</th>
                      {canManage && <th style={thStyle}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {itensDoPedido.map((pi) => {
                      const reserva = reservaAtivaPorPedidoItem.get(pi.id);
                      const reservado = reserva?.quantidade ?? 0;
                      const falta = pi.quantidade - reservado;
                      return (
                        <tr key={pi.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                          <td style={tdStyle}>{itemLabel(pi.item_id)}</td>
                          <td style={tdStyle}>{num(pi.quantidade)}</td>
                          <td style={tdStyle}>{num(reservado)}</td>
                          <td style={tdStyle}>
                            <span style={{ color: falta > 0 ? "#b7791f" : "#1f5d57" }}>{num(falta)}</span>
                          </td>
                          {canManage && (
                            <td style={tdStyle}>
                              {reserva ? (
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <form action={consumirReservaAction}>
                                    <input type="hidden" name="id" value={reserva.id} />
                                    <button type="submit" style={buttonStyle}>
                                      Consumir
                                    </button>
                                  </form>
                                  <form action={liberarReservaAction}>
                                    <input type="hidden" name="id" value={reserva.id} />
                                    <button type="submit" style={{ ...buttonStyle, background: "#6b7a75" }}>
                                      Liberar
                                    </button>
                                  </form>
                                </div>
                              ) : (
                                <form action={reservarParaPedidoItemAction}>
                                  <input type="hidden" name="pedido_item_id" value={pi.id} />
                                  <button type="submit" style={buttonStyle}>
                                    Reservar
                                  </button>
                                </form>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {itensDoPedido.length === 0 && (
                      <tr>
                        <td style={tdStyle} colSpan={canManage ? 5 : 4}>
                          <span style={{ color: "#6b7a75" }}>Pedido sem itens.</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
          {pedidos.length === 0 && (
            <p style={hintStyle}>Nenhum pedido liberado ainda — a reserva só entra depois da liberação (TÓPICO 3).</p>
          )}
        </div>
      </section>

      {canManage && (
        <section>
          <h2 style={sectionTitleStyle}>Registrar entrada de sobra</h2>
          <p style={hintStyle}>
            TÓPICO 6 §3 — sobra é sempre uma ação própria, separada de reservar/consumir: quem
            cortou o material registra o que sobrou.
          </p>
          <form
            action={registrarEntradaSobraAction}
            style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
          >
            <select name="item_id" defaultValue="" required style={inputStyle}>
              <option value="" disabled>
                Item
              </option>
              {itens.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.codigo} — {it.descricao}
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
              style={{ ...inputStyle, width: "90px" }}
            />
            <input name="observacao" placeholder="observação (opcional)" style={{ ...inputStyle, width: "200px" }} />
            <button type="submit" style={buttonStyle}>
              Registrar sobra
            </button>
          </form>
        </section>
      )}
    </>
  );
}
