"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  upsertOrcamentoAction,
  upsertOrcamentoItemAction,
  removeOrcamentoItemAction,
  decidirOrcamentoAction,
  cancelarOrcamentoAction,
  vincularOportunidadeOrcamentoAction,
  definirValorCaracteristicaOrcamentoAction,
  calcularCustoOrcamentoItemAction,
  calcularMaoObraOrcamentoItemAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";

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
  pecaIdPorItemId,
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
  pecaIdPorItemId: Map<string, string>;
  caracteristicasPorOrcamentoItem: Map<string, Caracteristica[]>;
  oportunidadesAbertas: OportunidadeResumo[];
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => todasPessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const obrasAtivas = obras.filter((o) => o.situacao === "ativo");
  const itensAtivos = itens.filter((i) => i.situacao === "ativo");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; orcamento: Orcamento } | null>(null);

  const selected = orcamentos.find((o) => o.id === selectedId) ?? null;
  const editavelSelecionado = canManage && selected?.status === "rascunho";
  const podeCancelarSelecionado = canManage && !!selected && (selected.status === "rascunho" || selected.status === "aprovado");

  function closeModal() {
    setModal(null);
  }

  function selectRow(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Orçamentos</h2>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Recorte mínimo do M1 (TÓPICO 10 §4): orçamento simples e decisão de aprovação, sem tabela
        de preços, descontos, versionamento ou proposta formal. Orçamento aprovado fica pronto
        para o módulo de Pedidos (TÓPICO 3) converter — ainda não implementado. Um orçamento em
        rascunho pode ser editado livremente; depois de decidido, é terminal (corrigir = cancelar
        e criar outro).
      </p>

      {canManage && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="primary" onClick={() => setModal({ mode: "create" })}>
            + Incluir
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!editavelSelecionado}
            onClick={() => selected && setModal({ mode: "edit", orcamento: selected })}
          >
            Editar
          </Button>
          <form action={decidirOrcamentoAction}>
            <input type="hidden" name="id" value={selected?.id ?? ""} />
            <input type="hidden" name="decisao" value="aprovado" />
            <Button type="submit" variant="primary" disabled={!editavelSelecionado}>
              Aprovar
            </Button>
          </form>
          <form action={decidirOrcamentoAction}>
            <input type="hidden" name="id" value={selected?.id ?? ""} />
            <input type="hidden" name="decisao" value="rejeitado" />
            <Button type="submit" variant="danger" disabled={!editavelSelecionado}>
              Rejeitar
            </Button>
          </form>
          <form action={cancelarOrcamentoAction}>
            <input type="hidden" name="id" value={selected?.id ?? ""} />
            <Button type="submit" variant="danger" disabled={!podeCancelarSelecionado}>
              Cancelar
            </Button>
          </form>
          <span className="ml-auto text-xs text-text-muted">
            {selected ? `${selected.numero} selecionado` : "nenhum orçamento selecionado"}
          </span>
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
                onClick={() => selectRow(orc.id)}
                className={`cursor-pointer ${selectedId === orc.id ? "bg-primary-soft" : "hover:bg-page-bg"}`}
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

      {selected && (
        <OrcamentoDetalhe
          orcamento={selected}
          orcItens={itensPorOrcamento.get(selected.id) ?? []}
          editavel={!!editavelSelecionado}
          canManage={canManage}
          itensAtivos={itensAtivos}
          itens={itens}
          pecaIdPorItemId={pecaIdPorItemId}
          caracteristicasPorOrcamentoItem={caracteristicasPorOrcamentoItem}
          oportunidadesAbertas={oportunidadesAbertas.filter((o) => o.pessoa_id === selected.pessoa_id)}
        />
      )}

      <Modal open={modal !== null} onClose={closeModal} title={modal?.mode === "edit" ? "Editar orçamento" : "Novo orçamento"}>
        {modal && (
          <OrcamentoForm
            orcamento={modal.mode === "edit" ? modal.orcamento : undefined}
            clientesElegiveis={clientesElegiveis}
            obrasAtivas={obrasAtivas}
            todasPessoas={todasPessoas}
            obras={obras}
            onSuccess={closeModal}
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

function OrcamentoDetalhe({
  orcamento,
  orcItens,
  editavel,
  canManage,
  itensAtivos,
  itens,
  pecaIdPorItemId,
  caracteristicasPorOrcamentoItem,
  oportunidadesAbertas,
}: {
  orcamento: Orcamento;
  orcItens: OrcamentoItem[];
  editavel: boolean;
  canManage: boolean;
  itensAtivos: Item[];
  itens: Item[];
  pecaIdPorItemId: Map<string, string>;
  caracteristicasPorOrcamentoItem: Map<string, Caracteristica[]>;
  oportunidadesAbertas: OportunidadeResumo[];
}) {
  return (
    <Card padding="xs" className="mt-3">
      <strong className="text-sm text-text">Itens do orçamento {orcamento.numero}</strong>

      {editavel && (
        <OportunidadeVinculoForm
          orcamentoId={orcamento.id}
          oportunidadeAtualId={orcamento.oportunidade_id}
          oportunidades={oportunidadesAbertas}
        />
      )}

      <div className="mt-2 overflow-x-auto">
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
                pecaId={pecaIdPorItemId.get(oi.item_id)}
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
              />
            )}
          </tbody>
        </Table>
      </div>
    </Card>
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
      <p className="mt-1.5 text-xs text-text-muted">
        Origem: oportunidade {op?.descricao ?? oportunidadeAtualId}
      </p>
    );
  }
  if (oportunidades.length === 0) return null;

  return (
    <form action={vincularOportunidadeOrcamentoAction} className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
  pecaId,
  caracteristicas,
}: {
  item: OrcamentoItem | null;
  orcamentoId?: string;
  itensAtivos: Item[];
  itemAtualFallback?: Item;
  itens: Item[];
  editavel: boolean;
  canManage: boolean;
  pecaId?: string;
  caracteristicas: Caracteristica[];
}) {
  const subtotal = item ? item.quantidade * item.preco_unitario : 0;
  const margem = item ? margemPercentual(item.preco_unitario, item.custo_unitario) : null;
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

  return (
    <>
      <tr>
      <Td colSpan={totalColumns}>
        <form action={upsertOrcamentoItemAction} className="flex flex-wrap items-center gap-1.5">
          {item && <input type="hidden" name="id" value={item.id} />}
          <input type="hidden" name="orcamento_id" value={item?.orcamento_id ?? orcamentoId} />
          <Select name="item_id" defaultValue={item?.item_id ?? ""} required className="min-w-40">
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
        {item && (
          <form action={removeOrcamentoItemAction} className="mt-1">
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" variant="danger">
              Remover
            </Button>
          </form>
        )}
      </Td>
      </tr>
      {item && pecaId && (
        <tr>
          <Td colSpan={totalColumns}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="font-medium text-text">Características (configurador):</span>
              {caracteristicas.length === 0 && <span>peça configurável sem características cadastradas</span>}
              {caracteristicas.map((c) => (
                <CaracteristicaOrcamentoValor key={c.peca_caracteristica_id} orcamentoItemId={item.id} caracteristica={c} />
              ))}
            </div>
          </Td>
        </tr>
      )}
      {item && pecaId && canManage && (
        <tr>
          <Td colSpan={totalColumns}>
            <CalculadoraCustoConfigurador orcamentoItemId={item.id} />
          </Td>
        </tr>
      )}
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

type ComponenteCusto = {
  item_id: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  custo_unitario?: number;
  subtotal?: number;
  comprimento_metros?: number;
  necessidade_metros?: number;
};
type CalculoCustoResultado = {
  aplica_configurador: boolean;
  custo_total?: number;
  componentes?: ComponenteCusto[];
  materiais_sem_custo?: ComponenteCusto[];
};

function CalculadoraCustoConfigurador({ orcamentoItemId }: { orcamentoItemId: string }) {
  const [resultado, setResultado] = useState<CalculoCustoResultado | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calcular() {
    setPending(true);
    setError(null);
    const r = await calcularCustoOrcamentoItemAction(orcamentoItemId);
    setPending(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setResultado(r.data as CalculoCustoResultado);
  }

  function usarCusto() {
    if (resultado?.custo_total === undefined) return;
    const campo = document.getElementById(`custo-unitario-${orcamentoItemId}`) as HTMLInputElement | null;
    if (campo) campo.value = String(resultado.custo_total);
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-border-subtle bg-page-bg p-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium text-text">Custo dimensional (ADR-012):</span>
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
      {resultado && !resultado.aplica_configurador && <p className="text-text-muted">Este item não é uma peça configurável — custo continua manual.</p>}
      {resultado?.aplica_configurador && (
        <div className="flex flex-col gap-0.5">
          {(resultado.componentes ?? []).map((c) => (
            <div key={c.item_id} className="flex justify-between">
              <span>
                {c.codigo} — {c.descricao} ({c.comprimento_metros ? `${c.quantidade} barra(s) de ${c.comprimento_metros}m` : c.quantidade})
              </span>
              <span>{currency(c.subtotal ?? 0)}</span>
            </div>
          ))}
          {(resultado.materiais_sem_custo ?? []).length > 0 && (
            <p className="text-danger">
              Sem custo cadastrado: {(resultado.materiais_sem_custo ?? []).map((m) => `${m.codigo} (${m.quantidade})`).join(", ")} — não entram no total acima.
            </p>
          )}
        </div>
      )}
    </div>
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

const MOTIVO_LABEL: Record<string, string> = {
  sem_tempo_previsto: "sem tempo previsto no roteiro",
  sem_recurso_definido: "sem recurso definido na operação",
  recurso_sem_custo_hora: "recurso sem custo/hora cadastrado",
};

// ADR-012 Fase 4 — mesmo padrão de CalculadoraCustoConfigurador: leitura
// pura, o vendedor decide se aplica o resultado (nunca autoridade cega).
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
                .map((o) => `${o.sequencia}. ${o.descricao} (${MOTIVO_LABEL[o.motivo ?? ""] ?? o.motivo})`)
                .join(", ")}{" "}
              — não entram no total acima.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CaracteristicaOrcamentoValor({
  orcamentoItemId,
  caracteristica,
}: {
  orcamentoItemId: string;
  caracteristica: Caracteristica;
}) {
  const valorAtual = caracteristica.valor_numero ?? caracteristica.valor_texto ?? "";

  return (
    <form action={definirValorCaracteristicaOrcamentoAction} className="flex items-center gap-1">
      <input type="hidden" name="orcamento_item_id" value={orcamentoItemId} />
      <input type="hidden" name="peca_caracteristica_id" value={caracteristica.peca_caracteristica_id} />
      <input type="hidden" name="tipo" value={caracteristica.tipo} />
      <span>{caracteristica.nome}:</span>
      <Input name="valor" defaultValue={valorAtual} placeholder={caracteristica.unidade ?? "valor"} className="w-24" />
      <Button type="submit" variant="primary">
        Salvar
      </Button>
    </form>
  );
}
