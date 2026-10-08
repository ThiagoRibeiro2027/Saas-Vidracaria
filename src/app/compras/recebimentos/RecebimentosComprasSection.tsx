"use client";

import { useState } from "react";
import {
  registrarRecebimentoPedidoCompraAction,
  registrarLoteRecebimentoAction,
  registrarDivergenciaRecebimentoAction,
  tratarDivergenciaAction,
  finalizarConferenciaRecebimentoAction,
  registrarDevolucaoCompraAction,
} from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Card";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { formatarData } from "@/lib/formato/data";

const STATUS_RECEBIMENTO_LABEL: Record<string, string> = { em_conferencia: "Em conferência", conferido: "Conferido", cancelado: "Cancelado" };
const STATUS_RECEBIMENTO_TONE: Record<string, "warning" | "success" | "danger"> = { em_conferencia: "warning", conferido: "success", cancelado: "danger" };
const STATUS_ITEM_LABEL: Record<string, string> = { pendente: "Pendente", quarentena: "Quarentena", conferido: "Conferido" };
const STATUS_ITEM_TONE: Record<string, "neutral" | "warning" | "success"> = { pendente: "neutral", quarentena: "warning", conferido: "success" };
const TIPO_DIVERGENCIA_LABEL: Record<string, string> = {
  quantidade_menor: "Quantidade a menor",
  quantidade_maior: "Quantidade a maior",
  avaria: "Avaria",
  qualidade: "Qualidade",
  documentacao: "Documentação",
  atraso: "Atraso",
  outra: "Outra",
};

type PedidoCompra = { id: string; numero: string; pessoa_id: string; status: string };
type PedidoItem = { id: string; pedido_compra_id: string; item_id: string; quantidade: number };
type Recebimento = { id: string; pedido_compra_id: string; numero: string; numero_nf: string | null; transportadora: string | null; status: string; data_recebimento: string };
type RecebimentoItem = { id: string; recebimento_id: string; pedido_compra_item_id: string; item_id: string; quantidade_recebida: number; quantidade_aceita: number | null; status: string };
type Lote = { id: string; recebimento_item_id: string; numero_lote: string; quantidade: number; data_fabricacao: string | null; data_validade: string | null; certificado: string | null };
type Divergencia = { id: string; recebimento_item_id: string; tipo: string; quantidade_divergente: number | null; descricao: string; status: string; decisao: string | null };
type Devolucao = { id: string; recebimento_item_id: string; quantidade: number; motivo: string; status: string };
type Item = { id: string; codigo: string; descricao: string };
type Pessoa = { id: string; nome: string; nome_fantasia: string | null };

export default function RecebimentosComprasSection({
  pedidosCompra,
  pedidoItens,
  recebimentos,
  recebimentoItens,
  lotes,
  divergencias,
  devolucoes,
  itens,
  pessoas,
  canManage,
}: {
  pedidosCompra: PedidoCompra[];
  pedidoItens: PedidoItem[];
  recebimentos: Recebimento[];
  recebimentoItens: RecebimentoItem[];
  lotes: Lote[];
  divergencias: Divergencia[];
  devolucoes: Devolucao[];
  itens: Item[];
  pessoas: Pessoa[];
  canManage: boolean;
}) {
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));
  const jaRecebidoPorPedidoItem = new Map<string, number>();
  for (const ri of recebimentoItens) {
    jaRecebidoPorPedidoItem.set(
      ri.pedido_compra_item_id,
      (jaRecebidoPorPedidoItem.get(ri.pedido_compra_item_id) ?? 0) + Number(ri.quantidade_recebida),
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {canManage && (
        <NovoRecebimentoForm
          pedidosCompra={pedidosCompra}
          pedidoItens={pedidoItens}
          itemPorId={itemPorId}
          pessoaPorId={pessoaPorId}
          jaRecebidoPorPedidoItem={jaRecebidoPorPedidoItem}
        />
      )}

      <section>
        <h2 className="text-sm font-semibold text-text">Recebimentos registrados</h2>
        <div className="mt-3 flex flex-col gap-3">
          {recebimentos.map((r) => (
            <RecebimentoCard
              key={r.id}
              recebimento={r}
              pedidoCompra={pedidosCompra.find((pc) => pc.id === r.pedido_compra_id)}
              itensDoRecebimento={recebimentoItens.filter((ri) => ri.recebimento_id === r.id)}
              lotes={lotes}
              divergencias={divergencias}
              devolucoes={devolucoes}
              itemPorId={itemPorId}
              canManage={canManage}
            />
          ))}
          {recebimentos.length === 0 && <p className="text-xs text-text-muted">Nenhum recebimento registrado ainda.</p>}
        </div>
      </section>
    </div>
  );
}

