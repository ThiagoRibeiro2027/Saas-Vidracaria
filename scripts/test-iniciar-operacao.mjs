// Melhorias 17/10/2026, item 10: iniciar_operacao_lote() — início da operação pelo operador.
// Uso: set -a; source .env.local; set +a; node scripts/test-iniciar-operacao.mjs

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
  const adm = await createTenant("iniciar-op-a", "Iniciar Operação A", "io01", "ADMIN");
  const outro = await createTenant("iniciar-op-b", "Iniciar Operação B", "io02", "ADMIN");
  await adm.client.rpc("upsert_numbering_sequence", {
    p_document_type: "ordem_producao", p_prefixo: "OPI-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });

  const { data: itemId } = await adm.client.rpc("upsert_item", {
    p_id: null, p_codigo: "PARAF-INI-01", p_descricao: "Parafuso (teste iniciar)",
    p_tipo: "material_auxiliar", p_classificacao: "ferragem", p_unidade_principal: "UN", p_situacao: "ativo",
  });
  const pedidoItemId = await prepararPedidoLiberado(adm, "7", itemId);
  const { data: opId, error: eOp } = await adm.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedidoItemId });
  check("fixture: OP criada", !eOp && !!opId, eOp);

  const { data: ops } = await admin.from("op_lote_operacoes").select("id, status, iniciada_em, iniciada_por").eq("ordem_producao_id", opId);
  const operacaoId = ops?.[0]?.id;
  check("fixture: OP tem operação em 'planejada'", ops?.length >= 1 && ops[0].status === "planejada" && ops[0].iniciada_em === null, ops);

  console.log("1. Iniciar operação");
  {
    const { error } = await adm.client.rpc("iniciar_operacao_lote", { p_op_lote_operacao_id: operacaoId });
    check("iniciar funciona", !error, error);
    const { data: o } = await admin.from("op_lote_operacoes").select("status, iniciada_em, iniciada_por").eq("id", operacaoId).single();
    check("status em_andamento, hora e operador gravados", o.status === "em_andamento" && !!o.iniciada_em && o.iniciada_por === adm.userId, o);
    const { data: op } = await admin.from("ordens_producao").select("status").eq("id", opId).single();
    check("OP passa a em_producao", op.status === "em_producao", op);
    const { data: logs } = await admin.from("activity_logs").select("id").eq("action", "producao.operacao_iniciada").eq("entity_id", opId);
    check("auditoria registrada", logs?.length === 1, logs);

    const { error: eDeNovo } = await adm.client.rpc("iniciar_operacao_lote", { p_op_lote_operacao_id: operacaoId });
    check("iniciar de novo é recusado", !!eDeNovo, eDeNovo);
  }

  console.log("\n2. Finalizar = apontar_producao existente (grava fim)");
  {
    const { data: op } = await admin.from("ordens_producao").select("quantidade_planejada").eq("id", opId).single();
    const { error } = await adm.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: operacaoId, p_quantidade_produzida: op.quantidade_planejada,
      p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    check("apontar a quantidade total funciona", !error, error);
    const { data: o } = await admin.from("op_lote_operacoes").select("status, iniciada_em, concluida_em").eq("id", operacaoId).single();
    check("operação concluída com hora de fim >= início", o.status === "concluida" && new Date(o.concluida_em) >= new Date(o.iniciada_em), o);
    const { error: eConcl } = await adm.client.rpc("iniciar_operacao_lote", { p_op_lote_operacao_id: operacaoId });
    check("não inicia operação já concluída", !!eConcl, eConcl);
  }

  console.log("\n3. Isolamento entre empresas");
  {
    const { error } = await outro.client.rpc("iniciar_operacao_lote", { p_op_lote_operacao_id: operacaoId });
    check("empresa B não inicia operação da empresa A", !!error, error);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
