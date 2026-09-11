// Testes automatizados da fundação de segurança (Tópico 1 §27):
// isolamento multi-tenant, tentativa de acesso cruzado, autorização,
// e imutabilidade das tabelas de RBAC/auditoria para usuários comuns.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-foundation-rls.mjs

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

async function createTenant(slug, name, identifier) {
  const { data: company, error: companyError } = await admin
    .from("companies")
    .upsert({ slug, name }, { onConflict: "slug" })
    .select()
    .single();
  if (companyError) throw companyError;

  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }
  if (!userId) throw userError ?? new Error("usuário não criado");

  await admin.from("profiles").upsert(
    { id: userId, company_id: company.id, login_identifier: identifier, display_name: name },
    { onConflict: "id" },
  );

  const { data: adminRole } = await admin
    .from("roles")
    .select("id")
    .is("company_id", null)
    .eq("key", "ADMIN")
    .single();

  const { data: existing } = await admin
    .from("user_roles")
    .select("id")
    .eq("profile_id", userId)
    .eq("role_id", adminRole.id)
    .is("valid_until", null)
    .maybeSingle();
  if (!existing) {
    await admin.from("user_roles").insert({ profile_id: userId, role_id: adminRole.id });
  }

  const client = createClient(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { client, company, userId };
}

async function main() {
  console.log("Preparando dois tenants de teste (jrbox-test, acme-test)...");
  const tenantA = await createTenant("jrbox-test", "JR Box Teste", "9001");
  const tenantB = await createTenant("acme-test", "Acme Teste", "9002");

  console.log("\n1. Isolamento — leitura própria");
  {
    const { data, error } = await tenantA.client.from("companies").select("id");
    check("tenant A vê apenas a própria empresa", !error && data.length === 1 && data[0].id === tenantA.company.id);
  }

  console.log("\n2. Isolamento — tentativa de acesso cruzado");
  {
    const { data } = await tenantA.client
      .from("companies")
      .select("id")
      .eq("id", tenantB.company.id);
    check("tenant A não enxerga a empresa do tenant B", (data ?? []).length === 0);

    const { data: profilesCross } = await tenantA.client
      .from("profiles")
      .select("id")
      .eq("company_id", tenantB.company.id);
    check("tenant A não enxerga perfis do tenant B", (profilesCross ?? []).length === 0);
  }

  console.log("\n3. Autorização — escrita estrutural bloqueada para usuário comum");
  {
    const { error: insertRoleError } = await tenantA.client
      .from("roles")
      .insert({ company_id: tenantA.company.id, key: "HACK", name: "Auto-criado" });
    check("usuário autenticado não consegue criar papel via REST direto", !!insertRoleError);

    const { error: updateCompanyError } = await tenantA.client
      .from("companies")
      .update({ name: "Nome forjado" })
      .eq("id", tenantA.company.id);
    const { data: companyAfter } = await admin
      .from("companies")
      .select("name")
      .eq("id", tenantA.company.id)
      .single();
    // Sem GRANT de UPDATE (e sem policy correspondente), o Postgres pode
    // tanto rejeitar com erro quanto silenciosamente afetar 0 linhas — o
    // que importa é que o nome real nunca mude por essa via.
    check(
      "usuário autenticado não consegue alterar a própria empresa via REST direto",
      !!updateCompanyError || companyAfter.name === tenantA.company.name,
    );

    const { error: selfElevateError } = await tenantA.client.from("user_roles").insert({
      profile_id: tenantA.userId,
      role_id: (await admin.from("roles").select("id").is("company_id", null).eq("key", "ADMIN").single()).data.id,
    });
    check("usuário autenticado não consegue se autoatribuir papel via REST direto", !!selfElevateError);
  }

  console.log("\n4. Auditoria — log via função, nunca forjável pelo cliente");
  {
    const { data: logId, error: logError } = await tenantA.client.rpc("log_activity", {
      p_action: "test.create",
      p_entity_type: "test_entity",
      p_entity_id: null,
      p_description: "verificação automatizada",
      p_metadata: null,
    });
    check("log_activity() executa com sucesso para usuário autorizado", !logError && !!logId);

    const { data: ownLogs } = await tenantA.client
      .from("activity_logs")
      .select("id, company_id, user_id")
      .eq("id", logId);
    check(
      "log gravado com company_id/user_id corretos, derivados do servidor",
      ownLogs?.[0]?.company_id === tenantA.company.id && ownLogs?.[0]?.user_id === tenantA.userId,
    );

    const { data: crossLogs } = await tenantB.client
      .from("activity_logs")
      .select("id")
      .eq("id", logId);
    check("tenant B não consegue ler o log de auditoria do tenant A", (crossLogs ?? []).length === 0);

    const { error: directInsertError } = await tenantA.client.from("activity_logs").insert({
      company_id: tenantA.company.id,
      user_id: tenantA.userId,
      action: "forjado",
      entity_type: "x",
    });
    check("cliente não consegue inserir direto em activity_logs (só via função)", !!directInsertError);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
