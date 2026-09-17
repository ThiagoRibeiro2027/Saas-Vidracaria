"use client";

import {
  criarLoteFabrilAction,
  adicionarItemLoteFabrilAction,
  removerItemLoteFabrilAction,
  encerrarLoteFabrilAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type LoteFabril = {
  id: string;
  nome: string;
  situacao: "aberto" | "encerrado";
  criterio_agrupamento: string | null;
  observacoes: string | null;
};
type LoteFabrilItem = { id: string; lote_fabril_id: string; op_lote_id: string; quantidade: number };
type OpLoteOpcao = { id: string; label: string };
export type ListaCorteLoteFabrilRow = {
  ordem_producao_numero: string;
  op_lote_numero: number;
  item_codigo: string;
  item_descricao: string;
  ambiente: string | null;
  largura_mm: number | null;
  altura_mm: number | null;
  quantidade: number;
  margem_quebra_percentual: number | null;
};

const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const SITUACAO_LABEL: Record<LoteFabril["situacao"], string> = { aberto: "Aberto", encerrado: "Encerrado" };
const SITUACAO_COLOR: Record<LoteFabril["situacao"], string> = { aberto: "#1f5d57", encerrado: "#6b7a75" };

export default function LotesFabrisSection({
  lotesFabris,
  itensPorLoteFabril,
  opLotesOpcoes,
  listaCortePorLoteFabril,
  canManage,
}: {
  lotesFabris: LoteFabril[];
  itensPorLoteFabril: Map<string, LoteFabrilItem[]>;
  opLotesOpcoes: OpLoteOpcao[];
  listaCortePorLoteFabril: Map<string, ListaCorteLoteFabrilRow[]>;
  canManage: boolean;
}) {
  const opLoteLabel = (id: string) => opLotesOpcoes.find((o) => o.id === id)?.label ?? "(lote removido)";

  return (
    <section>
      <h2 style={sectionTitleStyle}>Lotes fabris (TÓPICO 4 §14)</h2>
      <p style={hintStyle}>
        Agrupamento operacional e temporário de lotes de liberação (§12) de diferentes OPs, pra
        otimização (ex.: corte combinado). Não altera pedido, item, OP nem o lote de liberação
        original — um mesmo lote de liberação pode entrar em vários lotes fabris.
      </p>

      {canManage && (
        <form
          action={criarLoteFabrilAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "16px" }}
        >
          <input name="nome" placeholder="Nome do lote fabril" required style={{ ...inputStyle, width: "160px" }} />
          <input name="criterio_agrupamento" placeholder="Critério (opcional)" style={{ ...inputStyle, width: "160px" }} />
          <input name="observacoes" placeholder="Observações (opcional)" style={{ ...inputStyle, width: "160px" }} />
          <button type="submit" style={buttonStyle}>
            Criar lote fabril
          </button>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {lotesFabris.map((lf) => {
          const itens = itensPorLoteFabril.get(lf.id) ?? [];
          const listaCorte = listaCortePorLoteFabril.get(lf.id) ?? [];
          return (
            <div key={lf.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "baseline", fontSize: "12px" }}>
                <strong style={{ fontSize: "13px" }}>{lf.nome}</strong>
                <span style={{ fontFamily: "monospace", color: SITUACAO_COLOR[lf.situacao] }}>
                  {SITUACAO_LABEL[lf.situacao]}
                </span>
                {lf.criterio_agrupamento && <span style={{ color: "#6b7a75" }}>critério: {lf.criterio_agrupamento}</span>}
                {canManage && lf.situacao === "aberto" && (
                  <form action={encerrarLoteFabrilAction}>
                    <input type="hidden" name="lote_fabril_id" value={lf.id} />
                    <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: "#6b7a75" }}>
                      Encerrar
                    </button>
                  </form>
                )}
              </div>
              {lf.observacoes && <p style={{ ...hintStyle, margin: "4px 0 0" }}>{lf.observacoes}</p>}

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "8px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                    <th style={thStyle}>Lote de liberação</th>
                    <th style={thStyle}>Quantidade agrupada</th>
                    {canManage && lf.situacao === "aberto" && <th style={thStyle}></th>}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it) => (
                    <tr key={it.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                      <td style={tdStyle}>{opLoteLabel(it.op_lote_id)}</td>
                      <td style={tdStyle}>{num(it.quantidade)}</td>
                      {canManage && lf.situacao === "aberto" && (
                        <td style={tdStyle}>
                          <form action={removerItemLoteFabrilAction}>
                            <input type="hidden" name="lote_fabril_item_id" value={it.id} />
                            <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: "#9b2c2c" }}>
                              Remover
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                  {itens.length === 0 && (
                    <tr>
                      <td style={tdStyle} colSpan={canManage ? 3 : 2}>
                        <span style={{ color: "#6b7a75" }}>Nenhum lote de liberação agrupado ainda.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {canManage && lf.situacao === "aberto" && (
                <form
                  action={adicionarItemLoteFabrilAction}
                  style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px", alignItems: "center" }}
                >
                  <input type="hidden" name="lote_fabril_id" value={lf.id} />
                  <select name="op_lote_id" required style={{ ...inputStyle, width: "260px" }}>
                    <option value="">Selecione o lote de liberação...</option>
                    {opLotesOpcoes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input name="quantidade" type="number" step="0.001" min="0" placeholder="quantidade" style={{ ...inputStyle, width: "90px" }} />
                  <button type="submit" style={buttonStyle}>
                    Adicionar
                  </button>
                </form>
              )}

              {itens.length > 0 && (
                <details style={{ marginTop: "8px" }}>
                  <summary style={{ fontSize: "12px", color: "#1f5d57", cursor: "pointer" }}>Lista de corte combinada</summary>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "6px" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                        <th style={thStyle}>OP / Lote</th>
                        <th style={thStyle}>Item</th>
                        <th style={thStyle}>Ambiente</th>
                        <th style={thStyle}>Largura (mm)</th>
                        <th style={thStyle}>Altura (mm)</th>
                        <th style={thStyle}>Qtd.</th>
                        <th style={thStyle}>Margem de quebra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listaCorte.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #f4f6f5" }}>
                          <td style={tdStyle}>
                            {row.ordem_producao_numero} / Lote {row.op_lote_numero}
                          </td>
                          <td style={tdStyle}>
                            {row.item_codigo} — {row.item_descricao}
                          </td>
                          <td style={tdStyle}>{row.ambiente ?? "—"}</td>
                          <td style={tdStyle}>{row.largura_mm != null ? num(row.largura_mm) : "—"}</td>
                          <td style={tdStyle}>{row.altura_mm != null ? num(row.altura_mm) : "—"}</td>
                          <td style={tdStyle}>{num(row.quantidade)}</td>
                          <td style={tdStyle}>
                            {row.margem_quebra_percentual != null ? `${num(row.margem_quebra_percentual)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                      {listaCorte.length === 0 && (
                        <tr>
                          <td style={tdStyle} colSpan={7}>
                            <span style={{ color: "#6b7a75" }}>Sem dados de medida pros itens agrupados.</span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          );
        })}
        {lotesFabris.length === 0 && <p style={hintStyle}>Nenhum lote fabril criado ainda.</p>}
      </div>
    </section>
  );
}
