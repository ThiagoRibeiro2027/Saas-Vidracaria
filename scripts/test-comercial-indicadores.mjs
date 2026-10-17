// Melhorias 17/10/2026, item 6: motivo de rejeição + indicadores da Visão geral de Comercial.
// Uso: set -a; source .env.local; set +a; node scripts/test-comercial-indicadores.mjs

import "./lib/somente-local.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

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

async function createTenant(slug, name, identifier) {
  const { data: company } = await admin.from("companies").upsert({ slug, name }, { onConflict: "slug" }).select().single();
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
  const { data: role } = await admin.from("roles").select("id").is("company_id", null).eq("key", "ADMIN").single();
  const { data: existing } = await admin
    .from("user_roles").select("id").eq("profile_id", userId).eq("role_id", role.id).is("valid_until", null).maybeSingle();
  if (!existing) await admin.from("user_roles").insert({ profile_id: userId, role_id: role.id });
  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });
  return { client, company, userId };
}

async function criarOrcamento(t, itemId, sufixo, preco, qtd = 1) {
  const { data: pessoaId } = await t.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CPF", p_documento: `5556667770${sufixo}`, p_nome: `Cliente Ind ${sufixo}`,
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await t.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });
  const { data: orcId, error } = await t.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: null, p_validade: null,
    p_condicao_comercial: null, p_observacoes: null,
  });
  if (error) console.error("[fixture] upsert_orcamento:", error);
  const { error: eItem } = await t.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcId, p_item_id: itemId, p_quantidade: qtd, p_preco_unitario: preco,
  });
  if (eItem) console.error("[fixture] upsert_orcamento_item:", eItem);
  return orcId;
}

async function main() {
  const a = await createTenant("ind-com-a", "Indicadores A", "ic01");
  const b = await createTenant("ind-com-b", "Indicadores B", "ic02");

  await a.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: "ORCI-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  const { data: itemId } = await a.client.rpc("upsert_item", {
    p_id: null, p_codigo: "IND-01", p_descricao: "Item indicadores", p_tipo: "produto_acabado",
    p_classificacao: null, p_unidade_principal: "UN", p_situacao: "ativo",
  });

  console.log("1. Sem orçamentos");
  {
    const { data, error } = await a.client.rpc("comercial_indicadores_orcamentos");
    check("indicadores zerados", !error && data.valor_orcado === 0 && data.taxa_conversao === null && data.motivos.length === 0, { data, error });
  }

  const aprovado = await criarOrcamento(a, itemId, "1", 100, 2); // 200
  const rejeitado1 = await criarOrcamento(a, itemId, "2", 50); // 50
  const rejeitado2 = await criarOrcamento(a, itemId, "3", 70); // 70
  const aberto = await criarOrcamento(a, itemId, "4", 30); // 30
  const cancelado = await criarOrcamento(a, itemId, "5", 999);

  console.log("\n2. Motivo de rejeição");
  {
    const { error: eSem } = await a.client.rpc("decidir_orcamento", { p_id: rejeitado1, p_decisao: "rejeitado" });
    check("rejeitar sem motivo é recusado", !!eSem && /motivo/i.test(eSem.message), eSem);
    const { error: eInv } = await a.client.rpc("decidir_orcamento", { p_id: rejeitado1, p_decisao: "rejeitado", p_motivo_rejeicao: "inventado" });
    check("motivo fora da lista é recusado", !!eInv, eInv);
    const { error: eApr } = await a.client.rpc("decidir_orcamento", { p_id: aprovado, p_decisao: "aprovado", p_motivo_rejeicao: "preco" });
    check("aprovar com motivo de rejeição é recusado", !!eApr, eApr);

    const { error: e1 } = await a.client.rpc("decidir_orcamento", { p_id: aprovado, p_decisao: "aprovado" });
    check("aprovar sem motivo funciona", !e1, e1);
    const { error: e2 } = await a.client.rpc("decidir_orcamento", { p_id: rejeitado1, p_decisao: "rejeitado", p_motivo_rejeicao: "preco" });
    const { error: e3 } = await a.client.rpc("decidir_orcamento", { p_id: rejeitado2, p_decisao: "rejeitado", p_motivo_rejeicao: "preco" });
    check("rejeitar com motivo funciona", !e2 && !e3, { e2, e3 });
    await a.client.rpc("cancelar_orcamento", { p_id: cancelado });
  }

  console.log("\n3. Indicadores");
  {
    const { data, error } = await a.client.rpc("comercial_indicadores_orcamentos");
    check("sem erro", !error, error);
    check("valor orçado soma tudo menos cancelado (200+50+70+30)", Number(data.valor_orcado) === 350, data);
    check("valor em aberto = só rascunhos (30)", Number(data.valor_em_aberto) === 30, data);
    check("1 aprovado e 2 rejeitados", data.aprovados === 1 && data.rejeitados === 2, data);
    check("taxa de conversão 1/3 = 33,3%", Number(data.taxa_conversao) === 33.3, data);
    check("motivo 'preco' contado 2x", data.motivos.length === 1 && data.motivos[0].motivo === "preco" && data.motivos[0].quantidade === 2, data);
  }

  console.log("\n4. Isolamento entre empresas");
  {
    const { data } = await b.client.rpc("comercial_indicadores_orcamentos");
    check("empresa B não enxerga valores da A", Number(data.valor_orcado) === 0 && data.aprovados === 0, data);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
