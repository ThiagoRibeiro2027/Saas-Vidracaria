"use client";

import { useState } from "react";
import {
  criarCotacaoDeSolicitacaoAction,
  registrarPropostaCotacaoAction,
  registrarNegociacaoCotacaoAction,
  selecionarFornecedorCotacaoAction,
  concluirSelecaoCotacaoAction,
  cancelarCotacaoAction,
  upsertAlcadaCompraAction,
  desativarAlcadaCompraAction,
  decidirEtapaAprovacaoCompraAction,
} from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Card";
import { Th, Td } from "@/components/ui/Table";
import { DenseTable, DenseTableHeaderRow } from "@/components/ui/DenseTable";

const STATUS_COT_LABEL: Record<string, string> = { aberta: "Aberta", selecionada: "Selecionada", cancelada: "Cancelada" };
const STATUS_COT_TONE: Record<string, "neutral" | "success" | "danger"> = { aberta: "neutral", selecionada: "success", cancelada: "danger" };
const STATUS_APROVACAO_LABEL: Record<string, string> = { pendente: "Pendente", aprovada: "Aprovada", rejeitada: "Rejeitada" };
const STATUS_APROVACAO_TONE: Record<string, "warning" | "success" | "danger"> = { pendente: "warning", aprovada: "success", rejeitada: "danger" };

type Cotacao = { id: string; numero: string; solicitacao_compra_id: string; status: string; aprovacao_id: string | null; motivo_cancelamento: string | null };
type CotacaoItem = { id: string; cotacao_id: string; solicitacao_compra_item_id: string };
type Proposta = {
  id: string; cotacao_item_id: string; pessoa_id: string; preco_unitario: number; desconto: number;
  impostos: number; frete: number; custo_unitario: number; prazo_entrega_dias: number | null;
  condicao_pagamento: string | null; validade: string | null;
};
type Negociacao = { id: string; cotacao_proposta_id: string; rodada: number; preco_anterior: number; preco_novo: number; observacao: string | null };
type Selecao = { id: string; cotacao_item_id: string; cotacao_proposta_id: string; quantidade: number; justificativa: string };
type Solicitacao = { id: string; numero: string; status: string };
type SolicitacaoItem = { id: string; solicitacao_compra_id: string; item_id: string; quantidade: number };
type Item = { id: string; codigo: string; descricao: string; unidade_principal: string };
type Pessoa = { id: string; nome: string; nome_fantasia: string | null };
type Aprovacao = { id: string; processo: string; entidade_id: string; valor: number; status: string };
type AprovacaoEtapa = { id: string; compra_aprovacao_id: string; ordem: number; valor_minimo: number; role_id: string; status: string; decidido_por: string | null; observacao: string | null };
type Alcada = { id: string; processo: string; ordem: number; valor_minimo: number; role_id: string; ativo: boolean };
type Role = { id: string; key: string; name: string; company_id: string | null };

