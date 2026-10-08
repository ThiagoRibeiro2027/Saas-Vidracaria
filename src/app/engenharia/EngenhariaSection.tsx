"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { criarItemProducaoAction, registrarMedicaoAction, confirmarMedicaoAction, definirValorCaracteristicaAction } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { Modal } from "@/components/ui/Modal";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";
import BomPedidoItem from "./BomPedidoItem";

type Caracteristica = {
  peca_caracteristica_id: string;
  nome: string;
  tipo: string;
  unidade: string | null;
  obrigatoria: boolean;
  valor_numero: number | null;
  valor_texto: string | null;
};

type BomLinha = {
  pedido_item_bom_id: string;
  status: string;
  aprovado_por: string | null;
  aprovado_em: string | null;
  pedido_item_bom_item_id: string | null;
  material_item_id: string | null;
  material_codigo: string | null;
  material_descricao: string | null;
  quantidade_por_unidade: number | null;
  origem: string | null;
};

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string; tipo: string };

type Pedido = {
  id: string;
  numero: string;
  pessoa_id: string;
  obra_id: string | null;
};

type PedidoItem = { id: string; pedido_id: string; item_id: string; quantidade: number };

type ItemProducao = {
  id: string;
  pedido_item_id: string;
  ambiente: string | null;
  largura_mm: number | null;
  altura_mm: number | null;
  medida_confirmada: boolean;
};

