// Fase 7 — Security Testing (Prompt Mestre item 47).
//
// As fases anteriores já testam, por módulo, RLS/multi-tenant/auditoria/
// storage/backup/MFA (ver os outros scripts test-*.mjs). Este script cobre
// as duas lacunas que sobravam do checklist da Fase 7 e que nenhum teste
// anterior exercitava:
//
//   1. Autenticação — um cliente SEM NENHUMA sessão (nem login, só a anon
//      key) não pode ler nenhuma tabela de negócio nem chamar nenhuma RPC
//      sensível. Os testes anteriores sempre autenticam como algum tenant;
//      nenhum deles tenta o caso "ninguém logado".
//   2. Permissões — has_permission() é a função central que trava
//      register_file/delete_file/leitura de files/leitura de activity_logs/
//      export (Prompt Mestre item 15). Todos os testes anteriores só usam
//      o papel ADMIN (que tem todas as permissões do catálogo atual). Este
//      script cria um usuário com um papel SEM NENHUMA permissão atribuída
//      (COMERCIAL, já semeado mas ainda sem regras de negócio definidas em
//      ADR — Prompt Mestre item "não implementar regra de negócio que não
//      esteja definida nos ADRs") e confirma que has_permission() nega
//      corretamente em cada ponto de checagem.
//
// "APIs" (Server Actions) e "exclusão em massa" (itens também listados na
// Fase 7) não geram testes automatizados aqui pelo mesmo motivo já
// documentado nos scripts anteriores: Server Actions do Next.js só
// encaminham para estas mesmas RPCs (não duplicam lógica de autorização) e
// não existe hoje nenhum endpoint de exclusão em lote no código — ver
// relatório impresso ao final.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-security-phase7.mjs

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

async function createTenant(slug, name, identifier, roleKey) {
  const { data: company, error: companyError } = await admin
    .from("companies")
    .upsert({ slug, name }, { onConflict: "slug" })
    .select()
    .single();
  if (companyError) throw companyError;

  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }
  if (!userId) throw userError ?? new Error("usuário não criado");

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
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { client, company, userId };
}

