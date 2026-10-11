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

// Ciclo de EXISTÊNCIA do tenant (Prompt Mestre item 30) — deliberadamente
// separado de transitionSubscriptionAction (ciclo comercial, item 31).
// transition_company_status() já valida is_platform_admin_mfa_verified()
// e a transição linear válida no banco; aqui só encaminha.
const VALID_COMPANY_STATUSES = ["active", "cancellation", "suspended", "retention", "deleted"] as const;

export async function transitionCompanyStatusAction(formData: FormData) {
  const companyId = String(formData.get("company_id") ?? "");
  const newStatus = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!companyId || !VALID_COMPANY_STATUSES.includes(newStatus as (typeof VALID_COMPANY_STATUSES)[number])) {
    throw new Error("Dados inválidos para transição de status da empresa.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_company_status", {
    p_company_id: companyId,
    p_new_status: newStatus,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/governance");
}
