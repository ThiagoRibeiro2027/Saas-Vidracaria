"use client";

import { useState } from "react";
import { exportarDadosCsvAction } from "./actions";
import { sectionTitleStyle, hintStyle, inputStyle, buttonStyle } from "../configuracoes/styles";

const ENTIDADE_LABEL: Record<string, string> = {
  pedidos: "Pedidos",
  itens: "Itens",
  pessoas: "Pessoas",
  estoque: "Estoque",
  financeiro: "Financeiro (contas a receber)",
};

export default function ExportacaoSection({ entidadesPermitidas }: { entidadesPermitidas: string[] }) {
  const [entidade, setEntidade] = useState(entidadesPermitidas[0] ?? "");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (entidadesPermitidas.length === 0) {
    return null;
  }

  async function handleExport(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("entidade", entidade);
    formData.set("data_inicio", dataInicio);
    formData.set("data_fim", dataFim);

    const result = await exportarDadosCsvAction(formData);
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (!result.data) {
      setError("Nenhum registro encontrado para exportar.");
      return;
    }

    const blob = new Blob([result.data], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${entidade}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <h2 style={sectionTitleStyle}>Exportação de dados (§30)</h2>
      <p style={hintStyle}>
        Exporta listagens de negócio em CSV. Só as entidades cuja permissão de visualização do
        próprio módulo você tem aparecem abaixo. Sem Excel/XML/PDF e sem exportação agendada nesta
        fase.
      </p>
      <form onSubmit={handleExport} style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end" }}>
        <label style={{ fontSize: "12px" }}>
          Entidade
          <br />
          <select value={entidade} onChange={(e) => setEntidade(e.target.value)} style={inputStyle}>
            {entidadesPermitidas.map((e) => (
              <option key={e} value={e}>
                {ENTIDADE_LABEL[e] ?? e}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: "12px" }}>
          De
          <br />
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: "12px" }}>
          Até
          <br />
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={inputStyle} />
        </label>
        <button type="submit" disabled={pending} style={buttonStyle}>
          {pending ? "Gerando..." : "Exportar CSV"}
        </button>
      </form>
      {error && <p style={{ fontSize: "12px", color: "#9b2c2c", marginTop: "4px" }}>{error}</p>}
    </section>
  );
}