async function main() {
  console.log("1. Autenticação — cliente totalmente não autenticado (sem login, só anon key)");
  {
    const anon = createClient(url, anonKey);

    const { data: companies } = await anon.from("companies").select("id");
    check("não autenticado não lê nenhuma company", (companies ?? []).length === 0);

    const { data: profiles } = await anon.from("profiles").select("id");
    check("não autenticado não lê nenhum profile", (profiles ?? []).length === 0);

    const { data: logs } = await anon.from("activity_logs").select("id");
    check("não autenticado não lê nenhum activity_log", (logs ?? []).length === 0);

    const { data: files } = await anon.from("files").select("id");
    check("não autenticado não lê nenhum file", (files ?? []).length === 0);

    const { data: subs } = await anon.from("subscriptions").select("id");
    check("não autenticado não lê nenhuma subscription", (subs ?? []).length === 0);

    const { error: logErr } = await anon.rpc("log_activity", {
      p_action: "hack",
      p_entity_type: "x",
      p_entity_id: null,
      p_description: null,
      p_metadata: null,
    });
    check("não autenticado não consegue chamar log_activity()", !!logErr);

    const { error: regErr } = await anon.rpc("register_file", {
      p_entity_type: "geral",
      p_entity_id: null,
      p_storage_path: "x/y.png",
      p_original_name: "y.png",
      p_mime_type: "image/png",
      p_size_bytes: 10,
    });
    check("não autenticado não consegue chamar register_file()", !!regErr);

    const { data: transData, error: transErr } = await anon.rpc("transition_subscription", {
      p_company_id: "00000000-0000-0000-0000-000000000000",
      p_new_status: "suspended",
    });
    check(
      "não autenticado não consegue chamar transition_subscription()",
      !!transErr || transData === false || transData === null,
    );

    // Security Gate Fase 8 (SEC-006): antes, has_permission() era executável
    // por qualquer role via o grant implícito de PUBLIC do Postgres e só
    // retornava false; agora nenhuma função do schema public é executável
    // sem grant explícito, e anon nunca recebeu grant nenhum — a chamada
    // deve ser negada na própria checagem de EXECUTE, antes do corpo rodar.
    const { data: hasPermAnon, error: hasPermAnonErr } = await anon.rpc("has_permission", {
      p_resource: "files",
      p_action: "read",
    });
    check(
      "has_permission() é negada por falta de EXECUTE para não autenticado (anon)",
      !!hasPermAnonErr && hasPermAnon == null,
    );
  }

  console.log("\n2. Permissões — papel sem nenhuma permissão atribuída (COMERCIAL)");
  {
    const admin_ok = await createTenant("jrbox-p7", "JR Box Fase 7", "9101", "ADMIN");
    const noPerms = await createTenant("jrbox-p7", "JR Box Fase 7", "9102", "COMERCIAL");
    // mesmo tenant (mesma company) propositalmente: queremos isolar a
    // variável "permissão do papel", não repetir o teste de isolamento
    // entre empresas já coberto em test-foundation-rls.mjs.

    const { data: baseAccess } = await noPerms.client.from("companies").select("id");
    check(
      "usuário sem permissões ainda enxerga a própria empresa (acesso de tenant, não de permissão)",
      baseAccess?.length === 1,
    );

    const { data: canReadFiles } = await noPerms.client.rpc("has_permission", {
      p_resource: "files",
      p_action: "read",
    });
    check("has_permission('files','read') nega para papel sem permissões", canReadFiles === false);

    const { data: filesRows } = await noPerms.client.from("files").select("id");
    check("SELECT em files retorna vazio para papel sem permissão de leitura", (filesRows ?? []).length === 0);

    const { error: uploadErr } = await noPerms.client.rpc("register_file", {
      p_entity_type: "geral",
      p_entity_id: null,
      p_storage_path: `${admin_ok.company.id}/geral/teste-p7.png`,
      p_original_name: "teste-p7.png",
      p_mime_type: "image/png",
      p_size_bytes: 10,
    });
    check("register_file() nega para papel sem permissão de upload", !!uploadErr);

    const { data: logsRows } = await noPerms.client.from("activity_logs").select("id");
    check(
      "SELECT em activity_logs retorna vazio para papel sem permissão de leitura",
      (logsRows ?? []).length === 0,
    );

    const { data: canExport } = await noPerms.client.rpc("has_permission", {
      p_resource: "export",
      p_action: "company_data",
    });
    check("has_permission('export','company_data') nega para papel sem permissões", canExport === false);

    // controle: o mesmo has_permission() deve conceder para o ADMIN da
    // mesma empresa, confirmando que a negação acima é do papel, não de
    // algum bug que negasse geral.
    const { data: adminCanExport } = await admin_ok.client.rpc("has_permission", {
      p_resource: "export",
      p_action: "company_data",
    });
    check("(controle) ADMIN da mesma empresa mantém a permissão de exportação", adminCanExport === true);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);

  console.log("\n=== Itens da Fase 7 cobertos por revisão de código (não automatizáveis aqui) ===");
  console.log(
    "- APIs (Server Actions): revisadas src/app/**/actions.ts — todas encaminham para as mesmas RPCs\n" +
      "  testadas acima e nos scripts das fases 2-6, sem client admin (service role) exceto o\n" +
      "  bootstrap síncrono de login em src/app/login/actions.ts. Nenhuma duplica checagem de\n" +
      "  autorização em JS — a autorização real vive no banco (defesa em profundidade).",
  );
  console.log(
    "- Secrets: SUPABASE_SERVICE_ROLE_KEY só é referenciada em src/lib/supabase/admin.ts, que\n" +
      "  importa 'server-only'; .env* está no .gitignore e nenhum .env foi commitado (git ls-files).",
  );
  console.log(
    "- Exclusão em massa: não existe hoje nenhuma operação de exclusão em lote no código (só\n" +
      "  delete_file(p_file_id) por id único, com soft delete). Item 46 do Prompt Mestre\n" +
      "  ('Proteção contra exclusão em massa') fica sem teste por não ter superfície ainda —\n" +
      "  revisitar quando um módulo introduzir exclusão por filtro/lote.",
  );

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
