"use client";

import { useState } from "react";
import { exportCompanyDataAction } from "./actions";
import { Button } from "@/components/ui/Button";

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
    <div className="flex flex-col items-start gap-2">
      <Button onClick={handleExport} variant="primary" disabled={pending}>
        {pending ? "Gerando..." : "Exportar dados da empresa (JSON)"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
