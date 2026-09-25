"use client";

import { upsertCriterioAvaliacaoFornecedorAction, avaliarFornecedorAction } from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../../configuracoes/styles";

const CRITERIOS = [
  ["prazo", "Prazo"],
  ["divergencias", "Divergências"],
  ["rejeicoes", "Rejeições"],
  ["preco", "Preço"],
  ["volume", "Volume"],
] as const;
const PESO_DEFAULT = 20;

type Pessoa = { id: string; nome: string; nome_fantasia: string | null };
type Criterio = { id: string; chave: string; peso: number };
type Avaliacao = { id: string; pessoa_id: string; periodo_inicio: string; periodo_fim: string; score: number | null; detalhamento: Record<string, { peso: number; score: number | null }> };
type SolicitacaoEmergencial = { id: string; numero: string; status: string; emergencial_motivo: string | null; emergencial_impacto: string | null; created_at: string };
type PedidoEmergencial = { id: string; numero: string; status: string; pessoa_id: string; created_at: string };
type Rastreio = { ok: boolean; data: unknown } | null;

function nomeFornecedor(pessoas: Pessoa[], id: string) {
  const p = pessoas.find((x) => x.id === id);
  return p?.nome_fantasia || p?.nome || id;
}

export default function FornecedoresComprasSection({
  fornecedores,
  criterios,
  avaliacoes,
  solicitacoesEmergenciais,
  pedidosEmergenciais,
  rastreioNecessidade,
  rastreioMaterial,
  canManage,
}: {
  fornecedores: Pessoa[];
  criterios: Criterio[];
  avaliacoes: Avaliacao[];
  solicitacoesEmergenciais: SolicitacaoEmergencial[];
  pedidosEmergenciais: PedidoEmergencial[];
  rastreioNecessidade: Rastreio;
  rastreioMaterial: Rastreio;
  canManage: boolean;
}) {
  const pesoPorChave = new Map(criterios.map((c) => [c.chave, Number(c.peso)]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <section>
        <h2 style={sectionTitleStyle}>Pesos dos critérios de avaliação (§35)</h2>
        <p style={hintStyle}>Sem configuração, cada critério usa o default de 20% (soma 100%).</p>
        {canManage && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {CRITERIOS.map(([chave, label]) => (
              <form key={chave} action={upsertCriterioAvaliacaoFornecedorAction} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                <input type="hidden" name="chave" value={chave} />
                <label style={{ fontSize: "12px", color: "#3e4d49" }}>{label}</label>
                <input name="peso" type="number" min="0" step="0.01" defaultValue={pesoPorChave.get(chave) ?? PESO_DEFAULT} style={{ ...inputStyle, width: "60px" }} />
                <button type="submit" style={buttonStyle}>Salvar</button>
              </form>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Avaliar fornecedor</h2>
        {canManage && (
          <form action={avaliarFornecedorAction} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
            <select name="pessoa_id" required style={inputStyle}>
              <option value="">fornecedor…</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome_fantasia || f.nome}</option>
              ))}
            </select>
            <input name="periodo_inicio" type="date" required style={inputStyle} />
            <input name="periodo_fim" type="date" required style={inputStyle} />
            <button type="submit" style={buttonStyle}>Avaliar</button>
          </form>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                <th style={thStyle}>Fornecedor</th>
                <th style={thStyle}>Período</th>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Detalhamento</th>
              </tr>
            </thead>
            <tbody>
              {avaliacoes.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                  <td style={tdStyle}>{nomeFornecedor(fornecedores, a.pessoa_id)}</td>
                  <td style={tdStyle}>
                    {new Date(`${a.periodo_inicio}T00:00:00`).toLocaleDateString("pt-BR")} — {new Date(`${a.periodo_fim}T00:00:00`).toLocaleDateString("pt-BR")}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{a.score !== null ? Number(a.score).toFixed(2) : "sem dado"}</td>
                  <td style={tdStyle}>
                    {Object.entries(a.detalhamento).map(([chave, v]) => (
                      <span key={chave} style={{ marginRight: "8px", color: "#6b7a75" }}>
                        {chave}: {v.score !== null ? Number(v.score).toFixed(0) : "—"} (peso {v.peso})
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {avaliacoes.length === 0 && <p style={hintStyle}>Nenhuma avaliação registrada ainda.</p>}
        </div>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Compras emergenciais (§32)</h2>
        <p style={hintStyle}>Criação de compra emergencial fica em Solicitações de compra.</p>

        <p style={{ fontSize: "12px", fontWeight: 600, margin: "6px 0 2px" }}>Solicitações de compra emergenciais</p>
        {solicitacoesEmergenciais.map((sc) => (
          <div key={sc.id} style={{ fontSize: "12px", marginBottom: "4px" }}>
            <strong>{sc.numero}</strong> — {sc.status} — {sc.emergencial_motivo} ({sc.emergencial_impacto})
          </div>
        ))}
        {solicitacoesEmergenciais.length === 0 && <p style={hintStyle}>Nenhuma SC emergencial registrada.</p>}

        <p style={{ fontSize: "12px", fontWeight: 600, margin: "10px 0 2px" }}>Pedidos de compra emergenciais</p>
        {pedidosEmergenciais.map((pc) => (
          <div key={pc.id} style={{ fontSize: "12px", marginBottom: "4px" }}>
            <strong>{pc.numero}</strong> — {pc.status} — fornecedor {nomeFornecedor(fornecedores, pc.pessoa_id)}
          </div>
        ))}
        {pedidosEmergenciais.length === 0 && <p style={hintStyle}>Nenhum PC emergencial gerado ainda.</p>}
      </section>

      <section>
        <h2 style={sectionTitleStyle}>Rastreabilidade (§39)</h2>
        <p style={hintStyle}>Consulta pontual pelo id — necessidade→SC→cotação→negociação→aprovação→PC→recebimento→estoque, ou o caminho inverso a partir de uma movimentação.</p>

        <form method="get" style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
          <input name="necessidade_id" placeholder="id da necessidade de compra" style={{ ...inputStyle, width: "300px" }} />
          <button type="submit" style={buttonStyle}>Rastrear necessidade</button>
        </form>
        {rastreioNecessidade && <RastreioResultado rastreio={rastreioNecessidade} />}

        <form method="get" style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "10px", marginBottom: "10px" }}>
          <input name="movimentacao_id" placeholder="id da movimentação de estoque" style={{ ...inputStyle, width: "300px" }} />
          <button type="submit" style={buttonStyle}>Rastrear material (reverso)</button>
        </form>
        {rastreioMaterial && <RastreioResultado rastreio={rastreioMaterial} />}
      </section>
    </div>
  );
}

function RastreioResultado({ rastreio }: { rastreio: { ok: boolean; data: unknown } }) {
  if (!rastreio.ok) {
    return <p style={{ fontSize: "12px", color: "#9b2c2c" }}>{String(rastreio.data)}</p>;
  }
  return (
    <pre style={{ fontSize: "11px", background: "#f5f7f5", padding: "10px", borderRadius: "4px", overflowX: "auto", maxHeight: "360px" }}>
      {JSON.stringify(rastreio.data, null, 2)}
    </pre>
  );
}
