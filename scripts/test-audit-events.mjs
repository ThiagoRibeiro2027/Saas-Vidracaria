// Testes automatizados da Fase 4 — Auditoria (Prompt Mestre itens 17-18):
// captura de IP/User-Agent em log_activity()/complete_password_change(), e
// imutabilidade real dos logs (nem UPDATE nem DELETE, nem por service role).
//
// Os eventos de autenticação (login/logout/MFA) são registrados no código
// do Next.js (src/app/login, src/app/mfa), não no banco — não são
// exercitáveis por um script que fala direto com o Supabase, por isso
// foram validados manualmente na UI (ver /audit). Este script cobre a
// parte que é testável na camada de banco: a própria função de log e a
// proteção contra alteração/remoção.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-audit-events.mjs

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
  console.log("Preparando tenant de teste (audit-test)...");
  const tenant = await createTenant("audit-test", "Audit Teste", "9201");

  console.log("\n1. log_activity() grava IP/User-Agent");
  {
    const { data: logId, error } = await tenant.client.rpc("log_client_event", {
      p_action: "test.audit",
      p_entity_type: "test_entity",
      p_entity_id: null,
      p_ip_address: "203.0.113.10",
      p_user_agent: "vitest-agent/1.0",
    });
    check("log_activity() executa com ip/user-agent", !error && !!logId);

    const { data: row } = await admin
      .from("activity_logs")
      .select("ip_address, user_agent")
      .eq("id", logId)
      .single();
    check("ip_address foi persistido", row?.ip_address === "203.0.113.10");
    check("user_agent foi persistido", row?.user_agent === "vitest-agent/1.0");

    tenant.logId = logId;
  }

  console.log("\n2. Imutabilidade dos logs — nem o próprio autor...");
  {
    const { error: updateError } = await tenant.client
      .from("activity_logs")
      .update({ action: "forjado" })
      .eq("id", tenant.logId);
    check("tenant não consegue alterar o próprio log (sem policy de UPDATE)", !!updateError);

    const { error: deleteError } = await tenant.client
      .from("activity_logs")
      .delete()
      .eq("id", tenant.logId);
    check("tenant não consegue apagar o próprio log (sem policy de DELETE)", !!deleteError);
  }

  console.log("\n3. Imutabilidade dos logs — nem a service role (trigger no banco)");
  {
    const { error: adminUpdateError } = await admin
      .from("activity_logs")
      .update({ action: "forjado-admin" })
      .eq("id", tenant.logId);
    check("trigger bloqueia UPDATE mesmo via service role", !!adminUpdateError);

    const { error: adminDeleteError } = await admin
      .from("activity_logs")
      .delete()
      .eq("id", tenant.logId);
    check("trigger bloqueia DELETE mesmo via service role", !!adminDeleteError);

    const { data: stillThere } = await admin
      .from("activity_logs")
      .select("id, action")
      .eq("id", tenant.logId)
      .single();
    check("o log original permanece intacto", stillThere?.action === "test.audit");
  }

  console.log("\n4. complete_password_change() aceita e grava IP/User-Agent");
  {
    const tenantEmail = `pwd-audit-${Date.now()}@users.internal`;
    const tenantPassword = "senha-temporaria-123456";
    const { data: tenantUser } = await admin.auth.admin.createUser({
      email: tenantEmail,
      password: tenantPassword,
      email_confirm: true,
    });
    await admin.from("profiles").insert({
      id: tenantUser.user.id,
      company_id: tenant.company.id,
      login_identifier: "9202",
      display_name: "Usuário Teste Auditoria",
      must_change_password: true,
    });

    const pwdClient = createClient(url, anonKey);
    await pwdClient.auth.signInWithPassword({ email: tenantEmail, password: tenantPassword });
    await pwdClient.auth.updateUser({ password: "nova-senha-bem-forte-999" });

    const { error: rpcError } = await pwdClient.rpc("complete_password_change", {
      p_ip_address: "198.51.100.7",
      p_user_agent: "vitest-agent/1.0",
    });
    check("complete_password_change() aceita parâmetros de ip/user-agent", !rpcError);

    const { data: log } = await admin
      .from("activity_logs")
      .select("ip_address")
      .eq("user_id", tenantUser.user.id)
      .eq("action", "auth.password_changed")
      .single();
    check("o log de troca de senha registrou o ip informado", log?.ip_address === "198.51.100.7");
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
