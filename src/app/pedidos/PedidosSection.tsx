"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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

const COLUNAS = 8;

// 2026-10-04: três níveis, aprovados em desenho — lista paginada de
// pedidos; clicar expande, na própria tabela, as ações do pedido
// (conferência/liberação/cancelamento, pendências) e a lista numerada
// dos itens ("Posição N"); clicar num item só então abre o modal com a
// conferência daquele item (preço e, se houver, divergência da BOM).
// Mesmo princípio aplicado em Engenharia e Orçamentos.
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
  // — pré-expande o pedido gerado em vez do usuário ter que procurá-lo.
  pedidoInicialId: string | null;
}) {
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  const [expandedId, setExpandedId] = useState<string | null>(pedidoInicialId);
  const [viewItem, setViewItem] = useState<{ pedidoId: string; itemId: string } | null>(null);
  const itemViewing = viewItem
    ? (itensPorPedido.get(viewItem.pedidoId) ?? []).find((pi) => pi.id === viewItem.itemId) ?? null
    : null;
  const divergenciaViewing = itemViewing ? divergenciasPorPedidoItem.get(itemViewing.id) ?? null : null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Pedidos</h2>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Clique num pedido para ver ações e itens; clique num item para conferir o preço.
      </p>

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
              <Th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {pedidos.map((ped) => {
              const pendenciasAbertas = (pendenciasPorPedido.get(ped.id) ?? []).filter((p) => !p.resolvida);
              const expandido = expandedId === ped.id;
              return (
                <Fragment key={ped.id}>
                  <tr
                    onClick={() => setExpandedId((prev) => (prev === ped.id ? null : ped.id))}
                    className="cursor-pointer hover:bg-page-bg"
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
                    <Td className="text-text-muted">{expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                  </tr>
                  {expandido && (
                    <tr>
                      <Td colSpan={COLUNAS} className="bg-page-bg">
                        <PedidoExpandido
                          pedido={ped}
                          pedItens={itensPorPedido.get(ped.id) ?? []}
                          pendencias={pendenciasPorPedido.get(ped.id) ?? []}
                          divergenciasPorPedidoItem={divergenciasPorPedidoItem}
                          itemLabel={itemLabel}
                          canManage={canManage}
                          onSelecionarItem={(itemId) => setViewItem({ pedidoId: ped.id, itemId })}
                        />
                      </Td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {pedidos.length === 0 && (
              <tr>
                <Td colSpan={COLUNAS} className="text-text-muted">
                  Nenhum pedido ainda.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
        <Paginacao {...paginacao} />
      </div>

      <Modal
        open={itemViewing !== null}
        onClose={() => setViewItem(null)}
        title={itemViewing ? itemLabel(itemViewing.item_id) : "Item"}
        size="md"
      >
        {itemViewing && (
          <ItemConferencia item={itemViewing} divergencia={divergenciaViewing} canManage={canManage} />
        )}
      </Modal>
    </section>
  );
}

// Nível 2 — expandido na própria tabela: ações do pedido, pendências e
// a lista numerada dos itens. Nenhum item é editável aqui; clicar num
// item abre o modal (nível 3).
function PedidoExpandido({
  pedido,
  pedItens,
  pendencias,
  divergenciasPorPedidoItem,
  itemLabel,
  canManage,
  onSelecionarItem,
}: {
  pedido: Pedido;
  pedItens: PedidoItem[];
  pendencias: Pendencia[];
  divergenciasPorPedidoItem: Map<string, DivergenciaPreco>;
  itemLabel: (id: string) => string;
  canManage: boolean;
  onSelecionarItem: (itemId: string) => void;
}) {
  const podeAbrirPendencia = canManage && (pedido.status === "em_conferencia" || pedido.status === "pendente");

  return (
    <div className="py-1">
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

      <div className="flex flex-col gap-1">
        {pedItens.map((pi, idx) => {
          const divergencia = divergenciasPorPedidoItem.get(pi.id);
          return (
            <div
              key={pi.id}
              onClick={() => onSelecionarItem(pi.id)}
              className="flex cursor-pointer items-center gap-2 rounded border border-border-subtle bg-surface px-2.5 py-1.5 text-xs hover:border-border-strong"
            >
              <span className="text-text-muted">Posição {idx + 1}</span>
              <span className="flex-1 text-text">{itemLabel(pi.item_id)}</span>
              <span className="text-text-muted">{pi.quantidade} un.</span>
              <span className="text-text">{currency(pi.preco_unitario)}</span>
              {divergencia && <Badge variant="warning">divergência de preço</Badge>}
            </div>
          );
        })}
        {pedItens.length === 0 && <p className="text-xs text-text-muted">Pedido sem itens.</p>}
      </div>

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

// Nível 3 — modal de um único item: preço e, se houver, a divergência
// de preço da BOM (ADR-012 §Fase 3) com as ações de aplicar/manter.
function ItemConferencia({
  item,
  divergencia,
  canManage,
}: {
  item: PedidoItem;
  divergencia: DivergenciaPreco | null;
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Quantidade: {item.quantidade}</span>
        <span>Preço unit.: {currency(item.preco_unitario)}</span>
      </div>

      {divergencia ? (
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
                <input type="hidden" name="pedido_item_id" value={item.id} />
                <Button type="submit" variant="primary" size="sm">
                  Aplicar preço sugerido ({currency(divergencia.preco_sugerido)})
                </Button>
              </form>
              <form action={ignorarDivergenciaPrecoBomAction}>
                <input type="hidden" name="pedido_item_id" value={item.id} />
                <Button type="submit" variant="secondary" size="sm">
                  Manter preço atual
                </Button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-muted">Sem divergência de preço.</p>
      )}
    </div>
  );
}
