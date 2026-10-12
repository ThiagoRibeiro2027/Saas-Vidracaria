// Auditoria TR Systems 12/10/2026 — achado 4: EXECUTE aberto a PUBLIC/anon.
// Migration: 20261012175409_fecha_execute_public_anon.sql.
//
// CLAUDE.md regra 7: "PUBLIC/anon nunca recebem EXECUTE por padrão em função
// nova do schema public — grant de authenticated é explícito por função".
// O Postgres concede EXECUTE a PUBLIC em toda função nova, e o reset de
// 20260914090000 não fechou esse default (só o de `in schema public`), então
// toda função criada depois de 14/09 nasceu aberta a `anon`. Este script
// prova o contrato em quatro camadas:
//
//   1. Catálogo (pg_proc/pg_default_acl): ninguém em `public` é executável por
//      anon/PUBLIC; as internas e os triggers não são executáveis por
//      authenticated; função com p_company_id do cliente só passa se estiver
//      na lista de exceções justificadas.
//   2. Default: uma função NOVA nasce sem EXECUTE para anon/authenticated
//      (criada e descartada numa transação que sempre aborta).
//   3. Não quebrou o app: toda RPC chamada por literal em src/ com o client de
//      usuário (`supabase.rpc("x")`) continua executável por authenticated.
//   4. Data API de verdade: anon e usuário comum recebem "permission denied"
//      nas funções que o PoC da auditoria explorava, e uma função legítima
//      continua respondendo ao usuário autenticado.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-execute-grants-varredura.mjs
// (no `npm test` as variáveis vêm do `supabase status`).

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// Mesma convenção dos outros testes que usam psql (test-rls-performance.mjs):
// no macOS o psql do Homebrew (libpq) não está no PATH por padrão.
const PATH_WITH_LIBPQ = `/opt/homebrew/opt/libpq/bin:${process.env.PATH ?? ""}`;

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

function psql(sql, { allowError = false } = {}) {
  try {
    return execFileSync("psql", [DATABASE_URL, "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: PATH_WITH_LIBPQ },
    }).trim();
  } catch (err) {
    if (allowError) return `${err.stderr ?? ""}${err.stdout ?? ""}`;
    throw err;
  }
}
const json = (sql) => JSON.parse(psql(sql));

// Funções só chamadas por outras funções SECURITY DEFINER. Mesma lista da
// migration — se uma delas voltar a ser executável por authenticated, falha.
const INTERNAS = [
  "criar_op_lote_operacoes",
  "calcular_necessidade_liquida_item",
  "submeter_aprovacao_compra",
  "submeter_aprovacao_financeiro",
  "gerar_bom_sugerida_a_partir_da_conversao",
  "liberar_reserva_interna",
  "recalcular_agregados_producao",
  "recalcular_situacao_ordem_producao",
  "snapshot_revisao_peca",
  "notificar_usuarios_com_permissao",
  "avaliar_regras_automacao",
  "avaliar_condicao",
  "audit_changed_fields",
  "extrair_campo_payload",
  "peca_contem_peca",
  "montar_rastreabilidade_pedido_item",
];

// Funções com p_company_id/p_tenant_id que authenticated PODE executar.
// Receber o id do tenant do cliente viola a regra 1 do CLAUDE.md, a menos que
// o corpo valide contra current_company_id()/platform_admin MFA.
const COMPANY_ID_EXCECOES = {
  company_usage: "valida p_company_id contra a empresa do chamador; platform_admin só com MFA",
  transition_company_status: "gate is_platform_admin_mfa_verified() (test-governance seção 2.5)",
  transition_subscription: "gate is_platform_admin_mfa_verified() (test-governance seção 2)",
  // Achado 5 (20261012181332): usuário comum só registra na PRÓPRIA empresa
  // (current_company_id()); service_role e platform_admin MFA informam a
  // empresa. Comportamento provado em test-governance.mjs, seção 6.
  log_system_event: "valida p_company_id contra a empresa do usuário; só service_role/platform_admin MFA escolhem",
};

// RPCs que o app chama pelo client de usuário mas que NÃO são executáveis por
// authenticated de propósito: nenhuma hoje.
const APP_RPC_SO_SERVICE = new Set([]);

// --- helpers de ambiente --------------------------------------------------

function* arquivosSrc(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    const st = statSync(p);
    if (st.isDirectory()) yield* arquivosSrc(p);
    else if (/\.(ts|tsx)$/.test(nome)) yield p;
  }
}

