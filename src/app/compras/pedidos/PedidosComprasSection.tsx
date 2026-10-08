"use client";

import { useState } from "react";
import {
  gerarPedidoCompraDeCotacaoAction,
  atualizarStatusPedidoCompraAction,
  vincularPedidoCompraContratoAction,
  programarEntregaPedidoCompraAction,
  gerarTitulosPedidoCompraAction,
  registrarPagamentoTituloCompraAction,
} from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Card";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { formatarData } from "@/lib/formato/data";

const STATUS_PC_LABEL: Record<string, string> = { emitido: "Emitido", confirmado: "Confirmado", cancelado: "Cancelado" };
const STATUS_PC_TONE: Record<string, "neutral" | "success" | "danger"> = { emitido: "neutral", confirmado: "success", cancelado: "danger" };
const STATUS_TITULO_LABEL: Record<string, string> = { aberto: "Aberto", parcial: "Parcial", pago: "Pago", cancelado: "Cancelado" };

type Cotacao = { id: string; numero: string };
type PedidoCompra = { id: string; numero: string; cotacao_id: string; pessoa_id: string; contrato_id: string | null; status: string; motivo_cancelamento: string | null };
type PedidoItem = { id: string; pedido_compra_id: string; item_id: string; quantidade: number; preco_unitario: number };
type Programacao = { id: string; pedido_compra_id: string; data_entrega: string; quantidade: number; status: string };
type Titulo = { id: string; pedido_compra_id: string; numero: string; valor: number; valor_pago: number; saldo_pendente: number; vencimento: string; status: string };
type Item = { id: string; codigo: string; descricao: string };
type Pessoa = { id: string; nome: string; nome_fantasia: string | null };
type Contrato = { id: string; numero: string; tipo: string; pessoa_id: string; status: string };

export default function PedidosComprasSection({
  cotacoesParaGerar,
  pedidosCompra,
  pedidoItens,
  programacoes,
  titulos,
  itens,
  pessoas,
  contratos,
  canManage,
}: {
  cotacoesParaGerar: Cotacao[];
  pedidosCompra: PedidoCompra[];
  pedidoItens: PedidoItem[];
  programacoes: Programacao[];
  titulos: Titulo[];
  itens: Item[];
  pessoas: Pessoa[];
  contratos: Contrato[];
  canManage: boolean;
}) {
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-7">
      <section>
        <h2 className="text-sm font-semibold text-text">Gerar pedido de compra</h2>
        {canManage && cotacoesParaGerar.length > 0 && (
          <form action={gerarPedidoCompraDeCotacaoAction} className="my-3 flex items-center gap-1.5">
            <Select name="cotacao_id" required>
              <option value="">cotação aprovada…</option>
              {cotacoesParaGerar.map((c) => (
                <option key={c.id} value={c.id}>{c.numero}</option>
              ))}
            </Select>
            <Button type="submit" variant="primary">Gerar pedido(s) de compra</Button>
          </form>
        )}
        {cotacoesParaGerar.length === 0 && <p className="mt-1 text-xs text-text-muted">Nenhuma cotação aprovada aguardando geração de PC.</p>}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text">Pedidos de compra</h2>
        <div className="mt-3 flex flex-col gap-3">
          {pedidosCompra.map((pc) => (
            <PedidoCompraCard
              key={pc.id}
              pc={pc}
              itensPc={pedidoItens.filter((pi) => pi.pedido_compra_id === pc.id)}
              programacoesPc={programacoes.filter((p) => p.pedido_compra_id === pc.id)}
              titulosPc={titulos.filter((t) => t.pedido_compra_id === pc.id)}
              itemPorId={itemPorId}
              pessoaNome={pessoaPorId.get(pc.pessoa_id)?.nome_fantasia || pessoaPorId.get(pc.pessoa_id)?.nome || pc.pessoa_id}
              contratosDoFornecedor={contratos.filter((c) => c.pessoa_id === pc.pessoa_id && c.status === "vigente")}
              canManage={canManage}
            />
          ))}
          {pedidosCompra.length === 0 && <p className="text-xs text-text-muted">Nenhum pedido de compra gerado ainda.</p>}
        </div>
      </section>
    </div>
  );
}

