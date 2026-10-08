"use client";

import { useActionState } from "react";
import { signInAction } from "./actions";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signInAction, undefined);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-page-bg p-6">
      <Card className="w-80">
        <form action={formAction} className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold text-text">Entrar</h1>

          <label className="flex flex-col gap-1 text-sm text-text">
            Empresa <span className="text-xs text-text-muted">(deixe em branco se for administrador de plataforma)</span>
            <Input name="company" placeholder="jrbox" />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text">
            Matrícula ou e-mail
            <Input name="identifier" required />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text">
            Senha
            <Input name="password" type="password" required />
          </label>

          {state?.error && <p className="text-sm text-danger">{state.error}</p>}

          <Button type="submit" variant="primary" disabled={pending} className="mt-2">
            {pending ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
