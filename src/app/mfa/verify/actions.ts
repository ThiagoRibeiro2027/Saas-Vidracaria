"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const INVALID_CODE = "Código inválido ou expirado.";

export async function verifyStepUpAction(
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: INVALID_CODE };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) return { error: INVALID_CODE };

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge) return { error: INVALID_CODE };

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code,
  });
  if (verifyError) return { error: INVALID_CODE };

  redirect("/");
}
