// Testes automatizados de registrar_sincronizacao_offline()/
// offline_pull_status (20261011173000), achado da auditoria de gaps
// ADR-001 a ADR-012 (11/10/2026): o escritório não tinha como ver qual
// celular de campo está atrasado pra sincronizar — o "syncedAt" só
// existia no IndexedDB do próprio aparelho. Esta função é chamada pelo
// src/lib/offline/sync.ts (refreshPacote()) depois de cada pacote_
// offline_instalacoes() bem-sucedido.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-offline-pull-status.mjs

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

async function main() {
  console.log("Preparando tenants (instalador, escritório vendo o próprio tenant, outro tenant)...");
  const tenant = await createTenant("sync-status-admin", "Sync Status Teste", "sync01", "INSTALACAO");
  const outroTenant = await createTenant("sync-status-other", "Sync Status Outro Teste", "sync02", "ADMIN");

  console.log("\n1. registrar_sincronizacao_offline() — qualquer usuário autenticado da empresa");
  {
    const t1 = new Date(Date.now() - 60_000).toISOString();
    const { error } = await tenant.client.rpc("registrar_sincronizacao_offline", { p_synced_at: t1 });
    check("registra sem erro (não exige permissão de instalacao.manage, só pertencer à empresa)", !error);

    const { data: row } = await admin.from("offline_pull_status").select("*").eq("profile_id", tenant.userId).single();
    check("linha criada com o profile_id do usuário", !!row && row.profile_id === tenant.userId);
    check("company_id é o da empresa do chamador", row?.company_id === tenant.company.id);
    check("last_synced_at bate com o enviado", new Date(row?.last_synced_at ?? 0).getTime() === new Date(t1).getTime());
  }

  console.log("\n2. Chamada seguinte faz UPSERT (1 linha por usuário, nunca histórico)");
  {
    const t2 = new Date().toISOString();
    const { error } = await tenant.client.rpc("registrar_sincronizacao_offline", { p_synced_at: t2 });
    check("segunda sincronização registrada sem erro", !error);

    const { data: rows } = await admin.from("offline_pull_status").select("*").eq("profile_id", tenant.userId);
    check("continua sendo 1 única linha pro usuário (upsert, não insert)", rows?.length === 1);
    check("last_synced_at foi atualizado pro valor mais recente", new Date(rows?.[0]?.last_synced_at ?? 0).getTime() === new Date(t2).getTime());
  }

  console.log("\n3. p_synced_at nulo é recusado");
  {
    const { error } = await tenant.client.rpc("registrar_sincronizacao_offline", { p_synced_at: null });
    check("horário de sincronização nulo é rejeitado", !!error);
  }

  console.log("\n4. Isolamento cross-tenant");
  {
    const { data: crossRead } = await outroTenant.client.from("offline_pull_status").select("*").eq("profile_id", tenant.userId);
    check("outra empresa não enxerga o status de sincronização do tenant A", (crossRead ?? []).length === 0);

    const { data: proprioEmpty } = await outroTenant.client.from("offline_pull_status").select("*");
    check("outra empresa não tem nenhuma linha própria ainda (ninguém sincronizou lá)", (proprioEmpty ?? []).length === 0);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
