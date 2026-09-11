"use client";

import { useState } from "react";
import { deleteFileAction, getSignedUrlAction } from "./actions";

type FileRow = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesList({ files }: { files: FileRow[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const url = await getSignedUrlAction(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar link.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await deleteFileAction(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover arquivo.");
    } finally {
      setBusyId(null);
    }
  }

  if (files.length === 0) {
    return <p style={{ fontSize: "13px", color: "#6b7a75" }}>Nenhum arquivo enviado ainda.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {error && <p style={{ color: "#9b2c2c", fontSize: "13px", margin: 0 }}>{error}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
            <th style={{ padding: "6px 4px" }}>Nome</th>
            <th style={{ padding: "6px 4px" }}>Tipo</th>
            <th style={{ padding: "6px 4px" }}>Tamanho</th>
            <th style={{ padding: "6px 4px" }}></th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id} style={{ borderBottom: "1px solid #eef1ef" }}>
              <td style={{ padding: "6px 4px" }}>{file.original_name}</td>
              <td style={{ padding: "6px 4px", fontFamily: "monospace", fontSize: "11px" }}>
                {file.mime_type}
                {file.width && file.height ? ` · ${file.width}×${file.height}` : ""}
              </td>
              <td style={{ padding: "6px 4px" }}>{formatSize(file.size_bytes)}</td>
              <td style={{ padding: "6px 4px", display: "flex", gap: "8px" }}>
                <button
                  onClick={() => handleDownload(file.id)}
                  disabled={busyId === file.id}
                  style={linkButtonStyle}
                >
                  Baixar
                </button>
                <button
                  onClick={() => handleDelete(file.id)}
                  disabled={busyId === file.id}
                  style={{ ...linkButtonStyle, color: "#9b2c2c" }}
                >
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const linkButtonStyle = {
  background: "none",
  border: "none",
  color: "#1f5d57",
  cursor: "pointer",
  fontSize: "13px",
  padding: 0,
} as const;
