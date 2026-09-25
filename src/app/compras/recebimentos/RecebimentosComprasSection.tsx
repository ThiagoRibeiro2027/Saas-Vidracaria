"use client";

import { useState } from "react";
import {
  registrarRecebimentoPedidoCompraAction,
  registrarLoteRecebimentoAction,
  registrarDivergenciaRecebimentoAction,
  tratarDivergenciaAction,
  finalizarConferenciaRecebimentoAction,
  registrarDevolucaoCompraAction,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, labelStyle, buttonStyle } from "../../configuracoes/styles";

const STATUS_RECEBIMENTO_LABEL: Record<string, string> = { em_conferencia: "Em conferência", conferido: "Conferido", cancelado: "Cancelado" };
const STATUS_ITEM_LABEL: Record<string, string> = { pendente: "Pendente", quarentena: "Quarentena", conferido: "Conferido" };
const TIPO_DIVERGENCIA_LABEL: Record<string, string> = {
  quantidade_menor: "Quantidade a menor",
  quantidade_maior: "Quantidade a maior",
  avaria: "Avaria",
  qualidade: "Qualidade",
  documentacao: "Documentação",
  atraso: "Atraso",
  outra: "Outra",
};

type PedidoCompra = { id: string; numero: string; pessoa_id: string; status: string };
type PedidoItem = { id: string; pedido_compra_id: string; item_id: string; quantidade: number };
type Recebimento = { id: string; pedido_compra_id: string; numero: string; numero_nf: string | null; transportadora: string | null; status: string; data_recebimento: string };
type RecebimentoItem = { id: string; recebimento_id: string; pedido_compra_item_id: string; item_id: string; quantidade_recebida: number; quantidade_aceita: number | null; status: string };
type Lote = { id: string; recebimento_item_id: string; numero_lote: string; quantidade: number; data_fabricacao: string | null; data_validade: string | null; certificado: string | null };
type Divergencia = { id: string; recebimento_item_id: string; tipo: string; quantidade_divergente: number | null; descricao: string; status: string; decisao: string | null };
type Devolucao = { id: string; recebimento_item_id: string; quantidade: number; motivo: string; status: string };
type Item = { id: string; codigo: string; descricao: string };
type Pessoa = { id: string; nome: string; nome_fantasia: string | null };

export default function RecebimentosComprasSection({
  pedidosCompra,
  pedidoItens,
  recebimentos,
  recebimentoItens,
  lotes,
  divergencias,
  devolucoes,
  itens,
  pessoas,
  canManage,
}: {
  pedidosCompra: PedidoCompra[];
  pedidoItens: PedidoItem[];
  recebimentos: Recebimento[];
  recebimentoItens: RecebimentoItem[];
  lotes: Lote[];
  divergencias: Divergencia[];
  devolucoes: Devolucao[];
  itens: Item[];
  pessoas: Pessoa[];
  canManage: boolean;
}) {
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));
  const jaRecebidoPorPedidoItem = new Map<string, number>();
  for (const ri of recebimentoItens) {
    jaRecebidoPorPedidoItem.set(
      ri.pedido_compra_item_id,
      (jaRecebidoPorPedidoItem.get(ri.pedido_compra_item_id) ?? 0) + Number(ri.quantidade_recebida),
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {canManage && (
        <NovoRecebimentoForm
          pedidosCompra={pedidosCompra}
          pedidoItens={pedidoItens}
          itemPorId={itemPorId}
          pessoaPorId={pessoaPorId}
          jaRecebidoPorPedidoItem={jaRecebidoPorPedidoItem}
        />
      )}

      <section>
        <h2 style={sectionTitleStyle}>Recebimentos registrados</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {recebimentos.map((r) => (
            <RecebimentoCard
              key={r.id}
              recebimento={r}
              pedidoCompra={pedidosCompra.find((pc) => pc.id === r.pedido_compra_id)}
              itensDoRecebimento={recebimentoItens.filter((ri) => ri.recebimento_id === r.id)}
              lotes={lotes}
              divergencias={divergencias}
              devolucoes={devolucoes}
              itemPorId={itemPorId}
              canManage={canManage}
            />
          ))}
          {recebimentos.length === 0 && <p style={hintStyle}>Nenhum recebimento registrado ainda.</p>}
        </div>
      </section>
    </div>
  );
}

