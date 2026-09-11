// Cria um SUPER_ADMIN de plataforma de teste (tabela platform_admins,
// nunca profiles — separação exigida pelo ADR-001 §6-8).
// Uso: set -a; source .env.local; set +a; node scripts/seed-platform-admin.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = "plataforma@saas-vidracaria.internal";
const PASSWORD = "senha-plataforma-teste-123456";

async function main() {
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === EMAIL)?.id;
  }
  if (!userId) throw userError ?? new Error("usuário não criado");

  const { error } = await admin
    .from("platform_admins")
    .upsert({ id: userId, role: "SUPER_ADMIN" }, { onConflict: "id" });
  if (error) throw error;

  console.log("Platform admin de teste criado:");
  console.log(`  E-mail: ${EMAIL}`);
  console.log(`  Senha:  ${PASSWORD}`);
  console.log("  (login pela tela normal — o campo Empresa não se aplica a admin de plataforma; ver pendência de UI dedicada)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
