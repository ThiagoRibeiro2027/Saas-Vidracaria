"use client";

import { Fragment, useRef, useState } from "react";
import {
  ativarContaBancariaAction,
  cancelarCobrancaAction,
  cancelarTituloFinanceiroAction,
  conciliarMovimentacaoAction,
  configurarContaBancariaAction,
  decidirEtapaAprovacaoFinanceiroAction,
  desativarAlcadaFinanceiroAction,
  desativarContaBancariaAction,
  desconciliarMovimentacaoAction,
  gerarCobrancaAction,
  gerarTitulosPedidoAction,
  marcarCobrancaPagaAction,
  registrarMovimentacaoBancariaAction,
  registrarPagamentoTituloCompraAction,
  registrarRecebimentoTituloAction,
  submeterPagamentoTituloAction,
  upsertAlcadaFinanceiroAction,
} from "./actions";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Th, Td } from "@/components/ui/Table";
import { Paginacao } from "@/components/ui/Paginacao";
import type { Paginacao as PaginacaoInfo } from "@/lib/paginacao";
import { formatarData, parseDataLocal } from "@/lib/formato/data";

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  parcial: "Parcial",
  pago: "Pago",
  cancelado: "Cancelado",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  aberto: "neutral",
  parcial: "warning",
  pago: "success",
  cancelado: "danger",
};

type Titulo = {
  id: string;
  pedido_id: string;
  numero: string;
  valor: number;
  valor_recebido: number;
  saldo_pendente: number;
  vencimento: string;
  condicao_pagamento: string | null;
  parcela_numero: number;
  parcela_total: number;
  status: "aberto" | "parcial" | "pago" | "cancelado";
  motivo_cancelamento: string | null;
};

type PedidoResumo = { id: string; numero: string; pessoa_id: string };

const TITULO_PAGAR_STATUS_LABEL: Record<string, string> = { aberto: "Aberto", parcial: "Parcial", pago: "Pago", cancelado: "Cancelado" };
const APROVACAO_STATUS_LABEL: Record<string, string> = { pendente: "Em aprovação", aprovada: "Aprovada", rejeitada: "Rejeitada" };
const COBRANCA_STATUS_LABEL: Record<string, string> = { gerada: "Gerada", paga: "Paga", vencida: "Vencida", cancelada: "Cancelada" };

type ContaBancaria = { id: string; banco: string; agencia: string; conta: string; tipo_conta: "corrente" | "poupanca"; pix_chave: string | null; ativa: boolean };

type TituloPagar = {
  id: string;
  numero: string;
  valor: number;
  valor_pago: number;
  saldo_pendente: number;
  vencimento: string;
  status: "aberto" | "parcial" | "pago" | "cancelado";
  pedidos_compra: { numero: string; pessoa_id: string } | null;
};

type AlcadaEtapa = { id: string; ordem: number; valor_minimo: number; role_id: string; ativo: boolean; roles: { name: string } | null };

type AprovacaoEtapaPendente = {
  id: string;
  ordem: number;
  valor_minimo: number;
  roles: { name: string } | null;
  financeiro_aprovacoes: { entidade_id: string; valor: number; processo: string } | null;
};

type Cobranca = {
  id: string;
  numero: string;
  tipo: "boleto" | "pix";
  valor: number;
  vencimento: string;
  status: "gerada" | "paga" | "vencida" | "cancelada";
  titulo_id: string;
  titulos_financeiros: { numero: string } | null;
};

type Movimentacao = {
  id: string;
  conta_bancaria_id: string;
  tipo: "credito" | "debito";
  valor: number;
  data_movimento: string;
  descricao: string | null;
  conciliado: boolean;
  conciliado_com_tipo: "titulo_receber" | "titulo_pagar" | "cobranca" | null;
  conciliado_com_id: string | null;
};

type RoleOption = { id: string; name: string };

