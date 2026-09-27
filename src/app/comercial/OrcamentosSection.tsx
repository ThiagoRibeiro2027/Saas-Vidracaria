"use client";

import { useActionState } from "react";
import {
  upsertOrcamentoAction,
  upsertOrcamentoItemAction,
  removeOrcamentoItemAction,
  decidirOrcamentoAction,
  cancelarOrcamentoAction,
  vincularOportunidadeOrcamentoAction,
  definirValorCaracteristicaOrcamentoAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";

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
  const [novoState, novoFormAction] = useActionState(upsertOrcamentoAction, undefined);

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
        <div className="mb-4">
          <h3 className="mb-1.5 text-[13px] font-medium text-text">Novo orçamento</h3>
          {clientesElegiveis.length === 0 ? (
            <p className="text-xs text-text-muted">
              Nenhuma pessoa com papel Cliente ativo — cadastre um em Cadastros antes.
            </p>
          ) : (
            <form action={novoFormAction} className="flex flex-wrap items-center gap-1.5">
              <Select name="pessoa_id" defaultValue="" required>
                <option value="" disabled>
                  Cliente
                </option>
                {clientesElegiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
              <Select name="obra_id" defaultValue="">
                <option value="">Sem obra</option>
                {obrasAtivas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome} ({pessoaNome(o.pessoa_id)})
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-1 text-xs text-text">
                Validade
                <Input name="validade" type="date" />
              </label>
              <Input name="condicao_comercial" placeholder="condição comercial" className="w-40" />
              <Input name="observacoes" placeholder="observações" className="w-44" />
              <Button type="submit" variant="primary">
                Criar orçamento
              </Button>
            </form>
          )}
          {novoState?.error && <p className="mt-1 text-xs text-danger">{novoState.error}</p>}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {orcamentos.map((orc) => {
          const orcItens = itensPorOrcamento.get(orc.id) ?? [];
          const total = totais.get(orc.id) ?? 0;
          const editavel = canManage && orc.status === "rascunho";
          // Guard de seleção atual: cliente/obra do orçamento podem ter saído
          // da lista elegível (papel desligado / obra inativada) depois que o
          // orçamento foi criado. Sem incluir a opção atual, o <select> cai
          // silenciosamente na primeira opção da lista e salvar qualquer
          // outro campo do cabeçalho reatribui o orçamento por engano (mesmo
          // problema já resolvido em cadastros/ObrasSection.tsx).
          const pessoaAtual = todasPessoas.find((p) => p.id === orc.pessoa_id);
          const pessoaOpcoes =
            pessoaAtual && !clientesElegiveis.some((p) => p.id === pessoaAtual.id)
              ? [pessoaAtual, ...clientesElegiveis]
              : clientesElegiveis;
          const obraAtual = orc.obra_id ? obras.find((o) => o.id === orc.obra_id) : undefined;
          const obraOpcoes =
            obraAtual && !obrasAtivas.some((o) => o.id === obraAtual.id) ? [obraAtual, ...obrasAtivas] : obrasAtivas;

          return (
            <Card key={orc.id} padding="xs">
              <div className="flex flex-wrap items-baseline gap-2.5 text-xs">
                <strong className="text-[13px] text-text">{orc.numero}</strong>
                <span>{pessoaNome(orc.pessoa_id)}</span>
                <span className="text-text-muted">{obraNome(orc.obra_id)}</span>
                <span className="text-text-muted">{orc.data_orcamento}</span>
                <Badge variant={STATUS_TONE[orc.status]}>{STATUS_LABEL[orc.status]}</Badge>
                <span className="ml-auto font-semibold text-text">{currency(total)}</span>
              </div>

              {editavel && (
                <OrcamentoHeaderForm
                  orcamento={orc}
                  pessoaOpcoes={pessoaOpcoes}
                  clientesElegiveis={clientesElegiveis}
                  obraOpcoes={obraOpcoes}
                  obrasAtivas={obrasAtivas}
                  pessoaAtual={pessoaAtual}
                  obraAtual={obraAtual}
                  pessoaNome={pessoaNome}
                />
              )}

              {editavel && (
                <OportunidadeVinculoForm
                  orcamentoId={orc.id}
                  oportunidadeAtualId={orc.oportunidade_id}
                  oportunidades={oportunidadesAbertas.filter((o) => o.pessoa_id === orc.pessoa_id)}
                />
              )}

              <Table className="mt-2">
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
                      orcamentoId={orc.id}
                      itensAtivos={itensAtivos}
                      itens={itens}
                      editavel={editavel}
                      canManage={canManage}
                      caracteristicas={[]}
                    />
                  )}
                </tbody>
              </Table>

              {canManage && orc.status === "rascunho" && (
                <div className="mt-2 flex gap-1.5">
                  <form action={decidirOrcamentoAction}>
                    <input type="hidden" name="id" value={orc.id} />
                    <input type="hidden" name="decisao" value="aprovado" />
                    <Button type="submit" variant="primary">
                      Aprovar
                    </Button>
                  </form>
                  <form action={decidirOrcamentoAction}>
                    <input type="hidden" name="id" value={orc.id} />
                    <input type="hidden" name="decisao" value="rejeitado" />
                    <Button type="submit" variant="danger">
                      Rejeitar
                    </Button>
                  </form>
                  <form action={cancelarOrcamentoAction}>
                    <input type="hidden" name="id" value={orc.id} />
                    <Button type="submit" variant="danger">
                      Cancelar
                    </Button>
                  </form>
                </div>
              )}
              {canManage && orc.status === "aprovado" && (
                <div className="mt-2">
                  <form action={cancelarOrcamentoAction}>
                    <input type="hidden" name="id" value={orc.id} />
                    <Button type="submit" variant="danger">
                      Cancelar
                    </Button>
                  </form>
                </div>
              )}
            </Card>
          );
        })}
        {orcamentos.length === 0 && <p className="text-xs text-text-muted">Nenhum orçamento ainda.</p>}
      </div>
    </section>
  );
}

