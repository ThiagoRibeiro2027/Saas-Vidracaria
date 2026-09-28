"use client";

import { useState } from "react";
import {
  atenderNecessidadeCompraAction,
  cancelarNecessidadeCompraAction,
  criarNecessidadeCompraAction,
  gerarNecessidadesDePedidoAction,
  gerarNecessidadesDeOrdemProducaoAction,
  registrarRecebimentoNecessidadeAction,
} from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { formatarData } from "@/lib/formato/data";

const ORIGENS = [
  ["manual", "Manual"],
  ["pedido", "Pedido"],
  ["producao", "Produção"],
] as const;

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  atendida: "Atendida",
  cancelada: "Cancelada",
  recebida: "Recebida",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "danger"> = {
  aberta: "neutral",
  atendida: "success",
  cancelada: "danger",
  recebida: "success",
};

type Item = { id: string; codigo: string; descricao: string; unidade_principal: string };
type Necessidade = {
  id: string;
  item_id: string;
  quantidade: number;
  data_necessaria: string | null;
  origem: string;
  status: "aberta" | "atendida" | "cancelada" | "recebida";
  observacoes: string | null;
  motivo_cancelamento: string | null;
  quantidade_recebida: number | null;
  data_recebimento: string | null;
  created_at: string;
};

type Pedido = { id: string; numero: string };
type OrdemProducao = { id: string; numero: string; pedido_id: string };

export default function SuprimentosSection({
  rows,
  itens,
  pedidos,
  ordensProducao,
  canManage,
}: {
  rows: Necessidade[];
  itens: Item[];
  pedidos: Pedido[];
  ordensProducao: OrdemProducao[];
  canManage: boolean;
}) {
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const pedidoPorId = new Map(pedidos.map((p) => [p.id, p]));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Necessidades de compra</h2>
      <p className="mt-1 text-xs text-text-muted">
        Recorte mínimo do MVP (ADR-002 §4.18): registrar a necessidade, o material e a quantidade,
        e acompanhar até ser atendida, cancelada ou recebida. Sem fornecedor, cotação ou pedido de
        compra — a negociação/efetivação da compra acontece fora do sistema. Recebimento (ADR-002
        §4.18 v2.7, Fase D) é só o passo a mais que fecha o ciclo: marcar como recebida com a
        quantidade recebida dá entrada física no estoque — sem nota fiscal, conferência ou
        recebimento parcial rastreado por remessa.
      </p>

      {canManage && (
        <div className="mt-3 flex flex-col gap-2">
          <GerarNecessidadesForm pedidos={pedidos} ordensProducao={ordensProducao} pedidoPorId={pedidoPorId} />
          <NovaNecessidadeForm itens={itens} />
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Quantidade</Th>
              <Th>Necessária em</Th>
              <Th>Origem</Th>
              <Th>Status</Th>
              <Th>Observações</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const item = itemPorId.get(row.item_id);
              return (
                <tr key={row.id}>
                  <Td>{item ? `${item.codigo} — ${item.descricao}` : row.item_id}</Td>
                  <Td>
                    {row.quantidade} {item?.unidade_principal ?? ""}
                  </Td>
                  <Td>{formatarData(row.data_necessaria)}</Td>
                  <Td>{ORIGENS.find(([v]) => v === row.origem)?.[1] ?? row.origem}</Td>
                  <Td>
                    <Badge variant={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                  </Td>
                  <Td>
                    {row.status === "cancelada" && row.motivo_cancelamento}
                    {row.status === "recebida" &&
                      `Recebido: ${row.quantidade_recebida} ${item?.unidade_principal ?? ""} em ${
                        row.data_recebimento ? new Date(row.data_recebimento).toLocaleDateString("pt-BR") : "—"
                      }`}
                    {row.status !== "cancelada" && row.status !== "recebida" && row.observacoes}
                  </Td>
                  {canManage && (
                    <Td>
                      {row.status === "aberta" && <AcoesNecessidade id={row.id} />}
                      {row.status === "atendida" && <RegistrarRecebimentoForm id={row.id} unidade={item?.unidade_principal ?? ""} />}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

function GerarNecessidadesForm({
  pedidos,
  ordensProducao,
  pedidoPorId,
}: {
  pedidos: Pedido[];
  ordensProducao: OrdemProducao[];
  pedidoPorId: Map<string, Pedido>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md bg-page-bg p-2">
      <form action={gerarNecessidadesDePedidoAction} className="flex items-center gap-1.5">
        <Select name="pedido_id" required className="w-40">
          <option value="">Gerar do pedido…</option>
          {pedidos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.numero}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Gerar necessidades
        </Button>
      </form>

      <form action={gerarNecessidadesDeOrdemProducaoAction} className="flex items-center gap-1.5">
        <Select name="ordem_producao_id" required className="w-56">
          <option value="">Gerar da ordem de produção…</option>
          {ordensProducao.map((op) => (
            <option key={op.id} value={op.id}>
              {op.numero} ({pedidoPorId.get(op.pedido_id)?.numero ?? op.pedido_id})
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Gerar necessidades
        </Button>
      </form>
    </div>
  );
}

function NovaNecessidadeForm({ itens }: { itens: Item[] }) {
  return (
    <form action={criarNecessidadeCompraAction} className="flex flex-wrap items-center gap-1.5">
      <Select name="item_id" required>
        <option value="">item…</option>
        {itens.map((i) => (
          <option key={i.id} value={i.id}>
            {i.codigo} — {i.descricao}
          </option>
        ))}
      </Select>
      <Input name="quantidade" type="number" min="0" step="0.001" placeholder="quantidade" required className="w-24" />
      <Input name="data_necessaria" type="date" />
      <Select name="origem" defaultValue="manual">
        {ORIGENS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Input name="observacoes" placeholder="observações (opcional)" className="w-44" />
      <Button type="submit" variant="primary">
        Registrar necessidade
      </Button>
    </form>
  );
}

function RegistrarRecebimentoForm({ id, unidade }: { id: string; unidade: string }) {
  const [recebendo, setRecebendo] = useState(false);

  if (!recebendo) {
    return (
      <Button type="button" variant="secondary" onClick={() => setRecebendo(true)}>
        Registrar recebimento
      </Button>
    );
  }

  return (
    <form
      action={registrarRecebimentoNecessidadeAction}
      className="flex items-center gap-1"
      onSubmit={() => setRecebendo(false)}
    >
      <input type="hidden" name="id" value={id} />
      <Input
        name="quantidade_recebida"
        type="number"
        min="0.001"
        step="0.001"
        placeholder={`qtd. recebida (${unidade})`}
        required
        className="w-28"
      />
      <Input name="observacao" placeholder="observação (opcional)" className="w-32" />
      <Button type="submit" variant="primary">
        Confirmar
      </Button>
      <Button type="button" variant="secondary" onClick={() => setRecebendo(false)}>
        Voltar
      </Button>
    </form>
  );
}

function AcoesNecessidade({ id }: { id: string }) {
  const [cancelando, setCancelando] = useState(false);

  if (cancelando) {
    return (
      <form action={cancelarNecessidadeCompraAction} className="flex items-center gap-1" onSubmit={() => setCancelando(false)}>
        <input type="hidden" name="id" value={id} />
        <Input name="motivo" placeholder="motivo (opcional)" className="w-28" />
        <Button type="submit" variant="danger">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setCancelando(false)}>
          Voltar
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <form action={atenderNecessidadeCompraAction}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="primary">
          Atender
        </Button>
      </form>
      <Button type="button" variant="outlineDanger" onClick={() => setCancelando(true)}>
        Cancelar
      </Button>
    </div>
  );
}
