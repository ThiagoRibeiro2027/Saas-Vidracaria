// Testes automatizados do TÓPICO 14 — Usuários / Permissões, recorte
// mínimo (ADR-002 §4.10, decisão do responsável do produto em
// 2026-09-19). A Fundação (Fase 2) já construía o modelo de dados
// (profiles/roles/permissions/role_permissions/user_roles +
// has_permission()) — este recorte só adiciona as funções de escrita que
// faltavam pra uma UI existir: criar_perfil_usuario() (segunda metade da
// criação de usuário — a primeira, auth.users, é Admin API, testada só
// no Server Action, não aqui), atribuir_papel_usuario()/
// revogar_papel_usuario() (soft, valid_until), desativar_usuario()/
// reativar_usuario(), marcar_troca_senha_obrigatoria(), e RBAC
// configurável por empresa (criar_papel_empresa()/conceder_permissao_
// papel()/revogar_permissao_papel() — nunca em papel-modelo global,
// company_id null, que afetaria todas as empresas que o usam).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-usuarios.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function createTenant(slug, name, identifier, roleKey = "ADMIN") {
  const { data: company } = await admin
    .from("companies")
    .upsert({ slug, name }, { onConflict: "slug" })
    .select()
    .single();

  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";

  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }

  await admin.from("profiles").upsert(
    { id: userId, company_id: company.id, login_identifier: identifier, display_name: name },
    { onConflict: "id" },
  );

  const { data: role } = await admin.from("roles").select("id").is("company_id", null).eq("key", roleKey).single();
  const { data: existing } = await admin
    .from("user_roles")
    .select("id")
    .eq("profile_id", userId)
    .eq("role_id", role.id)
    .is("valid_until", null)
    .maybeSingle();
  if (!existing) {
    await admin.from("user_roles").insert({ profile_id: userId, role_id: role.id });
  }

  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });

  return { client, company, userId };
}

// Simula a primeira metade de criarUsuarioAction (Admin API) — a função
// SQL testada aqui é sempre a segunda metade.
async function criarAuthUser(emailPrefix) {
  const email = `${emailPrefix}@users.internal`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: "senha-de-teste-123456", email_confirm: true,
  });
  if (error) console.error("[fixture] criarAuthUser falhou:", error);
  return created?.user?.id;
}

