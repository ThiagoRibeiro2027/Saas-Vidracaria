"use client";

import {
  upsertOrcamentoAction,
  upsertOrcamentoItemAction,
  removeOrcamentoItemAction,
  decidirOrcamentoAction,
  cancelarOrcamentoAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string; pessoa_id: string; situacao: "ativo" | "inativo" };
type Item = {
  id: string;
  codigo: string;
  descricao: string;
  unidade_principal: string;
  situacao: "ativo" | "inativo";
};

type Orcamento = {
  id: string;
  numero: string;
  pessoa_id: string;
  obra_id: string | null;
  responsavel_id: string;
  data_orcamento: string;
  validade: string | null;
  condicao_comercial: string | null;
  observacoes: string | null;
  status: "rascunho" | "aprovado" | "rejeitado" | "cancelado";
};

type OrcamentoItem = {
  id: string;
  orcamento_id: string;
  item_id: string;
  quantidade: number;
  preco_unitario: number;
};

const STATUS_LABEL: Record<Orcamento["status"], string> = {
  rascunho: "Rascunho",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
};

const currency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function OrcamentosSection({
  orcamentos,
  itensPorOrcamento,
  totais,
  clientesElegiveis,
  todasPessoas,
  obras,
  itens,
  canManage,
}: {
  orcamentos: Orcamento[];
  itensPorOrcamento: Map<string, OrcamentoItem[]>;
  totais: Map<string, number>;
  clientesElegiveis: Pessoa[];
  todasPessoas: Pessoa[];
  obras: Obra[];
  itens: Item[];
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => todasPessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const obrasAtivas = obras.filter((o) => o.situacao === "ativo");
  const itensAtivos = itens.filter((i) => i.situacao === "ativo");

  return (
    <section>
      <h2 style={sectionTitleStyle}>Orçamentos</h2>
      <p style={hintStyle}>
        Recorte mínimo do M1 (TÓPICO 10 §4): orçamento simples e decisão de aprovação, sem tabela
        de preços, descontos, versionamento ou proposta formal. Orçamento aprovado fica pronto
        para o módulo de Pedidos (TÓPICO 3) converter — ainda não implementado. Um orçamento em
        rascunho pode ser editado livremente; depois de decidido, é terminal (corrigir = cancelar
        e criar outro).
      </p>

      {canManage && (
        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ fontSize: "13px", margin: "0 0 6px" }}>Novo orçamento</h3>
          {clientesElegiveis.length === 0 ? (
            <p style={hintStyle}>Nenhuma pessoa com papel Cliente ativo — cadastre um em Cadastros antes.</p>
          ) : (
            <form
              action={upsertOrcamentoAction}
              style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
            >
              <select name="pessoa_id" defaultValue="" required style={inputStyle}>
                <option value="" disabled>
                  Cliente
                </option>
                {clientesElegiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <select name="obra_id" defaultValue="" style={inputStyle}>
                <option value="">Sem obra</option>
                {obrasAtivas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome} ({pessoaNome(o.pessoa_id)})
                  </option>
                ))}
              </select>
              <label style={{ fontSize: "12px", color: "#3e4d49" }}>
                Validade
                <input name="validade" type="date" style={{ ...inputStyle, marginLeft: "4px" }} />
              </label>
              <input
                name="condicao_comercial"
                placeholder="condição comercial"
                style={{ ...inputStyle, width: "160px" }}
              />
              <input name="observacoes" placeholder="observações" style={{ ...inputStyle, width: "180px" }} />
              <button type="submit" style={buttonStyle}>
                Criar orçamento
              </button>
            </form>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {orcamentos.map((orc) => {
          const orcItens = itensPorOrcamento.get(orc.id) ?? [];
          const total = totais.get(orc.id) ?? 0;
          const editavel = canManage && orc.status === "rascunho";
          // Guard de seleção atual: cliente/obra do orçamento podem ter saído
          // da lista elegível (papel desligado / obra inativada) depois que o
          // orçamento foi criado. Sem incluir a opção atual, o <select> cai
          // silenciosamente na primeira opção da lista e salvar qualquer
          // outro campo do cabeçalho reatribui o orçamento por engano (mesmo
          // problema já resolvido em cadastros/ObrasSection.tsx).
          const pessoaAtual = todasPessoas.find((p) => p.id === orc.pessoa_id);
          const pessoaOpcoes =
            pessoaAtual && !clientesElegiveis.some((p) => p.id === pessoaAtual.id)
              ? [pessoaAtual, ...clientesElegiveis]
              : clientesElegiveis;
          const obraAtual = orc.obra_id ? obras.find((o) => o.id === orc.obra_id) : undefined;
          const obraOpcoes =
            obraAtual && !obrasAtivas.some((o) => o.id === obraAtual.id) ? [obraAtual, ...obrasAtivas] : obrasAtivas;

          return (
            <div
              key={orc.id}
              style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "baseline", fontSize: "12px" }}>
                <strong style={{ fontSize: "13px" }}>{orc.numero}</strong>
                <span>{pessoaNome(orc.pessoa_id)}</span>
                <span style={{ color: "#6b7a75" }}>{obraNome(orc.obra_id)}</span>
                <span style={{ color: "#6b7a75" }}>{orc.data_orcamento}</span>
                <span
                  style={{
                    fontFamily: "monospace",
                    color:
                      orc.status === "aprovado"
                        ? "#1f5d57"
                        : orc.status === "rejeitado" || orc.status === "cancelado"
                          ? "#9b2c2c"
                          : "#6b7a75",
                  }}
                >
                  {STATUS_LABEL[orc.status]}
                </span>
                <span style={{ marginLeft: "auto", fontWeight: 600 }}>{currency(total)}</span>
              </div>

              {editavel && (
                <form
                  action={upsertOrcamentoAction}
                  style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginTop: "8px" }}
                >
                  <input type="hidden" name="id" value={orc.id} />
                  <select name="pessoa_id" defaultValue={orc.pessoa_id} required style={inputStyle}>
                    {pessoaOpcoes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                        {pessoaAtual?.id === p.id && !clientesElegiveis.some((c) => c.id === p.id)
                          ? " (papel desligado)"
                          : ""}
                      </option>
                    ))}
                  </select>
                  <select name="obra_id" defaultValue={orc.obra_id ?? ""} style={inputStyle}>
                    <option value="">Sem obra</option>
                    {obraOpcoes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome} ({pessoaNome(o.pessoa_id)})
                        {obraAtual?.id === o.id && !obrasAtivas.some((a) => a.id === o.id) ? " (inativa)" : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    name="validade"
                    type="date"
                    defaultValue={orc.validade ?? ""}
                    style={inputStyle}
                  />
                  <input
                    name="condicao_comercial"
                    placeholder="condição comercial"
                    defaultValue={orc.condicao_comercial ?? ""}
                    style={{ ...inputStyle, width: "160px" }}
                  />
                  <input
                    name="observacoes"
                    placeholder="observações"
                    defaultValue={orc.observacoes ?? ""}
                    style={{ ...inputStyle, width: "180px" }}
                  />
                  <button type="submit" style={buttonStyle}>
                    Salvar cabeçalho
                  </button>
                </form>
              )}

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "8px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                    <th style={thStyle}>Item</th>
                    <th style={thStyle}>Qtd</th>
                    <th style={thStyle}>Preço unit.</th>
                    <th style={thStyle}>Subtotal</th>
                    {editavel && <th style={thStyle}></th>}
                  </tr>
                </thead>
                <tbody>
                  {orcItens.map((oi) => (
                    <OrcamentoItemRow
                      key={oi.id}
                      item={oi}
                      itensAtivos={itensAtivos}
                      itemAtualFallback={itens.find((i) => i.id === oi.item_id)}
                      itens={itens}
                      editavel={editavel}
                    />
                  ))}
                  {editavel && (
                    <OrcamentoItemRow
                      item={null}
                      orcamentoId={orc.id}
                      itensAtivos={itensAtivos}
                      itens={itens}
                      editavel={editavel}
                    />
                  )}
                </tbody>
              </table>

              {canManage && orc.status === "rascunho" && (
                <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                  <form action={decidirOrcamentoAction}>
                    <input type="hidden" name="id" value={orc.id} />
                    <input type="hidden" name="decisao" value="aprovado" />
                    <button type="submit" style={buttonStyle}>
                      Aprovar
                    </button>
                  </form>
                  <form action={decidirOrcamentoAction}>
                    <input type="hidden" name="id" value={orc.id} />
                    <input type="hidden" name="decisao" value="rejeitado" />
                    <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>
                      Rejeitar
                    </button>
                  </form>
                  <form action={cancelarOrcamentoAction}>
                    <input type="hidden" name="id" value={orc.id} />
                    <button type="submit" style={{ ...buttonStyle, background: "#6b7a75" }}>
                      Cancelar
                    </button>
                  </form>
                </div>
              )}
              {canManage && orc.status === "aprovado" && (
                <div style={{ marginTop: "8px" }}>
                  <form action={cancelarOrcamentoAction}>
                    <input type="hidden" name="id" value={orc.id} />
                    <button type="submit" style={{ ...buttonStyle, background: "#6b7a75" }}>
                      Cancelar
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
        {orcamentos.length === 0 && <p style={hintStyle}>Nenhum orçamento ainda.</p>}
      </div>
    </section>
  );
}

function itemLabel(itens: Item[], id: string) {
  const it = itens.find((i) => i.id === id);
  return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
}

function OrcamentoItemRow({
  item,
  orcamentoId,
  itensAtivos,
  itemAtualFallback,
  itens,
  editavel,
}: {
  item: OrcamentoItem | null;
  orcamentoId?: string;
  itensAtivos: Item[];
  itemAtualFallback?: Item;
  itens: Item[];
  editavel: boolean;
}) {
  const subtotal = item ? item.quantidade * item.preco_unitario : 0;
  const totalColumns = editavel ? 5 : 4;
  // Mesmo guard de seleção atual do cabeçalho (ver comentário acima): sem
  // isso, editar quantidade/preço de uma linha cujo item foi desativado
  // troca silenciosamente o item da linha ao salvar.
  const itemOpcoes =
    itemAtualFallback && !itensAtivos.some((i) => i.id === itemAtualFallback.id)
      ? [itemAtualFallback, ...itensAtivos]
      : itensAtivos;

  if (!editavel) {
    if (!item) return null;
    return (
      <tr style={{ borderBottom: "1px solid #f4f6f5" }}>
        <td style={tdStyle}>{itemLabel(itens, item.item_id)}</td>
        <td style={tdStyle}>{item.quantidade}</td>
        <td style={tdStyle}>{currency(item.preco_unitario)}</td>
        <td style={tdStyle}>{currency(subtotal)}</td>
      </tr>
    );
  }

  return (
    <tr style={{ borderBottom: "1px solid #f4f6f5" }}>
      <td style={tdStyle} colSpan={totalColumns}>
        <form
          action={upsertOrcamentoItemAction}
          style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
        >
          {item && <input type="hidden" name="id" value={item.id} />}
          <input type="hidden" name="orcamento_id" value={item?.orcamento_id ?? orcamentoId} />
          <select
            name="item_id"
            defaultValue={item?.item_id ?? ""}
            required
            style={{ ...inputStyle, minWidth: "160px" }}
          >
            <option value="" disabled>
              Item
            </option>
            {itemOpcoes.map((it) => (
              <option key={it.id} value={it.id}>
                {it.codigo} — {it.descricao}
                {itemAtualFallback?.id === it.id && !itensAtivos.some((a) => a.id === it.id) ? " (inativo)" : ""}
              </option>
            ))}
          </select>
          <input
            name="quantidade"
            type="number"
            step="0.001"
            min="0.001"
            placeholder="qtd"
            defaultValue={item?.quantidade ?? ""}
            required
            style={{ ...inputStyle, width: "70px" }}
          />
          <input
            name="preco_unitario"
            type="number"
            step="0.01"
            min="0"
            placeholder="preço unit."
            defaultValue={item?.preco_unitario ?? ""}
            required
            style={{ ...inputStyle, width: "90px" }}
          />
          <button type="submit" style={buttonStyle}>
            {item ? "Salvar" : "Adicionar"}
          </button>
          {item && (
            <span style={{ color: "#6b7a75" }}>subtotal: {currency(subtotal)}</span>
          )}
        </form>
        {item && (
          <form action={removeOrcamentoItemAction} style={{ marginTop: "4px" }}>
            <input type="hidden" name="id" value={item.id} />
            <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>
              Remover
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
