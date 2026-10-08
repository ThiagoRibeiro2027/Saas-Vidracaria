"use client";

import { Fragment, useState } from "react";
import {
  registrarInspecaoAction,
  executarRetrabalhoAction,
  reinspecionarRetrabalhoAction,
} from "./actions";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td } from "@/components/ui/Table";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";

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

// 2026-10-04: linha compacta que expande ao clicar — mesmo padrão já
// aplicado em RH/Fiscal/Financeiro. Os formulários de ação (registrar
// inspeção/retrabalho/reinspeção) deixam de aparecer automaticamente só
// por a OP estar no estado certo; agora ficam atrás de um botão, revelados
// só quando o usuário pede.
export default function QualidadeSection({
  ordens,
  paginacao,
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
  paginacao: PaginacaoInfo;
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

  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Ordens de produção concluídas</h2>
      <p className="mt-1 text-xs text-text-muted">Clique numa OP para ver histórico e registrar inspeção/retrabalho.</p>

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>OP</Th>
              <Th>Pedido</Th>
              <Th>Cliente</Th>
              <Th>Obra</Th>
              <Th>Item</Th>
              <Th>Produzida</Th>
              <Th>Status</Th>
              <Th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {ordens.map((op) => {
              const pedido = pedidoDe(op.pedido_id);
              const aberto = expandido === op.id;
              return (
                <Fragment key={op.id}>
                  <tr onClick={() => setExpandido((atual) => (atual === op.id ? null : op.id))} className="cursor-pointer hover:bg-page-bg">
                    <Td className="font-medium text-text">{op.numero}</Td>
                    <Td>{pedido ? pedido.numero : "(pedido removido)"}</Td>
                    <Td>{pedido ? pessoaNome(pedido.pessoa_id) : "—"}</Td>
                    <Td className="text-text-muted">{pedido ? obraNome(pedido.obra_id) : "—"}</Td>
                    <Td>{itemLabelDoPedidoItem(op.pedido_item_id)}</Td>
                    <Td className="text-text-muted">{num(op.quantidade_produzida)}</Td>
                    <Td>
                      <Badge variant={STATUS_QUALIDADE_TONE[op.status_qualidade]}>
                        {statusQualidadeLabels?.get(op.status_qualidade) ?? STATUS_QUALIDADE_LABEL[op.status_qualidade]}
                      </Badge>
                    </Td>
                    <Td className="text-text-muted">{aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                  </tr>
                  {aberto && (
                    <tr>
                      <Td colSpan={8} className="bg-page-bg">
                        <OrdemDetalhe
                          op={op}
                          inspecoes={inspecoesPorOrdem.get(op.id) ?? []}
                          ncs={ncsPorOrdem.get(op.id) ?? []}
                          canManage={canManage}
                        />
                      </Td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {ordens.length === 0 && (
              <tr>
                <Td colSpan={8} className="text-text-muted">
                  Nenhuma ordem de produção concluída ainda — a inspeção só entra depois da conclusão (TÓPICO 4).
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

function OrdemDetalhe({
  op,
  inspecoes,
  ncs,
  canManage,
}: {
  op: OrdemProducao;
  inspecoes: InspecaoQualidade[];
  ncs: NaoConformidade[];
  canManage: boolean;
}) {
  const primeiraInspecao = inspecoes.find((i) => i.nao_conformidade_id === null);
  const ncAberta = ncs.find((nc) => nc.status === "aberta");
  const [acao, setAcao] = useState<"nenhuma" | "inspecionar" | "retrabalho" | "reinspecionar">("nenhuma");

  return (
    <div>
      {canManage && (
        <div className="flex flex-wrap items-center gap-1.5">
          {!primeiraInspecao && acao !== "inspecionar" && (
            <Button type="button" variant="primary" size="sm" onClick={() => setAcao("inspecionar")}>
              Registrar inspeção
            </Button>
          )}
          {ncAberta && !ncAberta.retrabalho_executado_em && acao !== "retrabalho" && (
            <Button type="button" variant="primary" size="sm" onClick={() => setAcao("retrabalho")}>
              Executar retrabalho
            </Button>
          )}
          {ncAberta && ncAberta.retrabalho_executado_em && acao !== "reinspecionar" && (
            <Button type="button" variant="primary" size="sm" onClick={() => setAcao("reinspecionar")}>
              Reinspecionar
            </Button>
          )}
          {ncAberta && (
            <span className="text-[11px] text-danger">
              Não conformidade aberta ({num(ncAberta.quantidade)} un.)
              {ncAberta.retrabalho_executado_em ? " · retrabalho já executado, aguardando reinspeção" : " · retrabalho pendente"}
            </span>
          )}
        </div>
      )}

      {acao === "inspecionar" && (
        <form action={registrarInspecaoAction} onSubmit={() => setAcao("nenhuma")} className="mt-2 flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="ordem_producao_id" value={op.id} />
          <Input name="quantidade_aprovada" type="number" step="0.001" min="0" placeholder="aprovada" required className="w-20" />
          <Input name="quantidade_reprovada" type="number" step="0.001" min="0" placeholder="reprovada" required className="w-20" />
          <Input name="observacoes" placeholder="observações (opcional)" className="w-44" />
          <Button type="submit" variant="primary" size="sm">
            Confirmar
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("nenhuma")}>
            Cancelar
          </Button>
          <span className="text-[11px] text-text-muted">
            Soma precisa ser igual à quantidade produzida ({num(op.quantidade_produzida)}).
          </span>
        </form>
      )}

      {acao === "retrabalho" && ncAberta && (
        <form action={executarRetrabalhoAction} onSubmit={() => setAcao("nenhuma")} className="mt-2 flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="nao_conformidade_id" value={ncAberta.id} />
          <Input name="observacao" placeholder="observação (opcional)" className="w-44" />
          <Button type="submit" variant="primary" size="sm">
            Confirmar
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("nenhuma")}>
            Cancelar
          </Button>
        </form>
      )}

      {acao === "reinspecionar" && ncAberta && (
        <form action={reinspecionarRetrabalhoAction} onSubmit={() => setAcao("nenhuma")} className="mt-2 flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="nao_conformidade_id" value={ncAberta.id} />
          <Input name="quantidade_aprovada" type="number" step="0.001" min="0" placeholder="aprovada" required className="w-20" />
          <Input name="quantidade_reprovada" type="number" step="0.001" min="0" placeholder="reprovada" required className="w-20" />
          <Input name="observacoes" placeholder="observações (opcional)" className="w-44" />
          <Button type="submit" variant="primary" size="sm">
            Confirmar
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAcao("nenhuma")}>
            Cancelar
          </Button>
          <span className="text-[11px] text-text-muted">
            Soma precisa ser igual à quantidade em retrabalho ({num(ncAberta.quantidade)}).
          </span>
        </form>
      )}

      {(inspecoes.length > 0 || ncs.length > 0) && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-text">Histórico</p>
          <Table>
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
        </div>
      )}
    </div>
  );
}
