"use client";

import { useState, useActionState } from "react";
import {
  ajustarSaldoAction,
  reservarParaPedidoItemAction,
  liberarReservaAction,
  consumirReservaAction,
  registrarEntradaSobraAction,
  registrarPecaDimensionalAction,
  consumirPecaDimensionalAction,
  converterUnidadeDimensionalAction,
  type ConversaoState,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  unidade_principal: string;
  dimensao_tipo: "linear" | "area" | null;
  peso_por_unidade_dimensao: number | null;
};
type PecaDimensional = {
  id: string;
  item_id: string;
  identificador: string | null;
  quantidade_original: number;
  quantidade_disponivel: number;
  situacao: "disponivel" | "esgotada";
  observacao: string | null;
  created_at: string;
};
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
  pecasDimensionais,
  canManage,
}: {
  activeTab: "saldo" | "reserva" | "sobra" | "dimensional";
  itens: Item[];
  saldoPorItem: Map<string, Saldo>;
  pedidos: Pedido[];
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  reservaAtivaPorPedidoItem: Map<string, Reserva>;
  pessoas: Pessoa[];
  obras: Obra[];
  pecasDimensionais: PecaDimensional[];
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

      {activeTab === "dimensional" && (
        <DimensionalTab
          itens={itens.filter((i) => i.dimensao_tipo !== null)}
          pecasDimensionais={pecasDimensionais}
          canManage={canManage}
        />
      )}
    </>
  );
}

