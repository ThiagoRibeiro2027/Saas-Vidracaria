"use client";

import { useActionState, useState } from "react";
import { startEnrollmentAction, verifyEnrollmentAction } from "./actions";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

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
    <main className="flex min-h-dvh items-center justify-center bg-page-bg p-6">
      <Card className="w-[360px]">
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-mono text-primary">MFA obrigatório — administrador de plataforma</p>
          <h1 className="text-lg font-semibold text-text">Configurar autenticador</h1>
          <p className="text-sm text-text">
            ADR-001 exige autenticação de dois fatores para administradores de plataforma.
            Escaneie o QR code com um app autenticador (Google Authenticator, 1Password, Authy)
            e digite o código de 6 dígitos para concluir.
          </p>

          {!enrollment && (
            <Button type="button" variant="primary" onClick={handleGenerate} disabled={generating}>
              {generating ? "Gerando..." : "Gerar QR Code"}
            </Button>
          )}

          {enrollment && "error" in enrollment && <p className="text-sm text-danger">{enrollment.error}</p>}

          {enrollment && "qrCode" in enrollment && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URI do próprio Supabase Auth, não uma imagem externa */}
              <img src={enrollment.qrCode} alt="QR code para configurar o autenticador" width={200} height={200} />
              <p className="font-mono text-[11px] text-text-muted">Chave manual: {enrollment.secret}</p>

              <form action={verifyAction} className="flex flex-col gap-2.5">
                <input type="hidden" name="factorId" value={enrollment.factorId} />
                <label className="flex flex-col gap-1 text-sm text-text">
                  Código de 6 dígitos
                  <Input name="code" required maxLength={6} />
                </label>
                {verifyState?.error && <p className="text-sm text-danger">{verifyState.error}</p>}
                <Button type="submit" variant="primary" disabled={verifyPending}>
                  {verifyPending ? "Verificando..." : "Confirmar"}
                </Button>
              </form>
            </>
          )}
        </div>
      </Card>
    </main>
  );
}
