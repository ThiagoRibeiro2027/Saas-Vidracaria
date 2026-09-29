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

// Tenant por execução, mesmo padrão adotado em 28/09/2026 nos outros 12
// harnesses. Este aqui tinha ficado de fora por parecer idempotente — as
// funções de importação são upsert —, mas as ASSERÇÕES não são: "linha
// nova é 'novo'" e "dry-run NÃO grava nada" só valem em tenant zerado, e
// numa segunda execução voltavam 'atualizacao' e "já existe". Eram 10 ✗
// que não representavam bug nenhum no produto. O custo é acumular um
// tenant `import-test-*-<sufixo>` por rodada; a limpeza é combinada com o
// responsável, nunca automática.
const RUN = Date.now().toString(36);

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
  const admTenant = await createTenant(`import-test-admin-${RUN}`, "Import Admin Teste", "16a01", "ADMIN");
  const noPermTenant = await createTenant(`import-test-noperm-${RUN}`, "Import SemPerm Teste", "16a02", "COMERCIAL");
  const otherTenant = await createTenant(`import-test-other-${RUN}`, "Import Outro Teste", "16a03", "ADMIN");

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

  console.log("\n6. Histórico e reprocessamento (TÓPICO 13 §29, Fase 7)");
  {
    const linhas = [
      { tipo_documento: "CNPJ", documento: "44.555.666/0001-77", nome: "Histórico Válido" },
      { tipo_documento: "CNPJ", documento: "55.666.777/0001-88", nome: "" }, // inválido: sem nome
    ];

    const { data: antes } = await admin.from("importacoes").select("id").eq("company_id", admTenant.company.id);
    await admTenant.client.rpc("importar_pessoas", { p_linhas: linhas, p_dry_run: true });
    const { data: depoisPreview } = await admin.from("importacoes").select("id").eq("company_id", admTenant.company.id);
    check("prévia NÃO registra no histórico", (depoisPreview ?? []).length === (antes ?? []).length);

    await admTenant.client.rpc("importar_pessoas", {
      p_linhas: linhas,
      p_dry_run: false,
      p_arquivo_nome: "clientes-teste.csv",
    });
    const { data: registro } = await admin
      .from("importacoes")
      .select("*")
      .eq("company_id", admTenant.company.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    check("confirmação registra no histórico", !!registro);
    check("histórico guarda o nome do arquivo", registro?.arquivo_nome === "clientes-teste.csv");
    check(
      "contadores do histórico batem com o lote",
      registro?.total_linhas === 2 && registro?.novos === 1 && registro?.invalidos === 1,
    );
    check(
      "linhas_com_erro guarda só a linha que falhou (payload original)",
      Array.isArray(registro?.linhas_com_erro) &&
        registro.linhas_com_erro.length === 1 &&
        registro.linhas_com_erro[0]?.documento === "55.666.777/0001-88",
    );
    check("criado_por é o usuário que importou", registro?.criado_por === admTenant.userId);

    const { error: semPermErro } = await noPermTenant.client.rpc("obter_linhas_com_erro", {
      p_importacao_id: registro.id,
    });
    check("sem pessoas.manage não obtém as linhas com erro", !!semPermErro);

    const { data: outroVeHistorico } = await otherTenant.client
      .from("importacoes")
      .select("id")
      .eq("id", registro.id);
    check("tenant B não enxerga o histórico de importação do tenant A", (outroVeHistorico ?? []).length === 0);

    const { error: outroErroLinhas } = await otherTenant.client.rpc("obter_linhas_com_erro", {
      p_importacao_id: registro.id,
    });
    check("tenant B não obtém as linhas com erro do tenant A", !!outroErroLinhas);

    const { data: comErro } = await admTenant.client.rpc("obter_linhas_com_erro", {
      p_importacao_id: registro.id,
    });
    check("obter_linhas_com_erro devolve o payload original para reprocessar", comErro?.length === 1);

    const corrigidas = (comErro ?? []).map((l) => ({ ...l, nome: "Corrigido no Reprocessamento" }));
    const { data: repro, error: reproErro } = await admTenant.client.rpc("importar_pessoas", {
      p_linhas: corrigidas,
      p_dry_run: false,
      p_arquivo_nome: "clientes-teste.csv (reprocessamento)",
      p_origem_importacao_id: registro.id,
    });
    check("reprocessamento executa sem erro", !reproErro);
    check("linha corrigida entra como 'novo'", repro?.[0]?.status === "novo");

    const { data: registroRepro } = await admin
      .from("importacoes")
      .select("id")
      .eq("company_id", admTenant.company.id)
      .eq("origem_importacao_id", registro.id)
      .maybeSingle();
    check("reprocessamento fica ligado à importação de origem", !!registroRepro);

    // otherTenant é ADMIN (tem pessoas.manage), então a recusa abaixo vem
    // da checagem de origem, não da permissão — é o ponto do teste.
    const { error: origemAlheia } = await otherTenant.client.rpc("importar_pessoas", {
      p_linhas: [{ tipo_documento: "CNPJ", documento: "66.777.888/0001-99", nome: "Origem Alheia" }],
      p_dry_run: true,
      p_origem_importacao_id: registro.id,
    });
    check("origem de importação de outra empresa é rejeitada", !!origemAlheia);
  }

  console.log("\n7. importar_obras() e o mapa de entidades (TÓPICO 13 §29, Fase 8a)");
  {
    // Obras é a primeira entidade do padrão genérico: prova que acrescentar
    // um importador não exige caso especial no histórico nem na permissão.
    const DOC_CLIENTE = "99888777000166";
    const NOME_OBRA = "Obra do Harness";

    // A seção precisa começar limpa para "novo" ser determinístico na
    // segunda execução — o resto do arquivo é idempotente por upsert, esta
    // parte é idempotente por limpeza.
    const { data: pessoaExistente } = await admin
      .from("pessoas").select("id").eq("company_id", admTenant.company.id).eq("documento", DOC_CLIENTE).maybeSingle();
    if (pessoaExistente) {
      await admin.from("obras").delete().eq("company_id", admTenant.company.id).eq("pessoa_id", pessoaExistente.id);
    }

    const { data: pessoaId } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: pessoaExistente?.id ?? null, p_tipo_documento: "CNPJ", p_documento: DOC_CLIENTE,
      p_nome: "Cliente do Harness", p_nome_fantasia: null, p_telefone: null, p_email: null,
      p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

    const linhas = [
      { documento_cliente: DOC_CLIENTE, nome: NOME_OBRA, cidade: "Blumenau", uf: "SC" },
      { documento_cliente: DOC_CLIENTE, nome: NOME_OBRA, cidade: "Repetida" }, // duplicada no arquivo
      { documento_cliente: "00000000000191", nome: "Cliente inexistente" },     // cliente não existe
      { documento_cliente: DOC_CLIENTE, nome: "" },                             // sem nome
    ];

    const { error: semPermErro } = await noPermTenant.client.rpc("importar_obras", { p_linhas: linhas, p_dry_run: true });
    check("sem obras.manage não importa obras", !!semPermErro);

    const { data: previa, error: previaErro } = await admTenant.client.rpc("importar_obras", { p_linhas: linhas, p_dry_run: true });
    check("prévia de obras executa sem erro", !previaErro);
    check("obra nova é 'novo'", previa?.[0]?.status === "novo");
    check("mesma obra repetida no arquivo é 'duplicado_no_arquivo'", previa?.[1]?.status === "duplicado_no_arquivo");
    check(
      "cliente inexistente é recusado apontando a aba de Pessoas",
      previa?.[2]?.status === "invalido" && /Importe a aba de Pessoas/.test(previa?.[2]?.erro ?? ""),
    );
    check("obra sem nome é recusada", previa?.[3]?.status === "invalido");

    const { data: naoGravou } = await admin
      .from("obras").select("id").eq("company_id", admTenant.company.id).eq("nome", NOME_OBRA);
    check("prévia de obras NÃO grava nada", (naoGravou ?? []).length === 0);

    await admTenant.client.rpc("importar_obras", { p_linhas: linhas, p_dry_run: false, p_arquivo_nome: "obras.xlsx" });
    const { data: gravada } = await admin
      .from("obras").select("cidade, uf").eq("company_id", admTenant.company.id).eq("nome", NOME_OBRA).maybeSingle();
    check("obra válida é gravada com o endereço", gravada?.cidade === "Blumenau" && gravada?.uf === "SC");

    const { data: hist } = await admin
      .from("importacoes").select("*").eq("company_id", admTenant.company.id).eq("entidade", "obras")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    check("histórico aceita a entidade 'obras'", !!hist);
    check(
      "contadores do histórico de obras batem",
      hist?.total_linhas === 4 && hist?.novos === 1 && hist?.invalidos === 2 && hist?.duplicados === 1,
    );

    const { data: reimport } = await admTenant.client.rpc("importar_obras", {
      p_linhas: [{ documento_cliente: DOC_CLIENTE, nome: NOME_OBRA, cidade: "Timbó" }], p_dry_run: true,
    });
    check("reimportar a mesma obra é 'atualizacao', não duplicata", reimport?.[0]?.status === "atualizacao");
    check("campos_alterados aponta cidade", (reimport?.[0]?.campos_alterados ?? []).includes("cidade"));

    const { data: comErro, error: comErroErr } = await admTenant.client.rpc("obter_linhas_com_erro", {
      p_importacao_id: hist.id,
    });
    check("obter_linhas_com_erro atende obras pelo mapa novo", !comErroErr && comErro?.length === 3);

    const { data: outroVe } = await otherTenant.client.from("importacoes").select("id").eq("id", hist.id);
    check("tenant B não enxerga o histórico de obras do tenant A", (outroVe ?? []).length === 0);

    // O mapa entidade -> recurso é a fonte única da permissão: se ele
    // devolver null para uma entidade, o CHECK do histórico a rejeita.
    const { data: recursoObras } = await admin.rpc("recurso_permissao_importacao", { p_entidade: "obras" });
    check("mapa de permissão: obras -> obras", recursoObras === "obras");
    const { data: recursoInvalido } = await admin.rpc("recurso_permissao_importacao", { p_entidade: "nao_existe" });
    check("mapa de permissão: entidade desconhecida -> null", recursoInvalido === null);
  }

  console.log("\n8. Papéis da pessoa e controle dimensional (Fase 8b)");
  {
    const DOC = "97531000000135";
    const { data: pessoaId } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: "CNPJ", p_documento: DOC, p_nome: "Pessoa da Fase 8b",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
      p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });

    const linhasPapel = [
      { documento_pessoa: DOC, papel: "CLIENTE" },
      { documento_pessoa: DOC, papel: "fornecedor" }, // minúsculo é normalizado
      { documento_pessoa: DOC, papel: "CLIENTE" }, // repetido no arquivo
      { documento_pessoa: "00000000000191", papel: "CLIENTE" }, // pessoa não existe
      { documento_pessoa: DOC, papel: "SOCIO" }, // papel fora do domínio
    ];

    const { error: semPermPapel } = await noPermTenant.client.rpc("importar_pessoa_papeis", {
      p_linhas: linhasPapel, p_dry_run: true,
    });
    check("sem pessoas.manage não importa papéis", !!semPermPapel);

    const { data: prevPapel } = await admTenant.client.rpc("importar_pessoa_papeis", {
      p_linhas: linhasPapel, p_dry_run: true,
    });
    check("papel novo é 'novo'", prevPapel?.[0]?.status === "novo");
    check(
      "papel em minúsculo é normalizado para maiúsculo",
      prevPapel?.[1]?.status === "novo" && prevPapel?.[1]?.papel === "FORNECEDOR",
    );
    check("mesma pessoa+papel repetida é 'duplicado_no_arquivo'", prevPapel?.[2]?.status === "duplicado_no_arquivo");
    check("pessoa inexistente aponta a aba de Pessoas", prevPapel?.[3]?.status === "invalido");
    check("papel fora de CLIENTE/FORNECEDOR é recusado", prevPapel?.[4]?.status === "invalido");

    const { data: papeisAntes } = await admin.from("pessoa_papeis").select("papel").eq("pessoa_id", pessoaId);
    check("prévia de papéis NÃO grava", (papeisAntes ?? []).length === 0);

    await admTenant.client.rpc("importar_pessoa_papeis", { p_linhas: linhasPapel, p_dry_run: false });
    const { data: papeisDepois } = await admin.from("pessoa_papeis").select("papel").eq("pessoa_id", pessoaId);
    check("os dois papéis válidos são gravados", (papeisDepois ?? []).length === 2);

    const { data: papelDeNovo } = await admTenant.client.rpc("importar_pessoa_papeis", {
      p_linhas: [{ documento_pessoa: DOC, papel: "CLIENTE" }], p_dry_run: true,
    });
    check("reimportar o mesmo papel é 'atualizacao'", papelDeNovo?.[0]?.status === "atualizacao");

    // ---- controle dimensional ----
    const COD = "PRF-IMP-8B";
    await admTenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: COD, p_descricao: "Perfil da Fase 8b", p_tipo: "materia_prima",
      p_classificacao: null, p_unidade_principal: "M", p_situacao: "ativo",
    });

    const linhasDim = [
      { codigo_item: COD, dimensao_tipo: "linear", peso_por_unidade_dimensao: "1.85" },
      { codigo_item: COD, dimensao_tipo: "area" }, // repetido no arquivo
      { codigo_item: "NAO-EXISTE-8B", dimensao_tipo: "linear" }, // item não existe
    ];

    const { error: semPermDim } = await noPermTenant.client.rpc("importar_itens_dimensional", {
      p_linhas: linhasDim, p_dry_run: true,
    });
    check("sem itens.manage não importa controle dimensional", !!semPermDim);

    const { data: prevDim } = await admTenant.client.rpc("importar_itens_dimensional", {
      p_linhas: linhasDim, p_dry_run: true,
    });
    check("item sem controle dimensional é 'novo'", prevDim?.[0]?.status === "novo");
    check("código repetido é 'duplicado_no_arquivo'", prevDim?.[1]?.status === "duplicado_no_arquivo");
    check("item inexistente aponta a aba de Itens", prevDim?.[2]?.status === "invalido");

    const { data: itemAntes } = await admin
      .from("itens").select("dimensao_tipo").eq("company_id", admTenant.company.id).eq("codigo", COD).single();
    check("prévia dimensional NÃO grava", itemAntes.dimensao_tipo === null);

    await admTenant.client.rpc("importar_itens_dimensional", {
      p_linhas: [{ codigo_item: COD, dimensao_tipo: "linear", peso_por_unidade_dimensao: "1.85" }], p_dry_run: false,
    });
    const { data: itemDepois } = await admin
      .from("itens").select("dimensao_tipo, peso_por_unidade_dimensao")
      .eq("company_id", admTenant.company.id).eq("codigo", COD).single();
    check(
      "controle dimensional gravado com o peso",
      itemDepois.dimensao_tipo === "linear" && Number(itemDepois.peso_por_unidade_dimensao) === 1.85,
    );

    const { data: dimDeNovo } = await admTenant.client.rpc("importar_itens_dimensional", {
      p_linhas: [{ codigo_item: COD, dimensao_tipo: "area", peso_por_unidade_dimensao: "6" }], p_dry_run: true,
    });
    check("item que já tinha controle é 'atualizacao'", dimDeNovo?.[0]?.status === "atualizacao");

    const { data: tipoRuim } = await admTenant.client.rpc("importar_itens_dimensional", {
      p_linhas: [{ codigo_item: COD, dimensao_tipo: "cubica" }], p_dry_run: true,
    });
    check("tipo de dimensão inválido é recusado pela função do banco", tipoRuim?.[0]?.status === "invalido");
  }

  console.log("\n9. Engenharia: peças, composição, características e regras (Fase 8c)");
  {
    const COD_PECA = "PEC-IMP-8C";
    const COD_MAT = "MAT-IMP-8C";
    const COD_EXTRA = "REF-IMP-8C";
    for (const [codigo, descricao, tipo, unidade] of [
      [COD_PECA, "Peça da Fase 8c", "produto_acabado", "UN"],
      [COD_MAT, "Material da Fase 8c", "materia_prima", "M"],
      [COD_EXTRA, "Reforço da Fase 8c", "materia_prima", "M"],
    ]) {
      await admTenant.client.rpc("upsert_item", {
        p_id: null, p_codigo: codigo, p_descricao: descricao, p_tipo: tipo,
        p_classificacao: null, p_unidade_principal: unidade, p_situacao: "ativo",
      });
    }

    // ---- peças ----
    const { error: semPermPeca } = await noPermTenant.client.rpc("importar_pecas", {
      p_linhas: [{ codigo_item: COD_PECA }], p_dry_run: true,
    });
    check("sem pecas.manage não importa peças", !!semPermPeca);

    const { data: prevPeca } = await admTenant.client.rpc("importar_pecas", {
      p_linhas: [{ codigo_item: COD_PECA, descricao_tecnica: "Técnica A" }, { codigo_item: COD_PECA }, { codigo_item: "NAO-EXISTE-8C" }],
      p_dry_run: true,
    });
    check("peça nova é 'novo'", prevPeca?.[0]?.status === "novo");
    check("código de peça repetido é 'duplicado_no_arquivo'", prevPeca?.[1]?.status === "duplicado_no_arquivo");
    check("item inexistente aponta a aba de Itens", prevPeca?.[2]?.status === "invalido");

    await admTenant.client.rpc("importar_pecas", {
      p_linhas: [{ codigo_item: COD_PECA, descricao_tecnica: "Técnica A" }], p_dry_run: false,
    });
    const { data: pecaDeNovo } = await admTenant.client.rpc("importar_pecas", {
      p_linhas: [{ codigo_item: COD_PECA, descricao_tecnica: "OUTRA" }], p_dry_run: true,
    });
    check(
      "descrição técnica diferente é recusada, não ignorada em silêncio",
      pecaDeNovo?.[0]?.status === "invalido" && /não é alterável/.test(pecaDeNovo?.[0]?.erro ?? ""),
    );

    // ---- composição ----
    const linhaComp = {
      codigo_peca: COD_PECA, codigo_material: COD_MAT,
      quantidade_por_unidade: "2.5", tipo_calculo: "linear", percentual_perda: "5",
    };
    const { data: prevComp } = await admTenant.client.rpc("importar_peca_composicao", {
      p_linhas: [linhaComp], p_dry_run: true,
    });
    check("composição nova é 'novo'", prevComp?.[0]?.status === "novo");

    await admTenant.client.rpc("importar_peca_composicao", { p_linhas: [linhaComp], p_dry_run: false });
    const { data: itemMat } = await admin
      .from("itens").select("id").eq("company_id", admTenant.company.id).eq("codigo", COD_MAT).single();
    const { data: comp } = await admin
      .from("peca_composicao").select("quantidade_por_unidade, tipo_calculo, percentual_perda")
      .eq("company_id", admTenant.company.id).eq("material_item_id", itemMat.id).maybeSingle();
    check(
      "composição grava quantidade, tipo de cálculo e perda",
      Number(comp?.quantidade_por_unidade) === 2.5 && comp?.tipo_calculo === "linear" && Number(comp?.percentual_perda) === 5,
    );

    // ---- características ----
    const { data: prevCar } = await admTenant.client.rpc("importar_peca_caracteristicas", {
      p_linhas: [
        { codigo_peca: COD_PECA, nome: "largura", tipo: "numero", unidade: "mm", papel_dimensional: "largura" },
        { codigo_peca: COD_PECA, nome: "vidro", tipo: "opcao", opcoes: "temperado, laminado" },
        { codigo_peca: COD_PECA, nome: "vidro", tipo: "opcao", opcoes: "x" },
      ],
      p_dry_run: true,
    });
    check("característica nova é 'novo'", prevCar?.[0]?.status === "novo");
    check("nome de característica repetido é 'duplicado_no_arquivo'", prevCar?.[2]?.status === "duplicado_no_arquivo");

    await admTenant.client.rpc("importar_peca_caracteristicas", {
      p_linhas: [
        { codigo_peca: COD_PECA, nome: "largura", tipo: "numero", unidade: "mm", papel_dimensional: "largura" },
        { codigo_peca: COD_PECA, nome: "vidro", tipo: "opcao", opcoes: "temperado, laminado" },
      ],
      p_dry_run: false,
    });
    const { data: itemPeca } = await admin
      .from("itens").select("id").eq("company_id", admTenant.company.id).eq("codigo", COD_PECA).single();
    const { data: pecaRow } = await admin
      .from("pecas").select("id").eq("company_id", admTenant.company.id).eq("item_id", itemPeca.id).single();
    const { data: caracteristicas } = await admin
      .from("peca_caracteristicas").select("nome, opcoes, papel_dimensional").eq("peca_id", pecaRow.id);
    check("as duas características são gravadas", (caracteristicas ?? []).length === 2);
    check(
      "lista de opções separada por vírgula vira array",
      (caracteristicas ?? []).find((c) => c.nome === "vidro")?.opcoes?.length === 2,
    );
    check(
      "papel dimensional é aplicado",
      (caracteristicas ?? []).find((c) => c.nome === "largura")?.papel_dimensional === "largura",
    );

    const { data: tipoTrocado } = await admTenant.client.rpc("importar_peca_caracteristicas", {
      p_linhas: [{ codigo_peca: COD_PECA, nome: "largura", tipo: "texto" }], p_dry_run: true,
    });
    check("trocar o tipo de uma característica existente é recusado", tipoTrocado?.[0]?.status === "invalido");

    // ---- regras ----
    // adicionar_material exige material FORA da composição base; ajustar_quantidade,
    // um que esteja nela. As duas formas são exercitadas de propósito.
    const regraAdd = {
      codigo_peca: COD_PECA, nome_caracteristica: "largura", operador: ">",
      valor_comparacao_numero: "2000", acao: "adicionar_material",
      codigo_material_acao: COD_EXTRA, acao_quantidade: "1", motivo: "reforço",
    };
    const regraAjuste = {
      codigo_peca: COD_PECA, nome_caracteristica: "largura", operador: ">=",
      valor_comparacao_numero: "3000", acao: "ajustar_quantidade",
      codigo_material_acao: COD_MAT, acao_quantidade: "3",
    };

    const { data: prevRegra } = await admTenant.client.rpc("importar_peca_regras", {
      p_linhas: [regraAdd, regraAjuste, { ...regraAdd }, { ...regraAdd, nome_caracteristica: "inexistente" }],
      p_dry_run: true,
    });
    check("regra de adicionar_material é 'novo'", prevRegra?.[0]?.status === "novo");
    check("regra de ajustar_quantidade é 'novo'", prevRegra?.[1]?.status === "novo");
    check("regra repetida no arquivo é 'duplicado_no_arquivo'", prevRegra?.[2]?.status === "duplicado_no_arquivo");
    check("característica inexistente na regra é recusada", prevRegra?.[3]?.status === "invalido");

    await admTenant.client.rpc("importar_peca_regras", { p_linhas: [regraAdd, regraAjuste], p_dry_run: false });
    await admTenant.client.rpc("importar_peca_regras", { p_linhas: [regraAdd, regraAjuste], p_dry_run: false });
    const { count: regrasAtivas } = await admin
      .from("peca_regras").select("id", { count: "exact", head: true }).eq("peca_id", pecaRow.id).eq("ativo", true);
    // Regras são versionadas e criar_regra_peca() sempre cria versão nova:
    // sem o reconhecimento de regra equivalente, importar duas vezes daria 4.
    check("importar as mesmas regras duas vezes não duplica", regrasAtivas === 2);
  }

  console.log("\n10. Produção e estoque (Fase 8d)");
  {
    const COD_ITEM = "ITM-IMP-8D";
    const COD_REC = "REC-IMP-8D";
    const COD_DIM = "DIM-IMP-8D";
    for (const [codigo, descricao, tipo, unidade] of [
      [COD_ITEM, "Item da Fase 8d", "produto_acabado", "UN"],
      [COD_DIM, "Perfil da Fase 8d", "materia_prima", "M"],
    ]) {
      await admTenant.client.rpc("upsert_item", {
        p_id: null, p_codigo: codigo, p_descricao: descricao, p_tipo: tipo,
        p_classificacao: null, p_unidade_principal: unidade, p_situacao: "ativo",
      });
    }
    const itemId = async (codigo) =>
      (await admin.from("itens").select("id").eq("company_id", admTenant.company.id).eq("codigo", codigo).single()).data.id;
    const saldoDe = async (codigo) =>
      Number(
        (await admin.from("estoque_saldos").select("quantidade_fisica")
          .eq("company_id", admTenant.company.id).eq("item_id", await itemId(codigo)).single()).data.quantidade_fisica,
      );

    // ---- recursos ----
    const rec = { codigo: COD_REC, nome: "Serra da Fase 8d", tipo: "maquina", setor: "corte", custo_hora: "45.50" };
    const { error: semPermRec } = await noPermTenant.client.rpc("importar_recursos_produtivos", {
      p_linhas: [rec], p_dry_run: true,
    });
    check("sem producao.manage não importa recursos", !!semPermRec);

    const { data: prevRec } = await admTenant.client.rpc("importar_recursos_produtivos", {
      p_linhas: [rec, { ...rec }, { codigo: "SEM-TIPO-8D", nome: "sem tipo" }], p_dry_run: true,
    });
    check("recurso novo é 'novo'", prevRec?.[0]?.status === "novo");
    check("código de recurso repetido é 'duplicado_no_arquivo'", prevRec?.[1]?.status === "duplicado_no_arquivo");
    check("recurso sem tipo é recusado", prevRec?.[2]?.status === "invalido");

    await admTenant.client.rpc("importar_recursos_produtivos", { p_linhas: [rec], p_dry_run: false });
    const { data: recDb } = await admin
      .from("recursos_produtivos").select("custo_hora").eq("company_id", admTenant.company.id).eq("codigo", COD_REC).maybeSingle();
    check("recurso grava o custo por hora", Number(recDb?.custo_hora) === 45.5);

    const { data: tipoTrocadoRec } = await admTenant.client.rpc("importar_recursos_produtivos", {
      p_linhas: [{ ...rec, tipo: "posto" }], p_dry_run: true,
    });
    check("trocar o tipo de um recurso existente é recusado", tipoTrocadoRec?.[0]?.status === "invalido");

    // ---- roteiro e operações ----
    await admTenant.client.rpc("importar_roteiros_produtivos", {
      p_linhas: [{ codigo_item: COD_ITEM, nome: "Roteiro padrão" }], p_dry_run: false,
    });
    const op = {
      codigo_item: COD_ITEM, nome_roteiro: "Roteiro padrão", sequencia: "1",
      descricao: "Cortar", codigo_recurso: COD_REC, tempo_previsto_minutos: "12",
    };
    const { data: prevOp } = await admTenant.client.rpc("importar_roteiro_operacoes", {
      p_linhas: [op, { ...op }, { ...op, sequencia: "2", codigo_recurso: "NAO-EXISTE-8D" }, { ...op, sequencia: "3", nome_roteiro: "inexistente" }],
      p_dry_run: true,
    });
    check("operação nova é 'novo'", prevOp?.[0]?.status === "novo");
    check("mesma sequência repetida é 'duplicado_no_arquivo'", prevOp?.[1]?.status === "duplicado_no_arquivo");
    check("recurso inexistente na operação é recusado", prevOp?.[2]?.status === "invalido");
    check("roteiro inexistente é recusado", prevOp?.[3]?.status === "invalido");

    await admTenant.client.rpc("importar_roteiro_operacoes", { p_linhas: [op], p_dry_run: false });
    const { data: opDeNovo } = await admTenant.client.rpc("importar_roteiro_operacoes", { p_linhas: [op], p_dry_run: true });
    check("sequência já ocupada vira 'atualizacao', não sobrescreve", opDeNovo?.[0]?.status === "atualizacao");

    // ---- estoque inicial: a armadilha do delta ----
    // ajustar_saldo() recebe DELTA e a planilha dá valor ABSOLUTO. Sem o
    // cálculo da diferença, a 2ª importação do mesmo arquivo dobraria o
    // estoque sem erro nenhum na tela.
    await admTenant.client.rpc("importar_estoque_saldos", {
      p_linhas: [{ codigo_item: COD_ITEM, quantidade_fisica: "100" }], p_dry_run: false,
    });
    check("estoque inicial grava a quantidade informada", (await saldoDe(COD_ITEM)) === 100);
    await admTenant.client.rpc("importar_estoque_saldos", {
      p_linhas: [{ codigo_item: COD_ITEM, quantidade_fisica: "100" }], p_dry_run: false,
    });
    check("reimportar o mesmo saldo NÃO dobra o estoque", (await saldoDe(COD_ITEM)) === 100);
    await admTenant.client.rpc("importar_estoque_saldos", {
      p_linhas: [{ codigo_item: COD_ITEM, quantidade_fisica: "70" }], p_dry_run: false,
    });
    check("corrigir o saldo aplica só a diferença", (await saldoDe(COD_ITEM)) === 70);

    // ---- peças dimensionais ----
    const { data: semControle } = await admTenant.client.rpc("importar_itens_pecas_dimensionais", {
      p_linhas: [{ codigo_item: COD_DIM, quantidade_original: "6" }], p_dry_run: true,
    });
    check("peça de item sem controle dimensional é recusada", semControle?.[0]?.status === "invalido");

    await admTenant.client.rpc("importar_itens_dimensional", {
      p_linhas: [{ codigo_item: COD_DIM, dimensao_tipo: "linear", peso_por_unidade_dimensao: "1.85" }], p_dry_run: false,
    });
    const peca = { codigo_item: COD_DIM, identificador: "BARRA-8D", quantidade_original: "6", quantidade_disponivel: "4" };
    const { data: prevPeca } = await admTenant.client.rpc("importar_itens_pecas_dimensionais", {
      p_linhas: [peca, { ...peca }, { codigo_item: COD_DIM, quantidade_original: "6", quantidade_disponivel: "9" }],
      p_dry_run: true,
    });
    check("peça dimensional nova é 'novo'", prevPeca?.[0]?.status === "novo");
    check("mesmo identificador repetido é 'duplicado_no_arquivo'", prevPeca?.[1]?.status === "duplicado_no_arquivo");
    check("disponível maior que original é recusado", prevPeca?.[2]?.status === "invalido");

    await admTenant.client.rpc("importar_itens_pecas_dimensionais", { p_linhas: [peca], p_dry_run: false });
    const { data: pecaDb } = await admin
      .from("itens_pecas_dimensionais").select("quantidade_original, quantidade_disponivel")
      .eq("company_id", admTenant.company.id).eq("identificador", "BARRA-8D").maybeSingle();
    check(
      "peça entra com o consumo já aplicado (6 original, 4 disponível)",
      Number(pecaDb?.quantidade_original) === 6 && Number(pecaDb?.quantidade_disponivel) === 4,
    );
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
