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

  // =========================================================================
  // Fase C do plano de 23/09/2026 — necessidades automáticas geradas a
  // partir de pedido/ordem de produção com peça (BOM leve, TÓPICO/Fase A)
  // associada. Reaproveita admTenant/noPermTenant/otherTenant já criados
  // acima; monta seu próprio cliente/pedidos pra não interferir nos blocos
  // 1-14 (que já usaram o item "VD-SUP-1" e a necessidade original).
  // =========================================================================

  console.log("\n15. Massa de dados — cliente e peça/composição pra necessidades automáticas");
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: "ORCSA-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido", p_prefixo: "PEDSA-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "ordem_producao", p_prefixo: "OPSA-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  const { data: clienteSaId } = await admTenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CPF", p_documento: "33333333333", p_nome: "Cliente Supr Auto",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: clienteSaId, p_papel: "CLIENTE", p_ativo: true });

  async function prepararPedidoComPeca(sufixo, { quantidadePedido, quantidadePorUnidade, comPeca = true }) {
    const { data: itemPecaId } = await admTenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: `PC-SA-${sufixo}`, p_descricao: `Peça ${sufixo}`, p_tipo: "produto_acabado",
      p_classificacao: "esquadria", p_unidade_principal: "UN", p_situacao: "ativo",
    });
    let materialItemId = null;
    let pecaId = null;
    if (comPeca) {
      const { data: matId } = await admTenant.client.rpc("upsert_item", {
        p_id: null, p_codigo: `MT-SA-${sufixo}`, p_descricao: `Material ${sufixo}`, p_tipo: "materia_prima",
        p_classificacao: "perfil", p_unidade_principal: "M", p_situacao: "ativo",
      });
      materialItemId = matId;
      const { data: pId } = await admTenant.client.rpc("criar_peca", { p_item_id: itemPecaId, p_descricao_tecnica: null });
      pecaId = pId;
      await admTenant.client.rpc("adicionar_material_peca", {
        p_peca_id: pecaId, p_material_item_id: materialItemId, p_quantidade_por_unidade: quantidadePorUnidade, p_observacao: null,
      });
    }

    const { data: orcamentoId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteSaId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
    });
    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemPecaId, p_quantidade: quantidadePedido, p_preco_unitario: 100,
    });
    await admTenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });
    const { data: pedidoId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
    const { data: pedidoItem } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).single();

    return { itemPecaId, materialItemId, pecaId, pedidoId, pedidoItemId: pedidoItem.id };
  }

  console.log("\n16. gerar_necessidades_de_pedido() rejeita pedido não liberado");
  const cenarioA = await prepararPedidoComPeca("A", { quantidadePedido: 5, quantidadePorUnidade: 2 });
  {
    const { error } = await admTenant.client.rpc("gerar_necessidades_de_pedido", { p_pedido_id: cenarioA.pedidoId });
    check("pedido ainda não liberado é rejeitado", !!error);
  }
  await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: cenarioA.pedidoId });
  await admTenant.client.rpc("liberar_pedido", { p_id: cenarioA.pedidoId });

  console.log("\n17. gerar_necessidades_de_pedido() sucesso — sem estoque, 5 peças x 2 = falta 10");
  {
    const { data, error } = await admTenant.client.rpc("gerar_necessidades_de_pedido", { p_pedido_id: cenarioA.pedidoId });
    check("gera necessidade sem erro", !error);
    check("falta calculada corretamente (10)", (data ?? []).length === 1 && Number(data[0].quantidade_gerada) === 10);

    const { data: nc } = await admin.from("necessidades_compra").select("*").eq("item_id", cenarioA.materialItemId);
    check("necessidade nasce 'aberta' com origem 'pedido'", nc?.length === 1 && nc[0].status === "aberta" && nc[0].origem === "pedido" && Number(nc[0].quantidade) === 10);
  }

  console.log("\n18. gerar_necessidades_de_pedido() reexecutado — idempotente, 0 linhas novas");
  {
    const { data } = await admTenant.client.rpc("gerar_necessidades_de_pedido", { p_pedido_id: cenarioA.pedidoId });
    check("reexecução não gera linha nova", (data ?? []).length === 0);
    const { data: nc } = await admin.from("necessidades_compra").select("id").eq("item_id", cenarioA.materialItemId).eq("status", "aberta");
    check("continua só 1 necessidade aberta", (nc ?? []).length === 1);
  }

  console.log("\n19. gerar_necessidades_de_pedido() com estoque parcial — necessário 6, disponível 2, falta 4");
  const cenarioB = await prepararPedidoComPeca("B", { quantidadePedido: 2, quantidadePorUnidade: 3 });
  await admTenant.client.rpc("ajustar_saldo", { p_item_id: cenarioB.materialItemId, p_quantidade_delta: 2, p_motivo: "estoque inicial teste" });
  await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: cenarioB.pedidoId });
  await admTenant.client.rpc("liberar_pedido", { p_id: cenarioB.pedidoId });
  {
    const { data, error } = await admTenant.client.rpc("gerar_necessidades_de_pedido", { p_pedido_id: cenarioB.pedidoId });
    check("gera necessidade sem erro", !error);
    check("falta descontando estoque disponível (4)", (data ?? []).length === 1 && Number(data[0].quantidade_gerada) === 4);
  }

  console.log("\n20. Segundo pedido do mesmo material — já sinalizado + estoque cobrem a nova demanda, 0 linhas novas");
  {
    const { data: orcamentoId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteSaId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
    });
    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: cenarioB.itemPecaId, p_quantidade: 1, p_preco_unitario: 100,
    });
    await admTenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });
    const { data: pedidoB2Id } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
    await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoB2Id });
    await admTenant.client.rpc("liberar_pedido", { p_id: pedidoB2Id });

    const { data } = await admTenant.client.rpc("gerar_necessidades_de_pedido", { p_pedido_id: pedidoB2Id });
    check("demanda já coberta por necessidade aberta + estoque não gera linha nova", (data ?? []).length === 0);
  }

  console.log("\n21. Item de pedido sem peça associada é ignorado, sem erro");
  const cenarioC = await prepararPedidoComPeca("C", { quantidadePedido: 5, quantidadePorUnidade: 0, comPeca: false });
  await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: cenarioC.pedidoId });
  await admTenant.client.rpc("liberar_pedido", { p_id: cenarioC.pedidoId });
  {
    const { data, error } = await admTenant.client.rpc("gerar_necessidades_de_pedido", { p_pedido_id: cenarioC.pedidoId });
    check("item sem peça associada não gera erro nem necessidade", !error && (data ?? []).length === 0);
  }

  console.log("\n22. gerar_necessidades_de_ordem_producao() sucesso — necessário 4x2=8, falta 8");
  const cenarioD = await prepararPedidoComPeca("D", { quantidadePedido: 3, quantidadePorUnidade: 4 });
  await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: cenarioD.pedidoId });
  await admTenant.client.rpc("liberar_pedido", { p_id: cenarioD.pedidoId });
  const { data: opDId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: cenarioD.pedidoItemId, p_quantidade: 2 });
  {
    const { data, error } = await admTenant.client.rpc("gerar_necessidades_de_ordem_producao", { p_ordem_producao_id: opDId });
    check("gera necessidade a partir da OP sem erro", !error);
    check("falta calculada pela quantidade_planejada da OP (8)", (data ?? []).length === 1 && Number(data[0].quantidade_gerada) === 8);
  }

  console.log("\n23. gerar_necessidades_de_ordem_producao() reexecutado — idempotente");
  {
    const { data } = await admTenant.client.rpc("gerar_necessidades_de_ordem_producao", { p_ordem_producao_id: opDId });
    check("reexecução não gera linha nova", (data ?? []).length === 0);
  }

  console.log("\n24. gerar_necessidades_de_pedido()/gerar_necessidades_de_ordem_producao() exigem suprimentos.manage");
  {
    const { error: err1 } = await noPermTenant.client.rpc("gerar_necessidades_de_pedido", { p_pedido_id: cenarioA.pedidoId });
    check("sem suprimentos.manage não gera necessidade de pedido", !!err1);
    const { error: err2 } = await noPermTenant.client.rpc("gerar_necessidades_de_ordem_producao", { p_ordem_producao_id: opDId });
    check("sem suprimentos.manage não gera necessidade de OP", !!err2);
  }

  console.log("\n25. Isolamento — tenant B não gera necessidade de pedido/OP do tenant A");
  {
    const { error: err1 } = await otherTenant.client.rpc("gerar_necessidades_de_pedido", { p_pedido_id: cenarioA.pedidoId });
    check("tenant B não gera necessidade do pedido do tenant A", !!err1);
    const { error: err2 } = await otherTenant.client.rpc("gerar_necessidades_de_ordem_producao", { p_ordem_producao_id: opDId });
    check("tenant B não gera necessidade da OP do tenant A", !!err2);
  }

  console.log("\n26. Auditoria das gerações automáticas");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", ["suprimentos.necessidades_geradas_de_pedido", "suprimentos.necessidades_geradas_de_producao"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("suprimentos.necessidades_geradas_de_pedido registrado", actions.has("suprimentos.necessidades_geradas_de_pedido"));
    check("suprimentos.necessidades_geradas_de_producao registrado", actions.has("suprimentos.necessidades_geradas_de_producao"));
  }

  // =========================================================================
  // Fase D do plano de 23/09/2026 — recebimento leve (ADR-002 §4.18 v2.7).
  // Não é Pedido de Compra/fornecedor/cotação — só o passo a mais depois
  // de "atendida": marcar como recebida com a quantidade recebida, dando
  // entrada física no estoque via ajustar_saldo() já existente (T6).
  // =========================================================================

  console.log("\n27. Massa de dados — item, necessidade e um papel só com suprimentos.manage (sem estoque.manage)");
  const { data: itemRecebId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "MT-RC-1", p_descricao: "Material recebimento teste", p_tipo: "materia_prima",
    p_classificacao: "perfil", p_unidade_principal: "M", p_situacao: "ativo",
  });
  const { data: necRecebId } = await admTenant.client.rpc("criar_necessidade_compra", {
    p_item_id: itemRecebId, p_quantidade: 20, p_data_necessaria: null, p_origem: "manual", p_observacoes: null,
  });

  // Papel de empresa com só suprimentos.manage — prova que registrar_
  // recebimento_necessidade() reaproveita o gate de estoque.manage do
  // ajustar_saldo() em vez de contorná-lo (decisão registrada no
  // cabeçalho da migration 20261014000000).
  const { data: papelSoSuprId } = await admTenant.client.rpc("criar_papel_empresa", { p_key: "SO_SUPRIMENTOS", p_name: "Só Suprimentos" });
  const { data: permSuprimentosManage } = await admin
    .from("permissions").select("id").eq("resource", "suprimentos").eq("action", "manage").single();
  await admTenant.client.rpc("conceder_permissao_papel", { p_role_id: papelSoSuprId, p_permission_id: permSuprimentosManage.id });

  const soSuprEmail = "so-suprimentos.suprimentos-test-admin@users.internal";
  const { data: soSuprCreated } = await admin.auth.admin.createUser({ email: soSuprEmail, password: "senha-de-teste-123456", email_confirm: true });
  let soSuprUserId = soSuprCreated?.user?.id;
  if (!soSuprUserId) {
    const { data: list } = await admin.auth.admin.listUsers();
    soSuprUserId = list.users.find((u) => u.email === soSuprEmail)?.id;
  }
  await admin.from("profiles").upsert(
    { id: soSuprUserId, company_id: admTenant.company.id, login_identifier: "so-suprimentos", display_name: "Só Suprimentos Teste" },
    { onConflict: "id" },
  );
  await admin.from("user_roles").insert({ profile_id: soSuprUserId, role_id: papelSoSuprId });
  const soSuprClient = createClient(url, anonKey);
  await soSuprClient.auth.signInWithPassword({ email: soSuprEmail, password: "senha-de-teste-123456" });

  console.log("\n28. registrar_recebimento_necessidade() rejeita necessidade ainda aberta (não atendida)");
  {
    const { error } = await admTenant.client.rpc("registrar_recebimento_necessidade", {
      p_id: necRecebId, p_quantidade_recebida: 20, p_observacao: null,
    });
    check("necessidade 'aberta' (não atendida) é rejeitada", !!error);
  }

  await admTenant.client.rpc("atender_necessidade_compra", { p_id: necRecebId });

  console.log("\n29. registrar_recebimento_necessidade() rejeita quantidade <= 0");
  {
    const { error } = await admTenant.client.rpc("registrar_recebimento_necessidade", {
      p_id: necRecebId, p_quantidade_recebida: 0, p_observacao: null,
    });
    check("quantidade recebida zero é rejeitada", !!error);
  }

  console.log("\n30. registrar_recebimento_necessidade() exige suprimentos.manage");
  {
    const { error } = await noPermTenant.client.rpc("registrar_recebimento_necessidade", {
      p_id: necRecebId, p_quantidade_recebida: 20, p_observacao: null,
    });
    check("sem suprimentos.manage não registra recebimento", !!error);
  }

  console.log("\n31. registrar_recebimento_necessidade() exige TAMBÉM estoque.manage (reaproveita o gate do ajustar_saldo)");
  {
    const { error } = await soSuprClient.rpc("registrar_recebimento_necessidade", {
      p_id: necRecebId, p_quantidade_recebida: 20, p_observacao: null,
    });
    check("papel com suprimentos.manage mas sem estoque.manage é rejeitado", !!error);
  }

  console.log("\n32. registrar_recebimento_necessidade() rejeita necessidade de outro tenant");
  {
    const { error } = await otherTenant.client.rpc("registrar_recebimento_necessidade", {
      p_id: necRecebId, p_quantidade_recebida: 20, p_observacao: null,
    });
    check("necessidade de outro tenant é rejeitada", !!error);
  }

  console.log("\n33. registrar_recebimento_necessidade() sucesso — recebimento parcial (15 de 20)");
  {
    const { error } = await admTenant.client.rpc("registrar_recebimento_necessidade", {
      p_id: necRecebId, p_quantidade_recebida: 15, p_observacao: "primeira remessa",
    });
    check("ADMIN registra recebimento parcial sem erro", !error);

    const { data: nc } = await admin.from("necessidades_compra").select("*").eq("id", necRecebId).single();
    check(
      "necessidade vira 'recebida' com quantidade_recebida/data_recebimento/recebido_por preenchidos",
      nc?.status === "recebida" && Number(nc?.quantidade_recebida) === 15 && !!nc?.data_recebimento && !!nc?.recebido_por,
    );

    const { data: saldo } = await admin.from("estoque_saldos").select("quantidade_fisica").eq("item_id", itemRecebId).single();
    check("estoque recebe entrada física de 15", Number(saldo?.quantidade_fisica) === 15);
  }

  console.log("\n34. registrar_recebimento_necessidade() rejeita necessidade já recebida");
  {
    const { error } = await admTenant.client.rpc("registrar_recebimento_necessidade", {
      p_id: necRecebId, p_quantidade_recebida: 5, p_observacao: null,
    });
    check("necessidade já recebida não pode ser recebida de novo", !!error);
  }

  console.log("\n35. Auditoria do recebimento");
  {
    const { data: events } = await admin.from("activity_logs").select("action").eq("action", "suprimentos.necessidade_recebida");
    check("suprimentos.necessidade_recebida registrado", (events ?? []).length >= 1);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
