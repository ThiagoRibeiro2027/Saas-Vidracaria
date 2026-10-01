// Testes automatizados do TÓPICO 13 §6, Fase 5 (ADR-002 §4.14/§4.17,
// emenda de 25/09/2026): Bancos, Boletos e PIX — conta bancária, alçada de
// pagamento sobre título a pagar (já existente desde ADR-011 Fase 6),
// cobrança (boleto/PIX) sobre título a receber (T11) e conciliação manual
// de movimentação bancária. Nenhum provedor bancário real é testado aqui
// — não existe nenhum (mesmo espírito de test-integracoes.mjs).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-bancario.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

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
    const { data } = await admin.from("companies").upsert({ slug, name }, { onConflict: "slug" }).select().single();
    company = data;
  }

  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";

  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }

  await admin.from("profiles").upsert({ id: userId, company_id: company.id, login_identifier: identifier, display_name: name }, { onConflict: "id" });

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

// Espelha prepararPedidoLiberado() de test-financeiro.mjs — gera 1 título a
// RECEBER (T11) pronto pra virar cobrança.
async function prepararTituloReceber(tenant, sufixo, quantidade = 10, precoUnitario = 100) {
  for (const [dt, pfx] of [["orcamento", "ORB"], ["pedido", "PEB"], ["titulo_financeiro", "TIB"]]) {
    await tenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: dt, p_prefixo: `${pfx}${sufixo}-`, p_sufixo: "", p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
  }
  // Prefixo numérico (não letra): upsert_pessoa normaliza o documento
  // removendo caracteres não numéricos, então um sufixo com letra (ex.:
  // "r1") colide com outro de letra diferente e mesmo dígito (ex.: "p1")
  // depois da normalização — achado real ao rodar esta suíte.
  const pessoaId = await upsertPessoa(tenant, `9${sufixo}`, "Cliente Bancário Teste", "CLIENTE");
  const itemId = await upsertItem(tenant, `VD-BAN-${sufixo}`, "materia_prima");

  const { data: orcamentoId } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
  });
  await tenant.client.rpc("upsert_orcamento_item", { p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: quantidade, p_preco_unitario: precoUnitario });
  await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });
  const { data: pedidoId } = await tenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  await tenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
  await tenant.client.rpc("liberar_pedido", { p_id: pedidoId });

  const valorTotal = quantidade * precoUnitario;
  const { data: titIds } = await tenant.client.rpc("gerar_titulos_pedido", { p_pedido_id: pedidoId, p_parcelas: [{ valor: valorTotal, vencimento: "2027-06-01", condicao_pagamento: null }] });
  return titIds[0];
}

// Pipeline mínimo de Compras (fornecedor -> SC -> cotação -> PC -> título a
// pagar) — não reexercita as regras de Compras (já cobertas em
// test-compras.mjs), só produz UM título a pagar válido pra testar a
// camada nova de alçada/pagamento.
async function prepararTituloPagar(tenant, sufixo, quantidade = 10, precoUnitario = 50) {
  for (const [dt, pfx] of [["solicitacao_compra", "SCB"], ["cotacao", "COB"], ["pedido_compra", "PCB"], ["titulo_compra", "TPB"]]) {
    await tenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: dt, p_prefixo: `${pfx}${sufixo}-`, p_sufixo: "", p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
  }
  const fornecedorId = await upsertPessoa(tenant, `8${sufixo}`, "Fornecedor Bancário Teste", "FORNECEDOR");
  const itemId = await upsertItem(tenant, `MP-BAN-${sufixo}`, "materia_prima");

  const { data: scId } = await tenant.client.rpc("criar_solicitacao_compra", { p_setor: null, p_prioridade: "normal", p_justificativa: null });
  await tenant.client.rpc("adicionar_item_solicitacao", { p_solicitacao_compra_id: scId, p_item_id: itemId, p_quantidade: quantidade });
  await tenant.client.rpc("enviar_solicitacao_compra", { p_id: scId });
  const { data: cotId } = await tenant.client.rpc("criar_cotacao_de_solicitacao", { p_solicitacao_compra_id: scId, p_item_ids: null });
  const { data: itensCot } = await admin.from("cotacao_itens").select("id").eq("cotacao_id", cotId);
  const { data: propId } = await tenant.client.rpc("registrar_proposta_cotacao", { p_cotacao_item_id: itensCot[0].id, p_pessoa_id: fornecedorId, p_preco_unitario: precoUnitario });
  await tenant.client.rpc("selecionar_fornecedor_cotacao", { p_cotacao_item_id: itensCot[0].id, p_cotacao_proposta_id: propId, p_quantidade: quantidade, p_justificativa: "único fornecedor" });
  await tenant.client.rpc("concluir_selecao_cotacao", { p_cotacao_id: cotId });
  const { data: pcIds } = await tenant.client.rpc("gerar_pedido_compra_de_cotacao", { p_cotacao_id: cotId });
  const pedidoCompraId = pcIds[0];
  const valorTotal = quantidade * precoUnitario;
  const { data: titIds } = await tenant.client.rpc("gerar_titulos_pedido_compra", { p_pedido_compra_id: pedidoCompraId, p_parcelas: [{ valor: valorTotal, vencimento: "2027-06-01" }] });
  return { tituloId: titIds[0], valorTotal };
}

