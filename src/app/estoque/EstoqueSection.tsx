"use client";

import { useState } from "react";
import {
  ajustarSaldoAction,
  reservarParaPedidoItemAction,
  liberarReservaAction,
  consumirReservaAction,
  registrarEntradaSobraAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string; tipo: string; unidade_principal: string };
type Saldo = { item_id: string; quantidade_fisica: number; quantidade_reservada: number };
type Pedido = { id: string; numero: string; pessoa_id: string; obra_id: string | null };
type PedidoItem = { id: string; pedido_id: string; item_id: string; quantidade: number };
type Reserva = { id: string; pedido_item_id: string; item_id: string; quantidade: number };

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default function EstoqueSection({
  activeTab,
  itens,
  saldoPorItem,
  pedidos,
  pedidoItensPorPedido,
  reservaAtivaPorPedidoItem,
  pessoas,
  obras,
  canManage,
}: {
  activeTab: "saldo" | "reserva" | "sobra";
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

  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null);
  const pedidoSelecionado = pedidos.find((p) => p.id === selectedPedidoId) ?? null;

  return (
    <>
      {activeTab === "saldo" && (
      <section>
        <h2 className="text-sm font-semibold text-text">Saldo por item</h2>
        <Table className="mt-2">
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Físico</Th>
              <Th>Reservado</Th>
              <Th>Disponível</Th>
              <Th>Unidade</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => {
              const saldo = saldoPorItem.get(it.id);
              const fisica = saldo?.quantidade_fisica ?? 0;
              const reservada = saldo?.quantidade_reservada ?? 0;
              return (
                <tr key={it.id}>
                  <Td>
                    {it.codigo} — {it.descricao}
                  </Td>
                  <Td>{num(fisica)}</Td>
                  <Td>{num(reservada)}</Td>
                  <Td>{num(fisica - reservada)}</Td>
                  <Td>{it.unidade_principal}</Td>
                  {canManage && (
                    <Td>
                      <form action={ajustarSaldoAction} className="flex items-center gap-1">
                        <input type="hidden" name="item_id" value={it.id} />
                        <Input
                          name="quantidade_delta"
                          type="number"
                          step="0.001"
                          placeholder="+/- qtd"
                          required
                          className="w-[70px]"
                        />
                        <Input name="motivo" placeholder="motivo" required className="w-28" />
                        <Button type="submit" variant="primary">
                          Ajustar
                        </Button>
                      </form>
                    </Td>
                  )}
                </tr>
              );
            })}
            {itens.length === 0 && (
              <tr>
                <Td colSpan={canManage ? 6 : 5}>
                  <span className="text-text-muted">Nenhum item cadastrado.</span>
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-text-muted">
          Sem módulo de Compras ainda (TÓPICO 18, M2) — ajuste é o único jeito de estabelecer ou
          corrigir saldo neste recorte. Disponível = físico − reservado.
        </p>
      </section>
      )}

      {activeTab === "reserva" && (
      <section>
        <h2 className="text-sm font-semibold text-text">Reserva para pedidos liberados</h2>

        <div className="mt-2 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Cliente</Th>
                <Th>Obra</Th>
                <Th>Itens</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((ped) => {
                const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];
                const faltantes = itensDoPedido.filter((pi) => {
                  const reservado = reservaAtivaPorPedidoItem.get(pi.id)?.quantidade ?? 0;
                  return pi.quantidade - reservado > 0;
                }).length;
                return (
                  <tr
                    key={ped.id}
                    onClick={() => setSelectedPedidoId((prev) => (prev === ped.id ? null : ped.id))}
                    className={`cursor-pointer ${selectedPedidoId === ped.id ? "bg-primary-soft" : "hover:bg-page-bg"}`}
                  >
                    <Td className="font-medium text-text">{ped.numero}</Td>
                    <Td>{pessoaNome(ped.pessoa_id)}</Td>
                    <Td className="text-text-muted">{obraNome(ped.obra_id)}</Td>
                    <Td className="text-text-muted">{itensDoPedido.length}</Td>
                    <Td>
                      {faltantes > 0 ? (
                        <Badge variant="warning">{faltantes} com falta</Badge>
                      ) : (
                        <Badge variant="success">Completo</Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {pedidos.length === 0 && (
                <tr>
                  <Td colSpan={5} className="text-text-muted">
                    Nenhum pedido liberado ainda — a reserva só entra depois da liberação (TÓPICO 3).
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>

        {pedidoSelecionado && (
          <Card padding="xs" className="mt-3">
            <strong className="text-sm text-text">Itens do pedido {pedidoSelecionado.numero}</strong>
            <Table className="mt-2">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Necessário</Th>
                  <Th>Reservado</Th>
                  <Th>Falta</Th>
                  {canManage && <Th />}
                </tr>
              </thead>
              <tbody>
                {(pedidoItensPorPedido.get(pedidoSelecionado.id) ?? []).map((pi) => {
                  const reserva = reservaAtivaPorPedidoItem.get(pi.id);
                  const reservado = reserva?.quantidade ?? 0;
                  const falta = pi.quantidade - reservado;
                  return (
                    <tr key={pi.id}>
                      <Td>{itemLabel(pi.item_id)}</Td>
                      <Td>{num(pi.quantidade)}</Td>
                      <Td>{num(reservado)}</Td>
                      <Td>
                        <span className={falta > 0 ? "text-warning" : "text-success"}>{num(falta)}</span>
                      </Td>
                      {canManage && (
                        <Td>
                          {reserva ? (
                            <div className="flex gap-1">
                              <form action={consumirReservaAction}>
                                <input type="hidden" name="id" value={reserva.id} />
                                <Button type="submit" variant="primary">
                                  Consumir
                                </Button>
                              </form>
                              <form action={liberarReservaAction}>
                                <input type="hidden" name="id" value={reserva.id} />
                                <Button type="submit" variant="secondary">
                                  Liberar
                                </Button>
                              </form>
                            </div>
                          ) : (
                            <form action={reservarParaPedidoItemAction}>
                              <input type="hidden" name="pedido_item_id" value={pi.id} />
                              <Button type="submit" variant="primary">
                                Reservar
                              </Button>
                            </form>
                          )}
                        </Td>
                      )}
                    </tr>
                  );
                })}
                {(pedidoItensPorPedido.get(pedidoSelecionado.id) ?? []).length === 0 && (
                  <tr>
                    <Td colSpan={canManage ? 5 : 4}>
                      <span className="text-text-muted">Pedido sem itens.</span>
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
      )}

      {activeTab === "sobra" && canManage && (
        <section>
          <h2 className="text-sm font-semibold text-text">Registrar entrada de sobra</h2>
          <p className="mt-1 text-xs text-text-muted">
            TÓPICO 6 §3 — sobra é sempre uma ação própria, separada de reservar/consumir: quem
            cortou o material registra o que sobrou.
          </p>
          <form action={registrarEntradaSobraAction} className="mt-2 flex flex-wrap items-center gap-1.5">
            <Select name="item_id" defaultValue="" required>
              <option value="" disabled>
                Item
              </option>
              {itens.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.codigo} — {it.descricao}
                </option>
              ))}
            </Select>
            <Input name="quantidade" type="number" step="0.001" min="0.001" placeholder="quantidade" required className="w-[90px]" />
            <Input name="observacao" placeholder="observação (opcional)" className="w-52" />
            <Button type="submit" variant="primary">
              Registrar sobra
            </Button>
          </form>
        </section>
      )}
    </>
  );
}
