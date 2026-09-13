// Testes automatizados do TÓPICO 5 — Engenharia, recorte mínimo do M1
// (PLANO DE ENTREGA — MVP DO PILOTO v1.0, novembro): item de produção
// vinculado a pedido liberado, medição em obra e a regra de bloqueio por
// medida não confirmada (TÓPICO 16 §7).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-engenharia.mjs

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

async function createTenant(slug, name, identifier, roleKey = "ADMIN") {
  const { data: company } = await admin
    .from("companies")
    .upsert({ slug, name }, { onConflict: "slug" })
    .select()
    .single();

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

async function prepararPedidoLiberado(tenant, sufixo, itemTipo = "produto_acabado") {
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: `ORC${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido", p_prefixo: `PED${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });

  const { data: pessoaId } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CNPJ", p_documento: `1122233300${sufixo}`, p_nome: "JR Box Vidros",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  const { data: obraId } = await tenant.client.rpc("upsert_obra", {
    p_id: null, p_pessoa_id: pessoaId, p_nome: "Obra Teste",
    p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });

  const { data: itemId } = await tenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: `VD-${sufixo}`, p_descricao: "Vidro temperado sob medida",
    p_tipo: itemTipo, p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
    p_situacao: "ativo",
  });

  const { data: orcamentoId } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: obraId, p_validade: null,
    p_condicao_comercial: null, p_observacoes: null,
  });
  await tenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: 3, p_preco_unitario: 300,
  });
  await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });

  const { data: pedidoId } = await tenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  await tenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
  await tenant.client.rpc("liberar_pedido", { p_id: pedidoId });

  const { data: pedidoItem } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).single();

  return { pessoaId, obraId, itemId, itemTipo, orcamentoId, pedidoId, pedidoItemId: pedidoItem.id };
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão, outro tenant)...");
  const admTenant = await createTenant("engenharia-test-admin", "Engenharia Admin Teste", "9a01", "ADMIN");
  const noPermTenant = await createTenant("engenharia-test-noperm", "Engenharia SemPerm Teste", "9a02", "COMERCIAL");
  const otherTenant = await createTenant("engenharia-test-other", "Engenharia Outro Teste", "9a03", "ADMIN");

  console.log("\n0. Massa de dados — pedido liberado com item sob medida + regra de medição ativa");
  const massa = await prepararPedidoLiberado(admTenant, "1");
  await admTenant.client.rpc("upsert_measurement_rule", {
    p_tipo_item: massa.itemTipo, p_exige_medicao_confirmada: true, p_ativo: true,
  });
  check("pedido liberado com item preparado", !!massa.pedidoItemId);

  console.log("\n1. criar_item_producao exige engenharia.manage");
  {
    const { error } = await noPermTenant.client.rpc("criar_item_producao", { p_pedido_item_id: massa.pedidoItemId });
    check("sem engenharia.manage não cria item de produção", !!error);
  }

  console.log("\n2. criar_item_producao exige pedido liberado");
  let pedidoNaoLiberadoItemId;
  {
    await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "orcamento", p_prefixo: "ORCX-", p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
    await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "pedido", p_prefixo: "PEDX-", p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
    const { data: orcId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: massa.pessoaId, p_obra_id: null, p_validade: null,
      p_condicao_comercial: null, p_observacoes: null,
    });
    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcId, p_item_id: massa.itemId, p_quantidade: 1, p_preco_unitario: 100,
    });
    await admTenant.client.rpc("decidir_orcamento", { p_id: orcId, p_decisao: "aprovado" });
    const { data: pedidoIdNaoLiberado } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcId });
    // Fica em 'recebido' de propósito — nem inicia conferência.

    const { data: pedidoItem } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoIdNaoLiberado).single();
    pedidoNaoLiberadoItemId = pedidoItem.id;

    const { error } = await admTenant.client.rpc("criar_item_producao", { p_pedido_item_id: pedidoNaoLiberadoItemId });
    check("pedido ainda 'recebido' (não liberado) é rejeitado", !!error);

    const { error: inexistenteError } = await admTenant.client.rpc("criar_item_producao", {
      p_pedido_item_id: "00000000-0000-0000-0000-000000000000",
    });
    check("pedido_item inexistente é rejeitado", !!inexistenteError);
  }

  console.log("\n3. Cria item de produção — só uma vez por pedido_item");
  let itemProducaoId;
  {
    const { data: id, error } = await admTenant.client.rpc("criar_item_producao", { p_pedido_item_id: massa.pedidoItemId });
    check("engenharia iniciada com sucesso", !error && !!id);
    itemProducaoId = id;

    const { error: dupError } = await admTenant.client.rpc("criar_item_producao", { p_pedido_item_id: massa.pedidoItemId });
    check("mesmo pedido_item não pode iniciar engenharia duas vezes", !!dupError);
  }

  console.log("\n4. Antes de registrar medida, pedido está bloqueado para produção");
  {
    const { data: bloqueado } = await admTenant.client.rpc("pedido_bloqueado_por_medicao", { p_pedido_id: massa.pedidoId });
    check("pedido bloqueado sem medida confirmada", bloqueado === true);
  }

  console.log("\n5. Registrar medição — validações e efeito");
  {
    const { error: invalidaError } = await admTenant.client.rpc("registrar_medicao", {
      p_id: itemProducaoId, p_ambiente: "Sala", p_largura_mm: 0, p_altura_mm: 1000,
    });
    check("medida com largura zero é rejeitada", !!invalidaError);

    const { error } = await admTenant.client.rpc("registrar_medicao", {
      p_id: itemProducaoId, p_ambiente: "Sala", p_largura_mm: 1200, p_altura_mm: 1500,
    });
    check("medida registrada com sucesso", !error);

    const { data: row } = await admin.from("itens_producao").select("*").eq("id", itemProducaoId).single();
    check("medida gravada corretamente", row?.largura_mm === "1200.00" || Number(row?.largura_mm) === 1200);
    check("medida recém-registrada não vem confirmada", row?.medida_confirmada === false);
  }

  console.log("\n6. Confirmar medição");
  {
    const { error: semMedidaError } = await admTenant.client.rpc("confirmar_medicao", { p_id: "00000000-0000-0000-0000-000000000000" });
    check("confirmar item de produção inexistente falha", !!semMedidaError);

    const { error } = await admTenant.client.rpc("confirmar_medicao", { p_id: itemProducaoId });
    check("confirma medida com sucesso", !error);

    const { data: row } = await admin.from("itens_producao").select("medida_confirmada").eq("id", itemProducaoId).single();
    check("medida_confirmada vira true", row?.medida_confirmada === true);

    const { error: jaConfirmadaError } = await admTenant.client.rpc("confirmar_medicao", { p_id: itemProducaoId });
    check("medida já confirmada não pode ser confirmada de novo", !!jaConfirmadaError);
  }

  console.log("\n7. Pedido deixa de estar bloqueado com a medida confirmada");
  {
    const { data: bloqueado } = await admTenant.client.rpc("pedido_bloqueado_por_medicao", { p_pedido_id: massa.pedidoId });
    check("pedido não bloqueado com medida confirmada", bloqueado === false);
  }

  console.log("\n8. Registrar nova medida desfaz a confirmação anterior");
  {
    const { error } = await admTenant.client.rpc("registrar_medicao", {
      p_id: itemProducaoId, p_ambiente: "Sala (corrigido)", p_largura_mm: 1210, p_altura_mm: 1500,
    });
    check("nova medida registrada", !error);

    const { data: row } = await admin.from("itens_producao").select("medida_confirmada").eq("id", itemProducaoId).single();
    check("confirmação anterior é desfeita ao corrigir a medida", row?.medida_confirmada === false);

    const { data: bloqueado } = await admTenant.client.rpc("pedido_bloqueado_por_medicao", { p_pedido_id: massa.pedidoId });
    check("pedido volta a ficar bloqueado até reconfirmar", bloqueado === true);
  }

  console.log("\n9. Item sem regra de medição correspondente nunca bloqueia");
  {
    const massa2 = await prepararPedidoLiberado(admTenant, "2", "servico");
    const { data: bloqueado } = await admTenant.client.rpc("pedido_bloqueado_por_medicao", { p_pedido_id: massa2.pedidoId });
    check("pedido com item 'servico' (sem regra configurada) não é bloqueado", bloqueado === false);
  }

  console.log("\n10. Isolamento entre tenants");
  {
    const { data: crossItensProducao } = await otherTenant.client
      .from("itens_producao")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga itens de produção do tenant A", (crossItensProducao ?? []).length === 0);

    const { error: crossError } = await otherTenant.client.rpc("registrar_medicao", {
      p_id: itemProducaoId, p_ambiente: "invasão", p_largura_mm: 1, p_altura_mm: 1,
    });
    check("tenant B não consegue registrar medida em item do tenant A", !!crossError);
  }

  console.log("\n11. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "engenharia.item_producao_criado",
        "engenharia.medicao_registrada",
        "engenharia.medicao_confirmada",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("item_producao_criado registrado", actions.has("engenharia.item_producao_criado"));
    check("medicao_registrada registrado", actions.has("engenharia.medicao_registrada"));
    check("medicao_confirmada registrado", actions.has("engenharia.medicao_confirmada"));
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
