// Testes automatizados da Fase 6 — SaaS Governance (ADR-006 + Prompt Mestre
// itens 22-24): isolamento de planos/assinaturas, transição de status
// restrita a platform_admin, bloqueio de escrita quando suspensa (política
// definida pelo responsável do produto: bloqueia escrita, mantém leitura),
// e o cálculo de consumo.
//
// A tela /export (Next.js) não é exercitável por este script — foi
// validada manualmente na UI, mesmo padrão já usado nas fases anteriores
// para fluxos que vivem no código do Next.js em vez de RPC de banco.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-governance.mjs

import { createClient } from "@supabase/supabase-js";
import { authenticator } from "otplib";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = "company-files";

// PNG 1x1 válido (assinatura real), mesmo buffer de test-storage-rls.mjs.
// Auditoria 15/09/2026 (F02): register_file() passou a ler o tamanho real
// do objeto em storage.objects em vez de confiar em p_size_bytes — os
// testes abaixo precisam de um upload real no Storage antes de chamar
// register_file(), não só um caminho sintético.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

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

async function createTenant(slug, name, identifier) {
  const { data: company, error: companyError } = await admin
    .from("companies")
    .upsert({ slug, name }, { onConflict: "slug" })
    .select()
    .single();
  if (companyError) throw companyError;

  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }
  if (!userId) throw userError ?? new Error("usuário não criado");

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
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { client, company, userId };
}

