// Testes automatizados do TÓPICO 18 — Contratos completo (§4-6): ciclo de
// vida completo com alçada de aprovação (rascunho → em_aprovação → vigente
// → suspenso → encerrado, com cancelamento possível antes de vigorar),
// garantia (só cliente) e vínculo financeiro detalhado (contrato → título
// financeiro, só cliente vigente).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-contratos.mjs

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

// Papel dedicado só com contratos.manage (sem contratos.aprovar) — prova
// que a alçada é uma permissão própria, não coberta por manage (mesmo
// padrão de instalacao.aceite/decidir_dano, scripts/test-instalacao.mjs).
async function createSoManageTenant(company, identifier) {
  const { data: soManageRole } = await admin
    .from("roles")
    .insert({ company_id: company.id, key: `CONTRATOS_SO_MANAGE_${identifier}`, name: "Contratos (só manage)" })
    .select()
    .single();
  const { data: manageP } = await admin.from("permissions").select("id").eq("resource", "contratos").eq("action", "manage").single();
  await admin.from("role_permissions").insert({ role_id: soManageRole.id, permission_id: manageP.id });

  const email = `${identifier}.${company.slug}@users.internal`;
  const password = "senha-de-teste-123456";
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }
  await admin.from("profiles").upsert({ id: userId, company_id: company.id, login_identifier: identifier, display_name: "Só Manage" }, { onConflict: "id" });
  await admin.from("user_roles").insert({ profile_id: userId, role_id: soManageRole.id });

  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });
  return { client, company, userId };
}

