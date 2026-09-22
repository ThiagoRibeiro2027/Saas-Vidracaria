"use client";

import { useState } from "react";
import { definirPrioridadeOpAction, programarOperacaoAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

export type ProgramacaoRow = {
  op_lote_operacao_id: string;
  ordem_producao_id: string;
  ordem_producao_numero: string;
  prioridade: number;
  item_codigo: string;
  item_descricao: string;
  previsao_entrega: string | null;
  descricao_operacao: string;
  sequencia: number;
  status: "planejada" | "em_andamento" | "concluida";
  quantidade_planejada: number;
  saldo: number;
  recurso_produtivo_id: string | null;
  recurso_codigo: string | null;
  recurso_nome: string | null;
  setor: string | null;
  data_planejada_inicio: string | null;
  data_planejada_fim: string | null;
};

const PRIORIDADE_LABEL: Record<number, string> = {
  1: "1 — mais urgente",
  2: "2",
  3: "3 — normal",
  4: "4",
  5: "5 — menos urgente",
};

const fmtData = (v: string | null) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString("pt-BR") : "—");

export default function ProgramacaoSection({
  linhas,
  recursosOpcoes,
  setoresOpcoes,
  periodosCongelados,
  canManage,
}: {
  linhas: ProgramacaoRow[];
  recursosOpcoes: { id: string; codigo: string; nome: string }[];
  setoresOpcoes: string[];
  periodosCongelados: { data_inicio: string; data_fim: string }[];
  canManage: boolean;
}) {
  const [filtroRecurso, setFiltroRecurso] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("");

  // TÓPICO 4 §9 (Fase 6d) — só um aviso visual (client-side, sem RPC
  // extra); a garantia real é assert_pode_reprogramar() no banco.
  const estaCongelado = (data: string | null) =>
    !!data && periodosCongelados.some((p) => data >= p.data_inicio && data <= p.data_fim);

  const linhasFiltradas = linhas.filter((l) => {
    if (filtroRecurso && l.recurso_produtivo_id !== filtroRecurso) return false;
    if (filtroSetor && l.setor !== filtroSetor) return false;
    return true;
  });

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Programação (TÓPICO 4 §5)</h2>
      <p className="mt-1 text-xs text-text-muted">
        Prioridade da OP e datas planejadas por operação/recurso — base pro PCP planejar. Prazo
        prometido vem do pedido (previsão de entrega). Reprogramar uma operação dentro de um
        período congelado (§9, ver seção abaixo) exige permissão adicional. Sem replanejamento
        automático ainda (§10, próxima sub-fase).
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Select value={filtroRecurso} onChange={(e) => setFiltroRecurso(e.target.value)} className="w-40">
          <option value="">Todos os recursos</option>
          {recursosOpcoes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.codigo} — {r.nome}
            </option>
          ))}
        </Select>
        <Select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)} className="w-36">
          <option value="">Todos os setores</option>
          {setoresOpcoes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>OP / Item</Th>
              <Th>Prazo</Th>
              <Th>Prioridade</Th>
              <Th>Operação</Th>
              <Th>Recurso</Th>
              <Th>Planejado / saldo</Th>
              <Th>Datas planejadas</Th>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.map((l) => (
              <tr key={l.op_lote_operacao_id} className="align-top">
                <Td>
                  {l.ordem_producao_numero}
                  <div className="text-xs text-text-muted">
                    {l.item_codigo} — {l.item_descricao}
                  </div>
                </Td>
                <Td>{fmtData(l.previsao_entrega)}</Td>
                <Td>
                  {canManage ? (
                    <form action={definirPrioridadeOpAction} className="flex items-center gap-1">
                      <input type="hidden" name="ordem_producao_id" value={l.ordem_producao_id} />
                      <Select name="prioridade" defaultValue={l.prioridade} className="w-28 text-xs">
                        {[1, 2, 3, 4, 5].map((p) => (
                          <option key={p} value={p}>
                            {PRIORIDADE_LABEL[p]}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="primary" size="sm">
                        Salvar
                      </Button>
                    </form>
                  ) : (
                    PRIORIDADE_LABEL[l.prioridade] ?? l.prioridade
                  )}
                </Td>
                <Td>
                  {l.sequencia}. {l.descricao_operacao}
                  <div className="text-xs text-text-muted">{l.status}</div>
                </Td>
                <Td>
                  {l.recurso_codigo ? `${l.recurso_codigo} — ${l.recurso_nome}` : "—"}
                  {l.setor && <div className="text-xs text-text-muted">{l.setor}</div>}
                </Td>
                <Td>
                  {Number(l.quantidade_planejada).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} /{" "}
                  {Number(l.saldo).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                </Td>
                <Td>
                  {estaCongelado(l.data_planejada_inicio) && (
                    <div className="text-xs text-danger">🔒 período congelado</div>
                  )}
                  {canManage ? (
                    <form action={programarOperacaoAction} className="flex flex-wrap items-center gap-1">
                      <input type="hidden" name="op_lote_operacao_id" value={l.op_lote_operacao_id} />
                      <Input
                        name="data_planejada_inicio"
                        type="date"
                        defaultValue={l.data_planejada_inicio ?? ""}
                        className="w-32 text-xs"
                      />
                      <Input
                        name="data_planejada_fim"
                        type="date"
                        defaultValue={l.data_planejada_fim ?? ""}
                        className="w-32 text-xs"
                      />
                      <Button type="submit" variant="primary" size="sm">
                        Programar
                      </Button>
                    </form>
                  ) : (
                    `${fmtData(l.data_planejada_inicio)} – ${fmtData(l.data_planejada_fim)}`
                  )}
                </Td>
              </tr>
            ))}
            {linhasFiltradas.length === 0 && (
              <tr>
                <Td colSpan={7}>
                  <span className="text-text-muted">Nenhuma operação encontrada com os filtros atuais.</span>
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </section>
  );
}
