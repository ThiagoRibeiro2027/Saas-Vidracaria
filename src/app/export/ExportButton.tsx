"use client";

import { useState } from "react";
import { exportCompanyDataAction } from "./actions";

export default function ExportButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setPending(true);
    setError(null);
    const result = await exportCompanyDataAction();
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    const blob = new Blob([result.data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `exportacao-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start" }}>
      <button
        onClick={handleExport}
        disabled={pending}
        style={{
          background: "#1f5d57",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          padding: "10px 14px",
          fontSize: "14px",
          cursor: "pointer",
        }}
      >
        {pending ? "Gerando..." : "Exportar dados da empresa (JSON)"}
      </button>
      {error && <p style={{ color: "#9b2c2c", fontSize: "13px", margin: 0 }}>{error}</p>}
    </div>
  );
}
