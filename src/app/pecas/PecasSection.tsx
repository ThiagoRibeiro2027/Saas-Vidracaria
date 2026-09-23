"use client";

import {
  criarPecaAction,
  inativarPecaAction,
  reativarPecaAction,
  adicionarMaterialPecaAction,
  atualizarMaterialPecaAction,
  removerMaterialPecaAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type Item = { id: string; codigo: string; descricao: string; tipo: string; unidade_principal: string };
type Peca = { id: string; item_id: string; descricao_tecnica: string | null; situacao: "ativo" | "inativo" };
type PecaComposicao = {
  id: string;
  peca_id: string;
  material_item_id: string;
  quantidade_por_unidade: number;
  observacao: string | null;
};

const PECA_TIPOS = ["componente", "produto_acabado"];
const MATERIAL_TIPOS = ["materia_prima", "insumo", "material_auxiliar"];

export default function PecasSection({
  pecas,
  composicao,
  itens,
  canManage,
}: {
  pecas: Peca[];
  composicao: PecaComposicao[];
  itens: Item[];
  canManage: boolean;
}) {
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  const pecaItemIds = new Set(pecas.map((p) => p.item_id));
  const itensDisponiveisParaPeca = itens.filter((i) => PECA_TIPOS.includes(i.tipo) && !pecaItemIds.has(i.id));
  const itensMateriais = itens.filter((i) => MATERIAL_TIPOS.includes(i.tipo));

  const composicaoPorPeca = new Map<string, PecaComposicao[]>();
  for (const c of composicao) {
    const list = composicaoPorPeca.get(c.peca_id) ?? [];
    list.push(c);
    composicaoPorPeca.set(c.peca_id, list);
  }

  return (
    <section>
      <h2 style={sectionTitleStyle}>Peças e composição de materiais</h2>
      <p style={hintStyle}>
        Uma peça é um item do catálogo (tipo componente ou produto acabado); a composição é a lista
        de perfis/vidro/acessórios/insumos e a quantidade necessária por 1 unidade da peça.
      </p>

      {canManage && (
        <form
          action={criarPecaAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "16px" }}
        >
          <select name="item_id" required style={{ ...inputStyle, width: "260px" }}>
            <option value="">Selecione o item (componente/produto acabado)...</option>
            {itensDisponiveisParaPeca.map((it) => (
              <option key={it.id} value={it.id}>
                {it.codigo} — {it.descricao}
              </option>
            ))}
          </select>
          <input name="descricao_tecnica" placeholder="descrição técnica (opcional)" style={{ ...inputStyle, width: "220px" }} />
          <button type="submit" style={buttonStyle}>
            Cadastrar peça
          </button>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {pecas.map((p) => {
          const linhas = composicaoPorPeca.get(p.id) ?? [];
          return (
            <div key={p.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px", opacity: p.situacao === "ativo" ? 1 : 0.55 }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "baseline", fontSize: "13px" }}>
                <strong>{itemLabel(p.item_id)}</strong>
                <span style={{ color: p.situacao === "ativo" ? "#1f5d57" : "#6b7a75", fontFamily: "monospace", fontSize: "11px" }}>
                  {p.situacao === "ativo" ? "Ativa" : "Inativa"}
                </span>
                {canManage && (
                  <form action={p.situacao === "ativo" ? inativarPecaAction : reativarPecaAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: p.situacao === "ativo" ? "#6b7a75" : "#1f5d57" }}
                    >
                      {p.situacao === "ativo" ? "Inativar" : "Reativar"}
                    </button>
                  </form>
                )}
              </div>
              {p.descricao_tecnica && <p style={{ ...hintStyle, margin: "4px 0" }}>{p.descricao_tecnica}</p>}

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "6px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                    <th style={thStyle}>Material</th>
                    <th style={thStyle}>Qtd. por unidade</th>
                    <th style={thStyle}>Observação</th>
                    {canManage && <th style={thStyle}></th>}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((c) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                      <td style={tdStyle}>{itemLabel(c.material_item_id)}</td>
                      <td style={tdStyle}>
                        {canManage ? (
                          <form action={atualizarMaterialPecaAction} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="observacao" value={c.observacao ?? ""} />
                            <input
                              name="quantidade_por_unidade"
                              type="number"
                              min="0.0001"
                              step="0.0001"
                              defaultValue={c.quantidade_por_unidade}
                              style={{ ...inputStyle, width: "90px" }}
                            />
                            <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px" }}>
                              Salvar
                            </button>
                          </form>
                        ) : (
                          c.quantidade_por_unidade
                        )}
                      </td>
                      <td style={tdStyle}>{c.observacao ?? "—"}</td>
                      {canManage && (
                        <td style={tdStyle}>
                          <form action={removerMaterialPecaAction}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: "#9b2c2c" }}>
                              Remover
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                  {linhas.length === 0 && (
                    <tr>
                      <td style={tdStyle} colSpan={canManage ? 4 : 3}>
                        <span style={{ color: "#6b7a75" }}>Peça sem materiais na composição ainda.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {canManage && p.situacao === "ativo" && (
                <form
                  action={adicionarMaterialPecaAction}
                  style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px", alignItems: "center" }}
                >
                  <input type="hidden" name="peca_id" value={p.id} />
                  <select name="material_item_id" required style={{ ...inputStyle, width: "220px" }}>
                    <option value="">Selecione o material...</option>
                    {itensMateriais.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.codigo} — {it.descricao} ({it.unidade_principal})
                      </option>
                    ))}
                  </select>
                  <input
                    name="quantidade_por_unidade"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    placeholder="qtd. por unidade"
                    required
                    style={{ ...inputStyle, width: "110px" }}
                  />
                  <input name="observacao" placeholder="observação (opcional)" style={{ ...inputStyle, width: "160px" }} />
                  <button type="submit" style={buttonStyle}>
                    Adicionar material
                  </button>
                </form>
              )}
            </div>
          );
        })}
        {pecas.length === 0 && <p style={hintStyle}>Nenhuma peça cadastrada ainda.</p>}
      </div>
    </section>
  );
}
