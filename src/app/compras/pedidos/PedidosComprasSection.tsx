"use client";

import { useState } from "react";
import {
  gerarPedidoCompraDeCotacaoAction,
  atualizarStatusPedidoCompraAction,
  vincularPedidoCompraContratoAction,
  programarEntregaPedidoCompraAction,
  gerarTitulosPedidoCompraAction,
  registrarPagamentoTituloCompraAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../../configuracoes/styles";

const STATUS_PC_LABEL: Record<string, string> = { emitido: "Emitido", confirmado: "Confirmado", cancelado: "Cancelado" };
const STATUS_TITULO_LABEL: Record<string, string> = { aberto: "Aberto", parcial: "Parcial", pago: "Pago", cancelado: "Cancelado" };

type Cotacao = { id: string; numero: string };
type PedidoCompra = { id: string; numero: string; cotacao_id: string; pessoa_id: string; contrato_id: string | null; status: string; motivo_cancelamento: string | null };
type PedidoItem = { id: string; pedido_compra_id: string; item_id: string; quantidade: number; preco_unitario: number };
type Programacao = { id: string; pedido_compra_id: string; data_entrega: string; quantidade: number; status: string };
type Titulo = { id: string; pedido_compra_id: string; numero: string; valor: number; valor_pago: number; saldo_pendente: number; vencimento: string; status: string };
type Item = { id: string; codigo: string; descricao: string };
type Pessoa = { id: string; nome: string; nome_fantasia: string | null };
type Contrato = { id: string; numero: string; tipo: string; pessoa_id: string; status: string };

export default function PedidosComprasSection({
  cotacoesParaGerar,
  pedidosCompra,
  pedidoItens,
  programacoes,
  titulos,
  itens,
  pessoas,
  contratos,
  canManage,
}: {
  cotacoesParaGerar: Cotacao[];
  pedidosCompra: PedidoCompra[];
  pedidoItens: PedidoItem[];
  programacoes: Programacao[];
  titulos: Titulo[];
  itens: Item[];
  pessoas: Pessoa[];
  contratos: Contrato[];
  canManage: boolean;
}) {
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <section>
        <h2 style={sectionTitleStyle}>Gerar pedido de compra</h2>
        {canManage && cotacoesParaGerar.length > 0 && (
          <form action={gerarPedidoCompraDeCotacaoAction} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
            <select name="cotacao_id" required style={inputStyle}>
              <option value="">cotação aprovada…</option>
              {cotacoesParaGerar.map((c) => (
                <option key={c.id} value={c.id}>{c.numero}</option>
              ))}
            </select>
            <button type="submit" style={buttonStyle}>Gerar pedido(s) de compra</button>
          </form>
        )}
        {cotacoesParaGerar.length === 0 && <p style={hintStyle}>Nenhuma cotação aprovada aguardando geração de PC.</p>}
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Pedidos de compra</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {pedidosCompra.map((pc) => (
            <PedidoCompraCard
              key={pc.id}
              pc={pc}
              itensPc={pedidoItens.filter((pi) => pi.pedido_compra_id === pc.id)}
              programacoesPc={programacoes.filter((p) => p.pedido_compra_id === pc.id)}
              titulosPc={titulos.filter((t) => t.pedido_compra_id === pc.id)}
              itemPorId={itemPorId}
              pessoaNome={pessoaPorId.get(pc.pessoa_id)?.nome_fantasia || pessoaPorId.get(pc.pessoa_id)?.nome || pc.pessoa_id}
              contratosDoFornecedor={contratos.filter((c) => c.pessoa_id === pc.pessoa_id && c.status === "vigente")}
              canManage={canManage}
            />
          ))}
          {pedidosCompra.length === 0 && <p style={hintStyle}>Nenhum pedido de compra gerado ainda.</p>}
        </div>
      </section>
    </div>
  );
}

