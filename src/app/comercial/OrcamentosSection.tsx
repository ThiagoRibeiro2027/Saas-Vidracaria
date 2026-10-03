"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  upsertOrcamentoAction,
  upsertOrcamentoItemAction,
  removeOrcamentoItemAction,
  decidirOrcamentoAction,
  cancelarOrcamentoAction,
  vincularOportunidadeOrcamentoAction,
  calcularMaoObraOrcamentoItemAction,
} from "./actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import ItemConfiguravelForm, { MOTIVO_OPERACAO_LABEL, type DefCaracteristica } from "./ItemConfiguravelForm";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string; pessoa_id: string; situacao: "ativo" | "inativo" };
type Item = {
  id: string;
  codigo: string;
  descricao: string;
  unidade_principal: string;
  situacao: "ativo" | "inativo";
};

type Orcamento = {
  id: string;
  numero: string;
  pessoa_id: string;
  obra_id: string | null;
  responsavel_id: string;
  data_orcamento: string;
  validade: string | null;
  condicao_comercial: string | null;
  observacoes: string | null;
  status: "rascunho" | "aprovado" | "rejeitado" | "cancelado";
  oportunidade_id: string | null;
};

type OportunidadeResumo = { id: string; descricao: string | null; pessoa_id: string };

type OrcamentoItem = {
  id: string;
  orcamento_id: string;
  item_id: string;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number | null;
  custo_mao_obra: number | null;
};

type Caracteristica = {
  peca_caracteristica_id: string;
  nome: string;
  tipo: string;
  unidade: string | null;
  obrigatoria: boolean;
  valor_numero: number | null;
  valor_texto: string | null;
};

const STATUS_LABEL: Record<Orcamento["status"], string> = {
  rascunho: "Rascunho",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
};

const STATUS_TONE: Record<Orcamento["status"], "neutral" | "success" | "danger"> = {
  rascunho: "neutral",
  aprovado: "success",
  rejeitado: "danger",
  cancelado: "danger",
};

