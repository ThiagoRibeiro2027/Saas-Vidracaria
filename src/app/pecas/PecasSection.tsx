"use client";

import { useState } from "react";
import {
  criarPecaAction,
  inativarPecaAction,
  reativarPecaAction,
  adicionarMaterialPecaAction,
  atualizarMaterialPecaAction,
  removerMaterialPecaAction,
  definirCaracteristicaPecaAction,
  removerCaracteristicaPecaAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";
import RegrasPeca from "./RegrasPeca";

type Item = { id: string; codigo: string; descricao: string; tipo: string; unidade_principal: string };
type Peca = { id: string; item_id: string; descricao_tecnica: string | null; situacao: "ativo" | "inativo"; revisao_atual: number };
type PecaComposicao = {
  id: string;
  peca_id: string;
  material_item_id: string;
  quantidade_por_unidade: number;
  observacao: string | null;
};
type Revisao = { revisao: number; motivo: string | null; created_at: string };
type Caracteristica = { id: string; nome: string; tipo: string; unidade: string | null; opcoes: string[] | null; obrigatoria: boolean };
type Regra = {
  id: string;
  versao: number;
  substitui_regra_id: string | null;
  caracteristica_id: string;
  caracteristica_nome: string;
  operador: string;
  valor_comparacao_numero: number | null;
  valor_comparacao_texto: string | null;
  acao: string;
  acao_material_item_id: string;
  acao_material_codigo: string;
  acao_quantidade: number | null;
  ativo: boolean;
  motivo: string | null;
  created_at: string;
};

const CARACTERISTICA_TIPOS = [
  ["numero", "Número"],
  ["texto", "Texto"],
  ["opcao", "Opção (lista)"],
] as const;

const PECA_TIPOS = ["componente", "produto_acabado"];
const MATERIAL_TIPOS = ["materia_prima", "insumo", "material_auxiliar"];

const fmtData = (v: string) => new Date(v).toLocaleString("pt-BR");

export default function PecasSection({
  pecas,
  composicao,
  itens,
  revisoesPorPeca,
  caracteristicasPorPeca,
  regrasPorPeca,
  canManage,
}: {
  pecas: Peca[];
  composicao: PecaComposicao[];
  itens: Item[];
  revisoesPorPeca: Map<string, Revisao[]>;
  caracteristicasPorPeca: Map<string, Caracteristica[]>;
  regrasPorPeca: Map<string, Regra[]>;
  canManage: boolean;
}) {
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  const pecaPorItemId = new Map(pecas.map((p) => [p.item_id, p]));
  const itensDisponiveisParaPeca = itens.filter((i) => PECA_TIPOS.includes(i.tipo) && !pecaPorItemId.has(i.id));
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
        de perfis/vidro/acessórios/insumos — ou de outra peça já cadastrada, como subconjunto — e a
        quantidade necessária por 1 unidade da peça. Toda mudança na composição gera uma revisão
        nova (histórico abaixo, nada é sobrescrito).
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
          // Subconjunto não pode ser a própria peça (o backend trava ciclo
          // indireto também — isso aqui é só conveniência de UI).
          const pecasComoSubconjunto = pecas.filter((sp) => sp.situacao === "ativo" && sp.id !== p.id);
          return (
            <div key={p.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px", opacity: p.situacao === "ativo" ? 1 : 0.55 }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "baseline", fontSize: "13px" }}>
                <strong>{itemLabel(p.item_id)}</strong>
                <span style={{ color: p.situacao === "ativo" ? "#1f5d57" : "#6b7a75", fontFamily: "monospace", fontSize: "11px" }}>
                  {p.situacao === "ativo" ? "Ativa" : "Inativa"}
                </span>
                <span style={{ color: "#6b7a75", fontSize: "11px" }}>rev. {p.revisao_atual}</span>
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
                  {linhas.map((c) => {
                    const ehPeca = pecaPorItemId.has(c.material_item_id);
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                        <td style={tdStyle}>
                          {itemLabel(c.material_item_id)}
                          {ehPeca && (
                            <span style={{ marginLeft: "6px", fontSize: "10px", color: "#1f5d57", fontFamily: "monospace" }}>
                              subconjunto
                            </span>
                          )}
                        </td>
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
                    );
                  })}
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
                  <select name="material_item_id" required style={{ ...inputStyle, width: "260px" }}>
                    <option value="">Selecione o material ou subconjunto...</option>
                    <optgroup label="Matéria-prima / insumo / material auxiliar">
                      {itensMateriais.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.codigo} — {it.descricao} ({it.unidade_principal})
                        </option>
                      ))}
                    </optgroup>
                    {pecasComoSubconjunto.length > 0 && (
                      <optgroup label="Outra peça (subconjunto)">
                        {pecasComoSubconjunto.map((sp) => (
                          <option key={sp.item_id} value={sp.item_id}>
                            {itemLabel(sp.item_id)}
                          </option>
                        ))}
                      </optgroup>
                    )}
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
                    Adicionar
                  </button>
                </form>
              )}

              <CaracteristicasPeca pecaId={p.id} caracteristicas={caracteristicasPorPeca.get(p.id) ?? []} canManage={canManage && p.situacao === "ativo"} />

              {canManage && p.situacao === "ativo" && (
                <RegrasPeca
                  pecaId={p.id}
                  caracteristicas={caracteristicasPorPeca.get(p.id) ?? []}
                  regras={regrasPorPeca.get(p.id) ?? []}
                  materiais={[
                    ...itensMateriais.map((it) => ({ id: it.id, label: itemLabel(it.id) })),
                    ...pecasComoSubconjunto.map((sp) => ({ id: sp.item_id, label: itemLabel(sp.item_id) })),
                  ]}
                />
              )}

              <HistoricoRevisoes revisoes={revisoesPorPeca.get(p.id) ?? []} />
            </div>
          );
        })}
        {pecas.length === 0 && <p style={hintStyle}>Nenhuma peça cadastrada ainda.</p>}
      </div>
    </section>
  );
}

