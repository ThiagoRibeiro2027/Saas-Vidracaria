// Testes automatizados do TÓPICO 18 — Contratos, recorte mínimo do MVP
// (§12): estrutura genérica com os três tipos, vigência e ciclo de vida
// básico (rascunho → vigente → encerrado). Sem aprovação por alçada,
// garantia ou vínculo financeiro detalhado.
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

async function main() {
  console.log("Preparando tenants (admin, sem-permissão de contratos, outro tenant)...");
  const admTenant = await createTenant("contratos-test-admin", "Contratos Admin Teste", "18c01", "ADMIN");
  // QUALIDADE administra Qualidade, não Contratos — prova a autoridade separada.
  const noPermTenant = await createTenant("contratos-test-admin", "Contratos SemPerm Teste", "18c02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant("contratos-test-other", "Contratos Outro Teste", "18c03", "ADMIN");

  console.log("\n0. Massa de dados: numeração, cliente, fornecedor, obra, pedido, funcionário");
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "contrato", p_prefixo: "CTR-", p_sufixo: "", p_digitos: 4,
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

  console.log("\n5. upsert_contrato() sucesso — criação tipo cliente com obra");
  let contratoId;
  {
    const { data, error } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: obraId, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "Venda e instalação de fachada", p_data_inicio: "2027-01-10",
      p_data_fim: "2027-12-31", p_renovacao: "manual", p_valor: 50000, p_forma_pagamento: "50% + 50%",
      p_observacoes: null,
    });
    check("ADMIN cria contrato tipo cliente", !error && !!data);
    contratoId = data;

    const { data: row } = await admin.from("contratos").select("*").eq("id", contratoId).single();
    check("nasce 'rascunho' com número emitido e dados corretos", row?.status === "rascunho" && row?.numero?.startsWith("CTR-") && row?.tipo === "cliente" && row?.obra_id === obraId);
  }

  console.log("\n6. upsert_contrato() sucesso — edição em rascunho");
  {
    const { data, error } = await admTenant.client.rpc("upsert_contrato", {
      p_id: contratoId, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: obraId, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "Venda e instalação de fachada — revisado", p_data_inicio: "2027-01-15",
      p_data_fim: "2027-12-31", p_renovacao: "automatica", p_valor: 52000, p_forma_pagamento: "50% + 50%",
      p_observacoes: "revisado",
    });
    check("edição aceita em rascunho", !error && data === contratoId);
    const { data: row } = await admin.from("contratos").select("objeto, renovacao, valor").eq("id", contratoId).single();
    check("campos atualizados", row?.objeto === "Venda e instalação de fachada — revisado" && row?.renovacao === "automatica" && Number(row?.valor) === 52000);
  }

  console.log("\n7. upsert_contrato() rejeita mudar o tipo de um contrato existente");
  {
    const { error } = await admTenant.client.rpc("upsert_contrato", {
      p_id: contratoId, p_tipo: "fornecedor", p_pessoa_id: fornecedorId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "tentando mudar tipo",
    });
    check("mudar tipo de contrato existente é rejeitado", !!error);
  }

  console.log("\n8. ativar_contrato() exige data_inicio e contratos.manage");
  let contratoSemData;
  {
    const { data } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "fornecedor", p_pessoa_id: fornecedorId, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "Fornecimento de vidro",
    });
    contratoSemData = data;

    const { error: e1 } = await admTenant.client.rpc("ativar_contrato", { p_id: contratoSemData });
    check("ativar sem data_inicio é rejeitado", !!e1);

    const { error: e2 } = await noPermTenant.client.rpc("ativar_contrato", { p_id: contratoId });
    check("sem contratos.manage não ativa", !!e2);

    const { error: e3 } = await admTenant.client.rpc("ativar_contrato", { p_id: contratoId });
    check("ADMIN ativa contrato com data_inicio", !e3);
    const { data: row } = await admin.from("contratos").select("status, ativado_em").eq("id", contratoId).single();
    check("status vira vigente com ativado_em preenchido", row?.status === "vigente" && !!row?.ativado_em);
  }

  console.log("\n9. upsert_contrato() rejeita editar contrato vigente");
  {
    const { error } = await admTenant.client.rpc("upsert_contrato", {
      p_id: contratoId, p_tipo: "cliente", p_pessoa_id: clienteId, p_obra_id: obraId, p_pedido_id: null,
      p_funcionario_id: null, p_objeto: "tentando editar vigente",
    });
    check("editar contrato vigente é rejeitado", !!error);
  }

  console.log("\n10. ativar_contrato() rejeita ativar de novo um contrato já vigente");
  {
    const { error } = await admTenant.client.rpc("ativar_contrato", { p_id: contratoId });
    check("ativar contrato já vigente é rejeitado", !!error);
  }

  console.log("\n11. encerrar_contrato() — exige vigente, permissão, e é transição terminal");
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

  console.log("\n12. Contrato tipo funcionário — ciclo completo");
  {
    const { data: id, error } = await admTenant.client.rpc("upsert_contrato", {
      p_id: null, p_tipo: "funcionario", p_pessoa_id: null, p_obra_id: null, p_pedido_id: null,
      p_funcionario_id: funcionarioId, p_objeto: "Contrato de prestação de serviços", p_data_inicio: "2027-02-01",
    });
    check("ADMIN cria contrato tipo funcionário", !error && !!id);
    const { error: eAtivar } = await admTenant.client.rpc("ativar_contrato", { p_id: id });
    check("ativa contrato de funcionário", !eAtivar);
  }

  console.log("\n13. SELECT em contratos exige contratos.view (mesmo padrão sensível do T17 RH)");
  {
    const { data, error } = await noPermTenant.client.from("contratos").select("id");
    check("papel QUALIDADE (sem contratos.view) não lê contratos da própria empresa", !error && (data ?? []).length === 0);

    const { data: dataAdm, error: errorAdm } = await admTenant.client.from("contratos").select("id").eq("id", contratoId);
    check("ADMIN (com contratos.view) lê contratos da própria empresa", !errorAdm && (dataAdm ?? []).length === 1);
  }

  console.log("\n14. Isolamento entre tenants");
  {
    const { data: crossContratos } = await otherTenant.client.from("contratos").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga contratos do tenant A", (crossContratos ?? []).length === 0);

    const { error } = await otherTenant.client.rpc("encerrar_contrato", { p_id: contratoId });
    check("tenant B não consegue mexer em contrato do tenant A", !!error);
  }

  console.log("\n15. Cada ação relevante grava sua própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", ["contratos.criado", "contratos.editado", "contratos.ativado", "contratos.encerrado"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of ["contratos.criado", "contratos.editado", "contratos.ativado", "contratos.encerrado"]) {
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