function rpcsDoApp() {
  const nomes = new Set();
  const re = /\bsupabase\.rpc\(\s*["'`]([a-z_0-9]+)["'`]/g;
  for (const arq of arquivosSrc("src")) {
    const txt = readFileSync(arq, "utf8");
    let m;
    while ((m = re.exec(txt))) nomes.add(m[1]);
  }
  return [...nomes].sort();
}

async function main() {
  console.log("1. Catálogo — nada em public aberto a anon/PUBLIC");
  const abertas = json(`
    select coalesce(json_agg(p.proname order by p.proname), '[]') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
  check("nenhuma função de public é executável por anon", abertas.length === 0);
  if (abertas.length) console.error(`    Abertas a anon (${abertas.length}): ${abertas.slice(0, 15).join(", ")}${abertas.length > 15 ? ", …" : ""}`);

  const comPublic = json(`
    select coalesce(json_agg(distinct p.proname), '[]') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
         lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'EXECUTE'`);
  check("nenhuma função de public tem grant explícito ou default para PUBLIC", comPublic.length === 0);

  console.log("\n2. Catálogo — internas e triggers não são chamáveis por usuário");
  const internasAbertas = json(`
    select coalesce(json_agg(p.oid::regprocedure::text), '[]') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[${INTERNAS.map((n) => `'${n}'`).join(",")}])
      and has_function_privilege('authenticated', p.oid, 'execute')`);
  check("nenhuma função interna é executável por authenticated", internasAbertas.length === 0);
  if (internasAbertas.length) console.error(`    ${internasAbertas.join(", ")}`);

  const internasExistem = json(`
    select count(distinct proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[${INTERNAS.map((n) => `'${n}'`).join(",")}])`);
  check("toda interna listada ainda existe (lista não apodreceu)", Number(internasExistem) === INTERNAS.length);

  const triggersAbertos = json(`
    select coalesce(json_agg(p.proname order by p.proname), '[]') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'execute')`);
  check("nenhuma função de trigger é executável por authenticated", triggersAbertos.length === 0);

  const service = psql(`
    select count(*) filter (where has_function_privilege('service_role', p.oid, 'execute')) = count(*)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'`);
  check("service_role continua executando todas (crons, Admin API, sistema_*)", service === "t");

  console.log("\n3. Catálogo — p_company_id vindo do cliente (CLAUDE.md regra 1)");
  const comCompanyId = json(`
    select coalesce(json_agg(distinct p.proname order by p.proname), '[]') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and pg_get_function_arguments(p.oid) ~* 'p_company_id|p_tenant_id'
      and has_function_privilege('authenticated', p.oid, 'execute')`);
  const semJustificativa = comCompanyId.filter((n) => !(n in COMPANY_ID_EXCECOES));
  check("função executável por authenticated com p_company_id está na lista de exceções justificadas", semJustificativa.length === 0);
  if (semJustificativa.length) console.error(`    Sem justificativa: ${semJustificativa.join(", ")}`);
  const excecoesObsoletas = Object.keys(COMPANY_ID_EXCECOES).filter((n) => !comCompanyId.includes(n));
  check("toda exceção de p_company_id continua valendo (senão remover da lista)", excecoesObsoletas.length === 0);
  if (excecoesObsoletas.length) console.error(`    Remover da lista: ${excecoesObsoletas.join(", ")}`);

  console.log("\n4. Default — função NOVA não nasce executável");
  // A transação sempre aborta (raise exception no fim): a função de teste
  // nunca fica no banco, e o resultado volta na mensagem.
  const saida = psql(
    `do $$ declare v_anon boolean; v_auth boolean; begin
       create function public._probe_default_execute() returns int language sql as 'select 1';
       v_anon := has_function_privilege('anon', 'public._probe_default_execute()', 'execute');
       v_auth := has_function_privilege('authenticated', 'public._probe_default_execute()', 'execute');
       raise exception 'PROBE anon=% authenticated=%', v_anon, v_auth;
     end $$`,
    { allowError: true },
  );
  // `raise ... %` imprime boolean como t/f.
  check("função criada agora não é executável por anon", /PROBE anon=f\b/.test(saida));
  check("função criada agora não é executável por authenticated (grant explícito, regra 7)", /authenticated=f\b/.test(saida));
  const sobrou = psql(`select count(*) from pg_proc where proname = '_probe_default_execute'`);
  check("a função de teste não ficou no banco", sobrou === "0");

  console.log("\n5. Não quebrou o app — toda RPC literal de src/ segue executável pelo usuário");
  const rpcs = rpcsDoApp();
  check(`o levantamento achou as RPCs do app (${rpcs.length} nomes)`, rpcs.length >= 250);
  const lista = rpcs.map((n) => `'${n}'`).join(",");
  const existentes = json(`
    select coalesce(json_agg(distinct p.proname), '[]') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[${lista}])`);
  const inexistentes = rpcs.filter((n) => !existentes.includes(n));
  check("toda RPC chamada pelo app existe no banco", inexistentes.length === 0);
  if (inexistentes.length) console.error(`    Inexistentes: ${inexistentes.join(", ")}`);
  const semAcesso = json(`
    select coalesce(json_agg(distinct p.proname order by p.proname), '[]') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[${lista}])
      and not has_function_privilege('authenticated', p.oid, 'execute')`).filter((n) => !APP_RPC_SO_SERVICE.has(n));
  check("toda RPC chamada pelo app é executável por authenticated", semAcesso.length === 0);
  if (semAcesso.length) console.error(`    O app chama e o usuário não pode: ${semAcesso.join(", ")}`);

  console.log("\n6. Data API — o PoC da auditoria não funciona mais");
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const negado = (e) => !!e && (e.code === "42501" || e.code === "PGRST202" || /permission denied/i.test(e.message ?? ""));

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: alvo } = await admin.from("companies").select("id").limit(1).single();

  // Marca única por execução: o banco pode ter resíduo de runs anteriores
  // (inclusive de runs feitos ANTES da correção, que gravavam de verdade).
  const marca = `PoC anon (test-execute-grants-varredura) ${Date.now()}: não deveria gravar`;
  const { data: forjado, error: eForjar } = await anon.rpc("log_system_event", {
    p_category: "integration_failure",
    p_message: marca,
    p_severity: "warning",
    p_company_id: alvo.id,
    p_correlation_id: null,
    p_context: {},
  });
  check("anon não consegue forjar system_event em outra empresa (PoC original)", negado(eForjar) && !forjado);
  const { count: gravadas } = await admin
    .from("system_events")
    .select("id", { count: "exact", head: true })
    .eq("message", marca);
  check("nenhuma linha forjada chegou a system_events", (gravadas ?? 0) === 0);

  const { error: eAprov } = await anon.rpc("submeter_aprovacao_financeiro", {
    p_company_id: alvo.id,
    p_processo: "pagamento",
    p_entidade_id: "00000000-0000-0000-0000-000000000000",
    p_valor: 1,
  });
  check("anon não chama submeter_aprovacao_financeiro com company_id arbitrário", negado(eAprov));

  const { error: eLote } = await anon.rpc("criar_op_lote_operacoes", {
    p_company_id: alvo.id,
    p_ordem_producao_id: "00000000-0000-0000-0000-000000000000",
    p_item_id: "00000000-0000-0000-0000-000000000000",
    p_op_lote_id: "00000000-0000-0000-0000-000000000000",
    p_quantidade: 1,
  });
  check("anon não chama criar_op_lote_operacoes com company_id arbitrário", negado(eLote));

  // Usuário autenticado comum: as internas continuam fechadas e uma função
  // legítima continua funcionando (a migration preservou o acesso).
  const slug = `grants-test-${Date.now()}`;
  const { data: company } = await admin.from("companies").upsert({ slug, name: "Grants Test" }, { onConflict: "slug" }).select().single();
  const email = `grants.${slug}@users.internal`;
  const password = "senha-de-teste-123456";
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = created.user.id;
  await admin.from("profiles").upsert({ id: userId, company_id: company.id, login_identifier: "grants1", display_name: "Grants" }, { onConflict: "id" });
  const { data: role } = await admin.from("roles").select("id").is("company_id", null).eq("key", "ADMIN").single();
  await admin.from("user_roles").insert({ profile_id: userId, role_id: role.id });
  const user = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eLogin } = await user.auth.signInWithPassword({ email, password });
  check("usuário de teste autenticou", !eLogin);

  const { error: eInterna } = await user.rpc("submeter_aprovacao_compra", {
    p_company_id: company.id,
    p_processo: "compra",
    p_entidade_id: "00000000-0000-0000-0000-000000000000",
    p_valor: 1,
  });
  check("authenticated (ADMIN) não chama submeter_aprovacao_compra direto", negado(eInterna));

  const { data: temPerm, error: ePerm } = await user.rpc("has_permission", { p_resource: "files", p_action: "read" });
  check("função legítima segue funcionando para authenticated (has_permission)", !ePerm && temPerm === true);

  // limpeza do tenant de teste
  await admin.from("user_roles").delete().eq("profile_id", userId);
  await admin.auth.admin.deleteUser(userId);

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