function CaracteristicasPeca({
  pecaId,
  caracteristicas,
  canManage,
}: {
  pecaId: string;
  caracteristicas: Caracteristica[];
  canManage: boolean;
}) {
  const [tipoNovo, setTipoNovo] = useState<string>("numero");

  return (
    <div style={{ marginTop: "10px", borderTop: "1px solid #eef1ef", paddingTop: "8px" }}>
      <p style={{ ...hintStyle, margin: "0 0 4px", fontWeight: 600, color: "#3e4d49" }}>Características (configurador)</p>
      {caracteristicas.length === 0 ? (
        <p style={hintStyle}>Nenhuma característica configurada — a peça não tem configurador ainda.</p>
      ) : (
        <ul style={{ ...hintStyle, margin: "0 0 6px", paddingLeft: "18px" }}>
          {caracteristicas.map((c) => (
            <li key={c.id} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span>
                {c.nome} ({CARACTERISTICA_TIPOS.find(([v]) => v === c.tipo)?.[1] ?? c.tipo}
                {c.unidade ? `, ${c.unidade}` : ""}
                {c.opcoes ? `: ${c.opcoes.join(", ")}` : ""}
                {c.obrigatoria ? ", obrigatória" : ""})
              </span>
              {canManage && (
                <form action={removerCaracteristicaPecaAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" style={{ ...buttonStyle, fontSize: "10px", padding: "1px 5px", background: "#9b2c2c" }}>
                    Remover
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form
          action={definirCaracteristicaPecaAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}
        >
          <input type="hidden" name="peca_id" value={pecaId} />
          <input name="nome" placeholder="nome (ex.: largura)" required style={{ ...inputStyle, width: "120px" }} />
          <select name="tipo" value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value)} style={{ ...inputStyle, width: "110px" }}>
            {CARACTERISTICA_TIPOS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input name="unidade" placeholder="unidade (opcional)" style={{ ...inputStyle, width: "90px" }} />
          {tipoNovo === "opcao" && (
            <input name="opcoes" placeholder="opções, separadas por vírgula" required style={{ ...inputStyle, width: "180px" }} />
          )}
          <label style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: "#3e4d49" }}>
            <input type="checkbox" name="obrigatoria" defaultChecked />
            obrigatória
          </label>
          <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "3px 8px" }}>
            Adicionar característica
          </button>
        </form>
      )}
    </div>
  );
}

function HistoricoRevisoes({ revisoes }: { revisoes: Revisao[] }) {
  const [aberto, setAberto] = useState(false);

  if (revisoes.length === 0) return null;

  return (
    <div style={{ marginTop: "8px" }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{ ...buttonStyle, fontSize: "11px", padding: "2px 6px", background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}
      >
        {aberto ? "Ocultar histórico" : `Ver histórico (${revisoes.length} revisão${revisoes.length > 1 ? "ões" : ""})`}
      </button>
      {aberto && (
        <ul style={{ ...hintStyle, margin: "6px 0 0", paddingLeft: "18px" }}>
          {revisoes.map((r) => (
            <li key={r.revisao}>
              rev. {r.revisao} — {r.motivo ?? "sem motivo registrado"} — {fmtData(r.created_at)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