export default function CotacoesSection({
  cotacoes,
  cotacaoItens,
  propostas,
  negociacoes,
  selecoes,
  solicitacoes,
  solicitacaoItens,
  itens,
  fornecedores,
  aprovacoes,
  aprovacaoEtapas,
  alcadas,
  roles,
  meusRoleIds,
  canManage,
}: {
  cotacoes: Cotacao[];
  cotacaoItens: CotacaoItem[];
  propostas: Proposta[];
  negociacoes: Negociacao[];
  selecoes: Selecao[];
  solicitacoes: Solicitacao[];
  solicitacaoItens: SolicitacaoItem[];
  itens: Item[];
  fornecedores: Pessoa[];
  aprovacoes: Aprovacao[];
  aprovacaoEtapas: AprovacaoEtapa[];
  alcadas: Alcada[];
  roles: Role[];
  meusRoleIds: Set<string>;
  canManage: boolean;
}) {
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const pessoaPorId = new Map(fornecedores.map((p) => [p.id, p]));
  const rolePorId = new Map(roles.map((r) => [r.id, r]));
  const scItemPorId = new Map(solicitacaoItens.map((si) => [si.id, si]));
  const aprovacaoPorId = new Map(aprovacoes.map((a) => [a.id, a]));
  const scPorId = new Map(solicitacoes.map((s) => [s.id, s]));

  const solicitacoesCotaveis = solicitacoes.filter((s) => s.status === "aberta");

  return (
    <div className="flex flex-col gap-7">
      <section>
        <h2 className="text-sm font-semibold text-text">Cotações</h2>
        {canManage && (
          <form action={criarCotacaoDeSolicitacaoAction} className="my-3 flex items-center gap-1.5">
            <Select name="solicitacao_compra_id" required>
              <option value="">cotar solicitação enviada…</option>
              {solicitacoesCotaveis.map((s) => (
                <option key={s.id} value={s.id}>{s.numero}</option>
              ))}
            </Select>
            <Button type="submit" variant="primary">Criar cotação</Button>
          </form>
        )}

        <div className="flex flex-col gap-3">
          {cotacoes.map((cot) => (
            <CotacaoCard
              key={cot.id}
              cot={cot}
              scNumero={scPorId.get(cot.solicitacao_compra_id)?.numero ?? "—"}
              itensCotacao={cotacaoItens.filter((ci) => ci.cotacao_id === cot.id)}
              propostas={propostas}
              negociacoes={negociacoes}
              selecoes={selecoes}
              scItemPorId={scItemPorId}
              itemPorId={itemPorId}
              pessoaPorId={pessoaPorId}
              fornecedores={fornecedores}
              aprovacao={cot.aprovacao_id ? aprovacaoPorId.get(cot.aprovacao_id) : undefined}
              etapas={cot.aprovacao_id ? aprovacaoEtapas.filter((e) => e.compra_aprovacao_id === cot.aprovacao_id) : []}
              rolePorId={rolePorId}
              meusRoleIds={meusRoleIds}
              canManage={canManage}
            />
          ))}
          {cotacoes.length === 0 && <p className="text-xs text-text-muted">Nenhuma cotação criada ainda.</p>}
        </div>
      </section>

      <AlcadaSection alcadas={alcadas} roles={roles} canManage={canManage} />
    </div>
  );
}

