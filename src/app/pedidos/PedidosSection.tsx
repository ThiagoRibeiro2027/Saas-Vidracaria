"use client";

import { Fragment, useState } from "react";
import {
  iniciarConferenciaAction,
  abrirPendenciaAction,
  resolverPendenciaAction,
  liberarPedidoAction,
  cancelarPedidoAction,
  aplicarAtualizacaoPrecoBomAction,
  ignorarDivergenciaPrecoBomAction,
} from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string };

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

// Mesmo padrão de Orçamentos e Engenharia (2026-10-03/04): lista
// compacta e paginada no servidor; ações de status, itens, divergências
// e pendências de cada pedido só aparecem no modal, ao clicar na linha
// — antes o detalhe ficava sempre empilhado abaixo da tabela.
export default function PedidosSection({
  pedidos,
  paginacao,
  itensPorPedido,
  pendenciasPorPedido,
  numeroOrcamentoPorId,
  pessoas,
  obras,
  itens,
  divergenciasPorPedidoItem,
  canManage,
  pedidoInicialId,
}: {
  pedidos: Pedido[];
  paginacao: PaginacaoInfo;
  itensPorPedido: Map<string, PedidoItem[]>;
  pendenciasPorPedido: Map<string, Pendencia[]>;
  numeroOrcamentoPorId: Map<string, string>;
  pessoas: Pessoa[];
  obras: Obra[];
  itens: Item[];
  divergenciasPorPedidoItem: Map<string, DivergenciaPreco>;
  canManage: boolean;
  // Conversão de orçamentos virou ação dentro do próprio orçamento
  // (comercial/OrcamentosSection.tsx), que linka pra cá com `?pedido=<id>`
  // — pré-seleciona (e já abre o modal d)o pedido gerado em vez do
  // usuário ter que procurá-lo.
  pedidoInicialId: string | null;
}) {
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  const [viewId, setViewId] = useState<string | null>(pedidoInicialId);
  const viewing = pedidos.find((p) => p.id === viewId) ?? null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Pedidos</h2>
      <p className="mb-4 mt-1 text-xs text-text-muted">Clique num pedido para abrir, conferir e liberar.</p>

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
                <tr key={ped.id} onClick={() => setViewId(ped.id)} className="cursor-pointer hover:bg-page-bg">
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
        <Paginacao {...paginacao} />
      </div>

      <Modal open={viewing !== null} onClose={() => setViewId(null)} title={viewing?.numero ?? "Pedido"} size="xl">
        {viewing && (
          <PedidoDetalhe
            pedido={viewing}
            pedItens={itensPorPedido.get(viewing.id) ?? []}
            pendencias={pendenciasPorPedido.get(viewing.id) ?? []}
            divergenciasPorPedidoItem={divergenciasPorPedidoItem}
            itemLabel={itemLabel}
            canManage={canManage}
          />
        )}
      </Modal>
    </section>
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
    <div>
      {canManage && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <form action={iniciarConferenciaAction}>
            <input type="hidden" name="id" value={pedido.id} />
            <Button type="submit" variant="primary" disabled={pedido.status !== "recebido"}>
              Iniciar conferência
            </Button>
          </form>
          <form action={liberarPedidoAction}>
            <input type="hidden" name="id" value={pedido.id} />
            <Button type="submit" variant="primary" disabled={pedido.status !== "em_conferencia"}>
              Liberar
            </Button>
          </form>
          <form action={cancelarPedidoAction}>
            <input type="hidden" name="id" value={pedido.id} />
            <Button
              type="submit"
              variant="danger"
              disabled={!(pedido.status === "recebido" || pedido.status === "em_conferencia" || pedido.status === "pendente")}
            >
              Cancelar
            </Button>
          </form>
        </div>
      )}

      <Table>
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
    </div>
  );
}