function NovoRecebimentoForm({
  pedidosCompra,
  pedidoItens,
  itemPorId,
  pessoaPorId,
  jaRecebidoPorPedidoItem,
}: {
  pedidosCompra: PedidoCompra[];
  pedidoItens: PedidoItem[];
  itemPorId: Map<string, Item>;
  pessoaPorId: Map<string, Pessoa>;
  jaRecebidoPorPedidoItem: Map<string, number>;
}) {
  const [pedidoCompraId, setPedidoCompraId] = useState("");
  const itensDoPedido = pedidoItens.filter((pi) => pi.pedido_compra_id === pedidoCompraId);

  return (
    <section>
      <h2 style={sectionTitleStyle}>Registrar recebimento</h2>
      <form action={registrarRecebimentoPedidoCompraAction} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          <select name="pedido_compra_id" required value={pedidoCompraId} onChange={(e) => setPedidoCompraId(e.target.value)} style={inputStyle}>
            <option value="">pedido de compra…</option>
            {pedidosCompra.map((pc) => (
              <option key={pc.id} value={pc.id}>
                {pc.numero} — {pessoaPorId.get(pc.pessoa_id)?.nome_fantasia || pessoaPorId.get(pc.pessoa_id)?.nome || pc.pessoa_id}
              </option>
            ))}
          </select>
          <input name="numero_nf" placeholder="número da NF (opcional)" style={inputStyle} />
          <input name="transportadora" placeholder="transportadora (opcional)" style={inputStyle} />
        </div>

        {itensDoPedido.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>Total do pedido</th>
                <th style={thStyle}>Já recebido</th>
                <th style={thStyle}>Recebendo agora</th>
              </tr>
            </thead>
            <tbody>
              {itensDoPedido.map((pi) => {
                const jaRecebido = jaRecebidoPorPedidoItem.get(pi.id) ?? 0;
                const restante = Number(pi.quantidade) - jaRecebido;
                return (
                  <tr key={pi.id}>
                    <td style={tdStyle}>{itemPorId.get(pi.item_id)?.codigo ?? pi.item_id}</td>
                    <td style={tdStyle}>{pi.quantidade}</td>
                    <td style={tdStyle}>{jaRecebido}</td>
                    <td style={tdStyle}>
                      <input
                        name={`qtd_${pi.id}`}
                        type="number"
                        min="0"
                        max={restante > 0 ? restante : 0}
                        step="0.0001"
                        placeholder="0"
                        disabled={restante <= 0}
                        style={{ ...inputStyle, width: "90px" }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <textarea name="observacoes" placeholder="observações (opcional)" style={{ ...inputStyle, minHeight: "40px" }} />

        {itensDoPedido.length > 0 && <button type="submit" style={{ ...buttonStyle, alignSelf: "flex-start" }}>Registrar recebimento</button>}
        {pedidoCompraId && itensDoPedido.length === 0 && <p style={hintStyle}>Este pedido de compra não tem itens.</p>}
      </form>
    </section>
  );
}

function RecebimentoCard({
  recebimento,
  pedidoCompra,
  itensDoRecebimento,
  lotes,
  divergencias,
  devolucoes,
  itemPorId,
  canManage,
}: {
  recebimento: Recebimento;
  pedidoCompra: PedidoCompra | undefined;
  itensDoRecebimento: RecebimentoItem[];
  lotes: Lote[];
  divergencias: Divergencia[];
  devolucoes: Devolucao[];
  itemPorId: Map<string, Item>;
  canManage: boolean;
}) {
  const temDivergenciaAberta = itensDoRecebimento.some((ri) =>
    divergencias.some((d) => d.recebimento_item_id === ri.id && d.status === "aberta"),
  );

  return (
    <div style={{ border: "1px solid #dae2de", borderRadius: "6px", padding: "10px 12px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "12px" }}>
        <strong>{recebimento.numero}</strong>
        <span>{STATUS_RECEBIMENTO_LABEL[recebimento.status]}</span>
        <span style={{ color: "#6b7a75" }}>PC: {pedidoCompra?.numero ?? recebimento.pedido_compra_id}</span>
        {recebimento.numero_nf && <span style={{ color: "#6b7a75" }}>NF: {recebimento.numero_nf}</span>}
        {recebimento.transportadora && <span style={{ color: "#6b7a75" }}>Transp.: {recebimento.transportadora}</span>}
        <span style={{ color: "#6b7a75" }}>{new Date(`${recebimento.data_recebimento}T00:00:00`).toLocaleDateString("pt-BR")}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
        {itensDoRecebimento.map((ri) => (
          <RecebimentoItemRow
            key={ri.id}
            item={ri}
            itemNome={itemPorId.get(ri.item_id)?.codigo ?? ri.item_id}
            lotes={lotes.filter((l) => l.recebimento_item_id === ri.id)}
            divergencias={divergencias.filter((d) => d.recebimento_item_id === ri.id)}
            devolucoes={devolucoes.filter((d) => d.recebimento_item_id === ri.id)}
            canManage={canManage}
          />
        ))}
      </div>

      {canManage && recebimento.status === "em_conferencia" && (
        <form action={finalizarConferenciaRecebimentoAction} style={{ marginTop: "8px" }}>
          <input type="hidden" name="id" value={recebimento.id} />
          <button type="submit" style={buttonStyle} disabled={temDivergenciaAberta} title={temDivergenciaAberta ? "Trate todas as divergências abertas antes de finalizar" : undefined}>
            Finalizar conferência {temDivergenciaAberta ? "(bloqueado — divergência aberta)" : ""}
          </button>
        </form>
      )}
    </div>
  );
}

function RecebimentoItemRow({
  item,
  itemNome,
  lotes,
  divergencias,
  devolucoes,
  canManage,
}: {
  item: RecebimentoItem;
  itemNome: string;
  lotes: Lote[];
  divergencias: Divergencia[];
  devolucoes: Devolucao[];
  canManage: boolean;
}) {
  const [mostrarLote, setMostrarLote] = useState(false);
  const [mostrarDivergencia, setMostrarDivergencia] = useState(false);
  const [mostrarDevolucao, setMostrarDevolucao] = useState(false);
  const jaDevolvido = devolucoes.filter((d) => d.status === "registrada").reduce((acc, d) => acc + Number(d.quantidade), 0);
  const podeDevolver = item.status === "conferido" && item.quantidade_aceita !== null && Number(item.quantidade_aceita) - jaDevolvido > 0;

  return (
    <div style={{ borderTop: "1px dashed #eef1ef", paddingTop: "8px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "12px" }}>
        <strong>{itemNome}</strong>
        <span>{STATUS_ITEM_LABEL[item.status]}</span>
        <span style={{ color: "#6b7a75" }}>Recebido: {item.quantidade_recebida}</span>
        {item.quantidade_aceita !== null && <span style={{ color: "#6b7a75" }}>Aceito: {item.quantidade_aceita}</span>}

        {canManage && item.status !== "conferido" && (
          <>
            <button type="button" onClick={() => setMostrarLote((v) => !v)} style={{ ...buttonStyle, background: "#fff", color: "#1f5d57", border: "1px solid #dae2de" }}>
              Registrar lote
            </button>
            <button type="button" onClick={() => setMostrarDivergencia((v) => !v)} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
              Registrar divergência
            </button>
          </>
        )}
        {canManage && podeDevolver && (
          <button type="button" onClick={() => setMostrarDevolucao((v) => !v)} style={{ ...buttonStyle, background: "#fff", color: "#9b2c2c", border: "1px solid #dae2de" }}>
            Registrar devolução
          </button>
        )}
      </div>

      {mostrarLote && (
        <form action={registrarLoteRecebimentoAction} onSubmit={() => setMostrarLote(false)} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginTop: "6px" }}>
          <input type="hidden" name="recebimento_item_id" value={item.id} />
          <input name="numero_lote" placeholder="número do lote" required style={inputStyle} />
          <input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required style={{ ...inputStyle, width: "90px" }} />
          <label style={labelStyle}>Fabricação <input name="data_fabricacao" type="date" style={inputStyle} /></label>
          <label style={labelStyle}>Validade <input name="data_validade" type="date" style={inputStyle} /></label>
          <input name="certificado" placeholder="certificado (opcional)" style={inputStyle} />
          <button type="submit" style={buttonStyle}>Salvar</button>
        </form>
      )}

      {mostrarDivergencia && (
        <form action={registrarDivergenciaRecebimentoAction} onSubmit={() => setMostrarDivergencia(false)} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginTop: "6px" }}>
          <input type="hidden" name="recebimento_item_id" value={item.id} />
          <select name="tipo" required style={inputStyle}>
            <option value="">tipo…</option>
            {Object.entries(TIPO_DIVERGENCIA_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input name="quantidade_divergente" type="number" min="0" step="0.0001" placeholder="quantidade divergente (opcional)" style={{ ...inputStyle, width: "150px" }} />
          <input name="descricao" placeholder="descrição" required style={{ ...inputStyle, flex: 1, minWidth: "160px" }} />
          <button type="submit" style={buttonStyle}>Registrar</button>
        </form>
      )}

      {mostrarDevolucao && (
        <form action={registrarDevolucaoCompraAction} onSubmit={() => setMostrarDevolucao(false)} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginTop: "6px" }}>
          <input type="hidden" name="recebimento_item_id" value={item.id} />
          <input name="quantidade" type="number" min="0.0001" step="0.0001" placeholder="quantidade" required style={{ ...inputStyle, width: "90px" }} />
          <input name="motivo" placeholder="motivo" required style={{ ...inputStyle, flex: 1, minWidth: "160px" }} />
          <button type="submit" style={buttonStyle}>Registrar devolução</button>
        </form>
      )}

      {lotes.length > 0 && (
        <p style={{ fontSize: "12px", color: "#6b7a75", margin: "6px 0 0" }}>
          Lotes: {lotes.map((l) => `${l.numero_lote} (${l.quantidade})`).join(", ")}
        </p>
      )}

      {divergencias.length > 0 && (
        <div style={{ marginTop: "6px" }}>
          {divergencias.map((d) => (
            <DivergenciaRow key={d.id} divergencia={d} canManage={canManage} />
          ))}
        </div>
      )}

      {devolucoes.filter((d) => d.status === "registrada").length > 0 && (
        <p style={{ fontSize: "12px", color: "#6b7a75", margin: "6px 0 0" }}>
          Devolvido: {devolucoes.filter((d) => d.status === "registrada").reduce((acc, d) => acc + Number(d.quantidade), 0)}
        </p>
      )}
    </div>
  );
}

function DivergenciaRow({ divergencia, canManage }: { divergencia: Divergencia; canManage: boolean }) {
  const [tratando, setTratando] = useState(false);

  return (
    <div style={{ fontSize: "12px", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "4px" }}>
      <span>
        {TIPO_DIVERGENCIA_LABEL[divergencia.tipo] ?? divergencia.tipo}: {divergencia.descricao}
        {divergencia.quantidade_divergente !== null && ` (qtd. ${divergencia.quantidade_divergente})`}
        {" — "}
        {divergencia.status === "aberta" ? "Aberta" : `Tratada: ${divergencia.decisao}`}
      </span>
      {canManage && divergencia.status === "aberta" && (
        !tratando ? (
          <button type="button" onClick={() => setTratando(true)} style={buttonStyle}>Tratar</button>
        ) : (
          <form action={tratarDivergenciaAction} onSubmit={() => setTratando(false)} style={{ display: "flex", gap: "4px" }}>
            <input type="hidden" name="id" value={divergencia.id} />
            <select name="decisao" required style={inputStyle}>
              <option value="">decisão…</option>
              <option value="aceitar">Aceitar</option>
              <option value="recusar">Recusar</option>
            </select>
            <input name="observacao" placeholder="observação (opcional)" style={inputStyle} />
            <button type="submit" style={buttonStyle}>Confirmar</button>
          </form>
        )
      )}
    </div>
  );
}
