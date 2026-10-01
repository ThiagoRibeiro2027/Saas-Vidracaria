"use client";

import { useState } from "react";
import {
  ativarIntegracaoAction,
  ativarRegraAutomacaoAction,
  ativarWebhookSaidaAction,
  cancelarOperacaoAction,
  confirmarExecucaoRegraAction,
  configurarIntegracaoAction,
  configurarRegraAutomacaoAction,
  configurarWebhookSaidaAction,
  definirFonteOficialAction,
  desativarIntegracaoAction,
  desativarRegraAutomacaoAction,
  desativarWebhookIntegracaoAction,
  desativarWebhookSaidaAction,
  gerarWebhookIntegracaoAction,
  rejeitarExecucaoRegraAction,
  reprocessarOperacaoAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

const CATEGORIA_LABEL: Record<string, string> = {
  erp: "ERP",
  bancos: "Bancos",
  fiscal: "Fiscal",
  pagamentos: "Pagamentos",
  transportadoras: "Transportadoras",
  logistica: "Logística",
  bi: "BI",
  ecommerce: "E-commerce",
  marketplaces: "Marketplaces",
  apis: "APIs",
  outros: "Outros",
};

type CatalogoItem = {
  id: string;
  key: string;
  nome: string;
  categoria: string;
  finalidade: string | null;
  disponivel: boolean;
};

type Integracao = {
  id: string;
  catalogo_id: string;
  apelido: string | null;
  ambiente: "producao" | "homologacao" | "sandbox";
  status: "ativo" | "inativo";
  ativada_em: string | null;
  desativada_em: string | null;
  integracoes_catalogo: { key: string; nome: string; categoria: string } | null;
};

type WebhookInfo = { token: string; ativo: boolean } | null;

type FonteOficial = {
  id: string;
  tipo_informacao: string;
  sistema_fonte: string;
  observacoes: string | null;
};

const OPERACAO_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  processando: "Processando",
  concluido: "Concluído",
  erro_temporario: "Erro (vai retentar)",
  erro_permanente: "Erro permanente — intervenção necessária",
  cancelado: "Cancelado",
};

type Operacao = {
  id: string;
  tipo: string;
  status: "pendente" | "processando" | "concluido" | "erro_temporario" | "erro_permanente" | "cancelado";
  tentativas: number;
  max_tentativas: number;
  proxima_tentativa_em: string | null;
  erro: string | null;
  created_at: string;
  integracoes: { apelido: string | null; integracoes_catalogo: { nome: string } | null } | null;
};

type WebhookSaida = {
  id: string;
  integracao_id: string;
  nome: string;
  url: string;
  ativo: boolean;
};

type Regra = {
  id: string;
  nome: string;
  evento_tipo: string;
  condicao_operador: "E" | "OU";
  condicoes: { campo: string; operador: string; valor: string }[];
  nivel_automacao: "informativo" | "assistido";
  acao_tipo: "notificar" | "webhook_saida";
  acao_config: { webhook_saida_id?: string } | null;
  ativo: boolean;
};

type ExecucaoPendente = {
  id: string;
  created_at: string;
  integracao_regras: { nome: string } | null;
  integracao_operacoes: { tipo: string; payload: unknown } | null;
};

