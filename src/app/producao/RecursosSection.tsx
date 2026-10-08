"use client";

import { useState } from "react";
import {
  criarRecursoProdutivoAction,
  editarRecursoProdutivoAction,
  atualizarSituacaoRecursoAction,
  desativarRecursoProdutivoAction,
  programarManutencaoPreventivaAction,
  editarManutencaoPreventivaAction,
  cancelarManutencaoPreventivaAction,
  iniciarManutencaoCorretivaAction,
  encerrarManutencaoCorretivaAction,
  trocarRecursoOperacaoAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatarData } from "@/lib/formato/data";

type RecursoProdutivo = {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  setor: string | null;
  localizacao: string | null;
  capacidade_horas_dia: number | null;
  custo_hora: number | null;
  situacao: string;
  motivo_situacao: string | null;
  ativo: boolean;
};
export type CapacidadeRecursoRow = {
  recurso_produtivo_id: string;
  capacidade_disponivel_horas: number;
  capacidade_necessaria_horas: number;
  saldo_horas: number;
  classificacao: "sem_capacidade_cadastrada" | "sobrecarga" | "ociosa" | "normal";
};
export type ManutencaoPreventivaRow = {
  id: string;
  recurso_produtivo_id: string;
  tipo: string;
  periodicidade_dias: number | null;
  proxima_data: string;
  duracao_estimada_horas: number | null;
  // Não aparece na tela, mas viaja no formulário de edição: o UPDATE do
  // banco grava o parâmetro direto, então omitir apagaria o responsável.
  responsavel_id: string | null;
};
export type ManutencaoCorretivaRow = {
  id: string;
  recurso_produtivo_id: string;
  inicio_parada: string;
  problema: string;
  motivo: string | null;
  status: "aberta" | "encerrada";
};
export type ImpactoManutencaoRow = {
  origem: "operacao" | "split_recurso";
  op_lote_operacao_id: string;
  op_lote_operacao_recurso_id: string | null;
  ordem_producao_numero: string;
  descricao_operacao: string;
  saldo_pendente: number;
  impacto_horas: number | null;
};
type RecursoAlternativo = { id: string; codigo: string; nome: string };
export type GargaloRow = {
  recurso_produtivo_id: string;
  codigo: string;
  nome: string;
  tipo: string;
  capacidade_disponivel_horas: number;
  capacidade_necessaria_horas: number;
  saldo_horas: number;
};

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TIPO_LABEL: Record<string, string> = {
  maquina: "Máquina",
  equipamento: "Equipamento",
  linha: "Linha",
  posto: "Posto",
  equipe: "Equipe",
  operador: "Operador",
  ferramenta: "Ferramenta",
  dispositivo: "Dispositivo",
};

const SITUACAO_LABEL: Record<string, string> = {
  disponivel: "Disponível",
  em_producao: "Em produção",
  programado_manutencao: "Programado p/ manutenção",
  em_manutencao: "Em manutenção",
  parado: "Parado",
  indisponivel: "Indisponível",
  aguardando_peca: "Aguardando peça",
  aguardando_ferramenta: "Aguardando ferramenta",
  aguardando_operador: "Aguardando operador",
  bloqueado: "Bloqueado",
  outros: "Outros",
};

type Tone = "neutral" | "success" | "warning" | "danger";

const SITUACAO_TONE: Record<string, Tone> = {
  disponivel: "success",
  em_producao: "success",
  programado_manutencao: "warning",
  em_manutencao: "danger",
  parado: "danger",
  indisponivel: "danger",
  aguardando_peca: "warning",
  aguardando_ferramenta: "warning",
  aguardando_operador: "warning",
  bloqueado: "danger",
  outros: "neutral",
};

const CLASSIFICACAO_LABEL: Record<CapacidadeRecursoRow["classificacao"], string> = {
  sem_capacidade_cadastrada: "Sem capacidade cadastrada",
  sobrecarga: "Sobrecarga",
  ociosa: "Ociosa",
  normal: "Normal",
};

