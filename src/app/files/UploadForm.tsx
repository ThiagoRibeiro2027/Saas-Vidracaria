"use client";

import { useActionState, useRef } from "react";
import { uploadFilesAction } from "./actions";

export default function UploadForm() {
  const [state, formAction, pending] = useActionState(uploadFilesAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      style={{ display: "flex", flexDirection: "column", gap: "10px" }}
    >
      <label style={{ fontSize: "13px" }}>
        Arquivos (JPEG, PNG, WEBP ou PDF — até 20 MiB cada, no máximo 10 por vez)
        <input
          type="file"
          name="files"
          multiple
          required
          accept="image/jpeg,image/png,image/webp,application/pdf"
          style={{ display: "block", marginTop: "4px" }}
        />
      </label>

      {state?.error && <p style={{ color: "#9b2c2c", fontSize: "13px", margin: 0 }}>{state.error}</p>}
      {state?.success && <p style={{ color: "#1f5d57", fontSize: "13px", margin: 0 }}>Enviado com sucesso.</p>}

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
