// Melhorias 17/10/2026, item 7: ocultar_documento_pessoa() — mascara CPF/CNPJ, mantém contato.
// Uso: set -a; source .env.local; set +a; node scripts/test-ocultar-documento-pessoa.mjs

import "./lib/somente-local.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

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

async function createTenant(slug, name, identifier) {
  const { data: company } = await admin.from("companies").upsert({ slug, name }, { onConflict: "slug" }).select().single();
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
  const { data: role } = await admin.from("roles").select("id").is("company_id", null).eq("key", "ADMIN").single();
  const { data: existing } = await admin
    .from("user_roles").select("id").eq("profile_id", userId).eq("role_id", role.id).is("valid_until", null).maybeSingle();
  if (!existing) await admin.from("user_roles").insert({ profile_id: userId, role_id: role.id });
  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });
  return { client, company, userId };
}

function novaPessoa(t, doc, tipo, nome) {
  return t.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: tipo, p_documento: doc, p_nome: nome,
    p_nome_fantasia: null, p_telefone: "11999990000", p_email: `${nome.replace(/ /g, "").toLowerCase()}@teste.com`,
    p_logradouro: "Rua A, 10", p_cidade: "São Paulo", p_uf: "SP", p_cep: "01000-000", p_situacao: "ativo",
  });
}

async function main() {
  const a = await createTenant("ocultar-doc-a", "Ocultar Doc A", "od01");
  const b = await createTenant("ocultar-doc-b", "Ocultar Doc B", "od02");

  console.log("1. CPF: máscara e dados preservados");
  const { data: cpfId } = await novaPessoa(a, "03412345600", "CPF", "Maria Silva");
  {
    const { error } = await a.client.rpc("ocultar_documento_pessoa", { p_pessoa_id: cpfId, p_motivo: "teste" });
    check("ocultar funciona", !error, error);
    const { data: p } = await admin.from("pessoas").select("*").eq("id", cpfId).single();
    check("documento completo apagado", p.documento === null, p);
    check("máscara 034.***.***-00", p.documento_mascarado === "034.***.***-00", p.documento_mascarado);
    check("nome, telefone, e-mail e endereço preservados",
      p.nome === "Maria Silva" && p.telefone === "11999990000" && p.email === "mariasilva@teste.com" &&
      p.logradouro === "Rua A, 10" && p.cidade === "São Paulo" && p.uf === "SP" && p.cep === "01000-000", p);
    check("não é marcada como anonimizada", p.anonymized_at === null && p.documento_oculto_em !== null);

    const { data: logs } = await admin.from("activity_logs").select("metadata, description").eq("entity_id", cpfId).eq("action", "lgpd.documento_ocultado");
    check("auditoria registrada", logs?.length === 1, logs);
    check("log não contém o número completo", !JSON.stringify(logs).includes("03412345600"), logs);

    const { error: e2 } = await a.client.rpc("ocultar_documento_pessoa", { p_pessoa_id: cpfId });
    check("ocultar de novo é recusado (sem documento completo)", !!e2, e2);
  }

  console.log("\n2. CNPJ");
  {
    const { data: cnpjId } = await novaPessoa(a, "11222333000181", "CNPJ", "Empresa X");
    await a.client.rpc("ocultar_documento_pessoa", { p_pessoa_id: cnpjId });
    const { data: p } = await admin.from("pessoas").select("documento_mascarado").eq("id", cnpjId).single();
    check("máscara de CNPJ 11.***.***/****-81", p.documento_mascarado === "11.***.***/****-81", p);
  }

  console.log("\n3. Dois CPFs com mesmo começo/fim não colidem")
  {
    const { data: x, error: ex } = await novaPessoa(a, "03498765400", "CPF", "Outro Cliente");
    check("segunda pessoa criada", !ex && !!x, ex);
    const { error } = await a.client.rpc("ocultar_documento_pessoa", { p_pessoa_id: x });
    check("ocultar a segunda também funciona (mesma máscara)", !error, error);
  }

  console.log("\n4. Isolamento e permissão");
  {
    const { error } = await b.client.rpc("ocultar_documento_pessoa", { p_pessoa_id: cpfId });
    check("empresa B não oculta documento de pessoa da A", !!error, error);
  }

  console.log("\n5. Informar documento novo limpa a máscara");
  {
    await a.client.rpc("upsert_pessoa", {
      p_id: cpfId, p_tipo_documento: "CPF", p_documento: "03412345600", p_nome: "Maria Silva",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null, p_cidade: null,
      p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    const { data: p } = await admin.from("pessoas").select("documento, documento_mascarado, documento_oculto_em").eq("id", cpfId).single();
    check("documento volta e máscara é zerada", p.documento === "03412345600" && p.documento_mascarado === null && p.documento_oculto_em === null, p);
  }

  console.log("\n6. Anonimização completa também apaga a máscara");
  {
    await a.client.rpc("ocultar_documento_pessoa", { p_pessoa_id: cpfId });
    const { error } = await a.client.rpc("anonimizar_pessoa", { p_pessoa_id: cpfId, p_motivo: "pedido do titular" });
    check("anonimizar funciona", !error, error);
    const { data: p } = await admin.from("pessoas").select("*").eq("id", cpfId).single();
    check("máscara apagada e dados pessoais eliminados",
      p.documento_mascarado === null && p.documento_oculto_em === null && p.telefone === null &&
      p.email === null && p.nome === "Titular de dados anonimizado", p);
    const { error: e2 } = await a.client.rpc("ocultar_documento_pessoa", { p_pessoa_id: cpfId });
    check("não oculta documento de pessoa já anonimizada", !!e2, e2);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