function NovoRecebimentoForm({
  pedidosCompra,
  pedidoItens,
  itemPorId,
  pessoaPorId,
  jaRecebidoPorPedidoItem,
}: {
  pedidosCompra: PedidoCompra[];
  pedidoItens: PedidoItem[];
  itemPorId: Map<string, Item>;
  pessoaPorId: Map<string, Pessoa>;
  jaRecebidoPorPedidoItem: Map<string, number>;
}) {
  const [pedidoCompraId, setPedidoCompraId] = useState("");
  const itensDoPedido = pedidoItens.filter((pi) => pi.pedido_compra_id === pedidoCompraId);

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Registrar recebimento</h2>
      <form action={registrarRecebimentoPedidoCompraAction} className="mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Select name="pedido_compra_id" required value={pedidoCompraId} onChange={(e) => setPedidoCompraId(e.target.value)}>
            <option value="">pedido de compra…</option>
            {pedidosCompra.map((pc) => (
              <option key={pc.id} value={pc.id}>
                {pc.numero} — {pessoaPorId.get(pc.pessoa_id)?.nome_fantasia || pessoaPorId.get(pc.pessoa_id)?.nome || pc.pessoa_id}
              </option>
            ))}
          </Select>
          <Input name="numero_nf" placeholder="número da NF (opcional)" />
          <Input name="transportadora" placeholder="transportadora (opcional)" />
        </div>

        {itensDoPedido.length > 0 && (
          <DenseTable>
            <thead>
              <DenseTableHeaderRow>
                <Th>Item</Th>
                <Th>Total do pedido</Th>
                <Th>Já recebido</Th>
                <Th>Recebendo agora</Th>
              </DenseTableHeaderRow>
            </thead>
            <tbody>
              {itensDoPedido.map((pi) => {
                const jaRecebido = jaRecebidoPorPedidoItem.get(pi.id) ?? 0;
                const restante = Number(pi.quantidade) - jaRecebido;
                return (
                  <tr key={pi.id}>
                    <Td>{itemPorId.get(pi.item_id)?.codigo ?? pi.item_id}</Td>
                    <Td>{pi.quantidade}</Td>
                    <Td>{jaRecebido}</Td>
                    <Td>
                      <Input
                        name={`qtd_${pi.id}`}
                        type="number"
                        min="0"
                        max={restante > 0 ? restante : 0}
                        step="0.0001"
                        placeholder="0"
                        disabled={restante <= 0}
                        className="w-24"
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DenseTable>
        )}

        <textarea
          name="observacoes"
          placeholder="observações (opcional)"
          className="min-h-[40px] rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />

        {itensDoPedido.length > 0 && (
          <Button type="submit" variant="primary" className="self-start">
            Registrar recebimento
          </Button>
        )}
        {pedidoCompraId && itensDoPedido.length === 0 && <p className="text-xs text-text-muted">Este pedido de compra não tem itens.</p>}
      </form>
    </section>
  );
}

function RecebimentoCard({
  recebimento,
  pedidoCompra,
  itensDoRecebimento,
  lotes,
  divergencias,
  devolucoes,
  itemPorId,
  canManage,
}: {
  recebimento: Recebimento;
  pedidoCompra: PedidoCompra | undefined;
  itensDoRecebimento: RecebimentoItem[];
  lotes: Lote[];
  divergencias: Divergencia[];
  devolucoes: Devolucao[];
  itemPorId: Map<string, Item>;
  canManage: boolean;
}) {
  const temDivergenciaAberta = itensDoRecebimento.some((ri) =>
    divergencias.some((d) => d.recebimento_item_id === ri.id && d.status === "aberta"),
  );

  return (
    <Card padding="xs">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <strong className="text-sm text-text">{recebimento.numero}</strong>
        <StatusPill tone={STATUS_RECEBIMENTO_TONE[recebimento.status]}>{STATUS_RECEBIMENTO_LABEL[recebimento.status]}</StatusPill>
        <span className="text-text-muted">PC: {pedidoCompra?.numero ?? recebimento.pedido_compra_id}</span>
        {recebimento.numero_nf && <span className="text-text-muted">NF: {recebimento.numero_nf}</span>}
        {recebimento.transportadora && <span className="text-text-muted">Transp.: {recebimento.transportadora}</span>}
        <span className="text-text-muted">{formatarData(recebimento.data_recebimento)}</span>
      </div>

      <div className="mt-2 flex flex-col gap-2.5">
        {itensDoRecebimento.map((ri) => (
          <RecebimentoItemRow
            key={ri.id}
            item={ri}
            itemNome={itemPorId.get(ri.item_id)?.codigo ?? ri.item_id}
            lotes={lotes.filter((l) => l.recebimento_item_id === ri.id)}
            divergencias={divergencias.filter((d) => d.recebimento_item_id === ri.id)}
            devolucoes={devolucoes.filter((d) => d.recebimento_item_id === ri.id)}
            canManage={canManage}
          />
        ))}
      </div>

      {canManage && recebimento.status === "em_conferencia" && (
        <form action={finalizarConferenciaRecebimentoAction} className="mt-2">
          <input type="hidden" name="id" value={recebimento.id} />
          <Button
            type="submit"
            variant="primary"
            disabled={temDivergenciaAberta}
            title={temDivergenciaAberta ? "Trate todas as divergências abertas antes de finalizar" : undefined}
          >
            Finalizar conferência {temDivergenciaAberta ? "(bloqueado — divergência aberta)" : ""}
          </Button>
        </form>
      )}
    </Card>
  );
}

function RecebimentoItemRow({
  item,
  itemNome,
  lotes,
  divergencias,
  devolucoes,
  canManage,
}: {
  item: RecebimentoItem;
  itemNome: string;
  lotes: Lote[];
  divergencias: Divergencia[];
  devolucoes: Devolucao[];
  canManage: boolean;
}) {
  const [mostrarLote, setMostrarLote] = useState(false);
  const [mostrarDivergencia, setMostrarDivergencia] = useState(false);
  const [mostrarDevolucao, setMostrarDevolucao] = useState(false);
  const jaDevolvido = devolucoes.filter((d) => d.status === "registrada").reduce((acc, d) => acc + Number(d.quantidade), 0);
  const podeDevolver = item.status === "conferido" && item.quantidade_aceita !== null && Number(item.quantidade_aceita) - jaDevolvido > 0;

  return (
    <div className="border-t border-dashed border-border-subtle pt-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <strong className="text-text">{itemNome}</strong>
        <StatusPill tone={STATUS_ITEM_TONE[item.status]}>{STATUS_ITEM_LABEL[item.status]}</StatusPill>
        <span className="text-text-muted">Recebido: {item.quantidade_recebida}</span>
        {item.quantidade_aceita !== null && <span className="text-text-muted">Aceito: {item.quantidade_aceita}</span>}

        {canManage && item.status !== "conferido" && (
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setMostrarLote((v) => !v)}>
              Registrar lote
            </Button>
            <Button type="button" variant="outlineDanger" size="sm" onClick={() => setMostrarDivergencia((v) => !v)}>
              Registrar divergência
            </Button>
          </>
        )}
        {canManage && podeDevolver && (
          <Button type="button" variant="outlineDanger" size="sm" onClick={() => setMostrarDevolucao((v) => !v)}>
            Registrar devolução
          </Button>
        )}
      </div>

      {mostrarLote && (
        <form action={registrarLoteRecebimentoAction} onSubmit={() => setMostrarLote(false)} className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="recebimento_item_id" value={item.id} />
          <Input name="numero_lote" placeholder="número do lote" required />
          <Input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required className="w-24" />
          <label className="flex items-center gap-1 text-xs text-text-muted">Fabricação <Input name="data_fabricacao" type="date" /></label>
          <label className="flex items-center gap-1 text-xs text-text-muted">Validade <Input name="data_validade" type="date" /></label>
          <Input name="certificado" placeholder="certificado (opcional)" />
          <Button type="submit" variant="primary" size="sm">Salvar</Button>
        </form>
      )}

      {mostrarDivergencia && (
        <form action={registrarDivergenciaRecebimentoAction} onSubmit={() => setMostrarDivergencia(false)} className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="recebimento_item_id" value={item.id} />
          <Select name="tipo" required>
            <option value="">tipo…</option>
            {Object.entries(TIPO_DIVERGENCIA_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <Input name="quantidade_divergente" type="number" min="0" step="0.0001" placeholder="quantidade divergente (opcional)" className="w-48" />
          <Input name="descricao" placeholder="descrição" required className="min-w-40 flex-1" />
          <Button type="submit" variant="danger" size="sm">Registrar</Button>
        </form>
      )}

      {mostrarDevolucao && (
        <form action={registrarDevolucaoCompraAction} onSubmit={() => setMostrarDevolucao(false)} className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="recebimento_item_id" value={item.id} />
          <Input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required className="w-24" />
          <Input name="motivo" placeholder="motivo" required className="min-w-40 flex-1" />
          <Button type="submit" variant="danger" size="sm">Registrar devolução</Button>
        </form>
      )}

      {lotes.length > 0 && (
        <p className="mt-1.5 text-xs text-text-muted">
          Lotes: {lotes.map((l) => `${l.numero_lote} (${l.quantidade})`).join(", ")}
        </p>
      )}

      {divergencias.length > 0 && (
        <div className="mt-1.5">
          {divergencias.map((d) => (
            <DivergenciaRow key={d.id} divergencia={d} canManage={canManage} />
          ))}
        </div>
      )}

      {devolucoes.filter((d) => d.status === "registrada").length > 0 && (
        <p className="mt-1.5 text-xs text-text-muted">
          Devolvido: {devolucoes.filter((d) => d.status === "registrada").reduce((acc, d) => acc + Number(d.quantidade), 0)}
        </p>
      )}
    </div>
  );
}

function DivergenciaRow({ divergencia, canManage }: { divergencia: Divergencia; canManage: boolean }) {
  const [tratando, setTratando] = useState(false);

  return (
    <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-text-muted">
        {TIPO_DIVERGENCIA_LABEL[divergencia.tipo] ?? divergencia.tipo}: {divergencia.descricao}
        {divergencia.quantidade_divergente !== null && ` (qtd. ${divergencia.quantidade_divergente})`}
        {" — "}
        {divergencia.status === "aberta" ? "Aberta" : `Tratada: ${divergencia.decisao}`}
      </span>
      {canManage && divergencia.status === "aberta" && (
        !tratando ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setTratando(true)}>Tratar</Button>
        ) : (
          <form action={tratarDivergenciaAction} onSubmit={() => setTratando(false)} className="flex items-center gap-1">
            <input type="hidden" name="id" value={divergencia.id} />
            <Select name="decisao" required>
              <option value="">decisão…</option>
              <option value="aceitar">Aceitar</option>
              <option value="recusar">Recusar</option>
            </Select>
            <Input name="observacao" placeholder="observação (opcional)" />
            <Button type="submit" variant="primary" size="sm">Confirmar</Button>
          </form>
        )
      )}
    </div>
  );
}
