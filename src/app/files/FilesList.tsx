"use client";

import { useState } from "react";
import { deleteFileAction, getSignedUrlAction } from "./actions";
import { Table, Th, Td } from "@/components/ui/Table";

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
    return <p className="text-sm text-text-muted">Nenhum arquivo enviado ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-danger">{error}</p>}
      <Table>
        <thead>
          <tr>
            <Th>Nome</Th>
            <Th>Tipo</Th>
            <Th>Tamanho</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id}>
              <Td>{file.original_name}</Td>
              <Td className="font-mono text-xs">
                {file.mime_type}
                {file.width && file.height ? ` · ${file.width}×${file.height}` : ""}
              </Td>
              <Td>{formatSize(file.size_bytes)}</Td>
              <Td>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleDownload(file.id)}
                    disabled={busyId === file.id}
                    className="cursor-pointer text-sm text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Baixar
                  </button>
                  <button
                    onClick={() => handleDelete(file.id)}
                    disabled={busyId === file.id}
                    className="cursor-pointer text-sm text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remover
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
