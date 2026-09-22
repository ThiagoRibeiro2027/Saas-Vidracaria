// Testes automatizados do TÓPICO 17 — RH: cadastro de funcionários,
// vínculo com usuário, desligamento com revogação de acesso (recorte
// mínimo, 20260916050000) e, a partir daqui, certificações/treinamentos,
// EPI, habilitações e afastamentos/férias (recorte completo,
// 20261004000000_topico17_rh_completo.sql). Sem folha/encargos/rescisão/
// escala/ponto (§8, fora de escopo do módulo).
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

  console.log("\n18. Massa de dados p/ recorte completo — funcionário ativo e recurso produtivo");
  let funcionarioAtivoId;
  let recursoId;
  {
    const { data } = await admTenant.client.rpc("upsert_funcionario", { p_id: null, p_nome: "Funcionário Ativo Teste" });
    funcionarioAtivoId = data;
    check("funcionário ativo criado", !!funcionarioAtivoId);

    const { data: recurso } = await admin
      .from("recursos_produtivos")
      .insert({ company_id: admTenant.company.id, codigo: "FORNO-TEMPLE-01", nome: "Forno de têmpera", tipo: "maquina" })
      .select("id")
      .single();
    recursoId = recurso?.id;
    check("recurso produtivo (máquina) criado", !!recursoId);

    const { data: recursoNaoEquip } = await admin
      .from("recursos_produtivos")
      .insert({ company_id: admTenant.company.id, codigo: "EQUIPE-01", nome: "Equipe de corte", tipo: "equipe" })
      .select("id")
      .single();
    var recursoEquipeId = recursoNaoEquip?.id;
  }

  console.log("\n19. funcionario_certificacoes — permissão, validação e ciclo completo");
  let certificacaoId;
  {
    const { error: e1 } = await noPermTenant.client.rpc("upsert_funcionario_certificacao", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_tipo: "treinamento_seguranca",
      p_nome: "NR-12", p_data_conclusao: "2027-01-01",
    });
    check("sem rh.manage não registra certificação", !!e1);

    const { error: e2 } = await admTenant.client.rpc("upsert_funcionario_certificacao", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_tipo: "invalido",
      p_nome: "X", p_data_conclusao: "2027-01-01",
    });
    check("tipo inválido é rejeitado", !!e2);

    const { error: e3 } = await admTenant.client.rpc("upsert_funcionario_certificacao", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_tipo: "certificacao",
      p_nome: "X", p_data_conclusao: "2027-01-10", p_data_validade: "2027-01-01",
    });
    check("data_validade anterior à data_conclusao é rejeitada", !!e3);

    const { data, error } = await admTenant.client.rpc("upsert_funcionario_certificacao", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_tipo: "treinamento_seguranca",
      p_nome: "NR-12 — Segurança em máquinas", p_data_conclusao: "2027-01-01", p_data_validade: "2029-01-01",
    });
    check("cria certificação/treinamento com sucesso", !error && !!data);
    certificacaoId = data;

    const { error: eEdit } = await admTenant.client.rpc("upsert_funcionario_certificacao", {
      p_id: certificacaoId, p_funcionario_id: funcionarioAtivoId, p_tipo: "treinamento_seguranca",
      p_nome: "NR-12 — Segurança em máquinas (revalidado)", p_data_conclusao: "2027-01-01", p_data_validade: "2030-01-01",
    });
    check("edita certificação existente", !eEdit);

    const { error: eDesligado } = await admTenant.client.rpc("upsert_funcionario_certificacao", {
      p_id: null, p_funcionario_id: funcionarioId, p_tipo: "certificacao",
      p_nome: "Não deveria entrar", p_data_conclusao: "2027-01-01",
    });
    check("funcionário desligado não recebe nova certificação", !!eDesligado);
  }

  console.log("\n20. funcionario_epis — validação e ciclo completo");
  let epiId;
  {
    const { error: eSemData } = await admTenant.client.rpc("upsert_funcionario_epi", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_tipo_epi: "Óculos de proteção", p_data_entrega: null,
    });
    check("EPI sem data de entrega é rejeitado", !!eSemData);

    const { data, error } = await admTenant.client.rpc("upsert_funcionario_epi", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_tipo_epi: "Óculos de proteção",
      p_data_entrega: "2027-01-05", p_ca: "12345", p_data_validade: "2028-01-05",
    });
    check("cria EPI com sucesso", !error && !!data);
    epiId = data;

    const { error: eRemove } = await admTenant.client.rpc("remover_funcionario_epi", { p_id: epiId });
    check("remove EPI", !eRemove);
    const { data: apagado } = await admin.from("funcionario_epis").select("id").eq("id", epiId).maybeSingle();
    check("EPI removido não existe mais", !apagado);
  }

  console.log("\n21. funcionario_habilitacoes — recurso precisa ser máquina/equipamento, dono do tenant, sem duplicidade");
  let habilitacaoId;
  {
    const { error: eOutroTenant } = await admTenant.client.rpc("upsert_funcionario_habilitacao", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_recurso_produtivo_id: "00000000-0000-0000-0000-000000000000", p_data_obtencao: "2027-01-01",
    });
    check("recurso inexistente é rejeitado", !!eOutroTenant);

    const { error: eTipoErrado } = await admTenant.client.rpc("upsert_funcionario_habilitacao", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_recurso_produtivo_id: recursoEquipeId, p_data_obtencao: "2027-01-01",
    });
    check("recurso do tipo 'equipe' (não máquina/equipamento) é rejeitado", !!eTipoErrado);

    const { data, error } = await admTenant.client.rpc("upsert_funcionario_habilitacao", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_recurso_produtivo_id: recursoId, p_data_obtencao: "2027-01-01", p_data_validade: "2029-01-01",
    });
    check("cria habilitação para máquina com sucesso", !error && !!data);
    habilitacaoId = data;

    const { error: eDuplicado } = await admTenant.client.rpc("upsert_funcionario_habilitacao", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_recurso_produtivo_id: recursoId, p_data_obtencao: "2027-02-01",
    });
    check("habilitação duplicada (mesmo funcionário+recurso) é rejeitada", !!eDuplicado);
  }

  console.log("\n22. funcionario_afastamentos — tipo, datas e ciclo completo (férias em curso)");
  let afastamentoId;
  {
    const { error: eTipo } = await admTenant.client.rpc("upsert_funcionario_afastamento", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_tipo: "licenca", p_data_inicio: "2027-03-01",
    });
    check("tipo inválido é rejeitado", !!eTipo);

    const { error: eDatas } = await admTenant.client.rpc("upsert_funcionario_afastamento", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_tipo: "afastamento", p_data_inicio: "2027-03-10", p_data_fim: "2027-03-01", p_motivo: "atestado",
    });
    check("data_fim anterior à data_inicio é rejeitada", !!eDatas);

    const { data, error } = await admTenant.client.rpc("upsert_funcionario_afastamento", {
      p_id: null, p_funcionario_id: funcionarioAtivoId, p_tipo: "ferias", p_data_inicio: "2027-03-01",
    });
    check("registra férias em curso (sem data_fim)", !error && !!data);
    afastamentoId = data;

    const { error: eEncerra } = await admTenant.client.rpc("upsert_funcionario_afastamento", {
      p_id: afastamentoId, p_funcionario_id: funcionarioAtivoId, p_tipo: "ferias", p_data_inicio: "2027-03-01", p_data_fim: "2027-03-30",
    });
    check("encerra férias preenchendo data_fim", !eEncerra);
  }

  console.log("\n23. SELECT das 4 tabelas novas exige rh.view (LGPD)");
  {
    for (const table of ["funcionario_certificacoes", "funcionario_epis", "funcionario_habilitacoes", "funcionario_afastamentos"]) {
      const { data } = await noPermTenant.client.from(table).select("id");
      check(`papel sem rh.view não lê ${table}`, (data ?? []).length === 0);
    }
  }

  console.log("\n24. Isolamento cross-tenant nas 4 tabelas novas");
  {
    const { data: crossCert } = await otherTenant.client.from("funcionario_certificacoes").select("id").eq("id", certificacaoId);
    check("tenant B não enxerga certificação do tenant A", (crossCert ?? []).length === 0);

    const { error: eCrossHabilitacao } = await otherTenant.client.rpc("remover_funcionario_habilitacao", { p_id: habilitacaoId });
    check("tenant B não remove habilitação do tenant A", !!eCrossHabilitacao);

    const { data: aindaLa } = await admin.from("funcionario_habilitacoes").select("id").eq("id", habilitacaoId).maybeSingle();
    check("habilitação do tenant A continua existindo", !!aindaLa);
  }

  console.log("\n25. Cada ação nova grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "rh.certificacao_registrada", "rh.certificacao_atualizada",
        "rh.epi_registrado", "rh.epi_removido",
        "rh.habilitacao_registrada",
        "rh.afastamento_registrado", "rh.afastamento_atualizado",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of [
      "rh.certificacao_registrada", "rh.certificacao_atualizada",
      "rh.epi_registrado", "rh.epi_removido",
      "rh.habilitacao_registrada",
      "rh.afastamento_registrado", "rh.afastamento_atualizado",
    ]) {
      check(`${action} registrado`, actions.has(action));
    }
  }

  console.log("\n26. remover_funcionario_certificacao() exige rh.manage e remove de fato");
  {
    const { error: eSemPerm } = await noPermTenant.client.rpc("remover_funcionario_certificacao", { p_id: certificacaoId });
    check("sem rh.manage não remove certificação", !!eSemPerm);

    const { error } = await admTenant.client.rpc("remover_funcionario_certificacao", { p_id: certificacaoId });
    check("remove certificação", !error);
    const { data: apagada } = await admin.from("funcionario_certificacoes").select("id").eq("id", certificacaoId).maybeSingle();
    check("certificação removida não existe mais", !apagada);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