// 2026-10-04: três níveis, aprovados em desenho — lista paginada de
// pedidos; clicar expande, na própria tabela, a lista numerada dos
// itens daquele pedido ("Posição N"); clicar num item só então abre o
// modal com a conferência completa (medição, características, BOM).
// Mesmo princípio aplicado em Pedidos e Orçamentos.
export default function EngenhariaSection({
  pedidos,
  paginacao,
  pedidoItensPorPedido,
  itemProducaoPorPedidoItem,
  pessoas,
  obras,
  itens,
  caracteristicasPorPedidoItem,
  bomPorPedidoItem,
  pecaIdPorItemId,
  canManage,
}: {
  pedidos: Pedido[];
  paginacao: PaginacaoInfo;
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  itemProducaoPorPedidoItem: Map<string, ItemProducao>;
  pessoas: Pessoa[];
  obras: Obra[];
  itens: Item[];
  caracteristicasPorPedidoItem: Map<string, Caracteristica[]>;
  bomPorPedidoItem: Map<string, BomLinha[]>;
  pecaIdPorItemId: Map<string, string>;
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<{ pedidoId: string; itemId: string } | null>(null);
  const itemViewing = viewItem
    ? (pedidoItensPorPedido.get(viewItem.pedidoId) ?? []).find((pi) => pi.id === viewItem.itemId) ?? null
    : null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Itens a fabricar</h2>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Medição em obra por item de pedido liberado, com confirmação antes da produção (TÓPICO 16
        §7). Quando o item é uma peça configurável (TÓPICO 5, Fases F-H): valor das características,
        geração da BOM sugerida pelo motor de regras, ajuste manual e aprovação da BOM definitiva.
        Clique num pedido para ver os itens; clique num item para abrir a conferência.
      </p>

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Pedido</Th>
            <Th>Cliente</Th>
            <Th>Obra</Th>
            <Th className="text-right">Itens</Th>
            <Th className="w-6" />
          </DenseTableHeaderRow>
        </thead>
        <tbody>
            {pedidos.map((ped) => {
              const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];
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
                    <Td className="text-right">{itensDoPedido.length}</Td>
                    <Td className="text-text-muted">{expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                  </tr>
                  {expandido && (
                    <tr>
                      <Td colSpan={5} className="bg-page-bg">
                        <div className="flex flex-col gap-1 py-1">
                          {itensDoPedido.map((pi, idx) => (
                            <ItemLinhaResumo
                              key={pi.id}
                              posicao={idx + 1}
                              label={itemLabel(pi.item_id)}
                              quantidade={pi.quantidade}
                              producao={itemProducaoPorPedidoItem.get(pi.id)}
                              onClick={() => setViewItem({ pedidoId: ped.id, itemId: pi.id })}
                            />
                          ))}
                          {itensDoPedido.length === 0 && <p className="text-xs text-text-muted">Pedido sem itens.</p>}
                        </div>
                      </Td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {pedidos.length === 0 && (
              <tr>
                <Td colSpan={5} className="text-text-muted">
                  Nenhum pedido liberado ainda — a Engenharia só entra depois da liberação (TÓPICO 3).
                </Td>
              </tr>
            )}
          </tbody>
      </DenseTable>
      <Paginacao {...paginacao} />

      <Modal
        open={itemViewing !== null}
        onClose={() => setViewItem(null)}
        title={itemViewing ? itemLabel(itemViewing.item_id) : "Item"}
        size="lg"
      >
        {itemViewing && (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Qtd</Th>
                <Th>Ambiente</Th>
                <Th>Largura (mm)</Th>
                <Th>Altura (mm)</Th>
                <Th>Medida</Th>
                {canManage && <Th />}
              </tr>
            </thead>
            <tbody>
              <ItemProducaoRow
                pedidoItem={itemViewing}
                producao={itemProducaoPorPedidoItem.get(itemViewing.id)}
                itemLabel={itemLabel(itemViewing.item_id)}
                caracteristicas={caracteristicasPorPedidoItem.get(itemViewing.id) ?? []}
                bomLinhas={bomPorPedidoItem.get(itemViewing.id) ?? []}
                ehPecaConfiguravel={pecaIdPorItemId.has(itemViewing.item_id)}
                itens={itens}
                canManage={canManage}
              />
            </tbody>
          </Table>
        )}
      </Modal>
    </section>
  );
}

// Linha compacta da lista expandida (nível 2) — "Posição N", item e um
// resumo de status, sem nada editável; editar abre o modal (nível 3).
function ItemLinhaResumo({
  posicao,
  label,
  quantidade,
  producao,
  onClick,
}: {
  posicao: number;
  label: string;
  quantidade: number;
  producao: ItemProducao | undefined;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2 rounded border border-border-subtle bg-surface px-2.5 py-1.5 text-xs hover:border-border-strong"
    >
      <span className="text-text-muted">Posição {posicao}</span>
      <span className="flex-1 text-text">{label}</span>
      <span className="text-text-muted">{quantidade} un.</span>
      {!producao ? (
        <span className="text-text-muted">Engenharia não iniciada</span>
      ) : (
        <Badge variant={producao.medida_confirmada ? "success" : "warning"}>
          {producao.medida_confirmada ? "Confirmada" : "Não confirmada"}
        </Badge>
      )}
    </div>
  );
}

function ItemProducaoRow({
  pedidoItem,
  producao,
  itemLabel,
  caracteristicas,
  bomLinhas,
  ehPecaConfiguravel,
  itens,
  canManage,
}: {
  pedidoItem: PedidoItem;
  producao: ItemProducao | undefined;
  itemLabel: string;
  caracteristicas: Caracteristica[];
  bomLinhas: BomLinha[];
  ehPecaConfiguravel: boolean;
  itens: Item[];
  canManage: boolean;
}) {
  if (!producao) {
    return (
      <tr>
        <Td>{itemLabel}</Td>
        <Td>{pedidoItem.quantidade}</Td>
        <Td colSpan={4}>
          <span className="text-text-muted">Engenharia ainda não iniciada</span>
        </Td>
        {canManage && (
          <Td>
            <form action={criarItemProducaoAction}>
              <input type="hidden" name="pedido_item_id" value={pedidoItem.id} />
              <Button type="submit" variant="primary">
                Iniciar engenharia
              </Button>
            </form>
          </Td>
        )}
      </tr>
    );
  }

  return (
    <>
      <tr>
        <Td>{itemLabel}</Td>
        <Td>{pedidoItem.quantidade}</Td>
        {canManage ? (
          <Td colSpan={4}>
            <form action={registrarMedicaoAction} className="flex flex-wrap items-center gap-1.5">
              <input type="hidden" name="id" value={producao.id} />
              <Input name="ambiente" placeholder="ambiente" defaultValue={producao.ambiente ?? ""} className="w-28" />
              <Input
                name="largura_mm"
                type="number"
                step="0.1"
                min="0.1"
                placeholder="largura (mm)"
                defaultValue={producao.largura_mm ?? ""}
                required
                className="w-[90px]"
              />
              <Input
                name="altura_mm"
                type="number"
                step="0.1"
                min="0.1"
                placeholder="altura (mm)"
                defaultValue={producao.altura_mm ?? ""}
                required
                className="w-[90px]"
              />
              <Button type="submit" variant="primary">
                {producao.largura_mm ? "Corrigir medida" : "Registrar medida"}
              </Button>
              <Badge variant={producao.medida_confirmada ? "success" : "warning"}>
                {producao.medida_confirmada ? "Confirmada" : "Não confirmada"}
              </Badge>
            </form>
            {!producao.medida_confirmada && producao.largura_mm != null && (
              <form action={confirmarMedicaoAction} className="mt-1">
                <input type="hidden" name="id" value={producao.id} />
                <Button type="submit" variant="primary">
                  Confirmar medida
                </Button>
              </form>
            )}
          </Td>
        ) : (
          <>
            <Td>{producao.ambiente ?? "—"}</Td>
            <Td>{producao.largura_mm ?? "—"}</Td>
            <Td>{producao.altura_mm ?? "—"}</Td>
            <Td>
              <Badge variant={producao.medida_confirmada ? "success" : "warning"}>
                {producao.medida_confirmada ? "Confirmada" : "Não confirmada"}
              </Badge>
            </Td>
          </>
        )}
      </tr>
      {caracteristicas.length > 0 && (
        <tr>
          <Td colSpan={canManage ? 7 : 6}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="font-medium text-text">Características (configurador):</span>
              {caracteristicas.map((c) => (
                <CaracteristicaValor key={c.peca_caracteristica_id} pedidoItemId={pedidoItem.id} caracteristica={c} canManage={canManage} />
              ))}
            </div>
          </Td>
        </tr>
      )}
      <BomPedidoItem
        pedidoItemId={pedidoItem.id}
        ehPecaConfiguravel={ehPecaConfiguravel}
        linhas={bomLinhas}
        itens={itens}
        canManage={canManage}
      />
    </>
  );
}

function CaracteristicaValor({
  pedidoItemId,
  caracteristica,
  canManage,
}: {
  pedidoItemId: string;
  caracteristica: Caracteristica;
  canManage: boolean;
}) {
  const valorAtual = caracteristica.valor_numero ?? caracteristica.valor_texto ?? "";

  if (!canManage) {
    return (
      <span>
        {caracteristica.nome}: {valorAtual || "—"} {caracteristica.unidade ?? ""}
      </span>
    );
  }

  return (
    <form action={definirValorCaracteristicaAction} className="flex items-center gap-1">
      <input type="hidden" name="pedido_item_id" value={pedidoItemId} />
      <input type="hidden" name="peca_caracteristica_id" value={caracteristica.peca_caracteristica_id} />
      <input type="hidden" name="tipo" value={caracteristica.tipo} />
      <span>{caracteristica.nome}:</span>
      <Input name="valor" defaultValue={valorAtual} placeholder={caracteristica.unidade ?? "valor"} className="w-24" />
      <Button type="submit" variant="primary">
        Salvar
      </Button>
    </form>
  );
}
