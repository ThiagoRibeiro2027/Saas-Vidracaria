"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

// TÓPICO 14 — criação de usuário é a única operação desta tela que
// precisa da Admin API (auth.users não é gravável por RLS/RPC comum).
// Todo o resto (perfil, papel, papel de empresa, permissão) é função
// SECURITY DEFINER normal, chamada pelo client autenticado — mesmo
// padrão de todo o resto do schema.
export async function criarUsuarioAction(formData: FormData) {
  const loginIdentifier = String(formData.get("login_identifier") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  const roleId = String(formData.get("role_id") ?? "").trim() || null;

  if (!loginIdentifier || !displayName) throw new Error("Matrícula e nome são obrigatórios.");
  if (password.length < 8) throw new Error("Senha inicial deve ter ao menos 8 caracteres.");

  const supabase = await createClient();

  // Checado aqui ANTES de tocar auth.users — evita criar identidade órfã
  // quando o chamador não tem permissão (a função SQL abaixo checa de
  // novo, redundância intencional).
  const { data: canManage } = await supabase.rpc("has_permission", { p_resource: "users", p_action: "manage" });
  if (!canManage) throw new Error("Sem permissão para criar usuário (users.manage).");

  const { data: companyId } = await supabase.rpc("current_company_id");
  const { data: company } = await supabase.from("companies").select("slug").eq("id", companyId).single();
  if (!company) throw new Error("Empresa não encontrada.");

  // auth.users.email é sempre sintético — login continua por matrícula
  // (mesmo padrão de login/actions.ts). Único por empresa via slug.
  const syntheticEmail = `${loginIdentifier}.${company.slug}@users.internal`;

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    throw new Error(createError?.message ?? "Falha ao criar usuário.");
  }

  const { error: perfilError } = await supabase.rpc("criar_perfil_usuario", {
    p_auth_user_id: created.user.id,
    p_login_identifier: loginIdentifier,
    p_display_name: displayName,
    p_contact_email: contactEmail,
  });
  if (perfilError) {
    // Compensação: sem profiles, essa identidade em auth.users fica
    // órfã e inacessível (login resolve por profiles, nunca direto) —
    // remove pra não acumular lixo.
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(perfilError.message);
  }

  if (roleId) {
    const { error: papelError } = await supabase.rpc("atribuir_papel_usuario", {
      p_profile_id: created.user.id,
      p_role_id: roleId,
      p_valid_until: null,
    });
    if (papelError) throw new Error(`Usuário criado, mas falha ao atribuir papel: ${papelError.message}`);
  }

  revalidatePath("/usuarios");
}

export async function atribuirPapelAction(formData: FormData) {
  const profileId = String(formData.get("profile_id") ?? "");
  const roleId = String(formData.get("role_id") ?? "");
  const validUntilRaw = String(formData.get("valid_until") ?? "").trim();
  if (!profileId || !roleId) throw new Error("Usuário e papel são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("atribuir_papel_usuario", {
    p_profile_id: profileId,
    p_role_id: roleId,
    p_valid_until: validUntilRaw || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}

export async function revogarPapelAction(formData: FormData) {
  const userRoleId = String(formData.get("user_role_id") ?? "");
  if (!userRoleId) throw new Error("Atribuição inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("revogar_papel_usuario", { p_user_role_id: userRoleId });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}

export async function desativarUsuarioAction(formData: FormData) {
  const profileId = String(formData.get("profile_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!profileId) throw new Error("Usuário inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_usuario", { p_profile_id: profileId, p_motivo: motivo });
  if (error) throw new Error(error.message);

  // Revogação imediata de sessão (TÓPICO 14 §36) — best-effort: a
  // desativação em si (bloqueia login futuro) já aconteceu acima e é o
  // que importa; falha aqui (ex.: sem sessão ativa) não desfaz isso.
  try {
    const admin = createAdminClient();
    await admin.auth.admin.signOut(profileId, "global");
  } catch (err) {
    console.error("[usuarios] falha ao revogar sessão ativa (usuário já desativado):", err);
  }

  revalidatePath("/usuarios");
}

export async function reativarUsuarioAction(formData: FormData) {
  const profileId = String(formData.get("profile_id") ?? "");
  if (!profileId) throw new Error("Usuário inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reativar_usuario", { p_profile_id: profileId });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}

export async function resetarSenhaAction(formData: FormData) {
  const profileId = String(formData.get("profile_id") ?? "");
  const novaSenha = String(formData.get("nova_senha") ?? "");
  if (!profileId) throw new Error("Usuário inválido.");
  if (novaSenha.length < 8) throw new Error("Nova senha deve ter ao menos 8 caracteres.");

  const supabase = await createClient();
  // Checado antes de chamar a Admin API, mesmo motivo de criarUsuarioAction.
  const { data: canManage } = await supabase.rpc("has_permission", { p_resource: "users", p_action: "manage" });
  if (!canManage) throw new Error("Sem permissão para redefinir senha (users.manage).");

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(profileId, { password: novaSenha });
  if (updateError) throw new Error(updateError.message);

  const { error } = await supabase.rpc("marcar_troca_senha_obrigatoria", { p_profile_id: profileId });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}

export async function criarPapelAction(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!key || !name) throw new Error("Chave e nome são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_papel_empresa", { p_key: key, p_name: name });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}

export async function concederPermissaoAction(formData: FormData) {
  const roleId = String(formData.get("role_id") ?? "");
  const permissionId = String(formData.get("permission_id") ?? "");
  if (!roleId || !permissionId) throw new Error("Papel e permissão são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("conceder_permissao_papel", { p_role_id: roleId, p_permission_id: permissionId });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}

export async function revogarPermissaoAction(formData: FormData) {
  const roleId = String(formData.get("role_id") ?? "");
  const permissionId = String(formData.get("permission_id") ?? "");
  if (!roleId || !permissionId) throw new Error("Papel e permissão são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("revogar_permissao_papel", { p_role_id: roleId, p_permission_id: permissionId });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}
