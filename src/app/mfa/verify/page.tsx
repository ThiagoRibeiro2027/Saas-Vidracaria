"use client";

import { useActionState } from "react";
import { verifyStepUpAction } from "./actions";

export default function MfaVerifyPage() {
  const [state, formAction, pending] = useActionState(verifyStepUpAction, undefined);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#f5f7f5",
      }}
    >
      <form
        action={formAction}
        style={{
          background: "#fff",
          padding: "32px",
          borderRadius: "8px",
          width: "320px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px -12px rgba(0,0,0,.18)",
        }}
      >
        <p style={{ fontFamily: "monospace", fontSize: "11px", color: "#1f5d57", margin: 0 }}>
          Verificação em duas etapas
        </p>
        <h1 style={{ fontSize: "18px", margin: 0 }}>Digite o código do seu autenticador</h1>

        <label style={{ fontSize: "13px" }}>
          Código de 6 dígitos
          <input
            name="code"
            required
            maxLength={6}
            style={{
              display: "block",
              marginTop: "4px",
              width: "100%",
              padding: "8px 10px",
              borderRadius: "6px",
              border: "1px solid #dae2de",
              fontSize: "14px",
            }}
          />
        </label>

        {state?.error && <p style={{ color: "#9b2c2c", fontSize: "13px", margin: 0 }}>{state.error}</p>}

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
          }}
        >
          {pending ? "Verificando..." : "Confirmar"}
        </button>
      </form>
    </main>
  );
}
