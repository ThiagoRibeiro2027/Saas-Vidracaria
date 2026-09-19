"use client";

import { criarItemProducaoAction, registrarMedicaoAction, confirmarMedicaoAction } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td } from "@/components/ui/Table";

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

export default function EngenhariaSection({
  pedidos,
  pedidoItensPorPedido,
  itemProducaoPorPedidoItem,
  pessoas,
  obras,
  itens,
  canManage,
}: {
  pedidos: Pedido[];
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  itemProducaoPorPedidoItem: Map<string, ItemProducao>;
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
    <section>
      <div className="flex flex-col gap-4">
        {pedidos.map((ped) => {
          const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];

          return (
            <Card key={ped.id} padding="xs">
              <div className="flex flex-wrap items-baseline gap-2.5 text-xs">
                <strong className="text-[13px] text-text">{ped.numero}</strong>
                <span>{pessoaNome(ped.pessoa_id)}</span>
                <span className="text-text-muted">{obraNome(ped.obra_id)}</span>
              </div>

              <Table className="mt-2">
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
                  {itensDoPedido.map((pi) => {
                    const producao = itemProducaoPorPedidoItem.get(pi.id);
                    return (
                      <ItemProducaoRow
                        key={pi.id}
                        pedidoItem={pi}
                        producao={producao}
                        itemLabel={itemLabel(pi.item_id)}
                        canManage={canManage}
                      />
                    );
                  })}
                </tbody>
              </Table>
              {itensDoPedido.length === 0 && <p className="mt-2 text-xs text-text-muted">Pedido sem itens.</p>}
            </Card>
          );
        })}
        {pedidos.length === 0 && (
          <p className="text-xs text-text-muted">
            Nenhum pedido liberado ainda — a Engenharia só entra depois da liberação (TÓPICO 3).
          </p>
        )}
      </div>
    </section>
  );
}

function ItemProducaoRow({
  pedidoItem,
  producao,
  itemLabel,
  canManage,
}: {
  pedidoItem: PedidoItem;
  producao: ItemProducao | undefined;
  itemLabel: string;
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
  );
}
