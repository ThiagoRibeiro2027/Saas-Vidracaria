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
  definirCategoriasPecaAction,
  anexarVariavelPecaAction,
} from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Modal } from "@/components/ui/Modal";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";
import { Field, CheckboxField, OptionCard } from "@/components/ui/FormField";
import RegrasPeca from "./RegrasPeca";
import { SortableTh } from "@/components/ui/SortableTh";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Item = { id: string; codigo: string; descricao: string; tipo: string; unidade_principal: string };
type Peca = { id: string; item_id: string; descricao_tecnica: string | null; situacao: "ativo" | "inativo"; revisao_atual: number };
type PecaComposicao = {
  id: string;
  peca_id: string;
  material_item_id: string;
  quantidade_por_unidade: number;
  observacao: string | null;
  tipo_calculo: "fixo" | "linear" | "area" | "largura" | "altura";
  percentual_perda: number;
};
type Revisao = { revisao: number; motivo: string | null; created_at: string };
type Caracteristica = {
  id: string; nome: string; tipo: string; unidade: string | null; opcoes: string[] | null;
  obrigatoria: boolean; papel_dimensional: "largura" | "altura" | null; template_id: string | null;
};
// Catálogo de variáveis configuráveis (2026-10-04) — cadastrado em
// Configurações → Variáveis do configurador (VariaveisConfiguradorSection.tsx).
type VariavelCategoria = { id: string; nome: string };
type VariavelTemplate = {
  id: string; categoria_id: string; nome: string; tipo: "numero" | "texto" | "opcao";
  unidade: string | null; opcoes: string[] | null; obrigatoria_padrao: boolean; ativo: boolean;
};

const TIPO_CALCULO_LABEL: Record<PecaComposicao["tipo_calculo"], string> = {
  fixo: "Fixo",
  linear: "Linear (perímetro)",
  area: "Área",
  // ADR-012 v1.2 — material que consome só uma dimensão da peça (ex.:
  // trilho superior de um box, que corre só na largura de cima), em vez
  // do perímetro inteiro.
  largura: "Linear (só largura)",
  altura: "Linear (só altura)",
};

