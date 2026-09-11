"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getClientContext } from "@/lib/audit/log";

const GENERIC_ERROR = "Não foi possível gerar o código. Tente novamente.";
const INVALID_CODE = "Código inválido ou expirado.";

export async function startEnrollmentAction() {
  const supabase = await createClient();

  // Evita acumular fatores TOTP não verificados a cada visita à página.
  // O tipo de listFactors() rotula `totp` como 'verified', mas em tempo de
  // execução a API retorna fatores 'unverified' normalmente — daí o cast.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.totp ?? []) {
    if ((factor.status as string) === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data) return { error: GENERIC_ERROR };

  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyEnrollmentAction(
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!factorId || !code) return { error: INVALID_CODE };

  const supabase = await createClient();
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (challengeError || !challenge) return { error: INVALID_CODE };

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyError) return { error: INVALID_CODE };

  const { ip, userAgent } = await getClientContext();
  await supabase.rpc("log_activity", {
    p_action: "auth.mfa_enrolled",
    p_entity_type: "auth",
    p_entity_id: null,
    p_ip_address: ip,
    p_user_agent: userAgent,
  });

  redirect("/");
}