async function main() {
  const testStartedAt = new Date().toISOString();
  console.log("Preparando tenants (admin, sem-permissão de contratos, só-manage, outro tenant)...");
  const admTenant = await createTenant("contratos-test-admin", "Contratos Admin Teste", "18c01", "ADMIN");
  // QUALIDADE administra Qualidade, não Contratos — prova a autoridade separada.
  const noPermTenant = await createTenant("contratos-test-admin", "Contratos SemPerm Teste", "18c02", "QUALIDADE", admTenant.company);
  const soManageTenant = await createSoManageTenant(admTenant.company, "18c04");
  const otherTenant = await createTenant("contratos-test-other", "Contratos Outro Teste", "18c03", "ADMIN");

  console.log("\n0. Massa de dados: numeração, cliente, fornecedor, obra, pedido, funcionário");
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "contrato", p_prefixo: "CTR-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "titulo_financeiro", p_prefixo: "TIT-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });

  const { data: clienteId } = await admTenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CPF", p_documento: "11122233396", p_nome: "Cliente Contrato Teste",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: clienteId, p_papel: "CLIENTE", p_ativo: true });

  const { data: fornecedorId } = await admTenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CNPJ", p_documento: "11222333000181", p_nome: "Fornecedor Contrato Teste",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: fornecedorId, p_papel: "FORNECEDOR", p_ativo: true });

  const { data: obraId } = await admTenant.client.rpc("upsert_obra", {
    p_id: null, p_pessoa_id: clienteId, p_nome: "Obra Contrato Teste",
    p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });

  const { data: funcionarioId } = await admTenant.client.rpc("upsert_funcionario", {
    p_id: null, p_nome: "Funcionário Contrato Teste",
  });

  console.log("\n1. upsert_contrato() exige contratos.manage");
  {
    const { error } = await noPermTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "teste",
    });
    check("sem contratos.manage (papel QUALIDADE) não cria contrato", !!error);
  }

  console.log("\n2. upsert_contrato() rejeita objeto vazio e tipo inválido");
  {
    const { error: e1 } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "",
    });
    check("objeto vazio é rejeitado", !!e1);

    const { error: e2 } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "invalido", p_pessoa_id: clienteId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "teste",
    });
    check("tipo inválido é rejeitado", !!e2);
  }

  console.log("\n3. upsert_contrato() valida vínculo por tipo (não pode misturar)");
  {
    const { error: e1 } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: null, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "cliente sem pessoa",
    });
    check("tipo cliente sem pessoa_id é rejeitado", !!e1);

    const { error: e2 } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "fornecedor", p_pessoa_id: fornecedorId, p_obra_id: obraId, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "fornecedor com obra",
    });
    check("tipo fornecedor com obra_id é rejeitado", !!e2);

    const { error: e3 } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: fornecedorId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "cliente com pessoa sem papel CLIENTE",
    });
    check("tipo cliente com pessoa só FORNECEDOR é rejeitado", !!e3);

    const { error: e4 } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "funcionario", p_pessoa_id: null, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "funcionario sem funcionario_id",
    });
    check("tipo funcionario sem funcionario_id é rejeitado", !!e4);
  }

  console.log("\n4. upsert_contrato() rejeita data_fim anterior a data_inicio");
  {
    const { error } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "datas invertidas", p_data_inicio: "2027-06-01", p_data_fim: "2027-01-01",
    });
    check("data_fim antes de data_inicio é rejeitado", !!error);
  }

  console.log("\n5. upsert_contrato() valida garantia (§4) — só cliente, datas coerentes");
  {
    const { error: e1 } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "fornecedor", p_pessoa_id: fornecedorId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "fornecedor com garantia", p_garantia_inicio: "2027-01-01", p_garantia_fim: "2027-06-01",
    });
    check("garantia em contrato de fornecedor é rejeitada", !!e1);

    const { error: e2 } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "garantia invertida", p_garantia_inicio: "2027-06-01", p_garantia_fim: "2027-01-01",
    });
    check("garantia_fim antes de garantia_inicio é rejeitado", !!e2);
  }

  console.log("\n6. upsert_contrato() sucesso — criação tipo cliente com obra, garantia, parcelas, reajuste");
  let contratoId;
  {
    const { data, error } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: obraId, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "Venda e instalação de fachada", p_data_inicio: "2027-01-10",
      p_data_fim: "2027-12-31", p_renovacao: "manual", p_valor: 50000, p_forma_pagamento: "50% + 50%",
      p_observacoes: null, p_garantia_inicio: "2027-12-31", p_garantia_fim: "2029-12-31",
      p_parcelas: 2, p_reajuste_previsto: "IGPM anual",
    });
    check("ADMIN cria contrato tipo cliente", !error && !!data);
    contratoId = data;

    const { data: row } = await admin.from("contratos").select("*").eq("id", contratoId).single();
    check(
      "nasce 'rascunho' com número emitido e dados corretos",
      row?.status === "rascunho" && row?.numero?.startsWith("CTR-") && row?.tipo === "cliente" && row?.obra_id === obraId,
    );
    check(
      "garantia/parcelas/reajuste salvos",
      row?.garantia_inicio === "2027-12-31" && row?.garantia_fim === "2029-12-31" && row?.parcelas === 2 && row?.reajuste_previsto === "IGPM anual",
    );
  }

  console.log("\n7. upsert_contrato() sucesso — edição em rascunho");
  {
    const { data, error } = await admTenant.client.rpc("upsert_contrato", {
      p_id: contratoId, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: obraId, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "Venda e instalação de fachada — revisado", p_data_inicio: "2027-01-15",
      p_data_fim: "2027-12-31", p_renovacao: "automatica", p_valor: 52000, p_forma_pagamento: "50% + 50%",
      p_observacoes: "revisado", p_garantia_inicio: "2027-12-31", p_garantia_fim: "2030-12-31",
      p_parcelas: 4, p_reajuste_previsto: "IPCA anual",
    });
    check("edição aceita em rascunho", !error && data === contratoId);
    const { data: row } = await admin.from("contratos").select("objeto, renovacao, valor, garantia_fim, parcelas").eq("id", contratoId).single();
    check(
      "campos atualizados",
      row?.objeto === "Venda e instalação de fachada — revisado" && row?.renovacao === "automatica" && Number(row?.valor) === 52000
        && row?.garantia_fim === "2030-12-31" && row?.parcelas === 4,
    );
  }

  console.log("\n8. upsert_contrato() rejeita mudar o tipo de um contrato existente");
  {
    const { error } = await admTenant.client.rpc("upsert_contrato", {
      p_id: contratoId, p_tipo: "fornecedor", p_pessoa_id: fornecedorId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "tentando mudar tipo",
    });
    check("mudar tipo de contrato existente é rejeitado", !!error);
  }

  console.log("\n9. enviar_contrato_para_aprovacao() exige data_inicio e contratos.manage");
  let contratoSemData;
  {
    const { data } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "fornecedor", p_pessoa_id: fornecedorId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "Fornecimento de vidro",
    });
    contratoSemData = data;

    const { error: e1 } = await admTenant.client.rpc("enviar_contrato_para_aprovacao", { p_id: contratoSemData });
    check("enviar para aprovação sem data_inicio é rejeitado", !!e1);

    const { error: e2 } = await noPermTenant.client.rpc("enviar_contrato_para_aprovacao", { p_id: contratoId });
    check("sem contratos.manage não envia para aprovação", !!e2);

    const { error: e3 } = await admTenant.client.rpc("enviar_contrato_para_aprovacao", { p_id: contratoId });
    check("ADMIN envia contrato com data_inicio para aprovação", !e3);
    const { data: row } = await admin.from("contratos").select("status, enviado_aprovacao_em").eq("id", contratoId).single();
    check("status vira em_aprovacao com enviado_aprovacao_em preenchido", row?.status === "em_aprovacao" && !!row?.enviado_aprovacao_em);
  }

  console.log("\n10. aprovar_contrato() exige a alçada contratos.aprovar (distinta de manage)");
  {
    const { error: e1 } = await soManageTenant.client.rpc("aprovar_contrato", { p_id: contratoId });
    check("contratos.manage sozinho não aprova (sem contratos.aprovar)", !!e1);

    const { error: e2 } = await noPermTenant.client.rpc("aprovar_contrato", { p_id: contratoId });
    check("papel sem nenhuma permissão de contratos não aprova", !!e2);
  }

  console.log("\n11. aprovar_contrato() sucesso — em_aprovação → vigente");
  {
    const { error } = await admTenant.client.rpc("aprovar_contrato", { p_id: contratoId });
    check("ADMIN (com contratos.aprovar) aprova contrato em análise", !error);
    const { data: row } = await admin.from("contratos").select("status, ativado_em").eq("id", contratoId).single();
    check("status vira vigente com ativado_em preenchido", row?.status === "vigente" && !!row?.ativado_em);
  }

  console.log("\n12. upsert_contrato() rejeita editar contrato vigente");
  {
    const { error } = await admTenant.client.rpc("upsert_contrato", {
      p_id: contratoId, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: obraId, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "tentando editar vigente",
    });
    check("editar contrato vigente é rejeitado", !!error);
  }

  console.log("\n13. aprovar_contrato() rejeita contrato que não está em_aprovacao");
  {
    const { error } = await admTenant.client.rpc("aprovar_contrato", { p_id: contratoId });
    check("aprovar contrato já vigente é rejeitado", !!error);
  }

  console.log("\n14. encerrar_contrato() — exige vigente ou suspenso, permissão, e é transição terminal");
  {
    const { error: e1 } = await admTenant.client.rpc("encerrar_contrato", { p_id: contratoSemData });
    check("encerrar contrato em rascunho é rejeitado", !!e1);

    const { error: e2 } = await noPermTenant.client.rpc("encerrar_contrato", { p_id: contratoId, p_motivo: "teste" });
    check("sem contratos.manage não encerra", !!e2);

    const { error: e3 } = await admTenant.client.rpc("encerrar_contrato", { p_id: contratoId, p_motivo: "fim do prazo" });
    check("ADMIN encerra contrato vigente", !e3);
    const { data: row } = await admin.from("contratos").select("status, encerrado_em, motivo_encerramento").eq("id", contratoId).single();
    check("status vira encerrado com encerrado_em e motivo salvos", row?.status === "encerrado" && !!row?.encerrado_em && row?.motivo_encerramento === "fim do prazo");

    const { error: e4 } = await admTenant.client.rpc("encerrar_contrato", { p_id: contratoId });
    check("encerrar contrato já encerrado é rejeitado", !!e4);
  }

  console.log("\n15. suspender_contrato()/retomar_contrato() — ciclo vigente↔suspenso; cancelar_contrato() rejeita vigente");
  let contratoSuspensoId;
  {
    const { data } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "Contrato para suspender", p_data_inicio: "2027-02-01",
    });
    contratoSuspensoId = data;
    await admTenant.client.rpc("enviar_contrato_para_aprovacao", { p_id: contratoSuspensoId });
    await admTenant.client.rpc("aprovar_contrato", { p_id: contratoSuspensoId });

    const { error: eCancelar } = await admTenant.client.rpc("cancelar_contrato", { p_id: contratoSuspensoId });
    check("cancelar contrato vigente é rejeitado (só encerrar)", !!eCancelar);

    const { error: eSemPerm } = await noPermTenant.client.rpc("suspender_contrato", { p_id: contratoSuspensoId });
    check("sem contratos.manage não suspende", !!eSemPerm);

    const { error: eSuspender } = await admTenant.client.rpc("suspender_contrato", { p_id: contratoSuspensoId, p_motivo: "cliente em atraso" });
    check("ADMIN suspende contrato vigente", !eSuspender);
    const { data: rowSuspenso } = await admin.from("contratos").select("status, suspenso_em, motivo_suspensao").eq("id", contratoSuspensoId).single();
    check("status vira suspenso com suspenso_em e motivo salvos", rowSuspenso?.status === "suspenso" && !!rowSuspenso?.suspenso_em && rowSuspenso?.motivo_suspensao === "cliente em atraso");

    const { error: eSuspenderDeNovo } = await admTenant.client.rpc("suspender_contrato", { p_id: contratoSuspensoId });
    check("suspender contrato já suspenso é rejeitado", !!eSuspenderDeNovo);

    const { error: eEncerraDeSuspenso } = await admTenant.client.rpc("encerrar_contrato", { p_id: contratoSuspensoId, p_motivo: "encerrado direto de suspenso" });
    check("encerrar_contrato aceita origem suspenso", !eEncerraDeSuspenso);
  }

  console.log("\n16. reprovar_contrato() — em_aprovação → rascunho");
  let contratoReprovaId;
  {
    const { data } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "Contrato para reprovar", p_data_inicio: "2027-03-01",
    });
    contratoReprovaId = data;
    await admTenant.client.rpc("enviar_contrato_para_aprovacao", { p_id: contratoReprovaId });

    const { error: eSemAlcada } = await soManageTenant.client.rpc("reprovar_contrato", { p_id: contratoReprovaId });
    check("contratos.manage sozinho não reprova (sem contratos.aprovar)", !!eSemAlcada);

    const { error: eReprovar } = await admTenant.client.rpc("reprovar_contrato", { p_id: contratoReprovaId, p_motivo: "faltam dados" });
    check("ADMIN (com contratos.aprovar) reprova contrato em análise", !eReprovar);
    const { data: row } = await admin.from("contratos").select("status, enviado_aprovacao_em").eq("id", contratoReprovaId).single();
    check("status volta a rascunho com enviado_aprovacao_em limpo", row?.status === "rascunho" && row?.enviado_aprovacao_em === null);

    const { error: eEditaDeNovo } = await admTenant.client.rpc("upsert_contrato", {
      p_id: contratoReprovaId, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "Contrato para reprovar — corrigido", p_data_inicio: "2027-03-01",
    });
    check("contrato reprovado volta a ser editável (rascunho)", !eEditaDeNovo);
  }

  console.log("\n17. cancelar_contrato() — rascunho/em_aprovação → cancelado");
  {
    const { error: eSemPerm } = await noPermTenant.client.rpc("cancelar_contrato", { p_id: contratoSemData });
    check("sem contratos.manage não cancela", !!eSemPerm);

    const { error } = await admTenant.client.rpc("cancelar_contrato", { p_id: contratoSemData, p_motivo: "desistência do fornecedor" });
    check("ADMIN cancela contrato em rascunho", !error);
    const { data: row } = await admin.from("contratos").select("status, cancelado_em, motivo_cancelamento").eq("id", contratoSemData).single();
    check("status vira cancelado com cancelado_em e motivo salvos", row?.status === "cancelado" && !!row?.cancelado_em && row?.motivo_cancelamento === "desistência do fornecedor");

    const { error: eDeNovo } = await admTenant.client.rpc("cancelar_contrato", { p_id: contratoSemData });
    check("cancelar contrato já cancelado é rejeitado", !!eDeNovo);
  }

  console.log("\n18. Contrato tipo funcionário — ciclo completo");
  let contratoFuncionarioId;
  {
    const { data: id, error } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "funcionario", p_pessoa_id: null, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: funcionarioId, p_objeto: "Contrato de prestação de serviços", p_data_inicio: "2027-02-01",
    });
    check("ADMIN cria contrato tipo funcionário", !error && !!id);
    contratoFuncionarioId = id;

    const { error: eEnviar } = await admTenant.client.rpc("enviar_contrato_para_aprovacao", { p_id: id });
    check("envia contrato de funcionário para aprovação", !eEnviar);
    const { error: eAprovar } = await admTenant.client.rpc("aprovar_contrato", { p_id: id });
    check("aprova contrato de funcionário", !eAprovar);
  }

  console.log("\n19. SELECT em contratos exige contratos.view (mesmo padrão sensível do T17 RH)");
  {
    const { data, error } = await noPermTenant.client.from("contratos").select("id");
    check("papel QUALIDADE (sem contratos.view) não lê contratos da própria empresa", !error && (data ?? []).length === 0);

    const { data: dataAdm, error: errorAdm } = await admTenant.client.from("contratos").select("id").eq("id", contratoId);
    check("ADMIN (com contratos.view) lê contratos da própria empresa", !errorAdm && (dataAdm ?? []).length === 1);
  }

  console.log("\n20. Isolamento entre tenants");
  {
    const { data: crossContratos } = await otherTenant.client.from("contratos").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga contratos do tenant A", (crossContratos ?? []).length === 0);

    const { error } = await otherTenant.client.rpc("suspender_contrato", { p_id: contratoFuncionarioId });
    check("tenant B não consegue suspender contrato do tenant A", !!error);

    const { error: e2 } = await otherTenant.client.rpc("upsert_contrato", {
      p_id: contratoFuncionarioId, p_tipo: "funcionario", p_pessoa_id: null, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: funcionarioId, p_objeto: "tentando editar contrato de outro tenant",
    });
    check("tenant B não consegue editar contrato do tenant A (p_id estrangeiro)", !!e2);

    const { error: e3 } = await otherTenant.client.rpc("aprovar_contrato", { p_id: contratoReprovaId });
    check("tenant B não consegue aprovar contrato do tenant A (p_id estrangeiro)", !!e3);

    const { error: e3b } = await otherTenant.client.rpc("cancelar_contrato", { p_id: contratoReprovaId });
    check("tenant B não consegue cancelar contrato do tenant A (p_id estrangeiro)", !!e3b);

    // Injeção de referência cross-tenant: tenant B cria um contrato NA
    // PRÓPRIA empresa, mas apontando p_pessoa_id/p_funcionario_id pra um
    // registro do tenant A.
    const { error: e4 } = await otherTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "tentando referenciar pessoa de outro tenant",
    });
    check("tenant B não consegue criar contrato referenciando pessoa do tenant A", !!e4);

    const { error: e5 } = await otherTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "funcionario", p_pessoa_id: null, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: funcionarioId, p_objeto: "tentando referenciar funcionário de outro tenant",
    });
    check("tenant B não consegue criar contrato referenciando funcionário do tenant A", !!e5);

    const { error: e6 } = await otherTenant.client.rpc("gerar_titulos_contrato", {
      p_contrato_id: contratoFuncionarioId, p_parcelas: [{ valor: 100, vencimento: "2027-05-01", condicao_pagamento: null }],
    });
    check("tenant B não consegue gerar título a partir de contrato do tenant A", !!e6);
  }

  console.log("\n21. Cada ação relevante grava sua própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .eq("company_id", admTenant.company.id)
      .gte("created_at", testStartedAt)
      .in("action", [
        "contratos.criado", "contratos.editado", "contratos.enviado_aprovacao", "contratos.aprovado",
        "contratos.reprovado", "contratos.suspenso", "contratos.encerrado", "contratos.cancelado",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of [
      "contratos.criado", "contratos.editado", "contratos.enviado_aprovacao", "contratos.aprovado",
      "contratos.reprovado", "contratos.suspenso", "contratos.encerrado", "contratos.cancelado",
    ]) {
      check(`${action} registrado`, actions.has(action));
    }
  }

  console.log("\n22. aprovar_contrato() revalida papel CLIENTE ativo no momento da aprovação (achado do code review)");
  {
    const { data: pessoaTemp } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: "CPF", p_documento: "22233344410", p_nome: "Cliente Temporário",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
      p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaTemp, p_papel: "CLIENTE", p_ativo: true });

    const { data: contratoTemp } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: pessoaTemp, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "Contrato pra testar revalidação", p_data_inicio: "2027-01-01",
    });
    check("contrato de teste criado", !!contratoTemp);
    await admTenant.client.rpc("enviar_contrato_para_aprovacao", { p_id: contratoTemp });

    // Papel é desativado DEPOIS que o contrato já foi enviado para
    // aprovação — nem upsert_contrato() nem enviar_contrato_para_
    // aprovacao() validam de novo nesse momento (só na criação/edição).
    await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaTemp, p_papel: "CLIENTE", p_ativo: false });

    const { error } = await admTenant.client.rpc("aprovar_contrato", { p_id: contratoTemp });
    check("aprovar_contrato rejeita quando o papel CLIENTE não está mais ativo", !!error);

    await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaTemp, p_papel: "CLIENTE", p_ativo: true });
    const { error: error2 } = await admTenant.client.rpc("aprovar_contrato", { p_id: contratoTemp });
    check("aprovar_contrato funciona normalmente depois que o papel volta a ficar ativo", !error2);
  }

  console.log("\n23. gerar_titulos_contrato() — vínculo financeiro detalhado (§5)");
  let contratoFinanceiroId;
  {
    const { data } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "Contrato para título financeiro", p_data_inicio: "2027-04-01", p_valor: 30000,
    });
    contratoFinanceiroId = data;
    await admTenant.client.rpc("enviar_contrato_para_aprovacao", { p_id: contratoFinanceiroId });
    await admTenant.client.rpc("aprovar_contrato", { p_id: contratoFinanceiroId });

    const { error: eRascunho } = await admTenant.client.rpc("gerar_titulos_contrato", {
      p_contrato_id: contratoReprovaId, p_parcelas: [{ valor: 1000, vencimento: "2027-05-01", condicao_pagamento: null }],
    });
    check("gerar título de contrato em rascunho é rejeitado", !!eRascunho);

    const { error: eFuncionario } = await admTenant.client.rpc("gerar_titulos_contrato", {
      p_contrato_id: contratoFuncionarioId, p_parcelas: [{ valor: 1000, vencimento: "2027-05-01", condicao_pagamento: null }],
    });
    check("gerar título de contrato de funcionário vigente é rejeitado (tipo != cliente)", !!eFuncionario);

    const { error: eSomaErrada } = await admTenant.client.rpc("gerar_titulos_contrato", {
      p_contrato_id: contratoFinanceiroId,
      p_parcelas: [{ valor: 10000, vencimento: "2027-05-01", condicao_pagamento: null }],
    });
    check("soma de parcelas diferente do valor do contrato é rejeitado", !!eSomaErrada);

    const { error: eSemPerm } = await noPermTenant.client.rpc("gerar_titulos_contrato", {
      p_contrato_id: contratoFinanceiroId,
      p_parcelas: [{ valor: 15000, vencimento: "2027-05-01", condicao_pagamento: null }, { valor: 15000, vencimento: "2027-06-01", condicao_pagamento: null }],
    });
    check("sem financeiro.manage não gera título financeiro", !!eSemPerm);

    const { data: ids, error } = await admTenant.client.rpc("gerar_titulos_contrato", {
      p_contrato_id: contratoFinanceiroId,
      p_parcelas: [
        { valor: 15000, vencimento: "2027-05-01", condicao_pagamento: "entrada" },
        { valor: 15000, vencimento: "2027-06-01", condicao_pagamento: "saldo" },
      ],
    });
    check("ADMIN gera títulos financeiros a partir de contrato vigente com cliente", !error && (ids ?? []).length === 2);

    const { data: titulos } = await admin.from("titulos_financeiros").select("contrato_id, pedido_id, valor").in("id", ids ?? []);
    check(
      "títulos gerados apontam pro contrato (pedido_id nulo)",
      (titulos ?? []).every((t) => t.contrato_id === contratoFinanceiroId && t.pedido_id === null),
    );

    const { error: eDeNovo } = await admTenant.client.rpc("gerar_titulos_contrato", {
      p_contrato_id: contratoFinanceiroId, p_parcelas: [{ valor: 30000, vencimento: "2027-07-01", condicao_pagamento: null }],
    });
    check("gerar título de novo pro mesmo contrato é rejeitado", !!eDeNovo);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