const TIPO_CALCULO_HINT: Record<PecaComposicao["tipo_calculo"], string> = {
  fixo: "Quantidade fixa por unidade da peça — não varia com o tamanho (ex.: puxador, dobradiça).",
  linear: "Multiplica a quantidade acima pelo perímetro (largura + altura) da peça — ex.: borracha de vedação.",
  area: "Multiplica a quantidade acima pela área (largura × altura) da peça — ex.: vidro, chapa.",
  largura: "Multiplica só pela largura, não pelo perímetro inteiro — ex.: trilho que corre só em cima.",
  altura: "Multiplica só pela altura, não pelo perímetro inteiro — ex.: montante lateral.",
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

// Mesmo padrão de Orçamentos (OrcamentosSection.tsx, 2026-10-03): lista
// compacta e paginada no servidor; composição, características, regras
// e histórico de cada peça só aparecem no modal, ao clicar na linha —
// antes tudo ficava sempre empilhado na tela, peça após peça.
export default function PecasSection({
  pecas,
  paginacao,
  composicao,
  itens,
  revisoesPorPeca,
  caracteristicasPorPeca,
  regrasPorPeca,
  comprimentosPorComposicao,
  variavelCategorias,
  variavelTemplates,
  categoriasPorPeca,
  canManage,
}: {
  pecas: Peca[];
  paginacao: PaginacaoInfo;
  composicao: PecaComposicao[];
  itens: Item[];
  revisoesPorPeca: Map<string, Revisao[]>;
  caracteristicasPorPeca: Map<string, Caracteristica[]>;
  regrasPorPeca: Map<string, Regra[]>;
  comprimentosPorComposicao: Map<string, ComprimentoBarra[]>;
  variavelCategorias: VariavelCategoria[];
  variavelTemplates: VariavelTemplate[];
  categoriasPorPeca: Map<string, string[]>;
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

  const [viewId, setViewId] = useState<string | null>(null);
  const viewing = pecas.find((p) => p.id === viewId) ?? null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Peças e composição de materiais</h2>
      <p className="mt-1 text-xs text-text-muted">
        Uma peça é um item do catálogo (tipo componente ou produto acabado); a composição é a lista
        de perfis/vidro/acessórios/insumos — ou de outra peça já cadastrada, como subconjunto — e a
        quantidade necessária por 1 unidade da peça. Toda mudança na composição gera uma revisão
        nova (histórico no modal, nada é sobrescrito). Clique numa peça para abrir.
      </p>

      {canManage && (
        <form action={criarPecaAction} className="mt-3 rounded-lg border border-border-subtle bg-page-bg p-4">
          <div className="flex flex-wrap gap-4">
            <div className="w-72">
              <Field label="Item" hint="Só itens do tipo componente ou produto acabado que ainda não viraram peça.">
                <Select className="w-full" name="item_id" required>
                  <option value="">Selecione o item...</option>
                  {itensDisponiveisParaPeca.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.codigo} — {it.descricao}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-64">
              <Field label="Descrição técnica" hint="Anotação interna sobre a peça (opcional) — não aparece pro cliente.">
                <Input className="w-full" name="descricao_tecnica" placeholder="Ex.: box de abrir 2 folhas" />
              </Field>
            </div>
          </div>
          <Button type="submit" variant="primary" className="mt-3">
            Cadastrar peça
          </Button>
        </form>
      )}

      <div className="mb-2 mt-3">
        <FiltroSituacaoPeca />
      </div>

      <Paginacao {...paginacao} paramPagina="pagina" paramPorPagina="por_pagina" posicao="topo" />

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Peça</Th>
            <SortableTh field="situacao" paramOrdenar="pc_ordenar">Situação</SortableTh>
            <SortableTh field="revisao_atual" paramOrdenar="pc_ordenar">Revisão</SortableTh>
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {pecas.map((p) => (
            <tr
              key={p.id}
              onClick={() => setViewId(p.id)}
              className={`cursor-pointer hover:bg-page-bg ${p.situacao === "ativo" ? "" : "opacity-55"}`}
            >
              <Td className="font-medium text-text">{itemLabel(p.item_id)}</Td>
              <Td>
                <StatusPill tone={p.situacao === "ativo" ? "success" : "neutral"}>
                  {p.situacao === "ativo" ? "Ativa" : "Inativa"}
                </StatusPill>
              </Td>
              <Td className="text-text-muted">rev. {p.revisao_atual}</Td>
            </tr>
          ))}
          {pecas.length === 0 && (
            <tr>
              <Td colSpan={3} className="text-text-muted">
                Nenhuma peça cadastrada ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>

      <Modal
        open={viewing !== null}
        onClose={() => setViewId(null)}
        title={viewing ? itemLabel(viewing.item_id) : "Peça"}
        size="xl"
      >
        {viewing && (
          <PecaDetalhe
            peca={viewing}
            linhas={composicaoPorPeca.get(viewing.id) ?? []}
            pecasComoSubconjunto={pecas.filter((sp) => sp.situacao === "ativo" && sp.id !== viewing.id)}
            pecaItemIds={new Set(pecas.map((sp) => sp.item_id))}
            itemLabel={itemLabel}
            itensMateriais={itensMateriais}
            comprimentosPorComposicao={comprimentosPorComposicao}
            caracteristicas={caracteristicasPorPeca.get(viewing.id) ?? []}
            regras={regrasPorPeca.get(viewing.id) ?? []}
            revisoes={revisoesPorPeca.get(viewing.id) ?? []}
            variavelCategorias={variavelCategorias}
            variavelTemplates={variavelTemplates}
            categoriasPeca={categoriasPorPeca.get(viewing.id) ?? []}
            canManage={canManage}
          />
        )}
      </Modal>
    </section>
  );
}

function PecaDetalhe({
  peca: p,
  linhas,
  pecasComoSubconjunto,
  pecaItemIds,
  itemLabel,
  itensMateriais,
  comprimentosPorComposicao,
  caracteristicas,
  regras,
  revisoes,
  variavelCategorias,
  variavelTemplates,
  categoriasPeca,
  canManage,
}: {
  peca: Peca;
  linhas: PecaComposicao[];
  pecasComoSubconjunto: Peca[];
  pecaItemIds: Set<string>;
  itemLabel: (id: string) => string;
  itensMateriais: Item[];
  comprimentosPorComposicao: Map<string, ComprimentoBarra[]>;
  caracteristicas: Caracteristica[];
  regras: Regra[];
  revisoes: Revisao[];
  variavelCategorias: VariavelCategoria[];
  variavelTemplates: VariavelTemplate[];
  categoriasPeca: string[];
  canManage: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 text-sm">
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
              const ehPeca = pecaItemIds.has(c.material_item_id);
              return (
                <Fragment key={c.id}>
                  <tr>
                    <Td className="align-top">
                      {itemLabel(c.material_item_id)}
                      {ehPeca && <span className="ml-1.5 font-mono text-[10px] text-primary">subconjunto</span>}
                    </Td>
                    <Td className="align-top">
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
                    <Td className="align-top">{c.observacao ?? "—"}</Td>
                    <Td className="align-top">
                      {canManage ? (
                        <TipoCalculoComposicao
                          // Remonta quando o tipo salvo muda (depois de
                          // "Salvar" + revalidação): sem isso, o select
                          // ficava preso no valor antigo na tela — o
                          // salvamento já tinha funcionado no banco,
                          // só a tela não refletia (achado ao testar
                          // Largura/Altura em 2026-10-04).
                          key={`${c.id}:${c.tipo_calculo}`}
                          composicao={c}
                        />
                      ) : (
                        `${TIPO_CALCULO_LABEL[c.tipo_calculo]}${c.tipo_calculo !== "fixo" ? ` (perda ${c.percentual_perda}%)` : ""}`
                      )}
                    </Td>
                    {canManage && (
                      <Td className="align-top">
                        <form action={removerMaterialPecaAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <Button type="submit" variant="danger" size="sm">
                            Remover
                          </Button>
                        </form>
                      </Td>
                    )}
                  </tr>
                  {(c.tipo_calculo === "linear" || c.tipo_calculo === "largura" || c.tipo_calculo === "altura") && (
                    <tr>
                      <Td colSpan={canManage ? 5 : 4}>
                        <ComprimentosBarraComposicao
                          composicaoId={c.id}
                          comprimentos={comprimentosPorComposicao.get(c.id) ?? []}
                          itens={itensMateriais}
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
        <form action={adicionarMaterialPecaAction} className="mt-4 rounded-lg border border-border-subtle bg-page-bg p-3">
          <input type="hidden" name="peca_id" value={p.id} />
          <p className="mb-2 text-xs font-semibold text-text">Adicionar material à composição</p>
          <div className="flex flex-wrap gap-4">
            <div className="w-72">
              <Field label="Material ou subconjunto" hint="O que entra na composição desta peça: perfil, vidro, acessório, insumo — ou outra peça já cadastrada.">
                <Select className="w-full" name="material_item_id" required>
                  <option value="">Selecione...</option>
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
              </Field>
            </div>
            <div className="w-36">
              <Field label="Quantidade por unidade" hint="Quanto desse material 1 unidade da peça consome.">
                <Input className="w-full" name="quantidade_por_unidade" type="number" min="0.0001" step="0.0001" placeholder="0,000" required />
              </Field>
            </div>
            <div className="w-48">
              <Field label="Observação" hint="Anotação livre (opcional).">
                <Input className="w-full" name="observacao" placeholder="Ex.: lado interno" />
              </Field>
            </div>
          </div>
          <Button type="submit" variant="primary" className="mt-3">
            Adicionar
          </Button>
        </form>
      )}

      {canManage && p.situacao === "ativo" && (
        <CategoriasPeca pecaId={p.id} todasCategorias={variavelCategorias} categoriasMarcadas={categoriasPeca} />
      )}

      <CaracteristicasPeca
        pecaId={p.id}
        caracteristicas={caracteristicas}
        variavelTemplates={variavelTemplates}
        categoriasPeca={categoriasPeca}
        canManage={canManage && p.situacao === "ativo"}
      />

      {canManage && p.situacao === "ativo" && (
        <RegrasPeca
          pecaId={p.id}
          caracteristicas={caracteristicas}
          regras={regras}
          materiais={[
            ...itensMateriais.map((it) => ({ id: it.id, label: itemLabel(it.id) })),
            ...pecasComoSubconjunto.map((sp) => ({ id: sp.item_id, label: itemLabel(sp.item_id) })),
          ]}
        />
      )}

      <HistoricoRevisoes revisoes={revisoes} />
    </div>
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
          <Select
            name="item_id"
            required
            title="Item de barra em que esse material é vendido/cortado (ex.: barra de 6 metros)."
            className="w-40 text-[11px]"
          >
            <option value="">item da barra...</option>
            {itensMateriais
              .filter((it) => !itensJaUsados.has(it.id))
              .map((it) => (
                <option key={it.id} value={it.id}>
                  {it.codigo} — {it.descricao}
                </option>
              ))}
          </Select>
          <Input
            name="comprimento_metros"
            type="number"
            min="0.001"
            step="0.001"
            placeholder="metros"
            title="Comprimento dessa barra, em metros."
            className="w-16 text-[11px]"
          />
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
    <form action={definirTipoCalculoComposicaoAction} className="flex flex-col gap-1">
      <input type="hidden" name="composicao_id" value={composicao.id} />
      <div className="flex items-center gap-1">
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
            title="% de perda de corte — sobra que vira refugo, somada à quantidade calculada."
            defaultValue={composicao.tipo_calculo !== "fixo" ? composicao.percentual_perda : 0}
            className="w-20"
          />
        )}
        <Button type="submit" variant="primary" size="sm">
          Salvar
        </Button>
      </div>
      <p className="max-w-xs text-[11px] text-text-muted">{TIPO_CALCULO_HINT[tipo]}</p>
    </form>
  );
}

// Catálogo de variáveis configuráveis (2026-10-04) — a peça marca quais
// categorias usa (ex.: um box de vidro usa "Vidro" e "Perfil" ao mesmo
// tempo); isso decide o que aparece pra anexar em "+ Variáveis do
// catálogo", abaixo. Editor de tags: a cada mudança, manda o conjunto
// inteiro marcado (definirCategoriasPecaAction substitui, não soma).
function CategoriasPeca({
  pecaId,
  todasCategorias,
  categoriasMarcadas,
}: {
  pecaId: string;
  todasCategorias: VariavelCategoria[];
  categoriasMarcadas: string[];
}) {
  if (todasCategorias.length === 0) return null;

  return (
    <form
      action={definirCategoriasPecaAction}
      onChange={(e) => e.currentTarget.requestSubmit()}
      className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2 text-xs"
    >
      <input type="hidden" name="peca_id" value={pecaId} />
      <span className="font-semibold text-text">Categorias desta peça:</span>
      {todasCategorias.map((cat) => (
        <label key={cat.id} className="flex items-center gap-1 text-text">
          <input
            type="checkbox"
            name="categoria_ids"
            value={cat.id}
            defaultChecked={categoriasMarcadas.includes(cat.id)}
            className="accent-primary"
          />
          {cat.nome}
        </label>
      ))}
    </form>
  );
}

function CaracteristicasPeca({
  pecaId,
  caracteristicas,
  variavelTemplates,
  categoriasPeca,
  canManage,
}: {
  pecaId: string;
  caracteristicas: Caracteristica[];
  variavelTemplates: VariavelTemplate[];
  categoriasPeca: string[];
  canManage: boolean;
}) {
  const [tipoNovo, setTipoNovo] = useState<"numero" | "texto" | "opcao">("numero");
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false);

  const nomesJaUsados = new Set(caracteristicas.map((c) => c.nome));
  const templatesDisponiveis = variavelTemplates.filter(
    (t) => categoriasPeca.includes(t.categoria_id) && !nomesJaUsados.has(t.nome),
  );

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
        <div className="mb-1.5">
          <Button type="button" variant="secondary" size="sm" onClick={() => setMostrarCatalogo((v) => !v)}>
            {mostrarCatalogo ? "Ocultar variáveis do catálogo" : "+ Variáveis do catálogo"}
          </Button>
          {mostrarCatalogo && (
            <div className="mt-1.5 flex flex-col gap-1 rounded border border-border-subtle p-2">
              {categoriasPeca.length === 0 && (
                <p className="text-xs text-text-muted">
                  Marque ao menos uma categoria acima pra ver as variáveis disponíveis.
                </p>
              )}
              {categoriasPeca.length > 0 && templatesDisponiveis.length === 0 && (
                <p className="text-xs text-text-muted">
                  Nenhuma variável disponível nas categorias marcadas (cadastre em Configurações →
                  Variáveis do configurador, ou já estão todas anexadas).
                </p>
              )}
              {templatesDisponiveis.map((t) => (
                <form
                  key={t.id}
                  action={anexarVariavelPecaAction}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <input type="hidden" name="peca_id" value={pecaId} />
                  <input type="hidden" name="template_id" value={t.id} />
                  <input type="hidden" name="obrigatoria" value={t.obrigatoria_padrao ? "on" : ""} />
                  <span className="text-text">
                    {t.nome}
                    {t.opcoes && <span className="text-text-muted"> ({t.opcoes.join(", ")})</span>}
                  </span>
                  <Button type="submit" variant="primary" size="sm">
                    Adicionar
                  </Button>
                </form>
              ))}
            </div>
          )}
        </div>
      )}

      {canManage && (
        <form action={definirCaracteristicaPecaAction} className="rounded-lg border border-border-subtle bg-page-bg p-3">
          <input type="hidden" name="peca_id" value={pecaId} />

          <div className="flex flex-wrap gap-4">
            <div className="w-40">
              <Field label="Nome" hint="Como aparece pro cliente escolher, ex.: largura.">
                <Input className="w-full" name="nome" placeholder="largura" required />
              </Field>
            </div>
            <div className="w-32">
              <Field label="Unidade" hint="Se houver (ex.: mm). Deixe em branco se não se aplica.">
                <Input className="w-full" name="unidade" placeholder="mm" />
              </Field>
            </div>
          </div>

          <div className="mt-3 grid max-w-md grid-cols-3 gap-2">
            <OptionCard
              value="numero"
              label="Número"
              hint="Valor numérico, ex.: medida em mm."
              selected={tipoNovo === "numero"}
              onSelect={() => setTipoNovo("numero")}
            />
            <OptionCard
              value="texto"
              label="Texto"
              hint="Texto livre, sem formato fixo."
              selected={tipoNovo === "texto"}
              onSelect={() => setTipoNovo("texto")}
            />
            <OptionCard
              value="opcao"
              label="Opção (lista)"
              hint="Lista fixa pra escolher, ex.: cores."
              selected={tipoNovo === "opcao"}
              onSelect={() => setTipoNovo("opcao")}
            />
          </div>
          <input type="hidden" name="tipo" value={tipoNovo} />

          {tipoNovo === "opcao" && (
            <div className="mt-3 w-72">
              <Field label="Opções da lista" hint="Uma opção por vírgula — é o que o cliente vai escolher.">
                <Input className="w-full" name="opcoes" placeholder="Incolor, Verde, Fumê, Bronze" required />
              </Field>
            </div>
          )}

          <div className="mt-3">
            <CheckboxField
              name="obrigatoria"
              defaultChecked
              label="Obrigatória"
              hint="O cliente precisa preencher essa característica pra fechar o pedido."
            />
          </div>

          <Button type="submit" variant="primary" size="sm" className="mt-3">
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
  const doCatalogo = c.template_id !== null;

  if (editando) {
    return (
      <li>
        <form
          action={atualizarCaracteristicaPecaAction}
          onSubmit={() => setEditando(false)}
          className="my-1 rounded-lg border border-border-subtle bg-page-bg p-3"
        >
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="tipo" value={c.tipo} />
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-text">{c.nome}</span>
            <span className="text-[11px] text-text-muted">({tipoLabel} — nome e tipo não mudam)</span>
          </div>

          {doCatalogo ? (
            <>
              {/* Unidade/opções vêm do catálogo — editar aqui divergiria da
                  fonte única; manda os valores atuais sem campo pra mexer. */}
              <input type="hidden" name="unidade" value={c.unidade ?? ""} />
              <input type="hidden" name="opcoes" value={c.opcoes?.join(", ") ?? ""} />
              <p className="mt-2 text-[11px] text-text-muted">
                Unidade/opções vêm do catálogo — editar em Configurações → Variáveis do configurador.
              </p>
            </>
          ) : (
            <div className="mt-3 flex flex-wrap gap-4">
              <div className="w-40">
                <Field label="Unidade" hint="Se houver (ex.: mm). Deixe em branco se não se aplica.">
                  <Input className="w-full" name="unidade" defaultValue={c.unidade ?? ""} placeholder="mm" />
                </Field>
              </div>
              {c.tipo === "opcao" && (
                <div className="w-72">
                  <Field label="Opções da lista" hint="Uma opção por vírgula.">
                    <Input className="w-full" name="opcoes" defaultValue={c.opcoes?.join(", ") ?? ""} placeholder="Incolor, Verde, Fumê, Bronze" required />
                  </Field>
                </div>
              )}
            </div>
          )}

          <div className="mt-3">
            <CheckboxField
              name="obrigatoria"
              defaultChecked={c.obrigatoria}
              label="Obrigatória"
              hint="O cliente precisa preencher essa característica pra fechar o pedido."
            />
          </div>

          <div className="mt-3 flex gap-1.5">
            <Button type="submit" variant="primary" size="sm">
              Salvar
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
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
      {doCatalogo && <span className="font-mono text-[10px] text-primary">catálogo</span>}
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

function FiltroSituacaoPeca() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const valor = searchParams.get("pc_situacao") ?? "";

  function onChange(novoValor: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoValor) p.set("pc_situacao", novoValor);
    else p.delete("pc_situacao");
    p.delete("pagina");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por situação"
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    >
      <option value="">Ativas e inativas</option>
      <option value="ativo">Ativa</option>
      <option value="inativo">Inativa</option>
    </select>
  );
}
