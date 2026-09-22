"use client";

import {
  registrarInspecaoAction,
  executarRetrabalhoAction,
  reinspecionarRetrabalhoAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td } from "@/components/ui/Table";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string };
type Pedido = { id: string; numero: string; pessoa_id: string; obra_id: string | null };
type PedidoItem = { id: string; pedido_id: string; item_id: string };
type OrdemProducao = {
  id: string;
  pedido_id: string;
  pedido_item_id: string;
  numero: string;
  quantidade_produzida: number;
  status_qualidade: "pendente" | "aprovado" | "bloqueado";
};
type InspecaoQualidade = {
  id: string;
  ordem_producao_id: string;
  nao_conformidade_id: string | null;
  quantidade_aprovada: number;
  quantidade_reprovada: number;
  resultado: "aprovado" | "reprovado";
  observacoes: string | null;
  inspecionado_em: string;
};
type NaoConformidade = {
  id: string;
  ordem_producao_id: string;
  quantidade: number;
  status: "aberta" | "encerrada";
  descricao: string | null;
  aberta_em: string;
  retrabalho_executado_em: string | null;
  retrabalho_observacao: string | null;
  encerrada_em: string | null;
};

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const STATUS_QUALIDADE_LABEL: Record<OrdemProducao["status_qualidade"], string> = {
  pendente: "Pendente de inspeção",
  aprovado: "Aprovado",
  bloqueado: "Bloqueado (não conformidade)",
};

const STATUS_QUALIDADE_TONE: Record<OrdemProducao["status_qualidade"], "neutral" | "success" | "warning" | "danger"> = {
  pendente: "warning",
  aprovado: "success",
  bloqueado: "danger",
};

