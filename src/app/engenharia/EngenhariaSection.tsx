"use client";

import { criarItemProducaoAction, registrarMedicaoAction, confirmarMedicaoAction } from "./actions";
import { hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type Pessoa = { id: string; nome: string };
type Obra = { id: string; nome: string };
type Item = { id: string; codigo: string; descricao: string; tipo: string };

type Pedido = {
  id: string;
  numero: string;
  pessoa_id: string;
  obra_id: string | null;
};

type PedidoItem = { id: string; pedido_id: string; item_id: string; quantidade: number };

type ItemProducao = {
  id: string;
  pedido_item_id: string;
  ambiente: string | null;
  largura_mm: number | null;
  altura_mm: number | null;
  medida_confirmada: boolean;
};

export default function EngenhariaSection({
  pedidos,
  pedidoItensPorPedido,
  itemProducaoPorPedidoItem,
  pessoas,
  obras,
  itens,
  canManage,
}: {
  pedidos: Pedido[];
  pedidoItensPorPedido: Map<string, PedidoItem[]>;
  itemProducaoPorPedidoItem: Map<string, ItemProducao>;
  pessoas: Pessoa[];
  obras: Obra[];
  itens: Item[];
  canManage: boolean;
}) {
  const pessoaNome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const obraNome = (id: string | null) => (id ? obras.find((o) => o.id === id)?.nome ?? "(obra removida)" : "—");
  const itemLabel = (id: string) => {
    const it = itens.find((i) => i.id === id);
    return it ? `${it.codigo} — ${it.descricao}` : "(item removido)";
  };

  return (
    <section>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {pedidos.map((ped) => {
          const itensDoPedido = pedidoItensPorPedido.get(ped.id) ?? [];

          return (
            <div key={ped.id} style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "baseline", fontSize: "12px" }}>
                <strong style={{ fontSize: "13px" }}>{ped.numero}</strong>
                <span>{pessoaNome(ped.pessoa_id)}</span>
                <span style={{ color: "#6b7a75" }}>{obraNome(ped.obra_id)}</span>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "8px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                    <th style={thStyle}>Item</th>
                    <th style={thStyle}>Qtd</th>
                    <th style={thStyle}>Ambiente</th>
                    <th style={thStyle}>Largura (mm)</th>
                    <th style={thStyle}>Altura (mm)</th>
                    <th style={thStyle}>Medida</th>
                    {canManage && <th style={thStyle}></th>}
                  </tr>
                </thead>
                <tbody>
                  {itensDoPedido.map((pi) => {
                    const producao = itemProducaoPorPedidoItem.get(pi.id);
                    return (
                      <ItemProducaoRow
                        key={pi.id}
                        pedidoItem={pi}
                        producao={producao}
                        itemLabel={itemLabel(pi.item_id)}
                        canManage={canManage}
                      />
                    );
                  })}
                </tbody>
              </table>
              {itensDoPedido.length === 0 && <p style={hintStyle}>Pedido sem itens.</p>}
            </div>
          );
        })}
        {pedidos.length === 0 && (
          <p style={hintStyle}>Nenhum pedido liberado ainda — a Engenharia só entra depois da liberação (TÓPICO 3).</p>
        )}
      </div>
    </section>
  );
}

function ItemProducaoRow({
  pedidoItem,
  producao,
  itemLabel,
  canManage,
}: {
  pedidoItem: PedidoItem;
  producao: ItemProducao | undefined;
  itemLabel: string;
  canManage: boolean;
}) {
  if (!producao) {
    return (
      <tr style={{ borderBottom: "1px solid #f4f6f5" }}>
        <td style={tdStyle}>{itemLabel}</td>
        <td style={tdStyle}>{pedidoItem.quantidade}</td>
        <td style={tdStyle} colSpan={4}>
          <span style={{ color: "#6b7a75" }}>Engenharia ainda não iniciada</span>
        </td>
        {canManage && (
          <td style={tdStyle}>
            <form action={criarItemProducaoAction}>
              <input type="hidden" name="pedido_item_id" value={pedidoItem.id} />
              <button type="submit" style={buttonStyle}>
                Iniciar engenharia
              </button>
            </form>
          </td>
        )}
      </tr>
    );
  }

  return (
    <tr style={{ borderBottom: "1px solid #f4f6f5" }}>
      <td style={tdStyle}>{itemLabel}</td>
      <td style={tdStyle}>{pedidoItem.quantidade}</td>
      {canManage ? (
        <td style={tdStyle} colSpan={4}>
          <form
            action={registrarMedicaoAction}
            style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
          >
            <input type="hidden" name="id" value={producao.id} />
            <input
              name="ambiente"
              placeholder="ambiente"
              defaultValue={producao.ambiente ?? ""}
              style={{ ...inputStyle, width: "110px" }}
            />
            <input
              name="largura_mm"
              type="number"
              step="0.1"
              min="0.1"
              placeholder="largura (mm)"
              defaultValue={producao.largura_mm ?? ""}
              required
              style={{ ...inputStyle, width: "90px" }}
            />
            <input
              name="altura_mm"
              type="number"
              step="0.1"
              min="0.1"
              placeholder="altura (mm)"
              defaultValue={producao.altura_mm ?? ""}
              required
              style={{ ...inputStyle, width: "90px" }}
            />
            <button type="submit" style={buttonStyle}>
              {producao.largura_mm ? "Corrigir medida" : "Registrar medida"}
            </button>
            <span
              style={{
                fontFamily: "monospace",
                color: producao.medida_confirmada ? "#1f5d57" : "#b7791f",
              }}
            >
              {producao.medida_confirmada ? "Confirmada" : "Não confirmada"}
            </span>
          </form>
          {!producao.medida_confirmada && producao.largura_mm != null && (
            <form action={confirmarMedicaoAction} style={{ marginTop: "4px" }}>
              <input type="hidden" name="id" value={producao.id} />
              <button type="submit" style={buttonStyle}>
                Confirmar medida
              </button>
            </form>
          )}
        </td>
      ) : (
        <>
          <td style={tdStyle}>{producao.ambiente ?? "—"}</td>
          <td style={tdStyle}>{producao.largura_mm ?? "—"}</td>
          <td style={tdStyle}>{producao.altura_mm ?? "—"}</td>
          <td style={tdStyle}>
            <span style={{ color: producao.medida_confirmada ? "#1f5d57" : "#b7791f" }}>
              {producao.medida_confirmada ? "Confirmada" : "Não confirmada"}
            </span>
          </td>
        </>
      )}
    </tr>
  );
}
