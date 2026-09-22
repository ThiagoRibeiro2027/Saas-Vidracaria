"use client";

import { useState } from "react";
import { atenderNecessidadeCompraAction, cancelarNecessidadeCompraAction, criarNecessidadeCompraAction } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

const ORIGENS = [
  ["manual", "Manual"],
  ["pedido", "Pedido"],
  ["producao", "Produção"],
] as const;

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  atendida: "Atendida",
  cancelada: "Cancelada",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "danger"> = {
  aberta: "neutral",
  atendida: "success",
  cancelada: "danger",
};

type Item = { id: string; codigo: string; descricao: string; unidade_principal: string };
type Necessidade = {
  id: string;
  item_id: string;
  quantidade: number;
  data_necessaria: string | null;
  origem: string;
  status: "aberta" | "atendida" | "cancelada";
  observacoes: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
};

export default function SuprimentosSection({
  rows,
  itens,
  canManage,
}: {
  rows: Necessidade[];
  itens: Item[];
  canManage: boolean;
}) {
  const itemPorId = new Map(itens.map((i) => [i.id, i]));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Necessidades de compra</h2>
      <p className="mt-1 text-xs text-text-muted">
        Recorte mínimo do MVP (ADR-002 §4.18): registrar a necessidade, o material e a quantidade,
        e acompanhar até ser atendida ou cancelada. Sem fornecedor, cotação, pedido de compra ou
        recebimento — a efetivação da compra acontece fora do sistema neste recorte.
      </p>

      {canManage && (
        <div className="mt-3">
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
                  <Td>{row.data_necessaria ? new Date(`${row.data_necessaria}T00:00:00`).toLocaleDateString("pt-BR") : "—"}</Td>
                  <Td>{ORIGENS.find(([v]) => v === row.origem)?.[1] ?? row.origem}</Td>
                  <Td>
                    <Badge variant={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                  </Td>
                  <Td>{row.status === "cancelada" ? row.motivo_cancelamento : row.observacoes}</Td>
                  {canManage && <Td>{row.status === "aberta" && <AcoesNecessidade id={row.id} />}</Td>}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </section>
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
