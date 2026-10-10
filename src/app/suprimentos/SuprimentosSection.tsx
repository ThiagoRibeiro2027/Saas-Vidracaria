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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";
import { formatarData } from "@/lib/formato/data";
import { TableSearch } from "@/components/ui/TableSearch";
import { SortableTh } from "@/components/ui/SortableTh";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  paginacao,
  itens,
  pedidos,
  ordensProducao,
  canManage,
}: {
  rows: Necessidade[];
  paginacao: PaginacaoInfo;
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
        <NovaNecessidadeBlock pedidos={pedidos} ordensProducao={ordensProducao} pedidoPorId={pedidoPorId} itens={itens} />
      )}

      <div className="mb-2 mt-3 flex flex-wrap items-center gap-2">
        <TableSearch placeholder="Buscar por observação..." />
        <FiltroStatusNecessidade />
        <FiltroOrigemNecessidade />
      </div>

      <Paginacao {...paginacao} posicao="topo" />

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Item</Th>
            <SortableTh field="quantidade">Quantidade</SortableTh>
            <Th>Necessária em</Th>
            <Th>Origem</Th>
            <SortableTh field="status">Status</SortableTh>
            <Th>Observações</Th>
            {canManage && <Th />}
          </DenseTableHeaderRow>
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
                    <StatusPill tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</StatusPill>
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
            {rows.length === 0 && (
              <tr>
                <Td colSpan={canManage ? 7 : 6} className="text-text-muted">
                  Nenhuma necessidade registrada ainda.
                </Td>
              </tr>
            )}
          </tbody>
      </DenseTable>
    </section>
  );
}

function NovaNecessidadeBlock({
  pedidos,
  ordensProducao,
  pedidoPorId,
  itens,
}: {
  pedidos: Pedido[];
  ordensProducao: OrdemProducao[];
  pedidoPorId: Map<string, Pedido>;
  itens: Item[];
}) {
  const [criando, setCriando] = useState(false);

  if (!criando) {
    return (
      <Button type="button" variant="primary" size="sm" onClick={() => setCriando(true)} className="mt-3">
        + Nova necessidade
      </Button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md bg-page-bg p-2">
      <GerarNecessidadesForm
        pedidos={pedidos}
        ordensProducao={ordensProducao}
        pedidoPorId={pedidoPorId}
        onDone={() => setCriando(false)}
      />
      <NovaNecessidadeForm itens={itens} onDone={() => setCriando(false)} />
      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setCriando(false)}>
        Fechar
      </Button>
    </div>
  );
}

function GerarNecessidadesForm({
  pedidos,
  ordensProducao,
  pedidoPorId,
  onDone,
}: {
  pedidos: Pedido[];
  ordensProducao: OrdemProducao[];
  pedidoPorId: Map<string, Pedido>;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <form action={gerarNecessidadesDePedidoAction} className="flex items-center gap-1.5" onSubmit={onDone}>
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

      <form action={gerarNecessidadesDeOrdemProducaoAction} className="flex items-center gap-1.5" onSubmit={onDone}>
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

function NovaNecessidadeForm({ itens, onDone }: { itens: Item[]; onDone: () => void }) {
  return (
    <form action={criarNecessidadeCompraAction} className="flex flex-wrap items-center gap-1.5" onSubmit={onDone}>
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

function FiltroStatusNecessidade() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get("status") ?? "";

  function onChange(novoValor: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoValor) p.set("status", novoValor);
    else p.delete("status");
    p.delete("pagina");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por status"
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    >
      <option value="">Todos os status</option>
      {(Object.entries(STATUS_LABEL) as [string, string][]).map(([valorOpcao, rotulo]) => (
        <option key={valorOpcao} value={valorOpcao}>
          {rotulo}
        </option>
      ))}
    </select>
  );
}

function FiltroOrigemNecessidade() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get("origem") ?? "";

  function onChange(novoValor: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoValor) p.set("origem", novoValor);
    else p.delete("origem");
    p.delete("pagina");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por origem"
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    >
      <option value="">Todas as origens</option>
      {ORIGENS.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
