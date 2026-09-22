"use client";

import { useRef, useState } from "react";
import { cancelarTituloFinanceiroAction, gerarTitulosPedidoAction, registrarRecebimentoTituloAction } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  parcial: "Parcial",
  pago: "Pago",
  cancelado: "Cancelado",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  aberto: "neutral",
  parcial: "warning",
  pago: "success",
  cancelado: "danger",
};

type Titulo = {
  id: string;
  pedido_id: string;
  numero: string;
  valor: number;
  valor_recebido: number;
  saldo_pendente: number;
  vencimento: string;
  condicao_pagamento: string | null;
  parcela_numero: number;
  parcela_total: number;
  status: "aberto" | "parcial" | "pago" | "cancelado";
  motivo_cancelamento: string | null;
};

type PedidoResumo = { id: string; numero: string; pessoa_id: string };

export default function FinanceiroSection({
  titulos,
  pedidosSemTitulo,
  nomePorPedido,
  nomePorPessoa,
  canManage,
  canReceber,
}: {
  titulos: Titulo[];
  pedidosSemTitulo: PedidoResumo[];
  nomePorPedido: Map<string, PedidoResumo>;
  nomePorPessoa: Map<string, string>;
  canManage: boolean;
  canReceber: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Títulos financeiros</h2>
      <p className="mt-1 text-xs text-text-muted">
        Recorte mínimo do MVP (ADR-002 §4.14): título a receber vinculado a pedido, gerado
        manualmente com as parcelas planejadas — a soma precisa fechar o valor do pedido. Sem
        plano de contas, contas a pagar, conciliação ou DRE.
      </p>

      {canManage && pedidosSemTitulo.length > 0 && (
        <div className="mt-3">
          <GerarTitulosForm pedidos={pedidosSemTitulo} />
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Número</Th>
              <Th>Pedido</Th>
              <Th>Cliente</Th>
              <Th>Parcela</Th>
              <Th>Valor</Th>
              <Th>Recebido</Th>
              <Th>Saldo</Th>
              <Th>Vencimento</Th>
              <Th>Status</Th>
              {(canManage || canReceber) && <Th />}
            </tr>
          </thead>
          <tbody>
            {titulos.map((t) => {
              const pedido = nomePorPedido.get(t.pedido_id);
              // Mesmo parsing (local, não UTC) usado na exibição da data
              // logo abaixo — um new Date(t.vencimento) bare interpreta
              // "YYYY-MM-DD" como meia-noite UTC, que em UTC-3 (Brasil)
              // fica atrás da meia-noite local o dia inteiro, marcando um
              // título com vencimento hoje como "vencido" prematuramente.
              const vencido = t.status !== "pago" && t.status !== "cancelado" && new Date(`${t.vencimento}T00:00:00`) < new Date(new Date().toDateString());
              return (
                <tr key={t.id}>
                  <Td>{t.numero}</Td>
                  <Td>{pedido?.numero ?? t.pedido_id}</Td>
                  <Td>{pedido ? nomePorPessoa.get(pedido.pessoa_id) ?? "—" : "—"}</Td>
                  <Td>{t.parcela_numero}/{t.parcela_total}</Td>
                  <Td>{currency(t.valor)}</Td>
                  <Td>{currency(t.valor_recebido)}</Td>
                  <Td>{currency(t.saldo_pendente)}</Td>
                  <Td>
                    {new Date(`${t.vencimento}T00:00:00`).toLocaleDateString("pt-BR")}
                    {vencido && <span className="text-danger"> (vencido)</span>}
                  </Td>
                  <Td>
                    <Badge variant={STATUS_TONE[t.status]}>
                      {t.status === "cancelado" ? `${STATUS_LABEL[t.status]} — ${t.motivo_cancelamento ?? ""}` : STATUS_LABEL[t.status]}
                    </Badge>
                  </Td>
                  {(canManage || canReceber) && (
                    <Td>
                      {(t.status === "aberto" || t.status === "parcial") && (
                        <AcoesTitulo id={t.id} status={t.status} canManage={canManage} canReceber={canReceber} />
                      )}
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

function GerarTitulosForm({ pedidos }: { pedidos: PedidoResumo[] }) {
  const [parcelas, setParcelas] = useState([{ key: 0 }]);
  // useRef, não uma variável local: uma variável local reinicia a cada
  // render, então dois cliques em "+ parcela" (cada um causando um
  // re-render entre eles) geravam a mesma key (1) repetida — React
  // reconciliava errado a partir da 3ª linha (achado do code-review).
  const nextKeyRef = useRef(1);

  return (
    <form action={gerarTitulosPedidoAction} className="flex flex-col gap-2 rounded-md bg-page-bg p-3">
      <div className="flex items-center gap-1.5">
        <Select name="pedido_id" required>
          <option value="">pedido liberado…</option>
          {pedidos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.numero}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={() => setParcelas((rows) => [...rows, { key: nextKeyRef.current++ }])}
        >
          + parcela
        </Button>
      </div>

      {parcelas.map((row, i) => (
        <div key={row.key} className="flex items-center gap-1.5">
          <Input name="parcela_valor" type="number" min="0" step="0.01" placeholder="valor" required className="w-24" />
          <Input name="parcela_vencimento" type="date" required />
          <Input name="parcela_condicao" placeholder="condição (opcional)" className="w-28" />
          {parcelas.length > 1 && (
            <Button
              type="button"
              variant="outlineDanger"
              onClick={() => setParcelas((rows) => rows.filter((_, idx) => idx !== i))}
            >
              remover
            </Button>
          )}
        </div>
      ))}

      <Button type="submit" variant="primary" className="w-fit">
        Gerar título(s)
      </Button>
    </form>
  );
}

function AcoesTitulo({ id, status, canManage, canReceber }: { id: string; status: "aberto" | "parcial"; canManage: boolean; canReceber: boolean }) {
  const [modo, setModo] = useState<"nenhum" | "receber" | "cancelar">("nenhum");

  if (modo === "receber") {
    return (
      <form action={registrarRecebimentoTituloAction} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={id} />
        <Input name="valor" type="number" min="0" step="0.01" placeholder="valor" required className="w-20" />
        <Input name="data_recebimento" type="date" />
        <Button type="submit" variant="primary">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  if (modo === "cancelar") {
    return (
      <form action={cancelarTituloFinanceiroAction} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={id} />
        <Input name="motivo" placeholder="motivo (opcional)" className="w-28" />
        <Button type="submit" variant="danger">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {canReceber && (
        <Button type="button" variant="primary" onClick={() => setModo("receber")}>
          Receber
        </Button>
      )}
      {canManage && status === "aberto" && (
        <Button type="button" variant="outlineDanger" onClick={() => setModo("cancelar")}>
          Cancelar
        </Button>
      )}
    </div>
  );
}
