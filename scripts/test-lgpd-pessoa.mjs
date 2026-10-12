// Testes automatizados de anonimizar_pessoa() (20261011120500), achado da
// auditoria de gaps ADR-001 a ADR-012 (11/10/2026): o único mecanismo de
// anonimização LGPD existente (anonymize_activity_logs_for_user(), ADR-010
// §6) só atende titular que é usuário do sistema — um cliente/fornecedor/
// contato cadastrado em "pessoas" não tinha nenhum caminho de exclusão/
// anonimização, embora seja titular de dado pessoal do mesmo jeito
// (ADR-010 §3). Diferente da anonimização de activity_logs (restrita a
// platform_admin, porque é trilha de auditoria do próprio SaaS), esta é
// responsabilidade normal da controladora (ADR-010 §2) — o gate é
// pessoas.manage, igual a qualquer outra escrita em pessoas.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-lgpd-pessoa.mjs

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

async function ultimoLog(companyId, action, entityId) {
  const { data } = await admin
    .from("activity_logs")
    .select("*")
    .eq("company_id", companyId)
    .eq("action", action)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function criarPessoa(companyId, nome) {
  const { data, error } = await admin
    .from("pessoas")
    .insert({
      company_id: companyId, tipo_documento: "CPF", documento: `${Date.now()}`.slice(-11),
      nome, telefone: "11999999999", email: "titular@example.com",
      logradouro: "Rua Teste, 123", cidade: "São Paulo", uf: "SP", cep: "01000-000",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão, outro tenant)...");
  const admTenant = await createTenant("t-lgpd-admin", "LGPD Admin Teste", "lgpd01", "ADMIN");
  const noPermTenant = await createTenant("t-lgpd-noperm", "LGPD SemPerm Teste", "lgpd02", "PRODUCAO");
  const otherTenant = await createTenant("t-lgpd-other", "LGPD Outro Teste", "lgpd03", "ADMIN");

  console.log("\n1. Gate de permissão e isolamento cross-tenant");
  {
    const pessoa = await criarPessoa(admTenant.company.id, "Cliente Teste Permissão");

    const { error: semPermError } = await noPermTenant.client.rpc("anonimizar_pessoa", {
      p_pessoa_id: pessoa.id, p_motivo: null,
    });
    check("usuário sem pessoas.manage não anonimiza", !!semPermError);

    const { error: crossTenantError } = await otherTenant.client.rpc("anonimizar_pessoa", {
      p_pessoa_id: pessoa.id, p_motivo: null,
    });
    check("tenant B não anonimiza pessoa do tenant A", !!crossTenantError);

    const { data: intacta } = await admin.from("pessoas").select("nome, anonymized_at").eq("id", pessoa.id).single();
    check("pessoa continua intacta após tentativas recusadas", intacta.nome === "Cliente Teste Permissão" && intacta.anonymized_at === null);
  }

  console.log("\n2. Anonimização bem-sucedida (ADMIN, pessoas.manage)");
  {
    const pessoa = await criarPessoa(admTenant.company.id, "Cliente Teste Sucesso");
    await admin.from("pessoa_papeis").insert({ pessoa_id: pessoa.id, papel: "CLIENTE", ativo: true });

    const { error } = await admTenant.client.rpc("anonimizar_pessoa", {
      p_pessoa_id: pessoa.id, p_motivo: "Pedido do titular por e-mail",
    });
    check("ADMIN anonimiza pessoa da própria empresa", !error);

    const { data: anonimizada } = await admin.from("pessoas").select("*").eq("id", pessoa.id).single();
    check("id da pessoa é preservado (não apaga a linha)", anonimizada.id === pessoa.id);
    check("nome vira o placeholder de anonimização", anonimizada.nome === "Titular de dados anonimizado");
    check("documento é limpo", anonimizada.documento === null);
    check("tipo_documento é limpo", anonimizada.tipo_documento === null);
    check("telefone é limpo", anonimizada.telefone === null);
    check("email é limpo", anonimizada.email === null);
    check("endereço é limpo", anonimizada.logradouro === null && anonimizada.cidade === null && anonimizada.uf === null && anonimizada.cep === null);
    check("anonymized_at é preenchido", !!anonimizada.anonymized_at);

    const { data: papelAindaLigado } = await admin.from("pessoa_papeis").select("*").eq("pessoa_id", pessoa.id).eq("papel", "CLIENTE").maybeSingle();
    check("papel CLIENTE continua ligado (histórico/relacionamento preservado)", !!papelAindaLigado);

    const log = await ultimoLog(admTenant.company.id, "lgpd.pessoa_anonimizada", pessoa.id);
    check("lgpd.pessoa_anonimizada registrado em activity_logs", !!log);
    check("motivo do pedido fica registrado no log", log?.description === "Pedido do titular por e-mail");

    const { error: repetirError } = await admTenant.client.rpc("anonimizar_pessoa", {
      p_pessoa_id: pessoa.id, p_motivo: null,
    });
    check("não permite anonimizar a mesma pessoa duas vezes", !!repetirError);
  }

  console.log("\n3. Pessoa inexistente / de outra empresa");
  {
    const { error } = await admTenant.client.rpc("anonimizar_pessoa", {
      p_pessoa_id: "00000000-0000-0000-0000-000000000000", p_motivo: null,
    });
    check("pessoa inexistente é recusada", !!error);
  }

  console.log("\n4. Cópias do titular em obras, propostas e dados bancários (achado 8)");
  {
    const c = admTenant.client;
    const num = (d, pf) => c.rpc("upsert_numbering_sequence", { p_document_type: d, p_prefixo: pf, p_sufixo: "", p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca" });
    await num("orcamento", "ORC-");
    await num("proposta", "PROP-");
    const sufixo = Date.now().toString().slice(-9);
    const NOME = `Maria Cópia ${sufixo}`;
    // CPF válido e único por execução (a suíte pode rodar duas vezes sem db reset).
    const cpfValido = (seed) => {
      const d = String(seed).padStart(9, "0").slice(-9).split("").map(Number);
      const dv = (arr) => { const r = (arr.reduce((a, n, i) => a + n * (arr.length + 1 - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
      d.push(dv(d)); d.push(dv(d));
      return d.join("");
    };
    const CPF_TITULAR = cpfValido(sufixo);
    const CPF_OUTRO = cpfValido(Number(sufixo) + 1);
    const mkPessoa = async (nome, cpf) => {
      const { data, error } = await c.rpc("upsert_pessoa", { p_id: null, p_tipo_documento: "CPF", p_documento: cpf, p_nome: nome, p_nome_fantasia: null, p_telefone: "11999990000", p_email: `${sufixo}@exemplo.com`, p_logradouro: "Rua das Flores 100", p_cidade: "São Paulo", p_uf: "SP", p_cep: "01000-000", p_situacao: "ativo" });
      if (error) throw error;
      return data;
    };
    const pid = await mkPessoa(NOME, CPF_TITULAR);
    const outro = await mkPessoa(`Outro Titular ${sufixo}`, CPF_OUTRO);
    for (const id of [pid, outro]) {
      await c.rpc("set_pessoa_papel", { p_pessoa_id: id, p_papel: "CLIENTE", p_ativo: true });
      await c.rpc("set_pessoa_papel", { p_pessoa_id: id, p_papel: "FORNECEDOR", p_ativo: true });
    }
    const mkObra = async (id, nome) => (await c.rpc("upsert_obra", { p_id: null, p_pessoa_id: id, p_nome: nome, p_logradouro: "Rua das Flores 100", p_cidade: "São Paulo", p_uf: "SP", p_cep: "01000-000", p_situacao: "ativo" })).data;
    const obraId = await mkObra(pid, `Casa da ${NOME}`);
    const obraOutro = await mkObra(outro, `Obra do outro ${sufixo}`);
    const { data: itemId } = await c.rpc("upsert_item", { p_id: null, p_codigo: `VD-${sufixo}`, p_descricao: "Vidro", p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2", p_situacao: "ativo" });
    const mkProposta = async (id, obra, dest) => {
      const { data: orc } = await c.rpc("upsert_orcamento", { p_id: null, p_pessoa_id: id, p_obra_id: obra, p_validade: null, p_condicao_comercial: null, p_observacoes: null });
      await c.rpc("upsert_orcamento_item", { p_id: null, p_orcamento_id: orc, p_item_id: itemId, p_quantidade: 1, p_preco_unitario: 100, p_custo_unitario: 50 });
      await c.rpc("decidir_orcamento", { p_id: orc, p_decisao: "aprovado" });
      const { data: prop } = await c.rpc("gerar_proposta", { p_orcamento_id: orc, p_validade: "2027-01-31" });
      await c.rpc("marcar_proposta_enviada", { p_id: prop, p_canal: "email", p_destinatario: dest });
      return prop;
    };
    const propId = await mkProposta(pid, obraId, `${sufixo}@exemplo.com`);
    const propOutro = await mkProposta(outro, obraOutro, `outro.${sufixo}@exemplo.com`);
    const mkForn = async (id) => (await c.rpc("upsert_fornecedor_dados", { p_pessoa_id: id, p_prazo_pagamento_dias: 30, p_lead_time_dias: 7, p_banco: "Banco Sigiloso", p_agencia: "0001", p_conta: "12345-6", p_tipo_conta: "corrente", p_chave_pix: CPF_TITULAR, p_condicoes_padrao: null, p_homologado: true })).error;
    check("fixture: dados de fornecedor criados", !(await mkForn(pid)) && !(await mkForn(outro)));

    const { data: antes } = await admin.from("propostas").select("destinatario").eq("id", propId).single();
    check("fixture: proposta tem destinatário antes de anonimizar", !!antes?.destinatario);

    const { error } = await c.rpc("anonimizar_pessoa", { p_pessoa_id: pid, p_motivo: "Pedido do titular" });
    check("anonimização do titular com cópias executa sem erro", !error);

    const { data: obra } = await admin.from("obras").select("*").eq("id", obraId).single();
    check("obra: nome não identifica mais o titular", obra.nome === "Obra de titular anonimizado");
    check("obra: endereço limpo", obra.logradouro === null && obra.cidade === null && obra.uf === null && obra.cep === null);
    check("obra: vínculo com a pessoa preservado", obra.pessoa_id === pid);

    const { data: prop } = await admin.from("propostas").select("*").eq("id", propId).single();
    check("proposta: destinatário limpo", prop.destinatario === null);
    check("proposta: registro e canal de envio preservados", prop.canal === "email");
    const snap = JSON.stringify(prop.snapshot ?? {});
    check("proposta: snapshot não carrega nome, CPF nem endereço do titular", !snap.includes(NOME) && !snap.includes(CPF_TITULAR) && !snap.includes("Rua das Flores"));

    const { data: fd } = await admin.from("fornecedor_dados").select("*").eq("pessoa_id", pid).single();
    check("fornecedor_dados: banco, agência, conta, tipo e PIX limpos", fd.banco === null && fd.agencia === null && fd.conta === null && fd.tipo_conta === null && fd.chave_pix === null);
    check("fornecedor_dados: prazo e homologação preservados", fd.prazo_pagamento_dias === 30 && fd.homologado === true);

    const { data: obraO } = await admin.from("obras").select("nome,logradouro").eq("id", obraOutro).single();
    const { data: propO } = await admin.from("propostas").select("destinatario").eq("id", propOutro).single();
    const { data: fdO } = await admin.from("fornecedor_dados").select("banco,chave_pix").eq("pessoa_id", outro).single();
    check("outro titular da mesma empresa NÃO é afetado", obraO.logradouro === "Rua das Flores 100" && propO.destinatario === `outro.${sufixo}@exemplo.com` && fdO.banco === "Banco Sigiloso" && fdO.chave_pix === CPF_TITULAR);

    const log = await ultimoLog(admTenant.company.id, "lgpd.pessoa_anonimizada", pid);
    check("log registra as contagens do que foi limpo", log?.metadata?.obras_anonimizadas === 1 && log?.metadata?.propostas_sem_destinatario === 1 && log?.metadata?.fornecedor_dados_limpos === 1);
    check("log não carrega o conteúdo removido", !JSON.stringify(log ?? {}).includes(NOME) && !JSON.stringify(log ?? {}).includes(CPF_TITULAR));
  }

  console.log("\n5. Logs NOVOS não gravam dado pessoal (achado 9)");
  {
    const c = admTenant.client;
    const u = Date.now().toString().slice(-9);
    const NOME = `Nome Sigiloso ${u}`;
    const EMAIL = `sigiloso.${u}@exemplo.com`;
    const TEL = `1198${u.slice(-7)}`;
    const cpf = (() => {
      const d = u.split("").map(Number);
      const dv = (a) => { const r = (a.reduce((x, n, i) => x + n * (a.length + 1 - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
      d.push(dv(d)); d.push(dv(d));
      return d.join("");
    })();
    const logsDe = async (entityId) => {
      const { data } = await admin.from("activity_logs").select("action,description,metadata").eq("company_id", admTenant.company.id).eq("entity_id", entityId);
      return data ?? [];
    };
    const vaza = (logs, ...segredos) => segredos.some((x) => JSON.stringify(logs).includes(x));

    const { data: pid } = await c.rpc("upsert_pessoa", { p_id: null, p_tipo_documento: "CPF", p_documento: cpf, p_nome: NOME, p_nome_fantasia: null, p_telefone: TEL, p_email: EMAIL, p_logradouro: "Rua Sigilosa 1", p_cidade: "São Paulo", p_uf: "SP", p_cep: "01000-000", p_situacao: "ativo" });
    await c.rpc("upsert_pessoa", { p_id: pid, p_tipo_documento: "CPF", p_documento: cpf, p_nome: `${NOME} Editado`, p_nome_fantasia: null, p_telefone: TEL, p_email: EMAIL, p_logradouro: "Rua Sigilosa 1", p_cidade: "São Paulo", p_uf: "SP", p_cep: "01000-000", p_situacao: "ativo" });
    const lp = await logsDe(pid);
    check("upsert_pessoa (criar e editar) gravou log", lp.length >= 2);
    check("log de pessoa não contém nome, CPF, e-mail nem telefone", !vaza(lp, NOME, cpf, EMAIL, TEL));
    check("log de pessoa ainda diz QUAIS campos mudaram (rastro útil)", lp.some((l) => Array.isArray(l.metadata?.changed) && l.metadata.changed.includes("nome")));

    await c.rpc("set_pessoa_papel", { p_pessoa_id: pid, p_papel: "CLIENTE", p_ativo: true });
    const { data: obraId } = await c.rpc("upsert_obra", { p_id: null, p_pessoa_id: pid, p_nome: `Casa ${NOME}`, p_logradouro: "Rua Sigilosa 1", p_cidade: "São Paulo", p_uf: "SP", p_cep: "01000-000", p_situacao: "ativo" });
    const lo = await logsDe(obraId);
    check("log de obra gravado e sem o nome da obra (que identifica o cliente)", lo.length >= 1 && !vaza(lo, NOME, "Rua Sigilosa"));

    const { data: fid, error: fErr } = await c.rpc("upsert_funcionario", { p_id: null, p_nome: `Func ${NOME}`, p_telefone: TEL, p_email: EMAIL, p_status: "ativo" });
    await c.rpc("upsert_funcionario", { p_id: fid, p_nome: `Func ${NOME}`, p_telefone: TEL, p_email: EMAIL, p_status: "afastado" });
    const lf = await logsDe(fid);
    check("upsert_funcionario gravou log (admissão e atualização)", !fErr && lf.length >= 2);
    check("log de funcionário não contém nome, e-mail nem telefone (nem a ficha em before)", !vaza(lf, NOME, EMAIL, TEL));
    check("log de funcionário mantém o status anterior/novo", lf.some((l) => l.metadata?.status_anterior === "ativo" && l.metadata?.status === "afastado"));

    const { data: authUser } = await admin.auth.admin.createUser({ email: `lgpd9-${u}@users.internal`, password: "senha-de-teste-123456", email_confirm: true });
    const { error: pErr } = await c.rpc("criar_perfil_usuario", { p_auth_user_id: authUser.user.id, p_login_identifier: `l9${u}`, p_display_name: `Usuario ${NOME}`, p_contact_email: EMAIL });
    const lu = await logsDe(authUser.user.id);
    check("criar_perfil_usuario gravou log sem o nome do usuário", !pErr && lu.length >= 1 && !vaza(lu, NOME, EMAIL));

    // e-mail do destinatário da proposta
    const num = (d, pf) => c.rpc("upsert_numbering_sequence", { p_document_type: d, p_prefixo: pf, p_sufixo: "", p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca" });
    await num("orcamento", "ORC-"); await num("proposta", "PROP-");
    const { data: itemId } = await c.rpc("upsert_item", { p_id: null, p_codigo: `VL-${u}`, p_descricao: "Vidro", p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2", p_situacao: "ativo" });
    const { data: orc } = await c.rpc("upsert_orcamento", { p_id: null, p_pessoa_id: pid, p_obra_id: obraId, p_validade: null, p_condicao_comercial: null, p_observacoes: null });
    await c.rpc("upsert_orcamento_item", { p_id: null, p_orcamento_id: orc, p_item_id: itemId, p_quantidade: 1, p_preco_unitario: 100, p_custo_unitario: 50 });
    await c.rpc("decidir_orcamento", { p_id: orc, p_decisao: "aprovado" });
    const { data: prop } = await c.rpc("gerar_proposta", { p_orcamento_id: orc, p_validade: "2027-01-31" });
    await c.rpc("marcar_proposta_enviada", { p_id: prop, p_canal: "email", p_destinatario: EMAIL });
    const lpr = (await logsDe(prop)).filter((l) => l.action === "comercial.proposta_enviada");
    check("proposta enviada gravou log, com o canal e SEM o e-mail do destinatário", lpr.length === 1 && lpr[0].metadata?.canal === "email" && !vaza(lpr, EMAIL));
    const { data: propRow } = await admin.from("propostas").select("destinatario").eq("id", prop).single();
    check("o destinatário continua na proposta (anonimizável), só saiu do log", propRow.destinatario === EMAIL);

    // importação: log só com contagem
    const { error: iErr } = await c.rpc("importar_pessoas", { p_linhas: [{ tipo_documento: "CNPJ", documento: `99${u}0001`.slice(0, 14).padEnd(14, "1"), nome: `Importado ${NOME}` }], p_dry_run: false });
    const { data: logsImp } = await admin.from("activity_logs").select("description,metadata").eq("company_id", admTenant.company.id).eq("action", "cadastros.pessoas_importadas").order("created_at", { ascending: false }).limit(1);
    check("importar_pessoas gravou log sem nome nem documento por linha", !iErr && logsImp?.length === 1 && !vaza(logsImp, NOME) && logsImp[0].metadata?.resultados === undefined);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
