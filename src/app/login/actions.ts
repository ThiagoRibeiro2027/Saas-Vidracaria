"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Mensagem única para qualquer falha de login (empresa, matrícula ou senha
// incorretos) — evita enumeração de empresas/usuários (Prompt Mestre:
// "proteção contra enumeração").
const GENERIC_ERROR = "Empresa, matrícula/e-mail ou senha inválidos.";

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
    if (error) return { error: GENERIC_ERROR };
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

  if (!company) return { error: GENERIC_ERROR };

  const isEmail = identifier.includes("@");
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("company_id", company.id)
    .eq(isEmail ? "contact_email" : "login_identifier", identifier)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!profile) return { error: GENERIC_ERROR };

  const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
  if (!authUser?.user?.email) return { error: GENERIC_ERROR };

  const { error } = await supabase.auth.signInWithPassword({
    email: authUser.user.email,
    password,
  });

  if (error) return { error: GENERIC_ERROR };

  redirect("/");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