async function ultimoLog(companyId, action, entityId) {
  const { data } = await admin
    .from("activity_logs")
    .select("*")
    .eq("company_id", companyId)
    .eq("action", action)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão, outro tenant)...");
  const admTenant = await createTenant("t14-test-admin", "T14 Admin Teste", "14a01", "ADMIN");
  const noPermTenant = await createTenant("t14-test-noperm", "T14 SemPerm Teste", "14a02", "COMERCIAL");
  const otherTenant = await createTenant("t14-test-other", "T14 Outro Teste", "14a03", "ADMIN");

  console.log("\n1. criar_perfil_usuario() — segunda metade da criação de usuário");
  {
    const semPermAuthId = await criarAuthUser("14b01");
    const { error: semPermError } = await noPermTenant.client.rpc("criar_perfil_usuario", {
      p_auth_user_id: semPermAuthId, p_login_identifier: "op001", p_display_name: "Operador Um",
    });
    check("sem users.manage não cria perfil", !!semPermError);

    const okAuthId = await criarAuthUser("14b02");
    const { data: perfilId, error: okError } = await admTenant.client.rpc("criar_perfil_usuario", {
      p_auth_user_id: okAuthId, p_login_identifier: "op002", p_display_name: "Operador Dois", p_contact_email: "op002@jrbox.com.br",
    });
    check("com users.manage cria perfil", !okError && perfilId === okAuthId);

    const { data: perfilCriado } = await admin.from("profiles").select("*").eq("id", okAuthId).single();
    check("perfil nasce com must_change_password=true", perfilCriado?.must_change_password === true);
    check("contact_email salvo corretamente", perfilCriado?.contact_email === "op002@jrbox.com.br");
    check("company_id é o da empresa do chamador, nunca de parâmetro", perfilCriado?.company_id === admTenant.company.id);

    const log = await ultimoLog(admTenant.company.id, "users.usuario_criado", okAuthId);
    check("users.usuario_criado registrado em activity_logs", !!log);

    const vazioAuthId = await criarAuthUser("14b03");
    const { error: vazioError } = await admTenant.client.rpc("criar_perfil_usuario", {
      p_auth_user_id: vazioAuthId, p_login_identifier: "   ", p_display_name: "Alguém",
    });
    check("login_identifier vazio é rejeitado", !!vazioError);

    const duplicadoAuthId = await criarAuthUser("14b04");
    const { error: duplicadoError } = await admTenant.client.rpc("criar_perfil_usuario", {
      p_auth_user_id: duplicadoAuthId, p_login_identifier: "op002", p_display_name: "Outro Nome",
    });
    check("matrícula duplicada na mesma empresa é rejeitada", !!duplicadoError);
  }

  console.log("\n2. atribuir_papel_usuario() / revogar_papel_usuario()");
  {
    const authId = await criarAuthUser("14c01");
    await admTenant.client.rpc("criar_perfil_usuario", {
      p_auth_user_id: authId, p_login_identifier: "op010", p_display_name: "Operador Dez",
    });

    const { data: papelEmpresaId } = await admTenant.client.rpc("criar_papel_empresa", {
      p_key: "OPERADOR_TESTE", p_name: "Operador Teste",
    });
    const { data: papelGlobal } = await admin.from("roles").select("id").is("company_id", null).eq("key", "PRODUCAO").single();

    const { data: userRoleId, error: atribuirError } = await admTenant.client.rpc("atribuir_papel_usuario", {
      p_profile_id: authId, p_role_id: papelEmpresaId, p_valid_until: null,
    });
    check("atribui papel de empresa a usuário da mesma empresa", !atribuirError && !!userRoleId);

    const { error: atribuirGlobalError } = await admTenant.client.rpc("atribuir_papel_usuario", {
      p_profile_id: authId, p_role_id: papelGlobal.id, p_valid_until: null,
    });
    check("atribui papel-modelo global sem restrição de empresa", !atribuirGlobalError);

    const { error: semPermAtribuirError } = await noPermTenant.client.rpc("atribuir_papel_usuario", {
      p_profile_id: authId, p_role_id: papelEmpresaId, p_valid_until: null,
    });
    check("sem users.manage não atribui papel", !!semPermAtribuirError);

    const { error: crossPerfilError } = await otherTenant.client.rpc("atribuir_papel_usuario", {
      p_profile_id: authId, p_role_id: papelEmpresaId, p_valid_until: null,
    });
    check("tenant B não atribui papel a perfil do tenant A", !!crossPerfilError);

    const { data: papelOutraEmpresa } = await otherTenant.client.rpc("criar_papel_empresa", {
      p_key: "PAPEL_OUTRO", p_name: "Papel de Outra Empresa",
    });
    const { error: crossPapelError } = await admTenant.client.rpc("atribuir_papel_usuario", {
      p_profile_id: authId, p_role_id: papelOutraEmpresa, p_valid_until: null,
    });
    check("tenant A não atribui papel de empresa do tenant B", !!crossPapelError);

    const { error: revogarError } = await admTenant.client.rpc("revogar_papel_usuario", { p_user_role_id: userRoleId });
    check("revoga atribuição de papel", !revogarError);
    const { data: revogado } = await admin.from("user_roles").select("valid_until").eq("id", userRoleId).single();
    check("revogação é soft — valid_until preenchido, linha não é apagada", !!revogado && revogado.valid_until !== null);

    const { error: crossRevogarError } = await otherTenant.client.rpc("revogar_papel_usuario", { p_user_role_id: userRoleId });
    check("tenant B não revoga atribuição do tenant A", !!crossRevogarError);
  }

  console.log("\n3. desativar_usuario() / reativar_usuario() / marcar_troca_senha_obrigatoria()");
  {
    const authId = await criarAuthUser("14d01");
    await admTenant.client.rpc("criar_perfil_usuario", {
      p_auth_user_id: authId, p_login_identifier: "op020", p_display_name: "Operador Vinte",
    });

    const { error: crossDesativarError } = await otherTenant.client.rpc("desativar_usuario", { p_profile_id: authId, p_motivo: null });
    check("tenant B não desativa usuário do tenant A", !!crossDesativarError);

    const { error: desativarError } = await admTenant.client.rpc("desativar_usuario", { p_profile_id: authId, p_motivo: "teste" });
    check("desativa usuário", !desativarError);
    const { data: inativo } = await admin.from("profiles").select("active").eq("id", authId).single();
    check("active vira false", inativo?.active === false);

    const { error: reativarError } = await admTenant.client.rpc("reativar_usuario", { p_profile_id: authId });
    check("reativa usuário", !reativarError);
    const { data: ativo } = await admin.from("profiles").select("active").eq("id", authId).single();
    check("active volta a true", ativo?.active === true);

    await admin.from("profiles").update({ must_change_password: false }).eq("id", authId);
    const { error: senhaError } = await admTenant.client.rpc("marcar_troca_senha_obrigatoria", { p_profile_id: authId });
    check("marca troca de senha obrigatória", !senhaError);
    const { data: senhaPendente } = await admin.from("profiles").select("must_change_password").eq("id", authId).single();
    check("must_change_password volta a true", senhaPendente?.must_change_password === true);

    const log = await ultimoLog(admTenant.company.id, "users.usuario_desativado", authId);
    check("users.usuario_desativado registrado em activity_logs", !!log);
  }

  console.log("\n4. criar_papel_empresa() / conceder_permissao_papel() / revogar_permissao_papel()");
  {
    const { error: semPermCriarPapelError } = await noPermTenant.client.rpc("criar_papel_empresa", {
      p_key: "SEM_PERM", p_name: "Sem Permissão",
    });
    check("sem roles.manage não cria papel", !!semPermCriarPapelError);

    const { data: papelId, error: criarPapelError } = await admTenant.client.rpc("criar_papel_empresa", {
      p_key: "GESTOR_TESTE", p_name: "Gestor Teste",
    });
    check("com roles.manage cria papel de empresa", !criarPapelError && !!papelId);

    const { data: permView } = await admin.from("permissions").select("id").eq("resource", "producao").eq("action", "view").single();

    const { error: concederError } = await admTenant.client.rpc("conceder_permissao_papel", {
      p_role_id: papelId, p_permission_id: permView.id,
    });
    check("concede permissão a papel próprio", !concederError);
    const { data: concedida } = await admin.from("role_permissions").select("*").eq("role_id", papelId).eq("permission_id", permView.id).maybeSingle();
    check("permissão persistida em role_permissions", !!concedida);

    const { data: papelGlobal } = await admin.from("roles").select("id").is("company_id", null).eq("key", "COMERCIAL").single();
    const { error: concederGlobalError } = await admTenant.client.rpc("conceder_permissao_papel", {
      p_role_id: papelGlobal.id, p_permission_id: permView.id,
    });
    check("NUNCA concede permissão em papel-modelo global (afetaria outras empresas)", !!concederGlobalError);

    const { data: papelOutraEmpresa } = await otherTenant.client.rpc("criar_papel_empresa", {
      p_key: "PAPEL_B", p_name: "Papel B",
    });
    const { error: crossConcederError } = await admTenant.client.rpc("conceder_permissao_papel", {
      p_role_id: papelOutraEmpresa, p_permission_id: permView.id,
    });
    check("tenant A não concede permissão em papel do tenant B", !!crossConcederError);

    const { error: revogarPermError } = await admTenant.client.rpc("revogar_permissao_papel", {
      p_role_id: papelId, p_permission_id: permView.id,
    });
    check("revoga permissão de papel próprio", !revogarPermError);
    const { data: revogadaCheck } = await admin.from("role_permissions").select("*").eq("role_id", papelId).eq("permission_id", permView.id).maybeSingle();
    check("permissão removida de role_permissions", !revogadaCheck);

    const log = await ultimoLog(admTenant.company.id, "roles.papel_criado", papelId);
    check("roles.papel_criado registrado em activity_logs", !!log);
  }

  console.log("\n5. Isolamento cross-tenant de leitura (RLS já existente da Fundação)");
  {
    const { data: profilesOutros } = await otherTenant.client.from("profiles").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não lê perfis do tenant A via SELECT direto", (profilesOutros ?? []).length === 0);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
