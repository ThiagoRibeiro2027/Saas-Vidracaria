"use client";

import {
  registrarInspecaoAction,
  executarRetrabalhoAction,
  reinspecionarRetrabalhoAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string };
type Pedido = { id: string; numero: string; pessoa_id: string; obra_id: string | null };
type PedidoItem = { id: string; pedido_id: string; item_id: string };
type OrdemProducao = {
  id: string;
  pedido_id: string;
  pedido_item_id: string;
  numero: string;
  quantidade_produzida: number;
  status_qualidade: "pendente" | "aprovado" | "bloqueado";
};
type InspecaoQualidade = {
  id: string;
  ordem_producao_id: string;
  nao_conformidade_id: string | null;
  quantidade_aprovada: number;
  quantidade_reprovada: number;
  resultado: "aprovado" | "reprovado";
  observacoes: string | null;
  inspecionado_em: string;
};
type NaoConformidade = {
  id: string;
  ordem_producao_id: string;
  quantidade: number;
  status: "aberta" | "encerrada";
  descricao: string | null;
  aberta_em: string;
  retrabalho_executado_em: string | null;
  retrabalho_observacao: string | null;
  encerrada_em: string | null;
};

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const STATUS_QUALIDADE_LABEL: Record<OrdemProducao["status_qualidade"], string> = {
  pendente: "Pendente de inspeção",
  aprovado: "Aprovado",
  bloqueado: "Bloqueado (não conformidade)",
};

const STATUS_QUALIDADE_COLOR: Record<OrdemProducao["status_qualidade"], string> = {
  pendente: "#b7791f",
  aprovado: "#1f5d57",
  bloqueado: "#9b2c2c",
};

