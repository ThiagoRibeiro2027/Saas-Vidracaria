"use client";

import { useActionState } from "react";
import {
  definirPesoSequenciamentoAction,
  decidirSequenciamentoAction,
  simularAlteracaoProgramacaoAction,
  type SimulacaoState,
} from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { formatarData } from "@/lib/formato/data";

export type RecomendacaoRow = {
  op_lote_operacao_id: string;
  ordem_producao_id: string;
  ordem_producao_numero: string;
  descricao_operacao: string;
  prioridade: number;
  previsao_entrega: string | null;
  dias_para_prazo: number | null;
  perfil: string | null;
  ferramenta: string | null;
  processo: string | null;
  setup_compartilhado_count: number;
  posicao_atual: number;
  posicao_recomendada: number;
  classificacao: "risco" | "oportunidade" | "recomendado";
  explicacao: string;
};

type Peso = { criterio: "prazo" | "prioridade" | "setup_compartilhado"; peso: number };
type RecursoProdutivo = { id: string; codigo: string; nome: string };

type CapacidadeResumo = {
  recurso_produtivo_id: string;
  capacidade_disponivel_horas: number;
  capacidade_necessaria_horas_antes: number;
  capacidade_necessaria_horas_depois: number;
  classificacao_antes: string;
  classificacao_depois: string;
  operacao_antes?: RecomendacaoRow | null;
  operacao_depois?: RecomendacaoRow | null;
  outras_operacoes_afetadas: {
    ordem_producao_numero: string;
    descricao_operacao: string;
    classificacao_antes: string;
    classificacao_depois: string;
    posicao_antes: number;
    posicao_depois: number;
  }[];
};
type SimulacaoResultado = { recurso_atual: CapacidadeResumo; recurso_novo: CapacidadeResumo | null };

const CLASSIFICACAO_LABEL: Record<RecomendacaoRow["classificacao"], string> = {
  risco: "🔴 Risco",
  oportunidade: "🟡 Oportunidade",
  recomendado: "🟢 Recomendado",
};

const CLASSIFICACAO_TONE: Record<RecomendacaoRow["classificacao"], "danger" | "warning" | "success"> = {
  risco: "danger",
  oportunidade: "warning",
  recomendado: "success",
};

const CRITERIO_LABEL: Record<Peso["criterio"], string> = {
  prazo: "Prazo",
  prioridade: "Prioridade",
  setup_compartilhado: "Setup compartilhado",
};

const CRITERIOS: Peso["criterio"][] = ["prazo", "prioridade", "setup_compartilhado"];

const DECISOES: { value: string; label: string }[] = [
  { value: "aceitar", label: "Aceitar" },
  { value: "modificar", label: "Modificar" },
  { value: "manual", label: "Definir manualmente" },
  { value: "rejeitar", label: "Rejeitar" },
  { value: "ignorar", label: "Ignorar" },
];

