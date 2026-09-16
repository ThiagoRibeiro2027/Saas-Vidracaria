// Testes automatizados do TÓPICO 11 — Financeiro, recorte mínimo do MVP
// (ADR-002 §4.14): só título a receber vinculado a pedido, parcelas
// planejadas, status básico e registro de recebimento — sem plano de
// contas, contas a pagar, conciliação, DRE, empréstimos ou comissões.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-financeiro.mjs

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

// Pedido liberado com valor total conhecido (quantidade x preco_unitario).
async function prepararPedidoLiberado(tenant, sufixo, quantidade = 10, precoUnitario = 100) {
  for (const [dt, pfx] of [["orcamento", "ORC"], ["pedido", "PED"], ["titulo_financeiro", "TIT"]]) {
    await tenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: dt, p_prefixo: `${pfx}${sufixo}-`, p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
  }

  const { data: pessoaId } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CNPJ", p_documento: `1144455500${sufixo}`, p_nome: "JR Box Vidros",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  const { data: itemId } = await tenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: `VD-FIN-${sufixo}`, p_descricao: "Vidro temperado 10mm",
    p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
    p_situacao: "ativo",
  });

  const { data: orcamentoId } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
  });
  await tenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: quantidade, p_preco_unitario: precoUnitario,
  });
  await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });
  const { data: pedidoId } = await tenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  await tenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
  await tenant.client.rpc("liberar_pedido", { p_id: pedidoId });

  return { pedidoId, valorTotal: quantidade * precoUnitario };
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão de financeiro, outro tenant)...");
  const admTenant = await createTenant("financeiro-test-admin", "Financeiro Admin Teste", "11f01", "ADMIN");
  // QUALIDADE administra Qualidade, não Financeiro — prova a autoridade separada.
  const noPermTenant = await createTenant("financeiro-test-admin", "Financeiro SemPerm Teste", "11f02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant("financeiro-test-other", "Financeiro Outro Teste", "11f03", "ADMIN");

  console.log("\n0. Massa de dados — pedido liberado (valor total 1000)");
  const massa = await prepararPedidoLiberado(admTenant, "1", 10, 100);
  check("pedido liberado com valor total conhecido", massa.valorTotal === 1000);

  console.log("\n1. gerar_titulos_pedido() exige financeiro.manage");
  {
    const { error } = await noPermTenant.client.rpc("gerar_titulos_pedido", {
      p_pedido_id: massa.pedidoId, p_parcelas: [{ valor: 1000, vencimento: "2027-01-01" }],
    });
    check("sem financeiro.manage (papel QUALIDADE) não gera título", !!error);
  }

  console.log("\n2. gerar_titulos_pedido() rejeita pedido não liberado");
  {
    // pedido "recebido" (não liberado) de propósito, reaproveitando o item/pessoa da massa
    const { data: orcId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: (await admin.from("pedidos").select("pessoa_id").eq("id", massa.pedidoId).single()).data.pessoa_id,
      p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
    });
    const { data: itemRow } = await admin.from("pedido_itens").select("item_id").eq("pedido_id", massa.pedidoId).single();
    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcId, p_item_id: itemRow.item_id, p_quantidade: 1, p_preco_unitario: 50,
    });
    await admTenant.client.rpc("decidir_orcamento", { p_id: orcId, p_decisao: "aprovado" });
    const { data: pedidoNaoLiberadoId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcId });

    const { error } = await admTenant.client.rpc("gerar_titulos_pedido", {
      p_pedido_id: pedidoNaoLiberadoId, p_parcelas: [{ valor: 50, vencimento: "2027-01-01" }],
    });
    check("pedido 'recebido' (não liberado) não gera título", !!error);
  }

  console.log("\n3. gerar_titulos_pedido() rejeita soma de parcelas diferente do valor do pedido");
  {
    const { error } = await admTenant.client.rpc("gerar_titulos_pedido", {
      p_pedido_id: massa.pedidoId, p_parcelas: [{ valor: 999, vencimento: "2027-01-01" }],
    });
    check("soma (999) diferente do valor do pedido (1000) é rejeitada", !!error);
  }

  console.log("\n4. gerar_titulos_pedido() rejeita parcela com valor <= 0 e sem vencimento");
  {
    const { error: e1 } = await admTenant.client.rpc("gerar_titulos_pedido", {
      p_pedido_id: massa.pedidoId, p_parcelas: [{ valor: 0, vencimento: "2027-01-01" }],
    });
    check("parcela com valor zero é rejeitada", !!e1);

    const { error: e2 } = await admTenant.client.rpc("gerar_titulos_pedido", {
      p_pedido_id: massa.pedidoId, p_parcelas: [{ valor: 1000 }],
    });
    check("parcela sem vencimento é rejeitada", !!e2);
  }

  console.log("\n5. gerar_titulos_pedido() sucesso — 2 parcelas");
  let titulo1Id, titulo2Id;
  {
    const { data, error } = await admTenant.client.rpc("gerar_titulos_pedido", {
      p_pedido_id: massa.pedidoId,
      p_parcelas: [
        { valor: 600, vencimento: "2027-01-01", condicao_pagamento: "30 dias" },
        { valor: 400, vencimento: "2027-02-01", condicao_pagamento: "60 dias" },
      ],
    });
    check("ADMIN gera 2 títulos", !error && Array.isArray(data) && data.length === 2);
    [titulo1Id, titulo2Id] = data;

    const { data: titulos } = await admin.from("titulos_financeiros").select("*").eq("pedido_id", massa.pedidoId).order("parcela_numero");
    check("2 linhas criadas, status 'aberto', numero gerado", titulos.length === 2 && titulos.every((t) => t.status === "aberto" && /^TIT1-\d{4}$/.test(t.numero)));
    check("parcela_numero/parcela_total corretos", titulos[0].parcela_numero === 1 && titulos[0].parcela_total === 2 && titulos[1].parcela_numero === 2);
    check("valores corretos (600 e 400)", Number(titulos[0].valor) === 600 && Number(titulos[1].valor) === 400);
  }

  console.log("\n6. gerar_titulos_pedido() rejeita gerar de novo pro mesmo pedido (duplicidade)");
  {
    const { error } = await admTenant.client.rpc("gerar_titulos_pedido", {
      p_pedido_id: massa.pedidoId, p_parcelas: [{ valor: 1000, vencimento: "2027-03-01" }],
    });
    check("pedido que já tem título não gera de novo", !!error);
  }

  console.log("\n7. registrar_recebimento_titulo() exige financeiro.receber (distinta de financeiro.manage)");
  {
    const { error: semPermError } = await noPermTenant.client.rpc("registrar_recebimento_titulo", {
      p_titulo_id: titulo1Id, p_valor: 100, p_data_recebimento: "2027-01-01",
    });
    check("papel sem nenhuma permissão de financeiro não registra recebimento", !!semPermError);
  }

  console.log("\n8. registrar_recebimento_titulo() rejeita valor acima do saldo");
  {
    const { error } = await admTenant.client.rpc("registrar_recebimento_titulo", {
      p_titulo_id: titulo1Id, p_valor: 700, p_data_recebimento: "2027-01-01",
    });
    check("recebimento (700) maior que o valor do título (600) é rejeitado", !!error);
  }

  console.log("\n9. registrar_recebimento_titulo() acumula por soma — parcial depois pago");
  {
    const { error: e1 } = await admTenant.client.rpc("registrar_recebimento_titulo", {
      p_titulo_id: titulo1Id, p_valor: 200, p_data_recebimento: "2027-01-01",
    });
    check("primeiro recebimento parcial aceito", !e1);
    const { data: t1 } = await admin.from("titulos_financeiros").select("*").eq("id", titulo1Id).single();
    check("status vira 'parcial', saldo_pendente reflete a soma", t1.status === "parcial" && Number(t1.valor_recebido) === 200 && Number(t1.saldo_pendente) === 400);

    const { error: e2 } = await admTenant.client.rpc("registrar_recebimento_titulo", {
      p_titulo_id: titulo1Id, p_valor: 400, p_data_recebimento: "2027-01-15",
    });
    check("segundo recebimento completa o título", !e2);
    const { data: t1depois } = await admin.from("titulos_financeiros").select("*").eq("id", titulo1Id).single();
    check("status vira 'pago', saldo_pendente zero", t1depois.status === "pago" && Number(t1depois.saldo_pendente) === 0);

    const { data: recebimentos } = await admin.from("recebimentos_titulo").select("valor").eq("titulo_id", titulo1Id);
    check("2 recebimentos registrados no histórico", (recebimentos ?? []).length === 2);
  }

  console.log("\n10. registrar_recebimento_titulo() rejeita título já pago");
  {
    const { error } = await admTenant.client.rpc("registrar_recebimento_titulo", {
      p_titulo_id: titulo1Id, p_valor: 1, p_data_recebimento: "2027-01-16",
    });
    check("recebimento em título já pago é rejeitado", !!error);
  }

  console.log("\n11. cancelar_titulo_financeiro() rejeita título com recebimento (não é mais 'aberto')");
  {
    const { error } = await admTenant.client.rpc("cancelar_titulo_financeiro", { p_id: titulo1Id, p_motivo: "teste" });
    check("não cancela título pago/com recebimento", !!error);
  }

  console.log("\n12. cancelar_titulo_financeiro() sucesso em título aberto, com motivo");
  {
    const { error } = await admTenant.client.rpc("cancelar_titulo_financeiro", { p_id: titulo2Id, p_motivo: "renegociado fora do sistema" });
    check("cancela título aberto sem recebimento", !error);
    const { data: t2 } = await admin.from("titulos_financeiros").select("status, motivo_cancelamento").eq("id", titulo2Id).single();
    check("status vira 'cancelado' com motivo salvo", t2.status === "cancelado" && t2.motivo_cancelamento === "renegociado fora do sistema");
  }

  console.log("\n13. cancelar_titulo_financeiro() rejeita título já cancelado");
  {
    const { error } = await admTenant.client.rpc("cancelar_titulo_financeiro", { p_id: titulo2Id, p_motivo: "de novo" });
    check("cancelar título já cancelado é rejeitado", !!error);
  }

  console.log("\n14. Isolamento entre tenants");
  {
    const { data: crossTitulos } = await otherTenant.client.from("titulos_financeiros").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga títulos do tenant A", (crossTitulos ?? []).length === 0);

    const outroPedido = await prepararPedidoLiberado(admTenant, "14", 1, 10);
    const { error: crossGerarError } = await otherTenant.client.rpc("gerar_titulos_pedido", {
      p_pedido_id: outroPedido.pedidoId, p_parcelas: [{ valor: 10, vencimento: "2027-01-01" }],
    });
    check("tenant B não consegue gerar título pro pedido do tenant A", !!crossGerarError);
  }

  console.log("\n15. SELECT liberado sem financeiro.manage (papel QUALIDADE lê normalmente)");
  {
    const { data, error } = await noPermTenant.client.from("titulos_financeiros").select("id").eq("id", titulo1Id);
    check("papel QUALIDADE (sem financeiro.manage) lê titulos_financeiros da própria empresa", !error && (data ?? []).length === 1);
  }

  console.log("\n16. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", ["financeiro.titulo_gerado", "financeiro.recebimento_registrado", "financeiro.titulo_cancelado"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of ["financeiro.titulo_gerado", "financeiro.recebimento_registrado", "financeiro.titulo_cancelado"]) {
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