function PedidoCompraCard({
  pc,
  itensPc,
  programacoesPc,
  titulosPc,
  itemPorId,
  pessoaNome,
  contratosDoFornecedor,
  canManage,
}: {
  pc: PedidoCompra;
  itensPc: PedidoItem[];
  programacoesPc: Programacao[];
  titulosPc: Titulo[];
  itemPorId: Map<string, Item>;
  pessoaNome: string;
  contratosDoFornecedor: Contrato[];
  canManage: boolean;
}) {
  const [mostrarPrograma, setMostrarPrograma] = useState(false);
  const [mostrarTitulos, setMostrarTitulos] = useState(false);
  const valorTotal = itensPc.reduce((acc, i) => acc + Number(i.quantidade) * Number(i.preco_unitario), 0);
  const ativo = pc.status !== "cancelado";

  return (
    <div style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "12px" }}>
        <strong>{pc.numero}</strong>
        <span>{STATUS_PC_LABEL[pc.status]}</span>
        <span style={{ color: "#6b7a75" }}>Fornecedor: {pessoaNome}</span>
        <span style={{ color: "#6b7a75" }}>Total: R$ {valorTotal.toFixed(2)}</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "6px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
            <th style={thStyle}>Item</th>
            <th style={thStyle}>Qtd.</th>
            <th style={thStyle}>Preço unit.</th>
          </tr>
        </thead>
        <tbody>
          {itensPc.map((it) => (
            <tr key={it.id}>
              <td style={tdStyle}>{itemPorId.get(it.item_id)?.codigo ?? it.item_id}</td>
              <td style={tdStyle}>{it.quantidade}</td>
              <td style={tdStyle}>{it.preco_unitario}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {canManage && ativo && (
        <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {pc.status === "emitido" && (
            <form action={atualizarStatusPedidoCompraAction}>
              <input type="hidden" name="id" value={pc.id} />
              <input type="hidden" name="status" value="confirmado" />
              <button type="submit" style={buttonStyle}>Confirmar</button>
            </form>
          )}
          <form action={atualizarStatusPedidoCompraAction}>
            <input type="hidden" name="id" value={pc.id} />
            <input type="hidden" name="status" value="cancelado" />
            <button type="submit" style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
              Cancelar
            </button>
          </form>

          {!pc.contrato_id && contratosDoFornecedor.length > 0 && (
            <form action={vincularPedidoCompraContratoAction} style={{ display: "flex", gap: "4px" }}>
              <input type="hidden" name="pedido_compra_id" value={pc.id} />
              <select name="contrato_id" required style={inputStyle}>
                <option value="">vincular contrato…</option>
                {contratosDoFornecedor.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero}</option>
                ))}
              </select>
              <button type="submit" style={buttonStyle}>Vincular</button>
            </form>
          )}

          <button type="button" onClick={() => setMostrarPrograma((v) => !v)} style={{ ...buttonStyle, background: "#fff", color: "#1f5d57", border: "1px solid #dae2de" }}>
            Programar entrega
          </button>
          {titulosPc.length === 0 && (
            <button type="button" onClick={() => setMostrarTitulos((v) => !v)} style={{ ...buttonStyle, background: "#fff", color: "#1f5d57", border: "1px solid #dae2de" }}>
              Gerar título a pagar
            </button>
          )}
        </div>
      )}

      {mostrarPrograma && (
        <form action={programarEntregaPedidoCompraAction} onSubmit={() => setMostrarPrograma(false)} style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "6px" }}>
          <input type="hidden" name="pedido_compra_id" value={pc.id} />
          <input name="data_entrega" type="date" required style={inputStyle} />
          <input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required style={{ ...inputStyle, width: "90px" }} />
          <button type="submit" style={buttonStyle}>Salvar</button>
        </form>
      )}

      {mostrarTitulos && (
        <form action={gerarTitulosPedidoCompraAction} onSubmit={() => setMostrarTitulos(false)} style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "6px" }}>
          <input type="hidden" name="pedido_compra_id" value={pc.id} />
          <input type="hidden" name="valor_total" value={valorTotal} />
          <span>Parcela única de R$ {valorTotal.toFixed(2)}, vencimento:</span>
          <input name="vencimento" type="date" required style={inputStyle} />
          <input name="condicao_pagamento" placeholder="condição (opcional)" style={{ ...inputStyle, width: "120px" }} />
          <button type="submit" style={buttonStyle}>Gerar título</button>
        </form>
      )}

      {programacoesPc.length > 0 && (
        <div style={{ marginTop: "6px" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 2px" }}>Entregas programadas:</p>
          {programacoesPc.map((p) => (
            <span key={p.id} style={{ fontSize: "12px", marginRight: "10px" }}>
              {new Date(`${p.data_entrega}T00:00:00`).toLocaleDateString("pt-BR")}: {p.quantidade}
            </span>
          ))}
        </div>
      )}

      {titulosPc.length > 0 && (
        <div style={{ marginTop: "6px" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 2px" }}>Títulos a pagar:</p>
          {titulosPc.map((t) => (
            <TituloRow key={t.id} titulo={t} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

function TituloRow({ titulo, canManage }: { titulo: Titulo; canManage: boolean }) {
  const [pagando, setPagando] = useState(false);

  return (
    <div style={{ fontSize: "12px", display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
      <span>
        {titulo.numero}: R$ {Number(titulo.valor).toFixed(2)} (pago R$ {Number(titulo.valor_pago).toFixed(2)}, saldo R$ {Number(titulo.saldo_pendente).toFixed(2)}) —
        vence {new Date(`${titulo.vencimento}T00:00:00`).toLocaleDateString("pt-BR")} — {STATUS_TITULO_LABEL[titulo.status]}
      </span>
      {canManage && ["aberto", "parcial"].includes(titulo.status) && (
        !pagando ? (
          <button type="button" onClick={() => setPagando(true)} style={buttonStyle}>Registrar pagamento</button>
        ) : (
          <form action={registrarPagamentoTituloCompraAction} onSubmit={() => setPagando(false)} style={{ display: "flex", gap: "4px" }}>
            <input type="hidden" name="titulo_id" value={titulo.id} />
            <input name="valor" type="number" min="0.01" step="0.01" placeholder="valor" required style={{ ...inputStyle, width: "80px" }} />
            <input name="data_pagamento" type="date" style={inputStyle} />
            <button type="submit" style={buttonStyle}>Confirmar</button>
          </form>
        )
      )}
    </div>
  );
}
