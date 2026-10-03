"use client";

import { Fragment, useState } from "react";
import {
  criarPecaAction,
  inativarPecaAction,
  reativarPecaAction,
  adicionarMaterialPecaAction,
  atualizarMaterialPecaAction,
  removerMaterialPecaAction,
  definirCaracteristicaPecaAction,
  atualizarCaracteristicaPecaAction,
  removerCaracteristicaPecaAction,
  definirPapelDimensionalAction,
  definirTipoCalculoComposicaoAction,
  definirComprimentoBarraAction,
  removerComprimentoBarraAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import RegrasPeca from "./RegrasPeca";

type Item = { id: string; codigo: string; descricao: string; tipo: string; unidade_principal: string };
type Peca = { id: string; item_id: string; descricao_tecnica: string | null; situacao: "ativo" | "inativo"; revisao_atual: number };
type PecaComposicao = {
  id: string;
  peca_id: string;
  material_item_id: string;
  quantidade_por_unidade: number;
  observacao: string | null;
  tipo_calculo: "fixo" | "linear" | "area";
  percentual_perda: number;
};
type Revisao = { revisao: number; motivo: string | null; created_at: string };
type Caracteristica = { id: string; nome: string; tipo: string; unidade: string | null; opcoes: string[] | null; obrigatoria: boolean; papel_dimensional: "largura" | "altura" | null };

const TIPO_CALCULO_LABEL: Record<PecaComposicao["tipo_calculo"], string> = {
  fixo: "Fixo",
  linear: "Linear (perímetro)",
  area: "Área",
};
type ComprimentoBarra = { id: string; item_id: string; comprimento_metros: number };
type Regra = {
  id: string;
  versao: number;
  substitui_regra_id: string | null;
  caracteristica_id: string;
  caracteristica_nome: string;
  operador: string;
  valor_comparacao_numero: number | null;
  valor_comparacao_texto: string | null;
  acao: string;
  acao_material_item_id: string;
  acao_material_codigo: string;
  acao_quantidade: number | null;
  ativo: boolean;
  motivo: string | null;
  created_at: string;
};

const CARACTERISTICA_TIPOS = [
  ["numero", "Número"],
  ["texto", "Texto"],
  ["opcao", "Opção (lista)"],
] as const;

const PECA_TIPOS = ["componente", "produto_acabado"];
const MATERIAL_TIPOS = ["materia_prima", "insumo", "material_auxiliar"];

const fmtData = (v: string) => new Date(v).toLocaleString("pt-BR");

export default function PecasSection({
  pecas,
  composicao,
  itens,
  revisoesPorPeca,
  caracteristicasPorPeca,
  regrasPorPeca,
  comprimentosPorComposicao,
  canManage,
}: {
  pecas: Peca[];
  composicao: PecaComposicao[];
  itens: Item[];
  revisoesPorPeca: Map<string, Revisao[]>;
  caracteristicasPorPeca: Map<string, Caracteristica[]>;
  regrasPorPeca: Map<string, Regra[]>;
  comprimentosPorComposicao: Map<string, ComprimentoBarra[]>;
  canManage: boolean;
}) {
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  const pecaPorItemId = new Map(pecas.map((p) => [p.item_id, p]));
  const itensDisponiveisParaPeca = itens.filter((i) => PECA_TIPOS.includes(i.tipo) && !pecaPorItemId.has(i.id));
  const itensMateriais = itens.filter((i) => MATERIAL_TIPOS.includes(i.tipo));

  const composicaoPorPeca = new Map<string, PecaComposicao[]>();
  for (const c of composicao) {
    const list = composicaoPorPeca.get(c.peca_id) ?? [];
    list.push(c);
    composicaoPorPeca.set(c.peca_id, list);
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Peças e composição de materiais</h2>
      <p className="mt-1 text-xs text-text-muted">
        Uma peça é um item do catálogo (tipo componente ou produto acabado); a composição é a lista
        de perfis/vidro/acessórios/insumos — ou de outra peça já cadastrada, como subconjunto — e a
        quantidade necessária por 1 unidade da peça. Toda mudança na composição gera uma revisão
        nova (histórico abaixo, nada é sobrescrito).
      </p>

      {canManage && (
        <form action={criarPecaAction} className="mt-3 flex flex-wrap items-center gap-1.5">
          <Select name="item_id" required className="w-64">
            <option value="">Selecione o item (componente/produto acabado)...</option>
            {itensDisponiveisParaPeca.map((it) => (
              <option key={it.id} value={it.id}>
                {it.codigo} — {it.descricao}
              </option>
            ))}
          </Select>
          <Input name="descricao_tecnica" placeholder="descrição técnica (opcional)" className="w-56" />
          <Button type="submit" variant="primary">
            Cadastrar peça
          </Button>
        </form>
      )}

      <div className="mt-4 flex flex-col gap-4">
        {pecas.map((p) => {
          const linhas = composicaoPorPeca.get(p.id) ?? [];
          // Subconjunto não pode ser a própria peça (o backend trava ciclo
          // indireto também — isso aqui é só conveniência de UI).
          const pecasComoSubconjunto = pecas.filter((sp) => sp.situacao === "ativo" && sp.id !== p.id);
          return (
            <Card key={p.id} padding="xs" className={p.situacao === "ativo" ? "" : "opacity-55"}>
              <div className="flex items-baseline gap-2 text-sm">
                <strong className="text-text">{itemLabel(p.item_id)}</strong>
                <Badge variant={p.situacao === "ativo" ? "success" : "neutral"}>
                  {p.situacao === "ativo" ? "Ativa" : "Inativa"}
                </Badge>
                <span className="text-xs text-text-muted">rev. {p.revisao_atual}</span>
                {canManage && (
                  <form action={p.situacao === "ativo" ? inativarPecaAction : reativarPecaAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" variant={p.situacao === "ativo" ? "danger" : "primary"} size="sm">
                      {p.situacao === "ativo" ? "Inativar" : "Reativar"}
                    </Button>
                  </form>
                )}
              </div>
              {p.descricao_tecnica && <p className="mt-1 text-xs text-text-muted">{p.descricao_tecnica}</p>}

              <div className="mt-1.5 overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Material</Th>
                      <Th>Qtd. por unidade</Th>
                      <Th>Observação</Th>
                      <Th>Cálculo (ADR-012)</Th>
                      {canManage && <Th />}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((c) => {
                      const ehPeca = pecaPorItemId.has(c.material_item_id);
                      return (
                        <Fragment key={c.id}>
                        <tr>
                          <Td>
                            {itemLabel(c.material_item_id)}
                            {ehPeca && <span className="ml-1.5 font-mono text-[10px] text-primary">subconjunto</span>}
                          </Td>
                          <Td>
                            {canManage ? (
                              <form action={atualizarMaterialPecaAction} className="flex items-center gap-1">
                                <input type="hidden" name="id" value={c.id} />
                                <input type="hidden" name="observacao" value={c.observacao ?? ""} />
                                <Input
                                  name="quantidade_por_unidade"
                                  type="number"
                                  min="0.0001"
                                  step="0.0001"
                                  defaultValue={c.quantidade_por_unidade}
                                  className="w-24"
                                />
                                <Button type="submit" variant="primary" size="sm">
                                  Salvar
                                </Button>
                              </form>
                            ) : (
                              c.quantidade_por_unidade
                            )}
                          </Td>
                          <Td>{c.observacao ?? "—"}</Td>
                          <Td>
                            {canManage ? (
                              <TipoCalculoComposicao composicao={c} />
                            ) : (
                              `${TIPO_CALCULO_LABEL[c.tipo_calculo]}${c.tipo_calculo !== "fixo" ? ` (perda ${c.percentual_perda}%)` : ""}`
                            )}
                          </Td>
                          {canManage && (
                            <Td>
                              <form action={removerMaterialPecaAction}>
                                <input type="hidden" name="id" value={c.id} />
                                <Button type="submit" variant="danger" size="sm">
                                  Remover
                                </Button>
                              </form>
                            </Td>
                          )}
                        </tr>
                        {c.tipo_calculo === "linear" && (
                          <tr>
                            <Td colSpan={canManage ? 5 : 4}>
                              <ComprimentosBarraComposicao
                                composicaoId={c.id}
                                comprimentos={comprimentosPorComposicao.get(c.id) ?? []}
                                itens={itens}
                                itemLabel={itemLabel}
                                canManage={canManage}
                              />
                            </Td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                    {linhas.length === 0 && (
                      <tr>
                        <Td colSpan={canManage ? 5 : 4} className="text-text-muted">
                          Peça sem materiais na composição ainda.
                        </Td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>

              {canManage && p.situacao === "ativo" && (
                <form action={adicionarMaterialPecaAction} className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <input type="hidden" name="peca_id" value={p.id} />
                  <Select name="material_item_id" required className="w-64">
                    <option value="">Selecione o material ou subconjunto...</option>
                    <optgroup label="Matéria-prima / insumo / material auxiliar">
                      {itensMateriais.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.codigo} — {it.descricao} ({it.unidade_principal})
                        </option>
                      ))}
                    </optgroup>
                    {pecasComoSubconjunto.length > 0 && (
                      <optgroup label="Outra peça (subconjunto)">
                        {pecasComoSubconjunto.map((sp) => (
                          <option key={sp.item_id} value={sp.item_id}>
                            {itemLabel(sp.item_id)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                  <Input
                    name="quantidade_por_unidade"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    placeholder="qtd. por unidade"
                    required
                    className="w-28"
                  />
                  <Input name="observacao" placeholder="observação (opcional)" className="w-40" />
                  <Button type="submit" variant="primary">
                    Adicionar
                  </Button>
                </form>
              )}

              <CaracteristicasPeca pecaId={p.id} caracteristicas={caracteristicasPorPeca.get(p.id) ?? []} canManage={canManage && p.situacao === "ativo"} />

              {canManage && p.situacao === "ativo" && (
                <RegrasPeca
                  pecaId={p.id}
                  caracteristicas={caracteristicasPorPeca.get(p.id) ?? []}
                  regras={regrasPorPeca.get(p.id) ?? []}
                  materiais={[
                    ...itensMateriais.map((it) => ({ id: it.id, label: itemLabel(it.id) })),
                    ...pecasComoSubconjunto.map((sp) => ({ id: sp.item_id, label: itemLabel(sp.item_id) })),
                  ]}
                />
              )}

              <HistoricoRevisoes revisoes={revisoesPorPeca.get(p.id) ?? []} />
            </Card>
          );
        })}
        {pecas.length === 0 && <p className="text-xs text-text-muted">Nenhuma peça cadastrada ainda.</p>}
      </div>
    </section>
  );
}

function ComprimentosBarraComposicao({
  composicaoId,
  comprimentos,
  itens,
  itemLabel,
  canManage,
}: {
  composicaoId: string;
  comprimentos: ComprimentoBarra[];
  itens: Item[];
  itemLabel: (id: string) => string;
  canManage: boolean;
}) {
  const itensMateriais = itens.filter((i) => MATERIAL_TIPOS.includes(i.tipo));
  const itensJaUsados = new Set(comprimentos.map((c) => c.item_id));

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-text">
      <span className="font-semibold">Comprimentos de barra (ADR-012 Fase 2):</span>
      {comprimentos.length === 0 && <span className="text-text-muted">nenhum — custo por metro corrido, sem arredondar em barra</span>}
      {comprimentos.map((c) => (
        <span key={c.id} className="flex items-center gap-1">
          {itemLabel(c.item_id)} ({c.comprimento_metros}m)
          {canManage && (
            <form action={removerComprimentoBarraAction}>
              <input type="hidden" name="id" value={c.id} />
              <Button type="submit" variant="danger" size="sm">
                x
              </Button>
            </form>
          )}
        </span>
      ))}
      {canManage && (
        <form action={definirComprimentoBarraAction} className="flex items-center gap-1">
          <input type="hidden" name="composicao_id" value={composicaoId} />
          <Select name="item_id" required className="w-40 text-[11px]">
            <option value="">item da barra...</option>
            {itensMateriais
              .filter((it) => !itensJaUsados.has(it.id))
              .map((it) => (
                <option key={it.id} value={it.id}>
                  {it.codigo} — {it.descricao}
                </option>
              ))}
          </Select>
          <Input name="comprimento_metros" type="number" min="0.001" step="0.001" placeholder="metros" className="w-16 text-[11px]" />
          <Button type="submit" variant="primary" size="sm">
            Adicionar
          </Button>
        </form>
      )}
    </div>
  );
}

function TipoCalculoComposicao({ composicao }: { composicao: PecaComposicao }) {
  const [tipo, setTipo] = useState<PecaComposicao["tipo_calculo"]>(composicao.tipo_calculo);

  return (
    <form action={definirTipoCalculoComposicaoAction} className="flex items-center gap-1">
      <input type="hidden" name="composicao_id" value={composicao.id} />
      <Select
        name="tipo_calculo"
        value={tipo}
        onChange={(e) => setTipo(e.target.value as PecaComposicao["tipo_calculo"])}
        className="w-36"
      >
        {(Object.keys(TIPO_CALCULO_LABEL) as PecaComposicao["tipo_calculo"][]).map((v) => (
          <option key={v} value={v}>
            {TIPO_CALCULO_LABEL[v]}
          </option>
        ))}
      </Select>
      {tipo !== "fixo" && (
        <Input
          name="percentual_perda"
          type="number"
          min="0"
          step="0.01"
          placeholder="% perda"
          defaultValue={composicao.tipo_calculo !== "fixo" ? composicao.percentual_perda : 0}
          className="w-20"
        />
      )}
      <Button type="submit" variant="primary" size="sm">
        Salvar
      </Button>
    </form>
  );
}

function CaracteristicasPeca({
  pecaId,
  caracteristicas,
  canManage,
}: {
  pecaId: string;
  caracteristicas: Caracteristica[];
  canManage: boolean;
}) {
  const [tipoNovo, setTipoNovo] = useState<string>("numero");

  return (
    <div className="mt-2.5 border-t border-border-subtle pt-2">
      <p className="mb-1 text-xs font-semibold text-text">Características (configurador)</p>
      {caracteristicas.length === 0 ? (
        <p className="text-xs text-text-muted">Nenhuma característica configurada — a peça não tem configurador ainda.</p>
      ) : (
        <ul className="mb-1.5 flex flex-col gap-1 pl-4 text-xs text-text-muted">
          {caracteristicas.map((c) => (
            <CaracteristicaItem key={c.id} c={c} canManage={canManage} />
          ))}
        </ul>
      )}

      {canManage && (
        <form action={definirCaracteristicaPecaAction} className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="peca_id" value={pecaId} />
          <Input name="nome" placeholder="nome (ex.: largura)" required className="w-32" />
          <Select name="tipo" value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value)} className="w-32">
            {CARACTERISTICA_TIPOS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input name="unidade" placeholder="unidade (opcional)" className="w-24" />
          {tipoNovo === "opcao" && (
            <Input name="opcoes" placeholder="opções, separadas por vírgula" required className="w-44" />
          )}
          <label className="flex items-center gap-1 text-xs text-text">
            <input type="checkbox" name="obrigatoria" defaultChecked className="accent-primary" />
            obrigatória
          </label>
          <Button type="submit" variant="primary" size="sm">
            Adicionar característica
          </Button>
        </form>
      )}
    </div>
  );
}

// Editar era o buraco: a tela só tinha "Remover", então corrigir a unidade
// ou acrescentar uma opção obrigava a apagar e recadastrar — e remover é
// bloqueado assim que existe valor informado em algum pedido, o que
// deixava a característica sem conserto. Nome e tipo continuam imutáveis
// (a função do banco não os aceita): valores já gravados em orçamento e
// pedido foram registrados sob aquele tipo.
function CaracteristicaItem({ c, canManage }: { c: Caracteristica; canManage: boolean }) {
  const [editando, setEditando] = useState(false);
  const tipoLabel = CARACTERISTICA_TIPOS.find(([v]) => v === c.tipo)?.[1] ?? c.tipo;

  if (editando) {
    return (
      <li className="flex flex-wrap items-center gap-1.5">
        <form
          action={atualizarCaracteristicaPecaAction}
          onSubmit={() => setEditando(false)}
          className="flex flex-wrap items-center gap-1.5"
        >
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="tipo" value={c.tipo} />
          <span className="font-semibold text-text">{c.nome}</span>
          <span className="text-[10px] text-text-muted">({tipoLabel} — nome e tipo não mudam)</span>
          <Input name="unidade" defaultValue={c.unidade ?? ""} placeholder="unidade (opcional)" className="w-24" />
          {c.tipo === "opcao" && (
            <Input name="opcoes" defaultValue={c.opcoes?.join(", ") ?? ""} placeholder="opções, separadas por vírgula" required className="w-44" />
          )}
          <label className="flex items-center gap-1 text-xs text-text">
            <input type="checkbox" name="obrigatoria" defaultChecked={c.obrigatoria} className="accent-primary" />
            obrigatória
          </label>
          <Button type="submit" variant="primary" size="sm">
            Salvar
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1.5">
      <span>
        {c.nome} ({tipoLabel}
        {c.unidade ? `, ${c.unidade}` : ""}
        {c.opcoes ? `: ${c.opcoes.join(", ")}` : ""}
        {c.obrigatoria ? ", obrigatória" : ""})
      </span>
      {c.tipo === "numero" && (canManage ? (
        <form action={definirPapelDimensionalAction} className="flex items-center">
          <input type="hidden" name="caracteristica_id" value={c.id} />
          <Select
            name="papel_dimensional"
            defaultValue={c.papel_dimensional ?? ""}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="text-[10px]"
            title="Papel dimensional (ADR-012) — alimenta a fórmula de perímetro/área"
          >
            <option value="">sem papel dimensional</option>
            <option value="largura">largura</option>
            <option value="altura">altura</option>
          </Select>
        </form>
      ) : (
        c.papel_dimensional && <span className="font-mono text-[10px] text-primary">{c.papel_dimensional}</span>
      ))}
      {canManage && (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(true)}>
            Editar
          </Button>
          <form action={removerCaracteristicaPecaAction}>
            <input type="hidden" name="id" value={c.id} />
            <Button type="submit" variant="danger" size="sm">
              Remover
            </Button>
          </form>
        </>
      )}
    </li>
  );
}

function HistoricoRevisoes({ revisoes }: { revisoes: Revisao[] }) {
  const [aberto, setAberto] = useState(false);

  if (revisoes.length === 0) return null;

  return (
    <div className="mt-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => setAberto((v) => !v)}>
        {aberto ? "Ocultar histórico" : `Ver histórico (${revisoes.length} ${revisoes.length > 1 ? "revisões" : "revisão"})`}
      </Button>
      {aberto && (
        <ul className="mt-1.5 flex flex-col gap-0.5 pl-4 text-xs text-text-muted">
          {revisoes.map((r) => (
            <li key={r.revisao}>
              rev. {r.revisao} — {r.motivo ?? "sem motivo registrado"} — {fmtData(r.created_at)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
