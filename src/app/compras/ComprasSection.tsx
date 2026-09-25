"use client";

import { useState } from "react";
import {
  upsertFornecedorDadosAction,
  upsertItemFornecedorAction,
  definirFornecedorPrincipalAction,
  upsertItemMaterialAlternativoAction,
  desativarItemMaterialAlternativoAction,
  upsertPoliticaAbastecimentoAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, labelStyle, buttonStyle } from "../configuracoes/styles";

const TIPOS_POLITICA = [
  ["sob_demanda", "Sob demanda"],
  ["estoque_minimo", "Estoque mínimo"],
  ["seguranca", "Estoque de segurança"],
  ["ponto_reposicao", "Ponto de reposição"],
] as const;

type Pessoa = { id: string; nome: string; nome_fantasia: string | null };
type Item = { id: string; codigo: string; descricao: string; tipo: string; unidade_principal: string };
type FornecedorDados = {
  id: string;
  pessoa_id: string;
  prazo_pagamento_dias: number | null;
  lead_time_dias: number | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  chave_pix: string | null;
  condicoes_padrao: string | null;
  homologado: boolean;
};
type ItemFornecedor = {
  id: string;
  item_id: string;
  pessoa_id: string;
  principal: boolean;
  prioridade: number;
  homologado: boolean;
  preco_referencia: number | null;
  condicoes: string | null;
};
type MaterialAlternativo = {
  id: string;
  item_origem_id: string;
  item_equivalente_id: string;
  exige_aprovacao: boolean;
  regra_substituicao: string | null;
};
type PoliticaAbastecimento = {
  id: string;
  item_id: string;
  tipo: string;
  estoque_minimo: number | null;
  estoque_seguranca: number | null;
  ponto_reposicao: number | null;
  lote_minimo: number | null;
  lote_economico: number | null;
  multiplo: number | null;
  fornecedor_preferencial_id: string | null;
};

export default function ComprasSection({
  fornecedores,
  fornecedorDados,
  itens,
  itemFornecedores,
  materiaisAlternativos,
  politicas,
  canManage,
}: {
  fornecedores: Pessoa[];
  fornecedorDados: FornecedorDados[];
  itens: Item[];
  itemFornecedores: ItemFornecedor[];
  materiaisAlternativos: MaterialAlternativo[];
  politicas: PoliticaAbastecimento[];
  canManage: boolean;
}) {
  const pessoaPorId = new Map(fornecedores.map((p) => [p.id, p]));
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const dadosPorPessoa = new Map(fornecedorDados.map((f) => [f.pessoa_id, f]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <FornecedoresSubsecao fornecedores={fornecedores} dadosPorPessoa={dadosPorPessoa} canManage={canManage} />
      <ItemFornecedoresSubsecao
        itens={itens}
        fornecedores={fornecedores}
        rows={itemFornecedores}
        itemPorId={itemPorId}
        pessoaPorId={pessoaPorId}
        canManage={canManage}
      />
      <MateriaisAlternativosSubsecao itens={itens} rows={materiaisAlternativos} itemPorId={itemPorId} canManage={canManage} />
      <PoliticasSubsecao itens={itens} fornecedores={fornecedores} rows={politicas} pessoaPorId={pessoaPorId} canManage={canManage} />
    </div>
  );
}

function FornecedoresSubsecao({
  fornecedores,
  dadosPorPessoa,
  canManage,
}: {
  fornecedores: Pessoa[];
  dadosPorPessoa: Map<string, FornecedorDados>;
  canManage: boolean;
}) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Fornecedores</h2>
      <p style={hintStyle}>
        Cadastro comercial de quem já tem papel FORNECEDOR ativo em Cadastros (T2). Cadastre o
        fornecedor lá primeiro — aqui só se acrescenta prazo de pagamento, lead time, dados
        bancários e condições padrão.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Fornecedor</th>
              <th style={thStyle}>Prazo pgto.</th>
              <th style={thStyle}>Lead time</th>
              <th style={thStyle}>Dados bancários</th>
              <th style={thStyle}>Homologado</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {fornecedores.map((f) => {
              const dados = dadosPorPessoa.get(f.id);
              return <FornecedorRow key={f.id} pessoa={f} dados={dados} canManage={canManage} />;
            })}
          </tbody>
        </table>
        {fornecedores.length === 0 && (
          <p style={hintStyle}>Nenhuma pessoa com papel FORNECEDOR ativo ainda — cadastre em Cadastros.</p>
        )}
      </div>
    </section>
  );
}