const currency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function OrcamentosSection({
  orcamentos,
  itensPorOrcamento,
  totais,
  clientesElegiveis,
  todasPessoas,
  obras,
  itens,
  caracteristicasPorItemId,
  caracteristicasPorOrcamentoItem,
  oportunidadesAbertas,
  canManage,
}: {
  orcamentos: Orcamento[];
  itensPorOrcamento: Map<string, OrcamentoItem[]>;
  totais: Map<string, number>;
  clientesElegiveis: Pessoa[];
  todasPessoas: Pessoa[];
  obras: Obra[];
  itens: Item[];
  caracteristicasPorItemId: Map<string, DefCaracteristica[]>;
  caracteristicasPorOrcamentoItem: Map<string, Caracteristica[]>;
  oportunidadesAbertas: OportunidadeResumo[];
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => todasPessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const obrasAtivas = obras.filter((o) => o.situacao === "ativo");
  const itensAtivos = itens.filter((i) => i.situacao === "ativo");

  const [createOpen, setCreateOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  const viewing = orcamentos.find((o) => o.id === viewId) ?? null;
  const viewingEditavel = canManage && viewing?.status === "rascunho";
  const viewingPodeCancelar = canManage && !!viewing && (viewing.status === "rascunho" || viewing.status === "aprovado");

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Orçamentos</h2>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Recorte mínimo do M1 (TÓPICO 10 §4): orçamento simples e decisão de aprovação, sem tabela
        de preços, descontos, versionamento ou proposta formal. Orçamento aprovado fica pronto
        para o módulo de Pedidos (TÓPICO 3) converter — ainda não implementado. Um orçamento em
        rascunho pode ser editado livremente; depois de decidido, é terminal (corrigir = cancelar
        e criar outro). Clique numa linha para abrir, revisar e editar.
      </p>

      {canManage && (
        <div className="mb-3">
          <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
            + Incluir
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Número</Th>
              <Th>Cliente</Th>
              <Th>Obra</Th>
              <Th>Data</Th>
              <Th>Status</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {orcamentos.map((orc) => (
              <tr
                key={orc.id}
                onClick={() => setViewId(orc.id)}
                className="cursor-pointer hover:bg-page-bg"
              >
                <Td className="font-medium text-text">{orc.numero}</Td>
                <Td>{pessoaNome(orc.pessoa_id)}</Td>
                <Td className="text-text-muted">{obraNome(orc.obra_id)}</Td>
                <Td className="text-text-muted">{orc.data_orcamento}</Td>
                <Td>
                  <Badge variant={STATUS_TONE[orc.status]}>{STATUS_LABEL[orc.status]}</Badge>
                </Td>
                <Td className="text-right font-semibold text-text">{currency(totais.get(orc.id) ?? 0)}</Td>
              </tr>
            ))}
            {orcamentos.length === 0 && (
              <tr>
                <Td colSpan={6} className="text-text-muted">
                  Nenhum orçamento ainda.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo orçamento">
        <OrcamentoForm
          clientesElegiveis={clientesElegiveis}
          obrasAtivas={obrasAtivas}
          todasPessoas={todasPessoas}
          obras={obras}
          onSuccess={() => setCreateOpen(false)}
        />
      </Modal>

      <Modal
        open={viewing !== null}
        onClose={() => setViewId(null)}
        title={viewing ? `Orçamento ${viewing.numero}` : "Orçamento"}
        size="lg"
      >
        {viewing && (
          <OrcamentoReview
            orcamento={viewing}
            total={totais.get(viewing.id) ?? 0}
            editavel={!!viewingEditavel}
            podeCancelar={!!viewingPodeCancelar}
            canManage={canManage}
            orcItens={itensPorOrcamento.get(viewing.id) ?? []}
            itensAtivos={itensAtivos}
            itens={itens}
            caracteristicasPorItemId={caracteristicasPorItemId}
            caracteristicasPorOrcamentoItem={caracteristicasPorOrcamentoItem}
            oportunidadesAbertas={oportunidadesAbertas.filter((o) => o.pessoa_id === viewing.pessoa_id)}
            clientesElegiveis={clientesElegiveis}
            obrasAtivas={obrasAtivas}
            todasPessoas={todasPessoas}
            obras={obras}
            pessoaNome={pessoaNome}
            obraNome={obraNome}
          />
        )}
      </Modal>
    </section>
  );
}

function OrcamentoForm({
  orcamento,
  clientesElegiveis,
  obrasAtivas,
  todasPessoas,
  obras,
  onSuccess,
}: {
  orcamento?: Orcamento;
  clientesElegiveis: Pessoa[];
  obrasAtivas: Obra[];
  todasPessoas: Pessoa[];
  obras: Obra[];
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(upsertOrcamentoAction, undefined);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) onSuccess();
    wasPending.current = isPending;
  }, [isPending, state, onSuccess]);

  const pessoaNome = (id: string) => todasPessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  // Guard de seleção atual: cliente/obra do orçamento podem ter saído da
  // lista elegível (papel desligado / obra inativada) depois que o
  // orçamento foi criado — sem incluir a opção atual, o <select> cai
  // silenciosamente na primeira opção da lista e salvar reatribui o
  // orçamento por engano.
  const pessoaAtual = orcamento ? todasPessoas.find((p) => p.id === orcamento.pessoa_id) : undefined;
  const pessoaOpcoes =
    pessoaAtual && !clientesElegiveis.some((p) => p.id === pessoaAtual.id) ? [pessoaAtual, ...clientesElegiveis] : clientesElegiveis;
  const obraAtual = orcamento?.obra_id ? obras.find((o) => o.id === orcamento.obra_id) : undefined;
  const obraOpcoes =
    obraAtual && !obrasAtivas.some((o) => o.id === obraAtual.id) ? [obraAtual, ...obrasAtivas] : obrasAtivas;

  if (!orcamento && clientesElegiveis.length === 0) {
    return (
      <p className="text-xs text-text-muted">
        Nenhuma pessoa com papel Cliente ativo — cadastre um em Cadastros antes.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      {orcamento && <input type="hidden" name="id" value={orcamento.id} />}
      <div>
        <label className="mb-1 block text-xs text-text-muted">Cliente</label>
        <Select name="pessoa_id" defaultValue={orcamento?.pessoa_id ?? ""} required className="w-full">
          {!orcamento && (
            <option value="" disabled>
              Selecione...
            </option>
          )}
          {pessoaOpcoes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {pessoaAtual?.id === p.id && !clientesElegiveis.some((c) => c.id === p.id) ? " (papel desligado)" : ""}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">Obra</label>
        <Select name="obra_id" defaultValue={orcamento?.obra_id ?? ""} className="w-full">
          <option value="">Sem obra</option>
          {obraOpcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome} ({pessoaNome(o.pessoa_id)})
              {obraAtual?.id === o.id && !obrasAtivas.some((a) => a.id === o.id) ? " (inativa)" : ""}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">Validade</label>
        <Input name="validade" type="date" defaultValue={orcamento?.validade ?? ""} className="w-full" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">Condição comercial</label>
        <Input
          name="condicao_comercial"
          placeholder="ex.: 30/60/90 dias"
          defaultValue={orcamento?.condicao_comercial ?? ""}
          className="w-full"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-muted">Observações</label>
        <Input name="observacoes" placeholder="observações" defaultValue={orcamento?.observacoes ?? ""} className="w-full" />
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={isPending} className="mt-1 w-fit">
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}

// Modal de revisão aberto ao clicar numa linha da lista — cabeçalho
// (editável só em rascunho), itens e decisão, tudo num só lugar em vez de
// espalhado pela página. Fica aberto depois de Aprovar/Rejeitar/Cancelar
// (o conteúdo se atualiza sozinho com o novo status, já que `orcamento`
// vem de `orcamentos.find(...)` no componente pai) — quem revisa decide
// quando fechar.
function OrcamentoReview({
  orcamento,
  total,
  editavel,
  podeCancelar,
  canManage,
  orcItens,
  itensAtivos,
  itens,
  caracteristicasPorItemId,
  caracteristicasPorOrcamentoItem,
  oportunidadesAbertas,
  clientesElegiveis,
  obrasAtivas,
  todasPessoas,
  obras,
  pessoaNome,
  obraNome,
}: {
  orcamento: Orcamento;
  total: number;
  editavel: boolean;
  podeCancelar: boolean;
  canManage: boolean;
  orcItens: OrcamentoItem[];
  itensAtivos: Item[];
  itens: Item[];
  caracteristicasPorItemId: Map<string, DefCaracteristica[]>;
  caracteristicasPorOrcamentoItem: Map<string, Caracteristica[]>;
  oportunidadesAbertas: OportunidadeResumo[];
  clientesElegiveis: Pessoa[];
  obrasAtivas: Obra[];
  todasPessoas: Pessoa[];
  obras: Obra[];
  pessoaNome: (id: string) => string;
  obraNome: (id: string | null) => string;
}) {
  const origemOportunidade = orcamento.oportunidade_id
    ? oportunidadesAbertas.find((o) => o.id === orcamento.oportunidade_id)?.descricao ?? orcamento.oportunidade_id
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={STATUS_TONE[orcamento.status]}>{STATUS_LABEL[orcamento.status]}</Badge>
        <span className="text-text-muted">{orcamento.data_orcamento}</span>
        <span className="ml-auto text-sm font-semibold text-text">{currency(total)}</span>
      </div>

      {editavel ? (
        <OrcamentoForm
          orcamento={orcamento}
          clientesElegiveis={clientesElegiveis}
          obrasAtivas={obrasAtivas}
          todasPessoas={todasPessoas}
          obras={obras}
          onSuccess={() => {}}
        />
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <dt className="text-text-muted">Cliente</dt>
            <dd className="text-text">{pessoaNome(orcamento.pessoa_id)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Obra</dt>
            <dd className="text-text">{obraNome(orcamento.obra_id)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Validade</dt>
            <dd className="text-text">{orcamento.validade ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Condição comercial</dt>
            <dd className="text-text">{orcamento.condicao_comercial ?? "—"}</dd>
          </div>
          {orcamento.observacoes && (
            <div className="col-span-2">
              <dt className="text-text-muted">Observações</dt>
              <dd className="text-text">{orcamento.observacoes}</dd>
            </div>
          )}
        </dl>
      )}

      {editavel && (
        <OportunidadeVinculoForm
          orcamentoId={orcamento.id}
          oportunidadeAtualId={orcamento.oportunidade_id}
          oportunidades={oportunidadesAbertas}
        />
      )}
      {!editavel && origemOportunidade && (
        <p className="text-xs text-text-muted">Origem: oportunidade {origemOportunidade}</p>
      )}

      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Qtd</Th>
              <Th>Preço unit.</Th>
              <Th>Subtotal</Th>
              {canManage && <Th>Custo / margem</Th>}
              {editavel && <Th />}
            </tr>
          </thead>
          <tbody>
            {orcItens.map((oi) => (
              <OrcamentoItemRow
                key={oi.id}
                item={oi}
                itensAtivos={itensAtivos}
                itemAtualFallback={itens.find((i) => i.id === oi.item_id)}
                itens={itens}
                editavel={editavel}
                canManage={canManage}
                caracteristicasPorItemId={caracteristicasPorItemId}
                caracteristicas={caracteristicasPorOrcamentoItem.get(oi.id) ?? []}
              />
            ))}
            {editavel && (
              <OrcamentoItemRow
                item={null}
                orcamentoId={orcamento.id}
                itensAtivos={itensAtivos}
                itens={itens}
                editavel={editavel}
                canManage={canManage}
                caracteristicas={[]}
                caracteristicasPorItemId={caracteristicasPorItemId}
              />
            )}
            {!editavel && orcItens.length === 0 && (
              <tr>
                <Td colSpan={canManage ? 5 : 4} className="text-text-muted">
                  Nenhum item.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      {canManage && orcamento.status === "rascunho" && (
        <div className="flex gap-1.5">
          <form action={decidirOrcamentoAction}>
            <input type="hidden" name="id" value={orcamento.id} />
            <input type="hidden" name="decisao" value="aprovado" />
            <Button type="submit" variant="primary">
              Aprovar
            </Button>
          </form>
          <form action={decidirOrcamentoAction}>
            <input type="hidden" name="id" value={orcamento.id} />
            <input type="hidden" name="decisao" value="rejeitado" />
            <Button type="submit" variant="danger">
              Rejeitar
            </Button>
          </form>
          <form action={cancelarOrcamentoAction}>
            <input type="hidden" name="id" value={orcamento.id} />
            <Button type="submit" variant="danger">
              Cancelar
            </Button>
          </form>
        </div>
      )}
      {canManage && !editavel && podeCancelar && (
        <div className="flex gap-1.5">
          <form action={cancelarOrcamentoAction}>
            <input type="hidden" name="id" value={orcamento.id} />
            <Button type="submit" variant="danger">
              Cancelar
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function OportunidadeVinculoForm({
  orcamentoId,
  oportunidadeAtualId,
  oportunidades,
}: {
  orcamentoId: string;
  oportunidadeAtualId: string | null;
  oportunidades: OportunidadeResumo[];
}) {
  if (oportunidadeAtualId) {
    const op = oportunidades.find((o) => o.id === oportunidadeAtualId);
    return (
      <p className="text-xs text-text-muted">
        Origem: oportunidade {op?.descricao ?? oportunidadeAtualId}
      </p>
    );
  }
  if (oportunidades.length === 0) return null;

  return (
    <form action={vincularOportunidadeOrcamentoAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="orcamento_id" value={orcamentoId} />
      <Select name="oportunidade_id" defaultValue="" required className="min-w-40">
        <option value="" disabled>
          Vincular a oportunidade
        </option>
        {oportunidades.map((o) => (
          <option key={o.id} value={o.id}>
            {o.descricao ?? o.id}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary">
        Vincular
      </Button>
    </form>
  );
}

function itemLabel(itens: Item[], id: string) {
  const it = itens.find((i) => i.id === id);
  return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
}

// Margem/markup nunca ficam persistidos (ver comentário da migration) —
// só derivados aqui, na hora de exibir, a partir de preço e custo.
function margemPercentual(preco: number, custo: number | null) {
  if (custo === null || preco <= 0) return null;
  return ((preco - custo) / preco) * 100;
}

function OrcamentoItemRow({
  item,
  orcamentoId,
  itensAtivos,
  itemAtualFallback,
  itens,
  editavel,
  canManage,
  caracteristicas,
  caracteristicasPorItemId,
}: {
  item: OrcamentoItem | null;
  orcamentoId?: string;
  itensAtivos: Item[];
  itemAtualFallback?: Item;
  itens: Item[];
  editavel: boolean;
  canManage: boolean;
  caracteristicas: Caracteristica[];
  caracteristicasPorItemId: Map<string, DefCaracteristica[]>;
}) {
  const [itemSel, setItemSel] = useState(item?.item_id ?? "");
  const subtotal = item ? item.quantidade * item.preco_unitario : 0;
  // Margem sobre o custo total (material + mão de obra), o mesmo que o
  // cálculo automático usa pra sugerir o preço.
  const custoTotal = item && item.custo_unitario !== null ? item.custo_unitario + (item.custo_mao_obra ?? 0) : null;
  const margem = item ? margemPercentual(item.preco_unitario, custoTotal) : null;
  const totalColumns = 4 + (canManage ? 1 : 0) + (editavel ? 1 : 0);
  // Mesmo guard de seleção atual do cabeçalho (ver comentário acima): sem
  // isso, editar quantidade/preço de uma linha cujo item foi desativado
  // troca silenciosamente o item da linha ao salvar.
  const itemOpcoes =
    itemAtualFallback && !itensAtivos.some((i) => i.id === itemAtualFallback.id)
      ? [itemAtualFallback, ...itensAtivos]
      : itensAtivos;

  if (!editavel) {
    if (!item) return null;
    return (
      <>
        <tr>
          <Td>{itemLabel(itens, item.item_id)}</Td>
          <Td>{item.quantidade}</Td>
          <Td>{currency(item.preco_unitario)}</Td>
          <Td>{currency(subtotal)}</Td>
          {canManage && (
            <Td>
              {item.custo_unitario !== null
                ? `${currency(item.custo_unitario)} · ${margem !== null ? margem.toFixed(1) : "—"}%`
                : "—"}
              {item.custo_mao_obra !== null && <> · MO: {currency(item.custo_mao_obra)}</>}
            </Td>
          )}
        </tr>
        {caracteristicas.length > 0 && (
          <tr>
            <Td colSpan={totalColumns}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <span className="font-medium text-text">Características (configurador):</span>
                {caracteristicas.map((c) => (
                  <span key={c.peca_caracteristica_id}>
                    {c.nome}: {c.valor_numero ?? c.valor_texto ?? "—"} {c.unidade ?? ""}
                  </span>
                ))}
              </div>
            </Td>
          </tr>
        )}
      </>
    );
  }

  const itemSelectEl = (
    <Select name="item_id" value={itemSel} onChange={(e) => setItemSel(e.target.value)} required className="min-w-40">
      <option value="" disabled>
        Item
      </option>
      {itemOpcoes.map((it) => (
        <option key={it.id} value={it.id}>
          {it.codigo} — {it.descricao}
          {itemAtualFallback?.id === it.id && !itensAtivos.some((a) => a.id === it.id) ? " (inativo)" : ""}
        </option>
      ))}
    </Select>
  );

  const removerForm = item && (
    <form action={removeOrcamentoItemAction} className="mt-1">
      <input type="hidden" name="id" value={item.id} />
      <Button type="submit" variant="danger">
        Remover
      </Button>
    </form>
  );

  // Peça configurável: as características aparecem assim que o item é
  // escolhido, e custo + mão de obra + preço se calculam sozinhos (ADR-012
  // v1.1) — sem item gravado antes e sem preço digitado antes.
  const definicoes = caracteristicasPorItemId.get(itemSel);
  if (definicoes) {
    return (
      <tr>
        <Td colSpan={totalColumns}>
          <ItemConfiguravelForm
            key={`${item?.id ?? "novo"}:${itemSel}`}
            orcamentoId={item?.orcamento_id ?? orcamentoId ?? ""}
            item={item ? { id: item.id, quantidade: item.quantidade, preco_unitario: item.preco_unitario } : null}
            itemId={itemSel}
            itemSelect={itemSelectEl}
            definicoes={definicoes}
            valoresSalvos={item && item.item_id === itemSel ? caracteristicas : []}
            onSaved={item ? undefined : () => setItemSel("")}
          />
          {removerForm}
        </Td>
      </tr>
    );
  }

  return (
    <>
      <tr>
      <Td colSpan={totalColumns}>
        <form action={upsertOrcamentoItemAction} className="flex flex-wrap items-center gap-1.5">
          {item && <input type="hidden" name="id" value={item.id} />}
          <input type="hidden" name="orcamento_id" value={item?.orcamento_id ?? orcamentoId} />
          {itemSelectEl}
          <Input
            name="quantidade"
            type="number"
            step="0.001"
            min="0.001"
            placeholder="qtd"
            defaultValue={item?.quantidade ?? ""}
            required
            className="w-[70px]"
          />
          <Input
            name="preco_unitario"
            type="number"
            step="0.01"
            min="0"
            placeholder="preço unit."
            defaultValue={item?.preco_unitario ?? ""}
            required
            className="w-[90px]"
          />
          {canManage && (
            <Input
              id={item ? `custo-unitario-${item.id}` : undefined}
              name="custo_unitario"
              type="number"
              step="0.01"
              min="0"
              placeholder="custo (interno)"
              defaultValue={item?.custo_unitario ?? ""}
              className="w-[110px]"
            />
          )}
          {canManage && (
            <Input
              id={item ? `custo-mao-obra-${item.id}` : undefined}
              name="custo_mao_obra"
              type="number"
              step="0.01"
              min="0"
              placeholder="mão de obra"
              defaultValue={item?.custo_mao_obra ?? ""}
              className="w-[110px]"
            />
          )}
          <Button type="submit" variant="primary">
            {item ? "Salvar" : "Adicionar"}
          </Button>
          {item && <span className="text-text-muted">subtotal: {currency(subtotal)}</span>}
        </form>
        {removerForm}
      </Td>
      </tr>
      {item && canManage && (
        <tr>
          <Td colSpan={totalColumns}>
            <CalculadoraMaoDeObraConfigurador orcamentoItemId={item.id} />
          </Td>
        </tr>
      )}
    </>
  );
}

type OperacaoMaoObra = {
  operacao_id: string;
  sequencia: number;
  descricao: string;
  recurso_nome?: string;
  tempo_previsto_minutos?: number;
  custo_hora?: number;
  custo_operacao?: number;
  motivo?: string;
};
type CalculoMaoObraResultado = {
  tem_roteiro: boolean;
  custo_total?: number;
  operacoes?: OperacaoMaoObra[];
  operacoes_sem_custo?: OperacaoMaoObra[];
};

// ADR-012 Fase 4 — leitura pura, o vendedor decide se aplica o resultado
// (nunca autoridade cega). Só para itens que NÃO são peça configurável: nas
// peças, a mão de obra já entra no cálculo automático (ADR-012 v1.1).
function CalculadoraMaoDeObraConfigurador({ orcamentoItemId }: { orcamentoItemId: string }) {
  const [resultado, setResultado] = useState<CalculoMaoObraResultado | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calcular() {
    setPending(true);
    setError(null);
    const r = await calcularMaoObraOrcamentoItemAction(orcamentoItemId);
    setPending(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setResultado(r.data as CalculoMaoObraResultado);
  }

  function usarCusto() {
    if (resultado?.custo_total === undefined) return;
    const campo = document.getElementById(`custo-mao-obra-${orcamentoItemId}`) as HTMLInputElement | null;
    if (campo) campo.value = String(resultado.custo_total);
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-border-subtle bg-page-bg p-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium text-text">Mão de obra (roteiro produtivo, ADR-012):</span>
        <Button type="button" variant="secondary" onClick={calcular} disabled={pending}>
          {pending ? "Calculando..." : "Calcular"}
        </Button>
        {resultado?.custo_total !== undefined && (
          <Button type="button" variant="primary" onClick={usarCusto}>
            Usar este custo ({currency(resultado.custo_total)})
          </Button>
        )}
      </div>
      {error && <p className="text-danger">{error}</p>}
      {resultado && !resultado.tem_roteiro && (
        <p className="text-text-muted">Este item não tem roteiro produtivo ativo cadastrado — mão de obra continua manual.</p>
      )}
      {resultado?.tem_roteiro && (
        <div className="flex flex-col gap-0.5">
          {(resultado.operacoes ?? []).map((o) => (
            <div key={o.operacao_id} className="flex justify-between">
              <span>
                {o.sequencia}. {o.descricao} ({o.recurso_nome}, {o.tempo_previsto_minutos}min × {currency(o.custo_hora ?? 0)}/h)
              </span>
              <span>{currency(o.custo_operacao ?? 0)}</span>
            </div>
          ))}
          {(resultado.operacoes_sem_custo ?? []).length > 0 && (
            <p className="text-danger">
              Sem custo calculável:{" "}
              {(resultado.operacoes_sem_custo ?? [])
                .map((o) => `${o.sequencia}. ${o.descricao} (${MOTIVO_OPERACAO_LABEL[o.motivo ?? ""] ?? o.motivo})`)
                .join(", ")}{" "}
              — não entram no total acima.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