async function main() {
  console.log("Preparando dois tenants de teste (gov-a, gov-b)...");
  const tenantA = await createTenant("gov-a-test", "Governance A Teste", "9301");
  const tenantB = await createTenant("gov-b-test", "Governance B Teste", "9302");
  // Declarado aqui (fora do bloco da seção 2) para poder ser reaproveitado,
  // já com MFA (aal2) verificado, na seção 4.
  let platformClient;

  const { data: pilotPlan } = await admin.from("plans").select("id").eq("key", "piloto").single();
  await admin
    .from("subscriptions")
    .upsert({ company_id: tenantA.company.id, plan_id: pilotPlan.id, status: "active" }, { onConflict: "company_id" });
  await admin
    .from("subscriptions")
    .upsert({ company_id: tenantB.company.id, plan_id: pilotPlan.id, status: "active" }, { onConflict: "company_id" });

  console.log("\n1. Isolamento — plans e subscriptions");
  {
    const { data: plans } = await tenantA.client.from("plans").select("id");
    check("catálogo de planos é legível (global)", (plans ?? []).length > 0);

    const { data: ownSub } = await tenantA.client.from("subscriptions").select("company_id");
    check(
      "tenant A vê só a própria assinatura",
      ownSub?.length === 1 && ownSub[0].company_id === tenantA.company.id,
    );

    const { data: crossSub } = await tenantA.client
      .from("subscriptions")
      .select("id")
      .eq("company_id", tenantB.company.id);
    check("tenant A não enxerga a assinatura do tenant B", (crossSub ?? []).length === 0);

    const { error: directInsertError } = await tenantA.client
      .from("subscriptions")
      .update({ status: "active" })
      .eq("company_id", tenantA.company.id);
    check("tenant não consegue alterar a própria assinatura direto (só via função)", !!directInsertError);
  }

  console.log("\n2. transition_subscription() — só platform_admin");
  {
    const { error: tenantAttemptError } = await tenantA.client.rpc("transition_subscription", {
      p_company_id: tenantA.company.id,
      p_new_status: "suspended",
    });
    check("tenant comum não consegue transicionar a própria assinatura", !!tenantAttemptError);

    // Cria um platform_admin de teste para exercer o caminho permitido.
    const platformEmail = `governance-admin-${Date.now()}@saas-vidracaria.internal`;
    const platformPassword = "senha-plataforma-teste-123456";
    const { data: createdAdmin } = await admin.auth.admin.createUser({
      email: platformEmail,
      password: platformPassword,
      email_confirm: true,
    });
    await admin.from("platform_admins").insert({ id: createdAdmin.user.id, role: "SUPER_ADMIN" });
    platformClient = createClient(url, anonKey);
    await platformClient.auth.signInWithPassword({ email: platformEmail, password: platformPassword });

    // Security Gate Fase 8 (SEC-001): transition_subscription() agora exige
    // is_platform_admin_mfa_verified() — em aal1 (antes do MFA), mesmo um
    // platform_admin de verdade deve ser recusado.
    const { error: adminAal1Error } = await platformClient.rpc("transition_subscription", {
      p_company_id: tenantA.company.id,
      p_new_status: "suspended",
      p_reason: "teste automatizado (aal1, deve falhar)",
    });
    check("platform_admin em aal1 (sem MFA) não consegue transicionar assinatura", !!adminAal1Error);

    const { data: enrollment } = await platformClient.auth.mfa.enroll({ factorType: "totp" });
    const code = authenticator.generate(enrollment.totp.secret);
    const { data: challenge } = await platformClient.auth.mfa.challenge({ factorId: enrollment.id });
    await platformClient.auth.mfa.verify({ factorId: enrollment.id, challengeId: challenge.id, code });

    const { error: adminTransitionError } = await platformClient.rpc("transition_subscription", {
      p_company_id: tenantA.company.id,
      p_new_status: "suspended",
      p_reason: "teste automatizado",
    });
    check("platform_admin em aal2 consegue transicionar a assinatura", !adminTransitionError);

    const { data: afterTransition } = await admin
      .from("subscriptions")
      .select("status, suspended_at")
      .eq("company_id", tenantA.company.id)
      .single();
    check("status foi persistido como suspended", afterTransition?.status === "suspended");
    check("suspended_at foi preenchido", !!afterTransition?.suspended_at);

    const { data: transitionLog } = await admin
      .from("activity_logs")
      .select("id")
      .eq("company_id", tenantA.company.id)
      .eq("action", "governance.subscription_transitioned")
      .limit(1);
    check("transição de status foi auditada", (transitionLog ?? []).length > 0);
  }

  console.log("\n3. Política de suspensão — bloqueia escrita, mantém leitura");
  {
    // Sufixo único por execução: register_file() grava um metadado real
    // para o upload bem-sucedido abaixo, e a constraint de unicidade em
    // storage_path tornaria o script não-idempotente entre rodadas sem
    // reset do banco (mesmo cuidado já tomado em test-storage-rls.mjs).
    const runId = crypto.randomUUID();
    const { error: uploadError } = await tenantA.client.rpc("register_file", {
      p_entity_type: "geral",
      p_entity_id: null,
      p_storage_path: `${tenantA.company.id}/geral/geral/${runId}-deveria-falhar.png`,
      p_original_name: "deveria-falhar.png",
      p_mime_type: "image/png",
      p_size_bytes: 100,
    });
    check("empresa suspensa não consegue registrar novo arquivo", !!uploadError);

    // Security Gate Fase 8 (SEC-007): antes, assert_company_not_suspended()
    // só era chamado por register_file() — upsert_pessoa/upsert_obra/
    // upsert_item/set_pessoa_papel (TÓPICO 2) ficavam de fora.
    const { error: pessoaError } = await tenantA.client.rpc("upsert_pessoa", {
      p_id: null,
      p_tipo_documento: null,
      p_documento: null,
      p_nome: "Pessoa Durante Suspensão",
      p_nome_fantasia: null,
      p_telefone: null,
      p_email: null,
      p_logradouro: null,
      p_cidade: null,
      p_uf: null,
      p_cep: null,
    });
    check("empresa suspensa não consegue cadastrar pessoa (SEC-007)", !!pessoaError);

    const { error: readError } = await tenantA.client.from("files").select("id");
    check("empresa suspensa ainda consegue ler seus próprios dados", !readError);

    // Reativa para não deixar o tenant de teste travado para outras execuções.
    await admin.from("subscriptions").update({ status: "active" }).eq("company_id", tenantA.company.id);

    const pathDepoisReativacao = `${tenantA.company.id}/geral/geral/${runId}-deveria-passar.png`;
    await tenantA.client.storage.from(BUCKET).upload(pathDepoisReativacao, PNG_1X1, { contentType: "image/png" });
    const { error: uploadAfterReactivation } = await tenantA.client.rpc("register_file", {
      p_entity_type: "geral",
      p_entity_id: null,
      p_storage_path: pathDepoisReativacao,
      p_original_name: "deveria-passar.png",
      p_mime_type: "image/png",
      p_size_bytes: PNG_1X1.byteLength,
    });
    check("após reativação, empresa volta a conseguir registrar arquivo", !uploadAfterReactivation);
  }

  console.log("\n4. company_usage() — consumo e isolamento");
  {
    const { data: ownUsage, error: ownUsageError } = await tenantA.client.rpc("company_usage");
    check("tenant consegue consultar o próprio consumo", !ownUsageError && ownUsage?.[0]?.company_id === tenantA.company.id);
    check("consumo reflete ao menos 1 usuário (o próprio)", (ownUsage?.[0]?.user_count ?? 0) >= 1);

    const { error: crossUsageError } = await tenantA.client.rpc("company_usage", {
      p_company_id: tenantB.company.id,
    });
    check("tenant não consegue consultar consumo de outra empresa", !!crossUsageError);

    // platformClient já verificou MFA (aal2) na seção 2 — company_usage()
    // também usa is_platform_admin_mfa_verified() para o bypass cross-tenant.
    const { data: adminUsage, error: adminUsageError } = await platformClient.rpc("company_usage", {
      p_company_id: tenantB.company.id,
    });
    check(
      "platform_admin em aal2 consegue consultar consumo de outra empresa",
      !adminUsageError && adminUsage?.[0]?.company_id === tenantB.company.id,
    );
  }

  console.log("\n4.5. Quota de storage é aplicada, não só monitorada (SEC-012)");
  {
    const { data: quotaPlan } = await admin
      .from("plans")
      .upsert(
        { key: "quota-test", name: "Quota Teste (Security Gate Fase 8)", max_users: null, max_storage_bytes: 500, active: true },
        { onConflict: "key" },
      )
      .select()
      .single();
    // Reaproveita a assinatura do tenant B (não é mais usado depois desta
    // seção) trocando pro plano com limite baixo.
    await admin.from("subscriptions").update({ plan_id: quotaPlan.id }).eq("company_id", tenantB.company.id);

    const runId = crypto.randomUUID();

    // Auditoria 15/09/2026 (F02): register_file() usa o tamanho real do
    // objeto no Storage, não mais p_size_bytes — o buffer "estoura-quota"
    // precisa ter, de fato, mais de 500 bytes reais (limite do plano acima).
    const pathEstouraQuota = `${tenantB.company.id}/geral/geral/${runId}-estoura-quota.png`;
    await tenantB.client.storage
      .from(BUCKET)
      .upload(pathEstouraQuota, Buffer.alloc(600, "x"), { contentType: "application/octet-stream" });
    const { error: overQuotaError } = await tenantB.client.rpc("register_file", {
      p_entity_type: "geral",
      p_entity_id: null,
      p_storage_path: pathEstouraQuota,
      p_original_name: "estoura-quota.png",
      p_mime_type: "image/png",
      p_size_bytes: 600,
    });
    check("upload que estouraria a quota do plano é rejeitado (SEC-012)", !!overQuotaError);

    const pathDentroQuota = `${tenantB.company.id}/geral/geral/${runId}-dentro-da-quota.png`;
    await tenantB.client.storage.from(BUCKET).upload(pathDentroQuota, PNG_1X1, { contentType: "image/png" });
    const { error: withinQuotaError } = await tenantB.client.rpc("register_file", {
      p_entity_type: "geral",
      p_entity_id: null,
      p_storage_path: pathDentroQuota,
      p_original_name: "dentro-da-quota.png",
      p_mime_type: "image/png",
      p_size_bytes: PNG_1X1.byteLength,
    });
    check("upload dentro da quota continua funcionando", !withinQuotaError);
  }

  console.log("\n5. Permissão de exportação existe e está no template ADMIN");
  {
    const { data: perm } = await admin
      .from("permissions")
      .select("id")
      .eq("resource", "export")
      .eq("action", "company_data")
      .single();
    check("permissão export.company_data existe no catálogo", !!perm);

    const { data: adminRole } = await admin.from("roles").select("id").is("company_id", null).eq("key", "ADMIN").single();
    const { data: grant } = await admin
      .from("role_permissions")
      .select("role_id")
      .eq("role_id", adminRole.id)
      .eq("permission_id", perm.id)
      .maybeSingle();
    check("template ADMIN tem a permissão de exportação", !!grant);

    const { data: canExport } = await tenantA.client.rpc("has_permission", {
      p_resource: "export",
      p_action: "company_data",
    });
    check("usuário ADMIN de tenant tem permissão de exportação", canExport === true);
  }

  console.log("\n6. system_events — observabilidade técnica (F23, auditoria 15/09/2026)");
  {
    const { error: tenantLogError } = await tenantA.client.rpc("log_system_event", {
      p_category: "storage_failure",
      p_message: "teste automatizado",
    });
    check("usuário de tenant consegue registrar um system_event (função aceita authenticated)", !tenantLogError);

    const { error: invalidCategoryError } = await tenantA.client.rpc("log_system_event", {
      p_category: "categoria_inventada",
      p_message: "não deveria passar",
    });
    check(
      "category fora do enum fechado é rejeitada (item 8 do CLAUDE.md — sem 'action' livre)",
      !!invalidCategoryError,
    );

    const { data: tenantReadAttempt } = await tenantA.client.from("system_events").select("id");
    check("usuário de tenant não consegue ler system_events (só platform_admin)", (tenantReadAttempt ?? []).length === 0);

    const { data: adminRead, error: adminReadError } = await platformClient
      .from("system_events")
      .select("id, category, message")
      .eq("message", "teste automatizado");
    check(
      "platform_admin em aal2 consegue ler system_events",
      !adminReadError && (adminRead ?? []).length > 0,
    );
  }

  console.log("\n7. Trilha de acesso de suporte do platform_admin (F24, auditoria 15/09/2026)");
  {
    const { error: tenantAccessLogError } = await tenantA.client.rpc("log_platform_admin_access", {
      p_view: "teste-nao-deveria-funcionar",
    });
    check("usuário de tenant não consegue registrar acesso de suporte", !!tenantAccessLogError);

    const { error: adminAccessLogError } = await platformClient.rpc("log_platform_admin_access", {
      p_view: "governance.platform_admin_view",
      p_context: { origem: "teste automatizado" },
    });
    check("platform_admin em aal2 registra a trilha de acesso de suporte", !adminAccessLogError);

    const { data: trailRow } = await admin
      .from("activity_logs")
      .select("id, company_id, action")
      .eq("action", "platform.support_access")
      .is("company_id", null)
      .order("created_at", { ascending: false })
      .limit(1);
    check(
      "trilha fica registrada em activity_logs com company_id nulo (evento de plataforma, não de tenant)",
      trailRow?.[0]?.action === "platform.support_access",
    );
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
