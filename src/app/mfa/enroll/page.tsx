"use client";

import { useActionState, useState } from "react";
import { startEnrollmentAction, verifyEnrollmentAction } from "./actions";

type EnrollResult = { factorId: string; qrCode: string; secret: string } | { error: string };

export default function MfaEnrollPage() {
  const [enrollment, setEnrollment] = useState<EnrollResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyEnrollmentAction,
    undefined,
  );

  async function handleGenerate() {
    setGenerating(true);
    const result = await startEnrollmentAction();
    setEnrollment(result);
    setGenerating(false);
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>MFA obrigatório — administrador de plataforma</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 8px" }}>Configurar autenticador</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          ADR-001 exige autenticação de dois fatores para administradores de plataforma.
          Escaneie o QR code com um app autenticador (Google Authenticator, 1Password, Authy)
          e digite o código de 6 dígitos para concluir.
        </p>

        {!enrollment && (
          <button onClick={handleGenerate} disabled={generating} style={buttonStyle}>
            {generating ? "Gerando..." : "Gerar QR Code"}
          </button>
        )}

        {enrollment && "error" in enrollment && (
          <p style={errorStyle}>{enrollment.error}</p>
        )}

        {enrollment && "qrCode" in enrollment && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URI do próprio Supabase Auth, não uma imagem externa */}
            <img src={enrollment.qrCode} alt="QR code para configurar o autenticador" width={200} height={200} />
            <p style={{ fontSize: "11px", color: "#6b7a75", fontFamily: "monospace" }}>
              Chave manual: {enrollment.secret}
            </p>

            <form action={verifyAction} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input type="hidden" name="factorId" value={enrollment.factorId} />
              <label style={{ fontSize: "13px" }}>
                Código de 6 dígitos
                <input name="code" required maxLength={6} style={inputStyle} />
              </label>
              {verifyState?.error && <p style={errorStyle}>{verifyState.error}</p>}
              <button type="submit" disabled={verifyPending} style={buttonStyle}>
                {verifyPending ? "Verificando..." : "Confirmar"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
  background: "#f5f7f5",
} as const;

const cardStyle = {
  background: "#fff",
  padding: "32px",
  borderRadius: "8px",
  width: "360px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px -12px rgba(0,0,0,.18)",
} as const;

const eyebrowStyle = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "#1f5d57",
  margin: 0,
} as const;

const buttonStyle = {
  background: "#1f5d57",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  padding: "10px",
  fontSize: "14px",
  cursor: "pointer",
} as const;

const inputStyle = {
  display: "block",
  marginTop: "4px",
  width: "100%",
  padding: "8px 10px",
  borderRadius: "6px",
  border: "1px solid #dae2de",
  fontSize: "14px",
} as const;

const errorStyle = { color: "#9b2c2c", fontSize: "13px", margin: 0 } as const;
