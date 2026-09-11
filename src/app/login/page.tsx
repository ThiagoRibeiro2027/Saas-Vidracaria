"use client";

import { useActionState, type CSSProperties } from "react";
import { signInAction } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signInAction, undefined);

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
        <h1 style={{ fontSize: "18px", margin: 0 }}>Entrar</h1>

        <label style={{ fontSize: "13px", display: "flex", flexDirection: "column", gap: "4px" }}>
          Empresa <span style={{ color: "#6b7a75" }}>(deixe em branco se for administrador de plataforma)</span>
          <input name="company" placeholder="jrbox" style={inputStyle} />
        </label>

        <label style={{ fontSize: "13px", display: "flex", flexDirection: "column", gap: "4px" }}>
          Matrícula ou e-mail
          <input name="identifier" required style={inputStyle} />
        </label>

        <label style={{ fontSize: "13px", display: "flex", flexDirection: "column", gap: "4px" }}>
          Senha
          <input name="password" type="password" required style={inputStyle} />
        </label>

        {state?.error && (
          <p style={{ color: "#9b2c2c", fontSize: "13px", margin: 0 }}>{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          style={{
            marginTop: "8px",
            background: "#1f5d57",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "10px",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: "6px",
  border: "1px solid #dae2de",
  fontSize: "14px",
};
