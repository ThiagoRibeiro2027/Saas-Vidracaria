// Testes automatizados do changelog do sistema (migration 20261017111740):
// leitura global (qualquer usuário autenticado, de qualquer empresa) e
// escrita restrita a platform admin com MFA verificado
// (is_platform_admin_mfa_verified()) — mesmo gate já usado em
// transition_company_status/transition_subscription.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-atualizacoes-sistema.mjs

import "./lib/somente-local.mjs";
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
function check(label, condition, extra) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`, extra ?? "");
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

// Platform admin, opcionalmente já com MFA verificado (aal2) — mesmo padrão
// de scripts/test-governance.mjs.
async function criarPlatformAdmin(prefixo, { comMfa }) {
  const email = `${prefixo}-${Date.now()}@saas-vidracaria.internal`;
  const password = "senha-plataforma-teste-123456";
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  await admin.from("platform_admins").insert({ id: created.user.id, role: "SUPER_ADMIN" });

  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });

  if (comMfa) {
    const { data: enrollment } = await client.auth.mfa.enroll({ factorType: "totp" });
    const code = authenticator.generate(enrollment.totp.secret);
    const { data: challenge } = await client.auth.mfa.challenge({ factorId: enrollment.id });
    await client.auth.mfa.verify({ factorId: enrollment.id, challengeId: challenge.id, code });
  }

  return { client, userId: created.user.id };
}

async function main() {
  console.log("Preparando tenants e platform admins de teste...");
  const tenant = await createTenant("atualizacoes-sistema-admin", "Atualizações Sistema Teste", "atu01", "ADMIN");
  const platformSemMfa = await criarPlatformAdmin("atu-admin-sem-mfa", { comMfa: false });
  const platformComMfa = await criarPlatformAdmin("atu-admin-com-mfa", { comMfa: true });

  console.log("\n1. Gate de escrita — só platform admin COM MFA verificado publica");
  {
    const { error: erroTenant } = await tenant.client.rpc("criar_atualizacao_sistema", {
      p_titulo: "Tentativa de usuário comum", p_descricao: "não deveria passar", p_publicado_em: null,
    });
    check("ADMIN de empresa cliente não publica atualização", !!erroTenant);

    const { error: erroSemMfa } = await platformSemMfa.client.rpc("criar_atualizacao_sistema", {
      p_titulo: "Tentativa sem MFA", p_descricao: "não deveria passar", p_publicado_em: null,
    });
    check("platform admin SEM MFA verificado não publica (aal1 recusado)", !!erroSemMfa);
  }

  console.log("\n2. Criar, ler, editar e remover — platform admin com MFA");
  let idCriado;
  {
    const { data, error } = await platformComMfa.client.rpc("criar_atualizacao_sistema", {
      p_titulo: "Fila de Produção ganhou visão em cards",
      p_descricao: "Agora dá pra ver os pedidos organizados por etapa, com prioridade ajustável.",
      p_publicado_em: "2026-10-16",
    });
    check("platform admin com MFA publica atualização sem erro", !error, error);
    idCriado = data;

    const { data: titulos, error: tituloErr } = await platformComMfa.client.rpc("criar_atualizacao_sistema", {
      p_titulo: "", p_descricao: "x", p_publicado_em: null,
    });
    check("título vazio é rejeitado", !!tituloErr && !titulos);
  }

  console.log("\n3. Leitura é global — qualquer usuário autenticado vê, não só quem publicou");
  {
    const { data, error } = await tenant.client.from("atualizacoes_sistema").select("id, titulo, descricao, publicado_em").eq("id", idCriado);
    check("ADMIN de empresa cliente lê a atualização publicada", !error && data?.length === 1, { error, data });
  }

  console.log("\n4. Editar — só platform admin com MFA");
  {
    const { error: erroTenant } = await tenant.client.rpc("editar_atualizacao_sistema", {
      p_id: idCriado, p_titulo: "Tentativa indevida", p_descricao: "x", p_publicado_em: "2026-10-16",
    });
    check("ADMIN de empresa cliente não edita", !!erroTenant);

    const { error } = await platformComMfa.client.rpc("editar_atualizacao_sistema", {
      p_id: idCriado,
      p_titulo: "Fila de Produção ganhou visão em cards (atualizado)",
      p_descricao: "Texto revisado.",
      p_publicado_em: "2026-10-16",
    });
    check("platform admin com MFA edita sem erro", !error, error);

    const { data } = await admin.from("atualizacoes_sistema").select("titulo").eq("id", idCriado).single();
    check("título refletiu a edição", data?.titulo === "Fila de Produção ganhou visão em cards (atualizado)", data);
  }

  console.log("\n5. Remover (soft delete) — some da listagem, mas não da tabela");
  {
    const { error: erroTenant } = await tenant.client.rpc("remover_atualizacao_sistema", { p_id: idCriado });
    check("ADMIN de empresa cliente não remove", !!erroTenant);

    const { error } = await platformComMfa.client.rpc("remover_atualizacao_sistema", { p_id: idCriado });
    check("platform admin com MFA remove sem erro", !error, error);

    const { data: viaClienteComum } = await tenant.client.from("atualizacoes_sistema").select("id").eq("id", idCriado);
    check("atualização removida não aparece mais na leitura", (viaClienteComum ?? []).length === 0);

    const { data: viaServiceRole } = await admin.from("atualizacoes_sistema").select("deleted_at").eq("id", idCriado).single();
    check("linha continua existindo na tabela, só com deleted_at preenchido (soft delete)", !!viaServiceRole?.deleted_at);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
