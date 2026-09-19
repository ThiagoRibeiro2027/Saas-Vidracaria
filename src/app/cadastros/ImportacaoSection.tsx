"use client";

import { useActionState } from "react";
import {
  previsualizarImportacaoPessoasAction,
  confirmarImportacaoPessoasAction,
  previsualizarImportacaoItensAction,
  confirmarImportacaoItensAction,
  type ImportacaoState,
} from "./actions";
import { sectionTitleStyle, hintStyle, thStyle, tdStyle, buttonStyle } from "../configuracoes/styles";

const STATUS_LABEL: Record<string, string> = {
  novo: "Novo",
  atualizacao: "Atualização",
  invalido: "Inválido",
  duplicado_no_arquivo: "Duplicado no arquivo",
};
const STATUS_COLOR: Record<string, string> = {
  novo: "#1f5d57",
  atualizacao: "#b7791f",
  invalido: "#9b2c2c",
  duplicado_no_arquivo: "#9b2c2c",
};

function Bloco({
  titulo,
  colunasEsperadas,
  previewAction,
  confirmAction,
}: {
  titulo: string;
  colunasEsperadas: string;
  previewAction: (state: ImportacaoState, formData: FormData) => Promise<ImportacaoState>;
  confirmAction: (state: ImportacaoState, formData: FormData) => Promise<ImportacaoState>;
}) {
  const [previewState, previewFormAction, previewPending] = useActionState<ImportacaoState, FormData>(
    previewAction,
    undefined,
  );
  const [confirmState, confirmFormAction, confirmPending] = useActionState<ImportacaoState, FormData>(
    confirmAction,
    undefined,
  );

  const estadoAtual = confirmState ?? previewState;
  const resultados = estadoAtual && "resultados" in estadoAtual ? estadoAtual.resultados : undefined;
  const linhas = estadoAtual && "linhas" in estadoAtual ? estadoAtual.linhas : undefined;
  const confirmado = estadoAtual && "confirmado" in estadoAtual ? estadoAtual.confirmado : false;
  const erro = estadoAtual?.error;

  const contagens = (resultados ?? []).reduce<Record<string, number>>((acc, r) => {
    const key = r.status ?? "invalido";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ marginBottom: "20px" }}>
      <h3 style={{ fontSize: "13px", margin: "0 0 4px" }}>{titulo}</h3>
      <p style={hintStyle}>Colunas esperadas no CSV (primeira linha = cabeçalho): {colunasEsperadas}</p>

      {!confirmado && (
        <form action={previewFormAction} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
          <input type="file" name="arquivo" accept=".csv,text/csv" required style={{ fontSize: "12px" }} />
          <button type="submit" disabled={previewPending} style={buttonStyle}>
            {previewPending ? "Lendo..." : "Pré-visualizar"}
          </button>
        </form>
      )}

      {erro && <p style={{ color: "#9b2c2c", fontSize: "12px" }}>{erro}</p>}

      {resultados && resultados.length > 0 && (
        <>
          <p style={{ fontSize: "12px", color: "#3e4d49" }}>
            {confirmado ? "Resultado da gravação: " : "Prévia (nada foi gravado ainda): "}
            {Object.entries(contagens)
              .map(([status, n]) => `${n} ${STATUS_LABEL[status] ?? status}`)
              .join(" · ")}
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "10px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eef1ef" }}>
                <th style={thStyle}>Linha</th>
                <th style={thStyle}>Identificador</th>
                <th style={thStyle}>Nome/Descrição</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r) => (
                <tr key={r.linha} style={{ borderBottom: "1px solid #f4f6f5" }}>
                  <td style={tdStyle}>{r.linha}</td>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: "monospace" }}>{r.identificador ?? "—"}</span>
                  </td>
                  <td style={tdStyle}>{r.rotulo ?? "—"}</td>
                  <td style={tdStyle}>
                    <span style={{ color: STATUS_COLOR[r.status ?? ""] ?? "#3e4d49" }}>
                      {STATUS_LABEL[r.status ?? ""] ?? r.status}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {r.erro ?? (r.campos_alterados && r.campos_alterados.length > 0 ? r.campos_alterados.join(", ") : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!confirmado && linhas && (
            <form action={confirmFormAction}>
              <input type="hidden" name="linhas" value={JSON.stringify(linhas)} />
              <button type="submit" disabled={confirmPending} style={buttonStyle}>
                {confirmPending ? "Gravando..." : `Confirmar importação (${(contagens.novo ?? 0) + (contagens.atualizacao ?? 0)} linha(s) válida(s))`}
              </button>
            </form>
          )}

          {confirmado && (
            <p style={{ fontSize: "12px", color: "#1f5d57" }}>
              Importação concluída. Recarregue a página pra ver os registros na lista acima.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function ImportacaoSection() {
  return (
    <section>
      <h2 style={sectionTitleStyle}>Importação inicial de dados (TÓPICO 2 §28)</h2>
      <p style={hintStyle}>
        Só CSV nesta fase. Fluxo: ler arquivo → validar → pré-visualizar (nada é gravado) →
        confirmar. Linha inválida nunca é gravada silenciosamente — fica marcada e as demais
        linhas válidas são gravadas normalmente na confirmação.
      </p>
      <Bloco
        titulo="Pessoas (clientes/fornecedores)"
        colunasEsperadas="tipo_documento (CPF ou CNPJ), documento, nome, nome_fantasia, telefone, email, logradouro, cidade, uf, cep"
        previewAction={previsualizarImportacaoPessoasAction}
        confirmAction={confirmarImportacaoPessoasAction}
      />
      <Bloco
        titulo="Itens (produtos/materiais)"
        colunasEsperadas="codigo, descricao, tipo (materia_prima, insumo, componente, produto_intermediario, produto_acabado, material_auxiliar, embalagem, servico, outro), classificacao, unidade_principal"
        previewAction={previsualizarImportacaoItensAction}
        confirmAction={confirmarImportacaoItensAction}
      />
    </section>
  );
}