export default function QualidadeSection({
  ordens,
  pedidos,
  pedidoItens,
  itens,
  pessoas,
  obras,
  inspecoesPorOrdem,
  ncsPorOrdem,
  statusQualidadeLabels,
  canManage,
}: {
  ordens: OrdemProducao[];
  pedidos: Pedido[];
  pedidoItens: PedidoItem[];
  itens: Item[];
  pessoas: Pessoa[];
  obras: Obra[];
  inspecoesPorOrdem: Map<string, InspecaoQualidade[]>;
  ncsPorOrdem: Map<string, NaoConformidade[]>;
  // TÓPICO 4 §41 (Fase 7c) — rótulo customizável por empresa, com o texto
  // fixo de STATUS_QUALIDADE_LABEL como default de quem não configurou.
  statusQualidadeLabels?: Map<string, string>;
  canManage: boolean;
}) {
  const pedidoDe = (id: string) => pedidos.find((p) => p.id === id);
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabelDoPedidoItem = (pedidoItemId: string) => {
    const pi = pedidoItens.find((p) => p.id === pedidoItemId);
    const it = pi ? itens.find((i) => i.id === pi.item_id) : undefined;
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  return (
    <section>
      <h2 style={sectionTitleStyle}>Ordens de produção concluídas</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {ordens.map((op) => {
          const pedido = pedidoDe(op.pedido_id);
          const inspecoes = inspecoesPorOrdem.get(op.id) ?? [];
          const primeiraInspecao = inspecoes.find((i) => i.nao_conformidade_id === null);
          const ncs = ncsPorOrdem.get(op.id) ?? [];
          const ncAberta = ncs.find((nc) => nc.status === "aberta");

          return (
            <div key={op.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "baseline", fontSize: "12px" }}
              >
                <strong style={{ fontSize: "13px" }}>{op.numero}</strong>
                <span>{pedido ? pedido.numero : "(pedido removido)"}</span>
                <span>{pedido ? pessoaNome(pedido.pessoa_id) : "—"}</span>
                <span style={{ color: "#6b7a75" }}>{pedido ? obraNome(pedido.obra_id) : "—"}</span>
                <span>{itemLabelDoPedidoItem(op.pedido_item_id)}</span>
                <span style={{ color: "#6b7a75" }}>Produzida: {num(op.quantidade_produzida)}</span>
                <span style={{ fontFamily: "monospace", color: STATUS_QUALIDADE_COLOR[op.status_qualidade] }}>
                  {statusQualidadeLabels?.get(op.status_qualidade) ?? STATUS_QUALIDADE_LABEL[op.status_qualidade]}
                </span>
              </div>

              {canManage && !primeiraInspecao && (
                <form
                  action={registrarInspecaoAction}
                  style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", marginTop: "8px" }}
                >
                  <input type="hidden" name="ordem_producao_id" value={op.id} />
                  <input
                    name="quantidade_aprovada"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="aprovada"
                    required
                    style={{ ...inputStyle, width: "80px" }}
                  />
                  <input
                    name="quantidade_reprovada"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="reprovada"
                    required
                    style={{ ...inputStyle, width: "80px" }}
                  />
                  <input
                    name="observacoes"
                    placeholder="observações (opcional)"
                    style={{ ...inputStyle, width: "180px" }}
                  />
                  <button type="submit" style={buttonStyle}>
                    Registrar inspeção
                  </button>
                  <span style={{ fontSize: "11px", color: "#6b7a75" }}>
                    Soma precisa ser igual à quantidade produzida ({num(op.quantidade_produzida)}).
                  </span>
                </form>
              )}

              {canManage && ncAberta && !ncAberta.retrabalho_executado_em && (
                <form
                  action={executarRetrabalhoAction}
                  style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", marginTop: "8px" }}
                >
                  <input type="hidden" name="nao_conformidade_id" value={ncAberta.id} />
                  <span style={{ fontSize: "12px", color: "#9b2c2c" }}>
                    Não conformidade aberta ({num(ncAberta.quantidade)} un.) — retrabalho pendente.
                  </span>
                  <input
                    name="observacao"
                    placeholder="observação (opcional)"
                    style={{ ...inputStyle, width: "180px" }}
                  />
                  <button type="submit" style={buttonStyle}>
                    Executar retrabalho
                  </button>
                </form>
              )}

              {canManage && ncAberta && ncAberta.retrabalho_executado_em && (
                <form
                  action={reinspecionarRetrabalhoAction}
                  style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", marginTop: "8px" }}
                >
                  <input type="hidden" name="nao_conformidade_id" value={ncAberta.id} />
                  <input
                    name="quantidade_aprovada"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="aprovada"
                    required
                    style={{ ...inputStyle, width: "80px" }}
                  />
                  <input
                    name="quantidade_reprovada"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="reprovada"
                    required
                    style={{ ...inputStyle, width: "80px" }}
                  />
                  <input
                    name="observacoes"
                    placeholder="observações (opcional)"
                    style={{ ...inputStyle, width: "180px" }}
                  />
                  <button type="submit" style={buttonStyle}>
                    Reinspecionar
                  </button>
                  <span style={{ fontSize: "11px", color: "#6b7a75" }}>
                    Soma precisa ser igual à quantidade em retrabalho ({num(ncAberta.quantidade)}).
                  </span>
                </form>
              )}

              {(inspecoes.length > 0 || ncs.length > 0) && (
                <details style={{ marginTop: "8px" }}>
                  <summary style={{ fontSize: "12px", color: "#1f5d57", cursor: "pointer" }}>Histórico</summary>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "6px" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                        <th style={thStyle}>Quando</th>
                        <th style={thStyle}>Evento</th>
                        <th style={thStyle}>Aprovada</th>
                        <th style={thStyle}>Reprovada</th>
                        <th style={thStyle}>Observações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspecoes.map((insp) => (
                        <tr key={insp.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                          <td style={tdStyle}>{new Date(insp.inspecionado_em).toLocaleString("pt-BR")}</td>
                          <td style={tdStyle}>{insp.nao_conformidade_id ? "Reinspeção" : "Inspeção inicial"}</td>
                          <td style={tdStyle}>{num(insp.quantidade_aprovada)}</td>
                          <td style={tdStyle}>{num(insp.quantidade_reprovada)}</td>
                          <td style={tdStyle}>{insp.observacoes ?? "—"}</td>
                        </tr>
                      ))}
                      {ncs.map((nc) => (
                        <tr key={nc.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                          <td style={tdStyle}>{new Date(nc.aberta_em).toLocaleString("pt-BR")}</td>
                          <td style={tdStyle}>
                            NC {nc.status === "aberta" ? "aberta" : "encerrada"}
                            {nc.retrabalho_executado_em ? " · retrabalho executado" : ""}
                          </td>
                          <td style={tdStyle} colSpan={2}>
                            {num(nc.quantidade)} un.
                          </td>
                          <td style={tdStyle}>{nc.descricao ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          );
        })}
        {ordens.length === 0 && (
          <p style={hintStyle}>
            Nenhuma ordem de produção concluída ainda — a inspeção só entra depois da conclusão
            (TÓPICO 4).
          </p>
        )}
      </div>
    </section>
  );
}