// 2026-10-04: mesmo tratamento de layout já aplicado nos demais módulos
// — as 4 listas que crescem (títulos a receber/pagar, cobranças,
// movimentações) paginadas no servidor, cada linha compacta e clicável
// pra ver detalhes/ações, em vez de todas as ações sempre visíveis na
// linha. Também migra as seções que ainda usavam estilo antigo (inline
// style) pros mesmos componentes do resto do app (Table/Button/Input).
export default function FinanceiroSection({
  titulos,
  trPaginacao,
  pedidosSemTitulo,
  nomePorPedido,
  nomePorPessoa,
  contasBancarias,
  titulosPagar,
  tpPaginacao,
  alcadaEtapas,
  aprovacoesPendentes,
  numeroPorTituloPagar,
  statusAprovacaoPorTitulo,
  cobrancas,
  cbPaginacao,
  movimentacoes,
  mvPaginacao,
  roles,
  canManage,
  canReceber,
  canPagar,
  canAprovar,
}: {
  titulos: Titulo[];
  trPaginacao: PaginacaoInfo;
  pedidosSemTitulo: PedidoResumo[];
  nomePorPedido: Map<string, PedidoResumo>;
  nomePorPessoa: Map<string, string>;
  contasBancarias: ContaBancaria[];
  titulosPagar: TituloPagar[];
  tpPaginacao: PaginacaoInfo;
  alcadaEtapas: AlcadaEtapa[];
  aprovacoesPendentes: AprovacaoEtapaPendente[];
  numeroPorTituloPagar: Map<string, string>;
  statusAprovacaoPorTitulo: Map<string, string>;
  cobrancas: Cobranca[];
  cbPaginacao: PaginacaoInfo;
  movimentacoes: Movimentacao[];
  mvPaginacao: PaginacaoInfo;
  roles: RoleOption[];
  canManage: boolean;
  canReceber: boolean;
  canPagar: boolean;
  canAprovar: boolean;
}) {
  const contasAtivas = contasBancarias.filter((c) => c.ativa);
  const titulosReceberAbertos = titulos.filter((t) => t.status === "aberto" || t.status === "parcial");
  const titulosPagarAbertos = titulosPagar.filter((t) => t.status === "aberto" || t.status === "parcial");
  const cobrancasGeradas = cobrancas.filter((c) => c.status === "gerada");

  const [expTitulo, setExpTitulo] = useState<string | null>(null);
  const [expTituloPagar, setExpTituloPagar] = useState<string | null>(null);
  const [expCobranca, setExpCobranca] = useState<string | null>(null);
  const [expMovimentacao, setExpMovimentacao] = useState<string | null>(null);

  return (
    <>
      <section>
        <h2 className="text-sm font-semibold text-text">Títulos financeiros</h2>
        <p className="mt-1 text-xs text-text-muted">
          Recorte mínimo do MVP (ADR-002 §4.14): título a receber vinculado a pedido, gerado
          manualmente com as parcelas planejadas — a soma precisa fechar o valor do pedido. Sem
          plano de contas, contas a pagar, conciliação ou DRE. Clique num título para ver ações.
        </p>

        {canManage && pedidosSemTitulo.length > 0 && (
          <div className="mt-3">
            <GerarTitulosForm pedidos={pedidosSemTitulo} />
          </div>
        )}

        <div className="mt-3 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Pedido</Th>
                <Th>Cliente</Th>
                <Th>Parcela</Th>
                <Th>Saldo</Th>
                <Th>Vencimento</Th>
                <Th>Status</Th>
                <Th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {titulos.map((t) => {
                const pedido = nomePorPedido.get(t.pedido_id);
                // parseDataLocal (e não new Date(t.vencimento) bare) pelo
                // mesmo motivo da exibição: lido como UTC, um vencimento de
                // hoje fica atrás da meia-noite local o dia inteiro e o
                // título aparece como vencido antes da hora.
                const vencido = t.status !== "pago" && t.status !== "cancelado" && parseDataLocal(t.vencimento) < new Date(new Date().toDateString());
                const expandido = expTitulo === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr onClick={() => setExpTitulo((atual) => (atual === t.id ? null : t.id))} className="cursor-pointer hover:bg-page-bg">
                      <Td>{t.numero}</Td>
                      <Td>{pedido?.numero ?? t.pedido_id}</Td>
                      <Td>{pedido ? nomePorPessoa.get(pedido.pessoa_id) ?? "—" : "—"}</Td>
                      <Td>{t.parcela_numero}/{t.parcela_total}</Td>
                      <Td>{currency(t.saldo_pendente)}</Td>
                      <Td>
                        {formatarData(t.vencimento)}
                        {vencido && <span className="text-danger"> (vencido)</span>}
                      </Td>
                      <Td>
                        <Badge variant={STATUS_TONE[t.status]}>
                          {t.status === "cancelado" ? `${STATUS_LABEL[t.status]} — ${t.motivo_cancelamento ?? ""}` : STATUS_LABEL[t.status]}
                        </Badge>
                      </Td>
                      <Td className="text-text-muted">{expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                    </tr>
                    {expandido && (
                      <tr>
                        <Td colSpan={8} className="bg-page-bg">
                          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                            <div>
                              <dt className="text-text-muted">Valor</dt>
                              <dd className="text-text">{currency(t.valor)}</dd>
                            </div>
                            <div>
                              <dt className="text-text-muted">Recebido</dt>
                              <dd className="text-text">{currency(t.valor_recebido)}</dd>
                            </div>
                            {t.condicao_pagamento && (
                              <div>
                                <dt className="text-text-muted">Condição</dt>
                                <dd className="text-text">{t.condicao_pagamento}</dd>
                              </div>
                            )}
                          </dl>
                          {(canManage || canReceber) && (t.status === "aberto" || t.status === "parcial") && (
                            <div className="mt-2">
                              <AcoesTitulo id={t.id} status={t.status} canManage={canManage} canReceber={canReceber} />
                            </div>
                          )}
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {titulos.length === 0 && (
                <tr>
                  <Td colSpan={8} className="text-text-muted">
                    Nenhum título a receber ainda.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
          <Paginacao {...trPaginacao} paramPagina="tr_pagina" paramPorPagina="tr_por_pagina" />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-text">Contas bancárias</h2>
        <p className="mt-1 text-xs text-text-muted">Cadastro de conta bancária da empresa. Nenhum provedor real conectado.</p>
        {canManage && <ContaBancariaForm />}
        <div className="mt-3 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Banco</Th>
                <Th>Agência</Th>
                <Th>Conta</Th>
                <Th>Tipo</Th>
                <Th>Chave PIX</Th>
                <Th>Status</Th>
                {canManage && <Th />}
              </tr>
            </thead>
            <tbody>
              {contasBancarias.map((c) => (
                <tr key={c.id}>
                  <Td>{c.banco}</Td>
                  <Td>{c.agencia}</Td>
                  <Td>{c.conta}</Td>
                  <Td>{c.tipo_conta === "corrente" ? "Corrente" : "Poupança"}</Td>
                  <Td>{c.pix_chave ?? "—"}</Td>
                  <Td>
                    <Badge variant={c.ativa ? "success" : "neutral"}>{c.ativa ? "Ativa" : "Inativa"}</Badge>
                  </Td>
                  {canManage && (
                    <Td>
                      <form action={c.ativa ? desativarContaBancariaAction : ativarContaBancariaAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant={c.ativa ? "outlineDanger" : "primary"} size="sm">
                          {c.ativa ? "Desativar" : "Ativar"}
                        </Button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
              {contasBancarias.length === 0 && (
                <tr>
                  <Td colSpan={canManage ? 7 : 6} className="text-text-muted">
                    Nenhuma conta bancária cadastrada ainda.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-text">Alçada de pagamento — título a pagar</h2>
        <p className="mt-1 text-xs text-text-muted">
          Sem etapa configurada, pagamento é registrado direto. Com etapa, o título precisa ser
          submetido e aprovado antes do pagamento.
        </p>
        {canManage && <AlcadaForm roles={roles} />}
        <div className="mt-3 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Ordem</Th>
                <Th>A partir de</Th>
                <Th>Perfil aprovador</Th>
                <Th>Status</Th>
                {canManage && <Th />}
              </tr>
            </thead>
            <tbody>
              {alcadaEtapas.map((e) => (
                <tr key={e.id}>
                  <Td>{e.ordem}</Td>
                  <Td>{currency(e.valor_minimo)}</Td>
                  <Td>{e.roles?.name ?? "—"}</Td>
                  <Td>
                    <Badge variant={e.ativo ? "success" : "neutral"}>{e.ativo ? "Ativa" : "Inativa"}</Badge>
                  </Td>
                  {canManage && (
                    <Td>
                      {e.ativo && (
                        <form action={desativarAlcadaFinanceiroAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <Button type="submit" variant="outlineDanger" size="sm">
                            Desativar
                          </Button>
                        </form>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
              {alcadaEtapas.length === 0 && (
                <tr>
                  <Td colSpan={canManage ? 5 : 4} className="text-text-muted">
                    Nenhuma etapa de alçada configurada — pagamento é registrado direto.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </section>

      {canAprovar && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-text">Confirmações de pagamento pendentes</h2>
          <p className="mt-1 text-xs text-text-muted">Decidida em ordem: só a etapa de menor ordem ainda pendente pode ser decidida.</p>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Título a pagar</Th>
                  <Th>Valor</Th>
                  <Th>Ordem</Th>
                  <Th>Perfil exigido</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {aprovacoesPendentes.map((ap) => (
                  <tr key={ap.id}>
                    <Td>{numeroPorTituloPagar.get(ap.financeiro_aprovacoes?.entidade_id ?? "") ?? "—"}</Td>
                    <Td>{currency(ap.financeiro_aprovacoes?.valor ?? 0)}</Td>
                    <Td>{ap.ordem}</Td>
                    <Td>{ap.roles?.name ?? "—"}</Td>
                    <Td>
                      <DecidirEtapaForm id={ap.id} />
                    </Td>
                  </tr>
                ))}
                {aprovacoesPendentes.length === 0 && (
                  <tr>
                    <Td colSpan={5} className="text-text-muted">
                      Nenhuma confirmação pendente.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-text">Títulos a pagar</h2>
        <p className="mt-1 text-xs text-text-muted">
          Vinculado a pedido de compra (Suprimentos/ADR-011). Submeter à aprovação é opcional —
          sem alçada aplicável, o pagamento pode ser registrado direto. Clique num título para ver
          ações.
        </p>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Fornecedor</Th>
                <Th>Saldo</Th>
                <Th>Vencimento</Th>
                <Th>Status</Th>
                <Th>Aprovação</Th>
                <Th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {titulosPagar.map((t) => {
                const statusAprovacao = statusAprovacaoPorTitulo.get(t.id);
                const expandido = expTituloPagar === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr onClick={() => setExpTituloPagar((atual) => (atual === t.id ? null : t.id))} className="cursor-pointer hover:bg-page-bg">
                      <Td>{t.numero}</Td>
                      <Td>{t.pedidos_compra ? nomePorPessoa.get(t.pedidos_compra.pessoa_id) ?? "—" : "—"}</Td>
                      <Td>{currency(t.saldo_pendente)}</Td>
                      <Td>{formatarData(t.vencimento)}</Td>
                      <Td>{TITULO_PAGAR_STATUS_LABEL[t.status]}</Td>
                      <Td>{statusAprovacao ? APROVACAO_STATUS_LABEL[statusAprovacao] ?? statusAprovacao : "—"}</Td>
                      <Td className="text-text-muted">{expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                    </tr>
                    {expandido && (canManage || canPagar) && (t.status === "aberto" || t.status === "parcial") && (
                      <tr>
                        <Td colSpan={7} className="bg-page-bg">
                          <AcoesTituloPagar
                            titulo={t}
                            statusAprovacao={statusAprovacao}
                            contasAtivas={contasAtivas}
                            canManage={canManage}
                            canPagar={canPagar}
                          />
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {titulosPagar.length === 0 && (
                <tr>
                  <Td colSpan={7} className="text-text-muted">
                    Nenhum título a pagar gerado ainda.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
          <Paginacao {...tpPaginacao} paramPagina="tp_pagina" paramPorPagina="tp_por_pagina" />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-text">Cobranças (boleto/PIX)</h2>
        <p className="mt-1 text-xs text-text-muted">
          Sobre título a receber. Nenhum provedor bancário real conectado — sem linha digitável/QR
          Code de verdade. Clique numa cobrança para ver ações.
        </p>
        {canManage && <GerarCobrancaForm titulosReceberAbertos={titulosReceberAbertos} contasAtivas={contasAtivas} />}
        <div className="mt-3 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Título</Th>
                <Th>Tipo</Th>
                <Th>Valor</Th>
                <Th>Vencimento</Th>
                <Th>Status</Th>
                <Th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {cobrancas.map((c) => {
                const expandido = expCobranca === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr onClick={() => setExpCobranca((atual) => (atual === c.id ? null : c.id))} className="cursor-pointer hover:bg-page-bg">
                      <Td>{c.numero}</Td>
                      <Td>{c.titulos_financeiros?.numero ?? "—"}</Td>
                      <Td>{c.tipo === "boleto" ? "Boleto" : "PIX"}</Td>
                      <Td>{currency(c.valor)}</Td>
                      <Td>{formatarData(c.vencimento)}</Td>
                      <Td>{COBRANCA_STATUS_LABEL[c.status]}</Td>
                      <Td className="text-text-muted">{expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                    </tr>
                    {expandido && (canManage || canReceber) && c.status === "gerada" && (
                      <tr>
                        <Td colSpan={7} className="bg-page-bg">
                          <div className="flex gap-1.5">
                            {canReceber && (
                              <form action={marcarCobrancaPagaAction}>
                                <input type="hidden" name="id" value={c.id} />
                                <Button type="submit" variant="primary" size="sm">
                                  Marcar paga
                                </Button>
                              </form>
                            )}
                            {canManage && (
                              <form action={cancelarCobrancaAction}>
                                <input type="hidden" name="id" value={c.id} />
                                <Button type="submit" variant="outlineDanger" size="sm">
                                  Cancelar
                                </Button>
                              </form>
                            )}
                          </div>
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {cobrancas.length === 0 && (
                <tr>
                  <Td colSpan={7} className="text-text-muted">
                    Nenhuma cobrança gerada ainda.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
          <Paginacao {...cbPaginacao} paramPagina="cb_pagina" paramPorPagina="cb_por_pagina" />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-text">Movimentação bancária e conciliação</h2>
        <p className="mt-1 text-xs text-text-muted">
          Lançamento manual — sem extrato real importado. Conciliação manual: vincule à mão a um
          título ou cobrança. Clique numa movimentação para conciliar.
        </p>
        {canManage && <MovimentacaoForm contasAtivas={contasAtivas} />}
        <div className="mt-3 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Tipo</Th>
                <Th>Valor</Th>
                <Th>Descrição</Th>
                <Th>Conciliação</Th>
                <Th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {movimentacoes.map((m) => {
                const expandido = expMovimentacao === m.id;
                return (
                  <Fragment key={m.id}>
                    <tr onClick={() => setExpMovimentacao((atual) => (atual === m.id ? null : m.id))} className="cursor-pointer hover:bg-page-bg">
                      <Td>{formatarData(m.data_movimento)}</Td>
                      <Td>{m.tipo === "credito" ? "Crédito" : "Débito"}</Td>
                      <Td>{currency(m.valor)}</Td>
                      <Td>{m.descricao ?? "—"}</Td>
                      <Td>{m.conciliado ? `Conciliada (${m.conciliado_com_tipo})` : "Pendente"}</Td>
                      <Td className="text-text-muted">{expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>
                    </tr>
                    {expandido && canManage && (
                      <tr>
                        <Td colSpan={6} className="bg-page-bg">
                          <AcoesMovimentacao
                            movimentacao={m}
                            titulosReceberAbertos={titulosReceberAbertos}
                            titulosPagarAbertos={titulosPagarAbertos}
                            cobrancasGeradas={cobrancasGeradas}
                          />
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {movimentacoes.length === 0 && (
                <tr>
                  <Td colSpan={6} className="text-text-muted">
                    Nenhuma movimentação registrada ainda.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
          <Paginacao {...mvPaginacao} paramPagina="mv_pagina" paramPorPagina="mv_por_pagina" />
        </div>
      </section>
    </>
  );
}

function GerarTitulosForm({ pedidos }: { pedidos: PedidoResumo[] }) {
  const [parcelas, setParcelas] = useState([{ key: 0 }]);
  // useRef, não uma variável local: uma variável local reinicia a cada
  // render, então dois cliques em "+ parcela" (cada um causando um
  // re-render entre eles) geravam a mesma key (1) repetida — React
  // reconciliava errado a partir da 3ª linha (achado do code-review).
  const nextKeyRef = useRef(1);

  return (
    <form action={gerarTitulosPedidoAction} className="flex flex-col gap-2 rounded-md bg-page-bg p-3">
      <div className="flex items-center gap-1.5">
        <Select name="pedido_id" required>
          <option value="">pedido liberado…</option>
          {pedidos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.numero}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={() => setParcelas((rows) => [...rows, { key: nextKeyRef.current++ }])}
        >
          + parcela
        </Button>
      </div>

      {parcelas.map((row, i) => (
        <div key={row.key} className="flex items-center gap-1.5">
          <Input name="parcela_valor" type="number" min="0" step="0.01" placeholder="valor" required className="w-24" />
          <Input name="parcela_vencimento" type="date" required />
          <Input name="parcela_condicao" placeholder="condição (opcional)" className="w-28" />
          {parcelas.length > 1 && (
            <Button
              type="button"
              variant="outlineDanger"
              onClick={() => setParcelas((rows) => rows.filter((_, idx) => idx !== i))}
            >
              remover
            </Button>
          )}
        </div>
      ))}

      <Button type="submit" variant="primary" className="w-fit">
        Gerar título(s)
      </Button>
    </form>
  );
}

function AcoesTitulo({ id, status, canManage, canReceber }: { id: string; status: "aberto" | "parcial"; canManage: boolean; canReceber: boolean }) {
  const [modo, setModo] = useState<"nenhum" | "receber" | "cancelar">("nenhum");

  if (modo === "receber") {
    return (
      <form action={registrarRecebimentoTituloAction} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={id} />
        <Input name="valor" type="number" min="0" step="0.01" placeholder="valor" required className="w-20" />
        <Input name="data_recebimento" type="date" />
        <Button type="submit" variant="primary">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  if (modo === "cancelar") {
    return (
      <form action={cancelarTituloFinanceiroAction} className="flex items-center gap-1" onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={id} />
        <Input name="motivo" placeholder="motivo (opcional)" className="w-28" />
        <Button type="submit" variant="danger">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModo("nenhum")}>
          Voltar
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {canReceber && (
        <Button type="button" variant="primary" onClick={() => setModo("receber")}>
          Receber
        </Button>
      )}
      {canManage && status === "aberto" && (
        <Button type="button" variant="outlineDanger" onClick={() => setModo("cancelar")}>
          Cancelar
        </Button>
      )}
    </div>
  );
}

function ContaBancariaForm() {
  return (
    <form action={configurarContaBancariaAction} className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md bg-page-bg p-3">
      <Input name="banco" placeholder="banco" required className="w-36" />
      <Input name="agencia" placeholder="agência" required className="w-20" />
      <Input name="conta" placeholder="conta" required className="w-24" />
      <Select name="tipo_conta" required>
        <option value="corrente">Corrente</option>
        <option value="poupanca">Poupança</option>
      </Select>
      <Input name="pix_chave" placeholder="chave PIX (opcional)" className="w-40" />
      <Button type="submit" variant="primary">
        Salvar
      </Button>
    </form>
  );
}

function AlcadaForm({ roles }: { roles: RoleOption[] }) {
  return (
    <form action={upsertAlcadaFinanceiroAction} className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md bg-page-bg p-3">
      <input type="hidden" name="processo" value="titulo_pagar" />
      <Input name="ordem" type="number" min="1" placeholder="ordem" required className="w-16" />
      <Input name="valor_minimo" type="number" min="0" step="0.01" placeholder="a partir de (R$)" required className="w-32" />
      <Select name="role_id" required>
        <option value="">perfil aprovador…</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </Select>
      <Button type="submit" variant="primary">
        Salvar
      </Button>
    </form>
  );
}

function DecidirEtapaForm({ id }: { id: string }) {
  const [pendente, setPendente] = useState(false);
  return (
    <form action={decidirEtapaAprovacaoFinanceiroAction} className="flex items-center gap-1" onSubmit={() => setPendente(true)}>
      <input type="hidden" name="id" value={id} />
      <Input name="observacao" placeholder="observação (opcional)" className="w-36" />
      <Button type="submit" name="decisao" value="aprovar" variant="primary" disabled={pendente}>
        Aprovar
      </Button>
      <Button type="submit" name="decisao" value="rejeitar" variant="outlineDanger" disabled={pendente}>
        Rejeitar
      </Button>
    </form>
  );
}

function AcoesTituloPagar({
  titulo, statusAprovacao, contasAtivas, canManage, canPagar,
}: {
  titulo: TituloPagar;
  statusAprovacao: string | undefined;
  contasAtivas: ContaBancaria[];
  canManage: boolean;
  canPagar: boolean;
}) {
  const [modoPagar, setModoPagar] = useState(false);
  const bloqueadoPorAprovacao = statusAprovacao === "pendente" || statusAprovacao === "rejeitada";

  if (modoPagar) {
    return (
      <form action={registrarPagamentoTituloCompraAction} className="flex flex-wrap items-center gap-1.5" onSubmit={() => setModoPagar(false)}>
        <input type="hidden" name="id" value={titulo.id} />
        <Input name="valor" type="number" min="0" step="0.01" defaultValue={titulo.saldo_pendente} required className="w-24" />
        <Input name="data_pagamento" type="date" />
        <Select name="conta_bancaria_id">
          <option value="">conta (opcional)…</option>
          {contasAtivas.map((c) => (
            <option key={c.id} value={c.id}>{c.banco} {c.conta}</option>
          ))}
        </Select>
        <Select name="forma_pagamento">
          <option value="">forma (opcional)…</option>
          <option value="boleto">Boleto</option>
          <option value="pix">PIX</option>
          <option value="ted">TED</option>
          <option value="outro">Outro</option>
        </Select>
        <Button type="submit" variant="primary">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setModoPagar(false)}>
          Voltar
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canManage && !statusAprovacao && (
        <form action={submeterPagamentoTituloAction}>
          <input type="hidden" name="id" value={titulo.id} />
          <Button type="submit" variant="secondary">
            Submeter à aprovação
          </Button>
        </form>
      )}
      {canManage && statusAprovacao === "rejeitada" && (
        <form action={submeterPagamentoTituloAction}>
          <input type="hidden" name="id" value={titulo.id} />
          <Button type="submit" variant="secondary">
            Ressubmeter à aprovação
          </Button>
        </form>
      )}
      {canPagar && !bloqueadoPorAprovacao && (
        <Button type="button" variant="primary" onClick={() => setModoPagar(true)}>
          Registrar pagamento
        </Button>
      )}
    </div>
  );
}

function GerarCobrancaForm({ titulosReceberAbertos, contasAtivas }: { titulosReceberAbertos: Titulo[]; contasAtivas: ContaBancaria[] }) {
  if (titulosReceberAbertos.length === 0 || contasAtivas.length === 0) {
    return (
      <p className="mt-1 text-xs text-text-muted">
        Precisa de ao menos um título a receber aberto e uma conta bancária ativa pra gerar cobrança.
      </p>
    );
  }
  return (
    <form action={gerarCobrancaAction} className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md bg-page-bg p-3">
      <Select name="titulo_id" required>
        <option value="">título a receber…</option>
        {titulosReceberAbertos.map((t) => (
          <option key={t.id} value={t.id}>{t.numero} — {currency(t.saldo_pendente)}</option>
        ))}
      </Select>
      <Select name="conta_bancaria_id" required>
        <option value="">conta bancária…</option>
        {contasAtivas.map((c) => (
          <option key={c.id} value={c.id}>{c.banco} {c.conta}</option>
        ))}
      </Select>
      <Select name="tipo" required>
        <option value="boleto">Boleto</option>
        <option value="pix">PIX</option>
      </Select>
      <Button type="submit" variant="primary">
        Gerar cobrança
      </Button>
    </form>
  );
}

function MovimentacaoForm({ contasAtivas }: { contasAtivas: ContaBancaria[] }) {
  if (contasAtivas.length === 0) {
    return <p className="mt-1 text-xs text-text-muted">Cadastre uma conta bancária ativa pra registrar movimentação.</p>;
  }
  return (
    <form action={registrarMovimentacaoBancariaAction} className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md bg-page-bg p-3">
      <Select name="conta_bancaria_id" required>
        <option value="">conta bancária…</option>
        {contasAtivas.map((c) => (
          <option key={c.id} value={c.id}>{c.banco} {c.conta}</option>
        ))}
      </Select>
      <Select name="tipo" required>
        <option value="credito">Crédito</option>
        <option value="debito">Débito</option>
      </Select>
      <Input name="valor" type="number" min="0" step="0.01" placeholder="valor" required className="w-24" />
      <Input name="data_movimento" type="date" required />
      <Input name="descricao" placeholder="descrição (opcional)" className="w-44" />
      <Button type="submit" variant="primary">
        Registrar
      </Button>
    </form>
  );
}

function AcoesMovimentacao({
  movimentacao, titulosReceberAbertos, titulosPagarAbertos, cobrancasGeradas,
}: {
  movimentacao: Movimentacao;
  titulosReceberAbertos: Titulo[];
  titulosPagarAbertos: TituloPagar[];
  cobrancasGeradas: Cobranca[];
}) {
  const [tipoAlvo, setTipoAlvo] = useState<"titulo_receber" | "titulo_pagar" | "cobranca">("titulo_receber");

  if (movimentacao.conciliado) {
    return (
      <form action={desconciliarMovimentacaoAction}>
        <input type="hidden" name="id" value={movimentacao.id} />
        <Button type="submit" variant="outlineDanger" size="sm">
          Desconciliar
        </Button>
      </form>
    );
  }

  const opcoes = tipoAlvo === "titulo_receber" ? titulosReceberAbertos : tipoAlvo === "titulo_pagar" ? titulosPagarAbertos : cobrancasGeradas;

  return (
    <form action={conciliarMovimentacaoAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={movimentacao.id} />
      <Select name="tipo_alvo" value={tipoAlvo} onChange={(e) => setTipoAlvo(e.target.value as typeof tipoAlvo)}>
        <option value="titulo_receber">Título a receber</option>
        <option value="titulo_pagar">Título a pagar</option>
        <option value="cobranca">Cobrança</option>
      </Select>
      <Select name="alvo_id" required>
        <option value="">selecione…</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>{o.numero}</option>
        ))}
      </Select>
      <Button type="submit" variant="primary">
        Conciliar
      </Button>
    </form>
  );
}