function OrcamentoHeaderForm({
  orcamento,
  pessoaOpcoes,
  clientesElegiveis,
  obraOpcoes,
  obrasAtivas,
  pessoaAtual,
  obraAtual,
  pessoaNome,
}: {
  orcamento: Orcamento;
  pessoaOpcoes: Pessoa[];
  clientesElegiveis: Pessoa[];
  obraOpcoes: Obra[];
  obrasAtivas: Obra[];
  pessoaAtual: Pessoa | undefined;
  obraAtual: Obra | undefined;
  pessoaNome: (id: string) => string;
}) {
  const [state, formAction] = useActionState(upsertOrcamentoAction, undefined);

  return (
    <>
      <form action={formAction} className="mt-2 flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="id" value={orcamento.id} />
        <Select name="pessoa_id" defaultValue={orcamento.pessoa_id} required>
          {pessoaOpcoes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {pessoaAtual?.id === p.id && !clientesElegiveis.some((c) => c.id === p.id)
                ? " (papel desligado)"
                : ""}
            </option>
          ))}
        </Select>
        <Select name="obra_id" defaultValue={orcamento.obra_id ?? ""}>
          <option value="">Sem obra</option>
          {obraOpcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome} ({pessoaNome(o.pessoa_id)})
              {obraAtual?.id === o.id && !obrasAtivas.some((a) => a.id === o.id) ? " (inativa)" : ""}
            </option>
          ))}
        </Select>
        <Input name="validade" type="date" defaultValue={orcamento.validade ?? ""} />
        <Input
          name="condicao_comercial"
          placeholder="condição comercial"
          defaultValue={orcamento.condicao_comercial ?? ""}
          className="w-40"
        />
        <Input
          name="observacoes"
          placeholder="observações"
          defaultValue={orcamento.observacoes ?? ""}
          className="w-44"
        />
        <Button type="submit" variant="primary">
          Salvar cabeçalho
        </Button>
      </form>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </>
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
              name="custo_unitario"
              type="number"
              step="0.01"
              min="0"
              placeholder="custo (interno)"
              defaultValue={item?.custo_unitario ?? ""}
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
    </>
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
