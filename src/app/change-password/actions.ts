"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getClientContext } from "@/lib/audit/log";

// F16 (Mapa_Fases_Lacunas_Risco.md, 15/09/2026): supabase/config.toml
// (minimum_password_length) é a fonte de verdade real — o GoTrue rejeita
// mesmo se este valor divergisse. Este constante existe só para dar
// feedback de UX antes do round-trip; manter os dois números iguais.
const MIN_LENGTH = 10;

export async function changePasswordAction(
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < MIN_LENGTH) {
    return { error: `A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.` };
  }
  if (password !== confirmation) {
    return { error: "As senhas digitadas não são iguais." };
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) return { error: "Não foi possível trocar a senha. Tente novamente." };

  const { ip, userAgent } = await getClientContext();
  const { error: flagError } = await supabase.rpc("complete_password_change", {
    p_ip_address: ip,
    p_user_agent: userAgent,
  });
  if (flagError) return { error: "Senha trocada, mas houve um erro ao concluir. Contate o suporte." };

  redirect("/");
}
