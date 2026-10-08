"use client";

import { Fragment, useState } from "react";
import {
  criarExpedicaoAction,
  adicionarItemExpedicaoAction,
  removerItemExpedicaoAction,
  conferirExpedicaoAction,
  registrarSaidaExpedicaoAction,
  cancelarExpedicaoAction,
  confirmarEntregaItemExpedicaoAction,
  registrarOcorrenciaExpedicaoAction,
} from "./actions";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string };
type Pedido = { id: string; numero: string; pessoa_id: string; obra_id: string | null };
type PedidoItem = { id: string; pedido_id: string; item_id: string; quantidade: number };
type OrdemProducao = {
  id: string;
  pedido_item_id: string;
  status: string;
  status_qualidade: "pendente" | "aprovado" | "bloqueado";
  quantidade_produzida: number;
};
type Expedicao = {
  id: string;
  pedido_id: string;
  numero: string;
  status: "preparando" | "conferida" | "expedida" | "cancelada";
  motivo_cancelamento: string | null;
};
type ExpedicaoItem = {
  id: string;
  expedicao_id: string;
  pedido_item_id: string;
  quantidade: number;
  quantidade_entregue: number;
  quantidade_pendente: number;
};
type Ocorrencia = { id: string; expedicao_id: string; descricao: string; registrado_em: string };

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const STATUS_LABEL: Record<Expedicao["status"], string> = {
  preparando: "Preparando",
  conferida: "Conferida",
  expedida: "Expedida",
  cancelada: "Cancelada",
};

const STATUS_TONE: Record<Expedicao["status"], "neutral" | "success" | "danger"> = {
  preparando: "neutral",
  conferida: "success",
  expedida: "success",
  cancelada: "danger",
};

