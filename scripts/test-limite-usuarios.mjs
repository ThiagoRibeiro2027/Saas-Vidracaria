// Testes automatizados do limite de usuários por plano em
// criar_perfil_usuario() (20261011164500), achado da auditoria de gaps
// ADR-001 a ADR-012 (11/10/2026): Prompt Mestre item 23 exige
// "companies → subscription → plan → max_users" e que o sistema impeça
// criar usuário acima do limite — plans.max_users existia desde a
// Fundação SaaS Governance, mas nunca era lido por nenhuma função de
// escrita (só exibido no painel platform_admin).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-limite-usuarios.mjs

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

// Mesma "segunda metade" de criarUsuarioAction (src/app/usuarios/
// actions.ts): cria a identidade em auth.users via Admin API (fora do
// escopo do RLS/RPC) e só então chama a função SQL testada.
async function criarUsuario(tenant, emailPrefix, loginIdentifier) {
  const email = `${emailPrefix}.${tenant.company.slug}@users.internal`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password: "senha-de-teste-123456", email_confirm: true,
  });
  if (createError) return { error: createError };

  const { error } = await tenant.client.rpc("criar_perfil_usuario", {
    p_auth_user_id: created.user.id,
    p_login_identifier: loginIdentifier,
    p_display_name: `Usuário ${loginIdentifier}`,
  });
  if (error) await admin.auth.admin.deleteUser(created.user.id); // mesma compensação do Server Action
  return { userId: created.user.id, error };
}

async function limparTenant(slug) {
  const { data: company } = await admin.from("companies").select("id").eq("slug", slug).maybeSingle();
  if (!company) return;
  const { data: profiles } = await admin.from("profiles").select("id").eq("company_id", company.id);
  for (const p of profiles ?? []) await admin.auth.admin.deleteUser(p.id);
}

async function main() {
  await limparTenant("t-limite-usuarios");
  await limparTenant("t-limite-ilimitado");

  console.log("Preparando tenants...");
  const tenant = await createTenant("t-limite-usuarios", "Limite Usuários Teste", "lim01", "ADMIN");
  const tenantIlimitado = await createTenant("t-limite-ilimitado", "Limite Ilimitado Teste", "ilim01", "ADMIN");

  console.log("\n1. Plano com max_users define o limite");
  {
    const { data: plan } = await admin
      .from("plans")
      .upsert({ key: "limite-usuarios-teste", name: "Limite Teste (2 usuários)", max_users: 2, max_storage_bytes: null, active: true }, { onConflict: "key" })
      .select()
      .single();
    await admin.from("subscriptions").upsert(
      { company_id: tenant.company.id, plan_id: plan.id, status: "active" },
      { onConflict: "company_id" },
    );

    // O ADMIN criado por createTenant já ocupa 1 das 2 vagas do plano.
    const { error: primeiroError } = await criarUsuario(tenant, "lim02", "op002");
    check("cria o 2º usuário (dentro do limite de 2)", !primeiroError);

    const { error: terceiroError } = await criarUsuario(tenant, "lim03", "op003");
    check("recusa o 3º usuário (limite de 2 atingido)", !!terceiroError);
    check("mensagem de erro menciona o limite do plano", terceiroError?.message?.includes("Limite de usuários do plano"));

    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", tenant.company.id).eq("active", true);
    check("permanece com exatamente 2 usuários ativos (3º não foi criado)", count === 2);
  }

  console.log("\n2. Desativar um usuário libera vaga no limite");
  {
    const { data: usuarios } = await admin.from("profiles").select("id").eq("company_id", tenant.company.id).eq("login_identifier", "op002").single();
    await tenant.client.rpc("desativar_usuario", { p_profile_id: usuarios.id, p_motivo: "teste" });

    const { error: novoError } = await criarUsuario(tenant, "lim04", "op004");
    check("após desativar um usuário, consegue criar outro dentro do limite", !novoError);
  }

  console.log("\n3. Plano sem max_users (null) não tem limite");
  {
    // Sem subscription/plano definido pra este tenant — mesmo default de
    // qualquer empresa sem plano explícito: null = ilimitado, nunca um
    // número inventado (comentário original de plans.max_users).
    for (let i = 2; i <= 5; i++) {
      const { error } = await criarUsuario(tenantIlimitado, `ilim0${i}`, `op00${i}`);
      check(`cria usuário #${i} sem limite configurado`, !error);
    }
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
