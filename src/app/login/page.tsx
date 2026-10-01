"use client";

import { useActionState } from "react";
import { Droplets } from "lucide-react";
import { signInAction } from "./actions";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-text">
      <span className="font-medium">
        {label}
        {hint && <span className="ml-1 font-normal text-text-muted">{hint}</span>}
      </span>
      <Input {...props} />
    </label>
  );
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signInAction, undefined);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-page-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
            <Droplets className="h-5 w-5" />
          </span>
          <h1 className="text-lg font-semibold text-text">SaaS Vidraçaria</h1>
          <p className="text-sm text-text-muted">Entre com os dados da sua empresa</p>
        </div>

        <Card padding="md">
          <form action={formAction} className="flex flex-col gap-4">
            <Field
              label="Empresa"
              hint="(deixe em branco se for administrador de plataforma)"
              name="company"
              placeholder="jrbox"
            />
            <Field label="Matrícula ou e-mail" name="identifier" required />
            <Field label="Senha" name="password" type="password" required />

            {state?.error && (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>
            )}

            <Button type="submit" variant="primary" disabled={pending} className="mt-1 w-full">
              {pending ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
