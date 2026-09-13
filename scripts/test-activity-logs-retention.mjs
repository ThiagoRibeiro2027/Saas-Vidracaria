// Testes automatizados do ADR-009 §3.4 / Security Gate Fase 8 — retenção de
// activity_logs (24 meses) e o expurgo controlado que abre uma exceção
// deliberada ao trigger de imutabilidade (20260913120000).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-activity-logs-retention.mjs

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
  const { data: company } = await admin
    .from("companies")
    .upsert({ slug, name }, { onConflict: "slug" })
    .select()
    .single();

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

  await admin.from("platform_admins").upsert({ id: userId }, { onConflict: "id" });

  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });

  return { client, userId };
}

async function main() {
  console.log("Preparando tenant e logs de teste (um velho, um recente)...");
  const tenant = await createTenant("retention-test", "Retention Teste", "9501");

  const { data: recentLogId } = await tenant.client.rpc("log_activity", {
    p_action: "test.retention_recent",
    p_entity_type: "test_entity",
    p_entity_id: null,
  });

  // Linha "velha" (> 24 meses) só é possível via service role, escrevendo
  // created_at diretamente — é exatamente o cenário real (linha antiga já
  // gravada há anos, não uma criada agora com timestamp fake sendo forjada
  // pelo cliente).
  const { data: oldLog } = await admin
    .from("activity_logs")
    .insert({
      company_id: tenant.company.id,
      user_id: tenant.userId,
      action: "test.retention_old",
      entity_type: "test_entity",
      description: "linha antiga para teste de expurgo",
      created_at: new Date(Date.now() - 25 * 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  const oldLogId = oldLog.id;

  console.log("\n1. DELETE direto continua bloqueado fora do procedimento de expurgo");
  {
    const { error } = await admin.from("activity_logs").delete().eq("id", oldLogId);
    check("service role não consegue apagar direto (sem o GUC de expurgo)", !!error);
  }

  console.log("\n2. purge_activity_logs_older_than_retention() é restrita a platform_admin");
  {
    const { error } = await tenant.client.rpc("purge_activity_logs_older_than_retention");
    check("administrador de tenant não pode chamar o expurgo", !!error);
  }

  console.log("\n3. Bypass explícito: GUC de expurgo ligado não alcança linha dentro dos 24 meses");
  {
    let bypassError = null;
    try {
      psql(`
        set role service_role;
        select set_config('app.activity_logs_retention_purge', 'on', true);
        delete from public.activity_logs where id = '${recentLogId}';
        reset role;
      `);
    } catch (err) {
      bypassError = err;
    }
    check(
      "DELETE de linha recente falha mesmo com o GUC de expurgo ligado (checagem de idade no trigger)",
      !!bypassError && /Expurgo de retenção só alcança linhas com mais de 24 meses/.test(
        String(bypassError.stderr ?? bypassError.message ?? ""),
      ),
    );

    const { data: stillThere } = await admin
      .from("activity_logs")
      .select("id")
      .eq("id", recentLogId)
      .maybeSingle();
    check("a linha recente continua existindo", !!stillThere);
  }

  console.log("\n4. Expurgo por platform_admin remove só o que passou dos 24 meses");
  {
    const platformAdmin = await createPlatformAdmin("9502");
    const { data: rowsPurged, error } = await platformAdmin.client.rpc(
      "purge_activity_logs_older_than_retention",
    );
    check("platform_admin consegue executar o expurgo", !error);
    check("ao menos 1 linha foi expurgada", (rowsPurged ?? 0) >= 1);

    const { data: oldStillThere } = await admin
      .from("activity_logs")
      .select("id")
      .eq("id", oldLogId)
      .maybeSingle();
    check("a linha antiga (> 24 meses) foi removida", !oldStillThere);

    const { data: recentStillThere } = await admin
      .from("activity_logs")
      .select("id")
      .eq("id", recentLogId)
      .maybeSingle();
    check("a linha recente (dentro dos 24 meses) não foi tocada", !!recentStillThere);

    const { data: purgeEvents } = await admin
      .from("activity_logs")
      .select("id, metadata")
      .eq("action", "governance.activity_logs_retention_purge")
      .order("created_at", { ascending: false })
      .limit(1);
    check("o expurgo em si ficou registrado na trilha de auditoria", (purgeEvents ?? []).length === 1);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
