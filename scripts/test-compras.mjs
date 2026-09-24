// Testes automatizados de Compras — Fase 1 da ADR-011 (docs/ADR-011 —
// Compras v1.0.md, escopo completo aprovado em 23/09/2026): fornecedor
// completo, fornecedor/material alternativo por item e política de
// abastecimento. Fornecedor continua sendo pessoas/pessoa_papeis (T2,
// papel FORNECEDOR) — fornecedor_dados só acrescenta os campos comerciais
// que T2 deixou de fora de propósito.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-compras.mjs

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

async function upsertPessoa(tenant, sufixo, nome, papel) {
  const { data: id, error } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CNPJ", p_documento: `1122233300${sufixo}`, p_nome: nome,
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  if (error) console.error("[fixture] upsert_pessoa falhou:", error);
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: id, p_papel: papel, p_ativo: true });
  return id;
}

async function upsertItem(tenant, codigo, tipo) {
  const { data: id, error } = await tenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: codigo, p_descricao: `Item teste ${codigo}`,
    p_tipo: tipo, p_classificacao: "teste", p_unidade_principal: "UN", p_situacao: "ativo",
  });
  if (error) console.error("[fixture] upsert_item falhou:", error);
  return id;
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão de compras, outro tenant)...");
  const admTenant = await createTenant("compras-test-admin", "Compras Admin Teste", "cp01", "ADMIN");
  // QUALIDADE não administra Compras — prova a autoridade separada (mesmo padrão dos demais test-*.mjs).
  const noPermTenant = await createTenant("compras-test-admin", "Compras SemPerm Teste", "cp02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant("compras-test-other", "Compras Outro Teste", "cp03", "ADMIN");

  console.log("\n0. Massa de dados — fornecedores, cliente sem papel fornecedor, itens materiais");
  const fornAlfaId = await upsertPessoa(admTenant, "1", "Fornecedor Alfa Ltda", "FORNECEDOR");
  const fornBetaId = await upsertPessoa(admTenant, "2", "Fornecedor Beta Ltda", "FORNECEDOR");
  const pessoaClienteId = await upsertPessoa(admTenant, "3", "Cliente Sem Papel Fornecedor", "CLIENTE");
  const itemMaterialId = await upsertItem(admTenant, "PRF-CPT-1", "materia_prima");
  const itemMaterialAltId = await upsertItem(admTenant, "PRF-CPT-2", "materia_prima");
  const itemAcabadoId = await upsertItem(admTenant, "JAN-CPT-1", "produto_acabado");
  check("fornecedor Alfa criado", !!fornAlfaId);
  check("fornecedor Beta criado", !!fornBetaId);
  check("item material criado", !!itemMaterialId);

  console.log("\n1. upsert_fornecedor_dados() rejeita pessoa sem papel FORNECEDOR ativo");
  {
    const { error } = await admTenant.client.rpc("upsert_fornecedor_dados", { p_pessoa_id: pessoaClienteId, p_prazo_pagamento_dias: 30 });
    check("rejeita pessoa sem papel FORNECEDOR", !!error);
  }

  console.log("\n2. upsert_fornecedor_dados() sucesso + idempotência (upsert por pessoa_id)");
  let fornecedorDadosId;
  {
    const { data, error } = await admTenant.client.rpc("upsert_fornecedor_dados", {
      p_pessoa_id: fornAlfaId, p_prazo_pagamento_dias: 30, p_lead_time_dias: 7,
      p_banco: "Banco X", p_agencia: "0001", p_conta: "12345-6", p_tipo_conta: "corrente",
      p_chave_pix: "chave-pix-alfa", p_condicoes_padrao: "FOB", p_homologado: true,
    });
    check("cria fornecedor_dados sem erro", !error);
    fornecedorDadosId = data;

    const { data: segunda, error: err2 } = await admTenant.client.rpc("upsert_fornecedor_dados", {
      p_pessoa_id: fornAlfaId, p_prazo_pagamento_dias: 45, p_lead_time_dias: 10,
    });
    check("upsert repetido é idempotente (mesmo id)", !err2 && segunda === fornecedorDadosId);

    const { data: row } = await admin.from("fornecedor_dados").select("*").eq("id", fornecedorDadosId).single();
    check("prazo_pagamento_dias atualizado para 45 no upsert", row.prazo_pagamento_dias === 45);
  }

  console.log("\n3. upsert_item_fornecedor() rejeita item de tipo errado e pessoa sem papel FORNECEDOR");
  {
    const { error: err1 } = await admTenant.client.rpc("upsert_item_fornecedor", { p_item_id: itemAcabadoId, p_pessoa_id: fornAlfaId });
    check("rejeita item produto_acabado", !!err1);
    const { error: err2 } = await admTenant.client.rpc("upsert_item_fornecedor", { p_item_id: itemMaterialId, p_pessoa_id: pessoaClienteId });
    check("rejeita pessoa sem papel FORNECEDOR", !!err2);
  }

  console.log("\n4. upsert_item_fornecedor() sucesso (dois fornecedores no mesmo item) + definir_fornecedor_principal()");
  {
    const { error: errAlfa } = await admTenant.client.rpc("upsert_item_fornecedor", {
      p_item_id: itemMaterialId, p_pessoa_id: fornAlfaId, p_prioridade: 10, p_homologado: true, p_preco_referencia: 25.5,
    });
    check("associa fornecedor Alfa ao item", !errAlfa);
    const { error: errBeta } = await admTenant.client.rpc("upsert_item_fornecedor", {
      p_item_id: itemMaterialId, p_pessoa_id: fornBetaId, p_prioridade: 20,
    });
    check("associa fornecedor Beta ao item", !errBeta);

    const { error: errPrinc1 } = await admTenant.client.rpc("definir_fornecedor_principal", { p_item_id: itemMaterialId, p_pessoa_id: fornAlfaId });
    check("Alfa vira principal", !errPrinc1);
    const { data: rows1 } = await admin.from("item_fornecedores").select("pessoa_id, principal").eq("item_id", itemMaterialId);
    check("só Alfa é principal (Beta não é)", rows1.find((r) => r.pessoa_id === fornAlfaId).principal === true && rows1.find((r) => r.pessoa_id === fornBetaId).principal === false);

    const { error: errPrinc2 } = await admTenant.client.rpc("definir_fornecedor_principal", { p_item_id: itemMaterialId, p_pessoa_id: fornBetaId });
    check("Beta assume o principal", !errPrinc2);
    const { data: rows2 } = await admin.from("item_fornecedores").select("pessoa_id, principal").eq("item_id", itemMaterialId);
    check("Alfa perde o principal (só 1 por item)", rows2.find((r) => r.pessoa_id === fornAlfaId).principal === false && rows2.find((r) => r.pessoa_id === fornBetaId).principal === true);
  }

  console.log("\n5. upsert_item_material_alternativo() validações e ciclo completo");
  let altId;
  {
    const { error: errSelf } = await admTenant.client.rpc("upsert_item_material_alternativo", { p_item_origem_id: itemMaterialId, p_item_equivalente_id: itemMaterialId });
    check("rejeita item alternativo a ele mesmo", !!errSelf);
    const { error: errTipo } = await admTenant.client.rpc("upsert_item_material_alternativo", { p_item_origem_id: itemMaterialId, p_item_equivalente_id: itemAcabadoId });
    check("rejeita tipo errado (produto_acabado)", !!errTipo);

    const { data, error } = await admTenant.client.rpc("upsert_item_material_alternativo", {
      p_item_origem_id: itemMaterialId, p_item_equivalente_id: itemMaterialAltId, p_exige_aprovacao: true, p_regra_substituicao: "mesma liga",
    });
    check("cria material alternativo", !error);
    altId = data;

    const { error: errDesat } = await admTenant.client.rpc("desativar_item_material_alternativo", { p_id: altId });
    check("desativa material alternativo", !errDesat);
    const { error: errDesat2 } = await admTenant.client.rpc("desativar_item_material_alternativo", { p_id: altId });
    check("desativar de novo falha (já inativo)", !!errDesat2);

    const { data: reativado, error: errReat } = await admTenant.client.rpc("upsert_item_material_alternativo", {
      p_item_origem_id: itemMaterialId, p_item_equivalente_id: itemMaterialAltId,
    });
    check("upsert reativa em vez de duplicar", !errReat && reativado === altId);
    const { data: row } = await admin.from("item_materiais_alternativos").select("ativo").eq("id", altId).single();
    check("registro está ativo de novo", row.ativo === true);
  }

  console.log("\n6. upsert_politica_abastecimento() validações e idempotência");
  let politicaId;
  {
    const { error: errTipo } = await admTenant.client.rpc("upsert_politica_abastecimento", { p_item_id: itemMaterialId, p_tipo: "tipo_invalido" });
    check("rejeita tipo inválido", !!errTipo);
    const { error: errForn } = await admTenant.client.rpc("upsert_politica_abastecimento", {
      p_item_id: itemMaterialId, p_tipo: "estoque_minimo", p_fornecedor_preferencial_id: pessoaClienteId,
    });
    check("rejeita fornecedor preferencial sem papel FORNECEDOR", !!errForn);

    const { data, error } = await admTenant.client.rpc("upsert_politica_abastecimento", {
      p_item_id: itemMaterialId, p_tipo: "estoque_minimo", p_estoque_minimo: 10, p_estoque_seguranca: 5,
      p_ponto_reposicao: 15, p_lote_minimo: 50, p_lote_economico: 200, p_multiplo: 10, p_fornecedor_preferencial_id: fornAlfaId,
    });
    check("cria política de abastecimento", !error);
    politicaId = data;

    const { data: segunda, error: err2 } = await admTenant.client.rpc("upsert_politica_abastecimento", { p_item_id: itemMaterialId, p_tipo: "ponto_reposicao", p_ponto_reposicao: 20 });
    check("upsert é idempotente por item_id (mesmo id)", !err2 && segunda === politicaId);
    const { data: row } = await admin.from("politicas_abastecimento").select("tipo, estoque_minimo").eq("id", politicaId).single();
    check("tipo atualizado para ponto_reposicao no upsert", row.tipo === "ponto_reposicao");
  }

  console.log("\n7. Deny — usuário sem compras.manage (papel QUALIDADE)");
  {
    const { error: e1 } = await noPermTenant.client.rpc("upsert_fornecedor_dados", { p_pessoa_id: fornAlfaId, p_prazo_pagamento_dias: 60 });
    check("upsert_fornecedor_dados negado sem compras.manage", !!e1);
    const { error: e2 } = await noPermTenant.client.rpc("upsert_item_fornecedor", { p_item_id: itemMaterialId, p_pessoa_id: fornAlfaId });
    check("upsert_item_fornecedor negado sem compras.manage", !!e2);
    const { error: e3 } = await noPermTenant.client.rpc("definir_fornecedor_principal", { p_item_id: itemMaterialId, p_pessoa_id: fornAlfaId });
    check("definir_fornecedor_principal negado sem compras.manage", !!e3);
    const { error: e4 } = await noPermTenant.client.rpc("upsert_item_material_alternativo", { p_item_origem_id: itemMaterialId, p_item_equivalente_id: itemMaterialAltId });
    check("upsert_item_material_alternativo negado sem compras.manage", !!e4);
    const { error: e5 } = await noPermTenant.client.rpc("upsert_politica_abastecimento", { p_item_id: itemMaterialId, p_tipo: "sob_demanda" });
    check("upsert_politica_abastecimento negado sem compras.manage", !!e5);

    const { data: still } = await noPermTenant.client.from("fornecedor_dados").select("id").eq("id", fornecedorDadosId);
    check("SELECT continua liberado (papel QUALIDADE lê normalmente)", (still ?? []).length === 1);
  }

  console.log("\n8. Isolamento cross-tenant — tenant B não vê nem altera dados do tenant A");
  {
    const { data: fd } = await otherTenant.client.from("fornecedor_dados").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê fornecedor_dados do tenant A", (fd ?? []).length === 0);
    const { data: itf } = await otherTenant.client.from("item_fornecedores").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê item_fornecedores do tenant A", (itf ?? []).length === 0);
    const { data: alt } = await otherTenant.client.from("item_materiais_alternativos").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê item_materiais_alternativos do tenant A", (alt ?? []).length === 0);
    const { data: pol } = await otherTenant.client.from("politicas_abastecimento").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê politicas_abastecimento do tenant A", (pol ?? []).length === 0);

    const { error: e1 } = await otherTenant.client.rpc("upsert_fornecedor_dados", { p_pessoa_id: fornAlfaId, p_prazo_pagamento_dias: 10 });
    check("tenant B não consegue mutar fornecedor_dados do tenant A (pessoa invisível)", !!e1);
    const { error: e2 } = await otherTenant.client.rpc("upsert_item_fornecedor", { p_item_id: itemMaterialId, p_pessoa_id: fornAlfaId });
    check("tenant B não consegue associar fornecedor a item do tenant A", !!e2);
    const { error: e3 } = await otherTenant.client.rpc("definir_fornecedor_principal", { p_item_id: itemMaterialId, p_pessoa_id: fornAlfaId });
    check("tenant B não consegue definir principal em item do tenant A", !!e3);
    const { error: e4 } = await otherTenant.client.rpc("upsert_politica_abastecimento", { p_item_id: itemMaterialId, p_tipo: "sob_demanda" });
    check("tenant B não consegue criar política em item do tenant A", !!e4);
  }

  console.log("\n9. Um só fornecedor principal por item — índice parcial único também protege via SQL direto");
  {
    const { error } = await admin.from("item_fornecedores").update({ principal: true }).eq("item_id", itemMaterialId).eq("pessoa_id", fornAlfaId).select();
    // Beta já é principal (passo 4) — forçar Alfa como segundo principal deve violar o índice parcial único.
    check("índice único parcial rejeita um segundo principal no mesmo item", !!error);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