type LogEntry = {
  id: string;
  action: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export default function IntegracoesSection({
  catalogo,
  integracoes,
  fontesOficiais,
  operacoes,
  webhooksPorIntegracao,
  webhooksSaida,
  regras,
  execucoesPendentes,
  logs,
  canManage,
}: {
  catalogo: CatalogoItem[];
  integracoes: Integracao[];
  fontesOficiais: FonteOficial[];
  operacoes: Operacao[];
  webhooksPorIntegracao: Record<string, WebhookInfo>;
  webhooksSaida: WebhookSaida[];
  regras: Regra[];
  execucoesPendentes: ExecucaoPendente[];
  logs: LogEntry[];
  canManage: boolean;
}) {
  const integracoesAtivas = integracoes.filter((i) => i.status === "ativo");
  const catalogoJaConfigurado = new Set(integracoes.map((i) => i.catalogo_id));

  return (
    <>
      <section>
        <h2 style={sectionTitleStyle}>Catálogo de conectores</h2>
        <p style={hintStyle}>
          Referência global. Constar aqui não ativa nada para a empresa — só os marcados
          &ldquo;disponível&rdquo; podem, futuramente, ser integrados de verdade.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Conector</th>
                <th style={thStyle}>Categoria</th>
                <th style={thStyle}>Disponibilidade</th>
                {canManage && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {catalogo.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle} title={item.finalidade ?? undefined}>
                    {item.nome}
                  </td>
                  <td style={tdStyle}>{CATEGORIA_LABEL[item.categoria] ?? item.categoria}</td>
                  <td style={tdStyle}>{item.disponivel ? "Disponível" : "Estrutura preparada"}</td>
                  {canManage && (
                    <td style={tdStyle}>
                      {!catalogoJaConfigurado.has(item.id) && (
                        <form action={configurarIntegracaoAction} style={{ display: "flex", gap: "4px" }}>
                          <input type="hidden" name="catalogo_key" value={item.key} />
                          <button type="submit" style={buttonStyle}>
                            Configurar
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Integrações configuradas</h2>
        <p style={hintStyle}>
          Ativar/desativar não apaga dados ou histórico — só interrompe novos processamentos.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Conector</th>
                <th style={thStyle}>Apelido</th>
                <th style={thStyle}>Ambiente</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Webhook (§14)</th>
                {canManage && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {integracoes.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{row.integracoes_catalogo?.nome ?? "—"}</td>
                  <td style={tdStyle}>{row.apelido ?? "—"}</td>
                  <td style={tdStyle}>{row.ambiente}</td>
                  <td style={tdStyle}>{row.status === "ativo" ? "Ativo" : "Inativo"}</td>
                  <td style={tdStyle}>
                    <WebhookCell integracaoId={row.id} integracaoAtiva={row.status === "ativo"} webhook={webhooksPorIntegracao[row.id] ?? null} canManage={canManage} />
                  </td>
                  {canManage && (
                    <td style={tdStyle}>
                      <AcoesIntegracao row={row} />
                    </td>
                  )}
                </tr>
              ))}
              {integracoes.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={canManage ? 6 : 5}>
                    Nenhuma integração configurada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Confirmações pendentes (nível Assistido, §15)</h2>
        <p style={hintStyle}>
          Uma regra de automação detectou um evento que atende à condição configurada e está
          esperando você confirmar ou rejeitar antes de qualquer efeito externo (webhook de saída).
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Quando</th>
                <th style={thStyle}>Regra</th>
                <th style={thStyle}>Evento</th>
                {canManage && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {execucoesPendentes.map((exec) => (
                <tr key={exec.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{new Date(exec.created_at).toLocaleString("pt-BR")}</td>
                  <td style={tdStyle}>{exec.integracao_regras?.nome ?? "—"}</td>
                  <td style={tdStyle} title={JSON.stringify(exec.integracao_operacoes?.payload ?? {})}>
                    {exec.integracao_operacoes?.tipo ?? "—"}
                  </td>
                  {canManage && (
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <form action={confirmarExecucaoRegraAction}>
                          <input type="hidden" name="id" value={exec.id} />
                          <button type="submit" style={buttonStyle}>
                            Confirmar
                          </button>
                        </form>
                        <form action={rejeitarExecucaoRegraAction}>
                          <input type="hidden" name="id" value={exec.id} />
                          <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
                            Rejeitar
                          </button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {execucoesPendentes.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={canManage ? 4 : 3}>
                    Nenhuma confirmação pendente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Webhooks de saída (§14)</h2>
        <p style={hintStyle}>
          Destinos de terceiros que recebem eventos deste sistema (assinatura HMAC, mesmo esquema
          dos webhooks recebidos). Entrega real acontece 1x/dia via cron — evento fica na fila até
          lá.
        </p>
        {canManage && <WebhookSaidaForm integracoesAtivas={integracoesAtivas} />}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Nome</th>
                <th style={thStyle}>URL</th>
                <th style={thStyle}>Status</th>
                {canManage && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {webhooksSaida.map((w) => (
                <tr key={w.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{w.nome}</td>
                  <td style={tdStyle} title={w.url}>
                    {w.url.length > 40 ? `${w.url.slice(0, 40)}…` : w.url}
                  </td>
                  <td style={tdStyle}>{w.ativo ? "Ativo" : "Inativo"}</td>
                  {canManage && (
                    <td style={tdStyle}>
                      <AcoesWebhookSaida webhook={w} />
                    </td>
                  )}
                </tr>
              ))}
              {webhooksSaida.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={canManage ? 4 : 3}>
                    Nenhum webhook de saída configurado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Regras de automação — Evento → Condição → Ação (§14-15)</h2>
        <p style={hintStyle}>
          Nível Informativo só notifica (nunca tem efeito externo). Nível Assistido prepara a ação
          (webhook de saída) e espera confirmação manual em &ldquo;Confirmações pendentes&rdquo;
          acima. Nível Automático não está disponível nesta fase — exige autorização própria (§15).
        </p>
        {canManage && <RegraForm webhooksSaida={webhooksSaida.filter((w) => w.ativo)} />}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Nome</th>
                <th style={thStyle}>Evento</th>
                <th style={thStyle}>Condição</th>
                <th style={thStyle}>Nível</th>
                <th style={thStyle}>Ação</th>
                <th style={thStyle}>Status</th>
                {canManage && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {regras.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{r.nome}</td>
                  <td style={tdStyle}>{r.evento_tipo}</td>
                  <td style={tdStyle} title={JSON.stringify(r.condicoes)}>
                    {r.condicoes.map((c) => `${c.campo} ${c.operador} ${c.valor}`).join(` ${r.condicao_operador} `)}
                  </td>
                  <td style={tdStyle}>{r.nivel_automacao === "informativo" ? "Informativo" : "Assistido"}</td>
                  <td style={tdStyle}>{r.acao_tipo === "notificar" ? "Notificar" : "Webhook de saída"}</td>
                  <td style={tdStyle}>{r.ativo ? "Ativo" : "Inativo"}</td>
                  {canManage && (
                    <td style={tdStyle}>
                      <AcoesRegra regra={r} />
                    </td>
                  )}
                </tr>
              ))}
              {regras.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={canManage ? 7 : 6}>
                    Nenhuma regra configurada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Fonte oficial por tipo de informação</h2>
        <p style={hintStyle}>
          Define, por empresa, qual sistema prevalece quando dois sistemas têm a mesma informação
          (ex.: Clientes → ERP, Produção → SaaS). Sem reconciliação automática nesta fase.
        </p>
        {canManage && (
          <form
            action={definirFonteOficialAction}
            style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px", marginBottom: "10px" }}
          >
            <input name="tipo_informacao" placeholder="tipo de informação (ex.: clientes)" required style={{ ...inputStyle, width: "180px" }} />
            <input name="sistema_fonte" placeholder="sistema fonte (ex.: ERP, SaaS)" required style={{ ...inputStyle, width: "140px" }} />
            <input name="observacoes" placeholder="observações (opcional)" style={{ ...inputStyle, width: "180px" }} />
            <button type="submit" style={buttonStyle}>
              Salvar
            </button>
          </form>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Tipo de informação</th>
                <th style={thStyle}>Sistema fonte</th>
                <th style={thStyle}>Observações</th>
              </tr>
            </thead>
            <tbody>
              {fontesOficiais.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{row.tipo_informacao}</td>
                  <td style={tdStyle}>{row.sistema_fonte}</td>
                  <td style={tdStyle}>{row.observacoes ?? "—"}</td>
                </tr>
              ))}
              {fontesOficiais.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={3}>
                    Nenhuma fonte oficial configurada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Fila de operações (§16-18)</h2>
        <p style={hintStyle}>
          Fila técnica genérica com idempotência e retry. Eventos de webhook recebido (origem
          &ldquo;webhook&rdquo;) chegam aqui automaticamente; nenhum outro conector real enfileira
          nada ainda. Erro permanente exige reprocessamento manual: nunca fica escondido.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Integração</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Tentativas</th>
                <th style={thStyle}>Próxima tentativa</th>
                <th style={thStyle}>Erro</th>
                {canManage && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {operacoes.map((op) => (
                <tr key={op.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>
                    {op.integracoes?.apelido ?? op.integracoes?.integracoes_catalogo?.nome ?? "—"}
                  </td>
                  <td style={tdStyle}>{op.tipo}</td>
                  <td
                    style={{
                      ...tdStyle,
                      color: op.status === "erro_permanente" ? "#9b2c2c" : undefined,
                      fontWeight: op.status === "erro_permanente" ? 600 : undefined,
                    }}
                  >
                    {OPERACAO_STATUS_LABEL[op.status] ?? op.status}
                  </td>
                  <td style={tdStyle}>
                    {op.tentativas}/{op.max_tentativas}
                  </td>
                  <td style={tdStyle}>
                    {op.proxima_tentativa_em ? new Date(op.proxima_tentativa_em).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td style={tdStyle} title={op.erro ?? undefined}>
                    {op.erro ? (op.erro.length > 40 ? `${op.erro.slice(0, 40)}…` : op.erro) : "—"}
                  </td>
                  {canManage && (
                    <td style={tdStyle}>
                      <AcoesOperacao op={op} />
                    </td>
                  )}
                </tr>
              ))}
              {operacoes.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={canManage ? 7 : 6}>
                    Nenhuma operação registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Log recente</h2>
        <p style={hintStyle}>Últimos eventos registrados (configuração, ativação/desativação, fila).</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Quando</th>
                <th style={thStyle}>Ação</th>
                <th style={thStyle}>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{new Date(log.created_at).toLocaleString("pt-BR")}</td>
                  <td style={tdStyle}>{log.action}</td>
                  <td style={tdStyle}>{log.description ?? "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={3}>
                    Nenhum evento registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function AcoesIntegracao({ row }: { row: Integracao }) {
  const [pendente, setPendente] = useState(false);

  if (row.status === "ativo") {
    return (
      <form action={desativarIntegracaoAction} onSubmit={() => setPendente(true)}>
        <input type="hidden" name="id" value={row.id} />
        <button type="submit" disabled={pendente} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
          Desativar
        </button>
      </form>
    );
  }

  return (
    <form action={ativarIntegracaoAction} onSubmit={() => setPendente(true)}>
      <input type="hidden" name="id" value={row.id} />
      <button type="submit" disabled={pendente} style={buttonStyle}>
        Ativar
      </button>
    </form>
  );
}

function WebhookCell({
  integracaoId,
  integracaoAtiva,
  webhook,
  canManage,
}: {
  integracaoId: string;
  integracaoAtiva: boolean;
  webhook: WebhookInfo;
  canManage: boolean;
}) {
  const [revelado, setRevelado] = useState<{ token: string; secret: string } | null>(null);
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleGerar() {
    setPendente(true);
    setErro(null);
    try {
      const resultado = await gerarWebhookIntegracaoAction(integracaoId);
      setRevelado(resultado);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao gerar webhook.");
    } finally {
      setPendente(false);
    }
  }

  if (revelado) {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/integracoes/${revelado.token}`;
    return (
      <div style={{ fontSize: "11px", background: "#fff7e6", border: "1px solid #f0c36d", borderRadius: "4px", padding: "6px", maxWidth: "280px" }}>
        <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Copie agora — o segredo não será mostrado de novo.</p>
        <p style={{ margin: "0 0 2px", wordBreak: "break-all" }}>URL: {url}</p>
        <p style={{ margin: "0 0 4px", wordBreak: "break-all" }}>Segredo: {revelado.secret}</p>
        <button type="button" style={buttonStyle} onClick={() => setRevelado(null)}>
          Ok, entendi
        </button>
      </div>
    );
  }

  const status = webhook ? (webhook.ativo ? "Ativo" : "Inativo") : "Não configurado";

  if (!canManage) {
    return <span>{status}</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
      <span>{status}</span>
      {!integracaoAtiva && !webhook && (
        <span style={hintStyle}>Ative a integração para gerar um webhook.</span>
      )}
      {erro && <span style={{ fontSize: "11px", color: "#9b2c2c" }}>{erro}</span>}
      <div style={{ display: "flex", gap: "4px" }}>
        {(integracaoAtiva || webhook) && (
          <button type="button" onClick={handleGerar} disabled={pendente || (!integracaoAtiva && !webhook)} style={buttonStyle}>
            {webhook ? "Rotacionar" : "Gerar"}
          </button>
        )}
        {webhook?.ativo && (
          <form action={desativarWebhookIntegracaoAction}>
            <input type="hidden" name="id" value={integracaoId} />
            <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
              Desativar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function WebhookSaidaForm({ integracoesAtivas }: { integracoesAtivas: Integracao[] }) {
  if (integracoesAtivas.length === 0) {
    return <p style={hintStyle}>Ative alguma integração para poder configurar um webhook de saída.</p>;
  }
  return (
    <form
      action={configurarWebhookSaidaAction}
      style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px", marginBottom: "10px" }}
    >
      <select name="integracao_id" required style={inputStyle}>
        {integracoesAtivas.map((i) => (
          <option key={i.id} value={i.id}>
            {i.apelido ?? i.integracoes_catalogo?.nome ?? i.id}
          </option>
        ))}
      </select>
      <input name="nome" placeholder="nome (ex.: ERP do cliente)" required style={{ ...inputStyle, width: "160px" }} />
      <input name="url" placeholder="https://..." required style={{ ...inputStyle, width: "220px" }} />
      <input name="secret" placeholder="segredo (mín. 16 caracteres)" required style={{ ...inputStyle, width: "200px" }} />
      <button type="submit" style={buttonStyle}>
        Salvar
      </button>
    </form>
  );
}

function AcoesWebhookSaida({ webhook }: { webhook: WebhookSaida }) {
  const [pendente, setPendente] = useState(false);

  if (webhook.ativo) {
    return (
      <form action={desativarWebhookSaidaAction} onSubmit={() => setPendente(true)}>
        <input type="hidden" name="id" value={webhook.id} />
        <button type="submit" disabled={pendente} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
          Desativar
        </button>
      </form>
    );
  }

  return (
    <form action={ativarWebhookSaidaAction} onSubmit={() => setPendente(true)}>
      <input type="hidden" name="id" value={webhook.id} />
      <button type="submit" disabled={pendente} style={buttonStyle}>
        Ativar
      </button>
    </form>
  );
}

function RegraForm({ webhooksSaida }: { webhooksSaida: WebhookSaida[] }) {
  const [nivel, setNivel] = useState<"informativo" | "assistido">("informativo");

  return (
    <form
      action={configurarRegraAutomacaoAction}
      style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", background: "#f5f7f5", padding: "12px", borderRadius: "6px", marginBottom: "10px" }}
    >
      <input name="nome" placeholder="nome da regra" required style={{ ...inputStyle, width: "160px" }} />
      <input name="evento_tipo" placeholder="tipo de evento (ex.: nfe_recebida)" required style={{ ...inputStyle, width: "180px" }} />
      <select name="condicao_operador" style={inputStyle}>
        <option value="E">E (todas)</option>
        <option value="OU">OU (qualquer uma)</option>
      </select>
      <input
        name="condicoes"
        placeholder='[{"campo":"valor","operador":">","valor":"5000"}]'
        required
        style={{ ...inputStyle, width: "320px", fontFamily: "monospace" }}
      />
      <select name="nivel_automacao" value={nivel} onChange={(e) => setNivel(e.target.value as "informativo" | "assistido")} style={inputStyle}>
        <option value="informativo">Informativo (só notifica)</option>
        <option value="assistido">Assistido (aguarda confirmação)</option>
      </select>
      {nivel === "informativo" ? (
        <input type="hidden" name="acao_tipo" value="notificar" />
      ) : (
        <>
          <input type="hidden" name="acao_tipo" value="webhook_saida" />
          <select name="webhook_saida_id" required style={inputStyle}>
            <option value="">destino do webhook de saída…</option>
            {webhooksSaida.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nome}
              </option>
            ))}
          </select>
        </>
      )}
      <button type="submit" style={buttonStyle}>
        Salvar
      </button>
    </form>
  );
}

function AcoesRegra({ regra }: { regra: Regra }) {
  const [pendente, setPendente] = useState(false);

  if (regra.ativo) {
    return (
      <form action={desativarRegraAutomacaoAction} onSubmit={() => setPendente(true)}>
        <input type="hidden" name="id" value={regra.id} />
        <button type="submit" disabled={pendente} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
          Desativar
        </button>
      </form>
    );
  }

  return (
    <form action={ativarRegraAutomacaoAction} onSubmit={() => setPendente(true)}>
      <input type="hidden" name="id" value={regra.id} />
      <button type="submit" disabled={pendente} style={buttonStyle}>
        Ativar
      </button>
    </form>
  );
}

function AcoesOperacao({ op }: { op: Operacao }) {
  const [pendente, setPendente] = useState(false);
  const podeReprocessar = op.status === "erro_temporario" || op.status === "erro_permanente";
  const podeCancelar = op.status === "pendente" || op.status === "erro_temporario" || op.status === "erro_permanente";

  if (!podeReprocessar && !podeCancelar) return null;

  return (
    <div style={{ display: "flex", gap: "4px" }}>
      {podeReprocessar && (
        <form action={reprocessarOperacaoAction} onSubmit={() => setPendente(true)}>
          <input type="hidden" name="id" value={op.id} />
          <button type="submit" disabled={pendente} style={buttonStyle}>
            Reprocessar
          </button>
        </form>
      )}
      {podeCancelar && (
        <form action={cancelarOperacaoAction} onSubmit={() => setPendente(true)}>
          <input type="hidden" name="id" value={op.id} />
          <button type="submit" disabled={pendente} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
            Cancelar
          </button>
        </form>
      )}
    </div>
  );
}
