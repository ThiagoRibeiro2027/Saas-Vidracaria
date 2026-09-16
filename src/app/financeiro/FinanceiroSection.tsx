"use client";

import { useRef, useState } from "react";
import { cancelarTituloFinanceiroAction, gerarTitulosPedidoAction, registrarRecebimentoTituloAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  parcial: "Parcial",
  pago: "Pago",
  cancelado: "Cancelado",
};

type Titulo = {
  id: string;
  pedido_id: string;
  numero: string;
  valor: number;
  valor_recebido: number;
  saldo_pendente: number;
  vencimento: string;
  condicao_pagamento: string | null;
  parcela_numero: number;
  parcela_total: number;
  status: "aberto" | "parcial" | "pago" | "cancelado";
  motivo_cancelamento: string | null;
};

type PedidoResumo = { id: string; numero: string; pessoa_id: string };

export default function FinanceiroSection({
  titulos,
  pedidosSemTitulo,
  nomePorPedido,
  nomePorPessoa,
  canManage,
  canReceber,
}: {
  titulos: Titulo[];
  pedidosSemTitulo: PedidoResumo[];
  nomePorPedido: Map<string, PedidoResumo>;
  nomePorPessoa: Map<string, string>;
  canManage: boolean;
  canReceber: boolean;
}) {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Títulos financeiros</h2>
      <p style={hintStyle}>
        Recorte mínimo do MVP (ADR-002 §4.14): título a receber vinculado a pedido, gerado
        manualmente com as parcelas planejadas — a soma precisa fechar o valor do pedido. Sem
        plano de contas, contas a pagar, conciliação ou DRE.
      </p>

      {canManage && pedidosSemTitulo.length > 0 && <GerarTitulosForm pedidos={pedidosSemTitulo} />}

      <div style={{ overflowX: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
              <th style={thStyle}>Número</th>
              <th style={thStyle}>Pedido</th>
              <th style={thStyle}>Cliente</th>
              <th style={thStyle}>Parcela</th>
              <th style={thStyle}>Valor</th>
              <th style={thStyle}>Recebido</th>
              <th style={thStyle}>Saldo</th>
              <th style={thStyle}>Vencimento</th>
              <th style={thStyle}>Status</th>
              {(canManage || canReceber) && <th style={thStyle}></th>}
            </tr>
          </thead>
          <tbody>
            {titulos.map((t) => {
              const pedido = nomePorPedido.get(t.pedido_id);
              // Mesmo parsing (local, não UTC) usado na exibição da data
              // logo abaixo — um new Date(t.vencimento) bare interpreta
              // "YYYY-MM-DD" como meia-noite UTC, que em UTC-3 (Brasil)
              // fica atrás da meia-noite local o dia inteiro, marcando um
              // título com vencimento hoje como "vencido" prematuramente.
              const vencido = t.status !== "pago" && t.status !== "cancelado" && new Date(`${t.vencimento}T00:00:00`) < new Date(new Date().toDateString());
              return (
                <tr key={t.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{t.numero}</td>
                  <td style={tdStyle}>{pedido?.numero ?? t.pedido_id}</td>
                  <td style={tdStyle}>{pedido ? nomePorPessoa.get(pedido.pessoa_id) ?? "—" : "—"}</td>
                  <td style={tdStyle}>{t.parcela_numero}/{t.parcela_total}</td>
                  <td style={tdStyle}>{currency(t.valor)}</td>
                  <td style={tdStyle}>{currency(t.valor_recebido)}</td>
                  <td style={tdStyle}>{currency(t.saldo_pendente)}</td>
                  <td style={tdStyle}>
                    {new Date(`${t.vencimento}T00:00:00`).toLocaleDateString("pt-BR")}
                    {vencido && <span style={{ color: "#9b2c2c" }}> (vencido)</span>}
                  </td>
                  <td style={tdStyle}>{t.status === "cancelado" ? `${STATUS_LABEL[t.status]} — ${t.motivo_cancelamento ?? ""}` : STATUS_LABEL[t.status]}</td>
                  {(canManage || canReceber) && (
                    <td style={tdStyle}>
                      {(t.status === "aberto" || t.status === "parcial") && (
                        <AcoesTitulo id={t.id} status={t.status} canManage={canManage} canReceber={canReceber} />
                      )}
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

function GerarTitulosForm({ pedidos }: { pedidos: PedidoResumo[] }) {
  const [parcelas, setParcelas] = useState([{ key: 0 }]);
  // useRef, não uma variável local: uma variável local reinicia a cada
  // render, então dois cliques em "+ parcela" (cada um causando um
  // re-render entre eles) geravam a mesma key (1) repetida — React
  // reconciliava errado a partir da 3ª linha (achado do code-review).
  const nextKeyRef = useRef(1);

  return (
    <form action={gerarTitulosPedidoAction} style={{ display: "flex", flexDirection: "column", gap: "8px", background: "#f5f7f5", padding: "12px", borderRadius: "6px" }}>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <select name="pedido_id" required style={inputStyle}>
          <option value="">pedido liberado…</option>
          {pedidos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.numero}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setParcelas((rows) => [...rows, { key: nextKeyRef.current++ }])} style={{ ...buttonStyle, background: "#fff", color: "#1f5d57", border: "1px solid #1f5d57" }}>
          + parcela
        </button>
      </div>

      {parcelas.map((row, i) => (
        <div key={row.key} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input name="parcela_valor" type="number" min="0" step="0.01" placeholder="valor" required style={{ ...inputStyle, width: "100px" }} />
          <input name="parcela_vencimento" type="date" required style={inputStyle} />
          <input name="parcela_condicao" placeholder="condição (opcional)" style={{ ...inputStyle, width: "120px" }} />
          {parcelas.length > 1 && (
            <button type="button" onClick={() => setParcelas((rows) => rows.filter((_, idx) => idx !== i))} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
              remover
            </button>
          )}
        </div>
      ))}

      <button type="submit" style={{ ...buttonStyle, width: "fit-content" }}>
        Gerar título(s)
      </button>
    </form>
  );
}

function AcoesTitulo({ id, status, canManage, canReceber }: { id: string; status: "aberto" | "parcial"; canManage: boolean; canReceber: boolean }) {
  const [modo, setModo] = useState<"nenhum" | "receber" | "cancelar">("nenhum");

  if (modo === "receber") {
    return (
      <form action={registrarRecebimentoTituloAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={id} />
        <input name="valor" type="number" min="0" step="0.01" placeholder="valor" required style={{ ...inputStyle, width: "80px" }} />
        <input name="data_recebimento" type="date" style={inputStyle} />
        <button type="submit" style={buttonStyle}>
          Confirmar
        </button>
        <button type="button" onClick={() => setModo("nenhum")} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
          Voltar
        </button>
      </form>
    );
  }

  if (modo === "cancelar") {
    return (
      <form action={cancelarTituloFinanceiroAction} style={{ display: "flex", gap: "4px" }} onSubmit={() => setModo("nenhum")}>
        <input type="hidden" name="id" value={id} />
        <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "120px" }} />
        <button type="submit" style={{ ...buttonStyle, background: "#9b2c2c" }}>
          Confirmar
        </button>
        <button type="button" onClick={() => setModo("nenhum")} style={{ ...buttonStyle, background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}>
          Voltar
        </button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", gap: "4px" }}>
      {canReceber && (
        <button onClick={() => setModo("receber")} style={buttonStyle}>
          Receber
        </button>
      )}
      {canManage && status === "aberto" && (
        <button onClick={() => setModo("cancelar")} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
          Cancelar
        </button>
      )}
    </div>
  );
}