async function main() {
  const testStartedAt = new Date().toISOString();
  console.log("Preparando tenants (admin, sem-permissão de financeiro, outro tenant)...");
  const admTenant = await createTenant("bancario-test-admin", "Bancário Admin Teste", "bc01", "ADMIN");
  const noPermTenant = await createTenant("bancario-test-admin", "Bancário SemPerm Teste", "bc02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant("bancario-test-other", "Bancário Outro Teste", "bc03", "ADMIN");

  console.log("\n1. configurar_conta_bancaria() — validações, permissão, sucesso, edição");
  let contaId;
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("configurar_conta_bancaria", {
      p_id: null, p_banco: "Banco X", p_agencia: "0001", p_conta: "12345-6", p_tipo_conta: "corrente", p_pix_chave: null,
    });
    check("sem financeiro.manage não configura conta bancária", !!eNoPerm);

    const { error: eSemBanco } = await admTenant.client.rpc("configurar_conta_bancaria", {
      p_id: null, p_banco: "", p_agencia: "0001", p_conta: "12345-6", p_tipo_conta: "corrente", p_pix_chave: null,
    });
    check("banco vazio é rejeitado", !!eSemBanco);

    const { error: eTipoInvalido } = await admTenant.client.rpc("configurar_conta_bancaria", {
      p_id: null, p_banco: "Banco X", p_agencia: "0001", p_conta: "12345-6", p_tipo_conta: "investimento", p_pix_chave: null,
    });
    check("tipo_conta inválido é rejeitado", !!eTipoInvalido);

    const { data, error } = await admTenant.client.rpc("configurar_conta_bancaria", {
      p_id: null, p_banco: "Banco X", p_agencia: "0001", p_conta: "12345-6", p_tipo_conta: "corrente", p_pix_chave: "empresa@pix.com",
    });
    check("ADMIN configura conta bancária", !error && !!data);
    contaId = data;

    const { error: eEdit } = await admTenant.client.rpc("configurar_conta_bancaria", {
      p_id: contaId, p_banco: "Banco X Renomeado", p_agencia: "0001", p_conta: "12345-6", p_tipo_conta: "corrente", p_pix_chave: null,
    });
    check("ADMIN edita conta bancária existente", !eEdit);
    const { data: row } = await admin.from("contas_bancarias").select("banco").eq("id", contaId).single();
    check("edição persistida", row?.banco === "Banco X Renomeado");
  }

  console.log("\n2. ativar/desativar_conta_bancaria() — toggle e isolamento");
  {
    const { error: eCross } = await otherTenant.client.rpc("desativar_conta_bancaria", { p_id: contaId });
    check("tenant B não desativa conta bancária do tenant A", !!eCross);

    const { error } = await admTenant.client.rpc("desativar_conta_bancaria", { p_id: contaId });
    check("ADMIN desativa conta bancária", !error);
    const { data: row } = await admin.from("contas_bancarias").select("ativa").eq("id", contaId).single();
    check("ativa=false após desativar", row?.ativa === false);

    await admTenant.client.rpc("ativar_conta_bancaria", { p_id: contaId });
    const { data: row2 } = await admin.from("contas_bancarias").select("ativa").eq("id", contaId).single();
    check("ativa=true após reativar", row2?.ativa === true);
  }

  console.log("\n3. upsert_alcada_financeiro() — validações, permissão, isolamento");
  const { data: comercialRole } = await admin.from("roles").select("id").is("company_id", null).eq("key", "COMERCIAL").single();
  // Aprovador precisa do papel específico da etapa (checado por decidir_
  // etapa_aprovacao_financeiro) E de financeiro.aprovar/manage como gate de
  // base (assert_tenant_write) — por isso também ganha ADMIN, mesmo padrão
  // já usado em test-compras.mjs (aprov1Tenant/aprov2Tenant).
  const aprovadorTenant = await createTenant("bancario-test-admin", "Bancário Aprovador", "bc04", "COMERCIAL", admTenant.company);
  const { data: adminRoleRow } = await admin.from("roles").select("id").is("company_id", null).eq("key", "ADMIN").single();
  await admin.from("user_roles").insert({ profile_id: aprovadorTenant.userId, role_id: adminRoleRow.id });
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("upsert_alcada_financeiro", {
      p_processo: "titulo_pagar", p_ordem: 1, p_valor_minimo: 0, p_role_id: comercialRole.id, p_ativo: true,
    });
    check("sem financeiro.manage não configura alçada", !!eNoPerm);

    const { error: eOrdem } = await admTenant.client.rpc("upsert_alcada_financeiro", {
      p_processo: "titulo_pagar", p_ordem: 0, p_valor_minimo: 0, p_role_id: comercialRole.id, p_ativo: true,
    });
    check("ordem <= 0 é rejeitada", !!eOrdem);

    const { error: eValor } = await admTenant.client.rpc("upsert_alcada_financeiro", {
      p_processo: "titulo_pagar", p_ordem: 1, p_valor_minimo: -1, p_role_id: comercialRole.id, p_ativo: true,
    });
    check("valor_minimo negativo é rejeitado", !!eValor);

    const { error: eRole } = await admTenant.client.rpc("upsert_alcada_financeiro", {
      p_processo: "titulo_pagar", p_ordem: 1, p_valor_minimo: 0, p_role_id: "00000000-0000-0000-0000-000000000000", p_ativo: true,
    });
    check("role_id inválido é rejeitado", !!eRole);

    const { data: etapaId, error } = await admTenant.client.rpc("upsert_alcada_financeiro", {
      p_processo: "titulo_pagar", p_ordem: 1, p_valor_minimo: 100, p_role_id: comercialRole.id, p_ativo: true,
    });
    check("ADMIN configura etapa de alçada", !error && !!etapaId);

    const { data: crossAlcada } = await otherTenant.client.from("financeiro_alcada_etapas").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não vê alçada financeira do tenant A", (crossAlcada ?? []).length === 0);
  }

  console.log("\n4. Pagamento SEM alçada nunca submetida continua direto (regressão preservada)");
  {
    const { tituloId, valorTotal } = await prepararTituloPagar(admTenant, "1", 10, 50);
    const { error } = await admTenant.client.rpc("registrar_pagamento_titulo_compra", { p_titulo_id: tituloId, p_valor: valorTotal, p_data_pagamento: "2027-06-01" });
    check("pagamento direto funciona quando alçada nunca foi submetida pra este título", !error);
    const { data: row } = await admin.from("titulos_pagar").select("status").eq("id", tituloId).single();
    check("título fica pago", row?.status === "pago");
  }

  console.log("\n5. submeter_pagamento_titulo() + decidir_etapa_aprovacao_financeiro() — bloqueia pagamento até aprovar");
  let tituloAlcadaId, valorAlcada;
  {
    const preparado = await prepararTituloPagar(admTenant, "2", 3, 80); // 240, dispara a etapa (valor_minimo=100)
    tituloAlcadaId = preparado.tituloId;
    valorAlcada = preparado.valorTotal;

    const { error: eNoPerm } = await noPermTenant.client.rpc("submeter_pagamento_titulo", { p_titulo_pagar_id: tituloAlcadaId });
    check("sem financeiro.manage não submete pagamento à aprovação", !!eNoPerm);

    const { data: aprovacaoId, error } = await admTenant.client.rpc("submeter_pagamento_titulo", { p_titulo_pagar_id: tituloAlcadaId });
    check("ADMIN submete título a pagar à aprovação", !error && !!aprovacaoId);

    const { data: aprov } = await admin.from("financeiro_aprovacoes").select("status, valor").eq("id", aprovacaoId).single();
    check("aprovação pendente com valor correto (240 >= 100)", aprov?.status === "pendente" && Number(aprov.valor) === valorAlcada);

    const { error: eResubmeter } = await admTenant.client.rpc("submeter_pagamento_titulo", { p_titulo_pagar_id: tituloAlcadaId });
    check("resubmeter título já com aprovação pendente é rejeitado", !!eResubmeter);

    const { error: ePagarBloqueado } = await admTenant.client.rpc("registrar_pagamento_titulo_compra", { p_titulo_id: tituloAlcadaId, p_valor: valorAlcada, p_data_pagamento: "2027-06-01" });
    check("pagamento é bloqueado enquanto a aprovação está pendente", !!ePagarBloqueado);

    const { data: etapas } = await admin.from("financeiro_aprovacao_etapas").select("id").eq("financeiro_aprovacao_id", aprovacaoId).order("ordem");
    const { error: eCrossDecidir } = await otherTenant.client.rpc("decidir_etapa_aprovacao_financeiro", { p_etapa_id: etapas[0].id, p_decisao: "aprovar" });
    check("tenant B não decide etapa de aprovação do tenant A", !!eCrossDecidir);
    const { error: eNoPermDecidir } = await noPermTenant.client.rpc("decidir_etapa_aprovacao_financeiro", { p_etapa_id: etapas[0].id, p_decisao: "aprovar" });
    check("sem financeiro.aprovar não decide etapa", !!eNoPermDecidir);

    // Permissão presente (ADMIN) mas papel errado (PRODUCAO, etapa exige COMERCIAL) — deve ser rejeitado.
    const erradoTenant = await createTenant("bancario-test-admin", "Bancário Aprovador Errado", "bc05", "PRODUCAO", admTenant.company);
    await admin.from("user_roles").insert({ profile_id: erradoTenant.userId, role_id: adminRoleRow.id });
    const { error: ePerfilErrado } = await erradoTenant.client.rpc("decidir_etapa_aprovacao_financeiro", { p_etapa_id: etapas[0].id, p_decisao: "aprovar" });
    check("perfil errado (PRODUCAO tentando etapa da COMERCIAL) é rejeitado", !!ePerfilErrado);

    const { error: eDecidir } = await aprovadorTenant.client.rpc("decidir_etapa_aprovacao_financeiro", { p_etapa_id: etapas[0].id, p_decisao: "aprovar", p_observacao: "ok" });
    check("perfil COMERCIAL (com financeiro.aprovar) aprova a etapa", !eDecidir);
    const { data: aprovDepois } = await admin.from("financeiro_aprovacoes").select("status").eq("id", aprovacaoId).single();
    check("aprovação fica 'aprovada' após a única etapa", aprovDepois?.status === "aprovada");

    const { error: eRedecide } = await aprovadorTenant.client.rpc("decidir_etapa_aprovacao_financeiro", { p_etapa_id: etapas[0].id, p_decisao: "aprovar" });
    check("rejeita decidir etapa já decidida", !!eRedecide);
  }

  console.log("\n6. Após alçada aprovada, pagamento é liberado; rejeição bloqueia e permite nova submissão");
  {
    const { data: aprov } = await admin.from("financeiro_aprovacoes").select("status").eq("processo", "titulo_pagar").eq("entidade_id", tituloAlcadaId).order("created_at", { ascending: false }).limit(1).single();
    if (aprov?.status === "aprovada") {
      const { error } = await admTenant.client.rpc("registrar_pagamento_titulo_compra", { p_titulo_id: tituloAlcadaId, p_valor: valorAlcada, p_data_pagamento: "2027-06-01", p_conta_bancaria_id: contaId, p_forma_pagamento: "pix" });
      check("pagamento liberado após alçada aprovada", !error);
      const { data: pgto } = await admin.from("pagamentos_titulo_compra").select("conta_bancaria_id, forma_pagamento").eq("titulo_id", tituloAlcadaId).single();
      check("conta_bancaria_id e forma_pagamento persistidos no pagamento", pgto?.conta_bancaria_id === contaId && pgto?.forma_pagamento === "pix");
    } else {
      check("pagamento liberado após alçada aprovada", false);
      check("conta_bancaria_id e forma_pagamento persistidos no pagamento", false);
    }

    // Fluxo de rejeição num título novo.
    const { tituloId: tituloRejeitado } = await prepararTituloPagar(admTenant, "3", 3, 80);
    const { data: aprovRejId } = await admTenant.client.rpc("submeter_pagamento_titulo", { p_titulo_pagar_id: tituloRejeitado });
    const { data: etapasRej } = await admin.from("financeiro_aprovacao_etapas").select("id").eq("financeiro_aprovacao_id", aprovRejId).order("ordem");
    await aprovadorTenant.client.rpc("decidir_etapa_aprovacao_financeiro", { p_etapa_id: etapasRej[0].id, p_decisao: "rejeitar", p_observacao: "orçamento estourado" });

    const { error: ePagarRejeitado } = await admTenant.client.rpc("registrar_pagamento_titulo_compra", { p_titulo_id: tituloRejeitado, p_valor: 240, p_data_pagamento: "2027-06-01" });
    check("pagamento continua bloqueado após rejeição", !!ePagarRejeitado);

    const { data: novaAprovacaoId, error: eResubmeterOk } = await admTenant.client.rpc("submeter_pagamento_titulo", { p_titulo_pagar_id: tituloRejeitado });
    check("resubmeter após rejeição é permitido", !eResubmeterOk && !!novaAprovacaoId);
  }

  console.log("\n7. desativar_alcada_financeiro()");
  {
    const { data: etapas } = await admin.from("financeiro_alcada_etapas").select("id").eq("company_id", admTenant.company.id).eq("processo", "titulo_pagar");
    const { error } = await admTenant.client.rpc("desativar_alcada_financeiro", { p_id: etapas[0].id });
    check("desativa etapa de alçada financeira", !error);
    const { data: row } = await admin.from("financeiro_alcada_etapas").select("ativo").eq("id", etapas[0].id).single();
    check("etapa fica inativa", row?.ativo === false);
  }

  console.log("\n8. gerar_cobranca() — validações, permissão, sucesso (boleto/PIX)");
  let tituloReceberId, cobrancaId;
  {
    await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "cobranca", p_prefixo: "COB-BC-", p_sufixo: "", p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
    tituloReceberId = await prepararTituloReceber(admTenant, "1", 5, 200);

    const { error: eNoPerm } = await noPermTenant.client.rpc("gerar_cobranca", { p_titulo_id: tituloReceberId, p_conta_bancaria_id: contaId, p_tipo: "boleto" });
    check("sem financeiro.manage não gera cobrança", !!eNoPerm);

    const { error: eTipoInvalido } = await admTenant.client.rpc("gerar_cobranca", { p_titulo_id: tituloReceberId, p_conta_bancaria_id: contaId, p_tipo: "cartao" });
    check("tipo de cobrança inválido é rejeitado", !!eTipoInvalido);

    const { error: eTituloInexistente } = await admTenant.client.rpc("gerar_cobranca", { p_titulo_id: "00000000-0000-0000-0000-000000000000", p_conta_bancaria_id: contaId, p_tipo: "boleto" });
    check("título a receber inexistente é rejeitado", !!eTituloInexistente);

    const { data, error } = await admTenant.client.rpc("gerar_cobranca", { p_titulo_id: tituloReceberId, p_conta_bancaria_id: contaId, p_tipo: "boleto" });
    check("ADMIN gera cobrança (boleto) com sucesso", !error && !!data);
    cobrancaId = data;
    const { data: row } = await admin.from("cobrancas").select("status, tipo, linha_digitavel").eq("id", cobrancaId).single();
    check("cobrança nasce 'gerada', sem linha digitável real (nenhum provedor conectado)", row?.status === "gerada" && row?.tipo === "boleto" && row?.linha_digitavel === null);

    await admTenant.client.rpc("desativar_conta_bancaria", { p_id: contaId });
    const { error: eContaInativa } = await admTenant.client.rpc("gerar_cobranca", { p_titulo_id: tituloReceberId, p_conta_bancaria_id: contaId, p_tipo: "pix" });
    check("conta bancária inativa não permite gerar cobrança", !!eContaInativa);
    await admTenant.client.rpc("ativar_conta_bancaria", { p_id: contaId });
  }

  console.log("\n9. marcar_cobranca_paga() — chama registrar_recebimento_titulo(), dupla marcação rejeitada");
  {
    const { error: eCross } = await otherTenant.client.rpc("marcar_cobranca_paga", { p_id: cobrancaId });
    check("tenant B não marca cobrança do tenant A como paga", !!eCross);

    const { data: recebimentoId, error } = await admTenant.client.rpc("marcar_cobranca_paga", { p_id: cobrancaId, p_data_recebimento: "2027-06-15" });
    check("marca cobrança como paga com sucesso", !error && !!recebimentoId);

    const { data: cobrancaRow } = await admin.from("cobrancas").select("status").eq("id", cobrancaId).single();
    check("cobrança fica 'paga'", cobrancaRow?.status === "paga");

    const { data: tituloRow } = await admin.from("titulos_financeiros").select("status, valor_recebido").eq("id", tituloReceberId).single();
    check("título a receber reflete o recebimento (via registrar_recebimento_titulo, sem duplicar estado)", tituloRow?.status === "pago" && Number(tituloRow.valor_recebido) === 1000);

    const { error: eDup } = await admTenant.client.rpc("marcar_cobranca_paga", { p_id: cobrancaId });
    check("marcar como paga de novo é rejeitado", !!eDup);
  }

  console.log("\n10. cancelar_cobranca() — só no status 'gerada'");
  {
    const tituloReceber2 = await prepararTituloReceber(admTenant, "2", 2, 150);
    const { data: cobranca2Id } = await admTenant.client.rpc("gerar_cobranca", { p_titulo_id: tituloReceber2, p_conta_bancaria_id: contaId, p_tipo: "pix" });
    const { error } = await admTenant.client.rpc("cancelar_cobranca", { p_id: cobranca2Id });
    check("cancela cobrança gerada", !error);
    const { data: row } = await admin.from("cobrancas").select("status").eq("id", cobranca2Id).single();
    check("status vira 'cancelada'", row?.status === "cancelada");

    const { error: eCancelPaga } = await admTenant.client.rpc("cancelar_cobranca", { p_id: cobrancaId });
    check("não é possível cancelar cobrança já paga", !!eCancelPaga);
  }

  console.log("\n11. registrar_movimentacao_bancaria() + conciliar_movimentacao() — validações e vínculo manual (§6.1)");
  let movimentacaoId;
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("registrar_movimentacao_bancaria", { p_conta_bancaria_id: contaId, p_tipo: "credito", p_valor: 1000, p_data_movimento: "2027-06-15", p_descricao: "teste" });
    check("sem financeiro.manage não registra movimentação", !!eNoPerm);

    const { error: eTipoInvalido } = await admTenant.client.rpc("registrar_movimentacao_bancaria", { p_conta_bancaria_id: contaId, p_tipo: "transferencia", p_valor: 1000, p_data_movimento: "2027-06-15", p_descricao: null });
    check("tipo de movimentação inválido é rejeitado", !!eTipoInvalido);

    const { error: eValorInvalido } = await admTenant.client.rpc("registrar_movimentacao_bancaria", { p_conta_bancaria_id: contaId, p_tipo: "credito", p_valor: 0, p_data_movimento: "2027-06-15", p_descricao: null });
    check("valor <= 0 é rejeitado", !!eValorInvalido);

    const { data, error } = await admTenant.client.rpc("registrar_movimentacao_bancaria", { p_conta_bancaria_id: contaId, p_tipo: "credito", p_valor: 1000, p_data_movimento: "2027-06-15", p_descricao: "recebimento cliente" });
    check("registra movimentação com sucesso", !error && !!data);
    movimentacaoId = data;
    const { data: row } = await admin.from("movimentacoes_bancarias").select("conciliado").eq("id", movimentacaoId).single();
    check("nasce não conciliada", row?.conciliado === false);

    const { error: eTipoAlvoInvalido } = await admTenant.client.rpc("conciliar_movimentacao", { p_movimentacao_id: movimentacaoId, p_tipo_alvo: "cartao", p_alvo_id: tituloReceberId });
    check("tipo de alvo de conciliação inválido é rejeitado", !!eTipoAlvoInvalido);

    const { error: eAlvoInexistente } = await admTenant.client.rpc("conciliar_movimentacao", { p_movimentacao_id: movimentacaoId, p_tipo_alvo: "titulo_receber", p_alvo_id: "00000000-0000-0000-0000-000000000000" });
    check("alvo de conciliação inexistente é rejeitado", !!eAlvoInexistente);

    const { error: eConciliar } = await admTenant.client.rpc("conciliar_movimentacao", { p_movimentacao_id: movimentacaoId, p_tipo_alvo: "titulo_receber", p_alvo_id: tituloReceberId });
    check("concilia movimentação com título a receber", !eConciliar);
    const { data: rowConciliada } = await admin.from("movimentacoes_bancarias").select("conciliado, conciliado_com_tipo, conciliado_com_id").eq("id", movimentacaoId).single();
    check("estado de conciliação persistido corretamente", rowConciliada?.conciliado === true && rowConciliada?.conciliado_com_tipo === "titulo_receber" && rowConciliada?.conciliado_com_id === tituloReceberId);

    const { error: eReconciliar } = await admTenant.client.rpc("conciliar_movimentacao", { p_movimentacao_id: movimentacaoId, p_tipo_alvo: "titulo_pagar", p_alvo_id: tituloAlcadaId });
    check("movimentação já conciliada rejeita nova conciliação sem desconciliar antes", !!eReconciliar);

    const { error: eDesconciliar } = await admTenant.client.rpc("desconciliar_movimentacao", { p_movimentacao_id: movimentacaoId });
    check("desconcilia com sucesso", !eDesconciliar);
    const { data: rowDesconciliada } = await admin.from("movimentacoes_bancarias").select("conciliado, conciliado_com_tipo").eq("id", movimentacaoId).single();
    check("campos de conciliação limpos", rowDesconciliada?.conciliado === false && rowDesconciliada?.conciliado_com_tipo === null);
  }

  console.log("\n12. Isolamento cross-tenant — contas, cobranças e movimentações");
  {
    const { data: crossContas } = await otherTenant.client.from("contas_bancarias").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga contas bancárias do tenant A", (crossContas ?? []).length === 0);

    const { data: crossCobrancas } = await otherTenant.client.from("cobrancas").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga cobranças do tenant A", (crossCobrancas ?? []).length === 0);

    const { data: crossMov } = await otherTenant.client.from("movimentacoes_bancarias").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga movimentações bancárias do tenant A", (crossMov ?? []).length === 0);

    const { error: eCrossConciliar } = await otherTenant.client.rpc("conciliar_movimentacao", { p_movimentacao_id: movimentacaoId, p_tipo_alvo: "titulo_receber", p_alvo_id: tituloReceberId });
    check("tenant B não concilia movimentação do tenant A", !!eCrossConciliar);
  }

  console.log("\n13. Cada ação relevante grava sua própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .eq("company_id", admTenant.company.id)
      .gte("created_at", testStartedAt)
      .in("action", [
        "financeiro.conta_bancaria_configurada", "financeiro.conta_bancaria_desativada", "financeiro.conta_bancaria_ativada",
        "financeiro.alcada_definida", "financeiro.alcada_desativada", "financeiro.pagamento_submetido_aprovacao",
        "financeiro.etapa_aprovacao_decidida", "financeiro.cobranca_gerada", "financeiro.cobranca_paga", "financeiro.cobranca_cancelada",
        "financeiro.movimentacao_registrada", "financeiro.movimentacao_conciliada", "financeiro.movimentacao_desconciliada",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of [
      "financeiro.conta_bancaria_configurada", "financeiro.conta_bancaria_desativada", "financeiro.conta_bancaria_ativada",
      "financeiro.alcada_definida", "financeiro.alcada_desativada", "financeiro.pagamento_submetido_aprovacao",
      "financeiro.etapa_aprovacao_decidida", "financeiro.cobranca_gerada", "financeiro.cobranca_paga", "financeiro.cobranca_cancelada",
      "financeiro.movimentacao_registrada", "financeiro.movimentacao_conciliada", "financeiro.movimentacao_desconciliada",
    ]) {
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