function FornecedorRow({ pessoa, dados, canManage }: { pessoa: Pessoa; dados: FornecedorDados | undefined; canManage: boolean }) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <tr style={{ borderBottom: "1px solid #eef1ef" }}>
        <td style={tdStyle} colSpan={canManage ? 6 : 5}>
          <form
            action={upsertFornecedorDadosAction}
            onSubmit={() => setEditando(false)}
            style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
          >
            <input type="hidden" name="pessoa_id" value={pessoa.id} />
            <span>{pessoa.nome_fantasia || pessoa.nome}</span>
            <input name="prazo_pagamento_dias" type="number" min="0" step="1" placeholder="prazo (dias)" defaultValue={dados?.prazo_pagamento_dias ?? ""} style={{ ...inputStyle, width: "90px" }} />
            <input name="lead_time_dias" type="number" min="0" step="1" placeholder="lead time (dias)" defaultValue={dados?.lead_time_dias ?? ""} style={{ ...inputStyle, width: "110px" }} />
            <input name="banco" placeholder="banco" defaultValue={dados?.banco ?? ""} style={{ ...inputStyle, width: "90px" }} />
            <input name="agencia" placeholder="agência" defaultValue={dados?.agencia ?? ""} style={{ ...inputStyle, width: "70px" }} />
            <input name="conta" placeholder="conta" defaultValue={dados?.conta ?? ""} style={{ ...inputStyle, width: "90px" }} />
            <select name="tipo_conta" defaultValue={dados?.tipo_conta ?? ""} style={inputStyle}>
              <option value="">tipo conta…</option>
              <option value="corrente">Corrente</option>
              <option value="poupanca">Poupança</option>
            </select>
            <input name="chave_pix" placeholder="chave PIX" defaultValue={dados?.chave_pix ?? ""} style={{ ...inputStyle, width: "110px" }} />
            <input name="condicoes_padrao" placeholder="condições padrão" defaultValue={dados?.condicoes_padrao ?? ""} style={{ ...inputStyle, width: "140px" }} />
            <label style={labelStyle}>
              <input type="checkbox" name="homologado" defaultChecked={dados?.homologado ?? false} /> homologado
            </label>
            <button type="submit" style={buttonStyle}>
              Salvar
            </button>
            <button type="button" onClick={() => setEditando(false)} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
              Cancelar
            </button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ borderBottom: "1px solid #eef1ef" }}>
      <td style={tdStyle}>{pessoa.nome_fantasia || pessoa.nome}</td>
      <td style={tdStyle}>{dados?.prazo_pagamento_dias != null ? `${dados.prazo_pagamento_dias}d` : "—"}</td>
      <td style={tdStyle}>{dados?.lead_time_dias != null ? `${dados.lead_time_dias}d` : "—"}</td>
      <td style={tdStyle}>{dados?.banco ? `${dados.banco} ag.${dados.agencia ?? "—"} cc.${dados.conta ?? "—"}` : dados?.chave_pix ? `PIX: ${dados.chave_pix}` : "—"}</td>
      <td style={tdStyle}>{dados?.homologado ? "Sim" : "Não"}</td>
      {canManage && (
        <td style={tdStyle}>
          <button onClick={() => setEditando(true)} style={buttonStyle}>
            {dados ? "Editar" : "Cadastrar dados"}
          </button>
        </td>
      )}
    </tr>
  );
}

