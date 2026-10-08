"use client";

import { useActionState } from "react";
import { verifyStepUpAction } from "./actions";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function MfaVerifyPage() {
  const [state, formAction, pending] = useActionState(verifyStepUpAction, undefined);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-page-bg p-6">
      <Card className="w-80">
        <form action={formAction} className="flex flex-col gap-3">
          <p className="text-[11px] font-mono text-primary">Verificação em duas etapas</p>
          <h1 className="text-lg font-semibold text-text">Digite o código do seu autenticador</h1>

          <label className="flex flex-col gap-1 text-sm text-text">
            Código de 6 dígitos
            <Input name="code" required maxLength={6} />
          </label>

          {state?.error && <p className="text-sm text-danger">{state.error}</p>}

          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Verificando..." : "Confirmar"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
