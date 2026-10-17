// Fix (migration 20261017104712): confirmar_medicao()/registrar_medicao()
// (Engenharia) nunca acionavam recalcular_situacao_ordem_producao() — uma OP
// nascida 'bloqueada' por medição não confirmada ficava com esse retrato
// CONGELADO mesmo depois da medição ser confirmada do lado da Engenharia,
// porque só ações do lado Produção (apontar/concluir/criar OP) recalculavam
// a situação. Achado pelo usuário comparando a tela de Produção (OP mostrava
// "Bloqueada") com a tela de Engenharia (item já mostrava "Confirmada").
//
// scripts/test-producao.mjs já cobre bloqueada→liberada, mas só depois de
// um apontar_producao() (que também recalcula) — mascarando esta regressão
// específica. Este teste confirma o recálculo acontecendo a partir da
// PRÓPRIA confirmar_medicao()/registrar_medicao(), sem nenhuma ação de
// Produção no meio, e cobre o caso de pedido com 2 itens (o bloqueio é
// avaliado pro pedido inteiro, não só pro item medido).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-recalculo-op-medicao.mjs

import "./lib/somente-local.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

async function createTenant(slug, name, identifier, roleKey = "ADMIN") {
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

// Pedido liberado com N itens do tipo 'material_auxiliar' (exige medição
// confirmada, configurado via measurement_rule no main()). Tipo escolhido
// por não ser usado em nenhum outro teste pra esse mesmo cenário (evita
// qualquer colisão de measurement_rule dentro da mesma empresa de teste).
async function prepararPedidoComMedicaoObrigatoria(tenant, sufixo, quantidadeItens) {
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: `ORCM${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido", p_prefixo: `PEDM${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "ordem_producao", p_prefixo: `OPM${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });

  const { data: pessoaId, error: pessoaErr } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CPF", p_documento: `3334445550${sufixo}`, p_nome: `Cliente Medição ${sufixo}`,
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  if (pessoaErr) console.error("[fixture] upsert_pessoa falhou:", pessoaErr);
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  const itemIds = [];
  for (let i = 0; i < quantidadeItens; i++) {
    const { data: itemId, error: itemErr } = await tenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: `MAT-M${sufixo}-${i}`, p_descricao: "Item com medição obrigatória (teste)",
      p_tipo: "material_auxiliar", p_classificacao: "teste", p_unidade_principal: "UN",
      p_situacao: "ativo",
    });
    if (itemErr) console.error("[fixture] upsert_item falhou:", itemErr);
    itemIds.push(itemId);
  }

  const { data: orcamentoId, error: orcErr } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: null, p_validade: null,
    p_condicao_comercial: null, p_observacoes: null,
  });
  if (orcErr) console.error("[fixture] upsert_orcamento falhou:", orcErr);
  for (const itemId of itemIds) {
    const { error: orcItemErr } = await tenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: 2, p_preco_unitario: 300,
    });
    if (orcItemErr) console.error("[fixture] upsert_orcamento_item falhou:", orcItemErr);
  }
  await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });

  const { data: pedidoId, error: convErr } = await tenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  if (convErr) console.error("[fixture] converter_orcamento_em_pedido falhou:", convErr);
  await tenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
  await tenant.client.rpc("liberar_pedido", { p_id: pedidoId });

  const { data: pedidoItens } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId);

  return { pedidoId, pedidoItens: pedidoItens ?? [] };
}

async function situacaoDaOp(opId) {
  const { data } = await admin.from("ordens_producao").select("situacao, motivo_bloqueio, origem_bloqueio").eq("id", opId).single();
  return data;
}

async function main() {
  console.log("Preparando tenant e regra de medição obrigatória...");
  const admTenant = await createTenant("recalculo-medicao-admin", "Recálculo Medição Admin Teste", "rem01", "ADMIN");
  const { error: regraErr } = await admTenant.client.rpc("upsert_measurement_rule", {
    p_tipo_item: "material_auxiliar", p_exige_medicao_confirmada: true, p_ativo: true,
  });
  check("fixture: measurement_rule configurada (material_auxiliar exige medição)", !regraErr, regraErr);

  console.log("\n1. Pedido com 1 item — OP nasce bloqueada por medição");
  const pedido1 = await prepararPedidoComMedicaoObrigatoria(admTenant, "1", 1);
  const { data: opId1, error: criarOpErr } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedido1.pedidoItens[0].id });
  check("OP criada sem erro", !criarOpErr, criarOpErr);
  {
    const op = await situacaoDaOp(opId1);
    check("OP nasce 'bloqueada' (medição ainda não existe)", op.situacao === "bloqueada", op);
    check("origem do bloqueio é 'medicao'", op.origem_bloqueio === "medicao", op);
  }

  console.log("\n2. confirmar_medicao() SOZINHA (sem apontar_producao) desbloqueia a OP — o bug corrigido");
  const { data: itemProducaoId, error: criarItemProdErr } = await admTenant.client.rpc("criar_item_producao", { p_pedido_item_id: pedido1.pedidoItens[0].id });
  check("item de produção (medição) criado", !criarItemProdErr, criarItemProdErr);

  const { error: registrarErr } = await admTenant.client.rpc("registrar_medicao", {
    p_id: itemProducaoId, p_ambiente: "Sala", p_largura_mm: 1200, p_altura_mm: 2100,
  });
  check("medida registrada sem erro", !registrarErr, registrarErr);
  {
    const op = await situacaoDaOp(opId1);
    check("OP continua 'bloqueada' logo após registrar (ainda não confirmada)", op.situacao === "bloqueada", op);
  }

  const { error: confirmarErr } = await admTenant.client.rpc("confirmar_medicao", { p_id: itemProducaoId });
  check("medida confirmada sem erro", !confirmarErr, confirmarErr);
  {
    const op = await situacaoDaOp(opId1);
    check("OP vira 'liberada' SÓ com confirmar_medicao, sem nenhuma ação de Produção", op.situacao === "liberada", op);
    check("motivo_bloqueio limpo", op.motivo_bloqueio === null, op);
  }

  console.log("\n3. registrar_medicao() de novo (remedição) re-bloqueia a OP que estava liberada");
  const { error: remedicaoErr } = await admTenant.client.rpc("registrar_medicao", {
    p_id: itemProducaoId, p_ambiente: "Sala", p_largura_mm: 1250, p_altura_mm: 2100,
  });
  check("remedição sem erro", !remedicaoErr, remedicaoErr);
  {
    const op = await situacaoDaOp(opId1);
    check("OP volta a 'bloqueada' (medida mudou e não está mais confirmada)", op.situacao === "bloqueada", op);
  }

  console.log("\n4. Pedido com 2 itens — bloqueio é avaliado pro pedido inteiro, não só pro item medido");
  const pedido2 = await prepararPedidoComMedicaoObrigatoria(admTenant, "2", 2);
  const { data: op2a } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedido2.pedidoItens[0].id });
  const { data: op2b } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedido2.pedidoItens[1].id });
  check("as 2 OPs do pedido nascem bloqueadas", (await situacaoDaOp(op2a)).situacao === "bloqueada" && (await situacaoDaOp(op2b)).situacao === "bloqueada");

  const { data: itemProd2a } = await admTenant.client.rpc("criar_item_producao", { p_pedido_item_id: pedido2.pedidoItens[0].id });
  await admTenant.client.rpc("registrar_medicao", { p_id: itemProd2a, p_ambiente: "Cozinha", p_largura_mm: 800, p_altura_mm: 2000 });
  await admTenant.client.rpc("confirmar_medicao", { p_id: itemProd2a });
  {
    const opa = await situacaoDaOp(op2a);
    const opb = await situacaoDaOp(op2b);
    check(
      "confirmar só o 1º item NÃO libera nenhuma OP (o 2º item do pedido ainda não tem medição)",
      opa.situacao === "bloqueada" && opb.situacao === "bloqueada",
      { opa, opb },
    );
  }

  const { data: itemProd2b } = await admTenant.client.rpc("criar_item_producao", { p_pedido_item_id: pedido2.pedidoItens[1].id });
  await admTenant.client.rpc("registrar_medicao", { p_id: itemProd2b, p_ambiente: "Quarto", p_largura_mm: 900, p_altura_mm: 2000 });
  await admTenant.client.rpc("confirmar_medicao", { p_id: itemProd2b });
  {
    const opa = await situacaoDaOp(op2a);
    const opb = await situacaoDaOp(op2b);
    check(
      "confirmar o 2º item libera AS DUAS OPs do pedido (reavalia o pedido inteiro, não só o item medido)",
      opa.situacao === "liberada" && opb.situacao === "liberada",
      { opa, opb },
    );
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
