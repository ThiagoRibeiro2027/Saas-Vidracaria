// Testes automatizados do TÓPICO 10 — Comercial: orçamento simples com
// itens e decisão de aprovação/rejeição/cancelamento (recorte mínimo do
// M1), mais oportunidades e funil comercial fixo (ampliação de escopo,
// ADR-002 v2.4, 19/09/2026). Sem versionamento de orçamento.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-comercial.mjs

import "./lib/somente-local.mjs";
import { createClient } from "@supabase/supabase-js";
import { authenticator } from "otplib";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Sufixo de execução — o banco é único e compartilhado entre as máquinas
// (CLAUDE.md, "Banco e ambiente de trabalho"), então o tenant de teste
// sobrevive de uma sessão pra outra. Com slug fixo, a 2ª execução esbarra
// nas uniques de chave natural (itens_company_codigo_unique,
// pessoas_company_documento_unique, ...) já na massa de dados: o id volta
// nulo e o placar desaba em cascata, sem bug nenhum no produto. Tenant por
// execução mantém válidas as asserções que assumem estado zerado. Mesmo
// padrão de test-pecas.mjs. O custo é acumular um tenant por execução no
// banco da nuvem — limpeza é separada e combinada com o responsável,
// nunca automática.
const RUN = Date.now().toString(36);

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

  const { data: created } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let userId = created?.user?.id;
  if (!userId) {
    // Banco único compartilhado entre as máquinas (CLAUDE.md) acumula
    // usuários de teste entre sessões — sem perPage alto, o fixture antigo
    // deste e-mail some da 1ª página do listUsers() e o fallback nunca acha.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 10000 });
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

  return { client, company, userId, roleId: role.id };
}

// Concede uma permissão avulsa a um perfil específico, criando um papel só
// pra isso — usado para simular um usuário "COMERCIAL" com orcamentos.manage
// mas sem ser ADMIN (e sem a permissão de configuracoes.manage, que o ADMIN
// tem por padrão via seed).
// Usuário novo DENTRO de uma empresa existente (profiles.company_id é imutável).
async function createUserInCompany(company, slug, identifier, roleKey) {
  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 10000 });
    userId = list.users.find((u) => u.email === email)?.id;
  }
  await admin.from("profiles").upsert(
    { id: userId, company_id: company.id, login_identifier: `${identifier}-${slug}`.slice(0, 40), display_name: slug },
    { onConflict: "id" },
  );
  const { data: role } = await admin.from("roles").select("id").is("company_id", null).eq("key", roleKey).single();
  await admin.from("user_roles").insert({ profile_id: userId, role_id: role.id });
  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });
  return { client, company, userId };
}

