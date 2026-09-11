// Testa as duas pendências resolvidas nesta rodada: MFA obrigatório para
// platform_admins (ADR-001 §26) e troca de senha forçada.
// Uso: set -a; source .env.local; set +a; node scripts/test-mfa-and-password.mjs

import { createClient } from "@supabase/supabase-js";
import { authenticator } from "otplib";

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

async function signIn(email, password) {
  const client = createClient(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function main() {
  console.log("--- MFA obrigatório para platform_admins ---");
  const email = `mfa-test-${Date.now()}@saas-vidracaria.internal`;
  const password = "senha-de-teste-123456";

  const { data: created } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  await admin.from("platform_admins").insert({ id: created.user.id, role: "SUPER_ADMIN" });

  const client = await signIn(email, password);

  const { data: isPlatformAdmin } = await client.rpc("is_platform_admin");
  check("usuário é reconhecido como platform_admin", isPlatformAdmin === true);

  const { data: aalBefore } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  check("sessão começa em aal1 (sem MFA)", aalBefore.currentLevel === "aal1");

  const { data: factorsBefore } = await client.auth.mfa.listFactors();
  check("nenhum fator verificado antes do enrollment", (factorsBefore.totp ?? []).every((f) => f.status !== "verified"));

  const { data: enrollment, error: enrollError } = await client.auth.mfa.enroll({ factorType: "totp" });
  if (enrollError) console.error("  (debug) enroll error:", enrollError);
  check("enroll() cria um fator TOTP com segredo", !enrollError && !!enrollment?.totp?.secret);
  if (!enrollment) {
    console.log(`\nResultado parcial: ${passed} passaram, ${failed} falharam.`);
    process.exit(1);
  }

  const code = authenticator.generate(enrollment.totp.secret);
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId: enrollment.id });
  check("challenge() gera um desafio", !challengeError && !!challenge.id);

  const { error: verifyError } = await client.auth.mfa.verify({
    factorId: enrollment.id,
    challengeId: challenge.id,
    code,
  });
  check("verify() aceita o código gerado a partir do segredo real", !verifyError);

  const { data: aalAfter } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  check("sessão sobe para aal2 após verificação", aalAfter.currentLevel === "aal2");

  const { data: factorsAfter } = await client.auth.mfa.listFactors();
  check("fator aparece como verificado", (factorsAfter.totp ?? []).some((f) => f.status === "verified"));

  console.log("\n--- Troca de senha obrigatória ---");
  const tenantEmail = `pwd-test-${Date.now()}@users.internal`;
  const tenantPassword = "senha-temporaria-123456";

  const { data: company } = await admin
    .from("companies")
    .upsert({ slug: `pwd-test-${Date.now()}`, name: "Empresa Teste Senha" })
    .select()
    .single();
  const { data: tenantUser } = await admin.auth.admin.createUser({
    email: tenantEmail,
    password: tenantPassword,
    email_confirm: true,
  });
  await admin.from("profiles").insert({
    id: tenantUser.user.id,
    company_id: company.id,
    login_identifier: "0001",
    display_name: "Usuário Teste",
    must_change_password: true,
  });

  const tenantClient = await signIn(tenantEmail, tenantPassword);

  const { data: profileBefore } = await admin
    .from("profiles")
    .select("must_change_password")
    .eq("id", tenantUser.user.id)
    .single();
  check("profile começa com must_change_password = true", profileBefore.must_change_password === true);

  const { error: updatePasswordError } = await tenantClient.auth.updateUser({ password: "nova-senha-bem-forte-999" });
  check("usuário consegue trocar a própria senha", !updatePasswordError);

  const { error: rpcError } = await tenantClient.rpc("complete_password_change");
  check("complete_password_change() executa sem erro", !rpcError);

  const { data: profileAfter } = await admin
    .from("profiles")
    .select("must_change_password")
    .eq("id", tenantUser.user.id)
    .single();
  check("must_change_password volta para false após a troca", profileAfter.must_change_password === false);

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
