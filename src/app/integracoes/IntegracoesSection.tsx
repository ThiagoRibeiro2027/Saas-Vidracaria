"use client";

import { useState } from "react";
import {
  ativarIntegracaoAction,
  configurarIntegracaoAction,
  definirFonteOficialAction,
  desativarIntegracaoAction,
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

type FonteOficial = {
  id: string;
  tipo_informacao: string;
  sistema_fonte: string;
  observacoes: string | null;
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
  logs,
  canManage,
}: {
  catalogo: CatalogoItem[];
  integracoes: Integracao[];
  fontesOficiais: FonteOficial[];
  logs: LogEntry[];
  canManage: boolean;
}) {
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
                  {canManage && (
                    <td style={tdStyle}>
                      <AcoesIntegracao row={row} />
                    </td>
                  )}
                </tr>
              ))}
              {integracoes.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={canManage ? 5 : 4}>
                    Nenhuma integração configurada ainda.
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
