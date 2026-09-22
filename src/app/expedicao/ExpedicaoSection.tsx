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
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

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

const STATUS_TONE: Record<Expedicao["status"], "neutral" | "success" | "danger"> = {
  preparando: "neutral",
  conferida: "success",
  expedida: "success",
  cancelada: "danger",
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
      <h2 className="text-sm font-semibold text-text">Pedidos liberados — expedições</h2>
      <div className="mt-2 flex flex-col gap-4">
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
            <Card key={ped.id} padding="xs">
              <div className="flex flex-wrap items-baseline gap-2.5 text-xs">
                <strong className="text-[13px] text-text">{ped.numero}</strong>
                <span>{pessoaNome(ped.pessoa_id)}</span>
                <span className="text-text-muted">{obraNome(ped.obra_id)}</span>
                {canManage && (
                  <form action={criarExpedicaoAction}>
                    <input type="hidden" name="pedido_id" value={ped.id} />
                    <Button type="submit" variant="primary">
                      Nova expedição
                    </Button>
                  </form>
                )}
              </div>

              <div className="mt-2 flex flex-col gap-2.5">
                {expedicoes.map((exp) => {
                  const expItens = itensPorExpedicao.get(exp.id) ?? [];
                  const ocorrencias = ocorrenciasPorExpedicao.get(exp.id) ?? [];

                  return (
                    <div key={exp.id} className="rounded-md border border-border-subtle p-2">
                      <div className="flex flex-wrap items-baseline gap-2 text-xs">
                        <strong>{exp.numero}</strong>
                        <Badge variant={STATUS_TONE[exp.status]}>{STATUS_LABEL[exp.status]}</Badge>
                        {exp.status === "cancelada" && exp.motivo_cancelamento && (
                          <span className="text-text-muted">Motivo: {exp.motivo_cancelamento}</span>
                        )}
                      </div>

                      <Table className="mt-1.5">
                        <thead>
                          <tr>
                            <Th>Item</Th>
                            <Th>Qtd.</Th>
                            <Th>Entregue</Th>
                            <Th>Pendente</Th>
                            {canManage && <Th />}
                          </tr>
                        </thead>
                        <tbody>
                          {expItens.map((ei) => {
                            const pi = itensDoPedido.find((p) => p.id === ei.pedido_item_id);
                            return (
                              <tr key={ei.id}>
                                <Td>{pi ? itemLabel(pi.item_id) : "(item removido)"}</Td>
                                <Td>{num(ei.quantidade)}</Td>
                                <Td>{num(ei.quantidade_entregue)}</Td>
                                <Td>{num(ei.quantidade_pendente)}</Td>
                                {canManage && (
                                  <Td>
                                    {exp.status === "preparando" && (
                                      <form action={removerItemExpedicaoAction}>
                                        <input type="hidden" name="id" value={ei.id} />
                                        <Button type="submit" variant="danger">
                                          Remover
                                        </Button>
                                      </form>
                                    )}
                                    {exp.status === "expedida" && ei.quantidade_pendente > 0 && (
                                      <form action={confirmarEntregaItemExpedicaoAction} className="flex gap-1">
                                        <input type="hidden" name="id" value={ei.id} />
                                        <Input
                                          name="quantidade_entregue"
                                          type="number"
                                          step="0.001"
                                          min="0.001"
                                          max={ei.quantidade_pendente}
                                          placeholder="entregue"
                                          required
                                          className="w-[70px]"
                                        />
                                        <Button type="submit" variant="primary">
                                          Confirmar entrega
                                        </Button>
                                      </form>
                                    )}
                                  </Td>
                                )}
                              </tr>
                            );
                          })}
                          {expItens.length === 0 && (
                            <tr>
                              <Td colSpan={canManage ? 5 : 4}>
                                <span className="text-text-muted">Sem itens separados ainda.</span>
                              </Td>
                            </tr>
                          )}
                        </tbody>
                      </Table>

                      {canManage && exp.status === "preparando" && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {itensElegiveis.length > 0 && (
                            <form
                              action={adicionarItemExpedicaoAction}
                              className="flex flex-wrap items-center gap-1.5"
                            >
                              <input type="hidden" name="expedicao_id" value={exp.id} />
                              <Select name="pedido_item_id" defaultValue="" required className="min-w-48">
                                <option value="" disabled>
                                  Item disponível
                                </option>
                                {itensElegiveis.map(({ pedidoItem, disponivel }) => (
                                  <option key={pedidoItem.id} value={pedidoItem.id}>
                                    {itemLabel(pedidoItem.item_id)} (disponível: {num(disponivel)})
                                  </option>
                                ))}
                              </Select>
                              <Input
                                name="quantidade"
                                type="number"
                                step="0.001"
                                min="0.001"
                                placeholder="quantidade"
                                required
                                className="w-20"
                              />
                              <Button type="submit" variant="primary">
                                Adicionar item
                              </Button>
                            </form>
                          )}
                          <div className="flex gap-1.5">
                            <form action={conferirExpedicaoAction}>
                              <input type="hidden" name="expedicao_id" value={exp.id} />
                              <Button type="submit" variant="primary" disabled={expItens.length === 0}>
                                Conferir
                              </Button>
                            </form>
                            <form action={cancelarExpedicaoAction} className="flex items-center gap-1">
                              <input type="hidden" name="expedicao_id" value={exp.id} />
                              <Input name="motivo" placeholder="motivo (opcional)" className="w-36" />
                              <Button type="submit" variant="danger">
                                Cancelar
                              </Button>
                            </form>
                          </div>
                        </div>
                      )}

                      {canManage && exp.status === "conferida" && (
                        <div className="mt-2 flex gap-1.5">
                          <form action={registrarSaidaExpedicaoAction}>
                            <input type="hidden" name="expedicao_id" value={exp.id} />
                            <Button type="submit" variant="primary">
                              Registrar saída
                            </Button>
                          </form>
                          <form action={cancelarExpedicaoAction} className="flex items-center gap-1">
                            <input type="hidden" name="expedicao_id" value={exp.id} />
                            <Input name="motivo" placeholder="motivo (opcional)" className="w-36" />
                            <Button type="submit" variant="danger">
                              Cancelar
                            </Button>
                          </form>
                        </div>
                      )}

                      <div className="mt-2">
                        <p className="mb-1 text-xs text-text-muted">Ocorrências</p>
                        {ocorrencias.map((oc) => (
                          <p key={oc.id} className="mb-0.5 text-xs">
                            <span className="text-text-muted">
                              {new Date(oc.registrado_em).toLocaleString("pt-BR")} —{" "}
                            </span>
                            {oc.descricao}
                          </p>
                        ))}
                        {ocorrencias.length === 0 && <p className="text-xs text-text-muted">Nenhuma registrada.</p>}
                        {canManage && exp.status !== "cancelada" && (
                          <form action={registrarOcorrenciaExpedicaoAction} className="mt-1 flex gap-1">
                            <input type="hidden" name="expedicao_id" value={exp.id} />
                            <Input name="descricao" placeholder="descrever ocorrência" required className="flex-1" />
                            <Button type="submit" variant="primary">
                              Registrar ocorrência
                            </Button>
                          </form>
                        )}
                      </div>

                      {expItens.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-primary">Romaneio</summary>
                          <Table className="mt-1.5">
                            <thead>
                              <tr>
                                <Th>Pedido</Th>
                                <Th>Cliente</Th>
                                <Th>Item</Th>
                                <Th>Qtd.</Th>
                                <Th>Entregue</Th>
                                <Th>Pendente</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {expItens.map((ei) => {
                                const pi = itensDoPedido.find((p) => p.id === ei.pedido_item_id);
                                return (
                                  <tr key={ei.id}>
                                    <Td>{ped.numero}</Td>
                                    <Td>{pessoaNome(ped.pessoa_id)}</Td>
                                    <Td>{pi ? itemLabel(pi.item_id) : "(item removido)"}</Td>
                                    <Td>{num(ei.quantidade)}</Td>
                                    <Td>{num(ei.quantidade_entregue)}</Td>
                                    <Td>{num(ei.quantidade_pendente)}</Td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </Table>
                        </details>
                      )}
                    </div>
                  );
                })}
                {expedicoes.length === 0 && (
                  <p className="text-xs text-text-muted">Nenhuma expedição criada ainda para este pedido.</p>
                )}
              </div>
            </Card>
          );
        })}
        {pedidos.length === 0 && (
          <p className="text-xs text-text-muted">
            Nenhum pedido liberado ainda — a expedição só entra depois da liberação (TÓPICO 3).
          </p>
        )}
      </div>
    </section>
  );
}