// 2026-10-04: linha compacta (pedido) que expande ao clicar — mesmo
// padrão já aplicado nos outros módulos. Dentro, as ações de cada
// expedição (adicionar item, cancelar, registrar ocorrência, confirmar
// entrega) deixam de ficar sempre abertas e passam a aparecer atrás de um
// botão. Ações sem campo nenhum (Conferir, Registrar saída, Remover,
// Nova expedição) continuam botão direto — não há nada pra "revelar".
export default function ExpedicaoSection({
  pedidos,
  paginacao,
  pedidoItensPorPedido,
  itens,
  pessoas,
  obras,
  ordemPorPedidoItem,
  expedicoesPorPedido,
  itensPorExpedicao,
  ocorrenciasPorExpedicao,
  jaUsadoPorPedidoItem,
  canManage,
}: {
  pedidos: Pedido[];
  paginacao: PaginacaoInfo;
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  itens: Item[];
  pessoas: Pessoa[];
  obras: Obra[];
  ordemPorPedidoItem: Map<string, OrdemProducao>;
  expedicoesPorPedido: Map<string, Expedicao[]>;
  itensPorExpedicao: Map<string, ExpedicaoItem[]>;
  ocorrenciasPorExpedicao: Map<string, Ocorrencia[]>;
  jaUsadoPorPedidoItem: Map<string, number>;
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabel = (itemId: string) => {
    const it = itens.find((i) => i.id === itemId);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Pedidos liberados — expedições</h2>
      <p className="mt-1 text-xs text-text-muted">Clique num pedido para ver e gerenciar as expedições.</p>

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Pedido</Th>
              <Th>Cliente</Th>
              <Th>Obra</Th>
              <Th>Expedições</Th>
              <Th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {pedidos.map((ped) => {
              const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];
              const expedicoes = expedicoesPorPedido.get(ped.id) ?? [];
              const aberto = expandido === ped.id;

              const itensElegiveis = itensDoPedido
                .map((pi) => {
                  const op = ordemPorPedidoItem.get(pi.id);
                  const jaUsado = jaUsadoPorPedidoItem.get(pi.id) ?? 0;
                  const disponivel =
                    op && op.status === "concluida" && op.status_qualidade === "aprovado"
                      ? Number(op.quantidade_produzida) - jaUsado
                      : 0;
                  return { pedidoItem: pi, disponivel };
                })
                .filter((x) => x.disponivel > 0);

              return (
                <Fragment key={ped.id}>
                  <tr onClick={() => setExpandido((atual) => (atual === ped.id ? null : ped.id))} className="cursor-pointer hover:bg-page-bg">
                    <Td className="font-medium text-text">{ped.numero}</Td>
                    <Td>{pessoaNome(ped.pessoa_id)}</Td>
                    <Td className="text-text-muted">{obraNome(ped.obra_id)}</Td>
                    <Td className="text-text-muted">{expedicoes.length}</Td>
                    <Td className="text-text-muted">{aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                  </tr>
                  {aberto && (
                    <tr>
                      <Td colSpan={5} className="bg-page-bg">
                        {canManage && (
                          <form action={criarExpedicaoAction} className="mb-2">
                            <input type="hidden" name="pedido_id" value={ped.id} />
                            <Button type="submit" variant="primary" size="sm">
                              + Nova expedição
                            </Button>
                          </form>
                        )}

                        <div className="flex flex-col gap-2.5">
                          {expedicoes.map((exp) => (
                            <ExpedicaoBloco
                              key={exp.id}
                              exp={exp}
                              pedNumero={ped.numero}
                              pessoaNomeStr={pessoaNome(ped.pessoa_id)}
                              itensDoPedido={itensDoPedido}
                              expItens={itensPorExpedicao.get(exp.id) ?? []}
                              ocorrencias={ocorrenciasPorExpedicao.get(exp.id) ?? []}
                              itensElegiveis={itensElegiveis}
                              itemLabel={itemLabel}
                              canManage={canManage}
                            />
                          ))}
                          {expedicoes.length === 0 && (
                            <p className="text-xs text-text-muted">Nenhuma expedição criada ainda para este pedido.</p>
                          )}
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
                  Nenhum pedido liberado ainda — a expedição só entra depois da liberação (TÓPICO 3).
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
        <Paginacao {...paginacao} />
      </div>
    </section>
  );
}

function ExpedicaoBloco({
  exp,
  pedNumero,
  pessoaNomeStr,
  itensDoPedido,
  expItens,
  ocorrencias,
  itensElegiveis,
  itemLabel,
  canManage,
}: {
  exp: Expedicao;
  pedNumero: string;
  pessoaNomeStr: string;
  itensDoPedido: PedidoItem[];
  expItens: ExpedicaoItem[];
  ocorrencias: Ocorrencia[];
  itensElegiveis: { pedidoItem: PedidoItem; disponivel: number }[];
  itemLabel: (itemId: string) => string;
  canManage: boolean;
}) {
  const [acao, setAcao] = useState<"nenhuma" | "adicionarItem" | "cancelar" | "ocorrencia">("nenhuma");

  return (
    <div className="rounded-md border border-border-subtle p-2">
      <div className="flex flex-wrap items-baseline gap-2 text-xs">
        <strong>{exp.numero}</strong>
        <Badge variant={STATUS_TONE[exp.status]}>{STATUS_LABEL[exp.status]}</Badge>
        {exp.status === "cancelada" && exp.motivo_cancelamento && (
          <span className="text-text-muted">Motivo: {exp.motivo_cancelamento}</span>
        )}
      </div>

      <Table className="mt-1.5">
        <thead>
          <tr>
            <Th>Item</Th>
            <Th>Qtd.</Th>
            <Th>Entregue</Th>
            <Th>Pendente</Th>
            {canManage && <Th />}
          </tr>
        </thead>
        <tbody>
          {expItens.map((ei) => {
            const pi = itensDoPedido.find((p) => p.id === ei.pedido_item_id);
            return (
              <ItemExpedicaoRow
                key={ei.id}
                ei={ei}
                label={pi ? itemLabel(pi.item_id) : "(item removido)"}
                expStatus={exp.status}
                canManage={canManage}
              />
            );
          })}
          {expItens.length === 0 && (
            <tr>
              <Td colSpan={canManage ? 5 : 4}>
                <span className="text-text-muted">Sem itens separados ainda.</span>
              </Td>
            </tr>
          )}
        </tbody>
      </Table>

      {canManage && exp.status === "preparando" && (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {itensElegiveis.length > 0 && acao !== "adicionarItem" && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("adicionarItem")}>
                + Adicionar item
              </Button>
            )}
            <form action={conferirExpedicaoAction}>
              <input type="hidden" name="expedicao_id" value={exp.id} />
              <Button type="submit" variant="primary" size="sm" disabled={expItens.length === 0}>
                Conferir
              </Button>
            </form>
            {acao !== "cancelar" && (
              <Button type="button" variant="outlineDanger" size="sm" onClick={() => setAcao("cancelar")}>
                Cancelar
              </Button>
            )}
          </div>

          {acao === "adicionarItem" && (
            <form
              action={adicionarItemExpedicaoAction}
              onSubmit={() => setAcao("nenhuma")}
              className="flex flex-wrap items-center gap-1.5"
            >
              <input type="hidden" name="expedicao_id" value={exp.id} />
              <Select name="pedido_item_id" defaultValue="" required className="min-w-48">
                <option value="" disabled>
                  Item disponível
                </option>
                {itensElegiveis.map(({ pedidoItem, disponivel }) => (
                  <option key={pedidoItem.id} value={pedidoItem.id}>
                    {itemLabel(pedidoItem.item_id)} (disponível: {num(disponivel)})
                  </option>
                ))}
              </Select>
              <Input name="quantidade" type="number" step="0.001" min="0.001" placeholder="quantidade" required className="w-20" />
              <Button type="submit" variant="primary" size="sm">
                Adicionar
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("nenhuma")}>
                Cancelar
              </Button>
            </form>
          )}

          {acao === "cancelar" && (
            <form action={cancelarExpedicaoAction} onSubmit={() => setAcao("nenhuma")} className="flex items-center gap-1.5">
              <input type="hidden" name="expedicao_id" value={exp.id} />
              <Input name="motivo" placeholder="motivo (opcional)" className="w-36" />
              <Button type="submit" variant="danger" size="sm">
                Confirmar cancelamento
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("nenhuma")}>
                Voltar
              </Button>
            </form>
          )}
        </div>
      )}

      {canManage && exp.status === "conferida" && (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <form action={registrarSaidaExpedicaoAction}>
              <input type="hidden" name="expedicao_id" value={exp.id} />
              <Button type="submit" variant="primary" size="sm">
                Registrar saída
              </Button>
            </form>
            {acao !== "cancelar" && (
              <Button type="button" variant="outlineDanger" size="sm" onClick={() => setAcao("cancelar")}>
                Cancelar
              </Button>
            )}
          </div>
          {acao === "cancelar" && (
            <form action={cancelarExpedicaoAction} onSubmit={() => setAcao("nenhuma")} className="flex items-center gap-1.5">
              <input type="hidden" name="expedicao_id" value={exp.id} />
              <Input name="motivo" placeholder="motivo (opcional)" className="w-36" />
              <Button type="submit" variant="danger" size="sm">
                Confirmar cancelamento
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("nenhuma")}>
                Voltar
              </Button>
            </form>
          )}
        </div>
      )}

      <div className="mt-2">
        <p className="mb-1 text-xs text-text-muted">Ocorrências</p>
        {ocorrencias.map((oc) => (
          <p key={oc.id} className="mb-0.5 text-xs">
            <span className="text-text-muted">{new Date(oc.registrado_em).toLocaleString("pt-BR")} — </span>
            {oc.descricao}
          </p>
        ))}
        {ocorrencias.length === 0 && <p className="text-xs text-text-muted">Nenhuma registrada.</p>}
        {canManage && exp.status !== "cancelada" && (
          acao === "ocorrencia" ? (
            <form action={registrarOcorrenciaExpedicaoAction} onSubmit={() => setAcao("nenhuma")} className="mt-1 flex gap-1">
              <input type="hidden" name="expedicao_id" value={exp.id} />
              <Input name="descricao" placeholder="descrever ocorrência" required className="flex-1" />
              <Button type="submit" variant="primary" size="sm">
                Registrar
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("nenhuma")}>
                Cancelar
              </Button>
            </form>
          ) : (
            <Button type="button" variant="secondary" size="sm" className="mt-1" onClick={() => setAcao("ocorrencia")}>
              + Registrar ocorrência
            </Button>
          )
        )}
      </div>

      {expItens.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-primary">Romaneio</summary>
          {/* Documento para entregar impresso: sai por uma rota
              própria, fora do layout da aplicação, a partir de
              romaneio_expedicao() — não é esta tabela mandada
              para a impressora. */}
          <a
            href={`/expedicao/${exp.id}/romaneio`}
            target="_blank"
            rel="noopener"
            className="mt-1.5 inline-block text-xs text-primary underline"
          >
            Abrir romaneio para impressão
          </a>
          <Table className="mt-1.5">
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Cliente</Th>
                <Th>Item</Th>
                <Th>Qtd.</Th>
                <Th>Entregue</Th>
                <Th>Pendente</Th>
              </tr>
            </thead>
            <tbody>
              {expItens.map((ei) => {
                const pi = itensDoPedido.find((p) => p.id === ei.pedido_item_id);
                return (
                  <tr key={ei.id}>
                    <Td>{pedNumero}</Td>
                    <Td>{pessoaNomeStr}</Td>
                    <Td>{pi ? itemLabel(pi.item_id) : "(item removido)"}</Td>
                    <Td>{num(ei.quantidade)}</Td>
                    <Td>{num(ei.quantidade_entregue)}</Td>
                    <Td>{num(ei.quantidade_pendente)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </details>
      )}
    </div>
  );
}

function ItemExpedicaoRow({
  ei,
  label,
  expStatus,
  canManage,
}: {
  ei: ExpedicaoItem;
  label: string;
  expStatus: Expedicao["status"];
  canManage: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);

  return (
    <tr>
      <Td>{label}</Td>
      <Td>{num(ei.quantidade)}</Td>
      <Td>{num(ei.quantidade_entregue)}</Td>
      <Td>{num(ei.quantidade_pendente)}</Td>
      {canManage && (
        <Td>
          {expStatus === "preparando" && (
            <form action={removerItemExpedicaoAction}>
              <input type="hidden" name="id" value={ei.id} />
              <Button type="submit" variant="danger" size="sm">
                Remover
              </Button>
            </form>
          )}
          {expStatus === "expedida" && ei.quantidade_pendente > 0 && (
            confirmando ? (
              <form
                action={confirmarEntregaItemExpedicaoAction}
                onSubmit={() => setConfirmando(false)}
                className="flex gap-1"
              >
                <input type="hidden" name="id" value={ei.id} />
                <Input
                  name="quantidade_entregue"
                  type="number"
                  step="0.001"
                  min="0.001"
                  max={ei.quantidade_pendente}
                  placeholder="entregue"
                  required
                  className="w-[70px]"
                />
                <Button type="submit" variant="primary" size="sm">
                  Confirmar
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Button>
              </form>
            ) : (
              <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmando(true)}>
                Confirmar entrega
              </Button>
            )
          )}
        </Td>
      )}
    </tr>
  );
}
