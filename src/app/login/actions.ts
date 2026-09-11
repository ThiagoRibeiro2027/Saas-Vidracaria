"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getClientContext } from "@/lib/audit/log";

// Mensagem única para qualquer falha de login (empresa, matrícula ou senha
// incorretos) — evita enumeração de empresas/usuários (Prompt Mestre:
// "proteção contra enumeração").
const GENERIC_ERROR = "Empresa, matrícula/e-mail ou senha inválidos.";

// Sem sessão (a tentativa falhou), log_activity() não pode ser chamada —
// exige o papel `authenticated`. A gravação usa a service role direto,
// mesmo padrão já estabelecido para operações sem usuário autenticado
// (Auditoria Fase 1, item 02) — nunca grava senha, só o identificador
// tentado (Prompt Mestre item 18: nada de senhas/tokens/secrets nos logs).
async function logLoginFailure(companyId: string | null, metadata: Record<string, unknown>) {
  const { ip, userAgent } = await getClientContext();
  const admin = createAdminClient();
  await admin.from("activity_logs").insert({
    company_id: companyId,
    user_id: null,
    action: "auth.login_failed",
    entity_type: "auth",
    metadata,
    ip_address: ip,
    user_agent: userAgent,
  });
}

// Aqui já existe sessão (login acabou de suceder no mesmo `supabase`
// client), então passa pela função de auditoria normal.
async function logLoginSuccess(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { ip, userAgent } = await getClientContext();
  await supabase.rpc("log_activity", {
    p_action: "auth.login_success",
    p_entity_type: "auth",
    p_entity_id: null,
    p_ip_address: ip,
    p_user_agent: userAgent,
  });
}

export async function signInAction(
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const companySlug = String(formData.get("company") ?? "").trim().toLowerCase();
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();

  // Administrador de plataforma (ADR-001 §6-8): não pertence a nenhuma
  // empresa, então não há matrícula/company a resolver — usa o e-mail real
  // diretamente. Campo "Empresa" fica vazio nesse caso.
  if (!companySlug) {
    if (!identifier.includes("@")) return { error: GENERIC_ERROR };
    const { error } = await supabase.auth.signInWithPassword({
      email: identifier,
      password,
    });
    if (error) {
      await logLoginFailure(null, { identifier });
      return { error: GENERIC_ERROR };
    }
    await logLoginSuccess(supabase);
    redirect("/");
  }

  // Usuário de tenant: resolver empresa + matrícula -> e-mail técnico do
  // Supabase Auth exige bypass de RLS (ainda não há sessão) — uso legítimo
  // e restrito da service role, só de leitura, só para esta resolução
  // (decisão registrada na Auditoria Fase 1, item 02).
  const admin = createAdminClient();

  const { data: company } = await admin
    .from("companies")
    .select("id")
    .eq("slug", companySlug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!company) {
    await logLoginFailure(null, { identifier, company_slug: companySlug });
    return { error: GENERIC_ERROR };
  }

  const isEmail = identifier.includes("@");
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("company_id", company.id)
    .eq(isEmail ? "contact_email" : "login_identifier", identifier)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!profile) {
    await logLoginFailure(company.id, { identifier });
    return { error: GENERIC_ERROR };
  }

  const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
  if (!authUser?.user?.email) {
    await logLoginFailure(company.id, { identifier });
    return { error: GENERIC_ERROR };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: authUser.user.email,
    password,
  });

  if (error) {
    await logLoginFailure(company.id, { identifier });
    return { error: GENERIC_ERROR };
  }

  await logLoginSuccess(supabase);
  redirect("/");
}

export async function signOutAction() {
  const supabase = await createClient();
  // Precisa acontecer ANTES do signOut: log_activity() exige o papel
  // `authenticated`, que deixa de valer assim que a sessão é encerrada.
  const { ip, userAgent } = await getClientContext();
  await supabase.rpc("log_activity", {
    p_action: "auth.logout",
    p_entity_type: "auth",
    p_entity_id: null,
    p_ip_address: ip,
    p_user_agent: userAgent,
  });
  await supabase.auth.signOut();
  redirect("/login");
}
