"use client";

import { useRef, useState } from "react";
import { MAX_FILES_PER_UPLOAD } from "@/lib/storage/constants";
import { uploadFileAction } from "./actions";

export default function UploadForm() {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return;

    if (files.length > MAX_FILES_PER_UPLOAD) {
      setErrors([`Selecione no máximo ${MAX_FILES_PER_UPLOAD} arquivos por vez.`]);
      return;
    }

    setPending(true);
    setErrors([]);
    setSuccessCount(0);

    // Sequencial, um por vez: cada chamada carrega só 1 arquivo no corpo da
    // Server Action (ver actions.ts) — mandar tudo em paralelo não ajudaria
    // e só aumentaria a carga simultânea no servidor.
    const failed: string[] = [];
    let ok = 0;
    for (const file of files) {
      const singleFileData = new FormData();
      singleFileData.set("file", file);
      const result = await uploadFileAction(singleFileData);
      if (result.ok) {
        ok++;
      } else {
        failed.push(`${result.name}: ${result.error}`);
      }
    }

    setSuccessCount(ok);
    setErrors(failed);
    setPending(false);
    formRef.current?.reset();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <label style={{ fontSize: "13px" }}>
        Arquivos (JPEG, PNG, WEBP ou PDF — até 20 MiB cada, no máximo {MAX_FILES_PER_UPLOAD} por vez)
        <input
          ref={inputRef}
          type="file"
          name="files"
          multiple
          required
          accept="image/jpeg,image/png,image/webp,application/pdf"
          style={{ display: "block", marginTop: "4px" }}
        />
      </label>

      {errors.length > 0 && (
        <p style={{ color: "#9b2c2c", fontSize: "13px", margin: 0 }}>{errors.join(" | ")}</p>
      )}
      {!pending && successCount > 0 && (
        <p style={{ color: "#1f5d57", fontSize: "13px", margin: 0 }}>
          {successCount} arquivo(s) enviado(s) com sucesso.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          background: "#1f5d57",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          padding: "10px",
          fontSize: "14px",
          cursor: "pointer",
          width: "fit-content",
        }}
      >
        {pending ? "Enviando..." : "Enviar"}
      </button>
    </form>
  );
}