const CLASSIFICACAO_TONE: Record<CapacidadeRecursoRow["classificacao"], Tone> = {
  sem_capacidade_cadastrada: "neutral",
  sobrecarga: "danger",
  ociosa: "warning",
  normal: "success",
};

const SITUACOES = Object.keys(SITUACAO_LABEL);
const TIPOS = Object.keys(TIPO_LABEL);

export default function RecursosSection({
  recursos,
  capacidadePorRecurso,
  preventivasPorRecurso,
  corretivaAbertaPorRecurso,
  impactoPorRecurso,
  alternativosPorRecurso,
  gargalos,
  canManage,
}: {
  recursos: RecursoProdutivo[];
  capacidadePorRecurso: Map<string, CapacidadeRecursoRow>;
  preventivasPorRecurso: Map<string, ManutencaoPreventivaRow[]>;
  corretivaAbertaPorRecurso: Map<string, ManutencaoCorretivaRow>;
  impactoPorRecurso: Map<string, ImpactoManutencaoRow[]>;
  alternativosPorRecurso: Map<string, RecursoAlternativo[]>;
  gargalos: GargaloRow[];
  canManage: boolean;
}) {
  return (
    <section>
      {gargalos.length > 0 && (
        <Card padding="xs" className="mb-4 border-danger/30 bg-danger/5">
          <strong className="text-xs text-danger">
            Gargalos (TÓPICO 4 §37) — {gargalos.length} recurso(s) com necessidade acima da capacidade disponível
          </strong>
          <div className="mt-1.5">
            <DenseTable>
              <thead>
                <DenseTableHeaderRow>
                  <Th>Recurso</Th>
                  <Th>Tipo</Th>
                  <Th>Disponível (h)</Th>
                  <Th>Necessário (h)</Th>
                  <Th>Déficit (h)</Th>
                  <Th>Operações em risco</Th>
                </DenseTableHeaderRow>
              </thead>
              <tbody>
                {gargalos.map((g) => {
                  const impacto = impactoPorRecurso.get(g.recurso_produtivo_id) ?? [];
                  return (
                    <tr key={g.recurso_produtivo_id}>
                      <Td>
                        {g.codigo} — {g.nome}
                      </Td>
                      <Td>{TIPO_LABEL[g.tipo] ?? g.tipo}</Td>
                      <Td>{num(g.capacidade_disponivel_horas)}</Td>
                      <Td>{num(g.capacidade_necessaria_horas)}</Td>
                      <Td>{num(Math.abs(g.saldo_horas))}</Td>
                      <Td>
                        {impacto.length === 0
                          ? "—"
                          : impacto.map((i) => `${i.ordem_producao_numero} (${num(i.saldo_pendente)})`).join(", ")}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </DenseTable>
          </div>
        </Card>
      )}

      <h2 className="text-sm font-semibold text-text">Recursos produtivos e capacidade (TÓPICO 4 §31-32)</h2>
      <p className="mt-1 text-xs text-text-muted">
        Máquinas, equipamentos, linhas, postos, equipes, operadores, ferramentas e dispositivos.
        Capacidade disponível (horas/dia × 7 dias) × necessária (tempo previsto das operações
        pendentes que usam o recurso) — leitura pro PCP decidir, sem sequenciamento automático.
      </p>

      {canManage && (
        <form action={criarRecursoProdutivoAction} className="mt-3 flex flex-wrap items-center gap-1.5">
          <Input name="codigo" placeholder="Código" required className="w-24" />
          <Input name="nome" placeholder="Nome" required className="w-36" />
          <Select name="tipo" required defaultValue="" className="w-32">
            <option value="" disabled>
              Tipo...
            </option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </Select>
          <Input name="setor" placeholder="Setor (opcional)" className="w-28" />
          <Input
            name="capacidade_horas_dia"
            type="number"
            min="0"
            step="0.5"
            placeholder="h/dia (opcional)"
            className="w-28"
          />
          <Input name="localizacao" placeholder="Localização (opcional)" className="w-32" />
          <Input
            name="custo_hora"
            type="number"
            min="0"
            step="0.01"
            placeholder="R$/h (opcional, ADR-012)"
            className="w-36"
          />
          <Button type="submit" variant="primary">
            Criar recurso
          </Button>
        </form>
      )}

      <div className="mt-3">
        <DenseTable>
          <thead>
            <DenseTableHeaderRow>
              <Th>Recurso</Th>
              <Th>Tipo</Th>
              <Th>Situação</Th>
              <Th>Disponível (h)</Th>
              <Th>Necessário (h)</Th>
              <Th>Saldo</Th>
              <Th>Classificação</Th>
              {canManage && <Th />}
            </DenseTableHeaderRow>
          </thead>
          <tbody>
            {recursos.map((r) => {
              const cap = capacidadePorRecurso.get(r.id);
              return (
                <tr key={r.id} className="align-top">
                  <Td>
                    {r.codigo} — {r.nome}
                    {(r.setor || r.localizacao) && (
                      <div className="text-xs text-text-muted">{[r.setor, r.localizacao].filter(Boolean).join(" — ")}</div>
                    )}
                    <div className="mt-0.5 text-xs text-text-muted">
                      {r.custo_hora !== null ? `${currency(r.custo_hora)}/h` : "sem custo/hora cadastrado"}
                    </div>
                    {canManage && (
                      <form action={editarRecursoProdutivoAction} className="mt-1 flex flex-wrap items-center gap-1">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="nome" value={r.nome} />
                        <input type="hidden" name="setor" value={r.setor ?? ""} />
                        <input type="hidden" name="capacidade_horas_dia" value={r.capacidade_horas_dia ?? ""} />
                        <input type="hidden" name="localizacao" value={r.localizacao ?? ""} />
                        <Input
                          name="custo_hora"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="R$/h"
                          defaultValue={r.custo_hora ?? ""}
                          className="w-24 text-xs"
                        />
                        <Button type="submit" variant="secondary" size="sm">
                          Salvar custo/h
                        </Button>
                      </form>
                    )}
                  </Td>
                  <Td>{TIPO_LABEL[r.tipo] ?? r.tipo}</Td>
                  <Td>
                    <StatusPill tone={SITUACAO_TONE[r.situacao] ?? "neutral"}>{SITUACAO_LABEL[r.situacao] ?? r.situacao}</StatusPill>
                    {r.motivo_situacao && <div className="mt-0.5 text-xs text-text-muted">{r.motivo_situacao}</div>}
                    {canManage && (
                      <form action={atualizarSituacaoRecursoAction} className="mt-1 flex flex-wrap items-center gap-1">
                        <input type="hidden" name="id" value={r.id} />
                        <Select name="situacao" defaultValue={r.situacao} className="w-40 text-xs">
                          {SITUACOES.map((s) => (
                            <option key={s} value={s}>
                              {SITUACAO_LABEL[s]}
                            </option>
                          ))}
                        </Select>
                        <Input name="motivo" placeholder="motivo (opcional)" className="w-28 text-xs" />
                        <Button type="submit" variant="primary" size="sm">
                          Atualizar
                        </Button>
                      </form>
                    )}
                  </Td>
                  <Td>{cap ? num(cap.capacidade_disponivel_horas) : "—"}</Td>
                  <Td>{cap ? num(cap.capacidade_necessaria_horas) : "—"}</Td>
                  <Td>{cap ? num(cap.saldo_horas) : "—"}</Td>
                  <Td>{cap && <StatusPill tone={CLASSIFICACAO_TONE[cap.classificacao]}>{CLASSIFICACAO_LABEL[cap.classificacao]}</StatusPill>}</Td>
                  {canManage && (
                    <Td>
                      <form action={desativarRecursoProdutivoAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" variant="danger" size="sm">
                          Desativar
                        </Button>
                      </form>
                    </Td>
                  )}
                </tr>
              );
            })}
            {recursos.length === 0 && (
              <tr>
                <Td colSpan={canManage ? 8 : 7}>
                  <span className="text-text-muted">Nenhum recurso produtivo cadastrado ainda.</span>
                </Td>
              </tr>
            )}
          </tbody>
        </DenseTable>
      </div>

      <h3 className="mt-5 text-sm font-semibold text-text">Manutenção e impacto no PCP (TÓPICO 4 §33-36)</h3>
      <div className="mt-3 flex flex-col gap-3">
        {recursos.map((r) => {
          const corretiva = corretivaAbertaPorRecurso.get(r.id);
          const preventivas = preventivasPorRecurso.get(r.id) ?? [];
          const impacto = impactoPorRecurso.get(r.id) ?? [];
          const alternativos = alternativosPorRecurso.get(r.id) ?? [];

          return (
            <Card key={r.id} padding="xs">
              <strong className="text-xs text-text">
                {r.codigo} — {r.nome}
              </strong>

              <div className="mt-1.5">
                {corretiva ? (
                  <div>
                    <p className="text-xs text-danger">
                      Corretiva aberta desde {new Date(corretiva.inicio_parada).toLocaleString("pt-BR")}: {corretiva.problema}
                      {corretiva.motivo && ` (${corretiva.motivo})`}
                    </p>
                    {canManage && (
                      <form
                        action={encerrarManutencaoCorretivaAction}
                        className="mt-1 flex flex-wrap items-center gap-1"
                      >
                        <input type="hidden" name="id" value={corretiva.id} />
                        <Input name="pecas" placeholder="peças (opcional)" className="w-28 text-xs" />
                        <Input name="servicos" placeholder="serviços (opcional)" className="w-28 text-xs" />
                        <Input name="observacoes" placeholder="observações (opcional)" className="w-32 text-xs" />
                        <Button type="submit" variant="primary" size="sm">
                          Encerrar corretiva
                        </Button>
                      </form>
                    )}
                  </div>
                ) : (
                  canManage && (
                    <form action={iniciarManutencaoCorretivaAction} className="flex flex-wrap items-center gap-1">
                      <input type="hidden" name="recurso_produtivo_id" value={r.id} />
                      <Input name="problema" placeholder="problema" required className="w-36 text-xs" />
                      <Input name="motivo" placeholder="motivo (opcional)" className="w-28 text-xs" />
                      <Button type="submit" variant="danger" size="sm">
                        Iniciar corretiva
                      </Button>
                    </form>
                  )
                )}
              </div>

              <details className="mt-1.5">
                <summary className="cursor-pointer text-xs text-primary">
                  Manutenção preventiva ({preventivas.length})
                </summary>
                <div className="mt-1 overflow-x-auto">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Tipo</Th>
                        <Th>Próxima data</Th>
                        <Th>Periodicidade (dias)</Th>
                        <Th>Duração (h)</Th>
                        {canManage && <Th />}
                      </tr>
                    </thead>
                    <tbody>
                      {preventivas.map((p) => (
                        <PreventivaRow key={p.id} p={p} canManage={canManage} />
                      ))}
                      {preventivas.length === 0 && (
                        <tr>
                          <Td colSpan={canManage ? 5 : 4}>
                            <span className="text-text-muted">Nenhuma manutenção preventiva programada.</span>
                          </Td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </div>
                {canManage && (
                  <form
                    action={programarManutencaoPreventivaAction}
                    className="mt-1 flex flex-wrap items-center gap-1"
                  >
                    <input type="hidden" name="recurso_produtivo_id" value={r.id} />
                    <Input name="tipo" placeholder="tipo" required className="w-24 text-xs" />
                    <Input name="proxima_data" type="date" required className="w-32 text-xs" />
                    <Input
                      name="periodicidade_dias"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="período (dias, opc.)"
                      className="w-28 text-xs"
                    />
                    <Input
                      name="duracao_estimada_horas"
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="duração h (opc.)"
                      className="w-28 text-xs"
                    />
                    <Button type="submit" variant="primary" size="sm">
                      Programar
                    </Button>
                  </form>
                )}
              </details>

              <details className="mt-1.5">
                <summary className="cursor-pointer text-xs text-primary">
                  Análise de impacto ({impacto.length} operação(ões) pendente(s))
                </summary>
                <div className="mt-1 overflow-x-auto">
                  <Table>
                    <thead>
                      <tr>
                        <Th>OP</Th>
                        <Th>Operação</Th>
                        <Th>Saldo pendente</Th>
                        <Th>Impacto (h)</Th>
                        {canManage && <Th />}
                      </tr>
                    </thead>
                    <tbody>
                      {impacto.map((i, idx) => (
                        <tr key={idx}>
                          <Td>{i.ordem_producao_numero}</Td>
                          <Td>{i.descricao_operacao}</Td>
                          <Td>{num(i.saldo_pendente)}</Td>
                          <Td>{i.impacto_horas != null ? num(i.impacto_horas) : "—"}</Td>
                          {canManage && (
                            <Td>
                              {i.origem === "operacao" && alternativos.length > 0 && (
                                <form
                                  action={trocarRecursoOperacaoAction}
                                  className="flex flex-wrap items-center gap-1"
                                >
                                  <input type="hidden" name="op_lote_operacao_id" value={i.op_lote_operacao_id} />
                                  <Select name="novo_recurso_produtivo_id" required className="w-32 text-xs">
                                    <option value="">Trocar pra...</option>
                                    {alternativos.map((a) => (
                                      <option key={a.id} value={a.id}>
                                        {a.codigo} — {a.nome}
                                      </option>
                                    ))}
                                  </Select>
                                  <Button type="submit" variant="primary" size="sm">
                                    Trocar
                                  </Button>
                                </form>
                              )}
                            </Td>
                          )}
                        </tr>
                      ))}
                      {impacto.length === 0 && (
                        <tr>
                          <Td colSpan={canManage ? 5 : 4}>
                            <span className="text-text-muted">Nenhuma operação pendente usando este recurso.</span>
                          </Td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </div>
              </details>
            </Card>
          );
        })}
        {recursos.length === 0 && <p className="text-xs text-text-muted">Nenhum recurso produtivo cadastrado ainda.</p>}
      </div>
    </section>
  );
}

// Linha da preventiva com edição no lugar. Antes só havia "Cancelar":
// mudar a data de uma manutenção obrigava a cancelar e reprogramar, o que
// descarta a original em vez de corrigi-la. O tipo não é editável porque
// a função do banco não o aceita — trocar o tipo continua sendo cancelar
// e programar outra.
function PreventivaRow({ p, canManage }: { p: ManutencaoPreventivaRow; canManage: boolean }) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <tr>
        <Td>{p.tipo}</Td>
        <Td colSpan={canManage ? 4 : 3}>
          <form
            action={editarManutencaoPreventivaAction}
            onSubmit={() => setEditando(false)}
            className="flex flex-wrap items-center gap-1"
          >
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="responsavel_id" value={p.responsavel_id ?? ""} />
            <Input
              name="proxima_data"
              type="date"
              defaultValue={p.proxima_data.slice(0, 10)}
              required
              className="w-32 text-xs"
            />
            <Input
              name="periodicidade_dias"
              type="number"
              min="1"
              step="1"
              defaultValue={p.periodicidade_dias ?? ""}
              placeholder="período (dias, opc.)"
              className="w-28 text-xs"
            />
            <Input
              name="duracao_estimada_horas"
              type="number"
              min="0"
              step="0.5"
              defaultValue={p.duracao_estimada_horas ?? ""}
              placeholder="duração h (opc.)"
              className="w-28 text-xs"
            />
            <Button type="submit" variant="primary" size="sm">
              Salvar
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(false)}>
              Cancelar edição
            </Button>
          </form>
        </Td>
      </tr>
    );
  }

  return (
    <tr>
      <Td>{p.tipo}</Td>
      <Td>{formatarData(p.proxima_data)}</Td>
      <Td>{p.periodicidade_dias ?? "—"}</Td>
      <Td>{p.duracao_estimada_horas ?? "—"}</Td>
      {canManage && (
        <Td>
          <div className="flex items-center gap-1">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(true)}>
              Editar
            </Button>
            <form action={cancelarManutencaoPreventivaAction}>
              <input type="hidden" name="id" value={p.id} />
              <Button type="submit" variant="danger" size="sm">
                Cancelar
              </Button>
            </form>
          </div>
        </Td>
      )}
    </tr>
  );
}
