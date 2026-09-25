// Testes automatizados da Fila de Produção — Fase B do plano de
// 23/09/2026 (fila por pedido de cliente, peças fabricadas reutilizáveis
// e necessidades automáticas de suprimentos). Cobre só
// listar_fila_producao(): nenhuma tabela/coluna/permissão nova, reaproveita
// producao.view já testada em test-producao.mjs. Foco aqui é o agrupamento
// por pedido/cliente/obra, ordenação por prioridade, filtros e isolamento
// cross-tenant — não repete os testes de OP/lote/roteiro já cobertos lá.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-fila-producao.mjs

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

async function prepararPedidoComOp(tenant, sufixo, { pessoaNome, obraNome }) {
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: `ORCF${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido", p_prefixo: `PEDF${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "ordem_producao", p_prefixo: `OPF${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });

  const { data: pessoaId, error: pessoaErr } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CPF", p_documento: `1112223330${sufixo}`, p_nome: pessoaNome,
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  if (pessoaErr) console.error("[fixture] upsert_pessoa falhou:", pessoaErr);
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  const { data: obraId, error: obraErr } = await tenant.client.rpc("upsert_obra", {
    p_id: null, p_pessoa_id: pessoaId, p_nome: obraNome,
    p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  if (obraErr) console.error("[fixture] upsert_obra falhou:", obraErr);

  const { data: itemId, error: itemErr } = await tenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: `JAN-F${sufixo}`, p_descricao: "Janela modelo teste",
    p_tipo: "produto_acabado", p_classificacao: "esquadria", p_unidade_principal: "UN",
    p_situacao: "ativo",
  });
  if (itemErr) console.error("[fixture] upsert_item falhou:", itemErr);

  const { data: orcamentoId, error: orcErr } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: obraId, p_validade: null,
    p_condicao_comercial: null, p_observacoes: null,
  });
  if (orcErr) console.error("[fixture] upsert_orcamento falhou:", orcErr);
  const { error: orcItemErr } = await tenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: 5, p_preco_unitario: 500,
  });
  if (orcItemErr) console.error("[fixture] upsert_orcamento_item falhou:", orcItemErr);
  const { error: decidirErr } = await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });
  if (decidirErr) console.error("[fixture] decidir_orcamento falhou:", decidirErr);

  const { data: pedidoId, error: convErr } = await tenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  if (convErr) console.error("[fixture] converter_orcamento_em_pedido falhou:", convErr);
  const { error: confErr } = await tenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
  if (confErr) console.error("[fixture] iniciar_conferencia_pedido falhou:", confErr);
  const { error: libErr } = await tenant.client.rpc("liberar_pedido", { p_id: pedidoId });
  if (libErr) console.error("[fixture] liberar_pedido falhou:", libErr);

  const { data: pedidoItem } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).single();

  const { data: opId, error: opErr } = await tenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedidoItem.id });
  if (opErr) console.error("[fixture] criar_ordem_producao falhou:", opErr);

  return { pessoaId, obraId, pedidoId, opId };
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão de produção, outro tenant)...");
  const admTenant = await createTenant("fila-producao-test-admin", "Fila Produção Admin Teste", "flp01", "ADMIN");
  // QUALIDADE não administra Produção — prova a autoridade separada (mesmo padrão de test-suprimentos.mjs).
  const noPermTenant = await createTenant("fila-producao-test-admin", "Fila Produção SemPerm Teste", "flp02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant("fila-producao-test-other", "Fila Produção Outro Teste", "flp03", "ADMIN");

  console.log("\n0. Massa de dados — dois pedidos de clientes/obras diferentes, cada um com uma OP");
  const pedido1 = await prepararPedidoComOp(admTenant, "1", { pessoaNome: "Cliente Um Fila", obraNome: "Obra Um Fila" });
  const pedido2 = await prepararPedidoComOp(admTenant, "2", { pessoaNome: "Cliente Dois Fila", obraNome: "Obra Dois Fila" });
  check("OP 1 criada", !!pedido1.opId);
  check("OP 2 criada", !!pedido2.opId);

  // OP 2 vira mais urgente (prioridade 1) — deve ordenar antes da OP 1 (default 3).
  await admTenant.client.rpc("definir_prioridade_op", { p_ordem_producao_id: pedido2.opId, p_prioridade: 1 });

  console.log("\n1. listar_fila_producao() sem filtro — deny sem producao.view");
  {
    const { error } = await noPermTenant.client.rpc("listar_fila_producao", {
      p_pessoa_id: null, p_obra_id: null, p_status_op: null,
    });
    check("sem producao.view (papel QUALIDADE) não consulta a fila", !!error);
  }

  console.log("\n2. listar_fila_producao() sem filtro — traz as 2 OPs, ordenadas por prioridade");
  {
    const { data, error } = await admTenant.client.rpc("listar_fila_producao", {
      p_pessoa_id: null, p_obra_id: null, p_status_op: null,
    });
    check("ADMIN consulta a fila sem erro", !error);
    check("traz as 2 OPs cadastradas", (data ?? []).length === 2);
    check("OP de prioridade 1 (pedido 2) vem antes da de prioridade 3 (pedido 1)", data?.[0]?.ordem_producao_id === pedido2.opId && data?.[1]?.ordem_producao_id === pedido1.opId);
    check("linha traz nome do cliente e da obra", data?.[0]?.pessoa_nome === "Cliente Dois Fila" && data?.[0]?.obra_nome === "Obra Dois Fila");
    check("lote da OP recém-criada aparece como 1 total / 0 concluído", data?.[0]?.lotes_total === 1 && data?.[0]?.lotes_concluidos === 0);
  }

  console.log("\n3. Filtro por cliente (pessoa_id)");
  {
    const { data } = await admTenant.client.rpc("listar_fila_producao", {
      p_pessoa_id: pedido1.pessoaId, p_obra_id: null, p_status_op: null,
    });
    check("filtro por pessoa traz só a OP daquele cliente", (data ?? []).length === 1 && data[0].ordem_producao_id === pedido1.opId);
  }

  console.log("\n4. Filtro por obra");
  {
    const { data } = await admTenant.client.rpc("listar_fila_producao", {
      p_pessoa_id: null, p_obra_id: pedido2.obraId, p_status_op: null,
    });
    check("filtro por obra traz só a OP daquela obra", (data ?? []).length === 1 && data[0].ordem_producao_id === pedido2.opId);
  }

  console.log("\n5. Filtro por status");
  {
    const { data: planejadas } = await admTenant.client.rpc("listar_fila_producao", {
      p_pessoa_id: null, p_obra_id: null, p_status_op: "planejada",
    });
    check("as 2 OPs ainda estão 'planejada'", (planejadas ?? []).length === 2);

    const { data: concluidas } = await admTenant.client.rpc("listar_fila_producao", {
      p_pessoa_id: null, p_obra_id: null, p_status_op: "concluida",
    });
    check("nenhuma OP concluída ainda", (concluidas ?? []).length === 0);
  }

  console.log("\n6. Isolamento entre tenants");
  {
    const { data, error } = await otherTenant.client.rpc("listar_fila_producao", {
      p_pessoa_id: null, p_obra_id: null, p_status_op: null,
    });
    check("tenant B (ADMIN) não enxerga nenhuma OP do tenant A", !error && (data ?? []).length === 0);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
