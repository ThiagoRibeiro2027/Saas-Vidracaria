// Testes automatizados do TÓPICO 17 — RH, recorte mínimo do MVP: cadastro
// de funcionários, vínculo com usuário, desligamento com revogação de
// acesso. Sem folha/encargos/rescisão/escala/ponto, sem documentos/EPI/
// habilitações/afastamentos com data.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-rh.mjs

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

async function createTenant(slug, name, identifier, roleKey = "ADMIN", existingCompany = null) {
  let company = existingCompany;
  if (!company) {
    const { data } = await admin
      .from("companies")
      .upsert({ slug, name }, { onConflict: "slug" })
      .select()
      .single();
    company = data;
  }

  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";

  const { data: created } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
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

  return { client, company, userId };
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão de rh, outro tenant)...");
  const admTenant = await createTenant("rh-test-admin", "RH Admin Teste", "17r01", "ADMIN");
  // QUALIDADE administra Qualidade, não RH — prova a autoridade separada
  // (e, diferente dos outros módulos, nem SELECT esse papel deveria ler).
  const noPermTenant = await createTenant("rh-test-admin", "RH SemPerm Teste", "17r02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant("rh-test-other", "RH Outro Teste", "17r03", "ADMIN");

  console.log("\n0. Massa de dados — unidade e um segundo usuário pra vincular");
  const { data: unidadeId } = await admin.from("company_units").insert({ company_id: admTenant.company.id, name: "Fábrica 1" }).select("id").single().then((r) => ({ data: r.data?.id }));
  check("unidade criada", !!unidadeId);
  const outroUsuario = await createTenant("rh-test-admin", "Vínculo Teste", "17r04", "PRODUCAO", admTenant.company);

  console.log("\n1. upsert_funcionario() exige rh.manage");
  {
    const { error } = await noPermTenant.client.rpc("upsert_funcionario", { p_id: null, p_nome: "Fulano" });
    check("sem rh.manage (papel QUALIDADE) não cria funcionário", !!error);
  }

  console.log("\n2. upsert_funcionario() rejeita nome vazio");
  {
    const { error } = await admTenant.client.rpc("upsert_funcionario", { p_id: null, p_nome: "" });
    check("nome vazio é rejeitado", !!error);
  }

  console.log("\n3. upsert_funcionario() rejeita status 'desligado' direto");
  {
    const { error } = await admTenant.client.rpc("upsert_funcionario", { p_id: null, p_nome: "Teste Status", p_status: "desligado" });
    check("status 'desligado' via upsert é rejeitado (só via desligar_funcionario)", !!error);
  }

  console.log("\n4. upsert_funcionario() rejeita unidade de outra empresa/inexistente");
  {
    const { error } = await admTenant.client.rpc("upsert_funcionario", { p_id: null, p_nome: "Teste Unidade", p_unidade_id: "00000000-0000-0000-0000-000000000000" });
    check("unidade inexistente é rejeitada", !!error);
  }

  console.log("\n5. upsert_funcionario() rejeita profile_id de outra empresa/inexistente");
  {
    const { error: e1 } = await admTenant.client.rpc("upsert_funcionario", { p_id: null, p_nome: "Teste Profile", p_profile_id: otherTenant.userId });
    check("profile_id de outro tenant é rejeitado", !!e1);

    const { error: e2 } = await admTenant.client.rpc("upsert_funcionario", { p_id: null, p_nome: "Teste Profile 2", p_profile_id: "00000000-0000-0000-0000-000000000000" });
    check("profile_id inexistente é rejeitado", !!e2);
  }

  console.log("\n6. upsert_funcionario() sucesso — criação");
  let funcionarioId;
  {
    const { data, error } = await admTenant.client.rpc("upsert_funcionario", {
      p_id: null, p_nome: "Ciclano da Silva", p_cargo: "Operador", p_funcao: "Corte de vidro",
      p_unidade_id: unidadeId, p_data_admissao: "2027-01-10", p_telefone: "11999990000", p_email: null,
      p_profile_id: null, p_status: "ativo", p_observacoes: null,
    });
    check("ADMIN cria funcionário", !error && !!data);
    funcionarioId = data;

    const { data: func } = await admin.from("funcionarios").select("*").eq("id", funcionarioId).single();
    check("funcionário nasce 'ativo' com os dados corretos", func?.status === "ativo" && func?.nome === "Ciclano da Silva" && func?.cargo === "Operador");
  }

  console.log("\n7. upsert_funcionario() sucesso — edição");
  {
    const { data, error } = await admTenant.client.rpc("upsert_funcionario", {
      p_id: funcionarioId, p_nome: "Ciclano da Silva Jr.", p_cargo: "Operador Sênior", p_funcao: "Corte de vidro",
      p_unidade_id: unidadeId, p_data_admissao: "2027-01-10", p_telefone: "11999990000", p_email: null,
      p_profile_id: outroUsuario.userId, p_status: "afastado", p_observacoes: "editado no teste",
    });
    check("edição aceita e vincula usuário", !error && data === funcionarioId);
    const { data: func } = await admin.from("funcionarios").select("*").eq("id", funcionarioId).single();
    check("campos atualizados (nome, cargo, status, profile_id)", func?.nome === "Ciclano da Silva Jr." && func?.status === "afastado" && func?.profile_id === outroUsuario.userId);
  }

  console.log("\n8. upsert_funcionario() rejeita profile_id já vinculado a outro funcionário");
  {
    const { error } = await admTenant.client.rpc("upsert_funcionario", { p_id: null, p_nome: "Segundo Funcionário", p_profile_id: outroUsuario.userId });
    check("mesmo profile_id em dois funcionários é rejeitado (índice único parcial)", !!error);
  }

  console.log("\n9. desligar_funcionario() exige rh.manage");
  {
    const { error } = await noPermTenant.client.rpc("desligar_funcionario", { p_id: funcionarioId, p_motivo: "teste" });
    check("sem rh.manage não desliga funcionário", !!error);
  }

  console.log("\n10. desligar_funcionario() sucesso sem profile_id vinculado — não mexe em profiles");
  {
    const { data: semVinculoId } = await admTenant.client.rpc("upsert_funcionario", { p_id: null, p_nome: "Sem Vínculo" });
    const { error } = await admTenant.client.rpc("desligar_funcionario", { p_id: semVinculoId, p_data_desligamento: "2027-02-01", p_motivo: "fim de contrato" });
    check("desliga funcionário sem usuário vinculado", !error);
    const { data: func } = await admin.from("funcionarios").select("status, data_desligamento, motivo_desligamento").eq("id", semVinculoId).single();
    check("status 'desligado' com data e motivo salvos", func?.status === "desligado" && func?.data_desligamento === "2027-02-01" && func?.motivo_desligamento === "fim de contrato");
  }

  console.log("\n11. desligar_funcionario() COM profile_id vinculado — revoga o acesso (profiles.active=false)");
  {
    const { data: profileAntes } = await admin.from("profiles").select("active").eq("id", outroUsuario.userId).single();
    check("pré-condição: usuário vinculado está ativo", profileAntes?.active === true);

    const { error } = await admTenant.client.rpc("desligar_funcionario", { p_id: funcionarioId, p_motivo: "desligamento com vínculo" });
    check("desliga funcionário com usuário vinculado", !error);

    const { data: func } = await admin.from("funcionarios").select("status").eq("id", funcionarioId).single();
    check("funcionário fica 'desligado'", func?.status === "desligado");

    const { data: profileDepois } = await admin.from("profiles").select("active").eq("id", outroUsuario.userId).single();
    check("profiles.active vira false na mesma operação (T17 §4)", profileDepois?.active === false);
  }

  console.log("\n12. desligar_funcionario() rejeita funcionário já desligado");
  {
    const { error } = await admTenant.client.rpc("desligar_funcionario", { p_id: funcionarioId, p_motivo: "de novo" });
    check("desligar funcionário já desligado é rejeitado", !!error);
  }

  console.log("\n13. upsert_funcionario() rejeita editar funcionário desligado");
  {
    const { error } = await admTenant.client.rpc("upsert_funcionario", { p_id: funcionarioId, p_nome: "Tentando editar" });
    check("editar funcionário desligado é rejeitado", !!error);
  }

  console.log("\n14. SELECT em funcionarios exige rh.view — diferente de todo módulo anterior (LGPD, T17 §9)");
  {
    const { data, error } = await noPermTenant.client.from("funcionarios").select("id");
    check("papel QUALIDADE (sem rh.view) não lê funcionarios da própria empresa", !error && (data ?? []).length === 0);
  }

  console.log("\n15. SELECT funciona para quem tem rh.view (ADMIN, via rh.manage cross-check indireto)");
  {
    const { data, error } = await admTenant.client.from("funcionarios").select("id").eq("id", funcionarioId);
    check("ADMIN (com rh.view) lê funcionarios da própria empresa", !error && (data ?? []).length === 1);
  }

  console.log("\n16. Isolamento entre tenants");
  {
    const { data: crossFunc } = await otherTenant.client.from("funcionarios").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga funcionários do tenant A", (crossFunc ?? []).length === 0);

    const { error } = await otherTenant.client.rpc("desligar_funcionario", { p_id: funcionarioId, p_motivo: "cross-tenant" });
    check("tenant B não consegue desligar funcionário do tenant A", !!error);
  }

  console.log("\n17. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", ["rh.funcionario_admitido", "rh.funcionario_atualizado", "rh.funcionario_desligado"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of ["rh.funcionario_admitido", "rh.funcionario_atualizado", "rh.funcionario_desligado"]) {
      check(`${action} registrado`, actions.has(action));
    }
  }

  console.log("\n18. Massa de dados — funcionário ativo pra testar documentos/afastamentos (§6-7)");
  const { data: funcionarioAtivoId } = await admTenant.client.rpc("upsert_funcionario", { p_id: null, p_nome: "Funcionário Ativo Teste" });
  check("funcionário ativo criado", !!funcionarioAtivoId);

  console.log("\n19. registrar_documento_funcionario() — permissão, validação, sucesso");
  let documentoId;
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("registrar_documento_funcionario", {
      p_funcionario_id: funcionarioAtivoId, p_tipo: "epi", p_nome: "Óculos de proteção",
    });
    check("sem rh.manage não registra documento", !!eNoPerm);

    const { error: eTipo } = await admTenant.client.rpc("registrar_documento_funcionario", {
      p_funcionario_id: funcionarioAtivoId, p_tipo: "invalido", p_nome: "x",
    });
    check("tipo inválido é rejeitado", !!eTipo);

    const { error: eNome } = await admTenant.client.rpc("registrar_documento_funcionario", {
      p_funcionario_id: funcionarioAtivoId, p_tipo: "epi", p_nome: "",
    });
    check("nome vazio é rejeitado", !!eNome);

    const { error: eValidade } = await admTenant.client.rpc("registrar_documento_funcionario", {
      p_funcionario_id: funcionarioAtivoId, p_tipo: "epi", p_nome: "Luvas", p_data_referencia: "2027-06-01", p_validade: "2027-01-01",
    });
    check("validade anterior à data de referência é rejeitada", !!eValidade);

    const { error: eOutroFunc } = await admTenant.client.rpc("registrar_documento_funcionario", {
      p_funcionario_id: "00000000-0000-0000-0000-000000000000", p_tipo: "epi", p_nome: "x",
    });
    check("funcionário inexistente é rejeitado", !!eOutroFunc);

    const { error: eDesligado } = await admTenant.client.rpc("registrar_documento_funcionario", {
      p_funcionario_id: funcionarioId, p_tipo: "epi", p_nome: "x",
    });
    check("registrar documento para funcionário desligado é rejeitado", !!eDesligado);

    const { data, error } = await admTenant.client.rpc("registrar_documento_funcionario", {
      p_funcionario_id: funcionarioAtivoId, p_tipo: "epi", p_nome: "Óculos de proteção",
      p_data_referencia: "2027-01-10", p_validade: "2027-07-10", p_observacoes: "entregue no almoxarifado",
    });
    check("ADMIN registra documento (EPI)", !error && !!data);
    documentoId = data;

    const { data: row } = await admin.from("funcionario_documentos").select("*").eq("id", documentoId).single();
    check("nasce 'ativo' com os dados corretos", row?.status === "ativo" && row?.tipo === "epi" && row?.nome === "Óculos de proteção");
  }

  console.log("\n20. cancelar_documento_funcionario() — permissão, sucesso, rejeita cancelar de novo");
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("cancelar_documento_funcionario", { p_id: documentoId });
    check("sem rh.manage não cancela documento", !!eNoPerm);

    const { error } = await admTenant.client.rpc("cancelar_documento_funcionario", { p_id: documentoId, p_motivo: "registrado errado" });
    check("ADMIN cancela documento", !error);
    const { data: row } = await admin.from("funcionario_documentos").select("status, motivo_cancelamento").eq("id", documentoId).single();
    check("status vira cancelado com motivo salvo", row?.status === "cancelado" && row?.motivo_cancelamento === "registrado errado");

    const { error: eDeNovo } = await admTenant.client.rpc("cancelar_documento_funcionario", { p_id: documentoId });
    check("cancelar documento já cancelado é rejeitado", !!eDeNovo);
  }

  console.log("\n21. registrar_afastamento() — permissão, validação, sucesso (período em aberto)");
  let afastamentoId;
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("registrar_afastamento", {
      p_funcionario_id: funcionarioAtivoId, p_tipo: "afastamento", p_data_inicio: "2027-03-01",
    });
    check("sem rh.manage não registra afastamento", !!eNoPerm);

    const { error: eTipo } = await admTenant.client.rpc("registrar_afastamento", {
      p_funcionario_id: funcionarioAtivoId, p_tipo: "invalido", p_data_inicio: "2027-03-01",
    });
    check("tipo inválido é rejeitado", !!eTipo);

    const { error: eDatas } = await admTenant.client.rpc("registrar_afastamento", {
      p_funcionario_id: funcionarioAtivoId, p_tipo: "ferias", p_data_inicio: "2027-03-10", p_data_fim: "2027-03-01",
    });
    check("data_fim anterior à data_inicio é rejeitada", !!eDatas);

    const { error: eDesligado } = await admTenant.client.rpc("registrar_afastamento", {
      p_funcionario_id: funcionarioId, p_tipo: "afastamento", p_data_inicio: "2027-03-01",
    });
    check("registrar período para funcionário desligado é rejeitado", !!eDesligado);

    const { data, error } = await admTenant.client.rpc("registrar_afastamento", {
      p_funcionario_id: funcionarioAtivoId, p_tipo: "afastamento", p_data_inicio: "2027-03-01", p_motivo: "atestado médico",
    });
    check("ADMIN registra afastamento em aberto", !error && !!data);
    afastamentoId = data;

    const { data: row } = await admin.from("funcionario_afastamentos").select("*").eq("id", afastamentoId).single();
    check("nasce 'ativo', sem data_fim (em aberto)", row?.status === "ativo" && row?.data_fim === null && row?.tipo === "afastamento");
  }

  console.log("\n22. encerrar_afastamento() — permissão, sucesso, rejeita encerrar de novo");
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("encerrar_afastamento", { p_id: afastamentoId, p_data_fim: "2027-03-15" });
    check("sem rh.manage não encerra afastamento", !!eNoPerm);

    const { error: eDataInvalida } = await admTenant.client.rpc("encerrar_afastamento", { p_id: afastamentoId, p_data_fim: "2027-02-01" });
    check("encerrar com data_fim anterior à data_inicio é rejeitado", !!eDataInvalida);

    const { error } = await admTenant.client.rpc("encerrar_afastamento", { p_id: afastamentoId, p_data_fim: "2027-03-15" });
    check("ADMIN encerra período em aberto", !error);
    const { data: row } = await admin.from("funcionario_afastamentos").select("data_fim").eq("id", afastamentoId).single();
    check("data_fim preenchida", row?.data_fim === "2027-03-15");

    const { error: eDeNovo } = await admTenant.client.rpc("encerrar_afastamento", { p_id: afastamentoId, p_data_fim: "2027-03-20" });
    check("encerrar período que já tem data_fim é rejeitado", !!eDeNovo);
  }

  console.log("\n23. cancelar_afastamento() — permissão e sucesso");
  {
    const { data: feriasId } = await admTenant.client.rpc("registrar_afastamento", {
      p_funcionario_id: funcionarioAtivoId, p_tipo: "ferias", p_data_inicio: "2027-05-01", p_data_fim: "2027-05-20",
    });

    const { error: eNoPerm } = await noPermTenant.client.rpc("cancelar_afastamento", { p_id: feriasId });
    check("sem rh.manage não cancela afastamento", !!eNoPerm);

    const { error } = await admTenant.client.rpc("cancelar_afastamento", { p_id: feriasId, p_motivo: "cadastrado em duplicidade" });
    check("ADMIN cancela período", !error);
    const { data: row } = await admin.from("funcionario_afastamentos").select("status, motivo_cancelamento").eq("id", feriasId).single();
    check("status vira cancelado com motivo salvo", row?.status === "cancelado" && row?.motivo_cancelamento === "cadastrado em duplicidade");
  }

  console.log("\n24. SELECT em funcionario_documentos/funcionario_afastamentos exige rh.view + isolamento cross-tenant");
  {
    const { data: dSemPerm } = await noPermTenant.client.from("funcionario_documentos").select("id");
    check("papel QUALIDADE não lê funcionario_documentos", (dSemPerm ?? []).length === 0);

    const { data: aSemPerm } = await noPermTenant.client.from("funcionario_afastamentos").select("id");
    check("papel QUALIDADE não lê funcionario_afastamentos", (aSemPerm ?? []).length === 0);

    const { data: crossDoc } = await otherTenant.client.from("funcionario_documentos").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga documentos do tenant A", (crossDoc ?? []).length === 0);

    const { data: crossAf } = await otherTenant.client.from("funcionario_afastamentos").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga afastamentos do tenant A", (crossAf ?? []).length === 0);

    const { error } = await otherTenant.client.rpc("cancelar_afastamento", { p_id: afastamentoId });
    check("tenant B não consegue cancelar afastamento do tenant A", !!error);
  }

  console.log("\n25. Cada ação de documentos/afastamentos grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "rh.documento_registrado", "rh.documento_cancelado",
        "rh.afastamento_registrado", "rh.afastamento_encerrado", "rh.afastamento_cancelado",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of [
      "rh.documento_registrado", "rh.documento_cancelado",
      "rh.afastamento_registrado", "rh.afastamento_encerrado", "rh.afastamento_cancelado",
    ]) {
      check(`${action} registrado`, actions.has(action));
    }
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