// Fase 2 da ADR-011 (TÓPICO 7 §5-6, §9 base). Item com dimensao_tipo
// deixa de ser saldo escalar e passa a ter peça física individual: barra,
// chapa, bobina. Consumir parte de uma peça só reduz a disponível DELA — o
// que sobra já é a sobra reaproveitável, e é por isso que esta aba não tem
// "registrar sobra": sobra aqui não é entrada, é o saldo que ficou.
//
// A vedação do TÓPICO 4 §54 continua integral: isto é posição de estoque,
// nunca decisão de corte ou nesting.
function DimensionalTab({
  itens,
  pecasDimensionais,
  canManage,
}: {
  itens: Item[];
  pecasDimensionais: PecaDimensional[];
  canManage: boolean;
}) {
  if (itens.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-text">Peças dimensionais</h2>
        <p className="mt-1 text-xs text-text-muted">
          Nenhum item com controle dimensional ainda. Isso é opcional e por item: em{" "}
          <strong>Cadastros → Itens</strong>, defina o controle dimensional como linear
          (barra/perfil, medido em metro) ou área (chapa/bobina/vidro, medido em m²). Todo o
          resto do catálogo segue com saldo escalar, sem mudança.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Peças dimensionais</h2>
      <p className="mt-1 text-xs text-text-muted">
        Cada linha é uma peça física. Consumir parte dela reduz só a quantidade disponível
        daquela peça — o que sobra continua ali, disponível para o próximo uso.
      </p>

      <ConversorUnidade itens={itens} />

      {itens.map((it) => {
        const pecas = pecasDimensionais.filter((p) => p.item_id === it.id);
        const disponivelTotal = pecas
          .filter((p) => p.situacao === "disponivel")
          .reduce((acc, p) => acc + Number(p.quantidade_disponivel), 0);

        return (
          <Card key={it.id} className="mt-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs font-semibold text-text">
                {it.codigo} — {it.descricao}
              </span>
              <span className="text-xs text-text-muted">
                {it.dimensao_tipo === "linear" ? "linear (metro)" : "área (m²)"}
                {it.peso_por_unidade_dimensao
                  ? ` · ${num(it.peso_por_unidade_dimensao)} kg/${it.dimensao_tipo === "linear" ? "m" : "m²"}`
                  : " · sem peso configurado (conversão indisponível)"}
              </span>
              <span className="text-xs text-text">
                Disponível: {num(disponivelTotal)} {it.unidade_principal} em{" "}
                {pecas.filter((p) => p.situacao === "disponivel").length} peça(s)
              </span>
            </div>

            <div className="mt-2 overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Identificação</Th>
                    <Th>Original</Th>
                    <Th>Disponível</Th>
                    <Th>Situação</Th>
                    {canManage && <Th>Consumir</Th>}
                  </tr>
                </thead>
                <tbody>
                  {pecas.map((p) => (
                    <tr key={p.id}>
                      <Td>
                        {p.identificador ?? "—"}
                        {p.observacao && <span className="ml-1 text-text-muted">({p.observacao})</span>}
                      </Td>
                      <Td>{num(p.quantidade_original)}</Td>
                      <Td>{num(p.quantidade_disponivel)}</Td>
                      <Td>{p.situacao === "disponivel" ? "Disponível" : "Esgotada"}</Td>
                      {canManage && (
                        <Td>
                          {p.situacao === "disponivel" ? (
                            <form action={consumirPecaDimensionalAction} className="flex items-center gap-1">
                              <input type="hidden" name="peca_id" value={p.id} />
                              <Input
                                name="quantidade"
                                type="number"
                                step="0.0001"
                                min="0.0001"
                                max={p.quantidade_disponivel}
                                placeholder="qtd."
                                required
                                className="w-[80px]"
                              />
                              <Input name="observacao" placeholder="obs. (opcional)" className="w-32" />
                              <Button type="submit" variant="primary">
                                Consumir
                              </Button>
                            </form>
                          ) : (
                            "—"
                          )}
                        </Td>
                      )}
                    </tr>
                  ))}
                  {pecas.length === 0 && (
                    <tr>
                      <Td colSpan={canManage ? 5 : 4}>
                        <span className="text-text-muted">Nenhuma peça registrada para este item.</span>
                      </Td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>

            {canManage && (
              <form action={registrarPecaDimensionalAction} className="mt-2 flex flex-wrap items-center gap-1.5">
                <input type="hidden" name="item_id" value={it.id} />
                <Input
                  name="quantidade"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  placeholder={`quantidade (${it.unidade_principal})`}
                  required
                  className="w-36"
                />
                <Input name="identificador" placeholder="identificação (opcional)" className="w-40" />
                <Input name="observacao" placeholder="observação (opcional)" className="w-44" />
                <Button type="submit" variant="primary">
                  Registrar peça
                </Button>
              </form>
            )}
          </Card>
        );
      })}
    </section>
  );
}

// Conversão só lê (estoque.view) e devolve um número — o fator é a
// propriedade física do próprio item, não uma tabela genérica de unidades.
function ConversorUnidade({ itens }: { itens: Item[] }) {
  const [estado, formAction, pendente] = useActionState<ConversaoState, FormData>(
    converterUnidadeDimensionalAction,
    undefined,
  );
  const comPeso = itens.filter((i) => i.peso_por_unidade_dimensao !== null);

  if (comPeso.length === 0) return null;

  return (
    <Card className="mt-3">
      <p className="text-xs font-semibold text-text">Converter unidade ↔ peso</p>
      <form action={formAction} className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Select name="item_id" defaultValue="" required>
          <option value="" disabled>
            Item
          </option>
          {comPeso.map((it) => (
            <option key={it.id} value={it.id}>
              {it.codigo} — {it.descricao}
            </option>
          ))}
        </Select>
        <Input name="quantidade" type="number" step="0.0001" min="0.0001" placeholder="quantidade" required className="w-28" />
        <Select name="sentido" defaultValue="para_peso">
          <option value="para_peso">de metro/m² para kg</option>
          <option value="de_peso">de kg para metro/m²</option>
        </Select>
        <Button type="submit" variant="secondary" disabled={pendente}>
          {pendente ? "Convertendo..." : "Converter"}
        </Button>
        {estado?.error && <span className="text-xs text-danger">{estado.error}</span>}
        {estado?.resultado !== undefined && (
          <span className="text-xs text-text">
            = <strong>{num(estado.resultado)}</strong> {estado.unidade}
          </span>
        )}
      </form>
    </Card>
  );
}
