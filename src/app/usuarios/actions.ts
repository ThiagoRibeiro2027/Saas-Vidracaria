"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { validatePassword } from "@/lib/auth/password-policy";

// TÓPICO 14 — criação de usuário é a única operação desta tela que
// precisa da Admin API (auth.users não é gravável por RLS/RPC comum).
// Todo o resto (perfil, papel, papel de empresa, permissão) é função
// SECURITY DEFINER normal, chamada pelo client autenticado — mesmo
// padrão de todo o resto do schema.
// Resultado das ações de formulário com mensagem para o usuário. Em produção o
// Next.js esconde a mensagem de uma exceção lançada por Server Action e mostra a
// página genérica "This page couldn't load" — por isso erro ESPERADO (senha fraca,
// matrícula repetida, sem permissão) volta como valor, não como throw.
export type ResultadoAcao = { error?: string; ok?: string } | undefined;

export async function criarUsuarioAction(_prev: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const loginIdentifier = String(formData.get("login_identifier") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  const roleId = String(formData.get("role_id") ?? "").trim() || null;

  if (!loginIdentifier || !displayName) return { error: "Matrícula e nome são obrigatórios." };
  const senhaInicialFraca = validatePassword(password);
  if (senhaInicialFraca) return { error: `Senha inicial: ${senhaInicialFraca}` };

  const supabase = await createClient();

  // Checado aqui ANTES de tocar auth.users — evita criar identidade órfã
  // quando o chamador não tem permissão (a função SQL abaixo checa de
  // novo, redundância intencional).
  const { data: canManage } = await supabase.rpc("has_permission", { p_resource: "users", p_action: "manage" });
  if (!canManage) return { error: "Sem permissão para criar usuário (users.manage)." };

  const { data: companyId } = await supabase.rpc("current_company_id");
  const { data: company } = await supabase.from("companies").select("slug").eq("id", companyId).single();
  if (!company) return { error: "Empresa não encontrada." };

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
    return { error: createError?.message ?? "Falha ao criar usuário." };
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
    return { error: perfilError.message };
  }

  if (roleId) {
    const { error: papelError } = await supabase.rpc("atribuir_papel_usuario", {
      p_profile_id: created.user.id,
      p_role_id: roleId,
      p_valid_until: null,
    });
    if (papelError) {
      revalidatePath("/usuarios");
      return { error: `Usuário criado, mas falha ao atribuir papel: ${papelError.message}` };
    }
  }

  revalidatePath("/usuarios");
  return { ok: `Usuário ${loginIdentifier} criado.` };
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

export async function resetarSenhaAction(_prev: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const profileId = String(formData.get("profile_id") ?? "");
  const novaSenha = String(formData.get("nova_senha") ?? "");
  if (!profileId) return { error: "Usuário inválido." };
  const novaSenhaFraca = validatePassword(novaSenha);
  if (novaSenhaFraca) return { error: `Nova senha: ${novaSenhaFraca}` };

  const supabase = await createClient();

  // ORDEM IMPORTA (auditoria 12/10/2026): a Admin API ignora RLS e troca a senha de
  // QUALQUER id recebido. O profile_id vem do formulário, ou seja, do cliente. Por
  // isso o banco valida PRIMEIRO — permissão users.manage, empresa suspensa e se o
  // perfil é desta empresa (marcar_troca_senha_obrigatoria) — e só depois a
  // senha é alterada. A ordem anterior trocava a senha e só então o banco recusava:
  // um ADMIN de uma empresa redefinia a senha de usuário de outra.
  const { error: gateError } = await supabase.rpc("marcar_troca_senha_obrigatoria", { p_profile_id: profileId });
  if (gateError) return { error: gateError.message };

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(profileId, { password: novaSenha });
  if (updateError) return { error: updateError.message };

  revalidatePath("/usuarios");
  return { ok: "Senha redefinida. O usuário deverá trocá-la no próximo acesso." };
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

// TÓPICO 14 §5/§6, achado da auditoria de gaps ADR-001 a ADR-012
// (11/10/2026): permissão individual, além/apesar do papel — "conceder"
// dá uma permissão que o papel não dá; "restringir" ("negar") tira uma
// que o papel daria. Gate das 3 funções é roles.manage (mesmo de
// conceder/revogar permissão de papel acima), não users.manage.
export async function concederPermissaoIndividualAction(formData: FormData) {
  const profileId = String(formData.get("profile_id") ?? "");
  const permissionId = String(formData.get("permission_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!profileId || !permissionId) throw new Error("Usuário e permissão são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("conceder_permissao_individual", { p_profile_id: profileId, p_permission_id: permissionId, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}

export async function restringirPermissaoIndividualAction(formData: FormData) {
  const profileId = String(formData.get("profile_id") ?? "");
  const permissionId = String(formData.get("permission_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!profileId || !permissionId) throw new Error("Usuário e permissão são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("restringir_permissao_individual", { p_profile_id: profileId, p_permission_id: permissionId, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}

export async function removerPermissaoIndividualAction(formData: FormData) {
  const profileId = String(formData.get("profile_id") ?? "");
  const permissionId = String(formData.get("permission_id") ?? "");
  if (!profileId || !permissionId) throw new Error("Usuário e permissão são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_permissao_individual", { p_profile_id: profileId, p_permission_id: permissionId });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}
