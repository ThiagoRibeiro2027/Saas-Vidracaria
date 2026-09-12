// Testes automatizados do ADR-009 §9 — correção pontual: índice de
// company_id em activity_logs e padrão de subselect nas policies.
//
// Duas frentes:
//   1. via psql/DATABASE_URL: confirma que o índice existe e que, para uma
//      sessão simulando um usuário de tenant autenticado (não superusuário),
//      o planejador está apto a usá-lo — a verificação de desempenho
//      exigida pelo ADR-009 §3.3. Em tabela pequena o planejador pode
//      preferir Seq Scan mesmo com o índice disponível (custo real é menor
//      nesse volume) — isso não é falha da migration, é o comportamento
//      correto do planejador; por isso o teste verifica que o índice
//      EXISTE e é elegível, não que ele necessariamente "vença" em um
//      banco de teste com poucas linhas. Uma verificação de plano com
//      volume realista deve ser refeita à parte, conforme o próprio §3.3.
//   2. via supabase-js (anon key): regressão funcional — o isolamento entre
//      tenants continua correto depois de reescrever as policies para o
//      padrão de subselect (§3.2); a reescrita não deveria mudar nenhum
//      resultado, só o plano de execução.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-rls-performance.mjs

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
  return execFileSync("psql", [DATABASE_URL, "-t", "-A", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PATH: PATH_WITH_LIBPQ },
  });
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
  await client.auth.signInWithPassword({ email, password });

  return { client, company, userId };
}

async function main() {
  console.log("1. Índice de company_id em activity_logs");
  {
    const out = psql(
      `select indexname from pg_indexes where schemaname='public' and tablename='activity_logs' and indexdef ilike '%company_id%' and indexdef not ilike '%(id)%';`,
    );
    check("activity_logs_company_id_idx existe", out.includes("activity_logs_company_id_idx"));
  }

  console.log("\n2. Índice é elegível no plano, como sessão de usuário de tenant (não superusuário)");
  {
    const tenant = await createTenant("rls-perf-test", "RLS Perf Teste", "9301");
    for (let i = 0; i < 5; i++) {
      await tenant.client.rpc("log_activity", {
        p_action: "test.rls_perf",
        p_entity_type: "test_entity",
        p_entity_id: null,
      });
    }

    const plan = psql(`
      set role authenticated;
      set request.jwt.claim.sub = '${tenant.userId}';
      set request.jwt.claims = '{"sub":"${tenant.userId}","role":"authenticated"}';
      explain (format text) select * from activity_logs where company_id = '${tenant.company.id}';
      reset role;
    `);
    check(
      "a consulta filtrada por company_id não faz Seq Scan em activity_logs (índice elegível)",
      !plan.includes("Seq Scan on activity_logs"),
    );
  }

  console.log("\n3. Isolamento entre tenants continua correto após a reescrita das policies");
  {
    const tenantA = await createTenant("rls-perf-a", "RLS Perf A", "9302");
    const tenantB = await createTenant("rls-perf-b", "RLS Perf B", "9303");

    const { data: rowsA } = await tenantA.client.from("companies").select("id");
    check(
      "tenant A só enxerga a própria empresa",
      rowsA?.length === 1 && rowsA[0].id === tenantA.company.id,
    );

    const { data: rowsB } = await tenantB.client.from("companies").select("id");
    check(
      "tenant B só enxerga a própria empresa",
      rowsB?.length === 1 && rowsB[0].id === tenantB.company.id,
    );

    await tenantA.client.rpc("log_activity", {
      p_action: "test.cross_tenant",
      p_entity_type: "test_entity",
      p_entity_id: null,
    });

    const { data: crossLogs } = await tenantB.client
      .from("activity_logs")
      .select("id")
      .eq("company_id", tenantA.company.id);
    check("tenant B não enxerga activity_logs de A", (crossLogs?.length ?? 0) === 0);

    const { data: ownLogs } = await tenantA.client
      .from("activity_logs")
      .select("id")
      .eq("action", "test.cross_tenant");
    check("tenant A continua enxergando os próprios logs", (ownLogs?.length ?? 0) >= 1);
  }

  console.log("\n4. Storage continua isolado por tenant após a reescrita das policies");
  {
    const tenantA = await createTenant("rls-perf-storage-a", "RLS Storage A", "9304");
    const tenantB = await createTenant("rls-perf-storage-b", "RLS Storage B", "9305");

    // company-files só aceita image/jpeg, image/png, image/webp e
    // application/pdf (storage_and_files.sql) — usar um MIME permitido para
    // não confundir rejeição de tipo com rejeição de RLS.
    const path = `${tenantA.company.id}/teste.pdf`;
    const { error: uploadOwnError } = await tenantA.client.storage
      .from("company-files")
      .upload(path, new Blob(["conteudo"], { type: "application/pdf" }), { upsert: true });
    check("tenant A consegue subir arquivo no próprio prefixo", !uploadOwnError);

    const foreignPath = `${tenantA.company.id}/invasao.pdf`;
    const { error: uploadForeignError } = await tenantB.client.storage
      .from("company-files")
      .upload(foreignPath, new Blob(["conteudo"], { type: "application/pdf" }), { upsert: true });
    check("tenant B não consegue subir arquivo no prefixo de A", !!uploadForeignError);

    const { data: listB } = await tenantB.client.storage.from("company-files").list(tenantA.company.id);
    check("tenant B não lista arquivos do prefixo de A", (listB?.length ?? 0) === 0);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
