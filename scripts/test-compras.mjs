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

  // =======================================================================
  // Fase 5 da ADR-011 — cotação, negociação, histórico de preços, custo
  // total de aquisição e alçada de aprovação multi-etapa (TÓPICO 7
  // §17-§23). custo_unitario é objetivo (preço - desconto + impostos +
  // frete, por unidade), sem score ponderado subjetivo -- qualquer
  // proposta pode ser selecionada, sempre com justificativa.
  // =======================================================================

  console.log("\n35. criar_cotacao_de_solicitacao() -- exige SC enviada, cria a partir dos itens");
  // Aprovadores precisam do papel específico da etapa (checado por decidir_etapa_aprovacao_compra)
  // E de compras.manage como gate de base (assert_tenant_write) -- por isso também ganham ADMIN,
  // mesmo padrão usado no cenário SQL standalone que validou este fluxo antes deste commit.
  const aprov1Tenant = await createTenant("compras-test-admin", "Compras Aprovador Etapa 1", "cp10", "COMERCIAL", admTenant.company);
  const aprov2Tenant = await createTenant("compras-test-admin", "Compras Aprovador Etapa 2", "cp11", "PRODUCAO", admTenant.company);
  const { data: adminRoleRow } = await admin.from("roles").select("id").is("company_id", null).eq("key", "ADMIN").single();
  await admin.from("user_roles").insert({ profile_id: aprov1Tenant.userId, role_id: adminRoleRow.id });
  await admin.from("user_roles").insert({ profile_id: aprov2Tenant.userId, role_id: adminRoleRow.id });
  const itemCotId = await upsertItem(admTenant, "ITQ-CPT", "materia_prima");
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "cotacao", p_prefixo: "COT-CPT-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  let cotacaoId;
  let cotacaoItemId;
  {
    const { data: scCotId } = await admTenant.client.rpc("criar_solicitacao_compra", { p_setor: "Produção", p_prioridade: "alta", p_justificativa: null });
    const { error: errRascunho } = await admTenant.client.rpc("criar_cotacao_de_solicitacao", { p_solicitacao_compra_id: scCotId, p_item_ids: null });
    check("rejeita cotar SC em rascunho", !!errRascunho);

    await admTenant.client.rpc("adicionar_item_solicitacao", { p_solicitacao_compra_id: scCotId, p_item_id: itemCotId, p_quantidade: 100 });
    await admTenant.client.rpc("enviar_solicitacao_compra", { p_id: scCotId });

    const { data: cotId, error } = await admTenant.client.rpc("criar_cotacao_de_solicitacao", { p_solicitacao_compra_id: scCotId, p_item_ids: null });
    check("cria cotação a partir da SC enviada", !error);
    cotacaoId = cotId;
    const { data: itensCot } = await admin.from("cotacao_itens").select("id").eq("cotacao_id", cotacaoId);
    cotacaoItemId = itensCot[0].id;
  }

  console.log("\n36. registrar_proposta_cotacao() -- rejeita pessoa sem papel FORNECEDOR, calcula custo_unitario, upsert atualiza e alimenta histórico");
  const fornAlfaCotId = await upsertPessoa(admTenant, "10", "Fornecedor Cotação Alfa", "FORNECEDOR");
  const fornBetaCotId = await upsertPessoa(admTenant, "11", "Fornecedor Cotação Beta", "FORNECEDOR");
  let propAlfaId;
  {
    const { error: errSemPapel } = await admTenant.client.rpc("registrar_proposta_cotacao", { p_cotacao_item_id: cotacaoItemId, p_pessoa_id: pessoaClienteId, p_preco_unitario: 10 });
    check("rejeita fornecedor sem papel FORNECEDOR ativo", !!errSemPapel);

    const { data, error } = await admTenant.client.rpc("registrar_proposta_cotacao", {
      p_cotacao_item_id: cotacaoItemId, p_pessoa_id: fornAlfaCotId, p_preco_unitario: 10, p_desconto: 1, p_impostos: 0.5, p_frete: 0.5,
    });
    check("registra proposta com custo_unitario calculado (10 - 1 + 0.5 + 0.5 = 10)", !error);
    propAlfaId = data;
    const { data: row } = await admin.from("cotacao_propostas").select("custo_unitario").eq("id", propAlfaId).single();
    check("custo_unitario correto", Number(row.custo_unitario) === 10);

    const { data: reenvio } = await admTenant.client.rpc("registrar_proposta_cotacao", { p_cotacao_item_id: cotacaoItemId, p_pessoa_id: fornAlfaCotId, p_preco_unitario: 9.5 });
    check("reenviar proposta do mesmo fornecedor faz upsert (mesmo id)", reenvio === propAlfaId);
    const { data: hist } = await admin.from("historico_precos_item_fornecedor").select("id").eq("item_id", itemCotId).eq("pessoa_id", fornAlfaCotId);
    check("histórico de preços registra cada envio (2 linhas)", (hist ?? []).length === 2);
  }

  console.log("\n37. registrar_negociacao_cotacao() -- reduz preço, atualiza custo_unitario, registra rodada");
  let propBetaId;
  {
    const { data } = await admTenant.client.rpc("registrar_proposta_cotacao", { p_cotacao_item_id: cotacaoItemId, p_pessoa_id: fornBetaCotId, p_preco_unitario: 8 });
    propBetaId = data;

    const { error } = await admTenant.client.rpc("registrar_negociacao_cotacao", { p_cotacao_proposta_id: propBetaId, p_preco_novo: 7.5, p_observacao: "fechou por volume" });
    check("registra rodada de negociação", !error);
    const { data: row } = await admin.from("cotacao_propostas").select("preco_unitario, custo_unitario").eq("id", propBetaId).single();
    check("proposta reflete o preço negociado", Number(row.preco_unitario) === 7.5 && Number(row.custo_unitario) === 7.5);
    const { data: negRows } = await admin.from("cotacao_negociacoes").select("rodada, preco_anterior, preco_novo").eq("cotacao_proposta_id", propBetaId);
    check("negociação registra rodada 1 com preço anterior correto", negRows.length === 1 && negRows[0].rodada === 1 && Number(negRows[0].preco_anterior) === 8);
  }

  console.log("\n38. selecionar_fornecedor_cotacao() -- exige justificativa, valida quantidade, permite split (§18)");
  {
    const { error: errSemJustificativa } = await admTenant.client.rpc("selecionar_fornecedor_cotacao", { p_cotacao_item_id: cotacaoItemId, p_cotacao_proposta_id: propBetaId, p_quantidade: 60, p_justificativa: "" });
    check("rejeita justificativa vazia", !!errSemJustificativa);

    const { error: e1 } = await admTenant.client.rpc("selecionar_fornecedor_cotacao", { p_cotacao_item_id: cotacaoItemId, p_cotacao_proposta_id: propBetaId, p_quantidade: 60, p_justificativa: "melhor preço para o grosso" });
    check("seleciona parte da quantidade com Beta", !e1);
    const { error: errExcede } = await admTenant.client.rpc("selecionar_fornecedor_cotacao", { p_cotacao_item_id: cotacaoItemId, p_cotacao_proposta_id: propAlfaId, p_quantidade: 50, p_justificativa: "excede" });
    check("rejeita quantidade que excede o restante do item", !!errExcede);
    const { error: e2 } = await admTenant.client.rpc("selecionar_fornecedor_cotacao", { p_cotacao_item_id: cotacaoItemId, p_cotacao_proposta_id: propAlfaId, p_quantidade: 40, p_justificativa: "restante com Alfa, prazo melhor" });
    check("seleciona o restante com Alfa (split completo)", !e2);
  }

  console.log("\n39. concluir_selecao_cotacao() -- sem alçada configurada, aprova automaticamente");
  let aprovacaoId;
  {
    // valor = 60 * 7.5 (Beta pós-negociação) + 40 * 9.5 (Alfa pós-upsert) = 450 + 380 = 830
    const { error } = await admTenant.client.rpc("concluir_selecao_cotacao", { p_id: cotacaoId });
    check("conclui a seleção sem erro", !error);
    const { data: cot } = await admin.from("cotacoes").select("status, aprovacao_id").eq("id", cotacaoId).single();
    check("cotação fica selecionada com aprovacao_id preenchido", cot.status === "selecionada" && !!cot.aprovacao_id);
    aprovacaoId = cot.aprovacao_id;
    const { data: aprov } = await admin.from("compras_aprovacoes").select("status, valor").eq("id", aprovacaoId).single();
    check("sem alçada configurada, aprovação é automática com valor correto (830)", aprov.status === "aprovada" && Number(aprov.valor) === 830);

    const { error: errRepete } = await admTenant.client.rpc("concluir_selecao_cotacao", { p_id: cotacaoId });
    check("rejeita concluir cotação já concluída", !!errRepete);
  }

  console.log("\n40. upsert_alcada_compra() -- 2 etapas multi-perfil, aprovação fica pendente com etapas na ordem certa");
  const { data: comercialRole } = await admin.from("roles").select("id").is("company_id", null).eq("key", "COMERCIAL").single();
  const { data: producaoRole } = await admin.from("roles").select("id").is("company_id", null).eq("key", "PRODUCAO").single();
  let etapa1Id;
  let etapa2Id;
  let cotacao2Id;
  {
    await admTenant.client.rpc("upsert_alcada_compra", { p_processo: "cotacao", p_ordem: 1, p_valor_minimo: 0, p_role_id: comercialRole.id, p_ativo: true });
    await admTenant.client.rpc("upsert_alcada_compra", { p_processo: "cotacao", p_ordem: 2, p_valor_minimo: 500, p_role_id: producaoRole.id, p_ativo: true });

    const { data: scId2 } = await admTenant.client.rpc("criar_solicitacao_compra", { p_setor: null, p_prioridade: "urgente", p_justificativa: null });
    await admTenant.client.rpc("adicionar_item_solicitacao", { p_solicitacao_compra_id: scId2, p_item_id: itemCotId, p_quantidade: 100 });
    await admTenant.client.rpc("enviar_solicitacao_compra", { p_id: scId2 });
    const { data: cotId2 } = await admTenant.client.rpc("criar_cotacao_de_solicitacao", { p_solicitacao_compra_id: scId2, p_item_ids: null });
    cotacao2Id = cotId2;
    const { data: itensCot2 } = await admin.from("cotacao_itens").select("id").eq("cotacao_id", cotacao2Id);
    const { data: propUnica } = await admTenant.client.rpc("registrar_proposta_cotacao", { p_cotacao_item_id: itensCot2[0].id, p_pessoa_id: fornAlfaCotId, p_preco_unitario: 10 });
    await admTenant.client.rpc("selecionar_fornecedor_cotacao", { p_cotacao_item_id: itensCot2[0].id, p_cotacao_proposta_id: propUnica, p_quantidade: 100, p_justificativa: "único fornecedor" });
    await admTenant.client.rpc("concluir_selecao_cotacao", { p_id: cotacao2Id });

    const { data: cot2 } = await admin.from("cotacoes").select("aprovacao_id").eq("id", cotacao2Id).single();
    const { data: aprov2 } = await admin.from("compras_aprovacoes").select("status, valor").eq("id", cot2.aprovacao_id).single();
    check("valor 1000 (>= 500) exige as 2 etapas -- aprovação fica pendente", aprov2.status === "pendente" && Number(aprov2.valor) === 1000);

    const { data: etapas } = await admin.from("compras_aprovacao_etapas").select("id, ordem").eq("compra_aprovacao_id", cot2.aprovacao_id).order("ordem");
    check("2 etapas criadas na ordem certa", etapas.length === 2 && etapas[0].ordem === 1 && etapas[1].ordem === 2);
    etapa1Id = etapas[0].id;
    etapa2Id = etapas[1].id;
  }

  console.log("\n41. decidir_etapa_aprovacao_compra() -- ordem, perfil, e conclusão sequencial");
  {
    const { error: errFora } = await aprov2Tenant.client.rpc("decidir_etapa_aprovacao_compra", { p_etapa_id: etapa2Id, p_decisao: "aprovar" });
    check("rejeita decidir etapa 2 antes da etapa 1", !!errFora);

    const { error: errPerfil } = await aprov2Tenant.client.rpc("decidir_etapa_aprovacao_compra", { p_etapa_id: etapa1Id, p_decisao: "aprovar" });
    check("rejeita perfil errado (PRODUCAO tentando etapa da COMERCIAL)", !!errPerfil);

    const { error: e1 } = await aprov1Tenant.client.rpc("decidir_etapa_aprovacao_compra", { p_etapa_id: etapa1Id, p_decisao: "aprovar", p_observacao: "ok" });
    check("perfil COMERCIAL aprova a etapa 1", !e1);
    const { data: cot2 } = await admin.from("cotacoes").select("aprovacao_id").eq("id", cotacao2Id).single();
    const { data: aprovMeio } = await admin.from("compras_aprovacoes").select("status").eq("id", cot2.aprovacao_id).single();
    check("aprovação ainda pendente (falta etapa 2)", aprovMeio.status === "pendente");

    const { error: e2 } = await aprov2Tenant.client.rpc("decidir_etapa_aprovacao_compra", { p_etapa_id: etapa2Id, p_decisao: "aprovar" });
    check("perfil PRODUCAO aprova a etapa 2", !e2);
    const { data: aprovFinal } = await admin.from("compras_aprovacoes").select("status").eq("id", cot2.aprovacao_id).single();
    check("aprovação completa após a última etapa", aprovFinal.status === "aprovada");

    const { error: errRedecide } = await aprov2Tenant.client.rpc("decidir_etapa_aprovacao_compra", { p_etapa_id: etapa2Id, p_decisao: "aprovar" });
    check("rejeita decidir etapa já decidida", !!errRedecide);
  }

  console.log("\n42. Rejeição de etapa mata a aprovação inteira (short-circuit)");
  {
    const { data: scId3 } = await admTenant.client.rpc("criar_solicitacao_compra", { p_setor: null, p_prioridade: "normal", p_justificativa: null });
    await admTenant.client.rpc("adicionar_item_solicitacao", { p_solicitacao_compra_id: scId3, p_item_id: itemCotId, p_quantidade: 50 });
    await admTenant.client.rpc("enviar_solicitacao_compra", { p_id: scId3 });
    const { data: cotId3 } = await admTenant.client.rpc("criar_cotacao_de_solicitacao", { p_solicitacao_compra_id: scId3, p_item_ids: null });
    const { data: itensCot3 } = await admin.from("cotacao_itens").select("id").eq("cotacao_id", cotId3);
    const { data: prop3 } = await admTenant.client.rpc("registrar_proposta_cotacao", { p_cotacao_item_id: itensCot3[0].id, p_pessoa_id: fornAlfaCotId, p_preco_unitario: 20 });
    await admTenant.client.rpc("selecionar_fornecedor_cotacao", { p_cotacao_item_id: itensCot3[0].id, p_cotacao_proposta_id: prop3, p_quantidade: 50, p_justificativa: "único" });
    await admTenant.client.rpc("concluir_selecao_cotacao", { p_id: cotId3 });
    const { data: cot3 } = await admin.from("cotacoes").select("aprovacao_id").eq("id", cotId3).single();
    const { data: etapasCot3 } = await admin.from("compras_aprovacao_etapas").select("id").eq("compra_aprovacao_id", cot3.aprovacao_id).eq("ordem", 1).single();

    await aprov1Tenant.client.rpc("decidir_etapa_aprovacao_compra", { p_etapa_id: etapasCot3.id, p_decisao: "rejeitar", p_observacao: "orçamento estourado" });
    const { data: aprovRejeitada } = await admin.from("compras_aprovacoes").select("status").eq("id", cot3.aprovacao_id).single();
    check("rejeição de uma etapa rejeita a aprovação inteira, sem precisar decidir as demais", aprovRejeitada.status === "rejeitada");
  }

  console.log("\n43. desativar_alcada_compra() e cancelar_cotacao()");
  {
    const { data: alcadas } = await admin.from("compras_alcada_etapas").select("id").eq("company_id", admTenant.company.id).eq("ordem", 2);
    const { error } = await admTenant.client.rpc("desativar_alcada_compra", { p_id: alcadas[0].id });
    check("desativa etapa de alçada", !error);
    const { data: row } = await admin.from("compras_alcada_etapas").select("ativo").eq("id", alcadas[0].id).single();
    check("etapa fica inativa", row.ativo === false);

    const { data: scId4 } = await admTenant.client.rpc("criar_solicitacao_compra", { p_setor: null, p_prioridade: "normal", p_justificativa: null });
    await admTenant.client.rpc("adicionar_item_solicitacao", { p_solicitacao_compra_id: scId4, p_item_id: itemCotId, p_quantidade: 5 });
    await admTenant.client.rpc("enviar_solicitacao_compra", { p_id: scId4 });
    const { data: cotId4 } = await admTenant.client.rpc("criar_cotacao_de_solicitacao", { p_solicitacao_compra_id: scId4, p_item_ids: null });
    const { error: errCancel } = await admTenant.client.rpc("cancelar_cotacao", { p_id: cotId4, p_motivo: "não precisa mais" });
    check("cancela cotação aberta", !errCancel);
    const { error: errCancelSelecionada } = await admTenant.client.rpc("cancelar_cotacao", { p_id: cotacaoId, p_motivo: null });
    check("rejeita cancelar cotação já selecionada", !!errCancelSelecionada);
  }

  console.log("\n44. Deny -- usuário sem compras.manage (papel QUALIDADE)");
  {
    const { error: e1 } = await noPermTenant.client.rpc("registrar_proposta_cotacao", { p_cotacao_item_id: cotacaoItemId, p_pessoa_id: fornAlfaCotId, p_preco_unitario: 1 });
    check("registrar_proposta_cotacao negado sem compras.manage", !!e1);
    const { error: e2 } = await noPermTenant.client.rpc("upsert_alcada_compra", { p_processo: "cotacao", p_ordem: 9, p_valor_minimo: 0, p_role_id: comercialRole.id });
    check("upsert_alcada_compra negado sem compras.manage", !!e2);
    const { data: still } = await noPermTenant.client.from("cotacoes").select("id").eq("id", cotacaoId);
    check("SELECT direto continua liberado (RLS por company_id)", (still ?? []).length === 1);
  }

  console.log("\n45. Isolamento cross-tenant -- tenant B não vê nem altera cotações/alçada do tenant A");
  {
    const { data: cotOutro } = await otherTenant.client.from("cotacoes").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê cotações do tenant A", (cotOutro ?? []).length === 0);
    const { data: alcadaOutro } = await otherTenant.client.from("compras_alcada_etapas").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê alçada do tenant A", (alcadaOutro ?? []).length === 0);

    const { error: e1 } = await otherTenant.client.rpc("registrar_proposta_cotacao", { p_cotacao_item_id: cotacaoItemId, p_pessoa_id: fornAlfaCotId, p_preco_unitario: 1 });
    check("tenant B não consegue registrar proposta em item do tenant A", !!e1);
    const { error: e2 } = await otherTenant.client.rpc("decidir_etapa_aprovacao_compra", { p_etapa_id: etapa1Id, p_decisao: "aprovar" });
    check("tenant B não consegue decidir etapa de aprovação do tenant A", !!e2);
  }

  // =======================================================================
  // Fase 6 da ADR-011 — Pedido de Compra formal, compras recorrentes via
  // contrato de fornecedor (T18) e orçado×comprometido×realizado
  // (TÓPICO 7 §24/§25/§33). Reaproveita a cotação já concluída e aprovada
  // automaticamente na Fase 5 (cotacaoId, split Alfa 40 + Beta 60, sem
  // alçada configurada naquele momento) — não recria todo o pipeline de
  // SC/cotação só pra esta fase.
  // =======================================================================

  console.log("\n46. gerar_pedido_compra_de_cotacao() -- 1 PC por fornecedor distinto, idempotência");
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido_compra", p_prefixo: "PC-CPT-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "titulo_compra", p_prefixo: "TCP-CPT-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  let pcAlfaId;
  {
    const { data: pcIds, error } = await admTenant.client.rpc("gerar_pedido_compra_de_cotacao", { p_cotacao_id: cotacaoId });
    check("gera pedido(s) de compra a partir da cotação aprovada", !error && Array.isArray(pcIds) && pcIds.length === 2);

    const { data: pcs } = await admin.from("pedidos_compra").select("id, pessoa_id").eq("cotacao_id", cotacaoId);
    check("1 PC por fornecedor distinto (Alfa e Beta)", pcs.length === 2 && new Set(pcs.map((p) => p.pessoa_id)).size === 2);
    pcAlfaId = pcs.find((p) => p.pessoa_id === fornAlfaCotId).id;

    const { data: itensAlfa } = await admin.from("pedido_compra_itens").select("quantidade, preco_unitario").eq("pedido_compra_id", pcAlfaId);
    check("PC do fornecedor Alfa reflete a quantidade e preço selecionados (40 x 9.5)", itensAlfa.length === 1 && Number(itensAlfa[0].quantidade) === 40 && Number(itensAlfa[0].preco_unitario) === 9.5);

    const { error: errRepete } = await admTenant.client.rpc("gerar_pedido_compra_de_cotacao", { p_cotacao_id: cotacaoId });
    check("rejeita gerar PC de novo pra mesma cotação", !!errRepete);
  }

  console.log("\n47. atualizar_status_pedido_compra() -- transições válidas e inválidas");
  {
    const { error: errStatusInvalido } = await admTenant.client.rpc("atualizar_status_pedido_compra", { p_id: pcAlfaId, p_status: "emitido" });
    check("rejeita status alvo inválido (emitido não é transição possível)", !!errStatusInvalido);

    const { error } = await admTenant.client.rpc("atualizar_status_pedido_compra", { p_id: pcAlfaId, p_status: "confirmado" });
    check("confirma o PC", !error);
    const { data: pc } = await admin.from("pedidos_compra").select("status").eq("id", pcAlfaId).single();
    check("PC fica confirmado", pc.status === "confirmado");

    const { error: errRepete } = await admTenant.client.rpc("atualizar_status_pedido_compra", { p_id: pcAlfaId, p_status: "confirmado" });
    check("rejeita repetir a mesma transição", !!errRepete);
  }

  console.log("\n48. vincular_pedido_compra_contrato() -- valida tipo/fornecedor/status do contrato");
  {
    await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "contrato", p_prefixo: "CTR-CPT-", p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
    // Alfa ganha também papel CLIENTE só pra permitir um contrato tipo!=fornecedor válido (upsert_contrato exige o papel compatível com o tipo).
    await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: fornAlfaCotId, p_papel: "CLIENTE", p_ativo: true });
    const { data: contratoClienteId } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: fornAlfaCotId, p_obra_id: null, p_pedido_id: null, p_funcionario_id: null,
      p_objeto: "objeto teste", p_data_inicio: null, p_data_fim: null, p_renovacao: "manual", p_valor: null, p_forma_pagamento: null, p_observacoes: null,
    });
    const { error: errTipo } = await admTenant.client.rpc("vincular_pedido_compra_contrato", { p_pedido_compra_id: pcAlfaId, p_contrato_id: contratoClienteId });
    check("rejeita contrato de tipo diferente de fornecedor", !!errTipo);

    const { data: contratoBetaId } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "fornecedor", p_pessoa_id: fornBetaCotId, p_obra_id: null, p_pedido_id: null, p_funcionario_id: null,
      p_objeto: "contrato fornecedor errado", p_data_inicio: null, p_data_fim: null, p_renovacao: "manual", p_valor: null, p_forma_pagamento: null, p_observacoes: null,
    });
    const { error: errFornecedorErrado } = await admTenant.client.rpc("vincular_pedido_compra_contrato", { p_pedido_compra_id: pcAlfaId, p_contrato_id: contratoBetaId });
    check("rejeita contrato de outro fornecedor", !!errFornecedorErrado);

    const { data: contratoAlfaId } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "fornecedor", p_pessoa_id: fornAlfaCotId, p_obra_id: null, p_pedido_id: null, p_funcionario_id: null,
      p_objeto: "contrato Alfa recorrente", p_data_inicio: new Date().toISOString().slice(0, 10), p_data_fim: null, p_renovacao: "manual", p_valor: null, p_forma_pagamento: null, p_observacoes: null,
    });
    const { error: errRascunho } = await admTenant.client.rpc("vincular_pedido_compra_contrato", { p_pedido_compra_id: pcAlfaId, p_contrato_id: contratoAlfaId });
    check("rejeita contrato ainda em rascunho (não vigente)", !!errRascunho);

    await admTenant.client.rpc("ativar_contrato", { p_id: contratoAlfaId });
    const { error } = await admTenant.client.rpc("vincular_pedido_compra_contrato", { p_pedido_compra_id: pcAlfaId, p_contrato_id: contratoAlfaId });
    check("vincula contrato vigente do fornecedor correto", !error);
    const { data: pc } = await admin.from("pedidos_compra").select("contrato_id").eq("id", pcAlfaId).single();
    check("PC reflete o contrato vinculado", pc.contrato_id === contratoAlfaId);
  }

  console.log("\n49. programar_entrega_pedido_compra() -- soma não pode exceder o total do PC (40), permite múltiplas datas (recorrência)");
  {
    const { error: errExcede } = await admTenant.client.rpc("programar_entrega_pedido_compra", { p_pedido_compra_id: pcAlfaId, p_data_entrega: "2027-06-01", p_quantidade: 100 });
    check("rejeita quantidade que excede o total do PC", !!errExcede);

    await admTenant.client.rpc("programar_entrega_pedido_compra", { p_pedido_compra_id: pcAlfaId, p_data_entrega: "2027-06-01", p_quantidade: 15 });
    await admTenant.client.rpc("programar_entrega_pedido_compra", { p_pedido_compra_id: pcAlfaId, p_data_entrega: "2027-07-01", p_quantidade: 15 });
    await admTenant.client.rpc("programar_entrega_pedido_compra", { p_pedido_compra_id: pcAlfaId, p_data_entrega: "2027-08-01", p_quantidade: 10 });
    const { data: programacoes } = await admin.from("pedido_compra_programacoes").select("id").eq("pedido_compra_id", pcAlfaId);
    check("3 entregas programadas somando exatamente o total (recorrência via contrato, §25)", (programacoes ?? []).length === 3);

    const { error: errUltrapassa } = await admTenant.client.rpc("programar_entrega_pedido_compra", { p_pedido_compra_id: pcAlfaId, p_data_entrega: "2027-09-01", p_quantidade: 1 });
    check("rejeita programar além do total já alcançado", !!errUltrapassa);
  }

  console.log("\n50. upsert_orcamento_compra() + calcular_orcado_comprometido_realizado() -- comprometido e realizado corretos");
  let tituloId;
  {
    const { error: errValor } = await admTenant.client.rpc("upsert_orcamento_compra", { p_categoria: "teste", p_periodo_inicio: "2020-01-01", p_periodo_fim: "2030-12-31", p_valor_orcado: -1 });
    check("rejeita valor orçado negativo", !!errValor);

    const { data: orc1 } = await admTenant.client.rpc("upsert_orcamento_compra", { p_categoria: "teste", p_periodo_inicio: "2020-01-01", p_periodo_fim: "2030-12-31", p_valor_orcado: 1000 });
    const { data: orc2 } = await admTenant.client.rpc("upsert_orcamento_compra", { p_categoria: "teste", p_periodo_inicio: "2020-01-01", p_periodo_fim: "2030-12-31", p_valor_orcado: 1500 });
    check("upsert é idempotente por categoria+período (mesmo id)", orc1 === orc2);

    const { data: linha1 } = await admTenant.client.rpc("calcular_orcado_comprometido_realizado", { p_categoria: "teste", p_periodo_inicio: "2020-01-01", p_periodo_fim: "2030-12-31" });
    // comprometido: PC Alfa confirmado (40*9.5=380) + PC Beta emitido (60*7.5=450) = 830
    check("comprometido soma PCs emitidos/confirmados corretamente (830)", Number(linha1[0].comprometido) === 830 && Number(linha1[0].realizado) === 0);

    const { data: titIds } = await admTenant.client.rpc("gerar_titulos_pedido_compra", {
      p_pedido_compra_id: pcAlfaId, p_parcelas: [{ valor: 380, vencimento: "2027-01-01" }],
    });
    tituloId = titIds[0];
    await admTenant.client.rpc("registrar_pagamento_titulo_compra", { p_titulo_id: tituloId, p_valor: 380, p_data_pagamento: "2027-01-01" });

    const { data: linha2 } = await admTenant.client.rpc("calcular_orcado_comprometido_realizado", { p_categoria: "teste", p_periodo_inicio: "2020-01-01", p_periodo_fim: "2030-12-31" });
    check("realizado reflete o pagamento do título (380) -- nasce do Financeiro real", Number(linha2[0].realizado) === 380);
  }

  console.log("\n51. registrar_pagamento_titulo_compra() -- rejeita exceder o valor, rejeita título já pago");
  {
    const { error: errExcede } = await admTenant.client.rpc("registrar_pagamento_titulo_compra", { p_titulo_id: tituloId, p_valor: 1, p_data_pagamento: "2027-01-01" });
    check("rejeita pagamento em título já pago (excede o saldo)", !!errExcede);
  }

  console.log("\n52. Deny -- usuário sem compras.manage/financeiro.manage/financeiro.pagar (papel QUALIDADE)");
  {
    const { error: e1 } = await noPermTenant.client.rpc("atualizar_status_pedido_compra", { p_id: pcAlfaId, p_status: "cancelado" });
    check("atualizar_status_pedido_compra negado sem compras.manage", !!e1);
    const { error: e2 } = await noPermTenant.client.rpc("upsert_orcamento_compra", { p_categoria: "teste", p_periodo_inicio: "2020-01-01", p_periodo_fim: "2030-12-31", p_valor_orcado: 1 });
    check("upsert_orcamento_compra negado sem compras.manage", !!e2);
    const { error: e3 } = await noPermTenant.client.rpc("registrar_pagamento_titulo_compra", { p_titulo_id: tituloId, p_valor: 1 });
    check("registrar_pagamento_titulo_compra negado sem financeiro.pagar", !!e3);
    const { data: still } = await noPermTenant.client.from("pedidos_compra").select("id").eq("id", pcAlfaId);
    check("SELECT direto continua liberado (RLS por company_id)", (still ?? []).length === 1);
  }

  console.log("\n53. Isolamento cross-tenant -- tenant B não vê nem altera pedidos/títulos do tenant A");
  {
    const { data: pcOutro } = await otherTenant.client.from("pedidos_compra").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê pedidos de compra do tenant A", (pcOutro ?? []).length === 0);
    const { data: titOutro } = await otherTenant.client.from("titulos_pagar").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê títulos a pagar do tenant A", (titOutro ?? []).length === 0);

    const { error: e1 } = await otherTenant.client.rpc("atualizar_status_pedido_compra", { p_id: pcAlfaId, p_status: "cancelado" });
    check("tenant B não consegue alterar PC do tenant A", !!e1);
    const { error: e2 } = await otherTenant.client.rpc("registrar_pagamento_titulo_compra", { p_titulo_id: tituloId, p_valor: 1 });
    check("tenant B não consegue pagar título do tenant A", !!e2);
  }

  // =========================================================================
  // Fase 7 da ADR-011 (TÓPICO 7 §26-§31, §36) -- Recebimento completo,
  // conferência/qualidade, lote, divergência, devolução. Reaproveita pcAlfaId
  // da Fase 6 (40 unidades de itemCotId, já confirmado) -- não recria um PC
  // só pra esta fase. §28 usa tabelas próprias (divergencias_recebimento),
  // não inspecoes_qualidade/nao_conformidades (T8, hardwired a
  // ordens_producao -- ver comentário no topo da migration desta fase).
  // =========================================================================

  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "recebimento_compra", p_prefixo: "REC-CPT-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  const { data: pciAlfa } = await admin.from("pedido_compra_itens").select("id").eq("pedido_compra_id", pcAlfaId).single();
  const pciAlfaId = pciAlfa.id;

  console.log("\n54. registrar_recebimento_pedido_compra() -- rejeita exceder o total do item, sucesso parcial (25 de 40)");
  let rec1Id, ri1Id;
  {
    const { error: errExcede } = await admTenant.client.rpc("registrar_recebimento_pedido_compra", {
      p_pedido_compra_id: pcAlfaId, p_itens: [{ pedido_compra_item_id: pciAlfaId, quantidade_recebida: 41 }],
    });
    check("rejeita quantidade que excede o total do item do PC", !!errExcede);

    const { data: id, error } = await admTenant.client.rpc("registrar_recebimento_pedido_compra", {
      p_pedido_compra_id: pcAlfaId, p_itens: [{ pedido_compra_item_id: pciAlfaId, quantidade_recebida: 25 }],
      p_numero_nf: "NF-CPT-001", p_transportadora: "Transp. Teste", p_observacoes: "primeira remessa",
    });
    check("registra recebimento parcial com sucesso", !error);
    rec1Id = id;
    const { data: rec } = await admin.from("recebimentos_pedido_compra").select("status, numero").eq("id", rec1Id).single();
    check("recebimento nasce em_conferencia -- compra não significa estoque disponível (§26)", rec.status === "em_conferencia" && rec.numero === "REC-CPT-0001");

    const { data: itensRec } = await admin.from("recebimento_itens").select("id, quantidade_recebida, status").eq("recebimento_id", rec1Id);
    ri1Id = itensRec[0].id;
    check("item de recebimento reflete a quantidade parcial", itensRec.length === 1 && Number(itensRec[0].quantidade_recebida) === 25 && itensRec[0].status === "pendente");

    const { error: errExcedeAcumulado } = await admTenant.client.rpc("registrar_recebimento_pedido_compra", {
      p_pedido_compra_id: pcAlfaId, p_itens: [{ pedido_compra_item_id: pciAlfaId, quantidade_recebida: 20 }],
    });
    check("rejeita novo recebimento que, somado ao já recebido (25), excederia o total (40)", !!errExcedeAcumulado);
  }

  console.log("\n55. registrar_lote_recebimento() -- split em lotes, rejeita exceder a quantidade recebida");
  {
    await admTenant.client.rpc("registrar_lote_recebimento", { p_recebimento_item_id: ri1Id, p_numero_lote: "LOTE-A", p_quantidade: 15, p_data_validade: "2028-01-01" });
    const { error: errExcede } = await admTenant.client.rpc("registrar_lote_recebimento", { p_recebimento_item_id: ri1Id, p_numero_lote: "LOTE-B", p_quantidade: 15 });
    check("rejeita soma de lotes que excede a quantidade recebida (15+15 > 25)", !!errExcede);

    await admTenant.client.rpc("registrar_lote_recebimento", { p_recebimento_item_id: ri1Id, p_numero_lote: "LOTE-B", p_quantidade: 10 });
    const { data: lotes } = await admin.from("lotes_recebimento").select("id").eq("recebimento_item_id", ri1Id);
    check("2 lotes registrados somando exatamente a quantidade recebida (15+10=25)", (lotes ?? []).length === 2);
  }

  console.log("\n56. registrar_divergencia_recebimento() + tratar_divergencia() -- qualidade põe em quarentena, decisão aceitar/recusar");
  let div1Id, div2Id;
  {
    const { data: id1 } = await admTenant.client.rpc("registrar_divergencia_recebimento", {
      p_recebimento_item_id: ri1Id, p_tipo: "qualidade", p_descricao: "amostra fora do padrão, aguardando laudo",
    });
    div1Id = id1;
    const { data: itemQuarentena } = await admin.from("recebimento_itens").select("status").eq("id", ri1Id).single();
    check("divergência de qualidade põe o item em quarentena (§28)", itemQuarentena.status === "quarentena");

    const { data: id2 } = await admTenant.client.rpc("registrar_divergencia_recebimento", {
      p_recebimento_item_id: ri1Id, p_tipo: "quantidade_menor", p_descricao: "faltaram 5 unidades na caixa", p_quantidade_divergente: 5,
    });
    div2Id = id2;

    const { error: errDecisaoInvalida } = await admTenant.client.rpc("tratar_divergencia", { p_id: div1Id, p_decisao: "invalida" });
    check("rejeita decisão inválida", !!errDecisaoInvalida);

    await admTenant.client.rpc("tratar_divergencia", { p_id: div1Id, p_decisao: "aceitar", p_observacao: "laudo aprovou depois de tudo" });
    const { data: itemPosAceite } = await admin.from("recebimento_itens").select("status").eq("id", ri1Id).single();
    check("sai da quarentena só quando não há mais divergência aberta (ainda há a de quantidade)", itemPosAceite.status === "quarentena");

    await admTenant.client.rpc("tratar_divergencia", { p_id: div2Id, p_decisao: "recusar", p_observacao: "fornecedor confirmou falta" });
    const { data: itemPosRecusa } = await admin.from("recebimento_itens").select("status").eq("id", ri1Id).single();
    check("volta a pendente quando a última divergência aberta é tratada", itemPosRecusa.status === "pendente");

    const { error: errJaTratada } = await admTenant.client.rpc("tratar_divergencia", { p_id: div2Id, p_decisao: "aceitar" });
    check("rejeita tratar divergência já tratada", !!errJaTratada);
  }

  console.log("\n57. finalizar_conferencia_recebimento() -- sem divergência aberta, aplica ajustar_saldo(tipo=compra) e fecha o item");
  {
    const { error } = await admTenant.client.rpc("finalizar_conferencia_recebimento", { p_recebimento_id: rec1Id });
    check("finaliza com sucesso (todas as divergências já tratadas)", !error);

    const { data: item } = await admin.from("recebimento_itens").select("status, quantidade_aceita").eq("id", ri1Id).single();
    check("quantidade_aceita = 25 recebido - 5 recusado = 20, status conferido", item.status === "conferido" && Number(item.quantidade_aceita) === 20);

    const { data: saldo } = await admin.from("estoque_saldos").select("quantidade_fisica").eq("item_id", itemCotId).single();
    check("saldo físico reflete a entrada (20)", Number(saldo.quantidade_fisica) === 20);

    const { data: mov } = await admin.from("estoque_movimentacoes").select("tipo, quantidade").eq("item_id", itemCotId).eq("tipo", "compra");
    check("movimentação registrada com tipo=compra (§27, novo valor de estoque_movimentacoes.tipo)", mov.length === 1 && Number(mov[0].quantidade) === 20);

    const { error: errRepete } = await admTenant.client.rpc("finalizar_conferencia_recebimento", { p_recebimento_id: rec1Id });
    check("rejeita finalizar de novo (já conferido)", !!errRepete);
  }

  console.log("\n58. segundo recebimento (completa os 15 restantes, sem divergência) -- múltiplos recebimentos por PC (§27)");
  let ri2Id;
  {
    const { data: rec2Id } = await admTenant.client.rpc("registrar_recebimento_pedido_compra", {
      p_pedido_compra_id: pcAlfaId, p_itens: [{ pedido_compra_item_id: pciAlfaId, quantidade_recebida: 15 }], p_numero_nf: "NF-CPT-002",
    });
    const { data: itensRec2 } = await admin.from("recebimento_itens").select("id").eq("recebimento_id", rec2Id);
    ri2Id = itensRec2[0].id;

    const { error: errNaoConferido } = await admTenant.client.rpc("registrar_devolucao_compra", { p_recebimento_item_id: ri2Id, p_quantidade: 1, p_motivo: "item ainda não conferido" });
    check("rejeita devolução sobre item ainda não conferido (nunca entrou em estoque)", !!errNaoConferido);

    await admTenant.client.rpc("finalizar_conferencia_recebimento", { p_recebimento_id: rec2Id });
    const { data: saldo } = await admin.from("estoque_saldos").select("quantidade_fisica").eq("item_id", itemCotId).single();
    check("saldo acumula o segundo recebimento (20 + 15 = 35)", Number(saldo.quantidade_fisica) === 35);

    const { error: errDivergenciaTardia } = await admTenant.client.rpc("registrar_divergencia_recebimento", { p_recebimento_item_id: ri2Id, p_tipo: "avaria", p_descricao: "tardia" });
    check("rejeita registrar divergência em item já conferido", !!errDivergenciaTardia);
    const { error: errLoteTardio } = await admTenant.client.rpc("registrar_lote_recebimento", { p_recebimento_item_id: ri2Id, p_numero_lote: "X", p_quantidade: 1 });
    check("rejeita registrar lote em item já conferido", !!errLoteTardio);
  }

  console.log("\n59. registrar_devolucao_compra() -- sucesso sobre item conferido, rejeita exceder o aceito");
  {
    const { error: errExcede } = await admTenant.client.rpc("registrar_devolucao_compra", { p_recebimento_item_id: ri1Id, p_quantidade: 100, p_motivo: "devolução muito grande" });
    check("rejeita devolução maior que a quantidade aceita", !!errExcede);

    const { error } = await admTenant.client.rpc("registrar_devolucao_compra", { p_recebimento_item_id: ri1Id, p_quantidade: 8, p_motivo: "peça com defeito percebido depois", p_divergencia_id: div1Id });
    check("registra devolução com sucesso", !error);

    const { data: saldo } = await admin.from("estoque_saldos").select("quantidade_fisica").eq("item_id", itemCotId).single();
    check("saldo reduz com a devolução (35 - 8 = 27)", Number(saldo.quantidade_fisica) === 27);

    const { data: mov } = await admin.from("estoque_movimentacoes").select("quantidade").eq("item_id", itemCotId).eq("tipo", "devolucao");
    check("movimentação registrada com tipo=devolucao, quantidade sempre positiva (sinal vem do tipo)", mov.length === 1 && Number(mov[0].quantidade) === 8);

    const { error: errExcedeRestante } = await admTenant.client.rpc("registrar_devolucao_compra", { p_recebimento_item_id: ri1Id, p_quantidade: 15, p_motivo: "excede o que restou aceito (20-8=12 disponível)" });
    check("rejeita devolução que excede o que resta aceito e não devolvido", !!errExcedeRestante);
  }

  console.log("\n60. ajustar_saldo() -- regressão: chamada antiga de 3 argumentos posicionais continua funcionando (tipo default 'ajuste')");
  {
    const { data: movId, error } = await admTenant.client.rpc("ajustar_saldo", { p_item_id: itemCotId, p_quantidade_delta: 1000, p_motivo: "ajuste de regressão, sem tipo explícito" });
    check("chamada de 3 argumentos continua funcionando sem ambiguidade de overload", !error);
    const { data: mov } = await admin.from("estoque_movimentacoes").select("tipo").eq("id", movId).single();
    check("tipo default continua 'ajuste'", mov.tipo === "ajuste");
  }

  console.log("\n61. Rastreabilidade -- recebimento completo fecha a necessidade de origem (decisão 1 da ADR-011)");
  {
    const itemRastreioId = await upsertItem(admTenant, "ITR-CPT", "materia_prima");
    const { data: necId } = await admTenant.client.rpc("criar_necessidade_compra", { p_item_id: itemRastreioId, p_quantidade: 10, p_origem: "manual" });
    const { data: scId } = await admTenant.client.rpc("criar_solicitacao_compra", { p_setor: "Produção", p_prioridade: "alta" });
    await admTenant.client.rpc("adicionar_item_solicitacao", { p_solicitacao_compra_id: scId, p_item_id: itemRastreioId, p_quantidade: 10, p_necessidade_compra_id: necId });
    await admTenant.client.rpc("enviar_solicitacao_compra", { p_id: scId });
    const { data: necAtendida } = await admin.from("necessidades_compra").select("status").eq("id", necId).single();
    check("necessidade fica atendida ao enviar a SC", necAtendida.status === "atendida");

    const { data: cotId } = await admTenant.client.rpc("criar_cotacao_de_solicitacao", { p_solicitacao_compra_id: scId });
    const { data: cotItens } = await admin.from("cotacao_itens").select("id").eq("cotacao_id", cotId);
    const { data: propId } = await admTenant.client.rpc("registrar_proposta_cotacao", { p_cotacao_item_id: cotItens[0].id, p_pessoa_id: fornAlfaCotId, p_preco_unitario: 5 });
    await admTenant.client.rpc("selecionar_fornecedor_cotacao", { p_cotacao_item_id: cotItens[0].id, p_cotacao_proposta_id: propId, p_quantidade: 10, p_justificativa: "único fornecedor" });
    await admTenant.client.rpc("concluir_selecao_cotacao", { p_id: cotId });
    const { data: pcIds } = await admTenant.client.rpc("gerar_pedido_compra_de_cotacao", { p_cotacao_id: cotId });
    const pcRastreioId = pcIds[0];
    const { data: pciRastreio } = await admin.from("pedido_compra_itens").select("id").eq("pedido_compra_id", pcRastreioId).single();

    const { data: recRastreioId } = await admTenant.client.rpc("registrar_recebimento_pedido_compra", {
      p_pedido_compra_id: pcRastreioId, p_itens: [{ pedido_compra_item_id: pciRastreio.id, quantidade_recebida: 10 }],
    });
    await admTenant.client.rpc("finalizar_conferencia_recebimento", { p_recebimento_id: recRastreioId });

    const { data: necRecebida } = await admin.from("necessidades_compra").select("status, quantidade_recebida").eq("id", necId).single();
    check("necessidade de origem transiciona para recebida com a quantidade aceita", necRecebida.status === "recebida" && Number(necRecebida.quantidade_recebida) === 10);
  }

  console.log("\n62. Deny -- usuário sem compras.manage (papel QUALIDADE)");
  {
    const { error: e1 } = await noPermTenant.client.rpc("registrar_recebimento_pedido_compra", { p_pedido_compra_id: pcAlfaId, p_itens: [{ pedido_compra_item_id: pciAlfaId, quantidade_recebida: 1 }] });
    check("registrar_recebimento_pedido_compra negado sem compras.manage", !!e1);
    const { error: e2 } = await noPermTenant.client.rpc("registrar_divergencia_recebimento", { p_recebimento_item_id: ri2Id, p_tipo: "outra", p_descricao: "sem permissão" });
    check("registrar_divergencia_recebimento negado sem compras.manage", !!e2);
    const { error: e3 } = await noPermTenant.client.rpc("registrar_devolucao_compra", { p_recebimento_item_id: ri1Id, p_quantidade: 1, p_motivo: "sem permissão" });
    check("registrar_devolucao_compra negado sem compras.manage", !!e3);
    const { data: still } = await noPermTenant.client.from("recebimentos_pedido_compra").select("id").eq("id", rec1Id);
    check("SELECT direto continua liberado (RLS por company_id)", (still ?? []).length === 1);
  }

  console.log("\n63. Isolamento cross-tenant -- tenant B não vê nem altera recebimentos/divergências/devoluções do tenant A");
  {
    const { data: recOutro } = await otherTenant.client.from("recebimentos_pedido_compra").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê recebimentos do tenant A", (recOutro ?? []).length === 0);
    const { data: divOutro } = await otherTenant.client.from("divergencias_recebimento").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê divergências do tenant A", (divOutro ?? []).length === 0);
    const { data: devOutro } = await otherTenant.client.from("devolucoes_compra").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê devoluções do tenant A", (devOutro ?? []).length === 0);

    const { error: e1 } = await otherTenant.client.rpc("registrar_devolucao_compra", { p_recebimento_item_id: ri1Id, p_quantidade: 1, p_motivo: "tenant errado" });
    check("tenant B não consegue devolver item do tenant A", !!e1);
    const { error: e2 } = await otherTenant.client.rpc("registrar_recebimento_pedido_compra", { p_pedido_compra_id: pcAlfaId, p_itens: [{ pedido_compra_item_id: pciAlfaId, quantidade_recebida: 1 }] });
    check("tenant B não consegue registrar recebimento contra PC do tenant A", !!e2);
  }

  // =========================================================================
  // Fase 8 da ADR-011 (TÓPICO 7 §32, §35, §39; verificação de §37) --
  // Compras emergenciais, avaliação de fornecedores, rastreabilidade.
  // Pipeline dedicado (itemF8/fornF8) para não acoplar aos dados já
  // acumulados pelas fases anteriores neste mesmo arquivo.
  // =========================================================================

  console.log("\n64. criar_compra_emergencial() -- rejeita campos faltando, urgencia=emergencial, PC herda urgencia");
  const itemF8Id = await upsertItem(admTenant, "ITF8-CPT", "materia_prima");
  const fornF8Id = await upsertPessoa(admTenant, "20", "Fornecedor Fase8", "FORNECEDOR");
  await admTenant.client.rpc("upsert_numbering_sequence", { p_document_type: "solicitacao_compra", p_prefixo: "SC-F8-", p_sufixo: "", p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca" });
  await admTenant.client.rpc("upsert_numbering_sequence", { p_document_type: "cotacao", p_prefixo: "COT-F8-", p_sufixo: "", p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca" });
  await admTenant.client.rpc("upsert_numbering_sequence", { p_document_type: "pedido_compra", p_prefixo: "PC-F8-", p_sufixo: "", p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca" });
  await admTenant.client.rpc("upsert_numbering_sequence", { p_document_type: "recebimento_compra", p_prefixo: "REC-F8-", p_sufixo: "", p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca" });
  let scEmergId, pcEmergId, pciEmergId;
  {
    const { error: e1 } = await admTenant.client.rpc("criar_compra_emergencial", { p_setor: "Produção", p_motivo: null, p_justificativa: "j", p_impacto: "i" });
    check("rejeita motivo ausente", !!e1);
    const { error: e2 } = await admTenant.client.rpc("criar_compra_emergencial", { p_setor: "Produção", p_motivo: "m", p_justificativa: "", p_impacto: "i" });
    check("rejeita justificativa ausente", !!e2);
    const { error: e3 } = await admTenant.client.rpc("criar_compra_emergencial", { p_setor: "Produção", p_motivo: "m", p_justificativa: "j", p_impacto: null });
    check("rejeita impacto ausente", !!e3);

    const { data: scId } = await admTenant.client.rpc("criar_compra_emergencial", {
      p_setor: "Produção", p_motivo: "linha parada por falta de material", p_justificativa: "sem estoque", p_impacto: "atraso na entrega X",
    });
    scEmergId = scId;
    const { data: sc } = await admin.from("solicitacoes_compra").select("urgencia, emergencial_motivo, emergencial_impacto").eq("id", scEmergId).single();
    check("SC nasce com urgencia=emergencial e campos preenchidos", sc.urgencia === "emergencial" && !!sc.emergencial_motivo && !!sc.emergencial_impacto);

    await admTenant.client.rpc("adicionar_item_solicitacao", { p_solicitacao_compra_id: scEmergId, p_item_id: itemF8Id, p_quantidade: 50 });
    await admTenant.client.rpc("enviar_solicitacao_compra", { p_id: scEmergId });
    const { data: cotId } = await admTenant.client.rpc("criar_cotacao_de_solicitacao", { p_solicitacao_compra_id: scEmergId });
    const { data: cotItens } = await admin.from("cotacao_itens").select("id").eq("cotacao_id", cotId);
    const { data: propId } = await admTenant.client.rpc("registrar_proposta_cotacao", { p_cotacao_item_id: cotItens[0].id, p_pessoa_id: fornF8Id, p_preco_unitario: 12, p_prazo_entrega_dias: 5 });
    await admTenant.client.rpc("selecionar_fornecedor_cotacao", { p_cotacao_item_id: cotItens[0].id, p_cotacao_proposta_id: propId, p_quantidade: 50, p_justificativa: "único fornecedor" });
    await admTenant.client.rpc("concluir_selecao_cotacao", { p_id: cotId });
    const { data: pcIds } = await admTenant.client.rpc("gerar_pedido_compra_de_cotacao", { p_cotacao_id: cotId });
    pcEmergId = pcIds[0];
    const { data: pc } = await admin.from("pedidos_compra").select("urgencia").eq("id", pcEmergId).single();
    check("PC gerado herda urgencia=emergencial da SC de origem", pc.urgencia === "emergencial");

    const { data: pci } = await admin.from("pedido_compra_itens").select("id").eq("pedido_compra_id", pcEmergId).single();
    pciEmergId = pci.id;
  }

  console.log("\n65. Recebimento + finalizar -- estoque_movimentacoes.recebimento_item_id preenchido (base de rastrear_material)");
  let ri8Id;
  {
    const { data: recId } = await admTenant.client.rpc("registrar_recebimento_pedido_compra", { p_pedido_compra_id: pcEmergId, p_itens: [{ pedido_compra_item_id: pciEmergId, quantidade_recebida: 50 }] });
    const { data: itensRec } = await admin.from("recebimento_itens").select("id").eq("recebimento_id", recId);
    ri8Id = itensRec[0].id;
    await admTenant.client.rpc("finalizar_conferencia_recebimento", { p_recebimento_id: recId });

    const { data: mov } = await admin.from("estoque_movimentacoes").select("id, recebimento_item_id").eq("item_id", itemF8Id).eq("tipo", "compra").single();
    check("movimentação de compra fica ligada ao recebimento_item (§39)", mov.recebimento_item_id === ri8Id);
  }

  console.log("\n66. rastrear_necessidade() / rastrear_material() -- cadeia completa e consulta reversa");
  let necF8Id;
  {
    const { data: necId } = await admTenant.client.rpc("criar_necessidade_compra", { p_item_id: itemF8Id, p_quantidade: 5, p_origem: "manual" });
    necF8Id = necId;
    const { data: semVinculo } = await admTenant.client.rpc("rastrear_necessidade", { p_necessidade_compra_id: necId });
    check("rastrear_necessidade sem vínculo ainda retorna nota, não erro", semVinculo.nota?.includes("ainda não vinculada"));

    const { data: scId } = await admTenant.client.rpc("criar_solicitacao_compra", { p_setor: "Produção", p_prioridade: "alta", p_justificativa: "normal" });
    await admTenant.client.rpc("adicionar_item_solicitacao", { p_solicitacao_compra_id: scId, p_item_id: itemF8Id, p_quantidade: 5, p_necessidade_compra_id: necId });
    await admTenant.client.rpc("enviar_solicitacao_compra", { p_id: scId });
    const { data: cotId } = await admTenant.client.rpc("criar_cotacao_de_solicitacao", { p_solicitacao_compra_id: scId });
    const { data: cotItens } = await admin.from("cotacao_itens").select("id").eq("cotacao_id", cotId);
    const { data: propId } = await admTenant.client.rpc("registrar_proposta_cotacao", { p_cotacao_item_id: cotItens[0].id, p_pessoa_id: fornF8Id, p_preco_unitario: 9, p_prazo_entrega_dias: 3 });
    await admTenant.client.rpc("selecionar_fornecedor_cotacao", { p_cotacao_item_id: cotItens[0].id, p_cotacao_proposta_id: propId, p_quantidade: 5, p_justificativa: "único fornecedor" });
    await admTenant.client.rpc("concluir_selecao_cotacao", { p_id: cotId });
    const { data: pcIds } = await admTenant.client.rpc("gerar_pedido_compra_de_cotacao", { p_cotacao_id: cotId });
    const { data: pci } = await admin.from("pedido_compra_itens").select("id").eq("pedido_compra_id", pcIds[0]).single();
    const { data: recId } = await admTenant.client.rpc("registrar_recebimento_pedido_compra", { p_pedido_compra_id: pcIds[0], p_itens: [{ pedido_compra_item_id: pci.id, quantidade_recebida: 5 }] });
    await admTenant.client.rpc("finalizar_conferencia_recebimento", { p_recebimento_id: recId });

    const { data: necRecebida } = await admin.from("necessidades_compra").select("status, quantidade_recebida").eq("id", necId).single();
    check("necessidade fecha o ciclo (status recebida) ao final da cadeia", necRecebida.status === "recebida" && Number(necRecebida.quantidade_recebida) === 5);

    const { data: cadeia } = await admTenant.client.rpc("rastrear_necessidade", { p_necessidade_compra_id: necId });
    check("rastrear_necessidade traz a cadeia completa até o estoque", cadeia.pedido_compra?.numero && cadeia.recebimentos?.length === 1 && cadeia.recebimentos[0].estoque_movimentacao?.tipo === "compra");

    const { data: movRecente } = await admin.from("estoque_movimentacoes").select("id").eq("item_id", itemF8Id).eq("tipo", "compra").order("created_at", { ascending: false }).limit(1).single();
    const { data: reverso } = await admTenant.client.rpc("rastrear_material", { p_estoque_movimentacao_id: movRecente.id });
    check("rastrear_material (reverso) resolve a mesma necessidade", reverso.estoque_movimentacao?.necessidade_compra_id === necId);

    const { data: ajusteId } = await admTenant.client.rpc("ajustar_saldo", { p_item_id: itemF8Id, p_quantidade_delta: 1, p_motivo: "ajuste manual sem recebimento" });
    const { data: semCadeia } = await admTenant.client.rpc("rastrear_material", { p_estoque_movimentacao_id: ajusteId });
    check("rastrear_material de ajuste manual não quebra, retorna nota", semCadeia.nota?.includes("sem cadeia de Compras"));
  }

  console.log("\n67. upsert_criterio_avaliacao_fornecedor() + avaliar_fornecedor() -- pesos customizados, score calculado de dado real");
  let avaliacaoId;
  {
    const { error: e1 } = await admTenant.client.rpc("upsert_criterio_avaliacao_fornecedor", { p_chave: "invalido", p_peso: 10 });
    check("rejeita critério inválido", !!e1);
    const { error: e2 } = await admTenant.client.rpc("upsert_criterio_avaliacao_fornecedor", { p_chave: "preco", p_peso: -1 });
    check("rejeita peso negativo", !!e2);

    await admTenant.client.rpc("upsert_criterio_avaliacao_fornecedor", { p_chave: "preco", p_peso: 50 });
    await admTenant.client.rpc("upsert_criterio_avaliacao_fornecedor", { p_chave: "prazo", p_peso: 20 });
    await admTenant.client.rpc("upsert_criterio_avaliacao_fornecedor", { p_chave: "divergencias", p_peso: 10 });
    await admTenant.client.rpc("upsert_criterio_avaliacao_fornecedor", { p_chave: "rejeicoes", p_peso: 10 });
    await admTenant.client.rpc("upsert_criterio_avaliacao_fornecedor", { p_chave: "volume", p_peso: 10 });

    const { data: id, error } = await admTenant.client.rpc("avaliar_fornecedor", { p_pessoa_id: fornF8Id, p_periodo_inicio: "2000-01-01", p_periodo_fim: "2100-01-01" });
    check("avalia fornecedor com sucesso", !error);
    avaliacaoId = id;
    const { data: aval } = await admin.from("fornecedor_avaliacoes").select("score, detalhamento").eq("id", avaliacaoId).single();
    check("score calculado (dois recebimentos no prazo, sem divergência, 100% aceito)", aval.score !== null && Number(aval.score) > 0);
    check("preço reflete o desvio entre as duas propostas (12 e 9) -- nem 0 nem 100", Number(aval.detalhamento.preco.score) > 0 && Number(aval.detalhamento.preco.score) < 100);
    check("volume = 100 (único fornecedor com PC no período)", Number(aval.detalhamento.volume.score) === 100);
    check("rejeições = 100 (tudo aceito, nenhuma divergência)", Number(aval.detalhamento.rejeicoes.score) === 100);

    const { data: idSemDado } = await admTenant.client.rpc("avaliar_fornecedor", { p_pessoa_id: fornF8Id, p_periodo_inicio: "1990-01-01", p_periodo_fim: "1990-01-31" });
    const { data: avalSemDado } = await admin.from("fornecedor_avaliacoes").select("score").eq("id", idSemDado).single();
    check("período sem nenhum dado -- score null, não força 0", avalSemDado.score === null);

    const { error: errPeriodo } = await admTenant.client.rpc("avaliar_fornecedor", { p_pessoa_id: fornF8Id, p_periodo_inicio: "2020-02-01", p_periodo_fim: "2020-01-01" });
    check("rejeita período inválido", !!errPeriodo);
    const { error: errPessoa } = await admTenant.client.rpc("avaliar_fornecedor", { p_pessoa_id: "00000000-0000-0000-0000-000000000000", p_periodo_inicio: "2020-01-01", p_periodo_fim: "2020-01-31" });
    check("rejeita pessoa que não é fornecedor", !!errPessoa);
  }

  console.log("\n68. Isolamento -- avaliar_fornecedor() de pessoa de OUTRO tenant é rejeitado (achado real na validação SQL desta fase)");
  {
    const { error } = await otherTenant.client.rpc("avaliar_fornecedor", { p_pessoa_id: fornF8Id, p_periodo_inicio: "2020-01-01", p_periodo_fim: "2020-01-31" });
    check("tenant B não consegue avaliar fornecedor do tenant A (pessoa_papeis agora é escopado por company_id)", !!error);
    const { data: avalOutro } = await otherTenant.client.from("fornecedor_avaliacoes").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê avaliações do tenant A", (avalOutro ?? []).length === 0);
    const { error: errRastreio } = await otherTenant.client.rpc("rastrear_necessidade", { p_necessidade_compra_id: necF8Id });
    check("tenant B não consegue rastrear necessidade do tenant A", !!errRastreio);
  }

  console.log("\n69. Deny -- usuário sem compras.manage/compras.view (papel QUALIDADE)");
  {
    const { error: e1 } = await noPermTenant.client.rpc("criar_compra_emergencial", { p_setor: "Produção", p_motivo: "m", p_justificativa: "j", p_impacto: "i" });
    check("criar_compra_emergencial negado sem compras.manage", !!e1);
    const { error: e2 } = await noPermTenant.client.rpc("upsert_criterio_avaliacao_fornecedor", { p_chave: "preco", p_peso: 1 });
    check("upsert_criterio_avaliacao_fornecedor negado sem compras.manage", !!e2);
    const { error: e3 } = await noPermTenant.client.rpc("avaliar_fornecedor", { p_pessoa_id: fornF8Id, p_periodo_inicio: "2020-01-01", p_periodo_fim: "2020-01-31" });
    check("avaliar_fornecedor negado sem compras.manage", !!e3);
    const { error: e4 } = await noPermTenant.client.rpc("rastrear_necessidade", { p_necessidade_compra_id: necF8Id });
    check("rastrear_necessidade negado sem compras.view", !!e4);
    const { data: still } = await noPermTenant.client.from("fornecedor_avaliacoes").select("id").eq("id", avaliacaoId);
    check("SELECT direto continua liberado (RLS por company_id)", (still ?? []).length === 1);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