function CotacaoCard({
  cot,
  scNumero,
  itensCotacao,
  propostas,
  negociacoes,
  selecoes,
  scItemPorId,
  itemPorId,
  pessoaPorId,
  fornecedores,
  aprovacao,
  etapas,
  rolePorId,
  meusRoleIds,
  canManage,
}: {
  cot: Cotacao;
  scNumero: string;
  itensCotacao: CotacaoItem[];
  propostas: Proposta[];
  negociacoes: Negociacao[];
  selecoes: Selecao[];
  scItemPorId: Map<string, SolicitacaoItem>;
  itemPorId: Map<string, Item>;
  pessoaPorId: Map<string, Pessoa>;
  fornecedores: Pessoa[];
  aprovacao: Aprovacao | undefined;
  etapas: AprovacaoEtapa[];
  rolePorId: Map<string, Role>;
  meusRoleIds: Set<string>;
  canManage: boolean;
}) {
  const [cancelando, setCancelando] = useState(false);
  const emAberto = cot.status === "aberta";

  return (
    <Card padding="xs">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <strong className="text-sm text-text">{cot.numero}</strong>
        <StatusPill tone={STATUS_COT_TONE[cot.status]}>{STATUS_COT_LABEL[cot.status]}</StatusPill>
        <span className="text-text-muted">SC: {scNumero}</span>
      </div>
      {cot.status === "cancelada" && cot.motivo_cancelamento && <p className="mt-1 text-xs text-text-muted">Motivo: {cot.motivo_cancelamento}</p>}

      {itensCotacao.map((ci) => (
        <CotacaoItemBlock
          key={ci.id}
          cotacaoItem={ci}
          scItem={scItemPorId.get(ci.solicitacao_compra_item_id)}
          item={scItemPorId.get(ci.solicitacao_compra_item_id) ? itemPorId.get(scItemPorId.get(ci.solicitacao_compra_item_id)!.item_id) : undefined}
          propostas={propostas.filter((p) => p.cotacao_item_id === ci.id)}
          negociacoes={negociacoes}
          selecoes={selecoes.filter((s) => s.cotacao_item_id === ci.id)}
          pessoaPorId={pessoaPorId}
          fornecedores={fornecedores}
          emAberto={emAberto}
          canManage={canManage}
        />
      ))}

      {canManage && emAberto && (
        <div className="mt-2 flex items-center gap-1.5">
          <form action={concluirSelecaoCotacaoAction}>
            <input type="hidden" name="id" value={cot.id} />
            <Button type="submit" variant="primary" size="sm">Concluir seleção</Button>
          </form>
          {!cancelando ? (
            <Button type="button" variant="outlineDanger" size="sm" onClick={() => setCancelando(true)}>
              Cancelar cotação
            </Button>
          ) : (
            <form action={cancelarCotacaoAction} className="flex items-center gap-1" onSubmit={() => setCancelando(false)}>
              <input type="hidden" name="id" value={cot.id} />
              <Input name="motivo" placeholder="motivo (opcional)" className="w-36" />
              <Button type="submit" variant="danger" size="sm">Confirmar</Button>
            </form>
          )}
        </div>
      )}

      {aprovacao && (
        <div className="mt-2.5 rounded-md bg-page-bg p-2">
          <p className="mb-1.5 text-xs font-semibold text-text">
            Alçada: {STATUS_APROVACAO_LABEL[aprovacao.status]} — valor R$ {Number(aprovacao.valor).toFixed(2)}
          </p>
          {etapas.map((et) => {
            const podeDecidir = et.status === "pendente" && meusRoleIds.has(et.role_id) && !etapas.some((e2) => e2.ordem < et.ordem && e2.status === "pendente");
            return (
              <div key={et.id} className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-text-muted">Etapa {et.ordem} ({rolePorId.get(et.role_id)?.name ?? et.role_id}, a partir de R$ {Number(et.valor_minimo).toFixed(2)}):</span>
                <StatusPill tone={STATUS_APROVACAO_TONE[et.status]}>{STATUS_APROVACAO_LABEL[et.status]}</StatusPill>
                {podeDecidir && (
                  <>
                    <form action={decidirEtapaAprovacaoCompraAction}>
                      <input type="hidden" name="id" value={et.id} />
                      <input type="hidden" name="decisao" value="aprovar" />
                      <Button type="submit" variant="primary" size="sm">Aprovar</Button>
                    </form>
                    <form action={decidirEtapaAprovacaoCompraAction}>
                      <input type="hidden" name="id" value={et.id} />
                      <input type="hidden" name="decisao" value="rejeitar" />
                      <Button type="submit" variant="danger" size="sm">Rejeitar</Button>
                    </form>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function CotacaoItemBlock({
  cotacaoItem,
  scItem,
  item,
  propostas,
  negociacoes,
  selecoes,
  pessoaPorId,
  fornecedores,
  emAberto,
  canManage,
}: {
  cotacaoItem: CotacaoItem;
  scItem: SolicitacaoItem | undefined;
  item: Item | undefined;
  propostas: Proposta[];
  negociacoes: Negociacao[];
  selecoes: Selecao[];
  pessoaPorId: Map<string, Pessoa>;
  fornecedores: Pessoa[];
  emAberto: boolean;
  canManage: boolean;
}) {
  const [mostrarProposta, setMostrarProposta] = useState(false);
  const quantidadeSelecionada = selecoes.reduce((acc, s) => acc + Number(s.quantidade), 0);
  const propostasOrdenadas = [...propostas].sort((a, b) => a.custo_unitario - b.custo_unitario);

  return (
    <div className="mt-2 border-t border-border-subtle pt-2">
      <p className="mb-1 text-xs font-semibold text-text">
        {item ? `${item.codigo} — ${item.descricao}` : "item"} ({scItem?.quantidade ?? "—"} {item?.unidade_principal ?? ""}) —{" "}
        {quantidadeSelecionada}/{scItem?.quantidade ?? 0} selecionado
      </p>

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Fornecedor</Th>
            <Th>Preço</Th>
            <Th>Custo total</Th>
            <Th>Prazo</Th>
            <Th>Condição</Th>
            {canManage && emAberto && <Th />}
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {propostasOrdenadas.map((p) => (
            <PropostaRow
              key={p.id}
              proposta={p}
              pessoaNome={pessoaPorId.get(p.pessoa_id)?.nome_fantasia || pessoaPorId.get(p.pessoa_id)?.nome || p.pessoa_id}
              rodadas={negociacoes.filter((n) => n.cotacao_proposta_id === p.id).length}
              cotacaoItemId={cotacaoItem.id}
              emAberto={emAberto}
              canManage={canManage}
            />
          ))}
          {propostas.length === 0 && (
            <tr>
              <Td colSpan={canManage && emAberto ? 6 : 5} className="text-text-muted">
                Nenhuma proposta registrada ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>

      {canManage && emAberto && (
        <div className="mt-1">
          {!mostrarProposta ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setMostrarProposta(true)}>
              Registrar proposta
            </Button>
          ) : (
            <form action={registrarPropostaCotacaoAction} onSubmit={() => setMostrarProposta(false)} className="flex flex-wrap items-center gap-1.5">
              <input type="hidden" name="cotacao_item_id" value={cotacaoItem.id} />
              <Select name="pessoa_id" required>
                <option value="">fornecedor…</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome_fantasia || f.nome}</option>
                ))}
              </Select>
              <Input name="preco_unitario" type="number" min="0" step="0.0001" placeholder="preço" required className="w-20" />
              <Input name="desconto" type="number" min="0" step="0.0001" placeholder="desconto" className="w-20" />
              <Input name="impostos" type="number" min="0" step="0.0001" placeholder="impostos" className="w-20" />
              <Input name="frete" type="number" min="0" step="0.0001" placeholder="frete" className="w-[70px]" />
              <Input name="prazo_entrega_dias" type="number" min="0" step="1" placeholder="prazo (d)" className="w-20" />
              <Input name="condicao_pagamento" placeholder="condição" className="w-24" />
              <Input name="validade" type="date" />
              <Button type="submit" variant="primary">Salvar</Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function PropostaRow({
  proposta,
  pessoaNome,
  rodadas,
  cotacaoItemId,
  emAberto,
  canManage,
}: {
  proposta: Proposta;
  pessoaNome: string;
  rodadas: number;
  cotacaoItemId: string;
  emAberto: boolean;
  canManage: boolean;
}) {
  const [negociando, setNegociando] = useState(false);
  const [selecionando, setSelecionando] = useState(false);

  return (
    <>
      <tr>
        <Td>{pessoaNome} {rodadas > 0 && <span className="text-text-muted">({rodadas}x negociado)</span>}</Td>
        <Td>{proposta.preco_unitario}</Td>
        <Td>{proposta.custo_unitario}</Td>
        <Td>{proposta.prazo_entrega_dias ?? "—"}d</Td>
        <Td>{proposta.condicao_pagamento ?? "—"}</Td>
        {canManage && emAberto && (
          <Td className="flex gap-1">
            <Button type="button" variant="secondary" size="sm" onClick={() => setNegociando((v) => !v)}>
              Negociar
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setSelecionando((v) => !v)}>
              Selecionar
            </Button>
          </Td>
        )}
      </tr>
      {negociando && (
        <tr>
          <Td colSpan={6}>
            <form action={registrarNegociacaoCotacaoAction} onSubmit={() => setNegociando(false)} className="flex items-center gap-1.5">
              <input type="hidden" name="cotacao_proposta_id" value={proposta.id} />
              <Input name="preco_novo" type="number" min="0" step="0.0001" placeholder="novo preço" required className="w-24" />
              <Input name="condicao_nova" placeholder="nova condição (opcional)" className="w-32" />
              <Input name="observacao" placeholder="observação (opcional)" className="w-40" />
              <Button type="submit" variant="primary">Registrar negociação</Button>
            </form>
          </Td>
        </tr>
      )}
      {selecionando && (
        <tr>
          <Td colSpan={6}>
            <form action={selecionarFornecedorCotacaoAction} onSubmit={() => setSelecionando(false)} className="flex items-center gap-1.5">
              <input type="hidden" name="cotacao_item_id" value={cotacaoItemId} />
              <input type="hidden" name="cotacao_proposta_id" value={proposta.id} />
              <Input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required className="w-24" />
              <Input name="justificativa" placeholder="justificativa (obrigatória)" required className="w-56" />
              <Button type="submit" variant="primary">Confirmar seleção</Button>
            </form>
          </Td>
        </tr>
      )}
    </>
  );
}

function AlcadaSection({ alcadas, roles, canManage }: { alcadas: Alcada[]; roles: Role[]; canManage: boolean }) {
  const rolePorId = new Map(roles.map((r) => [r.id, r]));

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Alçada de compras</h2>
      <p className="mt-1 text-xs text-text-muted">
        Etapas por valor mínimo e perfil aprovador, dentro de um processo (hoje só &quot;cotacao&quot;).
        Decididas em ordem — a etapa 2 só fica decidível depois da 1 ser aprovada.
      </p>

      {canManage && (
        <form action={upsertAlcadaCompraAction} className="my-3 flex flex-wrap items-center gap-1.5">
          <Input name="processo" defaultValue="cotacao" className="w-24" />
          <Input name="ordem" type="number" min="1" step="1" placeholder="ordem" required className="w-16" />
          <Input name="valor_minimo" type="number" min="0" step="0.01" placeholder="valor mín. (R$)" required className="w-28" />
          <Select name="role_id" required>
            <option value="">perfil aprovador…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
          <Button type="submit" variant="primary">Salvar etapa</Button>
        </form>
      )}

      <DenseTable>
        <thead>
          <DenseTableHeaderRow>
            <Th>Processo</Th>
            <Th>Ordem</Th>
            <Th>A partir de</Th>
            <Th>Perfil</Th>
            <Th>Ativa</Th>
            {canManage && <Th />}
          </DenseTableHeaderRow>
        </thead>
        <tbody>
          {alcadas.map((a) => (
            <tr key={a.id}>
              <Td>{a.processo}</Td>
              <Td>{a.ordem}</Td>
              <Td>R$ {Number(a.valor_minimo).toFixed(2)}</Td>
              <Td>{rolePorId.get(a.role_id)?.name ?? a.role_id}</Td>
              <Td>
                <StatusPill tone={a.ativo ? "success" : "neutral"}>{a.ativo ? "Sim" : "Não"}</StatusPill>
              </Td>
              {canManage && (
                <Td>
                  {a.ativo && (
                    <form action={desativarAlcadaCompraAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Desativar
                      </Button>
                    </form>
                  )}
                </Td>
              )}
            </tr>
          ))}
          {alcadas.length === 0 && (
            <tr>
              <Td colSpan={canManage ? 6 : 5} className="text-text-muted">
                Nenhuma etapa de alçada configurada — cotações são aprovadas automaticamente.
              </Td>
            </tr>
          )}
        </tbody>
      </DenseTable>
    </section>
  );
}
