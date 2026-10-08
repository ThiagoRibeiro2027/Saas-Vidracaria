"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { formatarData } from "@/lib/formato/data";

export type FilaProducaoRow = {
  pedido_id: string;
  pedido_numero: string;
  pessoa_id: string;
  pessoa_nome: string;
  obra_id: string | null;
  obra_nome: string | null;
  previsao_entrega: string | null;
  ordem_producao_id: string;
  ordem_producao_numero: string;
  prioridade: number;
  item_codigo: string;
  item_descricao: string;
  quantidade_planejada: number;
  quantidade_produzida: number;
  quantidade_perdida: number;
  status: "planejada" | "em_producao" | "concluida" | "cancelada";
  situacao: "liberada" | "liberada_com_restricao" | "bloqueada";
  lotes_total: number;
  lotes_concluidos: number;
};

const STATUS_LABEL: Record<FilaProducaoRow["status"], string> = {
  planejada: "Planejada",
  em_producao: "Em produção",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const SITUACAO_LABEL: Record<FilaProducaoRow["situacao"], string> = {
  liberada: "Liberada",
  liberada_com_restricao: "Liberada c/ restrição",
  bloqueada: "Bloqueada",
};

const SITUACAO_TONE: Record<FilaProducaoRow["situacao"], "success" | "warning" | "danger"> = {
  liberada: "success",
  liberada_com_restricao: "warning",
  bloqueada: "danger",
};

// 2026-10-04: migrado do estilo legado (configuracoes/styles) pros
// componentes padrão — cada pedido agora é uma linha compacta que
// expande ao clicar pra mostrar a tabela de OPs, em vez de ficar sempre
// aberta. Sem paginação real: a RPC traz tudo de uma vez e os filtros
// (cliente/obra/status) continuam sendo aplicados no cliente, como já
// eram — ver nota em page.tsx.
export default function FilaProducaoSection({ linhas }: { linhas: FilaProducaoRow[] }) {
  const [filtroPessoa, setFiltroPessoa] = useState("");
  const [filtroObra, setFiltroObra] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  const pessoaOpcoes = useMemo(() => {
    const map = new Map<string, string>();
    linhas.forEach((l) => map.set(l.pessoa_id, l.pessoa_nome));
    return Array.from(map, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [linhas]);

  const obraOpcoes = useMemo(() => {
    const map = new Map<string, string>();
    linhas.forEach((l) => {
      if (l.obra_id && l.obra_nome) map.set(l.obra_id, l.obra_nome);
    });
    return Array.from(map, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [linhas]);

  const linhasFiltradas = linhas.filter((l) => {
    if (filtroPessoa && l.pessoa_id !== filtroPessoa) return false;
    if (filtroObra && l.obra_id !== filtroObra) return false;
    if (filtroStatus && l.status !== filtroStatus) return false;
    return true;
  });

  const pedidosAgrupados = useMemo(() => {
    const grupos = new Map<string, FilaProducaoRow[]>();
    linhasFiltradas.forEach((l) => {
      const grupo = grupos.get(l.pedido_id) ?? [];
      grupo.push(l);
      grupos.set(l.pedido_id, grupo);
    });
    return Array.from(grupos.values());
  }, [linhasFiltradas]);

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Fila por pedido</h2>
      <p className="mt-1 text-xs text-text-muted">
        Ordens de produção agrupadas por pedido de cliente, ordenadas por prioridade e previsão de
        entrega (mesma prioridade já usada em Produção → Programação). Progresso de lotes é
        concluídos/total de op_lotes da OP. Clique num pedido para ver as OPs.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Select value={filtroPessoa} onChange={(e) => setFiltroPessoa(e.target.value)} className="w-52">
          <option value="">Todos os clientes</option>
          {pessoaOpcoes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Select>
        <Select value={filtroObra} onChange={(e) => setFiltroObra(e.target.value)} className="w-44">
          <option value="">Todas as obras</option>
          {obraOpcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </Select>
        <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="w-40">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Pedido</Th>
              <Th>Cliente</Th>
              <Th>Obra</Th>
              <Th>Previsão de entrega</Th>
              <Th>OPs</Th>
              <Th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {pedidosAgrupados.map((grupo) => {
              const primeira = grupo[0];
              const aberto = expandido === primeira.pedido_id;
              return (
                <Fragment key={primeira.pedido_id}>
                  <tr
                    onClick={() => setExpandido((atual) => (atual === primeira.pedido_id ? null : primeira.pedido_id))}
                    className="cursor-pointer hover:bg-page-bg"
                  >
                    <Td className="font-medium text-text">{primeira.pedido_numero}</Td>
                    <Td>{primeira.pessoa_nome}</Td>
                    <Td className="text-text-muted">{primeira.obra_nome ?? "—"}</Td>
                    <Td className="text-text-muted">{formatarData(primeira.previsao_entrega)}</Td>
                    <Td className="text-text-muted">{grupo.length}</Td>
                    <Td className="text-text-muted">{aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                  </tr>
                  {aberto && (
                    <tr>
                      <Td colSpan={6} className="bg-page-bg">
                        <Table>
                          <thead>
                            <tr>
                              <Th>OP</Th>
                              <Th>Item</Th>
                              <Th>Prioridade</Th>
                              <Th>Planejado</Th>
                              <Th>Produzido</Th>
                              <Th>Perdido</Th>
                              <Th>Status</Th>
                              <Th>Situação</Th>
                              <Th>Lotes</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {grupo.map((op) => (
                              <tr key={op.ordem_producao_id}>
                                <Td>{op.ordem_producao_numero}</Td>
                                <Td>
                                  {op.item_codigo} — {op.item_descricao}
                                </Td>
                                <Td>{op.prioridade}</Td>
                                <Td>{op.quantidade_planejada}</Td>
                                <Td>{op.quantidade_produzida}</Td>
                                <Td>{op.quantidade_perdida}</Td>
                                <Td>{STATUS_LABEL[op.status]}</Td>
                                <Td>
                                  <Badge variant={SITUACAO_TONE[op.situacao]}>{SITUACAO_LABEL[op.situacao]}</Badge>
                                </Td>
                                <Td>{op.lotes_total > 0 ? `${op.lotes_concluidos}/${op.lotes_total}` : "—"}</Td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </Td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {pedidosAgrupados.length === 0 && (
              <tr>
                <Td colSpan={6} className="text-text-muted">
                  Nenhuma ordem de produção encontrada com esses filtros.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </section>
  );
}
