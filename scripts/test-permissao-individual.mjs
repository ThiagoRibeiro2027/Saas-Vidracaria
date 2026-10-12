// Testes automatizados de permissão individual por usuário (TÓPICO 14
// §5/§6, migration 20261011174000), achado da auditoria de gaps ADR-001
// a ADR-012 (11/10/2026): até aqui toda autorização resolvia só por
// papel — este teste cobre o novo mecanismo de override (conceder/negar
// por usuário, além do papel) e, criticamente, confirma que has_permission()
// continua se comportando IGUAL a antes pra quem não tem nenhum override
// (regressão zero no caminho mais comum do sistema inteiro).
//
// Dado o alcance de has_permission() (chamada por toda escrita de
// negócio), este teste também repete a MESMA defesa de auto-promoção de
// privilégio já coberta pra atribuir_papel_usuario()/conceder_permissao_
// papel() (fix 20261011000151), agora pro caminho individual.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-permissao-individual.mjs

import "./lib/somente-local.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
function check(label, condition, extra) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`, extra ?? "");
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

async function limparOverrides(companyId) {
  await admin.from("user_permissions").delete().eq("company_id", companyId);
}

// E-mail sempre único por execução (Date.now()): a Admin API do GoTrue
// tem uma pequena janela de propagação após deleteUser() em que o mesmo
// e-mail ainda é recusado como "já registrado" — reaproveitar um e-mail
// fixo entre reexecuções próximas no tempo esbarra nisso.
async function criarUsuarioExtra(prefixo, slug) {
  const email = `${prefixo}-${Date.now()}.${slug}@users.internal`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "senha-de-teste-123456", email_confirm: true });
  if (!data?.user) throw error ?? new Error(`usuário ${prefixo} não criado`);
  return { userId: data.user.id, email };
}

async function main() {
  console.log("Preparando tenants (admin, admin+usuário comercial limitado, outro tenant)...");
  const admTenant = await createTenant("perm-individual-admin", "Permissão Individual Admin", "pi01", "ADMIN");
  const otherTenant = await createTenant("perm-individual-other", "Permissão Individual Outro", "pi03", "ADMIN");
  await limparOverrides(admTenant.company.id);
  // Perfis extras próprios deste teste (matrícula é única por empresa —
  // um perfil órfão de uma run anterior, mesmo sem o auth.users
  // correspondente, bloquearia criar_perfil_usuario na próxima).
  const { data: perfisAntigos } = await admin.from("profiles").select("id").eq("company_id", admTenant.company.id).in("login_identifier", ["pi02", "piop04"]);
  if (perfisAntigos?.length) {
    for (const p of perfisAntigos) await admin.auth.admin.deleteUser(p.id).catch(() => {});
    await admin.from("profiles").delete().in("id", perfisAntigos.map((p) => p.id));
  }
  // Papéis próprios deste teste, reexecutável sem reset de banco.
  const { data: papeisAntigos } = await admin.from("roles").select("id").eq("company_id", admTenant.company.id).in("key", ["COMERCIAL_TESTE_PI", "GESTOR_LIMITADO_PI"]);
  if (papeisAntigos?.length) {
    const idsAntigos = papeisAntigos.map((r) => r.id);
    await admin.from("role_permissions").delete().in("role_id", idsAntigos);
    await admin.from("user_roles").delete().in("role_id", idsAntigos);
    await admin.from("roles").delete().in("id", idsAntigos);
  }

  const { data: permProducaoManage } = await admin.from("permissions").select("id").eq("resource", "producao").eq("action", "manage").single();
  const { data: permOrcamentosAprovar } = await admin.from("permissions").select("id").eq("resource", "orcamentos").eq("action", "manage").single();
  const { data: permPedidosManage } = await admin.from("permissions").select("id").eq("resource", "pedidos").eq("action", "manage").single();

  // "COMERCIAL" é só o papel-modelo global (company_id null) — nasce SEM
  // nenhuma permissão por padrão (seed.sql: só ADMIN recebe tudo; os
  // demais templates ficam vazios até a própria empresa configurar).
  // Gravar nele contaminaria TODAS as empresas que usam o mesmo template
  // — por isso o teste cria, dentro do tenant ADMIN, um papel próprio só
  // com pedidos.manage + orcamentos.manage, e um usuário separado com
  // esse papel (mesmo padrão já usado na seção 5 de test-usuarios.mjs).
  const { data: papelComercialTesteId } = await admTenant.client.rpc("criar_papel_empresa", { p_key: "COMERCIAL_TESTE_PI", p_name: "Comercial Teste PI" });
  await admTenant.client.rpc("conceder_permissao_papel", { p_role_id: papelComercialTesteId, p_permission_id: permOrcamentosAprovar.id });
  await admTenant.client.rpc("conceder_permissao_papel", { p_role_id: papelComercialTesteId, p_permission_id: permPedidosManage.id });

  const { userId: comercialUserId, email: comercialEmail } = await criarUsuarioExtra("pi02", admTenant.company.slug);
  await admTenant.client.rpc("criar_perfil_usuario", { p_auth_user_id: comercialUserId, p_login_identifier: "pi02", p_display_name: "Comercial Teste PI" });
  {
    const { error } = await admTenant.client.rpc("atribuir_papel_usuario", { p_profile_id: comercialUserId, p_role_id: papelComercialTesteId, p_valid_until: null });
    if (error) throw new Error(`[fixture] atribuir_papel_usuario (comercial) falhou: ${error.message}`);
  }
  const comercialClient = createClient(url, anonKey);
  await comercialClient.auth.signInWithPassword({ email: comercialEmail, password: "senha-de-teste-123456" });
  const comercialTenant = { client: comercialClient, company: admTenant.company, userId: comercialUserId };

  console.log("\n1. Sem nenhum override — has_permission() se comporta IGUAL a antes (regressão zero)");
  {
    const { data: comPapel } = await comercialTenant.client.rpc("has_permission", { p_resource: "orcamentos", p_action: "manage" });
    check("COMERCIAL tem orcamentos.manage via papel (sem override nenhum)", !!comPapel);

    const { data: semPapel } = await comercialTenant.client.rpc("has_permission", { p_resource: "producao", p_action: "manage" });
    check("COMERCIAL não tem producao.manage (nem papel, nem override)", !semPapel);
  }

  console.log("\n2. conceder_permissao_individual() — gate de permissão");
  {
    const { error: semPermError } = await comercialTenant.client.rpc("conceder_permissao_individual", {
      p_profile_id: comercialTenant.userId, p_permission_id: permProducaoManage.id, p_motivo: null,
    });
    check("sem roles.manage não concede permissão individual (nem a si mesmo)", !!semPermError);

    const { error: crossTenantError } = await otherTenant.client.rpc("conceder_permissao_individual", {
      p_profile_id: comercialTenant.userId, p_permission_id: permProducaoManage.id, p_motivo: null,
    });
    check("empresa diferente não concede permissão a perfil de outra empresa", !!crossTenantError);
  }

  console.log("\n3. Auto-promoção de privilégio — mesma defesa do fix 20261011000151, agora pro caminho individual");
  {
    const { data: papelLimitadoId } = await admTenant.client.rpc("criar_papel_empresa", { p_key: "GESTOR_LIMITADO_PI", p_name: "Gestor Limitado PI" });
    const { data: permUsersManage } = await admin.from("permissions").select("id").eq("resource", "users").eq("action", "manage").single();
    const { data: permRolesManage } = await admin.from("permissions").select("id").eq("resource", "roles").eq("action", "manage").single();
    await admTenant.client.rpc("conceder_permissao_papel", { p_role_id: papelLimitadoId, p_permission_id: permUsersManage.id });
    await admTenant.client.rpc("conceder_permissao_papel", { p_role_id: papelLimitadoId, p_permission_id: permRolesManage.id });

    const { userId: limitadoAuthId, email: emailLimitado } = await criarUsuarioExtra("pi04", admTenant.company.slug);
    await admTenant.client.rpc("criar_perfil_usuario", { p_auth_user_id: limitadoAuthId, p_login_identifier: "piop04", p_display_name: "Operador Limitado PI" });
    {
      const { error } = await admTenant.client.rpc("atribuir_papel_usuario", { p_profile_id: limitadoAuthId, p_role_id: papelLimitadoId, p_valid_until: null });
      if (error) throw new Error(`[fixture] atribuir_papel_usuario (limitado) falhou: ${error.message}`);
    }

    const limitadoClient = createClient(url, anonKey);
    await limitadoClient.auth.signInWithPassword({ email: emailLimitado, password: "senha-de-teste-123456" });

    const { error: escalarError } = await limitadoClient.rpc("conceder_permissao_individual", {
      p_profile_id: limitadoAuthId, p_permission_id: permProducaoManage.id, p_motivo: "tentando se auto-promover",
    });
    check("usuário com roles.manage não concede a si mesmo permissão que não possui", !!escalarError);

    const { error: restringirSemPermError } = await limitadoClient.rpc("restringir_permissao_individual", {
      p_profile_id: otherTenant.userId, p_permission_id: permOrcamentosAprovar.id, p_motivo: null,
    });
    check("restringir em usuário de outra empresa é recusado (fora da própria empresa)", !!restringirSemPermError);

    const { error: restringirOkError } = await limitadoClient.rpc("restringir_permissao_individual", {
      p_profile_id: limitadoAuthId, p_permission_id: permUsersManage.id, p_motivo: "auto-restrição, sempre permitida (reduz acesso)",
    });
    check("restringir (negar) NÃO precisa ter a permissão — reduzir acesso não escala privilégio", !restringirOkError);
  }

  console.log("\n4. conceder_permissao_individual() bem-sucedido — efeito em has_permission()");
  {
    const { data: antesId } = await comercialTenant.client.rpc("has_permission", { p_resource: "producao", p_action: "manage" });
    check("antes de conceder, COMERCIAL ainda não tem producao.manage", !antesId);

    const { error } = await admTenant.client.rpc("conceder_permissao_individual", {
      p_profile_id: comercialTenant.userId, p_permission_id: permProducaoManage.id, p_motivo: "exceção aprovada pelo gestor",
    });
    check("ADMIN (que tem producao.manage via papel) concede a exceção", !error);

    const { data: depois } = await comercialTenant.client.rpc("has_permission", { p_resource: "producao", p_action: "manage" });
    check("COMERCIAL passa a ter producao.manage mesmo sem o papel conceder isso", !!depois);

    const log = await admin.from("activity_logs").select("*").eq("company_id", admTenant.company.id).eq("action", "roles.permissao_individual_concedida").order("created_at", { ascending: false }).limit(1).maybeSingle();
    check("roles.permissao_individual_concedida registrado em activity_logs", !!log.data);
  }

  console.log("\n5. restringir_permissao_individual() — 'negar' sempre vence sobre o papel (TÓPICO 14 §6)");
  {
    const { data: antes } = await comercialTenant.client.rpc("has_permission", { p_resource: "orcamentos", p_action: "manage" });
    check("COMERCIAL tem orcamentos.manage via papel, antes da restrição", !!antes);

    const { error } = await admTenant.client.rpc("restringir_permissao_individual", {
      p_profile_id: comercialTenant.userId, p_permission_id: permOrcamentosAprovar.id, p_motivo: "afastado temporariamente do processo comercial",
    });
    check("ADMIN restringe a permissão que o papel concederia", !error);

    const { data: depois } = await comercialTenant.client.rpc("has_permission", { p_resource: "orcamentos", p_action: "manage" });
    check("restrição individual VENCE o papel — COMERCIAL perde orcamentos.manage mesmo com o papel ainda concedendo", !depois);

    // O resto do papel continua intacto — restrição é só na permissão específica.
    const { data: outraAindaOk } = await comercialTenant.client.rpc("has_permission", { p_resource: "pedidos", p_action: "manage" });
    check("outras permissões do mesmo papel continuam intactas (restrição não é global)", !!outraAindaOk);
  }

  console.log("\n6. remover_permissao_individual() — volta a resolver só pelo papel");
  {
    const { error: removeConcedidaError } = await admTenant.client.rpc("remover_permissao_individual", {
      p_profile_id: comercialTenant.userId, p_permission_id: permProducaoManage.id,
    });
    check("remove a concessão individual", !removeConcedidaError);
    const { data: semConcessao } = await comercialTenant.client.rpc("has_permission", { p_resource: "producao", p_action: "manage" });
    check("volta a não ter producao.manage (nenhum papel dá isso)", !semConcessao);

    const { error: removeRestricaoError } = await admTenant.client.rpc("remover_permissao_individual", {
      p_profile_id: comercialTenant.userId, p_permission_id: permOrcamentosAprovar.id,
    });
    check("remove a restrição individual", !removeRestricaoError);
    const { data: semRestricao } = await comercialTenant.client.rpc("has_permission", { p_resource: "orcamentos", p_action: "manage" });
    check("volta a ter orcamentos.manage, de novo só pelo papel", !!semRestricao);

    const { error: removeInexistenteError } = await admTenant.client.rpc("remover_permissao_individual", {
      p_profile_id: comercialTenant.userId, p_permission_id: permOrcamentosAprovar.id,
    });
    check("remover um override que não existe mais é recusado (não falha silenciosamente)", !!removeInexistenteError);
  }

  console.log("\n7. listar_permissoes_efetivas() — TÓPICO 14 §6 ('o que este usuário realmente pode fazer')");
  {
    await admTenant.client.rpc("conceder_permissao_individual", { p_profile_id: comercialTenant.userId, p_permission_id: permProducaoManage.id, p_motivo: "teste efetivas" });
    await admTenant.client.rpc("restringir_permissao_individual", { p_profile_id: comercialTenant.userId, p_permission_id: permOrcamentosAprovar.id, p_motivo: "teste efetivas" });

    const { data: efetivas, error } = await admTenant.client.rpc("listar_permissoes_efetivas", { p_profile_id: comercialTenant.userId });
    check("lista sem erro", !error);

    const producaoRow = efetivas?.find((r) => r.resource === "producao" && r.action === "manage");
    check("producao.manage: via_papel=false, override=conceder, efetiva=true", producaoRow?.via_papel === false && producaoRow?.override === "conceder" && producaoRow?.efetiva === true);

    const orcamentosRow = efetivas?.find((r) => r.resource === "orcamentos" && r.action === "manage");
    check("orcamentos.manage: via_papel=true, override=negar, efetiva=false (negar vence)", orcamentosRow?.via_papel === true && orcamentosRow?.override === "negar" && orcamentosRow?.efetiva === false);

    const pedidosRow = efetivas?.find((r) => r.resource === "pedidos" && r.action === "manage");
    check("pedidos.manage: via_papel=true, sem override, efetiva=true (fallback normal)", pedidosRow?.via_papel === true && pedidosRow?.override === null && pedidosRow?.efetiva === true);

    const { error: semPermError } = await comercialTenant.client.rpc("listar_permissoes_efetivas", { p_profile_id: comercialTenant.userId });
    check("usuário comum não consegue listar as próprias permissões efetivas (só roles.manage/users.manage)", !!semPermError);
  }

  console.log("\n8. Isolamento cross-tenant");
  {
    const { error: crossConcederError } = await otherTenant.client.rpc("conceder_permissao_individual", {
      p_profile_id: comercialTenant.userId, p_permission_id: permProducaoManage.id, p_motivo: null,
    });
    check("tenant B não concede permissão individual a usuário do tenant A", !!crossConcederError);

    const { data: crossRead } = await otherTenant.client.from("user_permissions").select("*").eq("profile_id", comercialTenant.userId);
    check("tenant B não lê overrides do tenant A via SELECT direto", (crossRead ?? []).length === 0);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
