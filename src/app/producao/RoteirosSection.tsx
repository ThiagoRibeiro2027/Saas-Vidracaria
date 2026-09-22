"use client";

import {
  criarRoteiroProdutivoAction,
  adicionarOperacaoRoteiroAction,
  removerOperacaoRoteiroAction,
  desativarRoteiroAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

type Item = { id: string; codigo: string; descricao: string; tipo: string };
type Roteiro = { id: string; item_id: string; nome: string; ativo: boolean };
type RoteiroOperacao = {
  id: string;
  roteiro_id: string;
  sequencia: number;
  descricao: string;
  recurso_produtivo_id: string | null;
  tempo_previsto_minutos: number | null;
  requisitos: string | null;
  criterios_qualidade: string | null;
  equipamentos_alternativos: string | null;
  perfil: string | null;
  ferramenta: string | null;
  processo: string | null;
};
type RecursoProdutivo = { id: string; codigo: string; nome: string };

export default function RoteirosSection({
  itens,
  roteiros,
  operacoesPorRoteiro,
  recursos,
  canManage,
}: {
  itens: Item[];
  roteiros: Roteiro[];
  operacoesPorRoteiro: Map<string, RoteiroOperacao[]>;
  recursos: RecursoProdutivo[];
  canManage: boolean;
}) {
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };
  const recursoLabel = (id: string | null) => {
    if (!id) return "—";
    const r = recursos.find((rr) => rr.id === id);
    return r ? `${r.codigo} — ${r.nome}` : "(recurso removido)";
  };

  const roteirosPorItem = new Map<string, Roteiro[]>();
  for (const r of roteiros) {
    const list = roteirosPorItem.get(r.item_id) ?? [];
    list.push(r);
    roteirosPorItem.set(r.item_id, list);
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Roteiros produtivos (TÓPICO 4 §15)</h2>
      <p className="mt-1 text-xs text-text-muted">
        Sequência de operações (Corte → Usinagem → Montagem → Inspeção, por exemplo) que toda nova
        ordem de produção desse item vai seguir. Item sem roteiro ativo gera OP com uma única
        operação genérica &quot;Produção&quot; — configurar um roteiro aqui é opcional. Perfil/
        ferramenta/processo (opcionais) são usados pelo Sequenciamento (§6) pra detectar setup
        compartilhado entre operações pendentes do mesmo recurso.
      </p>

      {canManage && (
        <form action={criarRoteiroProdutivoAction} className="mt-3 flex flex-wrap items-center gap-1.5">
          <Select name="item_id" required className="w-64">
            <option value="">Selecione o item...</option>
            {itens.map((it) => (
              <option key={it.id} value={it.id}>
                {it.codigo} — {it.descricao}
              </option>
            ))}
          </Select>
          <Input name="nome" placeholder="Nome do roteiro" required className="w-44" />
          <Button type="submit" variant="primary">
            Criar roteiro
          </Button>
        </form>
      )}

      <div className="mt-4 flex flex-col gap-4">
        {[...roteirosPorItem.entries()].map(([itemId, rs]) => (
          <Card key={itemId} padding="xs">
            <strong className="text-sm text-text">{itemLabel(itemId)}</strong>
            {rs.map((r) => {
              const operacoes = (operacoesPorRoteiro.get(r.id) ?? []).slice().sort((a, b) => a.sequencia - b.sequencia);
              return (
                <div key={r.id} className={`mt-2 ${r.ativo ? "" : "opacity-55"}`}>
                  <div className="flex items-baseline gap-2 text-xs">
                    <span>{r.nome}</span>
                    <Badge variant={r.ativo ? "success" : "neutral"}>{r.ativo ? "Ativo" : "Inativo"}</Badge>
                    {canManage && r.ativo && (
                      <form action={desativarRoteiroAction}>
                        <input type="hidden" name="roteiro_id" value={r.id} />
                        <Button type="submit" variant="danger" size="sm">
                          Desativar
                        </Button>
                      </form>
                    )}
                  </div>

                  <div className="mt-1.5 overflow-x-auto">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Seq.</Th>
                          <Th>Operação</Th>
                          <Th>Recurso</Th>
                          <Th>Tempo prev. (min)</Th>
                          <Th>Setup (perfil/ferramenta/processo)</Th>
                          {canManage && <Th />}
                        </tr>
                      </thead>
                      <tbody>
                        {operacoes.map((op) => (
                          <tr key={op.id}>
                            <Td>{op.sequencia}</Td>
                            <Td>{op.descricao}</Td>
                            <Td>{recursoLabel(op.recurso_produtivo_id)}</Td>
                            <Td>{op.tempo_previsto_minutos ?? "—"}</Td>
                            <Td>
                              {op.perfil || op.ferramenta || op.processo
                                ? [op.perfil, op.ferramenta, op.processo].filter(Boolean).join(" / ")
                                : "—"}
                            </Td>
                            {canManage && (
                              <Td>
                                <form action={removerOperacaoRoteiroAction}>
                                  <input type="hidden" name="roteiro_operacao_id" value={op.id} />
                                  <Button type="submit" variant="danger" size="sm">
                                    Remover
                                  </Button>
                                </form>
                              </Td>
                            )}
                          </tr>
                        ))}
                        {operacoes.length === 0 && (
                          <tr>
                            <Td colSpan={canManage ? 6 : 5}>
                              <span className="text-text-muted">Roteiro sem operações ainda.</span>
                            </Td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>

                  {canManage && r.ativo && (
                    <form
                      action={adicionarOperacaoRoteiroAction}
                      className="mt-1.5 flex flex-wrap items-center gap-1.5"
                    >
                      <input type="hidden" name="roteiro_id" value={r.id} />
                      <Input name="sequencia" type="number" min="1" step="1" placeholder="seq." required className="w-14" />
                      <Input name="descricao" placeholder="descrição" required className="w-32" />
                      <Select name="recurso_produtivo_id" defaultValue="" className="w-40">
                        <option value="">Recurso (opcional)</option>
                        {recursos.map((rec) => (
                          <option key={rec.id} value={rec.id}>
                            {rec.codigo} — {rec.nome}
                          </option>
                        ))}
                      </Select>
                      <Input
                        name="tempo_previsto_minutos"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="min (opcional)"
                        className="w-24"
                      />
                      <Input name="perfil" placeholder="perfil (opcional)" className="w-28" />
                      <Input name="ferramenta" placeholder="ferramenta (opcional)" className="w-28" />
                      <Input name="processo" placeholder="processo (opcional)" className="w-28" />
                      <Button type="submit" variant="primary">
                        Adicionar operação
                      </Button>
                    </form>
                  )}
                </div>
              );
            })}
          </Card>
        ))}
        {roteirosPorItem.size === 0 && <p className="text-xs text-text-muted">Nenhum roteiro configurado ainda.</p>}
      </div>
    </section>
  );
}
