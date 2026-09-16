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

  // Security Gate Fase 8 (SEC-001): is_platform_admin() continua reconhecendo
  // a identidade em aal1 (o middleware depende disso pra redirecionar a
  // /mfa/enroll), mas nenhuma policy/permissão privilegiada deve ser
  // concedida antes do AAL2 — is_platform_admin_mfa_verified() é o gate real.
  const { data: mfaVerifiedAal1 } = await client.rpc("is_platform_admin_mfa_verified");
  check("is_platform_admin_mfa_verified() nega em aal1 (Data API direta)", mfaVerifiedAal1 === false);

  // Efeito real na RLS (não só o booleano da função): em aal1, a policy
  // cross-tenant de companies_select não deve devolver empresas de outro
  // tenant, mesmo para um platform_admin autenticado.
  const { data: foreignCompany } = await admin
    .from("companies")
    .upsert({ slug: `mfa-gate-test-${Date.now()}`, name: "Empresa Alheia (MFA Gate)" }, { onConflict: "slug" })
    .select()
    .single();
  const { data: crossTenantAal1 } = await client.from("companies").select("id").eq("id", foreignCompany.id);
  check("platform_admin em aal1 não enxerga empresa de outro tenant via RLS", (crossTenantAal1 ?? []).length === 0);

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

  const { data: mfaVerifiedAal2 } = await client.rpc("is_platform_admin_mfa_verified");
  check("is_platform_admin_mfa_verified() permite em aal2 (Data API direta)", mfaVerifiedAal2 === true);

  const { data: crossTenantAal2 } = await client.from("companies").select("id").eq("id", foreignCompany.id);
  check("platform_admin em aal2 enxerga empresa de outro tenant via RLS", crossTenantAal2?.[0]?.id === foreignCompany.id);

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

  // F16 (Mapa_Fases_Lacunas_Risco.md, 15/09/2026): antes deste ajuste,
  // minimum_password_length no GoTrue era 6 enquanto a tela exigia 10 — a
  // proteção real dependia só do formulário. Chama updateUser() direto
  // (ignorando src/app/change-password/actions.ts) pra confirmar que a
  // própria Auth API agora rejeita abaixo do mínimo real.
  const { error: shortPasswordError } = await tenantClient.auth.updateUser({ password: "curta123" });
  check(
    "Auth API (GoTrue) rejeita senha de 8 caracteres, mesmo chamada direto (sem passar pela tela)",
    !!shortPasswordError,
  );

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
