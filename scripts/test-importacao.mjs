// Testes automatizados do TÓPICO 2 §28 / ADR-002 §4.2.1 — importação
// inicial de dados. Terceiro gap encontrado (junto de T14 e ADR-007) na
// varredura de fechamento de M1-M3: nenhum código existia apesar do
// ADR-002 colocar isso como parte ativa do MVP. Recorte: só CSV (parsing
// fica no Server Action, fora deste teste — aqui testamos direto a
// função SQL, que recebe jsonb já parseado), só Pessoas e Itens,
// reaproveitando upsert_pessoa()/upsert_item() e audit_changed_fields()
// que já existiam.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-importacao.mjs

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

async function main() {
  console.log("Preparando tenants (admin, sem-permissão, outro tenant)...");
  const admTenant = await createTenant("import-test-admin", "Import Admin Teste", "16a01", "ADMIN");
  const noPermTenant = await createTenant("import-test-noperm", "Import SemPerm Teste", "16a02", "COMERCIAL");
  const otherTenant = await createTenant("import-test-other", "Import Outro Teste", "16a03", "ADMIN");

  console.log("\n1. importar_pessoas() — permissão, novo, dry-run não persiste");
  {
    const linhas = [{ tipo_documento: "CNPJ", documento: "11.222.333/0001-{{seq}}".replace("{{seq}}", "44"), nome: "Cliente Importado 1" }];

    const { error: semPermError } = await noPermTenant.client.rpc("importar_pessoas", { p_linhas: linhas, p_dry_run: true });
    check("sem pessoas.manage não executa (nem em dry-run)", !!semPermError);

    const { data: preview, error: previewError } = await admTenant.client.rpc("importar_pessoas", { p_linhas: linhas, p_dry_run: true });
    check("dry-run executa sem erro", !previewError);
    check("linha nova é classificada como 'novo'", preview?.[0]?.status === "novo");

    const { data: naoExiste } = await admin.from("pessoas").select("id").eq("company_id", admTenant.company.id).eq("documento", "11222333000144");
    check("dry-run NÃO grava nada no banco", (naoExiste ?? []).length === 0);

    const { data: commit, error: commitError } = await admTenant.client.rpc("importar_pessoas", { p_linhas: linhas, p_dry_run: false });
    check("confirmação (dry_run=false) executa sem erro", !commitError);
    check("confirmação também classifica como 'novo'", commit?.[0]?.status === "novo");

    const { data: existe } = await admin.from("pessoas").select("id, nome").eq("company_id", admTenant.company.id).eq("documento", "11222333000144").maybeSingle();
    check("confirmação grava a pessoa de verdade", existe?.nome === "Cliente Importado 1");

    const { data: log } = await admin
      .from("activity_logs")
      .select("*")
      .eq("company_id", admTenant.company.id)
      .eq("action", "cadastros.pessoas_importadas")
      .maybeSingle();
    check("cadastros.pessoas_importadas registrado em activity_logs", !!log);
  }

  console.log("\n2. importar_pessoas() — atualização (mesmo documento, dado novo)");
  {
    const linhas = [{ tipo_documento: "CNPJ", documento: "11.222.333/0001-44", nome: "Cliente Importado 1 Renomeado", email: "novo@teste.com" }];
    const { data: preview } = await admTenant.client.rpc("importar_pessoas", { p_linhas: linhas, p_dry_run: true });
    check("linha existente é classificada como 'atualizacao'", preview?.[0]?.status === "atualizacao");
    check("campos_alterados aponta nome e email", preview?.[0]?.campos_alterados?.includes("nome") && preview?.[0]?.campos_alterados?.includes("email"));

    await admTenant.client.rpc("importar_pessoas", { p_linhas: linhas, p_dry_run: false });
    const { data: atualizada, count } = await admin
      .from("pessoas")
      .select("nome, email", { count: "exact" })
      .eq("company_id", admTenant.company.id)
      .eq("documento", "11222333000144");
    check(
      "confirmação atualiza o registro existente, sem duplicar (1 linha só)",
      count === 1 && atualizada?.[0]?.nome === "Cliente Importado 1 Renomeado" && atualizada?.[0]?.email === "novo@teste.com",
    );
  }

  console.log("\n3. importar_pessoas() — inválido não derruba o lote; duplicado no arquivo");
  {
    const linhas = [
      { tipo_documento: "CNPJ", documento: "22.333.444/0001-55", nome: "" }, // inválido: sem nome
      { tipo_documento: "CNPJ", documento: "33.444.555/0001-66", nome: "Cliente Válido do Lote" }, // válido
      { tipo_documento: "CNPJ", documento: "33.444.555/0001-66", nome: "Repetido no arquivo" }, // duplicado no arquivo
    ];
    const { data: preview, error } = await admTenant.client.rpc("importar_pessoas", { p_linhas: linhas, p_dry_run: true });
    check("lote com linha inválida executa sem erro (não aborta)", !error);
    check("linha sem nome é 'invalido' com erro preenchido", preview?.[0]?.status === "invalido" && !!preview?.[0]?.erro);
    check("segunda linha (válida) continua sendo 'novo'", preview?.[1]?.status === "novo");
    check("terceira linha (documento repetido) é 'duplicado_no_arquivo'", preview?.[2]?.status === "duplicado_no_arquivo");

    await admTenant.client.rpc("importar_pessoas", { p_linhas: linhas, p_dry_run: false });
    const { data: gravouValida } = await admin.from("pessoas").select("id").eq("company_id", admTenant.company.id).eq("documento", "33444555000166").maybeSingle();
    check("na confirmação, a linha válida é gravada mesmo com outras linhas inválidas no lote", !!gravouValida);
    const { data: naoGravouInvalida } = await admin.from("pessoas").select("id").eq("company_id", admTenant.company.id).eq("documento", "22333444000155").maybeSingle();
    check("na confirmação, a linha inválida NUNCA é gravada silenciosamente", !naoGravouInvalida);
  }

  console.log("\n4. Isolamento cross-tenant");
  {
    const { data: outroTenantVe } = await otherTenant.client.from("pessoas").select("id").eq("documento", "11222333000144");
    check("tenant B não enxerga pessoa importada pelo tenant A", (outroTenantVe ?? []).length === 0);
  }

  console.log("\n5. importar_itens() — permissão, novo, atualização, inválido, dry-run");
  {
    const { error: semPermError } = await noPermTenant.client.rpc("importar_itens", {
      p_linhas: [{ codigo: "VD-IMP-01", descricao: "Vidro importado", tipo: "materia_prima", unidade_principal: "M2" }],
      p_dry_run: true,
    });
    check("sem itens.manage não executa", !!semPermError);

    const linhaNova = [{ codigo: "VD-IMP-01", descricao: "Vidro temperado importado", tipo: "materia_prima", classificacao: "vidro_temperado", unidade_principal: "M2" }];
    const { data: preview } = await admTenant.client.rpc("importar_itens", { p_linhas: linhaNova, p_dry_run: true });
    check("item novo classificado como 'novo'", preview?.[0]?.status === "novo");

    const { data: naoExiste } = await admin.from("itens").select("id").eq("company_id", admTenant.company.id).eq("codigo", "VD-IMP-01");
    check("dry-run de itens também não persiste", (naoExiste ?? []).length === 0);

    await admTenant.client.rpc("importar_itens", { p_linhas: linhaNova, p_dry_run: false });
    const { data: existe } = await admin.from("itens").select("descricao").eq("company_id", admTenant.company.id).eq("codigo", "VD-IMP-01").single();
    check("item gravado de verdade na confirmação", existe?.descricao === "Vidro temperado importado");

    const linhaInvalida = [{ codigo: "VD-IMP-02", descricao: "Item com tipo ruim", tipo: "tipo_que_nao_existe", unidade_principal: "UN" }];
    const { data: previewInvalido } = await admTenant.client.rpc("importar_itens", { p_linhas: linhaInvalida, p_dry_run: true });
    check("tipo inválido é rejeitado com status 'invalido'", previewInvalido?.[0]?.status === "invalido");

    const linhaAtualizacao = [{ codigo: "VD-IMP-01", descricao: "Vidro temperado importado — revisado", tipo: "materia_prima", classificacao: "vidro_temperado", unidade_principal: "M2" }];
    const { data: previewAtualizacao } = await admTenant.client.rpc("importar_itens", { p_linhas: linhaAtualizacao, p_dry_run: true });
    check("reimportar mesmo código é classificado como 'atualizacao'", previewAtualizacao?.[0]?.status === "atualizacao");
    check("campos_alterados aponta descricao", previewAtualizacao?.[0]?.campos_alterados?.includes("descricao"));
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
