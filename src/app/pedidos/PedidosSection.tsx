"use client";

import { Fragment, useState } from "react";
import {
  converterOrcamentoAction,
  iniciarConferenciaAction,
  abrirPendenciaAction,
  resolverPendenciaAction,
  liberarPedidoAction,
  cancelarPedidoAction,
  aplicarAtualizacaoPrecoBomAction,
  ignorarDivergenciaPrecoBomAction,
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

type DivergenciaPreco = {
  pedido_item_id: string;
  custo_congelado: number;
  custo_bom_efetiva: number;
  custo_bom_efetiva_parcial: boolean;
  preco_congelado: number;
  preco_sugerido: number;
  delta_custo: number;
};

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
  activeTab,
  pedidos,
  itensPorPedido,
  pendenciasPorPedido,
  numeroOrcamentoPorId,
  orcamentosDisponiveis,
  itensPorOrcamento,
  pessoas,
  obras,
  itens,
  divergenciasPorPedidoItem,
  canManage,
}: {
  activeTab: "pedidos" | "conversao";
  pedidos: Pedido[];
  itensPorPedido: Map<string, PedidoItem[]>;
  pendenciasPorPedido: Map<string, Pendencia[]>;
  numeroOrcamentoPorId: Map<string, string>;
  orcamentosDisponiveis: Orcamento[];
  itensPorOrcamento: Map<string, OrcamentoItem[]>;
  pessoas: Pessoa[];
  obras: Obra[];
  itens: Item[];
  divergenciasPorPedidoItem: Map<string, DivergenciaPreco>;
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pedidos.find((p) => p.id === selectedId) ?? null;

  return (
    <>
      {activeTab === "conversao" && canManage && (
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

      {activeTab === "pedidos" && (
        <section>
          <h2 className="text-sm font-semibold text-text">Pedidos</h2>

          {canManage && (
            <div className="mb-3 mt-2 flex flex-wrap items-center gap-1.5">
              <form action={iniciarConferenciaAction}>
                <input type="hidden" name="id" value={selected?.id ?? ""} />
                <Button type="submit" variant="primary" disabled={selected?.status !== "recebido"}>
                  Iniciar conferência
                </Button>
              </form>
              <form action={liberarPedidoAction}>
                <input type="hidden" name="id" value={selected?.id ?? ""} />
                <Button type="submit" variant="primary" disabled={selected?.status !== "em_conferencia"}>
                  Liberar
                </Button>
              </form>
              <form action={cancelarPedidoAction}>
                <input type="hidden" name="id" value={selected?.id ?? ""} />
                <Button
                  type="submit"
                  variant="danger"
                  disabled={
                    !selected || !(selected.status === "recebido" || selected.status === "em_conferencia" || selected.status === "pendente")
                  }
                >
                  Cancelar
                </Button>
              </form>
              <span className="ml-auto text-xs text-text-muted">
                {selected ? `${selected.numero} selecionado` : "nenhum pedido selecionado"}
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Número</Th>
                  <Th>Cliente</Th>
                  <Th>Obra</Th>
                  <Th>Data</Th>
                  <Th>Origem</Th>
                  <Th>Status</Th>
                  <Th>Pendências</Th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((ped) => {
                  const pendenciasAbertas = (pendenciasPorPedido.get(ped.id) ?? []).filter((p) => !p.resolvida);
                  return (
                    <tr
                      key={ped.id}
                      onClick={() => setSelectedId((prev) => (prev === ped.id ? null : ped.id))}
                      className={`cursor-pointer ${selectedId === ped.id ? "bg-primary-soft" : "hover:bg-page-bg"}`}
                    >
                      <Td className="font-medium text-text">{ped.numero}</Td>
                      <Td>{pessoaNome(ped.pessoa_id)}</Td>
                      <Td className="text-text-muted">{obraNome(ped.obra_id)}</Td>
                      <Td className="text-text-muted">{ped.data_pedido}</Td>
                      <Td className="text-text-muted">{numeroOrcamentoPorId.get(ped.orcamento_id) ?? "(orçamento removido)"}</Td>
                      <Td>
                        <Badge variant={STATUS_TONE[ped.status]}>{STATUS_LABEL[ped.status]}</Badge>
                      </Td>
                      <Td>{pendenciasAbertas.length > 0 ? <span className="text-warning">{pendenciasAbertas.length} aberta(s)</span> : "—"}</Td>
                    </tr>
                  );
                })}
                {pedidos.length === 0 && (
                  <tr>
                    <Td colSpan={7} className="text-text-muted">
                      Nenhum pedido ainda.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>

          {selected && (
            <PedidoDetalhe
              pedido={selected}
              pedItens={itensPorPedido.get(selected.id) ?? []}
              pendencias={pendenciasPorPedido.get(selected.id) ?? []}
              divergenciasPorPedidoItem={divergenciasPorPedidoItem}
              itemLabel={itemLabel}
              canManage={canManage}
            />
          )}
        </section>
      )}
    </>
  );
}

function PedidoDetalhe({
  pedido,
  pedItens,
  pendencias,
  divergenciasPorPedidoItem,
  itemLabel,
  canManage,
}: {
  pedido: Pedido;
  pedItens: PedidoItem[];
  pendencias: Pendencia[];
  divergenciasPorPedidoItem: Map<string, DivergenciaPreco>;
  itemLabel: (id: string) => string;
  canManage: boolean;
}) {
  const podeAbrirPendencia = canManage && (pedido.status === "em_conferencia" || pedido.status === "pendente");

  return (
    <Card padding="xs" className="mt-3">
      <strong className="text-sm text-text">Itens do pedido {pedido.numero}</strong>

      <Table className="mt-2">
        <thead>
          <tr>
            <Th>Item</Th>
            <Th>Qtd</Th>
            <Th>Preço unit.</Th>
          </tr>
        </thead>
        <tbody>
          {pedItens.map((pi) => {
            const divergencia = divergenciasPorPedidoItem.get(pi.id);
            return (
              <Fragment key={pi.id}>
                <tr>
                  <Td>{itemLabel(pi.item_id)}</Td>
                  <Td>{pi.quantidade}</Td>
                  <Td>{pi.preco_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Td>
                </tr>
                {divergencia && (
                  <tr>
                    <Td colSpan={3}>
                      <div className="rounded border border-warning/30 bg-warning/5 p-2 text-xs">
                        <p className="font-medium text-text">
                          Divergência de preço (ADR-012 §Fase 3) — a BOM definitiva da Engenharia ficou{" "}
                          {divergencia.delta_custo > 0 ? "mais cara" : "mais barata"} do que o custo que formou este preço.
                        </p>
                        <p className="mt-0.5 text-text-muted">
                          Custo congelado (orçamento): {currency(divergencia.custo_congelado)} · Custo real da BOM:{" "}
                          {currency(divergencia.custo_bom_efetiva)}
                          {divergencia.custo_bom_efetiva_parcial && " (parcial — algum material sem histórico de custo)"}
                          {" · "}Preço atual: {currency(divergencia.preco_congelado)} · Preço sugerido:{" "}
                          {currency(divergencia.preco_sugerido)}
                        </p>
                        {canManage && (
                          <div className="mt-1.5 flex gap-1.5">
                            <form action={aplicarAtualizacaoPrecoBomAction}>
                              <input type="hidden" name="pedido_item_id" value={pi.id} />
                              <Button type="submit" variant="primary" size="sm">
                                Aplicar preço sugerido ({currency(divergencia.preco_sugerido)})
                              </Button>
                            </form>
                            <form action={ignorarDivergenciaPrecoBomAction}>
                              <input type="hidden" name="pedido_item_id" value={pi.id} />
                              <Button type="submit" variant="secondary" size="sm">
                                Manter preço atual
                              </Button>
                            </form>
                          </div>
                        )}
                      </div>
                    </Td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </Table>

      {(pendencias.length > 0 || podeAbrirPendencia) && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-medium text-text">Pendências</h3>
          {pendencias.length > 0 && (
            <ul className="m-0 flex flex-col gap-1 pl-4 text-xs">
              {pendencias.map((pd) => (
                <li key={pd.id}>
                  {pd.resolvida ? (
                    <span className="text-text-muted">
                      <s>{pd.descricao}</s> — resolvida{pd.resolucao ? `: ${pd.resolucao}` : ""}
                    </span>
                  ) : (
                    <span>
                      {pd.descricao}
                      {canManage && (
                        <form action={resolverPendenciaAction} className="ml-2 inline-flex items-center gap-1">
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
          )}
          {podeAbrirPendencia && (
            <form action={abrirPendenciaAction} className="mt-1.5 flex items-center gap-1.5">
              <input type="hidden" name="id" value={pedido.id} />
              <Input name="descricao" placeholder="descrever pendência" required className="w-52" />
              <Button type="submit" variant="secondary">
                Abrir pendência
              </Button>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
