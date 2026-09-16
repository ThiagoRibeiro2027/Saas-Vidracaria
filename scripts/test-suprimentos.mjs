// Testes automatizados do TÓPICO 7 — Suprimentos e Compras, recorte
// mínimo do MVP (ADR-002 §4.18): só registro e acompanhamento de
// necessidade de compra, sem fornecedor/cotação/pedido de compra/
// recebimento — a efetivação acontece fora do SaaS neste recorte.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-suprimentos.mjs

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

async function createTenant(slug, name, identifier, roleKey = "ADMIN", existingCompany = null) {
  let company = existingCompany;
  if (!company) {
    const { data } = await admin
      .from("companies")
      .upsert({ slug, name }, { onConflict: "slug" })
      .select()
      .single();
    company = data;
  }

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

async function main() {
  console.log("Preparando tenants (admin, sem-permissão de suprimentos, outro tenant)...");
  const admTenant = await createTenant("suprimentos-test-admin", "Suprimentos Admin Teste", "7s01", "ADMIN");
  // QUALIDADE administra Qualidade, não Suprimentos — prova a autoridade separada.
  const noPermTenant = await createTenant("suprimentos-test-admin", "Suprimentos SemPerm Teste", "7s02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant("suprimentos-test-other", "Suprimentos Outro Teste", "7s03", "ADMIN");

  console.log("\n0. Massa de dados — item de matéria-prima");
  const { data: itemId, error: itemErr } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "VD-SUP-1", p_descricao: "Vidro temperado 8mm",
    p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
    p_situacao: "ativo",
  });
  check("item criado", !itemErr && !!itemId);

  console.log("\n1. criar_necessidade_compra() exige suprimentos.manage");
  {
    const { error } = await noPermTenant.client.rpc("criar_necessidade_compra", {
      p_item_id: itemId, p_quantidade: 10, p_data_necessaria: null, p_origem: "manual", p_observacoes: null,
    });
    check("sem suprimentos.manage (papel QUALIDADE) não cria necessidade", !!error);
  }

  console.log("\n2. criar_necessidade_compra() rejeita item de outra empresa");
  {
    const { error } = await otherTenant.client.rpc("criar_necessidade_compra", {
      p_item_id: itemId, p_quantidade: 10, p_data_necessaria: null, p_origem: "manual", p_observacoes: null,
    });
    check("item de outro tenant é rejeitado", !!error);
  }

  console.log("\n3. criar_necessidade_compra() rejeita item inexistente");
  {
    const { error } = await admTenant.client.rpc("criar_necessidade_compra", {
      p_item_id: "00000000-0000-0000-0000-000000000000", p_quantidade: 10, p_data_necessaria: null, p_origem: "manual", p_observacoes: null,
    });
    check("item inexistente é rejeitado", !!error);
  }

  console.log("\n4. criar_necessidade_compra() rejeita quantidade <= 0");
  {
    const { error } = await admTenant.client.rpc("criar_necessidade_compra", {
      p_item_id: itemId, p_quantidade: 0, p_data_necessaria: null, p_origem: "manual", p_observacoes: null,
    });
    check("quantidade zero é rejeitada", !!error);
  }

  console.log("\n5. criar_necessidade_compra() rejeita origem inválida");
  {
    const { error } = await admTenant.client.rpc("criar_necessidade_compra", {
      p_item_id: itemId, p_quantidade: 10, p_data_necessaria: null, p_origem: "invalida", p_observacoes: null,
    });
    check("origem inválida é rejeitada", !!error);
  }

  console.log("\n6. criar_necessidade_compra() sucesso");
  let necessidadeId;
  {
    const { data, error } = await admTenant.client.rpc("criar_necessidade_compra", {
      p_item_id: itemId, p_quantidade: 25, p_data_necessaria: "2027-02-01", p_origem: "producao", p_observacoes: "reposição de linha",
    });
    check("ADMIN cria necessidade de compra", !error && !!data);
    necessidadeId = data;

    const { data: nc } = await admin.from("necessidades_compra").select("*").eq("id", necessidadeId).single();
    check("necessidade nasce 'aberta' com os dados corretos", nc?.status === "aberta" && Number(nc?.quantidade) === 25 && nc?.origem === "producao");
  }

  console.log("\n7. atender_necessidade_compra() exige suprimentos.manage");
  {
    const { error } = await noPermTenant.client.rpc("atender_necessidade_compra", { p_id: necessidadeId });
    check("sem suprimentos.manage não atende necessidade", !!error);
  }

  console.log("\n8. atender_necessidade_compra() sucesso");
  {
    const { error } = await admTenant.client.rpc("atender_necessidade_compra", { p_id: necessidadeId });
    check("ADMIN atende necessidade aberta", !error);
    const { data: nc } = await admin.from("necessidades_compra").select("status").eq("id", necessidadeId).single();
    check("status vira 'atendida'", nc?.status === "atendida");
  }

  console.log("\n9. atender_necessidade_compra() rejeita necessidade já atendida");
  {
    const { error } = await admTenant.client.rpc("atender_necessidade_compra", { p_id: necessidadeId });
    check("atender necessidade já atendida é rejeitado", !!error);
  }

  console.log("\n10. cancelar_necessidade_compra() sucesso, com motivo");
  let necessidade2Id;
  {
    const { data } = await admTenant.client.rpc("criar_necessidade_compra", {
      p_item_id: itemId, p_quantidade: 5, p_data_necessaria: null, p_origem: "manual", p_observacoes: null,
    });
    necessidade2Id = data;

    const { error } = await admTenant.client.rpc("cancelar_necessidade_compra", { p_id: necessidade2Id, p_motivo: "não é mais necessário" });
    check("cancela necessidade aberta", !error);
    const { data: nc } = await admin.from("necessidades_compra").select("status, motivo_cancelamento").eq("id", necessidade2Id).single();
    check("status vira 'cancelada' com motivo salvo", nc?.status === "cancelada" && nc?.motivo_cancelamento === "não é mais necessário");
  }

  console.log("\n11. cancelar_necessidade_compra() rejeita necessidade já cancelada");
  {
    const { error } = await admTenant.client.rpc("cancelar_necessidade_compra", { p_id: necessidade2Id, p_motivo: "de novo" });
    check("cancelar necessidade já cancelada é rejeitado", !!error);
  }

  console.log("\n12. Isolamento entre tenants");
  {
    const { data: crossNc } = await otherTenant.client.from("necessidades_compra").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga necessidades do tenant A", (crossNc ?? []).length === 0);

    const { error } = await otherTenant.client.rpc("atender_necessidade_compra", { p_id: necessidadeId });
    check("tenant B não consegue atender necessidade do tenant A", !!error);
  }

  console.log("\n13. SELECT liberado sem suprimentos.manage (papel QUALIDADE lê normalmente)");
  {
    const { data, error } = await noPermTenant.client.from("necessidades_compra").select("id").eq("id", necessidadeId);
    check("papel QUALIDADE (sem suprimentos.manage) lê necessidades_compra da própria empresa", !error && (data ?? []).length === 1);
  }

  console.log("\n14. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", ["suprimentos.necessidade_criada", "suprimentos.necessidade_atendida", "suprimentos.necessidade_cancelada"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of ["suprimentos.necessidade_criada", "suprimentos.necessidade_atendida", "suprimentos.necessidade_cancelada"]) {
      check(`${action} registrado`, actions.has(action));
    }
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
