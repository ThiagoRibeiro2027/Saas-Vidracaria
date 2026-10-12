"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE_HINT } from "@/lib/auth/password-policy";
import { criarUsuarioAction, resetarSenhaAction } from "./actions";

// Formulários com senha. Usam useActionState para MOSTRAR a mensagem de erro
// (senha fraca, matrícula repetida, sem permissão) em vez da página genérica de
// erro do Next em produção (que acontece quando a Server Action lança exceção).

function Mensagem({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error) return <p role="alert" className="basis-full text-xs text-danger">{state.error}</p>;
  if (state?.ok) return <p role="status" className="basis-full text-xs text-success">{state.ok}</p>;
  return null;
}

export function CriarUsuarioForm({ roles }: { roles: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(criarUsuarioAction, undefined);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-1.5">
      <Input name="login_identifier" placeholder="matrícula" required className="w-24" />
      <Input name="display_name" placeholder="nome completo" required className="w-40" />
      <Input name="contact_email" type="email" placeholder="e-mail (opcional)" className="w-44" />
      <Input name="password" type="password" placeholder="senha inicial" title={PASSWORD_RULE_HINT} required minLength={MIN_PASSWORD_LENGTH} className="w-32" />
      <Select name="role_id" defaultValue="">
        <option value="">papel inicial (opcional)</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="primary" disabled={pending}>
        Criar usuário
      </Button>
      <p className="basis-full text-xs text-text-muted">{PASSWORD_RULE_HINT}</p>
      <Mensagem state={state} />
    </form>
  );
}

export function ResetSenhaForm({ profileId }: { profileId: string }) {
  const [state, action, pending] = useActionState(resetarSenhaAction, undefined);
  return (
    <form action={action} className="flex flex-wrap gap-1">
      <input type="hidden" name="profile_id" value={profileId} />
      <Input
        name="nova_senha"
        type="password"
        placeholder="nova senha"
        title={PASSWORD_RULE_HINT}
        minLength={MIN_PASSWORD_LENGTH}
        required
        className="w-28 text-[11px]"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        resetar
      </Button>
      <Mensagem state={state} />
    </form>
  );
}
