"use client";

import {
  converterOrcamentoAction,
  iniciarConferenciaAction,
  abrirPendenciaAction,
  resolverPendenciaAction,
  liberarPedidoAction,
  cancelarPedidoAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td } from "@/components/ui/Table";

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

const STATUS_TONE: Record<Pedido["status"], "neutral" | "success" | "warning" | "danger"> = {
  recebido: "neutral",
  em_conferencia: "success",
  pendente: "warning",
  liberado: "success",
  cancelado: "danger",
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
          <h2 className="text-sm font-semibold text-text">Orçamentos aprovados aguardando conversão</h2>
          {orcamentosDisponiveis.length === 0 ? (
            <p className="mt-1 text-xs text-text-muted">Nenhum orçamento aprovado pendente de conversão.</p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              {orcamentosDisponiveis.map((orc) => {
                const orcItens = itensPorOrcamento.get(orc.id) ?? [];
                return (
                  <Card key={orc.id} padding="xs" className="flex flex-wrap items-center gap-2.5 text-xs">
                    <strong>{orc.numero}</strong>
                    <span>{pessoaNome(orc.pessoa_id)}</span>
                    <span className="text-text-muted">{obraNome(orc.obra_id)}</span>
                    <span className="text-text-muted">{orcItens.length} item(ns)</span>
                    <form action={converterOrcamentoAction} className="ml-auto">
                      <input type="hidden" name="orcamento_id" value={orc.id} />
                      <Button type="submit" variant="primary">
                        Converter em pedido
                      </Button>
                    </form>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-text">Pedidos</h2>
        <div className="mt-2 flex flex-col gap-4">
          {pedidos.map((ped) => {
            const pedItens = itensPorPedido.get(ped.id) ?? [];
            const pendenciasDoPedido = pendenciasPorPedido.get(ped.id) ?? [];
            const pendenciasAbertas = pendenciasDoPedido.filter((p) => !p.resolvida);

            return (
              <Card key={ped.id} padding="xs">
                <div className="flex flex-wrap items-baseline gap-2.5 text-xs">
                  <strong className="text-[13px] text-text">{ped.numero}</strong>
                  <span>{pessoaNome(ped.pessoa_id)}</span>
                  <span className="text-text-muted">{obraNome(ped.obra_id)}</span>
                  <span className="text-text-muted">{ped.data_pedido}</span>
                  <span className="text-text-muted">
                    origem: {numeroOrcamentoPorId.get(ped.orcamento_id) ?? "(orçamento removido)"}
                  </span>
                  <Badge variant={STATUS_TONE[ped.status]}>{STATUS_LABEL[ped.status]}</Badge>
                  {pendenciasAbertas.length > 0 && (
                    <span className="text-warning">{pendenciasAbertas.length} pendência(s) aberta(s)</span>
                  )}
                </div>

                <Table className="mt-2">
                  <thead>
                    <tr>
                      <Th>Item</Th>
                      <Th>Qtd</Th>
                      <Th>Preço unit.</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedItens.map((pi) => (
                      <tr key={pi.id}>
                        <Td>{itemLabel(pi.item_id)}</Td>
                        <Td>{pi.quantidade}</Td>
                        <Td>{pi.preco_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                {pendenciasDoPedido.length > 0 && (
                  <div className="mt-2">
                    <h3 className="mb-1 text-xs font-medium text-text">Pendências</h3>
                    <ul className="m-0 flex flex-col gap-1 pl-4 text-xs">
                      {pendenciasDoPedido.map((pd) => (
                        <li key={pd.id}>
                          {pd.resolvida ? (
                            <span className="text-text-muted">
                              <s>{pd.descricao}</s> — resolvida{pd.resolucao ? `: ${pd.resolucao}` : ""}
                            </span>
                          ) : (
                            <span>
                              {pd.descricao}
                              {canManage && (
                                <form
                                  action={resolverPendenciaAction}
                                  className="ml-2 inline-flex items-center gap-1"
                                >
                                  <input type="hidden" name="id" value={pd.id} />
                                  <Input name="resolucao" placeholder="resolução (opcional)" className="w-40" />
                                  <Button type="submit" variant="primary">
                                    Resolver
                                  </Button>
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
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {ped.status === "recebido" && (
                      <form action={iniciarConferenciaAction}>
                        <input type="hidden" name="id" value={ped.id} />
                        <Button type="submit" variant="primary">
                          Iniciar conferência
                        </Button>
                      </form>
                    )}

                    {(ped.status === "em_conferencia" || ped.status === "pendente") && (
                      <form action={abrirPendenciaAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={ped.id} />
                        <Input name="descricao" placeholder="descrever pendência" required className="w-44" />
                        <Button type="submit" variant="secondary">
                          Abrir pendência
                        </Button>
                      </form>
                    )}

                    {ped.status === "em_conferencia" && (
                      <form action={liberarPedidoAction}>
                        <input type="hidden" name="id" value={ped.id} />
                        <Button type="submit" variant="primary">
                          Liberar
                        </Button>
                      </form>
                    )}

                    {(ped.status === "recebido" || ped.status === "em_conferencia" || ped.status === "pendente") && (
                      <form action={cancelarPedidoAction}>
                        <input type="hidden" name="id" value={ped.id} />
                        <Button type="submit" variant="danger">
                          Cancelar
                        </Button>
                      </form>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {pedidos.length === 0 && <p className="text-xs text-text-muted">Nenhum pedido ainda.</p>}
        </div>
      </section>
    </>
  );
}
