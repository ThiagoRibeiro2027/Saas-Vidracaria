"use client";

import { useState } from "react";
import {
  criarCotacaoDeSolicitacaoAction,
  registrarPropostaCotacaoAction,
  registrarNegociacaoCotacaoAction,
  selecionarFornecedorCotacaoAction,
  concluirSelecaoCotacaoAction,
  cancelarCotacaoAction,
  upsertAlcadaCompraAction,
  desativarAlcadaCompraAction,
  decidirEtapaAprovacaoCompraAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../../configuracoes/styles";

const STATUS_COT_LABEL: Record<string, string> = { aberta: "Aberta", selecionada: "Selecionada", cancelada: "Cancelada" };
const STATUS_APROVACAO_LABEL: Record<string, string> = { pendente: "Pendente", aprovada: "Aprovada", rejeitada: "Rejeitada" };

type Cotacao = { id: string; numero: string; solicitacao_compra_id: string; status: string; aprovacao_id: string | null; motivo_cancelamento: string | null };
type CotacaoItem = { id: string; cotacao_id: string; solicitacao_compra_item_id: string };
type Proposta = {
  id: string; cotacao_item_id: string; pessoa_id: string; preco_unitario: number; desconto: number;
  impostos: number; frete: number; custo_unitario: number; prazo_entrega_dias: number | null;
  condicao_pagamento: string | null; validade: string | null;
};
type Negociacao = { id: string; cotacao_proposta_id: string; rodada: number; preco_anterior: number; preco_novo: number; observacao: string | null };
type Selecao = { id: string; cotacao_item_id: string; cotacao_proposta_id: string; quantidade: number; justificativa: string };
type Solicitacao = { id: string; numero: string; status: string };
type SolicitacaoItem = { id: string; solicitacao_compra_id: string; item_id: string; quantidade: number };
type Item = { id: string; codigo: string; descricao: string; unidade_principal: string };
type Pessoa = { id: string; nome: string; nome_fantasia: string | null };
type Aprovacao = { id: string; processo: string; entidade_id: string; valor: number; status: string };
type AprovacaoEtapa = { id: string; compra_aprovacao_id: string; ordem: number; valor_minimo: number; role_id: string; status: string; decidido_por: string | null; observacao: string | null };
type Alcada = { id: string; processo: string; ordem: number; valor_minimo: number; role_id: string; ativo: boolean };
type Role = { id: string; key: string; name: string; company_id: string | null };

export default function CotacoesSection({
  cotacoes,
  cotacaoItens,
  propostas,
  negociacoes,
  selecoes,
  solicitacoes,
  solicitacaoItens,
  itens,
  fornecedores,
  aprovacoes,
  aprovacaoEtapas,
  alcadas,
  roles,
  meusRoleIds,
  canManage,
}: {
  cotacoes: Cotacao[];
  cotacaoItens: CotacaoItem[];
  propostas: Proposta[];
  negociacoes: Negociacao[];
  selecoes: Selecao[];
  solicitacoes: Solicitacao[];
  solicitacaoItens: SolicitacaoItem[];
  itens: Item[];
  fornecedores: Pessoa[];
  aprovacoes: Aprovacao[];
  aprovacaoEtapas: AprovacaoEtapa[];
  alcadas: Alcada[];
  roles: Role[];
  meusRoleIds: Set<string>;
  canManage: boolean;
}) {
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const pessoaPorId = new Map(fornecedores.map((p) => [p.id, p]));
  const rolePorId = new Map(roles.map((r) => [r.id, r]));
  const scItemPorId = new Map(solicitacaoItens.map((si) => [si.id, si]));
  const aprovacaoPorId = new Map(aprovacoes.map((a) => [a.id, a]));
  const scPorId = new Map(solicitacoes.map((s) => [s.id, s]));

  const solicitacoesCotaveis = solicitacoes.filter((s) => s.status === "aberta");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <section>
        <h2 style={sectionTitleStyle}>Cotações</h2>
        {canManage && (
          <form action={criarCotacaoDeSolicitacaoAction} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
            <select name="solicitacao_compra_id" required style={inputStyle}>
              <option value="">cotar solicitação enviada…</option>
              {solicitacoesCotaveis.map((s) => (
                <option key={s.id} value={s.id}>{s.numero}</option>
              ))}
            </select>
            <button type="submit" style={buttonStyle}>Criar cotação</button>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {cotacoes.map((cot) => (
            <CotacaoCard
              key={cot.id}
              cot={cot}
              scNumero={scPorId.get(cot.solicitacao_compra_id)?.numero ?? "—"}
              itensCotacao={cotacaoItens.filter((ci) => ci.cotacao_id === cot.id)}
              propostas={propostas}
              negociacoes={negociacoes}
              selecoes={selecoes}
              scItemPorId={scItemPorId}
              itemPorId={itemPorId}
              pessoaPorId={pessoaPorId}
              fornecedores={fornecedores}
              aprovacao={cot.aprovacao_id ? aprovacaoPorId.get(cot.aprovacao_id) : undefined}
              etapas={cot.aprovacao_id ? aprovacaoEtapas.filter((e) => e.compra_aprovacao_id === cot.aprovacao_id) : []}
              rolePorId={rolePorId}
              meusRoleIds={meusRoleIds}
              canManage={canManage}
            />
          ))}
          {cotacoes.length === 0 && <p style={hintStyle}>Nenhuma cotação criada ainda.</p>}
        </div>
      </section>

      <AlcadaSection alcadas={alcadas} roles={roles} canManage={canManage} />
    </div>
  );
}

function CotacaoCard({
  cot,
  scNumero,
  itensCotacao,
  propostas,
  negociacoes,
  selecoes,
  scItemPorId,
  itemPorId,
  pessoaPorId,
  fornecedores,
  aprovacao,
  etapas,
  rolePorId,
  meusRoleIds,
  canManage,
}: {
  cot: Cotacao;
  scNumero: string;
  itensCotacao: CotacaoItem[];
  propostas: Proposta[];
  negociacoes: Negociacao[];
  selecoes: Selecao[];
  scItemPorId: Map<string, SolicitacaoItem>;
  itemPorId: Map<string, Item>;
  pessoaPorId: Map<string, Pessoa>;
  fornecedores: Pessoa[];
  aprovacao: Aprovacao | undefined;
  etapas: AprovacaoEtapa[];
  rolePorId: Map<string, Role>;
  meusRoleIds: Set<string>;
  canManage: boolean;
}) {
  const [cancelando, setCancelando] = useState(false);
  const emAberto = cot.status === "aberta";

  return (
    <div style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "12px" }}>
        <strong>{cot.numero}</strong>
        <span>{STATUS_COT_LABEL[cot.status]}</span>
        <span style={{ color: "#6b7a75" }}>SC: {scNumero}</span>
      </div>
      {cot.status === "cancelada" && cot.motivo_cancelamento && <p style={hintStyle}>Motivo: {cot.motivo_cancelamento}</p>}

      {itensCotacao.map((ci) => (
        <CotacaoItemBlock
          key={ci.id}
          cotacaoItem={ci}
          scItem={scItemPorId.get(ci.solicitacao_compra_item_id)}
          item={scItemPorId.get(ci.solicitacao_compra_item_id) ? itemPorId.get(scItemPorId.get(ci.solicitacao_compra_item_id)!.item_id) : undefined}
          propostas={propostas.filter((p) => p.cotacao_item_id === ci.id)}
          negociacoes={negociacoes}
          selecoes={selecoes.filter((s) => s.cotacao_item_id === ci.id)}
          pessoaPorId={pessoaPorId}
          fornecedores={fornecedores}
          emAberto={emAberto}
          canManage={canManage}
        />
      ))}

      {canManage && emAberto && (
        <div style={{ marginTop: "8px", display: "flex", gap: "6px" }}>
          <form action={concluirSelecaoCotacaoAction}>
            <input type="hidden" name="id" value={cot.id} />
            <button type="submit" style={buttonStyle}>Concluir seleção</button>
          </form>
          {!cancelando ? (
            <button type="button" onClick={() => setCancelando(true)} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
              Cancelar cotação
            </button>
          ) : (
            <form action={cancelarCotacaoAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setCancelando(false)}>
              <input type="hidden" name="id" value={cot.id} />
              <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "140px" }} />
              <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>Confirmar</button>
            </form>
          )}
        </div>
      )}

      {aprovacao && (
        <div style={{ marginTop: "10px", padding: "8px", background: "#f5f7f5", borderRadius: "6px" }}>
          <p style={{ fontSize: "12px", margin: "0 0 6px", fontWeight: 600 }}>
            Alçada: {STATUS_APROVACAO_LABEL[aprovacao.status]} — valor R$ {Number(aprovacao.valor).toFixed(2)}
          </p>
          {etapas.map((et) => {
            const podeDecidir = et.status === "pendente" && meusRoleIds.has(et.role_id) && !etapas.some((e2) => e2.ordem < et.ordem && e2.status === "pendente");
            return (
              <div key={et.id} style={{ fontSize: "12px", display: "flex", gap: "6px", alignItems: "center", marginBottom: "4px" }}>
                <span>Etapa {et.ordem} ({rolePorId.get(et.role_id)?.name ?? et.role_id}, a partir de R$ {Number(et.valor_minimo).toFixed(2)}):</span>
                <span>{STATUS_APROVACAO_LABEL[et.status]}</span>
                {podeDecidir && (
                  <>
                    <form action={decidirEtapaAprovacaoCompraAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={et.id} />
                      <input type="hidden" name="decisao" value="aprovar" />
                      <button type="submit" style={buttonStyle}>Aprovar</button>
                    </form>
                    <form action={decidirEtapaAprovacaoCompraAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={et.id} />
                      <input type="hidden" name="decisao" value="rejeitar" />
                      <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>Rejeitar</button>
                    </form>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CotacaoItemBlock({
  cotacaoItem,
  scItem,
  item,
  propostas,
  negociacoes,
  selecoes,
  pessoaPorId,
  fornecedores,
  emAberto,
  canManage,
}: {
  cotacaoItem: CotacaoItem;
  scItem: SolicitacaoItem | undefined;
  item: Item | undefined;
  propostas: Proposta[];
  negociacoes: Negociacao[];
  selecoes: Selecao[];
  pessoaPorId: Map<string, Pessoa>;
  fornecedores: Pessoa[];
  emAberto: boolean;
  canManage: boolean;
}) {
  const [mostrarProposta, setMostrarProposta] = useState(false);
  const quantidadeSelecionada = selecoes.reduce((acc, s) => acc + Number(s.quantidade), 0);
  const propostasOrdenadas = [...propostas].sort((a, b) => a.custo_unitario - b.custo_unitario);

  return (
    <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #eef1ef" }}>
      <p style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 4px" }}>
        {item ? `${item.codigo} — ${item.descricao}` : "item"} ({scItem?.quantidade ?? "—"} {item?.unidade_principal ?? ""}) —{" "}
        {quantidadeSelecionada}/{scItem?.quantidade ?? 0} selecionado
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
            <th style={thStyle}>Fornecedor</th>
            <th style={thStyle}>Preço</th>
            <th style={thStyle}>Custo total</th>
            <th style={thStyle}>Prazo</th>
            <th style={thStyle}>Condição</th>
            {canManage && emAberto && <th style={thStyle}></th>}
          </tr>
        </thead>
        <tbody>
          {propostasOrdenadas.map((p) => (
            <PropostaRow
              key={p.id}
              proposta={p}
              pessoaNome={pessoaPorId.get(p.pessoa_id)?.nome_fantasia || pessoaPorId.get(p.pessoa_id)?.nome || p.pessoa_id}
              rodadas={negociacoes.filter((n) => n.cotacao_proposta_id === p.id).length}
              cotacaoItemId={cotacaoItem.id}
              emAberto={emAberto}
              canManage={canManage}
            />
          ))}
        </tbody>
      </table>
      {propostas.length === 0 && <p style={hintStyle}>Nenhuma proposta registrada ainda.</p>}

      {canManage && emAberto && (
        <div style={{ marginTop: "4px" }}>
          {!mostrarProposta ? (
            <button type="button" onClick={() => setMostrarProposta(true)} style={{ ...buttonStyle, background: "#fff", color: "#1f5d57", border: "1px solid #dae2de" }}>
              Registrar proposta
            </button>
          ) : (
            <form action={registrarPropostaCotacaoAction} onSubmit={() => setMostrarProposta(false)} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
              <input type="hidden" name="cotacao_item_id" value={cotacaoItem.id} />
              <select name="pessoa_id" required style={inputStyle}>
                <option value="">fornecedor…</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome_fantasia || f.nome}</option>
                ))}
              </select>
              <input name="preco_unitario" type="number" min="0" step="0.0001" placeholder="preço" required style={{ ...inputStyle, width: "80px" }} />
              <input name="desconto" type="number" min="0" step="0.0001" placeholder="desconto" style={{ ...inputStyle, width: "80px" }} />
              <input name="impostos" type="number" min="0" step="0.0001" placeholder="impostos" style={{ ...inputStyle, width: "80px" }} />
              <input name="frete" type="number" min="0" step="0.0001" placeholder="frete" style={{ ...inputStyle, width: "70px" }} />
              <input name="prazo_entrega_dias" type="number" min="0" step="1" placeholder="prazo (d)" style={{ ...inputStyle, width: "80px" }} />
              <input name="condicao_pagamento" placeholder="condição" style={{ ...inputStyle, width: "100px" }} />
              <input name="validade" type="date" style={inputStyle} />
              <button type="submit" style={buttonStyle}>Salvar</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function PropostaRow({
  proposta,
  pessoaNome,
  rodadas,
  cotacaoItemId,
  emAberto,
  canManage,
}: {
  proposta: Proposta;
  pessoaNome: string;
  rodadas: number;
  cotacaoItemId: string;
  emAberto: boolean;
  canManage: boolean;
}) {
  const [negociando, setNegociando] = useState(false);
  const [selecionando, setSelecionando] = useState(false);

  return (
    <>
      <tr style={{ borderBottom: "1px solid #eef1ef" }}>
        <td style={tdStyle}>{pessoaNome} {rodadas > 0 && <span style={{ color: "#6b7a75" }}>({rodadas}x negociado)</span>}</td>
        <td style={tdStyle}>{proposta.preco_unitario}</td>
        <td style={tdStyle}>{proposta.custo_unitario}</td>
        <td style={tdStyle}>{proposta.prazo_entrega_dias ?? "—"}d</td>
        <td style={tdStyle}>{proposta.condicao_pagamento ?? "—"}</td>
        {canManage && emAberto && (
          <td style={tdStyle}>
            <button type="button" onClick={() => setNegociando((v) => !v)} style={{ ...buttonStyle, background: "#fff", color: "#1f5d57", border: "1px solid #dae2de", marginRight: "4px" }}>
              Negociar
            </button>
            <button type="button" onClick={() => setSelecionando((v) => !v)} style={buttonStyle}>
              Selecionar
            </button>
          </td>
        )}
      </tr>
      {negociando && (
        <tr>
          <td colSpan={6} style={tdStyle}>
            <form action={registrarNegociacaoCotacaoAction} onSubmit={() => setNegociando(false)} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input type="hidden" name="cotacao_proposta_id" value={proposta.id} />
              <input name="preco_novo" type="number" min="0" step="0.0001" placeholder="novo preço" required style={{ ...inputStyle, width: "90px" }} />
              <input name="condicao_nova" placeholder="nova condição (opcional)" style={{ ...inputStyle, width: "120px" }} />
              <input name="observacao" placeholder="observação (opcional)" style={{ ...inputStyle, width: "160px" }} />
              <button type="submit" style={buttonStyle}>Registrar negociação</button>
            </form>
          </td>
        </tr>
      )}
      {selecionando && (
        <tr>
          <td colSpan={6} style={tdStyle}>
            <form action={selecionarFornecedorCotacaoAction} onSubmit={() => setSelecionando(false)} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input type="hidden" name="cotacao_item_id" value={cotacaoItemId} />
              <input type="hidden" name="cotacao_proposta_id" value={proposta.id} />
              <input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required style={{ ...inputStyle, width: "90px" }} />
              <input name="justificativa" placeholder="justificativa (obrigatória)" required style={{ ...inputStyle, width: "220px" }} />
              <button type="submit" style={buttonStyle}>Confirmar seleção</button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

function AlcadaSection({ alcadas, roles, canManage }: { alcadas: Alcada[]; roles: Role[]; canManage: boolean }) {
  const rolePorId = new Map(roles.map((r) => [r.id, r]));

  return (
    <section>
      <h2 style={sectionTitleStyle}>Alçada de compras</h2>
      <p style={hintStyle}>
        Etapas por valor mínimo e perfil aprovador, dentro de um processo (hoje só &quot;cotacao&quot;).
        Decididas em ordem — a etapa 2 só fica decidível depois da 1 ser aprovada.
      </p>

      {canManage && (
        <form action={upsertAlcadaCompraAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
          <input name="processo" defaultValue="cotacao" style={{ ...inputStyle, width: "90px" }} />
          <input name="ordem" type="number" min="1" step="1" placeholder="ordem" required style={{ ...inputStyle, width: "70px" }} />
          <input name="valor_minimo" type="number" min="0" step="0.01" placeholder="valor mín. (R$)" required style={{ ...inputStyle, width: "110px" }} />
          <select name="role_id" required style={inputStyle}>
            <option value="">perfil aprovador…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button type="submit" style={buttonStyle}>Salvar etapa</button>
        </form>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
            <th style={thStyle}>Processo</th>
            <th style={thStyle}>Ordem</th>
            <th style={thStyle}>A partir de</th>
            <th style={thStyle}>Perfil</th>
            <th style={thStyle}>Ativa</th>
            {canManage && <th style={thStyle}></th>}
          </tr>
        </thead>
        <tbody>
          {alcadas.map((a) => (
            <tr key={a.id} style={{ borderBottom: "1px solid #eef1ef" }}>
              <td style={tdStyle}>{a.processo}</td>
              <td style={tdStyle}>{a.ordem}</td>
              <td style={tdStyle}>R$ {Number(a.valor_minimo).toFixed(2)}</td>
              <td style={tdStyle}>{rolePorId.get(a.role_id)?.name ?? a.role_id}</td>
              <td style={tdStyle}>{a.ativo ? "Sim" : "Não"}</td>
              {canManage && (
                <td style={tdStyle}>
                  {a.ativo && (
                    <form action={desativarAlcadaCompraAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
                        Desativar
                      </button>
                    </form>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {alcadas.length === 0 && <p style={hintStyle}>Nenhuma etapa de alçada configurada — cotações são aprovadas automaticamente.</p>}
    </section>
  );
}
