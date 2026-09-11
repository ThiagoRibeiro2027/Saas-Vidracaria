// Cria uma empresa + um usuário ADMIN de teste no Supabase local.
// Uso: set -a; source .env.local; set +a; node scripts/seed-dev-tenant.mjs
//
// Login gerado por matrícula (sem e-mail obrigatório, conforme ADR-001 /
// Tópico 14): o Supabase Auth recebe um e-mail sintético interno, mas o
// usuário só precisa saber Empresa + Matrícula + Senha (decisão registrada
// na Auditoria Fase 1, item 02).

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const COMPANY_SLUG = "jrbox";
const COMPANY_NAME = "JR Box";
const LOGIN_IDENTIFIER = "0001";
const PASSWORD = "trocar-no-primeiro-acesso-123";
const SYNTHETIC_EMAIL = `${LOGIN_IDENTIFIER}.${COMPANY_SLUG}@users.internal`;

async function main() {
  const { data: company, error: companyError } = await admin
    .from("companies")
    .upsert({ slug: COMPANY_SLUG, name: COMPANY_NAME }, { onConflict: "slug" })
    .select()
    .single();
  if (companyError) throw companyError;

  const { data: created, error: userError } =
    await admin.auth.admin.createUser({
      email: SYNTHETIC_EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
  if (userError && !userError.message.includes("already been registered")) {
    throw userError;
  }

  let userId = created?.user?.id;
  if (!userId) {
    const { data: list, error: listError } =
      await admin.auth.admin.listUsers();
    if (listError) throw listError;
    userId = list.users.find((u) => u.email === SYNTHETIC_EMAIL)?.id;
  }
  if (!userId) throw new Error("Não foi possível localizar/criar o usuário.");

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      company_id: company.id,
      login_identifier: LOGIN_IDENTIFIER,
      display_name: "Administrador JR Box",
      must_change_password: true, // senha de bootstrap é temporária
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  const { data: adminRole, error: roleError } = await admin
    .from("roles")
    .select("id")
    .is("company_id", null)
    .eq("key", "ADMIN")
    .single();
  if (roleError) throw roleError;

  const { data: existingUserRole, error: existingUserRoleError } = await admin
    .from("user_roles")
    .select("id")
    .eq("profile_id", userId)
    .eq("role_id", adminRole.id)
    .is("valid_until", null)
    .maybeSingle();
  if (existingUserRoleError) throw existingUserRoleError;

  if (!existingUserRole) {
    const { error: userRoleError } = await admin
      .from("user_roles")
      .insert({ profile_id: userId, role_id: adminRole.id });
    if (userRoleError) throw userRoleError;
  }

  // Assinatura (Fase 6 / ADR-006 §3.2): JR Box já está operacional no
  // piloto (ADR-003), então entra direto em "active" — sem trial, já que a
  // duração de trial é uma decisão comercial ainda não tomada (ADR-006).
  // Plano "piloto" é um placeholder sem limites, não uma definição comercial.
  const { data: pilotPlan, error: planError } = await admin
    .from("plans")
    .select("id")
    .eq("key", "piloto")
    .single();
  if (planError) throw planError;

  await admin.from("subscriptions").upsert(
    { company_id: company.id, plan_id: pilotPlan.id, status: "active" },
    { onConflict: "company_id" },
  );

  console.log("Tenant de teste criado com sucesso:");
  console.log(`  Empresa (slug): ${COMPANY_SLUG}`);
  console.log(`  Matrícula:      ${LOGIN_IDENTIFIER}`);
  console.log(`  Senha:          ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
