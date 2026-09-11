"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const VALID_STATUSES = ["trial", "active", "past_due", "suspended", "canceled", "expired"] as const;

// Único caminho de mudança de status de assinatura — transition_subscription()
// (Fase 6) já valida is_platform_admin() no banco; aqui só encaminha e
// revalida a tela. Nunca aceitar company_id vindo de um contexto que não
// seja este formulário administrativo explícito.
export async function transitionSubscriptionAction(formData: FormData) {
  const companyId = String(formData.get("company_id") ?? "");
  const newStatus = String(formData.get("status") ?? "");
  if (!companyId || !VALID_STATUSES.includes(newStatus as (typeof VALID_STATUSES)[number])) {
    throw new Error("Dados inválidos para transição de assinatura.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_subscription", {
    p_company_id: companyId,
    p_new_status: newStatus,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/governance");
}
