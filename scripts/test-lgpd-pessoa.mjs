// Testes automatizados de anonimizar_pessoa() (20261011120500), achado da
// auditoria de gaps ADR-001 a ADR-012 (11/10/2026): o único mecanismo de
// anonimização LGPD existente (anonymize_activity_logs_for_user(), ADR-010
// §6) só atende titular que é usuário do sistema — um cliente/fornecedor/
// contato cadastrado em "pessoas" não tinha nenhum caminho de exclusão/
// anonimização, embora seja titular de dado pessoal do mesmo jeito
// (ADR-010 §3). Diferente da anonimização de activity_logs (restrita a
// platform_admin, porque é trilha de auditoria do próprio SaaS), esta é
// responsabilidade normal da controladora (ADR-010 §2) — o gate é
// pessoas.manage, igual a qualquer outra escrita em pessoas.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-lgpd-pessoa.mjs

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

async function createTenant(slug, name, identifier, roleKey) {
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

async function ultimoLog(companyId, action, entityId) {
  const { data } = await admin
    .from("activity_logs")
    .select("*")
    .eq("company_id", companyId)
    .eq("action", action)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function criarPessoa(companyId, nome) {
  const { data, error } = await admin
    .from("pessoas")
    .insert({
      company_id: companyId, tipo_documento: "CPF", documento: `${Date.now()}`.slice(-11),
      nome, telefone: "11999999999", email: "titular@example.com",
      logradouro: "Rua Teste, 123", cidade: "São Paulo", uf: "SP", cep: "01000-000",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão, outro tenant)...");
  const admTenant = await createTenant("t-lgpd-admin", "LGPD Admin Teste", "lgpd01", "ADMIN");
  const noPermTenant = await createTenant("t-lgpd-noperm", "LGPD SemPerm Teste", "lgpd02", "PRODUCAO");
  const otherTenant = await createTenant("t-lgpd-other", "LGPD Outro Teste", "lgpd03", "ADMIN");

  console.log("\n1. Gate de permissão e isolamento cross-tenant");
  {
    const pessoa = await criarPessoa(admTenant.company.id, "Cliente Teste Permissão");

    const { error: semPermError } = await noPermTenant.client.rpc("anonimizar_pessoa", {
      p_pessoa_id: pessoa.id, p_motivo: null,
    });
    check("usuário sem pessoas.manage não anonimiza", !!semPermError);

    const { error: crossTenantError } = await otherTenant.client.rpc("anonimizar_pessoa", {
      p_pessoa_id: pessoa.id, p_motivo: null,
    });
    check("tenant B não anonimiza pessoa do tenant A", !!crossTenantError);

    const { data: intacta } = await admin.from("pessoas").select("nome, anonymized_at").eq("id", pessoa.id).single();
    check("pessoa continua intacta após tentativas recusadas", intacta.nome === "Cliente Teste Permissão" && intacta.anonymized_at === null);
  }

  console.log("\n2. Anonimização bem-sucedida (ADMIN, pessoas.manage)");
  {
    const pessoa = await criarPessoa(admTenant.company.id, "Cliente Teste Sucesso");
    await admin.from("pessoa_papeis").insert({ pessoa_id: pessoa.id, papel: "CLIENTE", ativo: true });

    const { error } = await admTenant.client.rpc("anonimizar_pessoa", {
      p_pessoa_id: pessoa.id, p_motivo: "Pedido do titular por e-mail",
    });
    check("ADMIN anonimiza pessoa da própria empresa", !error);

    const { data: anonimizada } = await admin.from("pessoas").select("*").eq("id", pessoa.id).single();
    check("id da pessoa é preservado (não apaga a linha)", anonimizada.id === pessoa.id);
    check("nome vira o placeholder de anonimização", anonimizada.nome === "Titular de dados anonimizado");
    check("documento é limpo", anonimizada.documento === null);
    check("tipo_documento é limpo", anonimizada.tipo_documento === null);
    check("telefone é limpo", anonimizada.telefone === null);
    check("email é limpo", anonimizada.email === null);
    check("endereço é limpo", anonimizada.logradouro === null && anonimizada.cidade === null && anonimizada.uf === null && anonimizada.cep === null);
    check("anonymized_at é preenchido", !!anonimizada.anonymized_at);

    const { data: papelAindaLigado } = await admin.from("pessoa_papeis").select("*").eq("pessoa_id", pessoa.id).eq("papel", "CLIENTE").maybeSingle();
    check("papel CLIENTE continua ligado (histórico/relacionamento preservado)", !!papelAindaLigado);

    const log = await ultimoLog(admTenant.company.id, "lgpd.pessoa_anonimizada", pessoa.id);
    check("lgpd.pessoa_anonimizada registrado em activity_logs", !!log);
    check("motivo do pedido fica registrado no log", log?.description === "Pedido do titular por e-mail");

    const { error: repetirError } = await admTenant.client.rpc("anonimizar_pessoa", {
      p_pessoa_id: pessoa.id, p_motivo: null,
    });
    check("não permite anonimizar a mesma pessoa duas vezes", !!repetirError);
  }

  console.log("\n3. Pessoa inexistente / de outra empresa");
  {
    const { error } = await admTenant.client.rpc("anonimizar_pessoa", {
      p_pessoa_id: "00000000-0000-0000-0000-000000000000", p_motivo: null,
    });
    check("pessoa inexistente é recusada", !!error);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
