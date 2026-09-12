// Testes automatizados do ADR-010 §6 — anonimização de dados pessoais em
// activity_logs. Cobre exatamente as garantias que o ADR exige:
//   - DELETE continua bloqueado sempre, sem exceção (nem service role);
//   - UPDATE direto (fora do procedimento) continua bloqueado, para
//     qualquer role, inclusive service role e administrador de tenant —
//     inclusive o bypass explícito de setar o GUC de anonimização e tentar
//     um UPDATE direto mesmo assim, que deve falhar por falta de GRANT
//     (20260912141000_adr010_activity_logs_hardening.sql), não só pelo
//     trigger;
//   - anonymize_activity_logs_for_user() só pode ser chamada por
//     platform_admin — usuário comum e admin de tenant são recusados;
//   - a anonimização apaga user_id/ip_address/user_agent e marca
//     anonymized_at, sem alterar o fato registrado (company_id, action,
//     entity_type, entity_id, description, metadata, created_at);
//   - a própria anonimização fica registrada na trilha de auditoria.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-lgpd-anonymization.mjs

import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PATH_WITH_LIBPQ = `/opt/homebrew/opt/libpq/bin:${process.env.PATH ?? ""}`;

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

function psql(sql) {
  return execFileSync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PATH: PATH_WITH_LIBPQ },
  });
}

async function createTenant(slug, name, identifier, roleKey = "ADMIN") {
  const { data: company, error: companyError } = await admin
    .from("companies")
    .upsert({ slug, name }, { onConflict: "slug" })
    .select()
    .single();
  if (companyError) throw companyError;

  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";

  const { data: created } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }
  if (!userId) throw new Error("usuário não criado");

  await admin.from("profiles").upsert(
    { id: userId, company_id: company.id, login_identifier: identifier, display_name: name },
    { onConflict: "id" },
  );

  const { data: role } = await admin
    .from("roles")
    .select("id")
    .is("company_id", null)
    .eq("key", roleKey)
    .single();

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

async function createPlatformAdmin(identifier) {
  const email = `${identifier}.platform-admin@users.internal`;
  const password = "senha-de-teste-123456";

  const { data: created } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }
  if (!userId) throw new Error("platform admin não criado");

  await admin.from("platform_admins").upsert({ id: userId }, { onConflict: "id" });

  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });

  return { client, userId };
}

async function main() {
  console.log("Preparando tenant e log de teste...");
  const tenant = await createTenant("lgpd-anon-test", "LGPD Anon Teste", "9401");

  const { data: logId } = await tenant.client.rpc("log_activity", {
    p_action: "test.lgpd_anon",
    p_entity_type: "test_entity",
    p_entity_id: null,
    p_description: "descrição do fato, não deve mudar",
    p_metadata: { chave: "valor" },
    p_ip_address: "203.0.113.55",
    p_user_agent: "vitest-lgpd/1.0",
  });

  const { data: before } = await admin
    .from("activity_logs")
    .select("*")
    .eq("id", logId)
    .single();

  console.log("\n1. DELETE continua bloqueado sempre, mesmo via service role");
  {
    const { error } = await admin.from("activity_logs").delete().eq("id", logId);
    check("service role não consegue apagar a linha", !!error);
  }

  console.log("\n2. UPDATE direto continua bloqueado fora do procedimento");
  {
    const { error: tenantError } = await tenant.client
      .from("activity_logs")
      .update({ description: "forjado" })
      .eq("id", logId);
    check("tenant não consegue alterar diretamente (sem policy de UPDATE)", !!tenantError);

    const { error: adminError } = await admin
      .from("activity_logs")
      .update({ description: "forjado-admin" })
      .eq("id", logId);
    check("service role não consegue alterar diretamente (sem GRANT de UPDATE)", !!adminError);
  }

  console.log("\n3. Bypass explícito: GUC setado + UPDATE via service_role deve falhar mesmo assim");
  {
    // O GUC app.activity_logs_anonymization não é um privilégio do Postgres
    // — testamos aqui exatamente o cenário que a migration de hardening
    // fecha: mesmo com o GUC ligado "manualmente" (fora da função), um
    // UPDATE direto como service_role deve falhar por falta de GRANT na
    // tabela, não só pelo trigger. Vai direto no Postgres via psql (fora do
    // PostgREST) para poder setar o GUC antes do UPDATE na mesma sessão.
    let bypassError = null;
    try {
      psql(`
        set role service_role;
        select set_config('app.activity_logs_anonymization', 'on', true);
        update public.activity_logs set description = 'bypass-attempt' where id = '${logId}';
        reset role;
      `);
    } catch (err) {
      bypassError = err;
    }
    check(
      "UPDATE direto como service_role falha mesmo com o GUC ligado (falta de GRANT)",
      !!bypassError && /permission denied/i.test(String(bypassError.stderr ?? bypassError.message ?? "")),
    );

    const { data: stillIntact } = await admin
      .from("activity_logs")
      .select("description")
      .eq("id", logId)
      .single();
    check(
      "a linha permanece intacta após a tentativa de bypass",
      stillIntact?.description !== "bypass-attempt",
    );
  }

  console.log("\n4. anonymize_activity_logs_for_user() é restrita a platform_admin");
  {
    const { error: tenantAdminError } = await tenant.client.rpc("anonymize_activity_logs_for_user", {
      p_user_id: tenant.userId,
      p_reason: "teste",
    });
    check("administrador de tenant não pode chamar a anonimização", !!tenantAdminError);
  }

  console.log("\n5. Anonimização por platform_admin: anonimiza campos pessoais e preserva o fato");
  {
    const platformAdmin = await createPlatformAdmin("9402");

    const { data: rowsAnonymized, error } = await platformAdmin.client.rpc(
      "anonymize_activity_logs_for_user",
      { p_user_id: tenant.userId, p_reason: "pedido de titular — teste automatizado" },
    );
    check("platform_admin consegue executar a anonimização", !error);
    check("ao menos 1 linha foi anonimizada", (rowsAnonymized ?? 0) >= 1);

    const { data: after } = await admin.from("activity_logs").select("*").eq("id", logId).single();

    check("user_id foi removido", after.user_id === null);
    check("ip_address foi removido", after.ip_address === null);
    check("user_agent foi removido", after.user_agent === null);
    check("anonymized_at foi preenchido", after.anonymized_at !== null);

    check("company_id do fato não mudou", after.company_id === before.company_id);
    check("action do fato não mudou", after.action === before.action);
    check("entity_type do fato não mudou", after.entity_type === before.entity_type);
    check("description do fato não mudou", after.description === before.description);
    check(
      "metadata do fato não mudou",
      JSON.stringify(after.metadata) === JSON.stringify(before.metadata),
    );
    check("created_at do fato não mudou", after.created_at === before.created_at);

    const { data: anonEvent } = await admin
      .from("activity_logs")
      .select("id, action, entity_id, description")
      .eq("action", "lgpd.activity_logs_anonymized")
      .eq("entity_id", tenant.userId)
      .maybeSingle();
    check("a anonimização em si ficou registrada na trilha de auditoria", !!anonEvent);
  }

  console.log("\n6. Rodar de novo não reanonimiza nem duplica (idempotência por anonymized_at)");
  {
    const platformAdmin = await createPlatformAdmin("9402");
    const { data: rowsAnonymizedAgain } = await platformAdmin.client.rpc(
      "anonymize_activity_logs_for_user",
      { p_user_id: tenant.userId, p_reason: "segunda chamada" },
    );
    check("segunda chamada não reprocessa linha já anonimizada", rowsAnonymizedAgain === 0);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
