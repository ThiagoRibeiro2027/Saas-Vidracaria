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
import { authenticator } from "otplib";

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

// createPlatformAdmin(identifier) é chamada várias vezes com o MESMO
// identifier neste arquivo (o mesmo platform_admin precisa aparecer em mais
// de uma seção) — cada chamada cria um client/sessão novo, então precisa
// subir para aal2 de novo a cada vez. Reenrollar TOTP do zero a cada
// chamada, porém, cria um fator novo sobre um usuário que já tem um fator
// verificado da chamada anterior — cacheia o segredo por e-mail e reusa o
// fator já verificado (challenge/verify), só enrollando na primeira vez.
const platformAdminTotpSecrets = new Map();

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

  // Security Gate Fase 8 (SEC-001): anonymize_activity_logs_for_user() agora
  // exige is_platform_admin_mfa_verified() (aal2) — sem isso, mesmo um
  // platform_admin de verdade é recusado pela função. Sobe para aal2 aqui
  // para que os testes de "caminho permitido" continuem exercendo o que
  // pretendem testar (restrição de papel), não o gate de MFA.
  const { data: factors } = await client.auth.mfa.listFactors();
  const verifiedFactor = (factors?.totp ?? []).find((f) => f.status === "verified");
  const cachedSecret = platformAdminTotpSecrets.get(email);

  let factorId;
  let secret;
  if (verifiedFactor && cachedSecret) {
    factorId = verifiedFactor.id;
    secret = cachedSecret;
  } else {
    const { data: enrollment } = await client.auth.mfa.enroll({ factorType: "totp" });
    factorId = enrollment.id;
    secret = enrollment.totp.secret;
    platformAdminTotpSecrets.set(email, secret);
  }

  const code = authenticator.generate(secret);
  const { data: challenge } = await client.auth.mfa.challenge({ factorId });
  await client.auth.mfa.verify({ factorId, challengeId: challenge.id, code });

  return { client, userId };
}

async function main() {
  console.log("Preparando tenant e log de teste...");
  const tenant = await createTenant("lgpd-anon-test", "LGPD Anon Teste", "9401");

  const { data: logId } = await tenant.client.rpc("log_client_event", {
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

    const { data: anonEvents } = await admin
      .from("activity_logs")
      .select("id, action, entity_id, description")
      .eq("action", "lgpd.activity_logs_anonymized")
      .eq("entity_id", tenant.userId)
      .order("created_at", { ascending: false })
      .limit(1);
    // .maybeSingle() quebraria em reexecuções do script (tenant reaproveitado
    // via upsert por slug acumula um evento de anonimização por rodada) —
    // pegar só o mais recente é o que importa para esta asserção.
    check("a anonimização em si ficou registrada na trilha de auditoria", (anonEvents ?? []).length === 1);
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

  console.log(
    "\n7. Extensão ADR-010 §6 (Security Gate Fase 8, item 2.2) — profiles e auth.users",
  );
  {
    const subject = await createTenant("lgpd-profile-test", "LGPD Profile Teste", "9403");
    const originalEmail = `9403.lgpd-profile-test@users.internal`;

    // FK estrutural que referencia o titular por fora de activity_logs —
    // exatamente o que este item resolve (files.uploaded_by/deleted_by
    // continuam apontando pro mesmo UUID depois da anonimização).
    const PNG_1X1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const storagePath = `${subject.company.id}/geral/geral/${crypto.randomUUID()}-lgpd-profile.png`;
    // F01 (auditoria 15/09/2026, migration 20260915040000): storage.objects
    // não aceita mais escrita direta de `authenticated` — fixture via
    // service role, como src/lib/storage/upload.ts faz na aplicação real.
    await admin.storage
      .from("company-files")
      .upload(storagePath, PNG_1X1, { contentType: "image/png" });
    const { data: fileId } = await subject.client.rpc("register_file", {
      p_entity_type: "geral",
      p_entity_id: null,
      p_storage_path: storagePath,
      p_original_name: "lgpd-profile.png",
      p_mime_type: "image/png",
      p_size_bytes: PNG_1X1.byteLength,
      p_width: 1,
      p_height: 1,
    });

    const platformAdmin = await createPlatformAdmin("9402");
    const { error: anonError } = await platformAdmin.client.rpc(
      "anonymize_activity_logs_for_user",
      { p_user_id: subject.userId, p_reason: "titular pediu exclusão — teste automatizado" },
    );
    check("RPC de anonimização aceita o pedido", !anonError);

    // Passo que o Postgres não alcança sozinho (ADR-010 comentário na
    // migration 20260913090000): e-mail em auth.users só muda via Admin API.
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(subject.userId, {
      email: `anon-${subject.userId}@anonimizado.invalid`,
      email_confirm: true,
    });
    check("Admin API aceita a troca do e-mail em auth.users", !authUpdateError);

    console.log("\n  7.1 profiles não retém mais o dado original");
    {
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name, contact_email, login_identifier")
        .eq("id", subject.userId)
        .single();
      check("display_name não é mais o original", profile.display_name !== "LGPD Profile Teste");
      check("contact_email foi removido", profile.contact_email === null);
      check("login_identifier não é mais o original", profile.login_identifier !== "9403");
    }

    console.log("\n  7.2 FK estrutural (files) continua íntegra, mas o join não expõe identidade original");
    {
      // files.uploaded_by referencia auth.users(id), não public.profiles(id)
      // diretamente — sem FK direta entre as duas tabelas para o PostgREST
      // embutir automaticamente, então o "join" aqui é feito manualmente
      // (é exatamente o que qualquer código de aplicação precisaria fazer).
      const { data: file } = await admin
        .from("files")
        .select("id, uploaded_by")
        .eq("id", fileId)
        .single();
      check("files.uploaded_by continua apontando para o mesmo UUID do titular", file.uploaded_by === subject.userId);

      const { data: joinedProfile } = await admin
        .from("profiles")
        .select("display_name, contact_email, login_identifier")
        .eq("id", file.uploaded_by)
        .single();
      check(
        "join files -> profiles não expõe mais nome/e-mail/identificador originais",
        joinedProfile.display_name === "Titular anonimizado" &&
          joinedProfile.contact_email === null &&
          joinedProfile.login_identifier !== "9403",
      );
    }

    console.log("\n  7.3 login do titular anonimizado deixa de funcionar com as credenciais antigas");
    {
      const freshClient = createClient(url, anonKey);
      const { error: loginError } = await freshClient.auth.signInWithPassword({
        email: originalEmail,
        password: "senha-de-teste-123456",
      });
      check(
        "login com o e-mail original passa a falhar (esperado — e-mail não existe mais em auth.users)",
        !!loginError,
      );
    }
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
