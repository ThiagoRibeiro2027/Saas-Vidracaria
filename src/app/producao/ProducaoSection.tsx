"use client";

import { useActionState } from "react";
import {
  liberarEngenhariaAction,
  criarOrdemProducaoAction,
  liberarLoteProducaoAction,
  apontarProducaoAction,
  concluirOrdemProducaoAction,
  cancelarOrdemProducaoAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string; tipo: string };
type Pedido = { id: string; numero: string; pessoa_id: string; obra_id: string | null };
type PedidoItem = { id: string; pedido_id: string; item_id: string; quantidade: number };
type OrdemProducao = {
  id: string;
  pedido_item_id: string;
  numero: string;
  quantidade_planejada: number;
  quantidade_produzida: number;
  quantidade_perdida: number;
  status: "planejada" | "em_producao" | "concluida" | "cancelada";
  situacao: "liberada" | "liberada_com_restricao" | "bloqueada";
  motivo_bloqueio: string | null;
  origem_bloqueio: string | null;
  categoria_bloqueio: string | null;
  impacto_bloqueio: string | null;
  acao_necessaria: string | null;
};
export type ToleranciaPerdaRow = {
  quantidade_planejada: number;
  quantidade_perdida: number;
  percentual_tolerancia: number | null;
  perda_tolerada: number | null;
  excedida: boolean | null;
};
export type RastreioOrdemProducao = {
  pedido?: { numero: string; pessoa_nome: string; obra_nome: string | null; previsao_entrega: string | null };
  item?: { codigo: string; descricao: string };
  lotes?: {
    numero: number;
    status: string;
    operacoes: {
      sequencia: number;
      descricao: string;
      status: string;
      recurso: { codigo: string; nome: string } | null;
      apontamentos: { quantidade_produzida: number; quantidade_perdida: number; quantidade_retrabalho: number; registrado_em: string }[];
    }[];
  }[];
  qualidade?: {
    inspecoes: { resultado: string; quantidade_aprovada: number; quantidade_reprovada: number; inspecionado_em: string }[];
    nao_conformidades: { status: string; quantidade: number; disposicao: string }[];
  };
};
export type HistoricoEvento = { id: string; action: string; description: string | null; criado_por_nome: string | null; criado_em: string };
type EngenhariaVersao = {
  id: string;
  pedido_item_id: string;
  versao: number;
  liberado_em: string;
  observacoes: string | null;
};
type OpLote = {
  id: string;
  ordem_producao_id: string;
  numero: number;
  quantidade_planejada: number;
  quantidade_produzida: number;
  quantidade_rejeitada: number;
  saldo: number;
  status: "liberado" | "em_andamento" | "concluido";
};
type OpOperacao = {
  id: string;
  ordem_producao_id: string;
  op_lote_id: string;
  sequencia: number;
  descricao: string;
  quantidade_planejada: number;
  quantidade_produzida: number;
  quantidade_rejeitada: number;
  quantidade_retrabalho: number;
  saldo: number;
  status: "planejada" | "em_andamento" | "concluida";
};
export type ListaCorteRow = {
  item_codigo: string;
  item_descricao: string;
  ambiente: string | null;
  largura_mm: number | null;
  altura_mm: number | null;
  quantidade: number;
  margem_quebra_percentual: number | null;
  responsavel: string | null;
  emitido_em: string;
};

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function OperacaoRow({ operacao: o, podeMexer }: { operacao: OpOperacao; podeMexer: boolean }) {
  const [state, formAction] = useActionState(apontarProducaoAction, undefined);

  return (
    <tr>
      <Td>
        {o.sequencia}. {o.descricao}
      </Td>
      <Td>
        <Badge variant={OPERACAO_STATUS_TONE[o.status]}>{OPERACAO_STATUS_LABEL[o.status]}</Badge>
      </Td>
      <Td>
        {num(o.quantidade_produzida)} / {num(o.quantidade_planejada)}
      </Td>
      <Td>{num(o.quantidade_rejeitada)}</Td>
      <Td>{num(o.quantidade_retrabalho)}</Td>
      <Td>{num(o.saldo)}</Td>
      {podeMexer && (
        <Td>
          {o.status !== "concluida" && (
            <>
              <form action={formAction} className="flex flex-wrap items-center gap-1">
                <input type="hidden" name="op_lote_operacao_id" value={o.id} />
                <Input
                  name="quantidade_produzida"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="produzida"
                  className="w-16 text-xs"
                />
                <Input
                  name="quantidade_rejeitada"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="rejeitada"
                  className="w-16 text-xs"
                />
                <Input
                  name="quantidade_retrabalho"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="retrabalho"
                  className="w-16 text-xs"
                />
                <Input name="observacao" placeholder="obs. (opcional)" className="w-24 text-xs" />
                <Button type="submit" variant="primary" size="sm">
                  Apontar
                </Button>
              </form>
              {state?.error && <p className="mt-0.5 text-xs text-danger">{state.error}</p>}
            </>
          )}
        </Td>
      )}
    </tr>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger";

const STATUS_LABEL: Record<OrdemProducao["status"], string> = {
  planejada: "Planejada",
  em_producao: "Em produção",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const STATUS_TONE: Record<OrdemProducao["status"], Tone> = {
  planejada: "neutral",
  em_producao: "success",
  concluida: "success",
  cancelada: "danger",
};

const SITUACAO_LABEL: Record<OrdemProducao["situacao"], string> = {
  liberada: "Liberada",
  liberada_com_restricao: "Liberada com restrição",
  bloqueada: "Bloqueada",
};

const SITUACAO_TONE: Record<OrdemProducao["situacao"], Tone> = {
  liberada: "success",
  liberada_com_restricao: "warning",
  bloqueada: "danger",
};

const CATEGORIA_BLOQUEIO_LABEL: Record<string, string> = {
  material: "Material",
  vidro: "Vidro",
  engenharia: "Engenharia",
  maquina: "Máquina",
  operador: "Operador",
  ferramenta: "Ferramenta",
  qualidade: "Qualidade",
  manutencao: "Manutenção",
  fornecedor: "Fornecedor",
  prioridade: "Prioridade",
  cliente: "Cliente",
  outro: "Outro",
};

const LOTE_STATUS_LABEL: Record<OpLote["status"], string> = {
  liberado: "Liberado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

const LOTE_STATUS_TONE: Record<OpLote["status"], Tone> = {
  liberado: "neutral",
  em_andamento: "warning",
  concluido: "success",
};

const OPERACAO_STATUS_LABEL: Record<OpOperacao["status"], string> = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

const OPERACAO_STATUS_TONE: Record<OpOperacao["status"], Tone> = {
  planejada: "neutral",
  em_andamento: "warning",
  concluida: "success",
};

export default function ProducaoSection({
  pedidos,
  pedidoItensPorPedido,
  itens,
  pessoas,
  obras,
  ordensPorPedidoItem,
  engenhariaVigentePorPedidoItem,
  bloqueioPorPedido,
  listaCortePorOrdem,
  rastreioPorOrdem,
  historicoPorOrdem,
  opLotesPorOrdem,
  opOperacoesPorLote,
  statusLabels,
  situacaoLabels,
  toleranciaPorOrdem,
  canManage,
}: {
  pedidos: Pedido[];
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  itens: Item[];
  pessoas: Pessoa[];
  obras: Obra[];
  ordensPorPedidoItem: Map<string, OrdemProducao[]>;
  engenhariaVigentePorPedidoItem: Map<string, EngenhariaVersao>;
  bloqueioPorPedido: Map<string, boolean>;
  listaCortePorOrdem: Map<string, ListaCorteRow[]>;
  rastreioPorOrdem: Map<string, RastreioOrdemProducao>;
  historicoPorOrdem: Map<string, HistoricoEvento[]>;
  opLotesPorOrdem: Map<string, OpLote[]>;
  opOperacoesPorLote: Map<string, OpOperacao[]>;
  // TÓPICO 4 §41 (Fase 7c) — rótulo customizável por empresa, com o texto
  // fixo de STATUS_LABEL/SITUACAO_LABEL como default de quem não configurou.
  statusLabels?: Map<string, string>;
  situacaoLabels?: Map<string, string>;
  // TÓPICO 4 §30/§51 (Fase 7f) — tolerância de perda configurada × real.
  toleranciaPorOrdem?: Map<string, ToleranciaPerdaRow>;
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
      <h2 className="text-sm font-semibold text-text">Pedidos liberados — itens e ordens de produção</h2>
      <p className="mt-1 text-xs text-text-muted">
        Um item pode ter mais de uma OP (produção parcial) — a soma das quantidades planejadas nunca
        ultrapassa a quantidade do item, mas pode ficar menor enquanto houver saldo ainda não
        planejado.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {pedidos.map((ped) => {
          const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];
          const bloqueado = bloqueioPorPedido.get(ped.id) ?? false;
          const itensComOP = itensDoPedido.filter((pi) => (ordensPorPedidoItem.get(pi.id) ?? []).length > 0);

          return (
            <Card key={ped.id} padding="xs">
              <div className="flex flex-wrap items-baseline gap-2.5 text-xs">
                <strong className="text-sm text-text">{ped.numero}</strong>
                <span>{pessoaNome(ped.pessoa_id)}</span>
                <span className="text-text-muted">{obraNome(ped.obra_id)}</span>
                {bloqueado && (
                  <span className="text-warning">
                    Há item com medida em obra não confirmada (TÓPICO 16 §7) — novas OPs deste pedido
                    nascem bloqueadas até a medida ser confirmada.
                  </span>
                )}
              </div>

              <div className="mt-2">
                <DenseTable>
                  <thead>
                    <DenseTableHeaderRow>
                      <Th>Item</Th>
                      <Th>Qtd. pedido</Th>
                      <Th>Engenharia</Th>
                      <Th>Saldo p/ planejar</Th>
                      <Th>Ordens de produção</Th>
                    </DenseTableHeaderRow>
                  </thead>
                  <tbody>
                    {itensDoPedido.map((pi) => {
                      const ops = ordensPorPedidoItem.get(pi.id) ?? [];
                      const planejado = ops
                        .filter((op) => op.status !== "cancelada")
                        .reduce((acc, op) => acc + Number(op.quantidade_planejada), 0);
                      const saldo = Number(pi.quantidade) - planejado;
                      const engenharia = engenhariaVigentePorPedidoItem.get(pi.id);

                      return (
                        <tr key={pi.id} className="align-top">
                          <Td>{itemLabel(pi.item_id)}</Td>
                          <Td>{num(pi.quantidade)}</Td>
                          <Td>
                            {engenharia ? (
                              <div className="text-primary">
                                v{engenharia.versao} — {new Date(engenharia.liberado_em).toLocaleDateString("pt-BR")}
                              </div>
                            ) : (
                              <span className="text-text-muted">Não liberada</span>
                            )}
                            {canManage && (
                              <form action={liberarEngenhariaAction} className="mt-1">
                                <input type="hidden" name="pedido_item_id" value={pi.id} />
                                <Button type="submit" variant="primary" size="sm">
                                  {engenharia ? "Liberar nova versão" : "Liberar engenharia"}
                                </Button>
                              </form>
                            )}
                          </Td>
                          <Td>
                            {num(Math.max(saldo, 0))}
                            {canManage && saldo > 0 && (
                              <form
                                action={criarOrdemProducaoAction}
                                className="mt-1 flex flex-wrap items-center gap-1"
                              >
                                <input type="hidden" name="pedido_item_id" value={pi.id} />
                                <Input
                                  name="quantidade"
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  max={saldo}
                                  placeholder={`até ${num(saldo)}`}
                                  className="w-20 text-xs"
                                />
                                <label className="m-0 flex items-center gap-1 text-xs text-text-muted">
                                  <input type="checkbox" name="liberar_integralmente" defaultChecked className="accent-primary" />
                                  liberar integralmente
                                </label>
                                <Button type="submit" variant="primary" size="sm">
                                  Criar OP
                                </Button>
                              </form>
                            )}
                          </Td>
                          <Td>
                            <div className="flex flex-col gap-2">
                              {ops.map((op) => (
                                <div key={op.id} className="rounded border border-border-subtle p-1.5">
                                  <div className="flex flex-wrap items-baseline gap-2">
                                    <strong>{op.numero}</strong>
                                    <Badge variant={STATUS_TONE[op.status]}>{statusLabels?.get(op.status) ?? STATUS_LABEL[op.status]}</Badge>
                                    <Badge variant={SITUACAO_TONE[op.situacao]}>
                                      {situacaoLabels?.get(op.situacao) ?? SITUACAO_LABEL[op.situacao]}
                                    </Badge>
                                    <span>
                                      produzida {num(op.quantidade_produzida)} / {num(op.quantidade_planejada)}
                                    </span>
                                    <span>perdida {num(op.quantidade_perdida)}</span>
                                    {(() => {
                                      const tolerancia = toleranciaPorOrdem?.get(op.id);
                                      if (!tolerancia || tolerancia.excedida === null) return null;
                                      return (
                                        <span className={`font-mono ${tolerancia.excedida ? "text-danger" : "text-text-muted"}`}>
                                          {tolerancia.excedida ? "⚠ perda acima da tolerância" : "dentro da tolerância"}{" "}
                                          (tolerado {num(tolerancia.perda_tolerada ?? 0)}, {tolerancia.percentual_tolerancia}%)
                                        </span>
                                      );
                                    })()}
                                  </div>
                                  {op.situacao === "bloqueada" && (
                                    <p className="mt-1 text-xs text-danger">
                                      [{CATEGORIA_BLOQUEIO_LABEL[op.categoria_bloqueio ?? "outro"] ?? op.categoria_bloqueio}]{" "}
                                      {op.motivo_bloqueio} {op.impacto_bloqueio} Ação necessária: {op.acao_necessaria}
                                    </p>
                                  )}
                                  <details className="mt-1">
                                    <summary className="cursor-pointer text-xs text-primary">
                                      Rastreabilidade e histórico (TÓPICO 4 §46-47)
                                    </summary>
                                    {(() => {
                                      const rastreio = rastreioPorOrdem.get(op.id);
                                      const historico = historicoPorOrdem.get(op.id) ?? [];
                                      return (
                                        <div className="mt-1 text-xs">
                                          {rastreio?.pedido && rastreio?.item && (
                                            <p className="text-text-muted">
                                              {rastreio.pedido.numero} — {rastreio.pedido.pessoa_nome}
                                              {rastreio.pedido.obra_nome ? ` (${rastreio.pedido.obra_nome})` : ""} — {rastreio.item.codigo} —{" "}
                                              {rastreio.item.descricao}
                                            </p>
                                          )}
                                          {(rastreio?.lotes ?? []).map((lote) => (
                                            <div key={lote.numero} className="mb-1">
                                              <strong>Lote {lote.numero}</strong> ({lote.status})
                                              {lote.operacoes.map((o) => (
                                                <div key={o.sequencia} className="ml-2 text-text">
                                                  {o.sequencia}. {o.descricao} ({o.status}) — recurso: {o.recurso ? `${o.recurso.codigo} — ${o.recurso.nome}` : "—"}
                                                  {o.apontamentos.map((a, idx) => (
                                                    <div key={idx} className="ml-2 text-text-muted">
                                                      {new Date(a.registrado_em).toLocaleString("pt-BR")} — produzido {num(a.quantidade_produzida)}, perdido{" "}
                                                      {num(a.quantidade_perdida)}, retrabalho {num(a.quantidade_retrabalho)}
                                                    </div>
                                                  ))}
                                                </div>
                                              ))}
                                            </div>
                                          ))}
                                          {rastreio?.qualidade && (rastreio.qualidade.inspecoes.length > 0 || rastreio.qualidade.nao_conformidades.length > 0) && (
                                            <p className="text-text-muted">
                                              Qualidade: {rastreio.qualidade.inspecoes.length} inspeção(ões), {rastreio.qualidade.nao_conformidades.length} não
                                              conformidade(s).
                                            </p>
                                          )}
                                          <strong>Histórico</strong>
                                          <ul className="mt-0.5 list-disc pl-4">
                                            {historico.map((h) => (
                                              <li key={h.id} className="text-text">
                                                {new Date(h.criado_em).toLocaleString("pt-BR")} — {h.action}
                                                {h.description ? ` (${h.description})` : ""} — {h.criado_por_nome ?? "—"}
                                              </li>
                                            ))}
                                            {historico.length === 0 && <li className="text-text-muted">Sem eventos registrados.</li>}
                                          </ul>
                                        </div>
                                      );
                                    })()}
                                  </details>
                                  {(() => {
                                    const lotes = (opLotesPorOrdem.get(op.id) ?? []).slice().sort((a, b) => a.numero - b.numero);
                                    const podeMexer = canManage && (op.status === "planejada" || op.status === "em_producao");
                                    const jaLiberado = lotes.reduce((acc, l) => acc + Number(l.quantidade_planejada), 0);
                                    const saldoNaoLiberado = Number(op.quantidade_planejada) - jaLiberado;
                                    const todasOperacoes = lotes.flatMap((l) => opOperacoesPorLote.get(l.id) ?? []);
                                    const todasConcluidas = todasOperacoes.length > 0 && todasOperacoes.every((o) => o.status === "concluida");
                                    return (
                                      <>
                                        {lotes.map((lote) => {
                                          const operacoes = (opOperacoesPorLote.get(lote.id) ?? [])
                                            .slice()
                                            .sort((a, b) => a.sequencia - b.sequencia);
                                          return (
                                            <div key={lote.id} className="mt-1.5">
                                              <div className="flex items-baseline gap-1.5 text-xs">
                                                <strong>Lote {lote.numero}</strong>
                                                <Badge variant={LOTE_STATUS_TONE[lote.status]}>{LOTE_STATUS_LABEL[lote.status]}</Badge>
                                                <span>
                                                  {num(lote.quantidade_produzida)} / {num(lote.quantidade_planejada)}
                                                </span>
                                              </div>
                                              <div className="mt-0.5 overflow-x-auto">
                                                <Table>
                                                  <thead>
                                                    <tr>
                                                      <Th>Operação</Th>
                                                      <Th>Status</Th>
                                                      <Th>Produzido</Th>
                                                      <Th>Rejeitado</Th>
                                                      <Th>Retrabalho</Th>
                                                      <Th>Saldo</Th>
                                                      {podeMexer && <Th />}
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {operacoes.map((o) => (
                                                      <OperacaoRow key={o.id} operacao={o} podeMexer={podeMexer} />
                                                    ))}
                                                  </tbody>
                                                </Table>
                                              </div>
                                            </div>
                                          );
                                        })}
                                        {lotes.length === 0 && (
                                          <p className="mt-1 text-xs text-text-muted">
                                            Nenhum lote liberado ainda — libere um lote pra começar a apontar (TÓPICO 4 §12).
                                          </p>
                                        )}
                                        {podeMexer && saldoNaoLiberado > 0 && (
                                          <form
                                            action={liberarLoteProducaoAction}
                                            className="mt-1.5 flex items-center gap-1"
                                          >
                                            <input type="hidden" name="ordem_producao_id" value={op.id} />
                                            <Input
                                              name="quantidade"
                                              type="number"
                                              step="0.001"
                                              min="0"
                                              max={saldoNaoLiberado}
                                              placeholder={`até ${num(saldoNaoLiberado)}`}
                                              className="w-20 text-xs"
                                            />
                                            <Button type="submit" variant="primary" size="sm">
                                              Liberar lote
                                            </Button>
                                          </form>
                                        )}
                                        {podeMexer && (
                                          <div className="mt-1.5 flex gap-1">
                                            <form action={concluirOrdemProducaoAction}>
                                              <input type="hidden" name="ordem_producao_id" value={op.id} />
                                              <Button
                                                type="submit"
                                                variant="primary"
                                                size="sm"
                                                disabled={op.quantidade_produzida < op.quantidade_planejada || !todasConcluidas}
                                              >
                                                Concluir
                                              </Button>
                                            </form>
                                            <form action={cancelarOrdemProducaoAction}>
                                              <input type="hidden" name="ordem_producao_id" value={op.id} />
                                              <input type="hidden" name="motivo" value="Cancelada pelo operador" />
                                              <Button type="submit" variant="danger" size="sm">
                                                Cancelar
                                              </Button>
                                            </form>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              ))}
                              {ops.length === 0 && <span className="text-text-muted">Sem OP</span>}
                            </div>
                          </Td>
                        </tr>
                      );
                    })}
                    {itensDoPedido.length === 0 && (
                      <tr>
                        <Td colSpan={5}>
                          <span className="text-text-muted">Pedido sem itens.</span>
                        </Td>
                      </tr>
                    )}
                  </tbody>
                </DenseTable>
              </div>

              {itensComOP.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-primary">Lista de corte</summary>
                  {itensComOP.map((pi) =>
                    (ordensPorPedidoItem.get(pi.id) ?? []).map((op) => {
                      const rows = listaCortePorOrdem.get(op.id) ?? [];
                      const primeira = rows[0];
                      return (
                        <div key={op.id} className="mt-1.5">
                          <p className="text-xs text-text-muted">
                            OP {op.numero}
                            {primeira &&
                              ` — emitida por ${primeira.responsavel ?? "—"} em ${new Date(
                                primeira.emitido_em,
                              ).toLocaleString("pt-BR")}`}
                          </p>
                          <div className="overflow-x-auto">
                            <Table>
                              <thead>
                                <tr>
                                  <Th>Item</Th>
                                  <Th>Ambiente</Th>
                                  <Th>Largura (mm)</Th>
                                  <Th>Altura (mm)</Th>
                                  <Th>Qtd.</Th>
                                  <Th>Margem de quebra</Th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row, idx) => (
                                  <tr key={idx}>
                                    <Td>
                                      {row.item_codigo} — {row.item_descricao}
                                    </Td>
                                    <Td>{row.ambiente ?? "—"}</Td>
                                    <Td>{row.largura_mm != null ? num(row.largura_mm) : "—"}</Td>
                                    <Td>{row.altura_mm != null ? num(row.altura_mm) : "—"}</Td>
                                    <Td>{num(row.quantidade)}</Td>
                                    <Td>{row.margem_quebra_percentual != null ? `${num(row.margem_quebra_percentual)}%` : "—"}</Td>
                                  </tr>
                                ))}
                                {rows.length === 0 && (
                                  <tr>
                                    <Td colSpan={6}>
                                      <span className="text-text-muted">Sem dados de medida para este item.</span>
                                    </Td>
                                  </tr>
                                )}
                              </tbody>
                            </Table>
                          </div>
                        </div>
                      );
                    }),
                  )}
                </details>
              )}
            </Card>
          );
        })}
        {pedidos.length === 0 && (
          <p className="text-xs text-text-muted">Nenhum pedido liberado ainda — a produção só entra depois da liberação (TÓPICO 3).</p>
        )}
      </div>
    </section>
  );
}
