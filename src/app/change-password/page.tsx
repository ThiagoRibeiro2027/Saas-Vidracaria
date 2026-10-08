"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ChangePasswordPage() {
  const [state, formAction, pending] = useActionState(changePasswordAction, undefined);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-page-bg p-6">
      <Card className="w-80">
        <form action={formAction} className="flex flex-col gap-3">
          <p className="text-[11px] font-mono text-primary">Primeiro acesso</p>
          <h1 className="text-lg font-semibold text-text">Defina uma nova senha</h1>
          <p className="text-sm text-text">
            A senha que você usou para entrar foi definida por outra pessoa e precisa ser
            trocada antes de continuar.
          </p>

          <label className="flex flex-col gap-1 text-sm text-text">
            Nova senha
            <Input name="password" type="password" required minLength={10} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text">
            Confirmar nova senha
            <Input name="confirmation" type="password" required minLength={10} />
          </label>

          {state?.error && <p className="text-sm text-danger">{state.error}</p>}

          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Salvando..." : "Salvar e continuar"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