async function grantOnlyPermission(tenant, resource, action, roleKeySuffix) {
  const { data: perm } = await admin
    .from("permissions")
    .select("id")
    .eq("resource", resource)
    .eq("action", action)
    .single();

  const { data: role } = await admin
    .from("roles")
    .upsert(
      { company_id: tenant.company.id, key: `TEST_${roleKeySuffix}`, name: `Teste ${roleKeySuffix}` },
      { onConflict: "company_id,key" },
    )
    .select()
    .single();

  await admin
    .from("role_permissions")
    .upsert({ role_id: role.id, permission_id: perm.id }, { onConflict: "role_id,permission_id" });

  await admin.from("user_roles").insert({ profile_id: tenant.userId, role_id: role.id });

  return role.id;
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão, outro tenant)...");
  const admTenant = await createTenant(`comercial-test-admin-${RUN}`, "Comercial Admin Teste", "9801", "ADMIN");
  const noPermTenant = await createTenant(`comercial-test-noperm-${RUN}`, "Comercial SemPerm Teste", "9802", "COMERCIAL");
  const otherTenant = await createTenant(`comercial-test-other-${RUN}`, "Comercial Outro Teste", "9803", "ADMIN");

  console.log("\n0. Massa de dados (numeração, pessoa, obra, item) via ADMIN");
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento",
    p_prefixo: "ORC-",
    p_sufixo: "",
    p_digitos: 4,
    p_incluir_ano: false,
    p_incluir_mes: false,
    p_reinicio: "nunca",
  });
  const { data: clienteId } = await admTenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CNPJ", p_documento: "11222333000181", p_nome: "JR Box Vidros",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: clienteId, p_papel: "CLIENTE", p_ativo: true });
  const { data: obraId } = await admTenant.client.rpc("upsert_obra", {
    p_id: null, p_pessoa_id: clienteId, p_nome: "Residencial Alto da Serra",
    p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  const { data: itemId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "VD-TEMP-10", p_descricao: "Vidro temperado 10mm",
    p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
    p_situacao: "ativo",
  });
  check("numeração, pessoa, obra e item preparados", !!clienteId && !!obraId && !!itemId);

  console.log("\n1. Escrita exige orcamentos.manage");
  {
    const { error } = await noPermTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteId, p_obra_id: null, p_validade: null,
      p_condicao_comercial: null, p_observacoes: null,
    });
    check("sem orcamentos.manage não cria orçamento", !!error);
  }

  console.log("\n2. Orçamento exige pessoa com papel CLIENTE ativo");
  {
    const { data: pessoaSemPapel } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: null, p_documento: null, p_nome: "Fulano Sem Papel",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
      p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    const { error } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: pessoaSemPapel, p_obra_id: null, p_validade: null,
      p_condicao_comercial: null, p_observacoes: null,
    });
    check("orçamento rejeita pessoa sem papel CLIENTE ativo", !!error);
  }

  console.log("\n3. Orçamento rejeita obra de outra pessoa");
  {
    const { data: outraPessoa } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: null, p_documento: null, p_nome: "Outro Cliente",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
      p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: outraPessoa, p_papel: "CLIENTE", p_ativo: true });

    const { error } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: outraPessoa, p_obra_id: obraId, p_validade: null,
      p_condicao_comercial: null, p_observacoes: null,
    });
    check("orçamento rejeita obra que não é da pessoa informada", !!error);
  }

  console.log("\n4. Cria orçamento, adiciona itens, número sequencial via next_document_number");
  let orcamentoId, itemOrcamentoId;
  {
    const { data: id, error } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteId, p_obra_id: obraId, p_validade: "2026-12-31",
      p_condicao_comercial: "30 dias", p_observacoes: "Teste",
    });
    check("ADMIN cria orçamento", !error && !!id);
    orcamentoId = id;

    const { data: row } = await admin.from("orcamentos").select("numero, status").eq("id", id).single();
    check("orçamento nasce em rascunho com número gerado", row?.status === "rascunho" && row?.numero === "ORC-0001");

    const { data: oiId, error: itemError } = await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: 10, p_preco_unitario: 150.5,
    });
    check("item adicionado ao orçamento", !itemError && !!oiId);
    itemOrcamentoId = oiId;

    const { error: dupNumeroError } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteId, p_obra_id: null, p_validade: null,
      p_condicao_comercial: null, p_observacoes: null,
    });
    const { data: segundo } = await admin
      .from("orcamentos")
      .select("numero")
      .eq("company_id", admTenant.company.id)
      .neq("id", orcamentoId)
      .maybeSingle();
    check("segundo orçamento recebe número seguinte (sem duplicidade)", !dupNumeroError && segundo?.numero === "ORC-0002");
  }

  console.log("\n5. Orçamento sem item não pode ser aprovado");
  {
    const { data: vazioId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteId, p_obra_id: null, p_validade: null,
      p_condicao_comercial: null, p_observacoes: null,
    });
    const { error } = await admTenant.client.rpc("decidir_orcamento", { p_id: vazioId, p_decisao: "aprovado" });
    check("aprovação é rejeitada quando orçamento não tem itens", !!error);
  }

  console.log("\n6. Alçada de aprovação (approval_thresholds, processo='orcamento')");
  {
    // Valor total do orçamento de teste: 10 * 150.5 = 1505. Alçada em 1000
    // exige o perfil aprovador configurado — ADMIN não tem esse papel
    // específico (só orcamentos.manage), então deve ser bloqueado até que
    // o papel aprovador seja concedido.
    const { data: roles } = await admin.from("roles").select("id, key").is("company_id", null);
    const aprovadorRoleId = roles.find((r) => r.key === "ADMIN").id;

    await admTenant.client.rpc("upsert_approval_threshold", {
      p_processo: "orcamento", p_valor_minimo: 1000, p_role_id: aprovadorRoleId, p_ativo: true,
    });

    // Para testar o bloqueio de fato, um segundo usuário no MESMO tenant
    // com orcamentos.manage mas sem o papel ADMIN (o aprovador da alçada
    // acima).
    // O usuário nasce JÁ na empresa do ADMIN. (A versão anterior criava um tenant
    // próprio e tentava mover o perfil com UPDATE de company_id — o trigger
    // profiles_company_id_immutable recusa, o UPDATE falhava em silêncio e o
    // usuário ficava sem orcamentos.manage na empresa do orçamento: os "bloqueios"
    // abaixo passavam por falta de permissão, não pela alçada.)
    const semAlcadaTenant = await createUserInCompany(admTenant.company, `comercial-test-semalcada-${RUN}`, "9804", "COMERCIAL");
    await grantOnlyPermission({ company: admTenant.company, userId: semAlcadaTenant.userId }, "orcamentos", "manage", "ORC_MANAGE");

    const { error: bloqueadoError } = await semAlcadaTenant.client.rpc("decidir_orcamento", {
      p_id: orcamentoId, p_decisao: "aprovado",
    });
    check("aprovação acima da alçada é bloqueada sem o papel aprovador (erro de ALÇADA, não de permissão)", /exige o perfil aprovador/.test(bloqueadoError?.message ?? ""));

    // Auditoria TR Systems 12/10/2026, achado 1 (migration
    // 20261012*_alcada_platform_admin_mfa): o bypass da alçada para
    // platform_admin precisa de AAL2. Mesmo usuário, agora também
    // platform_admin, mas sessão em AAL1 — continua bloqueado.
    await admin.from("platform_admins").insert({ id: semAlcadaTenant.userId, role: "SUPER_ADMIN" });
    const { error: platformAal1Error } = await semAlcadaTenant.client.rpc("decidir_orcamento", {
      p_id: orcamentoId, p_decisao: "aprovado",
    });
    await admin.from("platform_admins").delete().eq("id", semAlcadaTenant.userId);
    check("platform_admin em AAL1 NÃO dispensa a alçada do orçamento (erro de ALÇADA)", /exige o perfil aprovador/.test(platformAal1Error?.message ?? ""));
    const { data: aindaRascunho } = await admin.from("orcamentos").select("status").eq("id", orcamentoId).single();
    check("orçamento não mudou de status após a tentativa em AAL1", aindaRascunho?.status !== "aprovado");

    // Caso POSITIVO do achado 1: o mesmo platform_admin, agora com MFA verificado
    // (AAL2), dispensa a alçada. Usa um segundo orçamento (mesmo valor, 1505) para
    // não consumir o orçamento que o ADMIN aprova logo abaixo.
    const { data: orcAal2Id } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteId, p_obra_id: obraId, p_validade: "2026-12-31",
      p_condicao_comercial: "30 dias", p_observacoes: "Teste AAL2",
    });
    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcAal2Id, p_item_id: itemId, p_quantidade: 10, p_preco_unitario: 150.5,
    });
    await admin.from("platform_admins").insert({ id: semAlcadaTenant.userId, role: "SUPER_ADMIN" });
    const { data: enrollAal2 } = await semAlcadaTenant.client.auth.mfa.enroll({ factorType: "totp" });
    const { data: challengeAal2 } = await semAlcadaTenant.client.auth.mfa.challenge({ factorId: enrollAal2.id });
    await semAlcadaTenant.client.auth.mfa.verify({
      factorId: enrollAal2.id, challengeId: challengeAal2.id, code: authenticator.generate(enrollAal2.totp.secret),
    });
    const { error: platformAal2Error } = await semAlcadaTenant.client.rpc("decidir_orcamento", {
      p_id: orcAal2Id, p_decisao: "aprovado",
    });
    await admin.from("platform_admins").delete().eq("id", semAlcadaTenant.userId);
    check("platform_admin em AAL2 (MFA verificado) dispensa a alçada do orçamento", !platformAal2Error);
    const { data: aprovadoAal2 } = await admin.from("orcamentos").select("status").eq("id", orcAal2Id).single();
    check("orçamento aprovado em AAL2 muda de status", aprovadoAal2?.status === "aprovado");

    const { error: aprovadoError } = await admTenant.client.rpc("decidir_orcamento", {
      p_id: orcamentoId, p_decisao: "aprovado",
    });
    check("ADMIN (papel aprovador da alçada) aprova com sucesso", !aprovadoError);

    const { data: row } = await admin.from("orcamentos").select("status").eq("id", orcamentoId).single();
    check("orçamento aprovado muda de status", row?.status === "aprovado");
  }

  console.log("\n7. Orçamento decidido é terminal — bloqueia edição de cabeçalho e itens");
  {
    const { error: headerError } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: orcamentoId, p_pessoa_id: clienteId, p_obra_id: obraId, p_validade: null,
      p_condicao_comercial: "mudou", p_observacoes: null,
    });
    check("orçamento aprovado não pode ter cabeçalho editado", !!headerError);

    const { error: itemEditError } = await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: itemOrcamentoId, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: 99, p_preco_unitario: 1,
    });
    check("orçamento aprovado não pode ter item editado", !!itemEditError);

    const { error: removeError } = await admTenant.client.rpc("remove_orcamento_item", { p_id: itemOrcamentoId });
    check("orçamento aprovado não pode ter item removido", !!removeError);

    const { error: decidirDeNovoError } = await admTenant.client.rpc("decidir_orcamento", {
      p_id: orcamentoId, p_decisao: "rejeitado", p_motivo_rejeicao: "preco",
    });
    check("orçamento já decidido não pode ser decidido de novo", !!decidirDeNovoError);
  }

  console.log("\n8. Cancelamento");
  {
    const { error } = await admTenant.client.rpc("cancelar_orcamento", { p_id: orcamentoId });
    check("orçamento aprovado pode ser cancelado", !error);

    const { data: row } = await admin.from("orcamentos").select("status").eq("id", orcamentoId).single();
    check("status vira cancelado", row?.status === "cancelado");

    const { error: cancelarDeNovoError } = await admTenant.client.rpc("cancelar_orcamento", { p_id: orcamentoId });
    check("orçamento cancelado não pode ser cancelado de novo", !!cancelarDeNovoError);
  }

  console.log("\n9. Isolamento entre tenants");
  {
    const { data: crossOrcamentos } = await otherTenant.client
      .from("orcamentos")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga orçamentos do tenant A", (crossOrcamentos ?? []).length === 0);

    const { error: crossDecidirError } = await otherTenant.client.rpc("decidir_orcamento", {
      p_id: orcamentoId, p_decisao: "aprovado",
    });
    check("tenant B não consegue decidir orçamento do tenant A", !!crossDecidirError);
  }

  console.log("\n10. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .eq("company_id", admTenant.company.id)
      .in("action", [
        "comercial.orcamento_upserted",
        "comercial.orcamento_item_upserted",
        "comercial.orcamento_decidido",
        "comercial.orcamento_cancelado",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("orcamento_upserted registrado", actions.has("comercial.orcamento_upserted"));
    check("orcamento_item_upserted registrado", actions.has("comercial.orcamento_item_upserted"));
    check("orcamento_decidido registrado", actions.has("comercial.orcamento_decidido"));
    check("orcamento_cancelado registrado", actions.has("comercial.orcamento_cancelado"));
  }

  console.log("\n11. orcamento_valor_total() — fonte única usada por decidir_orcamento e pela UI");
  {
    const { data: total, error } = await admTenant.client.rpc("orcamento_valor_total", {
      p_orcamento_id: orcamentoId,
    });
    check("total calculado corretamente (10 * 150.5)", !error && Number(total) === 1505);
  }

  console.log("\n12. next_document_number() exige permissão do módulo (achado do code-review)");
  {
    const { error: semPermError } = await noPermTenant.client.rpc("next_document_number", {
      p_document_type: "orcamento",
    });
    check("sem orcamentos.manage não emite número de orçamento direto via RPC", !!semPermError);

    const { data: numero, error } = await admTenant.client.rpc("next_document_number", {
      p_document_type: "orcamento",
    });
    check("com orcamentos.manage emite número normalmente", !error && !!numero);
  }

  console.log("\n13. Oportunidades — escrita exige oportunidades.manage");
  let oportunidadeId;
  {
    const { error } = await noPermTenant.client.rpc("upsert_oportunidade", {
      p_id: null, p_pessoa_id: clienteId, p_origem: "site", p_descricao: "Fachada comercial",
      p_valor_potencial: 5000, p_probabilidade: 50, p_previsao_fechamento: "2026-12-01", p_observacoes: null,
    });
    check("sem oportunidades.manage não cria oportunidade", !!error);
  }

  console.log("\n14. Oportunidade nasce em 'prospeccao'; probabilidade fora de 0-100 é rejeitada");
  {
    const { error: probInvalida } = await admTenant.client.rpc("upsert_oportunidade", {
      p_id: null, p_pessoa_id: clienteId, p_origem: "site", p_descricao: "Fachada comercial",
      p_valor_potencial: 5000, p_probabilidade: 150, p_previsao_fechamento: "2026-12-01", p_observacoes: null,
    });
    check("probabilidade > 100 é rejeitada", !!probInvalida);

    const { data: id, error } = await admTenant.client.rpc("upsert_oportunidade", {
      p_id: null, p_pessoa_id: clienteId, p_origem: "site", p_descricao: "Fachada comercial",
      p_valor_potencial: 5000, p_probabilidade: 50, p_previsao_fechamento: "2026-12-01", p_observacoes: null,
    });
    check("ADMIN cria oportunidade", !error && !!id);
    oportunidadeId = id;

    const { data: row } = await admin.from("oportunidades").select("estagio").eq("id", oportunidadeId).single();
    check("nasce no estágio 'prospeccao'", row?.estagio === "prospeccao");
  }

  console.log("\n15. Funil fixo — mudança de estágio e motivo de perda");
  {
    const { error: estagioInvalido } = await admTenant.client.rpc("mudar_estagio_oportunidade", {
      p_id: oportunidadeId, p_estagio: "inventado", p_motivo_perda: null,
    });
    check("estágio fora da lista fixa é rejeitado", !!estagioInvalido);

    const { error: perdidaSemMotivo } = await admTenant.client.rpc("mudar_estagio_oportunidade", {
      p_id: oportunidadeId, p_estagio: "perdida", p_motivo_perda: null,
    });
    check("mover para 'perdida' sem motivo é rejeitado", !!perdidaSemMotivo);

    const { error: motivoForaDeContexto } = await admTenant.client.rpc("mudar_estagio_oportunidade", {
      p_id: oportunidadeId, p_estagio: "contato", p_motivo_perda: "preco",
    });
    check("motivo de perda fora do estágio 'perdida' é rejeitado", !!motivoForaDeContexto);

    const { error: avancaEstagio } = await admTenant.client.rpc("mudar_estagio_oportunidade", {
      p_id: oportunidadeId, p_estagio: "contato", p_motivo_perda: null,
    });
    check("avança estágio normalmente", !avancaEstagio);
  }

  console.log("\n16. Estágio terminal (ganha/perdida) é terminal");
  {
    const { data: outraId } = await admTenant.client.rpc("upsert_oportunidade", {
      p_id: null, p_pessoa_id: clienteId, p_origem: "indicação", p_descricao: "Box de banheiro",
      p_valor_potencial: 1200, p_probabilidade: 30, p_previsao_fechamento: null, p_observacoes: null,
    });
    await admTenant.client.rpc("mudar_estagio_oportunidade", {
      p_id: outraId, p_estagio: "perdida", p_motivo_perda: "preco",
    });

    const { error: editaTerminal } = await admTenant.client.rpc("upsert_oportunidade", {
      p_id: outraId, p_pessoa_id: clienteId, p_origem: "indicação", p_descricao: "mudou",
      p_valor_potencial: 1200, p_probabilidade: 30, p_previsao_fechamento: null, p_observacoes: null,
    });
    check("oportunidade perdida não pode ser editada", !!editaTerminal);

    const { error: mudaDeNovo } = await admTenant.client.rpc("mudar_estagio_oportunidade", {
      p_id: outraId, p_estagio: "contato", p_motivo_perda: null,
    });
    check("oportunidade perdida não pode mudar de estágio de novo", !!mudaDeNovo);
  }

  console.log("\n17. vincular_oportunidade_orcamento() — exige orcamentos.manage e orçamento em rascunho");
  {
    const { data: novoOrcId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteId, p_obra_id: null, p_validade: null,
      p_condicao_comercial: null, p_observacoes: null,
    });

    const { error: semPermError } = await noPermTenant.client.rpc("vincular_oportunidade_orcamento", {
      p_orcamento_id: novoOrcId, p_oportunidade_id: oportunidadeId,
    });
    check("sem orcamentos.manage não vincula oportunidade ao orçamento", !!semPermError);

    const { error } = await admTenant.client.rpc("vincular_oportunidade_orcamento", {
      p_orcamento_id: novoOrcId, p_oportunidade_id: oportunidadeId,
    });
    check("ADMIN vincula oportunidade ao orçamento em rascunho", !error);

    const { data: row } = await admin.from("orcamentos").select("oportunidade_id").eq("id", novoOrcId).single();
    check("orçamento fica com oportunidade_id preenchido", row?.oportunidade_id === oportunidadeId);

    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: novoOrcId, p_item_id: itemId, p_quantidade: 1, p_preco_unitario: 100,
    });
    await admTenant.client.rpc("decidir_orcamento", { p_id: novoOrcId, p_decisao: "aprovado" });

    const { error: naoRascunho } = await admTenant.client.rpc("vincular_oportunidade_orcamento", {
      p_orcamento_id: novoOrcId, p_oportunidade_id: oportunidadeId,
    });
    check("orçamento fora de rascunho não pode ser (re)vinculado", !!naoRascunho);
  }

  console.log("\n18. Isolamento cross-tenant de oportunidades");
  {
    const { data: crossOportunidades } = await otherTenant.client
      .from("oportunidades")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga oportunidades do tenant A", (crossOportunidades ?? []).length === 0);

    const { error: crossMudaEstagio } = await otherTenant.client.rpc("mudar_estagio_oportunidade", {
      p_id: oportunidadeId, p_estagio: "negociacao", p_motivo_perda: null,
    });
    check("tenant B não consegue mudar estágio de oportunidade do tenant A", !!crossMudaEstagio);

    const { error: crossVincula } = await otherTenant.client.rpc("vincular_oportunidade_orcamento", {
      p_orcamento_id: orcamentoId, p_oportunidade_id: oportunidadeId,
    });
    check("tenant B não vincula oportunidade/orçamento de outro tenant", !!crossVincula);
  }

  console.log("\n19. Auditoria das oportunidades");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .eq("company_id", admTenant.company.id)
      .in("action", [
        "comercial.oportunidade_upserted",
        "comercial.oportunidade_estagio_mudado",
        "comercial.orcamento_vinculado_oportunidade",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("oportunidade_upserted registrado", actions.has("comercial.oportunidade_upserted"));
    check("oportunidade_estagio_mudado registrado", actions.has("comercial.oportunidade_estagio_mudado"));
    check("orcamento_vinculado_oportunidade registrado", actions.has("comercial.orcamento_vinculado_oportunidade"));
  }

  console.log("\n20. Formação de custo simplificada (custo_unitario, ADR-002 v2.4 Fase 2)");
  {
    const { data: outroOrcId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteId, p_obra_id: null, p_validade: null,
      p_condicao_comercial: null, p_observacoes: null,
    });

    const { error: custoNegativoError } = await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: outroOrcId, p_item_id: itemId, p_quantidade: 2, p_preco_unitario: 100,
      p_custo_unitario: -1,
    });
    check("custo unitário negativo é rejeitado", !!custoNegativoError);

    const { data: comCustoId, error: comCustoError } = await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: outroOrcId, p_item_id: itemId, p_quantidade: 2, p_preco_unitario: 100,
      p_custo_unitario: 60,
    });
    check("item com custo informado é criado", !comCustoError && !!comCustoId);

    const { data: comCustoRow } = await admin
      .from("orcamento_itens")
      .select("custo_unitario")
      .eq("id", comCustoId)
      .single();
    check("custo_unitario persistido corretamente", Number(comCustoRow?.custo_unitario) === 60);

    const { data: semCustoId, error: semCustoError } = await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: outroOrcId, p_item_id: itemId, p_quantidade: 1, p_preco_unitario: 50,
      p_custo_unitario: null,
    });
    check("item sem custo informado (compatibilidade retroativa) é criado", !semCustoError && !!semCustoId);

    const { data: semCustoRow } = await admin
      .from("orcamento_itens")
      .select("custo_unitario")
      .eq("id", semCustoId)
      .single();
    check("custo_unitario fica null quando não informado", semCustoRow?.custo_unitario === null);
  }

  console.log("\n§9 — configurador de peça durante o orçamento (definir_valor_caracteristica_orcamento_item)");
  {
    const { data: itemPecaId, error: eItemPeca } = await admTenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: "JAN-CFG-TESTE", p_descricao: "Janela configurável teste",
      p_tipo: "produto_acabado", p_classificacao: "esquadria", p_unidade_principal: "UN", p_situacao: "ativo",
    });
    check("item tipo produto_acabado criado", !eItemPeca && !!itemPecaId);

    const { data: pecaId, error: ePeca } = await admTenant.client.rpc("criar_peca", { p_item_id: itemPecaId, p_descricao_tecnica: "Janela de correr" });
    check("peça criada a partir do item", !ePeca && !!pecaId);

    const { data: caractLargura } = await admTenant.client.rpc("definir_caracteristica_peca", {
      p_peca_id: pecaId, p_nome: "largura", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: true,
    });
    const { data: caractVidro } = await admTenant.client.rpc("definir_caracteristica_peca", {
      p_peca_id: pecaId, p_nome: "vidro", p_tipo: "opcao", p_unidade: null, p_opcoes: ["temperado", "laminado"], p_obrigatoria: true,
    });

    const { data: orcamentoCfgId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteId, p_obra_id: obraId, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
    });
    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcamentoCfgId, p_item_id: itemPecaId, p_quantidade: 2, p_preco_unitario: 500,
    });
    const { data: orcItemRow } = await admin.from("orcamento_itens").select("id").eq("orcamento_id", orcamentoCfgId).single();
    const orcItemId = orcItemRow.id;

    const { error: eSemPerm } = await noPermTenant.client.rpc("definir_valor_caracteristica_orcamento_item", {
      p_orcamento_item_id: orcItemId, p_peca_caracteristica_id: caractLargura, p_valor_numero: 1800, p_valor_texto: null,
    });
    check("sem orcamentos.manage não define valor de característica", !!eSemPerm);

    const { error: eTipoErrado } = await admTenant.client.rpc("definir_valor_caracteristica_orcamento_item", {
      p_orcamento_item_id: orcItemId, p_peca_caracteristica_id: caractLargura, p_valor_numero: null, p_valor_texto: "1800",
    });
    check("valor de tipo errado (texto pra característica numérica) é rejeitado", !!eTipoErrado);

    const { error: eOpcaoInvalida } = await admTenant.client.rpc("definir_valor_caracteristica_orcamento_item", {
      p_orcamento_item_id: orcItemId, p_peca_caracteristica_id: caractVidro, p_valor_numero: null, p_valor_texto: "comum",
    });
    check("opção fora da lista permitida é rejeitada", !!eOpcaoInvalida);

    const { error: eLargura } = await admTenant.client.rpc("definir_valor_caracteristica_orcamento_item", {
      p_orcamento_item_id: orcItemId, p_peca_caracteristica_id: caractLargura, p_valor_numero: 1800, p_valor_texto: null,
    });
    const { error: eVidro } = await admTenant.client.rpc("definir_valor_caracteristica_orcamento_item", {
      p_orcamento_item_id: orcItemId, p_peca_caracteristica_id: caractVidro, p_valor_numero: null, p_valor_texto: "temperado",
    });
    check("ADMIN define largura e vidro com sucesso", !eLargura && !eVidro);

    const { data: listagem, error: eListagem } = await admTenant.client.rpc("listar_valores_caracteristicas_orcamento_item", { p_orcamento_item_id: orcItemId });
    check(
      "listar_valores_caracteristicas_orcamento_item devolve as duas características com os valores certos",
      !eListagem && listagem?.find((l) => l.nome === "largura")?.valor_numero === 1800 && listagem?.find((l) => l.nome === "vidro")?.valor_texto === "temperado",
    );

    const { data: dataOutro } = await otherTenant.client.rpc("listar_valores_caracteristicas_orcamento_item", { p_orcamento_item_id: orcItemId });
    const { error: eOutro } = await otherTenant.client.rpc("listar_valores_caracteristicas_orcamento_item", { p_orcamento_item_id: orcItemId });
    check("outro tenant não enxerga item de orçamento alheio", !!eOutro && !dataOutro);

    await admTenant.client.rpc("decidir_orcamento", { p_id: orcamentoCfgId, p_decisao: "aprovado" });
    const { error: eAposAprovado } = await admTenant.client.rpc("definir_valor_caracteristica_orcamento_item", {
      p_orcamento_item_id: orcItemId, p_peca_caracteristica_id: caractLargura, p_valor_numero: 2000, p_valor_texto: null,
    });
    check("orçamento aprovado não aceita mais alteração de característica (só rascunho)", !!eAposAprovado);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