function PedidoCompraCard({
  pc,
  itensPc,
  programacoesPc,
  titulosPc,
  itemPorId,
  pessoaNome,
  contratosDoFornecedor,
  canManage,
}: {
  pc: PedidoCompra;
  itensPc: PedidoItem[];
  programacoesPc: Programacao[];
  titulosPc: Titulo[];
  itemPorId: Map<string, Item>;
  pessoaNome: string;
  contratosDoFornecedor: Contrato[];
  canManage: boolean;
}) {
  const [mostrarPrograma, setMostrarPrograma] = useState(false);
  const [mostrarTitulos, setMostrarTitulos] = useState(false);
  const valorTotal = itensPc.reduce((acc, i) => acc + Number(i.quantidade) * Number(i.preco_unitario), 0);
  const ativo = pc.status !== "cancelado";

  return (
    <Card padding="xs">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <strong className="text-sm text-text">{pc.numero}</strong>
        <StatusPill tone={STATUS_PC_TONE[pc.status]}>{STATUS_PC_LABEL[pc.status]}</StatusPill>
        <span className="text-text-muted">Fornecedor: {pessoaNome}</span>
        <span className="text-text-muted">Total: R$ {valorTotal.toFixed(2)}</span>
      </div>

      <DenseTable className="mt-1.5">
        <thead>
          <DenseTableHeaderRow>
            <Th>Item</Th>
            <Th>Qtd.</Th>
            <Th>Preço unit.</Th>
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {itensPc.map((it) => (
            <tr key={it.id}>
              <Td>{itemPorId.get(it.item_id)?.codigo ?? it.item_id}</Td>
              <Td>{it.quantidade}</Td>
              <Td>{it.preco_unitario}</Td>
            </tr>
          ))}
        </tbody>
      </DenseTable>

      {canManage && ativo && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {pc.status === "emitido" && (
            <form action={atualizarStatusPedidoCompraAction}>
              <input type="hidden" name="id" value={pc.id} />
              <input type="hidden" name="status" value="confirmado" />
              <Button type="submit" variant="primary" size="sm">Confirmar</Button>
            </form>
          )}
          <form action={atualizarStatusPedidoCompraAction}>
            <input type="hidden" name="id" value={pc.id} />
            <input type="hidden" name="status" value="cancelado" />
            <Button type="submit" variant="outlineDanger" size="sm">
              Cancelar
            </Button>
          </form>

          {!pc.contrato_id && contratosDoFornecedor.length > 0 && (
            <form action={vincularPedidoCompraContratoAction} className="flex items-center gap-1">
              <input type="hidden" name="pedido_compra_id" value={pc.id} />
              <Select name="contrato_id" required>
                <option value="">vincular contrato…</option>
                {contratosDoFornecedor.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero}</option>
                ))}
              </Select>
              <Button type="submit" variant="secondary" size="sm">Vincular</Button>
            </form>
          )}

          <Button type="button" variant="secondary" size="sm" onClick={() => setMostrarPrograma((v) => !v)}>
            Programar entrega
          </Button>
          {titulosPc.length === 0 && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setMostrarTitulos((v) => !v)}>
              Gerar título a pagar
            </Button>
          )}
        </div>
      )}

      {mostrarPrograma && (
        <form action={programarEntregaPedidoCompraAction} onSubmit={() => setMostrarPrograma(false)} className="mt-1.5 flex items-center gap-1.5">
          <input type="hidden" name="pedido_compra_id" value={pc.id} />
          <Input name="data_entrega" type="date" required />
          <Input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required className="w-24" />
          <Button type="submit" variant="primary" size="sm">Salvar</Button>
        </form>
      )}

      {mostrarTitulos && (
        <form action={gerarTitulosPedidoCompraAction} onSubmit={() => setMostrarTitulos(false)} className="mt-1.5 flex items-center gap-1.5">
          <input type="hidden" name="pedido_compra_id" value={pc.id} />
          <input type="hidden" name="valor_total" value={valorTotal} />
          <span className="text-xs text-text-muted">Parcela única de R$ {valorTotal.toFixed(2)}, vencimento:</span>
          <Input name="vencimento" type="date" required />
          <Input name="condicao_pagamento" placeholder="condição (opcional)" className="w-32" />
          <Button type="submit" variant="primary" size="sm">Gerar título</Button>
        </form>
      )}

      {programacoesPc.length > 0 && (
        <div className="mt-1.5">
          <p className="mb-0.5 text-xs font-semibold text-text">Entregas programadas:</p>
          {programacoesPc.map((p) => (
            <span key={p.id} className="mr-2.5 text-xs text-text-muted">
              {formatarData(p.data_entrega)}: {p.quantidade}
            </span>
          ))}
        </div>
      )}

      {titulosPc.length > 0 && (
        <div className="mt-1.5">
          <p className="mb-0.5 text-xs font-semibold text-text">Títulos a pagar:</p>
          {titulosPc.map((t) => (
            <TituloRow key={t.id} titulo={t} canManage={canManage} />
          ))}
        </div>
      )}
    </Card>
  );
}

function TituloRow({ titulo, canManage }: { titulo: Titulo; canManage: boolean }) {
  const [pagando, setPagando] = useState(false);

  return (
    <div className="mb-1 flex items-center gap-2 text-xs">
      <span className="text-text-muted">
        {titulo.numero}: R$ {Number(titulo.valor).toFixed(2)} (pago R$ {Number(titulo.valor_pago).toFixed(2)}, saldo R$ {Number(titulo.saldo_pendente).toFixed(2)}) —
        vence {formatarData(titulo.vencimento)} — {STATUS_TITULO_LABEL[titulo.status]}
      </span>
      {canManage && ["aberto", "parcial"].includes(titulo.status) && (
        !pagando ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setPagando(true)}>Registrar pagamento</Button>
        ) : (
          <form action={registrarPagamentoTituloCompraAction} onSubmit={() => setPagando(false)} className="flex items-center gap-1">
            <input type="hidden" name="titulo_id" value={titulo.id} />
            <Input name="valor" type="number" min="0.01" step="0.01" placeholder="valor" required className="w-20" />
            <Input name="data_pagamento" type="date" />
            <Button type="submit" variant="primary" size="sm">Confirmar</Button>
          </form>
        )
      )}
    </div>
  );
}
