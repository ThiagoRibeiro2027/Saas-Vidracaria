// Melhorias 17/10/2026, item 5: variante de cor = item com item_pai_id + cor.
// Uso: set -a; source .env.local; set +a; node scripts/test-cor-variante-item.mjs

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

function novoItem(t, codigo, extra = {}) {
  return t.client.rpc("upsert_item", {
    p_id: null, p_codigo: codigo, p_descricao: `Item ${codigo}`, p_tipo: "materia_prima",
    p_classificacao: "perfil", p_unidade_principal: "UN", p_situacao: "ativo",
    p_percentual_quebra: null, ...extra,
  });
}

async function main() {
  const a = await createTenant("cor-var-a", "Cor Variante A", "cv01");
  const b = await createTenant("cor-var-b", "Cor Variante B", "cv02");

  console.log("1. Criar item-base e variantes");
  const { data: baseId, error: eBase } = await novoItem(a, "PERF-QUAD");
  check("item-base criado", !eBase && !!baseId, eBase);

  const { data: brancoId, error: eBranco } = await novoItem(a, "PERF-QUAD-BRANCO", { p_item_pai_id: baseId, p_cor: "Branco" });
  check("variante Branco criada", !eBranco && !!brancoId, eBranco);
  const { data: v } = await admin.from("itens").select("item_pai_id, cor").eq("id", brancoId).single();
  check("variante guarda item_pai_id e cor", v?.item_pai_id === baseId && v?.cor === "Branco", v);

  const { data: pretoId, error: ePreto } = await novoItem(a, "PERF-QUAD-PRETO", { p_item_pai_id: baseId, p_cor: "Preto fosco" });
  check("segunda variante (outra cor) criada", !ePreto && !!pretoId, ePreto);

  console.log("\n2. Regras");
  const { error: eDup } = await novoItem(a, "PERF-QUAD-BRANCO2", { p_item_pai_id: baseId, p_cor: " branco " });
  check("mesma cor (case/espaços) no mesmo item-base é recusada", !!eDup, eDup);

  const { error: eSemCor } = await novoItem(a, "PERF-QUAD-SEMCOR", { p_item_pai_id: baseId });
  check("variante sem cor é recusada", !!eSemCor && /cor/i.test(eSemCor.message), eSemCor);

  const { error: eCadeia } = await novoItem(a, "PERF-QUAD-BRANCO-X", { p_item_pai_id: brancoId, p_cor: "X" });
  check("variante de variante é recusada", !!eCadeia && /variante/i.test(eCadeia.message), eCadeia);

  const { error: eSi } = await a.client.rpc("upsert_item", {
    p_id: baseId, p_codigo: "PERF-QUAD", p_descricao: "x", p_tipo: "materia_prima", p_classificacao: null,
    p_unidade_principal: "UN", p_situacao: "ativo", p_percentual_quebra: null, p_item_pai_id: baseId, p_cor: "Y",
  });
  check("item não pode ser variante de si mesmo", !!eSi, eSi);

  const { error: ePaiVira } = await a.client.rpc("upsert_item", {
    p_id: baseId, p_codigo: "PERF-QUAD", p_descricao: "x", p_tipo: "materia_prima", p_classificacao: null,
    p_unidade_principal: "UN", p_situacao: "ativo", p_percentual_quebra: null, p_item_pai_id: pretoId, p_cor: "Z",
  });
  check("item-base com variantes não pode virar variante", !!ePaiVira, ePaiVira);

  console.log("\n3. Isolamento entre empresas");
  const { error: eOutra } = await novoItem(b, "B-VAR", { p_item_pai_id: baseId, p_cor: "Azul" });
  check("empresa B não consegue usar item-base da empresa A", !!eOutra, eOutra);

  console.log("\n4. Importação (item_pai_codigo + cor)");
  const linhas = [
    { codigo: "IMP-BASE", descricao: "Base importada", tipo: "materia_prima", unidade_principal: "UN" },
    { codigo: "IMP-BASE-VERDE", descricao: "Verde", tipo: "materia_prima", unidade_principal: "UN", item_pai_codigo: "IMP-BASE", cor: "Verde" },
    { codigo: "IMP-ORFA", descricao: "Órfã", tipo: "materia_prima", unidade_principal: "UN", item_pai_codigo: "NAO-EXISTE", cor: "Rosa" },
  ];
  const { data: res, error: eImp } = await a.client.rpc("importar_itens", { p_linhas: linhas, p_dry_run: false, p_arquivo_nome: "t.csv" });
  check("importação roda", !eImp, eImp);
  const st = Object.fromEntries((res ?? []).map((r) => [r.codigo, r.status]));
  check("base importada como novo", st["IMP-BASE"] === "novo", st);
  check("variante na mesma carga resolve o item-base", st["IMP-BASE-VERDE"] === "novo", res);
  check("variante com item-base inexistente é inválida", st["IMP-ORFA"] === "invalido", res);

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