export default function QualidadeSection({
  ordens,
  pedidos,
  pedidoItens,
  itens,
  pessoas,
  obras,
  inspecoesPorOrdem,
  ncsPorOrdem,
  statusQualidadeLabels,
  canManage,
}: {
  ordens: OrdemProducao[];
  pedidos: Pedido[];
  pedidoItens: PedidoItem[];
  itens: Item[];
  pessoas: Pessoa[];
  obras: Obra[];
  inspecoesPorOrdem: Map<string, InspecaoQualidade[]>;
  ncsPorOrdem: Map<string, NaoConformidade[]>;
  // TÓPICO 4 §41 (Fase 7c) — rótulo customizável por empresa, com o texto
  // fixo de STATUS_QUALIDADE_LABEL como default de quem não configurou.
  statusQualidadeLabels?: Map<string, string>;
  canManage: boolean;
}) {
  const pedidoDe = (id: string) => pedidos.find((p) => p.id === id);
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabelDoPedidoItem = (pedidoItemId: string) => {
    const pi = pedidoItens.find((p) => p.id === pedidoItemId);
    const it = pi ? itens.find((i) => i.id === pi.item_id) : undefined;
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Ordens de produção concluídas</h2>
      <div className="mt-2 flex flex-col gap-4">
        {ordens.map((op) => {
          const pedido = pedidoDe(op.pedido_id);
          const inspecoes = inspecoesPorOrdem.get(op.id) ?? [];
          const primeiraInspecao = inspecoes.find((i) => i.nao_conformidade_id === null);
          const ncs = ncsPorOrdem.get(op.id) ?? [];
          const ncAberta = ncs.find((nc) => nc.status === "aberta");

          return (
            <Card key={op.id} padding="xs">
              <div className="flex flex-wrap items-baseline gap-2.5 text-xs">
                <strong className="text-[13px] text-text">{op.numero}</strong>
                <span>{pedido ? pedido.numero : "(pedido removido)"}</span>
                <span>{pedido ? pessoaNome(pedido.pessoa_id) : "—"}</span>
                <span className="text-text-muted">{pedido ? obraNome(pedido.obra_id) : "—"}</span>
                <span>{itemLabelDoPedidoItem(op.pedido_item_id)}</span>
                <span className="text-text-muted">Produzida: {num(op.quantidade_produzida)}</span>
                <Badge variant={STATUS_QUALIDADE_TONE[op.status_qualidade]}>
                  {statusQualidadeLabels?.get(op.status_qualidade) ?? STATUS_QUALIDADE_LABEL[op.status_qualidade]}
                </Badge>
              </div>

              {canManage && !primeiraInspecao && (
                <form action={registrarInspecaoAction} className="mt-2 flex flex-wrap items-center gap-1.5">
                  <input type="hidden" name="ordem_producao_id" value={op.id} />
                  <Input
                    name="quantidade_aprovada"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="aprovada"
                    required
                    className="w-20"
                  />
                  <Input
                    name="quantidade_reprovada"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="reprovada"
                    required
                    className="w-20"
                  />
                  <Input name="observacoes" placeholder="observações (opcional)" className="w-44" />
                  <Button type="submit" variant="primary">
                    Registrar inspeção
                  </Button>
                  <span className="text-[11px] text-text-muted">
                    Soma precisa ser igual à quantidade produzida ({num(op.quantidade_produzida)}).
                  </span>
                </form>
              )}

              {canManage && ncAberta && !ncAberta.retrabalho_executado_em && (
                <form action={executarRetrabalhoAction} className="mt-2 flex flex-wrap items-center gap-1.5">
                  <input type="hidden" name="nao_conformidade_id" value={ncAberta.id} />
                  <span className="text-xs text-danger">
                    Não conformidade aberta ({num(ncAberta.quantidade)} un.) — retrabalho pendente.
                  </span>
                  <Input name="observacao" placeholder="observação (opcional)" className="w-44" />
                  <Button type="submit" variant="primary">
                    Executar retrabalho
                  </Button>
                </form>
              )}

              {canManage && ncAberta && ncAberta.retrabalho_executado_em && (
                <form action={reinspecionarRetrabalhoAction} className="mt-2 flex flex-wrap items-center gap-1.5">
                  <input type="hidden" name="nao_conformidade_id" value={ncAberta.id} />
                  <Input
                    name="quantidade_aprovada"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="aprovada"
                    required
                    className="w-20"
                  />
                  <Input
                    name="quantidade_reprovada"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="reprovada"
                    required
                    className="w-20"
                  />
                  <Input name="observacoes" placeholder="observações (opcional)" className="w-44" />
                  <Button type="submit" variant="primary">
                    Reinspecionar
                  </Button>
                  <span className="text-[11px] text-text-muted">
                    Soma precisa ser igual à quantidade em retrabalho ({num(ncAberta.quantidade)}).
                  </span>
                </form>
              )}

              {(inspecoes.length > 0 || ncs.length > 0) && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-primary">Histórico</summary>
                  <Table className="mt-1.5">
                    <thead>
                      <tr>
                        <Th>Quando</Th>
                        <Th>Evento</Th>
                        <Th>Aprovada</Th>
                        <Th>Reprovada</Th>
                        <Th>Observações</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspecoes.map((insp) => (
                        <tr key={insp.id}>
                          <Td>{new Date(insp.inspecionado_em).toLocaleString("pt-BR")}</Td>
                          <Td>{insp.nao_conformidade_id ? "Reinspeção" : "Inspeção inicial"}</Td>
                          <Td>{num(insp.quantidade_aprovada)}</Td>
                          <Td>{num(insp.quantidade_reprovada)}</Td>
                          <Td>{insp.observacoes ?? "—"}</Td>
                        </tr>
                      ))}
                      {ncs.map((nc) => (
                        <tr key={nc.id}>
                          <Td>{new Date(nc.aberta_em).toLocaleString("pt-BR")}</Td>
                          <Td>
                            NC {nc.status === "aberta" ? "aberta" : "encerrada"}
                            {nc.retrabalho_executado_em ? " · retrabalho executado" : ""}
                          </Td>
                          <Td colSpan={2}>{num(nc.quantidade)} un.</Td>
                          <Td>{nc.descricao ?? "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </details>
              )}
            </Card>
          );
        })}
        {ordens.length === 0 && (
          <p className="text-xs text-text-muted">
            Nenhuma ordem de produção concluída ainda — a inspeção só entra depois da conclusão
            (TÓPICO 4).
          </p>
        )}
      </div>
    </section>
  );
}