function num(v: number) {
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function ResumoRecurso({ titulo, resumo }: { titulo: string; resumo: CapacidadeResumo }) {
  return (
    <div className="mt-1">
      <strong>{titulo}</strong>: {num(resumo.capacidade_necessaria_horas_antes)}h → {num(resumo.capacidade_necessaria_horas_depois)}h
      necessárias de {num(resumo.capacidade_disponivel_horas)}h disponíveis ({resumo.classificacao_antes} → {resumo.classificacao_depois})
      {resumo.operacao_depois && (
        <div>
          Operação simulada: {CLASSIFICACAO_LABEL[resumo.operacao_depois.classificacao]}, posição {resumo.operacao_depois.posicao_recomendada}ª —{" "}
          {resumo.operacao_depois.explicacao}
        </div>
      )}
      {resumo.outras_operacoes_afetadas.length > 0 && (
        <div>
          Outras operações afetadas:{" "}
          {resumo.outras_operacoes_afetadas
            .map((o) => `${o.ordem_producao_numero} (${o.classificacao_antes}→${o.classificacao_depois}, ${o.posicao_antes}ª→${o.posicao_depois}ª)`)
            .join("; ")}
        </div>
      )}
    </div>
  );
}

function SimulacaoForm({ opLoteOperacaoId, recursosOpcoes }: { opLoteOperacaoId: string; recursosOpcoes: RecursoProdutivo[] }) {
  const [state, formAction, pending] = useActionState<SimulacaoState, FormData>(simularAlteracaoProgramacaoAction, undefined);
  const resultado = state?.data as SimulacaoResultado | undefined;

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-center gap-1">
        <input type="hidden" name="op_lote_operacao_id" value={opLoteOperacaoId} />
        <span className="text-primary">Simular:</span>
        <Select name="novo_recurso_produtivo_id" defaultValue="" className="w-28 text-xs">
          <option value="">recurso (opcional)</option>
          {recursosOpcoes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.codigo}
            </option>
          ))}
        </Select>
        <Input name="nova_data_planejada_inicio" type="date" className="w-32 text-xs" />
        <Input name="nova_data_planejada_fim" type="date" className="w-32 text-xs" />
        <Select name="nova_prioridade" defaultValue="" className="w-24 text-xs">
          <option value="">prioridade (opc.)</option>
          {[1, 2, 3, 4, 5].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Simulando..." : "Simular"}
        </Button>
      </form>
      {state?.error && <p className="mt-1 text-danger">{state.error}</p>}
      {resultado && (
        <div className="mt-1 rounded-md border border-dashed border-border p-1.5 text-text">
          <em>Não altera a programação real — só pré-visualização.</em>
          <ResumoRecurso titulo="Recurso atual" resumo={resultado.recurso_atual} />
          {resultado.recurso_novo && <ResumoRecurso titulo="Recurso novo" resumo={resultado.recurso_novo} />}
        </div>
      )}
    </div>
  );
}

function OperacaoRecomendadaRow({
  l,
  recursosOpcoes,
  canManage,
}: {
  l: RecomendacaoRow;
  recursosOpcoes: RecursoProdutivo[];
  canManage: boolean;
}) {
  return (
    <>
      <tr className="align-top">
        <Td>
          {l.ordem_producao_numero}
          <div className="text-text-muted">{l.descricao_operacao}</div>
        </Td>
        <Td>
          {formatarData(l.previsao_entrega)}
          {l.dias_para_prazo != null && l.dias_para_prazo < 0 && (
            <div className="text-danger">{Math.abs(l.dias_para_prazo)}d atrasada</div>
          )}
        </Td>
        <Td>{l.prioridade}</Td>
        <Td>
          {l.perfil || l.ferramenta || l.processo ? [l.perfil, l.ferramenta, l.processo].filter(Boolean).join(" / ") : "—"}
          {l.setup_compartilhado_count > 0 && <div className="text-text-muted">compartilha com {l.setup_compartilhado_count}</div>}
        </Td>
        <Td>
          {l.posicao_atual}ª → {l.posicao_recomendada}ª
        </Td>
        <Td>
          <Badge variant={CLASSIFICACAO_TONE[l.classificacao]}>{CLASSIFICACAO_LABEL[l.classificacao]}</Badge>
        </Td>
        <Td>{l.explicacao}</Td>
      </tr>
      {canManage && (
        <tr>
          <Td colSpan={7} className="bg-page-bg">
            <form
              action={decidirSequenciamentoAction}
              className="mb-1 flex flex-wrap items-center gap-1"
            >
              <input type="hidden" name="op_lote_operacao_id" value={l.op_lote_operacao_id} />
              <span className="text-primary">Decisão (§7):</span>
              <Select name="decisao" required defaultValue="" className="w-40 text-xs">
                <option value="" disabled>
                  escolha...
                </option>
                {DECISOES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
              <Select name="novo_recurso_produtivo_id" defaultValue="" className="w-28 text-xs">
                <option value="">recurso (se mudar)</option>
                {recursosOpcoes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo}
                  </option>
                ))}
              </Select>
              <Input name="nova_data_planejada_inicio" type="date" className="w-32 text-xs" />
              <Input name="nova_data_planejada_fim" type="date" className="w-32 text-xs" />
              <Select name="nova_prioridade" defaultValue="" className="w-24 text-xs">
                <option value="">prioridade (opc.)</option>
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              <Input name="motivo" placeholder="motivo (opcional)" className="w-36 text-xs" />
              <Button type="submit" variant="primary" size="sm">
                Registrar decisão
              </Button>
            </form>
            <SimulacaoForm opLoteOperacaoId={l.op_lote_operacao_id} recursosOpcoes={recursosOpcoes} />
          </Td>
        </tr>
      )}
    </>
  );
}

