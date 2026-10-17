// Trava de negócio aprovada em conversa com o usuário (17/10/2026, migration
// 20261017192902): criar_ordem_producao() deixava criar (e produzir/concluir
// integralmente) uma OP sem NUNCA ter existido engenharia liberada pro item
// do pedido — mesmo quando o item é uma peça fabricada (achado do teste de
// ponta a ponta em homologação). Agora, só item que É peça (existe em
// public.pecas) exige engenharia liberada; item simples continua sem
// mudança nenhuma de comportamento.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-trava-engenharia-op.mjs

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

async function prepararPedidoLiberado(tenant, sufixo, itemId) {
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: `ORCT${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido", p_prefixo: `PEDT${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "ordem_producao", p_prefixo: `OPT${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });

  const { data: pessoaId } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CPF", p_documento: `4445556660${sufixo}`, p_nome: `Cliente Trava ${sufixo}`,
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  const { data: orcamentoId, error: eOrc } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: null, p_validade: null,
    p_condicao_comercial: null, p_observacoes: null,
  });
  if (eOrc) console.error("[fixture] upsert_orcamento falhou:", eOrc);
  const { error: eItem } = await tenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: 1, p_preco_unitario: 100,
  });
  if (eItem) console.error("[fixture] upsert_orcamento_item falhou:", eItem);
  const { error: eDecidir } = await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });
  if (eDecidir) console.error("[fixture] decidir_orcamento falhou:", eDecidir);

  const { data: pedidoId, error: eConv } = await tenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  if (eConv) console.error("[fixture] converter_orcamento_em_pedido falhou:", eConv);
  const { error: eConf } = await tenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
  if (eConf) console.error("[fixture] iniciar_conferencia_pedido falhou:", eConf);
  const { error: eLib } = await tenant.client.rpc("liberar_pedido", { p_id: pedidoId });
  if (eLib) console.error("[fixture] liberar_pedido falhou:", eLib);

  const { data: pedidoItem, error: ePi } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).eq("item_id", itemId).single();
  if (ePi) console.error("[fixture] buscar pedido_itens falhou:", ePi);
  return pedidoItem.id;
}

async function main() {
  console.log("Preparando tenant, item-peça e item simples...");
  const admTenant = await createTenant("trava-engenharia-admin", "Trava Engenharia Admin Teste", "tre01", "ADMIN");

  const { data: itemPecaId, error: eItemPeca } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "JAN-TRAVA-01", p_descricao: "Janela configurável (teste trava)",
    p_tipo: "produto_acabado", p_classificacao: "esquadria", p_unidade_principal: "UN", p_situacao: "ativo",
  });
  if (eItemPeca) console.error("[fixture] upsert_item (peça) falhou:", eItemPeca);
  const { data: pecaId, error: pecaErr } = await admTenant.client.rpc("criar_peca", {
    p_item_id: itemPecaId, p_descricao_tecnica: "peça de teste pra trava de engenharia",
  });
  check("fixture: item-peça criado", !pecaErr && !!pecaId, pecaErr);

  const { data: itemSimplesId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "PARAF-TRAVA-01", p_descricao: "Parafuso (teste trava)",
    p_tipo: "material_auxiliar", p_classificacao: "ferragem", p_unidade_principal: "UN", p_situacao: "ativo",
  });

  console.log("\n1. Item-peça SEM engenharia liberada — criar_ordem_producao() deve recusar");
  const pedidoItemPecaId = await prepararPedidoLiberado(admTenant, "1", itemPecaId);
  {
    const { data, error } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedidoItemPecaId });
    check("OP não é criada pra item-peça sem engenharia liberada", !data && !!error, error);
    check("mensagem de erro explica o motivo", /engenharia liberada/i.test(error?.message ?? ""), error?.message);
  }

  console.log("\n2. Item simples (não-peça) SEM engenharia liberada — continua funcionando normal");
  const pedidoItemSimplesId = await prepararPedidoLiberado(admTenant, "2", itemSimplesId);
  {
    const { data: opId, error } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedidoItemSimplesId });
    check("OP é criada normalmente pra item simples, sem exigir engenharia", !error && !!opId, error);
  }

  console.log("\n3. Item-peça COM engenharia liberada — agora cria a OP normalmente");
  {
    const { error: eLiberar } = await admTenant.client.rpc("liberar_engenharia", {
      p_pedido_item_id: pedidoItemPecaId, p_observacoes: null,
    });
    check("engenharia liberada pro item-peça sem erro", !eLiberar, eLiberar);

    const { data: opId, error } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedidoItemPecaId });
    check("OP é criada normalmente depois da engenharia liberada", !error && !!opId, error);

    const { data: op } = await admin.from("ordens_producao").select("engenharia_versao_id").eq("id", opId).single();
    check("OP guarda o vínculo com a versão de engenharia liberada", !!op?.engenharia_versao_id);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