function ItemFornecedoresSubsecao({
  itens,
  fornecedores,
  rows,
  itemPorId,
  pessoaPorId,
  canManage,
}: {
  itens: Item[];
  fornecedores: Pessoa[];
  rows: ItemFornecedor[];
  itemPorId: Map<string, Item>;
  pessoaPorId: Map<string, Pessoa>;
  canManage: boolean;
}) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Fornecedores por item</h2>
      <p style={hintStyle}>
        Fornecedor principal e alternativos por material, com prioridade, homologação e preço de
        referência. No máximo um principal por item.
      </p>

      {canManage && (
        <form action={upsertItemFornecedorAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
          <select name="item_id" required style={inputStyle}>
            <option value="">item…</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo} — {i.descricao}
              </option>
            ))}
          </select>
          <select name="pessoa_id" required style={inputStyle}>
            <option value="">fornecedor…</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome_fantasia || f.nome}
              </option>
            ))}
          </select>
          <input name="prioridade" type="number" min="1" step="1" placeholder="prioridade" defaultValue={100} style={{ ...inputStyle, width: "80px" }} />
          <input name="preco_referencia" type="number" min="0" step="0.0001" placeholder="preço ref." style={{ ...inputStyle, width: "100px" }} />
          <input name="condicoes" placeholder="condições" style={{ ...inputStyle, width: "140px" }} />
          <label style={labelStyle}>
            <input type="checkbox" name="homologado" /> homologado
          </label>
          <button type="submit" style={buttonStyle}>
            Associar
          </button>
        </form>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Fornecedor</th>
              <th style={thStyle}>Prioridade</th>
              <th style={thStyle}>Preço ref.</th>
              <th style={thStyle}>Homologado</th>
              <th style={thStyle}>Principal</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const item = itemPorId.get(row.item_id);
              const pessoa = pessoaPorId.get(row.pessoa_id);
              return (
                <tr key={row.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{item ? `${item.codigo} — ${item.descricao}` : row.item_id}</td>
                  <td style={tdStyle}>{pessoa ? pessoa.nome_fantasia || pessoa.nome : row.pessoa_id}</td>
                  <td style={tdStyle}>{row.prioridade}</td>
                  <td style={tdStyle}>{row.preco_referencia ?? "—"}</td>
                  <td style={tdStyle}>{row.homologado ? "Sim" : "Não"}</td>
                  <td style={tdStyle}>
                    {row.principal ? (
                      "★ Principal"
                    ) : canManage ? (
                      <form action={definirFornecedorPrincipalAction}>
                        <input type="hidden" name="item_id" value={row.item_id} />
                        <input type="hidden" name="pessoa_id" value={row.pessoa_id} />
                        <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#1f5d57", border: "1px solid #dae2de" }}>
                          Tornar principal
                        </button>
                      </form>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p style={hintStyle}>Nenhum fornecedor associado a item ainda.</p>}
      </div>
    </section>
  );
}

function MateriaisAlternativosSubsecao({
  itens,
  rows,
  itemPorId,
  canManage,
}: {
  itens: Item[];
  rows: MaterialAlternativo[];
  itemPorId: Map<string, Item>;
  canManage: boolean;
}) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Materiais alternativos</h2>
      <p style={hintStyle}>
        Equivalência entre dois materiais. &quot;Exige aprovação&quot; marca se o uso do alternativo
        precisa de decisão humana antes de substituir o item de origem numa compra.
      </p>

      {canManage && (
        <form action={upsertItemMaterialAlternativoAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
          <select name="item_origem_id" required style={inputStyle}>
            <option value="">item de origem…</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo} — {i.descricao}
              </option>
            ))}
          </select>
          <select name="item_equivalente_id" required style={inputStyle}>
            <option value="">item equivalente…</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo} — {i.descricao}
              </option>
            ))}
          </select>
          <input name="regra_substituicao" placeholder="regra (opcional)" style={{ ...inputStyle, width: "160px" }} />
          <label style={labelStyle}>
            <input type="checkbox" name="exige_aprovacao" defaultChecked /> exige aprovação
          </label>
          <button type="submit" style={buttonStyle}>
            Registrar
          </button>
        </form>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Item de origem</th>
              <th style={thStyle}>Item equivalente</th>
              <th style={thStyle}>Exige aprovação</th>
              <th style={thStyle}>Regra</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const origem = itemPorId.get(row.item_origem_id);
              const equivalente = itemPorId.get(row.item_equivalente_id);
              return (
                <tr key={row.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{origem ? `${origem.codigo} — ${origem.descricao}` : row.item_origem_id}</td>
                  <td style={tdStyle}>{equivalente ? `${equivalente.codigo} — ${equivalente.descricao}` : row.item_equivalente_id}</td>
                  <td style={tdStyle}>{row.exige_aprovacao ? "Sim" : "Não"}</td>
                  <td style={tdStyle}>{row.regra_substituicao ?? "—"}</td>
                  {canManage && (
                    <td style={tdStyle}>
                      <form action={desativarItemMaterialAlternativoAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
                          Desativar
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p style={hintStyle}>Nenhum material alternativo ativo ainda.</p>}
      </div>
    </section>
  );
}

function PoliticasSubsecao({
  itens,
  fornecedores,
  rows,
  pessoaPorId,
  canManage,
}: {
  itens: Item[];
  fornecedores: Pessoa[];
  rows: PoliticaAbastecimento[];
  pessoaPorId: Map<string, Pessoa>;
  canManage: boolean;
}) {
  const politicaPorItem = new Map(rows.map((r) => [r.item_id, r]));

  return (
    <section>
      <h2 style={sectionTitleStyle}>Políticas de abastecimento</h2>
      <p style={hintStyle}>
        Uma política por item: estoque mínimo, segurança, ponto de reposição, lote mínimo/econômico
        e múltiplo. Consumida pelo Motor de Necessidades (Fase 3 da ADR-011 — ainda não implementada).
      </p>

      {canManage && (
        <form action={upsertPoliticaAbastecimentoAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
          <select name="item_id" required style={inputStyle}>
            <option value="">item…</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo} — {i.descricao}
              </option>
            ))}
          </select>
          <select name="tipo" defaultValue="sob_demanda" style={inputStyle}>
            {TIPOS_POLITICA.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input name="estoque_minimo" type="number" min="0" step="0.0001" placeholder="estoque mín." style={{ ...inputStyle, width: "90px" }} />
          <input name="estoque_seguranca" type="number" min="0" step="0.0001" placeholder="segurança" style={{ ...inputStyle, width: "90px" }} />
          <input name="ponto_reposicao" type="number" min="0" step="0.0001" placeholder="ponto repos." style={{ ...inputStyle, width: "100px" }} />
          <input name="lote_minimo" type="number" min="0" step="0.0001" placeholder="lote mín." style={{ ...inputStyle, width: "90px" }} />
          <input name="lote_economico" type="number" min="0" step="0.0001" placeholder="lote econ." style={{ ...inputStyle, width: "90px" }} />
          <input name="multiplo" type="number" min="0" step="0.0001" placeholder="múltiplo" style={{ ...inputStyle, width: "80px" }} />
          <select name="fornecedor_preferencial_id" style={inputStyle}>
            <option value="">fornecedor preferencial…</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome_fantasia || f.nome}
              </option>
            ))}
          </select>
          <button type="submit" style={buttonStyle}>
            Salvar política
          </button>
        </form>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Mín.</th>
              <th style={thStyle}>Segurança</th>
              <th style={thStyle}>Reposição</th>
              <th style={thStyle}>Fornecedor pref.</th>
            </tr>
          </thead>
          <tbody>
            {itens
              .filter((i) => politicaPorItem.has(i.id))
              .map((i) => {
                const pol = politicaPorItem.get(i.id)!;
                const pessoa = pol.fornecedor_preferencial_id ? pessoaPorId.get(pol.fornecedor_preferencial_id) : undefined;
                return (
                  <tr key={pol.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                    <td style={tdStyle}>{i.codigo} — {i.descricao}</td>
                    <td style={tdStyle}>{TIPOS_POLITICA.find(([v]) => v === pol.tipo)?.[1] ?? pol.tipo}</td>
                    <td style={tdStyle}>{pol.estoque_minimo ?? "—"}</td>
                    <td style={tdStyle}>{pol.estoque_seguranca ?? "—"}</td>
                    <td style={tdStyle}>{pol.ponto_reposicao ?? "—"}</td>
                    <td style={tdStyle}>{pessoa ? pessoa.nome_fantasia || pessoa.nome : "—"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {rows.length === 0 && <p style={hintStyle}>Nenhuma política de abastecimento configurada ainda.</p>}
      </div>
    </section>
  );
}