export default function SequenciamentoSection({
  recursos,
  recomendacaoPorRecurso,
  pesos,
  recursosEmGargalo,
  canManage,
}: {
  recursos: RecursoProdutivo[];
  recomendacaoPorRecurso: Map<string, RecomendacaoRow[]>;
  pesos: Peso[];
  recursosEmGargalo: Set<string>;
  canManage: boolean;
}) {
  const pesoPorCriterio = new Map(pesos.map((p) => [p.criterio, p.peso] as const));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Sequenciamento inteligente (TÓPICO 4 §6-8)</h2>
      <p className="mt-1 text-xs text-text-muted">
        Recomendação de ordem por recurso, baseada em regras e pesos configuráveis (prazo,
        prioridade e setup compartilhado) — não é IA autônoma nem otimização automática. O sistema
        recomenda e simula; a decisão de aceitar, rejeitar, modificar ou ignorar continua com o
        usuário autorizado (§7). Simular (§8) nunca altera a programação real — só pré-visualização,
        até o usuário confirmar registrando uma decisão.
      </p>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {CRITERIOS.map((c) => (
            <form key={c} action={definirPesoSequenciamentoAction} className="flex items-center gap-1">
              <input type="hidden" name="criterio" value={c} />
              <label className="text-xs text-text">{CRITERIO_LABEL[c]}</label>
              <Input
                name="peso"
                type="number"
                min="0"
                step="0.5"
                defaultValue={pesoPorCriterio.get(c) ?? 1}
                className="w-16 text-xs"
              />
              <Button type="submit" variant="primary" size="sm">
                Salvar
              </Button>
            </form>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {recursos.map((r) => {
          const linhas = recomendacaoPorRecurso.get(r.id) ?? [];
          const recursosOpcoes = recursos.filter((rr) => rr.id !== r.id);
          return (
            <details key={r.id} className="rounded-md border border-border p-2">
              <summary className="cursor-pointer text-xs text-text">
                <strong>
                  {r.codigo} — {r.nome}
                </strong>{" "}
                ({linhas.length} operação(ões) pendente(s))
                {recursosEmGargalo.has(r.id) && (
                  <span className="ml-1.5 text-danger">⚠ recurso em gargalo (ver painel Gargalos acima)</span>
                )}
              </summary>

              <div className="mt-1.5 overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>OP / operação</Th>
                      <Th>Prazo</Th>
                      <Th>Prioridade</Th>
                      <Th>Setup</Th>
                      <Th>Posição atual → recomendada</Th>
                      <Th>Classificação</Th>
                      <Th>Explicação</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <OperacaoRecomendadaRow key={l.op_lote_operacao_id} l={l} recursosOpcoes={recursosOpcoes} canManage={canManage} />
                    ))}
                    {linhas.length === 0 && (
                      <tr>
                        <Td colSpan={7}>
                          <span className="text-text-muted">Nenhuma operação pendente usando este recurso.</span>
                        </Td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>
            </details>
          );
        })}
        {recursos.length === 0 && <p className="text-xs text-text-muted">Nenhum recurso produtivo cadastrado ainda.</p>}
      </div>
    </section>
  );
}
