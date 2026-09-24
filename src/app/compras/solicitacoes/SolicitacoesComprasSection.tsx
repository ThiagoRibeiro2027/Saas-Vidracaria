"use client";

import { useState } from "react";
import {
  criarSolicitacaoCompraAction,
  adicionarItemSolicitacaoAction,
  removerItemSolicitacaoAction,
  enviarSolicitacaoCompraAction,
  cancelarSolicitacaoCompraAction,
  criarCompraDiretaAction,
  cancelarCompraDiretaAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../../configuracoes/styles";

const PRIORIDADES = [
  ["baixa", "Baixa"],
  ["normal", "Normal"],
  ["alta", "Alta"],
  ["urgente", "Urgente"],
] as const;

const MOTIVOS_DIRETA = [
  ["urgencia", "Urgência"],
  ["baixo_valor", "Baixo valor"],
  ["item_nao_recorrente", "Item não recorrente"],
  ["outro", "Outro"],
] as const;

const STATUS_SC_LABEL: Record<string, string> = { rascunho: "Rascunho", aberta: "Aberta", cancelada: "Cancelada" };
const STATUS_CD_LABEL: Record<string, string> = { registrada: "Registrada", cancelada: "Cancelada" };

type Item = { id: string; codigo: string; descricao: string; unidade_principal: string; tipo: string };
type Necessidade = { id: string; item_id: string; quantidade: number; origem: string };
type Profile = { id: string; display_name: string };
type Solicitacao = {
  id: string;
  numero: string;
  solicitante_id: string;
  setor: string | null;
  prioridade: string;
  justificativa: string | null;
  status: "rascunho" | "aberta" | "cancelada";
  motivo_cancelamento: string | null;
};
type SolicitacaoItem = {
  id: string;
  solicitacao_compra_id: string;
  item_id: string;
  quantidade: number;
  data_necessaria: string | null;
  aplicacao: string | null;
  necessidade_compra_id: string | null;
  observacoes: string | null;
};
type CompraDireta = {
  id: string;
  item_id: string;
  quantidade: number;
  motivo: string;
  justificativa: string;
  responsavel_id: string;
  necessidade_compra_id: string | null;
  status: "registrada" | "cancelada";
  motivo_cancelamento: string | null;
};

export default function SolicitacoesComprasSection({
  solicitacoes,
  itensSolicitacao,
  comprasDiretas,
  itens,
  necessidades,
  profiles,
  canManage,
}: {
  solicitacoes: Solicitacao[];
  itensSolicitacao: SolicitacaoItem[];
  comprasDiretas: CompraDireta[];
  itens: Item[];
  necessidades: Necessidade[];
  profiles: Profile[];
  canManage: boolean;
}) {
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const profilePorId = new Map(profiles.map((p) => [p.id, p]));
  const itensPorSolicitacao = new Map<string, SolicitacaoItem[]>();
  for (const it of itensSolicitacao) {
    const list = itensPorSolicitacao.get(it.solicitacao_compra_id) ?? [];
    list.push(it);
    itensPorSolicitacao.set(it.solicitacao_compra_id, list);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <section>
        <h2 style={sectionTitleStyle}>Solicitações de compra</h2>
        {canManage && (
          <form action={criarSolicitacaoCompraAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
            <input name="setor" placeholder="setor (opcional)" style={{ ...inputStyle, width: "120px" }} />
            <select name="prioridade" defaultValue="normal" style={inputStyle}>
              {PRIORIDADES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <input name="justificativa" placeholder="justificativa (opcional)" style={{ ...inputStyle, width: "200px" }} />
            <button type="submit" style={buttonStyle}>Nova solicitação</button>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {solicitacoes.map((sc) => (
            <SolicitacaoCard
              key={sc.id}
              sc={sc}
              itensSc={itensPorSolicitacao.get(sc.id) ?? []}
              itemPorId={itemPorId}
              necessidades={necessidades}
              solicitanteNome={profilePorId.get(sc.solicitante_id)?.display_name ?? "—"}
              canManage={canManage}
            />
          ))}
          {solicitacoes.length === 0 && <p style={hintStyle}>Nenhuma solicitação de compra ainda.</p>}
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Compras diretas</h2>
        <p style={hintStyle}>Bypass deliberado da SC — sempre exige motivo e justificativa.</p>

        {canManage && (
          <form action={criarCompraDiretaAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
            <select name="item_id" required style={inputStyle}>
              <option value="">item…</option>
              {itens.map((i) => (
                <option key={i.id} value={i.id}>{i.codigo} — {i.descricao}</option>
              ))}
            </select>
            <input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required style={{ ...inputStyle, width: "90px" }} />
            <select name="motivo" required style={inputStyle}>
              <option value="">motivo…</option>
              {MOTIVOS_DIRETA.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <input name="justificativa" placeholder="justificativa (obrigatória)" required style={{ ...inputStyle, width: "200px" }} />
            <select name="necessidade_compra_id" style={inputStyle}>
              <option value="">sem necessidade vinculada</option>
              {necessidades.map((n) => (
                <option key={n.id} value={n.id}>
                  {itemPorId.get(n.item_id)?.codigo ?? n.item_id} — {n.quantidade} ({n.origem})
                </option>
              ))}
            </select>
            <button type="submit" style={buttonStyle}>Registrar compra direta</button>
          </form>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>Quantidade</th>
                <th style={thStyle}>Motivo</th>
                <th style={thStyle}>Justificativa</th>
                <th style={thStyle}>Responsável</th>
                <th style={thStyle}>Status</th>
                {canManage && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {comprasDiretas.map((cd) => (
                <tr key={cd.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{itemPorId.get(cd.item_id)?.codigo ?? cd.item_id}</td>
                  <td style={tdStyle}>{cd.quantidade}</td>
                  <td style={tdStyle}>{MOTIVOS_DIRETA.find(([v]) => v === cd.motivo)?.[1] ?? cd.motivo}</td>
                  <td style={tdStyle}>{cd.justificativa}</td>
                  <td style={tdStyle}>{profilePorId.get(cd.responsavel_id)?.display_name ?? "—"}</td>
                  <td style={tdStyle}>{STATUS_CD_LABEL[cd.status]}</td>
                  {canManage && (
                    <td style={tdStyle}>
                      {cd.status === "registrada" && (
                        <form action={cancelarCompraDiretaAction}>
                          <input type="hidden" name="id" value={cd.id} />
                          <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
                            Cancelar
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {comprasDiretas.length === 0 && <p style={hintStyle}>Nenhuma compra direta registrada ainda.</p>}
        </div>
      </section>
    </div>
  );
}

function SolicitacaoCard({
  sc,
  itensSc,
  itemPorId,
  necessidades,
  solicitanteNome,
  canManage,
}: {
  sc: Solicitacao;
  itensSc: SolicitacaoItem[];
  itemPorId: Map<string, Item>;
  necessidades: Necessidade[];
  solicitanteNome: string;
  canManage: boolean;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const emRascunho = sc.status === "rascunho";

  return (
    <div style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "12px" }}>
        <strong>{sc.numero}</strong>
        <span>{STATUS_SC_LABEL[sc.status]}</span>
        <span style={{ color: "#6b7a75" }}>{sc.setor ?? "—"}</span>
        <span style={{ color: "#6b7a75" }}>prioridade: {PRIORIDADES.find(([v]) => v === sc.prioridade)?.[1] ?? sc.prioridade}</span>
        <span style={{ color: "#6b7a75" }}>solicitante: {solicitanteNome}</span>
      </div>
      {sc.justificativa && <p style={hintStyle}>{sc.justificativa}</p>}
      {sc.status === "cancelada" && sc.motivo_cancelamento && <p style={hintStyle}>Motivo do cancelamento: {sc.motivo_cancelamento}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "6px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
            <th style={thStyle}>Item</th>
            <th style={thStyle}>Qtd.</th>
            <th style={thStyle}>Necessária em</th>
            <th style={thStyle}>Necessidade vinculada</th>
            {canManage && emRascunho && <th style={thStyle}></th>}
          </tr>
        </thead>
        <tbody>
          {itensSc.map((it) => (
            <tr key={it.id}>
              <td style={tdStyle}>{itemPorId.get(it.item_id)?.codigo ?? it.item_id}</td>
              <td style={tdStyle}>{it.quantidade}</td>
              <td style={tdStyle}>{it.data_necessaria ? new Date(`${it.data_necessaria}T00:00:00`).toLocaleDateString("pt-BR") : "—"}</td>
              <td style={tdStyle}>{it.necessidade_compra_id ? "vinculada" : "—"}</td>
              {canManage && emRascunho && (
                <td style={tdStyle}>
                  <form action={removerItemSolicitacaoAction}>
                    <input type="hidden" name="id" value={it.id} />
                    <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
                      Remover
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {itensSc.length === 0 && <p style={hintStyle}>Sem itens ainda.</p>}

      {canManage && emRascunho && (
        <div style={{ marginTop: "8px" }}>
          {!mostrarForm ? (
            <button type="button" onClick={() => setMostrarForm(true)} style={{ ...buttonStyle, background: "#fff", color: "#1f5d57", border: "1px solid #dae2de" }}>
              Adicionar item
            </button>
          ) : (
            <form
              action={adicionarItemSolicitacaoAction}
              onSubmit={() => setMostrarForm(false)}
              style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
            >
              <input type="hidden" name="solicitacao_compra_id" value={sc.id} />
              <select name="item_id" required style={inputStyle}>
                <option value="">item…</option>
                {[...itemPorId.values()].map((i) => (
                  <option key={i.id} value={i.id}>{i.codigo} — {i.descricao}</option>
                ))}
              </select>
              <input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required style={{ ...inputStyle, width: "90px" }} />
              <input name="data_necessaria" type="date" style={inputStyle} />
              <input name="aplicacao" placeholder="aplicação (opcional)" style={{ ...inputStyle, width: "120px" }} />
              <select name="necessidade_compra_id" style={inputStyle}>
                <option value="">sem necessidade vinculada</option>
                {necessidades.map((n) => (
                  <option key={n.id} value={n.id}>
                    {itemPorId.get(n.item_id)?.codigo ?? n.item_id} — {n.quantidade} ({n.origem})
                  </option>
                ))}
              </select>
              <button type="submit" style={buttonStyle}>Salvar</button>
              <button type="button" onClick={() => setMostrarForm(false)} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
                Cancelar
              </button>
            </form>
          )}
        </div>
      )}

      {canManage && sc.status !== "cancelada" && (
        <div style={{ marginTop: "8px", display: "flex", gap: "6px" }}>
          {emRascunho && (
            <form action={enviarSolicitacaoCompraAction}>
              <input type="hidden" name="id" value={sc.id} />
              <button type="submit" style={buttonStyle}>Enviar</button>
            </form>
          )}
          {!cancelando ? (
            <button type="button" onClick={() => setCancelando(true)} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
              Cancelar solicitação
            </button>
          ) : (
            <form action={cancelarSolicitacaoCompraAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setCancelando(false)}>
              <input type="hidden" name="id" value={sc.id} />
              <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "140px" }} />
              <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>Confirmar</button>
              <button type="button" onClick={() => setCancelando(false)} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
                Voltar
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
