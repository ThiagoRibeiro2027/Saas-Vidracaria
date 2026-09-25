"use client";

import { useState } from "react";
import {
  atenderNecessidadeCompraAction,
  cancelarNecessidadeCompraAction,
  criarNecessidadeCompraAction,
  gerarNecessidadesDePedidoAction,
  gerarNecessidadesDeOrdemProducaoAction,
  registrarRecebimentoNecessidadeAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

const ORIGENS = [
  ["manual", "Manual"],
  ["pedido", "Pedido"],
  ["producao", "Produção"],
] as const;

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  atendida: "Atendida",
  cancelada: "Cancelada",
  recebida: "Recebida",
};

type Item = { id: string; codigo: string; descricao: string; unidade_principal: string };
type Necessidade = {
  id: string;
  item_id: string;
  quantidade: number;
  data_necessaria: string | null;
  origem: string;
  status: "aberta" | "atendida" | "cancelada" | "recebida";
  observacoes: string | null;
  motivo_cancelamento: string | null;
  quantidade_recebida: number | null;
  data_recebimento: string | null;
  created_at: string;
};

type Pedido = { id: string; numero: string };
type OrdemProducao = { id: string; numero: string; pedido_id: string };

export default function SuprimentosSection({
  rows,
  itens,
  pedidos,
  ordensProducao,
  canManage,
}: {
  rows: Necessidade[];
  itens: Item[];
  pedidos: Pedido[];
  ordensProducao: OrdemProducao[];
  canManage: boolean;
}) {
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const pedidoPorId = new Map(pedidos.map((p) => [p.id, p]));

  return (
    <section>
      <h2 style={sectionTitleStyle}>Necessidades de compra</h2>
      <p style={hintStyle}>
        Recorte mínimo do MVP (ADR-002 §4.18): registrar a necessidade, o material e a quantidade,
        e acompanhar até ser atendida, cancelada ou recebida. Sem fornecedor, cotação ou pedido de
        compra — a negociação/efetivação da compra acontece fora do sistema. Recebimento (ADR-002
        §4.18 v2.7, Fase D) é só o passo a mais que fecha o ciclo: marcar como recebida com a
        quantidade recebida dá entrada física no estoque — sem nota fiscal, conferência ou
        recebimento parcial rastreado por remessa.
      </p>

      {canManage && <GerarNecessidadesForm pedidos={pedidos} ordensProducao={ordensProducao} pedidoPorId={pedidoPorId} />}
      {canManage && <NovaNecessidadeForm itens={itens} />}

      <div style={{ overflowX: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Quantidade</th>
              <th style={thStyle}>Necessária em</th>
              <th style={thStyle}>Origem</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Observações</th>
              {canManage && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const item = itemPorId.get(row.item_id);
              return (
                <tr key={row.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{item ? `${item.codigo} — ${item.descricao}` : row.item_id}</td>
                  <td style={tdStyle}>
                    {row.quantidade} {item?.unidade_principal ?? ""}
                  </td>
                  <td style={tdStyle}>{row.data_necessaria ? new Date(`${row.data_necessaria}T00:00:00`).toLocaleDateString("pt-BR") : "—"}</td>
                  <td style={tdStyle}>{ORIGENS.find(([v]) => v === row.origem)?.[1] ?? row.origem}</td>
                  <td style={tdStyle}>{STATUS_LABEL[row.status]}</td>
                  <td style={tdStyle}>
                    {row.status === "cancelada" && row.motivo_cancelamento}
                    {row.status === "recebida" &&
                      `Recebido: ${row.quantidade_recebida} ${item?.unidade_principal ?? ""} em ${
                        row.data_recebimento ? new Date(row.data_recebimento).toLocaleDateString("pt-BR") : "—"
                      }`}
                    {row.status !== "cancelada" && row.status !== "recebida" && row.observacoes}
                  </td>
                  {canManage && (
                    <td style={tdStyle}>
                      {row.status === "aberta" && <AcoesNecessidade id={row.id} />}
                      {row.status === "atendida" && <RegistrarRecebimentoForm id={row.id} unidade={item?.unidade_principal ?? ""} />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GerarNecessidadesForm({
  pedidos,
  ordensProducao,
  pedidoPorId,
}: {
  pedidos: Pedido[];
  ordensProducao: OrdemProducao[];
  pedidoPorId: Map<string, Pedido>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "16px",
        alignItems: "center",
        marginBottom: "12px",
        padding: "8px 10px",
        background: "#f5f7f5",
        borderRadius: "6px",
      }}
    >
      <form action={gerarNecessidadesDePedidoAction} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <select name="pedido_id" required style={{ ...inputStyle, width: "160px" }}>
          <option value="">Gerar do pedido…</option>
          {pedidos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.numero}
            </option>
          ))}
        </select>
        <button type="submit" style={buttonStyle}>
          Gerar necessidades
        </button>
      </form>

      <form action={gerarNecessidadesDeOrdemProducaoAction} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <select name="ordem_producao_id" required style={{ ...inputStyle, width: "220px" }}>
          <option value="">Gerar da ordem de produção…</option>
          {ordensProducao.map((op) => (
            <option key={op.id} value={op.id}>
              {op.numero} ({pedidoPorId.get(op.pedido_id)?.numero ?? op.pedido_id})
            </option>
          ))}
        </select>
        <button type="submit" style={buttonStyle}>
          Gerar necessidades
        </button>
      </form>
    </div>
  );
}

function NovaNecessidadeForm({ itens }: { itens: Item[] }) {
  return (
    <form action={criarNecessidadeCompraAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
      <select name="item_id" required style={inputStyle}>
        <option value="">item…</option>
        {itens.map((i) => (
          <option key={i.id} value={i.id}>
            {i.codigo} — {i.descricao}
          </option>
        ))}
      </select>
      <input name="quantidade" type="number" min="0" step="0.001" placeholder="quantidade" required style={{ ...inputStyle, width: "100px" }} />
      <input name="data_necessaria" type="date" style={inputStyle} />
      <select name="origem" defaultValue="manual" style={inputStyle}>
        {ORIGENS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input name="observacoes" placeholder="observações (opcional)" style={{ ...inputStyle, width: "180px" }} />
      <button type="submit" style={buttonStyle}>
        Registrar necessidade
      </button>
    </form>
  );
}

function RegistrarRecebimentoForm({ id, unidade }: { id: string; unidade: string }) {
  const [recebendo, setRecebendo] = useState(false);

  if (!recebendo) {
    return (
      <button onClick={() => setRecebendo(true)} style={buttonStyle}>
        Registrar recebimento
      </button>
    );
  }

  return (
    <form
      action={registrarRecebimentoNecessidadeAction}
      style={{ display: "flex", gap: "4px", alignItems: "center" }}
      onSubmit={() => setRecebendo(false)}
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="quantidade_recebida"
        type="number"
        min="0.001"
        step="0.001"
        placeholder={`qtd. recebida (${unidade})`}
        required
        style={{ ...inputStyle, width: "110px" }}
      />
      <input name="observacao" placeholder="observação (opcional)" style={{ ...inputStyle, width: "120px" }} />
      <button type="submit" style={buttonStyle}>
        Confirmar
      </button>
      <button type="button" onClick={() => setRecebendo(false)} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
        Voltar
      </button>
    </form>
  );
}

function AcoesNecessidade({ id }: { id: string }) {
  const [cancelando, setCancelando] = useState(false);

  if (cancelando) {
    return (
      <form
        action={cancelarNecessidadeCompraAction}
        style={{ display: "flex", gap: "4px" }}
        onSubmit={() => setCancelando(false)}
      >
        <input type="hidden" name="id" value={id} />
        <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "120px" }} />
        <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>
          Confirmar
        </button>
        <button type="button" onClick={() => setCancelando(false)} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
          Voltar
        </button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", gap: "4px" }}>
      <form action={atenderNecessidadeCompraAction}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" style={buttonStyle}>
          Atender
        </button>
      </form>
      <button onClick={() => setCancelando(true)} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
        Cancelar
      </button>
    </div>
  );
}
