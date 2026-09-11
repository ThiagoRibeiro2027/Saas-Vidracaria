"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";

export default function ChangePasswordPage() {
  const [state, formAction, pending] = useActionState(changePasswordAction, undefined);

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
          Primeiro acesso
        </p>
        <h1 style={{ fontSize: "18px", margin: 0 }}>Defina uma nova senha</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          A senha que você usou para entrar foi definida por outra pessoa e precisa ser
          trocada antes de continuar.
        </p>

        <label style={{ fontSize: "13px" }}>
          Nova senha
          <input name="password" type="password" required minLength={10} style={inputStyle} />
        </label>
        <label style={{ fontSize: "13px" }}>
          Confirmar nova senha
          <input name="confirmation" type="password" required minLength={10} style={inputStyle} />
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
          {pending ? "Salvando..." : "Salvar e continuar"}
        </button>
      </form>
    </main>
  );
}

const inputStyle = {
  display: "block",
  marginTop: "4px",
  width: "100%",
  padding: "8px 10px",
  borderRadius: "6px",
  border: "1px solid #dae2de",
  fontSize: "14px",
} as const;
