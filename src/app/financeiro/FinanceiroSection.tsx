"use client";

import { useRef, useState } from "react";
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
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  parcial: "Parcial",
  pago: "Pago",
  cancelado: "Cancelado",
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

export default function FinanceiroSection({
  titulos,
  pedidosSemTitulo,
  nomePorPedido,
  nomePorPessoa,
  contasBancarias,
  titulosPagar,
  alcadaEtapas,
  aprovacoesPendentes,
  numeroPorTituloPagar,
  statusAprovacaoPorTitulo,
  cobrancas,
  movimentacoes,
  roles,
  canManage,
  canReceber,
  canPagar,
  canAprovar,
}: {
  titulos: Titulo[];
  pedidosSemTitulo: PedidoResumo[];
  nomePorPedido: Map<string, PedidoResumo>;
  nomePorPessoa: Map<string, string>;
  contasBancarias: ContaBancaria[];
  titulosPagar: TituloPagar[];
  alcadaEtapas: AlcadaEtapa[];
  aprovacoesPendentes: AprovacaoEtapaPendente[];
  numeroPorTituloPagar: Map<string, string>;
  statusAprovacaoPorTitulo: Map<string, string>;
  cobrancas: Cobranca[];
  movimentacoes: Movimentacao[];
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

  return (
    <>
    <section>
      <h2 style={sectionTitleStyle}>Títulos financeiros</h2>
      <p style={hintStyle}>
        Recorte mínimo do MVP (ADR-002 §4.14): título a receber vinculado a pedido, gerado
        manualmente com as parcelas planejadas — a soma precisa fechar o valor do pedido. Sem
        plano de contas, contas a pagar, conciliação ou DRE.
      </p>

      {canManage && pedidosSemTitulo.length > 0 && <GerarTitulosForm pedidos={pedidosSemTitulo} />}

      <div style={{ overflowX: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Número</th>
              <th style={thStyle}>Pedido</th>
              <th style={thStyle}>Cliente</th>
              <th style={thStyle}>Parcela</th>
              <th style={thStyle}>Valor</th>
              <th style={thStyle}>Recebido</th>
              <th style={thStyle}>Saldo</th>
              <th style={thStyle}>Vencimento</th>
              <th style={thStyle}>Status</th>
              {(canManage || canReceber) && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {titulos.map((t) => {
              const pedido = nomePorPedido.get(t.pedido_id);
              // Mesmo parsing (local, não UTC) usado na exibição da data
              // logo abaixo — um new Date(t.vencimento) bare interpreta
              // "YYYY-MM-DD" como meia-noite UTC, que em UTC-3 (Brasil)
              // fica atrás da meia-noite local o dia inteiro, marcando um
              // título com vencimento hoje como "vencido" prematuramente.
              const vencido = t.status !== "pago" && t.status !== "cancelado" && new Date(`${t.vencimento}T00:00:00`) < new Date(new Date().toDateString());
              return (
                <tr key={t.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{t.numero}</td>
                  <td style={tdStyle}>{pedido?.numero ?? t.pedido_id}</td>
                  <td style={tdStyle}>{pedido ? nomePorPessoa.get(pedido.pessoa_id) ?? "—" : "—"}</td>
                  <td style={tdStyle}>{t.parcela_numero}/{t.parcela_total}</td>
                  <td style={tdStyle}>{currency(t.valor)}</td>
                  <td style={tdStyle}>{currency(t.valor_recebido)}</td>
                  <td style={tdStyle}>{currency(t.saldo_pendente)}</td>
                  <td style={tdStyle}>
                    {new Date(`${t.vencimento}T00:00:00`).toLocaleDateString("pt-BR")}
                    {vencido && <span style={{ color: "#9b2c2c" }}> (vencido)</span>}
                  </td>
                  <td style={tdStyle}>{t.status === "cancelado" ? `${STATUS_LABEL[t.status]} — ${t.motivo_cancelamento ?? ""}` : STATUS_LABEL[t.status]}</td>
                  {(canManage || canReceber) && (
                    <td style={tdStyle}>
                      {(t.status === "aberto" || t.status === "parcial") && (
                        <AcoesTitulo id={t.id} status={t.status} canManage={canManage} canReceber={canReceber} />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2 style={sectionTitleStyle}>Contas bancárias (TÓPICO 13 §6)</h2>
      <p style={hintStyle}>Cadastro de conta bancária da empresa. Nenhum provedor real conectado.</p>
      {canManage && <ContaBancariaForm />}
      <div style={{ overflowX: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Banco</th>
              <th style={thStyle}>Agência</th>
              <th style={thStyle}>Conta</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Chave PIX</th>
              <th style={thStyle}>Status</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {contasBancarias.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                <td style={tdStyle}>{c.banco}</td>
                <td style={tdStyle}>{c.agencia}</td>
                <td style={tdStyle}>{c.conta}</td>
                <td style={tdStyle}>{c.tipo_conta === "corrente" ? "Corrente" : "Poupança"}</td>
                <td style={tdStyle}>{c.pix_chave ?? "—"}</td>
                <td style={tdStyle}>{c.ativa ? "Ativa" : "Inativa"}</td>
                {canManage && (
                  <td style={tdStyle}>
                    <form action={c.ativa ? desativarContaBancariaAction : ativarContaBancariaAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" style={c.ativa ? { ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" } : buttonStyle}>
                        {c.ativa ? "Desativar" : "Ativar"}
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {contasBancarias.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={canManage ? 7 : 6}>Nenhuma conta bancária cadastrada ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2 style={sectionTitleStyle}>Alçada de pagamento — título a pagar (§6.2)</h2>
      <p style={hintStyle}>
        Sem etapa configurada, pagamento é registrado direto. Com etapa, o título precisa ser
        submetido e aprovado antes do pagamento.
      </p>
      {canManage && <AlcadaForm roles={roles} />}
      <div style={{ overflowX: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Ordem</th>
              <th style={thStyle}>A partir de</th>
              <th style={thStyle}>Perfil aprovador</th>
              <th style={thStyle}>Status</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {alcadaEtapas.map((e) => (
              <tr key={e.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                <td style={tdStyle}>{e.ordem}</td>
                <td style={tdStyle}>{currency(e.valor_minimo)}</td>
                <td style={tdStyle}>{e.roles?.name ?? "—"}</td>
                <td style={tdStyle}>{e.ativo ? "Ativa" : "Inativa"}</td>
                {canManage && (
                  <td style={tdStyle}>
                    {e.ativo && (
                      <form action={desativarAlcadaFinanceiroAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>Desativar</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {alcadaEtapas.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={canManage ? 5 : 4}>Nenhuma etapa de alçada configurada — pagamento é registrado direto.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>

    {canAprovar && (
      <section>
        <h2 style={sectionTitleStyle}>Confirmações de pagamento pendentes</h2>
        <p style={hintStyle}>Decidida em ordem: só a etapa de menor ordem ainda pendente pode ser decidida.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Título a pagar</th>
                <th style={thStyle}>Valor</th>
                <th style={thStyle}>Ordem</th>
                <th style={thStyle}>Perfil exigido</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {aprovacoesPendentes.map((ap) => (
                <tr key={ap.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{numeroPorTituloPagar.get(ap.financeiro_aprovacoes?.entidade_id ?? "") ?? "—"}</td>
                  <td style={tdStyle}>{currency(ap.financeiro_aprovacoes?.valor ?? 0)}</td>
                  <td style={tdStyle}>{ap.ordem}</td>
                  <td style={tdStyle}>{ap.roles?.name ?? "—"}</td>
                  <td style={tdStyle}>
                    <DecidirEtapaForm id={ap.id} />
                  </td>
                </tr>
              ))}
              {aprovacoesPendentes.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={5}>Nenhuma confirmação pendente.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    )}

    <section>
      <h2 style={sectionTitleStyle}>Títulos a pagar</h2>
      <p style={hintStyle}>Vinculado a pedido de compra (Suprimentos/ADR-011). Submeter à aprovação é opcional — sem alçada aplicável, o pagamento pode ser registrado direto.</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Número</th>
              <th style={thStyle}>Fornecedor</th>
              <th style={thStyle}>Saldo</th>
              <th style={thStyle}>Vencimento</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Aprovação</th>
              {(canManage || canPagar) && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {titulosPagar.map((t) => {
              const statusAprovacao = statusAprovacaoPorTitulo.get(t.id);
              return (
                <tr key={t.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{t.numero}</td>
                  <td style={tdStyle}>{t.pedidos_compra ? nomePorPessoa.get(t.pedidos_compra.pessoa_id) ?? "—" : "—"}</td>
                  <td style={tdStyle}>{currency(t.saldo_pendente)}</td>
                  <td style={tdStyle}>{new Date(`${t.vencimento}T00:00:00`).toLocaleDateString("pt-BR")}</td>
                  <td style={tdStyle}>{TITULO_PAGAR_STATUS_LABEL[t.status]}</td>
                  <td style={tdStyle}>{statusAprovacao ? APROVACAO_STATUS_LABEL[statusAprovacao] ?? statusAprovacao : "—"}</td>
                  {(canManage || canPagar) && (t.status === "aberto" || t.status === "parcial") && (
                    <td style={tdStyle}>
                      <AcoesTituloPagar
                        titulo={t}
                        statusAprovacao={statusAprovacao}
                        contasAtivas={contasAtivas}
                        canManage={canManage}
                        canPagar={canPagar}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
            {titulosPagar.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={(canManage || canPagar) ? 7 : 6}>Nenhum título a pagar gerado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2 style={sectionTitleStyle}>Cobranças (boleto/PIX)</h2>
      <p style={hintStyle}>Sobre título a receber. Nenhum provedor bancário real conectado — sem linha digitável/QR Code de verdade.</p>
      {canManage && <GerarCobrancaForm titulosReceberAbertos={titulosReceberAbertos} contasAtivas={contasAtivas} />}
      <div style={{ overflowX: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Número</th>
              <th style={thStyle}>Título</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Valor</th>
              <th style={thStyle}>Vencimento</th>
              <th style={thStyle}>Status</th>
              {(canManage || canReceber) && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {cobrancas.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                <td style={tdStyle}>{c.numero}</td>
                <td style={tdStyle}>{c.titulos_financeiros?.numero ?? "—"}</td>
                <td style={tdStyle}>{c.tipo === "boleto" ? "Boleto" : "PIX"}</td>
                <td style={tdStyle}>{currency(c.valor)}</td>
                <td style={tdStyle}>{new Date(`${c.vencimento}T00:00:00`).toLocaleDateString("pt-BR")}</td>
                <td style={tdStyle}>{COBRANCA_STATUS_LABEL[c.status]}</td>
                {(canManage || canReceber) && c.status === "gerada" && (
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {canReceber && (
                        <form action={marcarCobrancaPagaAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" style={buttonStyle}>Marcar paga</button>
                        </form>
                      )}
                      {canManage && (
                        <form action={cancelarCobrancaAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>Cancelar</button>
                        </form>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {cobrancas.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={(canManage || canReceber) ? 7 : 6}>Nenhuma cobrança gerada ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2 style={sectionTitleStyle}>Movimentação bancária e conciliação (§6.1)</h2>
      <p style={hintStyle}>Lançamento manual — sem extrato real importado. Conciliação manual: vincule à mão a um título ou cobrança.</p>
      {canManage && <MovimentacaoForm contasAtivas={contasAtivas} />}
      <div style={{ overflowX: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Data</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Valor</th>
              <th style={thStyle}>Descrição</th>
              <th style={thStyle}>Conciliação</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {movimentacoes.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                <td style={tdStyle}>{new Date(`${m.data_movimento}T00:00:00`).toLocaleDateString("pt-BR")}</td>
                <td style={tdStyle}>{m.tipo === "credito" ? "Crédito" : "Débito"}</td>
                <td style={tdStyle}>{currency(m.valor)}</td>
                <td style={tdStyle}>{m.descricao ?? "—"}</td>
                <td style={tdStyle}>{m.conciliado ? `Conciliada (${m.conciliado_com_tipo})` : "Pendente"}</td>
                {canManage && (
                  <td style={tdStyle}>
                    <AcoesMovimentacao
                      movimentacao={m}
                      titulosReceberAbertos={titulosReceberAbertos}
                      titulosPagarAbertos={titulosPagarAbertos}
                      cobrancasGeradas={cobrancasGeradas}
                    />
                  </td>
                )}
              </tr>
            ))}
            {movimentacoes.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={canManage ? 6 : 5}>Nenhuma movimentação registrada ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
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
    <form action={gerarTitulosPedidoAction} style={{ display: "flex", flexDirection: "column", gap: "8px", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <select name="pedido_id" required style={inputStyle}>
          <option value="">pedido liberado…</option>
          {pedidos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.numero}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setParcelas((rows) => [...rows, { key: nextKeyRef.current++ }])} style={{ ...buttonStyle, background: "#fff", color: "#1f5d57", border: "1px solid #1f5d57" }}>
          + parcela
        </button>
      </div>

      {parcelas.map((row, i) => (
        <div key={row.key} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input name="parcela_valor" type="number" min="0" step="0.01" placeholder="valor" required style={{ ...inputStyle, width: "100px" }} />
          <input name="parcela_vencimento" type="date" required style={inputStyle} />
          <input name="parcela_condicao" placeholder="condição (opcional)" style={{ ...inputStyle, width: "120px" }} />
          {parcelas.length > 1 && (
            <button type="button" onClick={() => setParcelas((rows) => rows.filter((_, idx) => idx !== i))} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
              remover
            </button>
          )}
        </div>
      ))}

      <button type="submit" style={{ ...buttonStyle, width: "fit-content" }}>
        Gerar título(s)
      </button>
    </form>
  );
}

function AcoesTitulo({ id, status, canManage, canReceber }: { id: string; status: "aberto" | "parcial"; canManage: boolean; canReceber: boolean }) {
  const [modo, setModo] = useState<"nenhum" | "receber" | "cancelar">("nenhum");

  if (modo === "receber") {
    return (
      <form action={registrarRecebimentoTituloAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={id} />
        <input name="valor" type="number" min="0" step="0.01" placeholder="valor" required style={{ ...inputStyle, width: "80px" }} />
        <input name="data_recebimento" type="date" style={inputStyle} />
        <button type="submit" style={buttonStyle}>
          Confirmar
        </button>
        <button type="button" onClick={() => setModo("nenhum")} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
          Voltar
        </button>
      </form>
    );
  }

  if (modo === "cancelar") {
    return (
      <form action={cancelarTituloFinanceiroAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={id} />
        <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "120px" }} />
        <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>
          Confirmar
        </button>
        <button type="button" onClick={() => setModo("nenhum")} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
          Voltar
        </button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", gap: "4px" }}>
      {canReceber && (
        <button onClick={() => setModo("receber")} style={buttonStyle}>
          Receber
        </button>
      )}
      {canManage && status === "aberto" && (
        <button onClick={() => setModo("cancelar")} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
          Cancelar
        </button>
      )}
    </div>
  );
}

function ContaBancariaForm() {
  return (
    <form action={configurarContaBancariaAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}>
      <input name="banco" placeholder="banco" required style={{ ...inputStyle, width: "140px" }} />
      <input name="agencia" placeholder="agência" required style={{ ...inputStyle, width: "80px" }} />
      <input name="conta" placeholder="conta" required style={{ ...inputStyle, width: "100px" }} />
      <select name="tipo_conta" required style={inputStyle}>
        <option value="corrente">Corrente</option>
        <option value="poupanca">Poupança</option>
      </select>
      <input name="pix_chave" placeholder="chave PIX (opcional)" style={{ ...inputStyle, width: "160px" }} />
      <button type="submit" style={buttonStyle}>Salvar</button>
    </form>
  );
}

function AlcadaForm({ roles }: { roles: RoleOption[] }) {
  return (
    <form action={upsertAlcadaFinanceiroAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}>
      <input type="hidden" name="processo" value="titulo_pagar" />
      <input name="ordem" type="number" min="1" placeholder="ordem" required style={{ ...inputStyle, width: "70px" }} />
      <input name="valor_minimo" type="number" min="0" step="0.01" placeholder="a partir de (R$)" required style={{ ...inputStyle, width: "130px" }} />
      <select name="role_id" required style={inputStyle}>
        <option value="">perfil aprovador…</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <button type="submit" style={buttonStyle}>Salvar</button>
    </form>
  );
}

function DecidirEtapaForm({ id }: { id: string }) {
  const [pendente, setPendente] = useState(false);
  return (
    <form action={decidirEtapaAprovacaoFinanceiroAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setPendente(true)}>
      <input type="hidden" name="id" value={id} />
      <input name="observacao" placeholder="observação (opcional)" style={{ ...inputStyle, width: "140px" }} />
      <button type="submit" name="decisao" value="aprovar" disabled={pendente} style={buttonStyle}>Aprovar</button>
      <button type="submit" name="decisao" value="rejeitar" disabled={pendente} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>Rejeitar</button>
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
      <form action={registrarPagamentoTituloCompraAction} style={{ display: "flex", flexWrap: "wrap", gap: "4px" }} onSubmit={() => setModoPagar(false)}>
        <input type="hidden" name="id" value={titulo.id} />
        <input name="valor" type="number" min="0" step="0.01" defaultValue={titulo.saldo_pendente} required style={{ ...inputStyle, width: "90px" }} />
        <input name="data_pagamento" type="date" style={inputStyle} />
        <select name="conta_bancaria_id" style={inputStyle}>
          <option value="">conta (opcional)…</option>
          {contasAtivas.map((c) => (
            <option key={c.id} value={c.id}>{c.banco} {c.conta}</option>
          ))}
        </select>
        <select name="forma_pagamento" style={inputStyle}>
          <option value="">forma (opcional)…</option>
          <option value="boleto">Boleto</option>
          <option value="pix">PIX</option>
          <option value="ted">TED</option>
          <option value="outro">Outro</option>
        </select>
        <button type="submit" style={buttonStyle}>Confirmar</button>
        <button type="button" onClick={() => setModoPagar(false)} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>Voltar</button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", gap: "4px" }}>
      {canManage && !statusAprovacao && (
        <form action={submeterPagamentoTituloAction}>
          <input type="hidden" name="id" value={titulo.id} />
          <button type="submit" style={buttonStyle}>Submeter à aprovação</button>
        </form>
      )}
      {canManage && statusAprovacao === "rejeitada" && (
        <form action={submeterPagamentoTituloAction}>
          <input type="hidden" name="id" value={titulo.id} />
          <button type="submit" style={buttonStyle}>Ressubmeter à aprovação</button>
        </form>
      )}
      {canPagar && !bloqueadoPorAprovacao && (
        <button onClick={() => setModoPagar(true)} style={buttonStyle}>Registrar pagamento</button>
      )}
    </div>
  );
}

function GerarCobrancaForm({ titulosReceberAbertos, contasAtivas }: { titulosReceberAbertos: Titulo[]; contasAtivas: ContaBancaria[] }) {
  if (titulosReceberAbertos.length === 0 || contasAtivas.length === 0) {
    return <p style={hintStyle}>Precisa de ao menos um título a receber aberto e uma conta bancária ativa pra gerar cobrança.</p>;
  }
  return (
    <form action={gerarCobrancaAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}>
      <select name="titulo_id" required style={inputStyle}>
        <option value="">título a receber…</option>
        {titulosReceberAbertos.map((t) => (
          <option key={t.id} value={t.id}>{t.numero} — {currency(t.saldo_pendente)}</option>
        ))}
      </select>
      <select name="conta_bancaria_id" required style={inputStyle}>
        <option value="">conta bancária…</option>
        {contasAtivas.map((c) => (
          <option key={c.id} value={c.id}>{c.banco} {c.conta}</option>
        ))}
      </select>
      <select name="tipo" required style={inputStyle}>
        <option value="boleto">Boleto</option>
        <option value="pix">PIX</option>
      </select>
      <button type="submit" style={buttonStyle}>Gerar cobrança</button>
    </form>
  );
}

function MovimentacaoForm({ contasAtivas }: { contasAtivas: ContaBancaria[] }) {
  if (contasAtivas.length === 0) {
    return <p style={hintStyle}>Cadastre uma conta bancária ativa pra registrar movimentação.</p>;
  }
  return (
    <form action={registrarMovimentacaoBancariaAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}>
      <select name="conta_bancaria_id" required style={inputStyle}>
        <option value="">conta bancária…</option>
        {contasAtivas.map((c) => (
          <option key={c.id} value={c.id}>{c.banco} {c.conta}</option>
        ))}
      </select>
      <select name="tipo" required style={inputStyle}>
        <option value="credito">Crédito</option>
        <option value="debito">Débito</option>
      </select>
      <input name="valor" type="number" min="0" step="0.01" placeholder="valor" required style={{ ...inputStyle, width: "90px" }} />
      <input name="data_movimento" type="date" required style={inputStyle} />
      <input name="descricao" placeholder="descrição (opcional)" style={{ ...inputStyle, width: "160px" }} />
      <button type="submit" style={buttonStyle}>Registrar</button>
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
        <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>Desconciliar</button>
      </form>
    );
  }

  const opcoes = tipoAlvo === "titulo_receber" ? titulosReceberAbertos : tipoAlvo === "titulo_pagar" ? titulosPagarAbertos : cobrancasGeradas;

  return (
    <form action={conciliarMovimentacaoAction} style={{ display: "flex", gap: "4px" }}>
      <input type="hidden" name="id" value={movimentacao.id} />
      <select name="tipo_alvo" value={tipoAlvo} onChange={(e) => setTipoAlvo(e.target.value as typeof tipoAlvo)} style={inputStyle}>
        <option value="titulo_receber">Título a receber</option>
        <option value="titulo_pagar">Título a pagar</option>
        <option value="cobranca">Cobrança</option>
      </select>
      <select name="alvo_id" required style={inputStyle}>
        <option value="">selecione…</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>{o.numero}</option>
        ))}
      </select>
      <button type="submit" style={buttonStyle}>Conciliar</button>
    </form>
  );
}
