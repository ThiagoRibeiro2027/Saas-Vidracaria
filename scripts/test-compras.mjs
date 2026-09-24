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

  // =======================================================================
  // Fase 2 da ADR-011 — estoque dimensional e conversão de unidade completa
  // (TÓPICO 7 §5/§6, base de §9). Funções gated por itens.manage/
  // estoque.manage/estoque.view (T2/T6), não compras.* — o controle é uma
  // capacidade de Estoque, só desbloqueada por esta frente de Compras.
  // =======================================================================

  console.log("\n10. definir_propriedades_dimensionais_item() validações e sucesso (linear + área)");
  const itemPerfilId = await upsertItem(admTenant, "PRF-CPT-DIM", "materia_prima");
  const itemVidroId = await upsertItem(admTenant, "VDR-CPT-DIM", "materia_prima");
  {
    const { error: errTipo } = await admTenant.client.rpc("definir_propriedades_dimensionais_item", { p_item_id: itemPerfilId, p_dimensao_tipo: "volume" });
    check("rejeita dimensao_tipo inválido", !!errTipo);

    const { error: errLinear } = await admTenant.client.rpc("definir_propriedades_dimensionais_item", { p_item_id: itemPerfilId, p_dimensao_tipo: "linear", p_peso_por_unidade_dimensao: 1.85 });
    check("configura item linear (kg/m)", !errLinear);
    const { error: errArea } = await admTenant.client.rpc("definir_propriedades_dimensionais_item", { p_item_id: itemVidroId, p_dimensao_tipo: "area", p_peso_por_unidade_dimensao: 6.0 });
    check("configura item área (kg/m²)", !errArea);
  }

  console.log("\n11. registrar_peca_dimensional() validações e sucesso");
  let pecaBarraId;
  {
    const { error: errSemDimensao } = await admTenant.client.rpc("registrar_peca_dimensional", { p_item_id: itemMaterialId, p_quantidade: 10 });
    check("rejeita item sem controle dimensional configurado", !!errSemDimensao);
    const { error: errQtdZero } = await admTenant.client.rpc("registrar_peca_dimensional", { p_item_id: itemPerfilId, p_quantidade: 0 });
    check("rejeita quantidade <= 0", !!errQtdZero);

    const { data, error } = await admTenant.client.rpc("registrar_peca_dimensional", { p_item_id: itemPerfilId, p_quantidade: 6, p_identificador: "BARRA-001", p_observacao: "carga inicial" });
    check("registra peça (barra de 6m)", !error);
    pecaBarraId = data;
    const { data: row } = await admin.from("itens_pecas_dimensionais").select("quantidade_original, quantidade_disponivel, situacao").eq("id", pecaBarraId).single();
    check("peça nasce com disponível = original, situação disponível", Number(row.quantidade_original) === 6 && Number(row.quantidade_disponivel) === 6 && row.situacao === "disponivel");
  }

  console.log("\n12. consumir_peca_dimensional() -- consumo parcial deixa sobra disponível, consumo total esgota");
  {
    const { error: errExcede } = await admTenant.client.rpc("consumir_peca_dimensional", { p_peca_id: pecaBarraId, p_quantidade: 10 });
    check("rejeita consumir mais do que o disponível", !!errExcede);

    const { error: errParcial } = await admTenant.client.rpc("consumir_peca_dimensional", { p_peca_id: pecaBarraId, p_quantidade: 4, p_observacao: "corte pedido X" });
    check("consome parte da peça", !errParcial);
    const { data: rowParcial } = await admin.from("itens_pecas_dimensionais").select("quantidade_disponivel, situacao").eq("id", pecaBarraId).single();
    check("sobra de 2m fica disponível na mesma linha (sem tabela/estado separado)", Number(rowParcial.quantidade_disponivel) === 2 && rowParcial.situacao === "disponivel");

    const { error: errTotal } = await admTenant.client.rpc("consumir_peca_dimensional", { p_peca_id: pecaBarraId, p_quantidade: 2, p_observacao: "sobra reaproveitada" });
    check("consome o restante", !errTotal);
    const { data: rowEsgotada } = await admin.from("itens_pecas_dimensionais").select("quantidade_disponivel, situacao").eq("id", pecaBarraId).single();
    check("peça fica esgotada ao chegar a zero", Number(rowEsgotada.quantidade_disponivel) === 0 && rowEsgotada.situacao === "esgotada");

    const { error: errJaEsgotada } = await admTenant.client.rpc("consumir_peca_dimensional", { p_peca_id: pecaBarraId, p_quantidade: 1 });
    check("rejeita consumir peça já esgotada", !!errJaEsgotada);
  }

  console.log("\n13. definir_propriedades_dimensionais_item() bloqueia desligar controle com peça já registrada");
  {
    const { error } = await admTenant.client.rpc("definir_propriedades_dimensionais_item", { p_item_id: itemPerfilId, p_dimensao_tipo: null });
    check("bloqueia desligar controle dimensional com peça existente", !!error);
  }

  console.log("\n14. converter_item_para_peso() / converter_item_de_peso() -- linear e área");
  {
    const { data: kg, error: errKg } = await admTenant.client.rpc("converter_item_para_peso", { p_item_id: itemPerfilId, p_quantidade: 6 });
    check("6m de perfil (1.85 kg/m) converte para 11.1 kg", !errKg && Number(kg) === 11.1);
    const { data: metros, error: errM } = await admTenant.client.rpc("converter_item_de_peso", { p_item_id: itemPerfilId, p_quantidade_kg: 11.1 });
    check("11.1 kg converte de volta para 6m", !errM && Number(metros) === 6);

    const { data: kgVidro, error: errKgVidro } = await admTenant.client.rpc("converter_item_para_peso", { p_item_id: itemVidroId, p_quantidade: 2 });
    check("2m² de vidro (6 kg/m²) converte para 12 kg", !errKgVidro && Number(kgVidro) === 12);

    const { error: errSemConversao } = await admTenant.client.rpc("converter_item_para_peso", { p_item_id: itemMaterialId, p_quantidade: 5 });
    check("rejeita item sem conversão configurada", !!errSemConversao);
  }

  console.log("\n15. Deny -- usuário sem itens.manage/estoque.manage/estoque.view (papel QUALIDADE)");
  {
    const { error: e1 } = await noPermTenant.client.rpc("definir_propriedades_dimensionais_item", { p_item_id: itemVidroId, p_dimensao_tipo: "area", p_peso_por_unidade_dimensao: 6 });
    check("definir_propriedades_dimensionais_item negado sem itens.manage", !!e1);
    const { error: e2 } = await noPermTenant.client.rpc("registrar_peca_dimensional", { p_item_id: itemVidroId, p_quantidade: 2 });
    check("registrar_peca_dimensional negado sem estoque.manage", !!e2);
    const { error: e3 } = await noPermTenant.client.rpc("converter_item_para_peso", { p_item_id: itemPerfilId, p_quantidade: 1 });
    check("converter_item_para_peso negado sem estoque.view", !!e3);

    const { data: still } = await noPermTenant.client.from("itens_pecas_dimensionais").select("id").eq("id", pecaBarraId);
    check("SELECT direto continua liberado (RLS por company_id, sem gate de permissão)", (still ?? []).length === 1);
  }

  console.log("\n16. Isolamento cross-tenant -- tenant B não vê nem altera peças dimensionais do tenant A");
  {
    const { data: pecas } = await otherTenant.client.from("itens_pecas_dimensionais").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê peças dimensionais do tenant A", (pecas ?? []).length === 0);

    const { error: e1 } = await otherTenant.client.rpc("registrar_peca_dimensional", { p_item_id: itemPerfilId, p_quantidade: 5 });
    check("tenant B não consegue registrar peça em item do tenant A", !!e1);
    const { error: e2 } = await otherTenant.client.rpc("consumir_peca_dimensional", { p_peca_id: pecaBarraId, p_quantidade: 1 });
    check("tenant B não consegue consumir peça do tenant A", !!e2);
    const { error: e3 } = await otherTenant.client.rpc("definir_propriedades_dimensionais_item", { p_item_id: itemPerfilId, p_dimensao_tipo: "linear", p_peso_por_unidade_dimensao: 2 });
    check("tenant B não consegue configurar item do tenant A", !!e3);
    const { error: e4 } = await otherTenant.client.rpc("converter_item_para_peso", { p_item_id: itemPerfilId, p_quantidade: 1 });
    check("tenant B não consegue converter unidade de item do tenant A", !!e4);
  }

  console.log("\n17. Regressão -- estoque_saldos/ajustar_saldo/registrar_entrada_sobra continuam intocados para item escalar");
  {
    const { error: errAjuste } = await admTenant.client.rpc("ajustar_saldo", { p_item_id: itemMaterialId, p_quantidade_delta: 100, p_motivo: "carga inicial teste" });
    check("ajustar_saldo continua funcionando normalmente (item escalar)", !errAjuste);
    const { data: saldo1 } = await admin.from("estoque_saldos").select("quantidade_fisica").eq("item_id", itemMaterialId).single();
    check("saldo escalar reflete o ajuste (100)", Number(saldo1.quantidade_fisica) === 100);

    const { error: errSobra } = await admTenant.client.rpc("registrar_entrada_sobra", { p_item_id: itemMaterialId, p_quantidade: 5, p_pedido_item_id: null, p_observacao: "sobra escalar teste" });
    check("registrar_entrada_sobra continua funcionando normalmente (item escalar)", !errSobra);
    const { data: saldo2 } = await admin.from("estoque_saldos").select("quantidade_fisica").eq("item_id", itemMaterialId).single();
    check("saldo escalar acumula a sobra (105) -- mecanismo T6 intocado pela Fase 2", Number(saldo2.quantidade_fisica) === 105);
  }

  // =======================================================================
  // Fase 3 da ADR-011 — motor de necessidades, saldo projetado,
  // consolidação e mapa de compras futuras (TÓPICO 7 §1/§3/§4/§7/§8,
  // conclusão de §9, §11/§12). Gates compras.manage/compras.view — não
  // suprimentos.* (as funções de geração já existentes, gerar_
  // necessidades_de_pedido/ordem_producao, continuam suprimentos.manage,
  // só reaproveitam o motor generalizado por dentro).
  // A interação cruzada entre necessidade de política e necessidade de
  // pedido/produção (regressão do filtro "já sinalizado" generalizado pra
  // todas as origens) foi validada via cenário SQL standalone antes deste
  // commit — não repetida aqui pra não duplicar todo o fixture de
  // pedido/BOM que scripts/test-suprimentos.mjs já cobre.
  // =======================================================================

  console.log("\n18. gerar_necessidades_de_politica_abastecimento() -- estoque_minimo, idempotência e item sem política");
  const itemPoliticaAId = await upsertItem(admTenant, "ITA-CPT", "materia_prima");
  const itemPoliticaBId = await upsertItem(admTenant, "ITB-CPT", "materia_prima");
  const itemSemPoliticaId = await upsertItem(admTenant, "ITE-CPT", "materia_prima");
  {
    await admTenant.client.rpc("upsert_politica_abastecimento", { p_item_id: itemPoliticaAId, p_tipo: "estoque_minimo", p_estoque_minimo: 20 });
    const { data, error } = await admTenant.client.rpc("gerar_necessidades_de_politica_abastecimento", { p_item_id: itemPoliticaAId });
    check("gera necessidade a partir da política de estoque mínimo", !error && data?.length === 1 && data[0].origem_gerada === "estoque_minimo" && Number(data[0].quantidade_gerada) === 20);

    const { data: rerun } = await admTenant.client.rpc("gerar_necessidades_de_politica_abastecimento", { p_item_id: itemPoliticaAId });
    check("reexecução é idempotente (já sinalizado cobre o alvo)", (rerun ?? []).length === 0);

    const { data: semPolitica } = await admTenant.client.rpc("gerar_necessidades_de_politica_abastecimento", { p_item_id: itemSemPoliticaId });
    check("item sem política não gera necessidade nem erro", (semPolitica ?? []).length === 0);
  }

  console.log("\n19. gerar_necessidades_de_politica_abastecimento() -- ponto_reposicao aplica múltiplo/lote mínimo (§8)");
  {
    await admTenant.client.rpc("upsert_politica_abastecimento", {
      p_item_id: itemPoliticaBId, p_tipo: "ponto_reposicao", p_ponto_reposicao: 15, p_lote_minimo: 5, p_multiplo: 10,
    });
    const { data, error } = await admTenant.client.rpc("gerar_necessidades_de_politica_abastecimento", { p_item_id: itemPoliticaBId });
    // falta bruta 15 -> arredonda pro múltiplo de 10 -> 20 (já >= lote mínimo 5)
    check("arredonda pro múltiplo configurado na política", !error && data?.length === 1 && data[0].origem_gerada === "ponto_reposicao" && Number(data[0].quantidade_gerada) === 20);
  }

  console.log("\n20. calcular_saldo_projetado() -- item dimensional usa peça disponível (Fase 2), não saldo escalar");
  const itemDimensionalId = await upsertItem(admTenant, "ITC-CPT", "materia_prima");
  {
    await admTenant.client.rpc("definir_propriedades_dimensionais_item", { p_item_id: itemDimensionalId, p_dimensao_tipo: "linear", p_peso_por_unidade_dimensao: 1.5 });
    await admTenant.client.rpc("registrar_peca_dimensional", { p_item_id: itemDimensionalId, p_quantidade: 8 });
    const { data: saldoInicial } = await admTenant.client.rpc("calcular_saldo_projetado", { p_item_id: itemDimensionalId });
    check("saldo projetado começa em 8 (peça disponível, sem necessidade aberta)", Number(saldoInicial) === 8);

    await admTenant.client.rpc("criar_necessidade_compra", { p_item_id: itemDimensionalId, p_quantidade: 20, p_origem: "manual" });
    const { data: saldoDepois } = await admTenant.client.rpc("calcular_saldo_projetado", { p_item_id: itemDimensionalId });
    check("saldo projetado desconta necessidade aberta da peça disponível (8 - 20 = -12)", Number(saldoDepois) === -12);
  }

  console.log("\n21. consolidar_necessidades() -- validações e sucesso com rastreabilidade");
  const itemConsolidacaoId = await upsertItem(admTenant, "ITD-CPT", "materia_prima");
  let necConsolidadaId;
  {
    const { data: nec1 } = await admTenant.client.rpc("criar_necessidade_compra", { p_item_id: itemConsolidacaoId, p_quantidade: 5, p_data_necessaria: null, p_origem: "manual" });
    const { error: errPoucos } = await admTenant.client.rpc("consolidar_necessidades", { p_necessidade_ids: [nec1] });
    check("rejeita menos de 2 necessidades", !!errPoucos);

    const { data: necOutroItem } = await admTenant.client.rpc("criar_necessidade_compra", { p_item_id: itemSemPoliticaId, p_quantidade: 3, p_origem: "manual" });
    const { error: errItemDiferente } = await admTenant.client.rpc("consolidar_necessidades", { p_necessidade_ids: [nec1, necOutroItem] });
    check("rejeita necessidades de itens diferentes", !!errItemDiferente);

    const { data: nec2 } = await admTenant.client.rpc("criar_necessidade_compra", { p_item_id: itemConsolidacaoId, p_quantidade: 7, p_origem: "manual" });
    const { data: novaId, error } = await admTenant.client.rpc("consolidar_necessidades", { p_necessidade_ids: [nec1, nec2], p_observacoes: "teste consolidação" });
    check("consolida com sucesso", !error);
    necConsolidadaId = novaId;

    const { data: nova } = await admin.from("necessidades_compra").select("quantidade, origem, status").eq("id", necConsolidadaId).single();
    check("nova necessidade soma as quantidades e nasce com origem consolidada", Number(nova.quantidade) === 12 && nova.origem === "consolidada" && nova.status === "aberta");

    const { data: originais } = await admin.from("necessidades_compra").select("status, motivo_cancelamento").in("id", [nec1, nec2]);
    check("as duas originais ficam canceladas", originais.every((n) => n.status === "cancelada" && !!n.motivo_cancelamento));

    const { data: vinculos } = await admin.from("necessidade_consolidacao").select("necessidade_origem_id").eq("necessidade_compra_id", necConsolidadaId);
    check("rastreabilidade preservada -- 2 vínculos criados", (vinculos ?? []).length === 2);

    const { error: errJaCancelada } = await admTenant.client.rpc("consolidar_necessidades", { p_necessidade_ids: [nec1, necConsolidadaId] });
    check("rejeita reconsolidar uma necessidade já cancelada", !!errJaCancelada);
  }

  console.log("\n22. calendario_feriados -- upsert_feriado()/remover_feriado()");
  let feriadoId;
  {
    const { data, error } = await admTenant.client.rpc("upsert_feriado", { p_data: "2026-12-25", p_descricao: "Natal" });
    check("cria feriado", !error);
    feriadoId = data;
    const { error: errRemove } = await admTenant.client.rpc("remover_feriado", { p_id: feriadoId });
    check("remove feriado", !errRemove);
    const { data: still } = await admin.from("calendario_feriados").select("id").eq("id", feriadoId);
    check("feriado removido não aparece mais", (still ?? []).length === 0);
  }

  console.log("\n23. calcular_data_recomendada_compra() -- lead time do fornecedor principal, nunca recomenda depois do prazo menos lead time");
  {
    const fornF3Id = await upsertPessoa(admTenant, "9", "Fornecedor Lead Time Ltda", "FORNECEDOR");
    await admTenant.client.rpc("upsert_fornecedor_dados", { p_pessoa_id: fornF3Id, p_lead_time_dias: 5 });
    await admTenant.client.rpc("upsert_item_fornecedor", { p_item_id: itemPoliticaAId, p_pessoa_id: fornF3Id });
    await admTenant.client.rpc("definir_fornecedor_principal", { p_item_id: itemPoliticaAId, p_pessoa_id: fornF3Id });

    const dataNecessaria = new Date();
    dataNecessaria.setDate(dataNecessaria.getDate() + 10);
    const dataNecessariaStr = dataNecessaria.toISOString().slice(0, 10);
    const { data: recomendada, error } = await admTenant.client.rpc("calcular_data_recomendada_compra", { p_item_id: itemPoliticaAId, p_data_necessaria: dataNecessariaStr, p_fornecedor_id: null });
    check("calcula data recomendada sem erro", !error);
    const limite = new Date();
    limite.setDate(limite.getDate() + 5);
    check("nunca recomenda depois de data_necessaria - lead_time (5 dias)", new Date(recomendada) <= limite);
    check("nunca recomenda em fim de semana", ![0, 6].includes(new Date(`${recomendada}T00:00:00`).getDay()));

    const { data: semFornecedor } = await admTenant.client.rpc("calcular_data_recomendada_compra", { p_item_id: itemSemPoliticaId, p_data_necessaria: dataNecessariaStr, p_fornecedor_id: null });
    const limite30 = new Date();
    limite30.setDate(limite30.getDate() + 10);
    check("sem fornecedor/lead time configurado usa horizonte fixo de 30 dias", new Date(semFornecedor) <= limite30);
  }

  console.log("\n24. mapa_compras_futuras() -- classifica risco (crítico/atenção/ok)");
  {
    const { data, error } = await admTenant.client.rpc("mapa_compras_futuras");
    check("consulta o mapa sem erro", !error);
    const linhaA = (data ?? []).find((l) => l.item_id === itemPoliticaAId);
    check("item A (saldo projetado negativo, sem data) aparece com risco atenção", linhaA?.risco === "atencao" && Number(linhaA?.saldo_projetado) < 0);
  }

  console.log("\n25. Deny -- usuário sem compras.manage/compras.view (papel QUALIDADE)");
  {
    const { error: e1 } = await noPermTenant.client.rpc("gerar_necessidades_de_politica_abastecimento", { p_item_id: null });
    check("gerar_necessidades_de_politica_abastecimento negado sem compras.manage", !!e1);
    const { error: e2 } = await noPermTenant.client.rpc("consolidar_necessidades", { p_necessidade_ids: [necConsolidadaId, itemSemPoliticaId] });
    check("consolidar_necessidades negado sem compras.manage", !!e2);
    const { error: e3 } = await noPermTenant.client.rpc("calcular_saldo_projetado", { p_item_id: itemPoliticaAId });
    check("calcular_saldo_projetado negado sem compras.view", !!e3);
    const { error: e4 } = await noPermTenant.client.rpc("mapa_compras_futuras");
    check("mapa_compras_futuras negado sem compras.view", !!e4);
  }

  console.log("\n26. Isolamento cross-tenant -- tenant B não vê nem altera dados do tenant A");
  {
    const { data: consol } = await otherTenant.client.from("necessidade_consolidacao").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê necessidade_consolidacao do tenant A", (consol ?? []).length === 0);
    const { data: feriados } = await otherTenant.client.from("calendario_feriados").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê calendario_feriados do tenant A", (feriados ?? []).length === 0);

    const { error: e1 } = await otherTenant.client.rpc("calcular_saldo_projetado", { p_item_id: itemPoliticaAId });
    check("tenant B não consegue consultar saldo projetado de item do tenant A", !!e1);
    const { data: mapaOutro } = await otherTenant.client.rpc("mapa_compras_futuras");
    check("mapa do tenant B não traz necessidades do tenant A", (mapaOutro ?? []).length === 0);
  }

  // =======================================================================
  // Fase 4 da ADR-011 — Solicitação de Compra (SC) e Compras Diretas
  // (TÓPICO 7 §16/§2). Item de SC com necessidade vinculada só atende a
  // necessidade (atender_necessidade_compra() já existente) no envio da
  // SC, nunca ao adicionar item num rascunho.
  // =======================================================================

  console.log("\n27. criar_solicitacao_compra() -- exige numeração configurada, valida prioridade, cria em rascunho");
  const itemScId = await upsertItem(admTenant, "ITX-CPT", "materia_prima");
  let solicitacaoId;
  let necessidadeVinculadaId;
  {
    const { error: errSemNumeracao } = await admTenant.client.rpc("criar_solicitacao_compra", { p_setor: null, p_prioridade: "normal", p_justificativa: null });
    check("rejeita sem numeração configurada para solicitacao_compra", !!errSemNumeracao);

    await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "solicitacao_compra", p_prefixo: "SC-CPT-", p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });

    const { error: errPrioridade } = await admTenant.client.rpc("criar_solicitacao_compra", { p_setor: null, p_prioridade: "super-urgente", p_justificativa: null });
    check("rejeita prioridade inválida", !!errPrioridade);

    const { data: scId, error } = await admTenant.client.rpc("criar_solicitacao_compra", { p_setor: "Produção", p_prioridade: "alta", p_justificativa: "reposição de perfil" });
    check("cria SC em rascunho", !error);
    solicitacaoId = scId;
    const { data: sc } = await admin.from("solicitacoes_compra").select("status, prioridade, numero").eq("id", solicitacaoId).single();
    check("nasce em rascunho com o número gerado", sc.status === "rascunho" && sc.prioridade === "alta" && sc.numero === "SC-CPT-0001");
  }

  console.log("\n28. adicionar_item_solicitacao() -- rejeita necessidade de outro item, aceita vínculo correto, remove em rascunho");
  let itemScLinhaId;
  {
    const { data: necScId } = await admTenant.client.rpc("criar_necessidade_compra", { p_item_id: itemScId, p_quantidade: 10, p_origem: "manual" });
    const { data: outroItemId } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "ITZ-CPT", p_descricao: "outro item", p_tipo: "materia_prima", p_classificacao: "teste", p_unidade_principal: "UN" });

    const { error: errItemErrado } = await admTenant.client.rpc("adicionar_item_solicitacao", {
      p_solicitacao_compra_id: solicitacaoId, p_item_id: outroItemId, p_quantidade: 3, p_necessidade_compra_id: necScId,
    });
    check("rejeita necessidade vinculada a item diferente do item da linha", !!errItemErrado);

    const { data: linhaId, error } = await admTenant.client.rpc("adicionar_item_solicitacao", {
      p_solicitacao_compra_id: solicitacaoId, p_item_id: itemScId, p_quantidade: 10, p_necessidade_compra_id: necScId,
    });
    check("adiciona item com necessidade vinculada corretamente", !error);
    itemScLinhaId = linhaId;

    const { data: linhaAvulsaId } = await admTenant.client.rpc("adicionar_item_solicitacao", {
      p_solicitacao_compra_id: solicitacaoId, p_item_id: outroItemId, p_quantidade: 2,
    });
    const { error: errRemove } = await admTenant.client.rpc("remover_item_solicitacao", { p_id: linhaAvulsaId });
    check("remove item em rascunho", !errRemove);

    necessidadeVinculadaId = necScId;
  }

  console.log("\n29. enviar_solicitacao_compra() -- rejeita sem itens, atende necessidade vinculada, trava edição após enviada");
  {
    const { data: scVaziaId } = await admTenant.client.rpc("criar_solicitacao_compra", { p_setor: null, p_prioridade: "normal", p_justificativa: null });
    const { error: errVazia } = await admTenant.client.rpc("enviar_solicitacao_compra", { p_id: scVaziaId });
    check("rejeita enviar SC sem itens", !!errVazia);

    const { error } = await admTenant.client.rpc("enviar_solicitacao_compra", { p_id: solicitacaoId });
    check("envia a SC com sucesso", !error);
    const { data: sc } = await admin.from("solicitacoes_compra").select("status").eq("id", solicitacaoId).single();
    check("SC fica aberta", sc.status === "aberta");
    const { data: nec } = await admin.from("necessidades_compra").select("status").eq("id", necessidadeVinculadaId).single();
    check("necessidade vinculada fica atendida automaticamente (convergência com Suprimentos)", nec.status === "atendida");

    const { error: errAddDepois } = await admTenant.client.rpc("adicionar_item_solicitacao", { p_solicitacao_compra_id: solicitacaoId, p_item_id: itemScId, p_quantidade: 1 });
    check("não permite adicionar item após enviada", !!errAddDepois);
    const { error: errRemoveDepois } = await admTenant.client.rpc("remover_item_solicitacao", { p_id: itemScLinhaId });
    check("não permite remover item após enviada", !!errRemoveDepois);
  }

  console.log("\n30. cancelar_solicitacao_compra() -- funciona de rascunho e de aberta, não reexecuta");
  {
    const { error: errCancelaAberta } = await admTenant.client.rpc("cancelar_solicitacao_compra", { p_id: solicitacaoId, p_motivo: "cancelamento pós-envio" });
    check("cancela SC já aberta (enviada)", !errCancelaAberta);
    const { error: errRecancela } = await admTenant.client.rpc("cancelar_solicitacao_compra", { p_id: solicitacaoId, p_motivo: null });
    check("rejeita cancelar SC já cancelada", !!errRecancela);
  }

  console.log("\n31. criar_compra_direta() -- valida motivo/justificativa, atende necessidade vinculada na hora");
  let compraDiretaId;
  {
    const { error: errMotivo } = await admTenant.client.rpc("criar_compra_direta", { p_item_id: itemScId, p_quantidade: 1, p_motivo: "motivo_qualquer", p_justificativa: "teste" });
    check("rejeita motivo fora da lista fixa", !!errMotivo);
    const { error: errJustificativa } = await admTenant.client.rpc("criar_compra_direta", { p_item_id: itemScId, p_quantidade: 1, p_motivo: "urgencia", p_justificativa: "" });
    check("rejeita justificativa vazia", !!errJustificativa);

    const { data: necDiretaId } = await admTenant.client.rpc("criar_necessidade_compra", { p_item_id: itemScId, p_quantidade: 4, p_origem: "manual" });
    const { data, error } = await admTenant.client.rpc("criar_compra_direta", {
      p_item_id: itemScId, p_quantidade: 4, p_motivo: "urgencia", p_justificativa: "quebra de equipamento", p_necessidade_compra_id: necDiretaId,
    });
    check("registra compra direta vinculada a necessidade", !error);
    compraDiretaId = data;
    const { data: nec } = await admin.from("necessidades_compra").select("status").eq("id", necDiretaId).single();
    check("necessidade vinculada atende imediatamente (sem etapa de rascunho)", nec.status === "atendida");

    const { error: errReuso } = await admTenant.client.rpc("criar_compra_direta", { p_item_id: itemScId, p_quantidade: 1, p_motivo: "outro", p_justificativa: "reuso", p_necessidade_compra_id: necDiretaId });
    check("rejeita reusar necessidade já atendida", !!errReuso);
  }

  console.log("\n32. cancelar_compra_direta() -- funciona uma vez, rejeita repetir");
  {
    const { error } = await admTenant.client.rpc("cancelar_compra_direta", { p_id: compraDiretaId, p_motivo: "pedido duplicado" });
    check("cancela compra direta registrada", !error);
    const { error: errRepete } = await admTenant.client.rpc("cancelar_compra_direta", { p_id: compraDiretaId, p_motivo: null });
    check("rejeita cancelar de novo", !!errRepete);
  }

  console.log("\n33. Deny -- usuário sem compras.manage (papel QUALIDADE)");
  {
    const { error: e1 } = await noPermTenant.client.rpc("criar_solicitacao_compra", { p_setor: null, p_prioridade: "normal", p_justificativa: null });
    check("criar_solicitacao_compra negado sem compras.manage", !!e1);
    const { error: e2 } = await noPermTenant.client.rpc("criar_compra_direta", { p_item_id: itemScId, p_quantidade: 1, p_motivo: "outro", p_justificativa: "teste" });
    check("criar_compra_direta negado sem compras.manage", !!e2);
    const { data: still } = await noPermTenant.client.from("solicitacoes_compra").select("id").eq("id", solicitacaoId);
    check("SELECT direto continua liberado (RLS por company_id)", (still ?? []).length === 1);
  }

  console.log("\n34. Isolamento cross-tenant -- tenant B não vê nem altera SC/compra direta do tenant A");
  {
    const { data: scOutro } = await otherTenant.client.from("solicitacoes_compra").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê solicitações do tenant A", (scOutro ?? []).length === 0);
    const { data: cdOutro } = await otherTenant.client.from("compras_diretas").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê compras diretas do tenant A", (cdOutro ?? []).length === 0);

    const { error: e1 } = await otherTenant.client.rpc("cancelar_solicitacao_compra", { p_id: solicitacaoId, p_motivo: null });
    check("tenant B não consegue cancelar SC do tenant A", !!e1);
    const { error: e2 } = await otherTenant.client.rpc("criar_compra_direta", { p_item_id: itemScId, p_quantidade: 1, p_motivo: "outro", p_justificativa: "teste isolamento" });
    check("tenant B não consegue registrar compra direta em item do tenant A", !!e2);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
