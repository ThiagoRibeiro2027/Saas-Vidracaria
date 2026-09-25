"use client";

import { useState } from "react";
import { criarRegraPecaAction, desativarRegraPecaAction } from "./actions";
import { hintStyle, thStyle, tdStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

type Caracteristica = { id: string; nome: string; tipo: string; unidade: string | null; opcoes: string[] | null; obrigatoria: boolean };
type MaterialOpcao = { id: string; label: string };
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

const OPERADORES_NUMERO = [">", ">=", "<", "<=", "=", "<>"] as const;
const OPERADORES_TEXTO = ["=", "<>"] as const;
const ACOES = [
  ["ajustar_quantidade", "Ajustar quantidade"],
  ["adicionar_material", "Adicionar material"],
  ["remover_material", "Remover material"],
] as const;
const ACAO_LABEL: Record<string, string> = {
  ajustar_quantidade: "ajusta",
  adicionar_material: "adiciona",
  remover_material: "remove",
};

export default function RegrasPeca({
  pecaId,
  caracteristicas,
  regras,
  materiais,
}: {
  pecaId: string;
  caracteristicas: Caracteristica[];
  regras: Regra[];
  materiais: MaterialOpcao[];
}) {
  const [caracteristicaSelecionadaId, setCaracteristicaSelecionadaId] = useState("");
  const [acaoSelecionada, setAcaoSelecionada] = useState("ajustar_quantidade");
  const [mostrarNovaRegra, setMostrarNovaRegra] = useState(false);

  const caracteristicaSelecionada = caracteristicas.find((c) => c.id === caracteristicaSelecionadaId);
  const operadoresDisponiveis = caracteristicaSelecionada?.tipo === "numero" ? OPERADORES_NUMERO : OPERADORES_TEXTO;

  const materialLabel = (id: string) => materiais.find((m) => m.id === id)?.label ?? id;

  if (caracteristicas.length === 0) {
    return null;
  }

  const regrasAtivas = regras.filter((r) => r.ativo);
  const regrasInativas = regras.filter((r) => !r.ativo);

  return (
    <div style={{ marginTop: "10px", borderTop: "1px solid #eef1ef", paddingTop: "8px" }}>
      <p style={{ ...hintStyle, margin: "0 0 4px", fontWeight: 600, color: "#3e4d49" }}>
        Regras (motor básico) — &quot;o sistema sugere, a Engenharia decide&quot;
      </p>

      {regrasAtivas.length === 0 ? (
        <p style={hintStyle}>Nenhuma regra ativa ainda.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "6px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
              <th style={thStyle}>Condição</th>
              <th style={thStyle}>Ação</th>
              <th style={thStyle}>Versão</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {regrasAtivas.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f4f6f5" }}>
                <td style={tdStyle}>
                  {r.caracteristica_nome} {r.operador} {r.valor_comparacao_numero ?? r.valor_comparacao_texto}
                </td>
                <td style={tdStyle}>
                  {ACAO_LABEL[r.acao]} {materialLabel(r.acao_material_item_id)}
                  {r.acao_quantidade != null ? ` → ${r.acao_quantidade}` : ""}
                </td>
                <td style={tdStyle}>v{r.versao}</td>
                <td style={tdStyle}>
                  <form action={desativarRegraPecaAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" style={{ ...buttonStyle, fontSize: "10px", padding: "1px 5px", background: "#9b2c2c" }}>
                      Desativar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {regrasInativas.length > 0 && (
        <p style={{ ...hintStyle, fontSize: "10px" }}>
          {regrasInativas.length} regra{regrasInativas.length > 1 ? "s" : ""} desativada{regrasInativas.length > 1 ? "s" : ""} (histórico preservado).
        </p>
      )}

      {!mostrarNovaRegra ? (
        <button
          type="button"
          onClick={() => setMostrarNovaRegra(true)}
          style={{ ...buttonStyle, fontSize: "11px", padding: "3px 8px", background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}
        >
          Nova regra
        </button>
      ) : (
        <form
          action={criarRegraPecaAction}
          onSubmit={() => setMostrarNovaRegra(false)}
          style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}
        >
          <input type="hidden" name="peca_id" value={pecaId} />
          <input type="hidden" name="tipo" value={caracteristicaSelecionada?.tipo ?? ""} />
          <select
            name="caracteristica_id"
            required
            value={caracteristicaSelecionadaId}
            onChange={(e) => setCaracteristicaSelecionadaId(e.target.value)}
            style={{ ...inputStyle, width: "110px" }}
          >
            <option value="">se...</option>
            {caracteristicas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <select name="operador" required style={{ ...inputStyle, width: "60px" }}>
            {operadoresDisponiveis.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          {caracteristicaSelecionada?.tipo === "opcao" ? (
            <select name="valor_comparacao" required style={{ ...inputStyle, width: "110px" }}>
              {(caracteristicaSelecionada.opcoes ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              name="valor_comparacao"
              type={caracteristicaSelecionada?.tipo === "numero" ? "number" : "text"}
              step="any"
              placeholder="valor"
              required
              style={{ ...inputStyle, width: "90px" }}
            />
          )}
          <span style={{ fontSize: "11px", color: "#6b7a75" }}>→</span>
          <select name="acao" value={acaoSelecionada} onChange={(e) => setAcaoSelecionada(e.target.value)} style={{ ...inputStyle, width: "150px" }}>
            {ACOES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select name="acao_material_item_id" required style={{ ...inputStyle, width: "180px" }}>
            <option value="">material...</option>
            {materiais.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {acaoSelecionada !== "remover_material" && (
            <input name="acao_quantidade" type="number" step="0.0001" min="0.0001" placeholder="qtd." required style={{ ...inputStyle, width: "70px" }} />
          )}
          <input name="motivo" placeholder="motivo (opcional)" style={{ ...inputStyle, width: "140px" }} />
          <button type="submit" style={{ ...buttonStyle, fontSize: "11px", padding: "3px 8px" }}>
            Criar regra
          </button>
          <button
            type="button"
            onClick={() => setMostrarNovaRegra(false)}
            style={{ ...buttonStyle, fontSize: "11px", padding: "3px 8px", background: "#fff", color: "#3e4d49", border: "1px solid #dae2de" }}
          >
            Cancelar
          </button>
        </form>
      )}
    </div>
  );
}
