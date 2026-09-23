// Testes automatizados do ADR-004 — Estratégia Fiscal: estrutura mínima
// do MVP (§9.2, migration 20260916070000) mais o reprocessamento
// controlado (§7-8, §15, migration 20261005000000) — histórico de
// tentativas de processamento e reabertura de documento com erro. Sem
// emissão, cancelamento fiscal real, inutilização, transmissão ou
// qualquer chamada a provedor real (§9.3, fora do piloto da JR Box —
// §9.1): "resultado" de uma tentativa aqui é só o que foi informado ao
// registro, não algo apurado por uma integração de verdade.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-fiscal.mjs

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
  console.log("Preparando tenants (admin, sem-permissão de fiscal, outro tenant)...");
  const admTenant = await createTenant("fiscal-test-admin", "Fiscal Admin Teste", "adr4f01", "ADMIN");
  const noPermTenant = await createTenant("fiscal-test-admin", "Fiscal SemPerm Teste", "adr4f02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant("fiscal-test-other", "Fiscal Outro Teste", "adr4f03", "ADMIN");

  console.log("\n0. Massa de dados — item e necessidade de compra (T7) pra testar vínculo");
  const { data: itemId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "VD-FISCAL-1", p_descricao: "Vidro temperado", p_tipo: "materia_prima",
    p_classificacao: "vidro_temperado", p_unidade_principal: "M2", p_situacao: "ativo",
  });
  const { data: necessidadeId } = await admTenant.client.rpc("criar_necessidade_compra", {
    p_item_id: itemId, p_quantidade: 10, p_data_necessaria: null, p_origem: "manual", p_observacoes: null,
  });
  check("necessidade de compra criada (pra testar vínculo)", !!necessidadeId);

  console.log("\n1. registrar_documento_fiscal() exige fiscal.manage");
  {
    const { error } = await noPermTenant.client.rpc("registrar_documento_fiscal", { p_tipo: "nfe" });
    check("sem fiscal.manage (papel QUALIDADE) não registra documento", !!error);
  }

  console.log("\n2. registrar_documento_fiscal() rejeita tipo inválido");
  {
    const { error } = await admTenant.client.rpc("registrar_documento_fiscal", { p_tipo: "boleto" });
    check("tipo inválido é rejeitado", !!error);
  }

  console.log("\n3. registrar_documento_fiscal() rejeita entity_type sem entity_id");
  {
    const { error: e1 } = await admTenant.client.rpc("registrar_documento_fiscal", { p_tipo: "nfe", p_entity_type: "necessidade_compra", p_entity_id: null });
    check("entity_type sem entity_id é rejeitado", !!e1);

    const { error: e2 } = await admTenant.client.rpc("registrar_documento_fiscal", { p_tipo: "nfe", p_entity_type: null, p_entity_id: necessidadeId });
    check("entity_id sem entity_type é rejeitado", !!e2);
  }

  console.log("\n4. registrar_documento_fiscal() sucesso sem vínculo");
  let docSemVinculoId;
  {
    const { data, error } = await admTenant.client.rpc("registrar_documento_fiscal", {
      p_tipo: "nfe", p_numero: "123456", p_chave_acesso: "35270912345678000199550010000001231000000012", p_observacoes: "recebido sem vínculo ainda",
    });
    check("ADMIN registra documento sem vínculo", !error && !!data);
    docSemVinculoId = data;

    const { data: doc } = await admin.from("documentos_fiscais").select("*").eq("id", docSemVinculoId).single();
    check("documento nasce 'recebido' sem entity_type/entity_id", doc?.status === "recebido" && doc?.entity_type === null);
  }

  console.log("\n5. registrar_documento_fiscal() sucesso já vinculado a uma necessidade de compra");
  let docVinculadoId;
  {
    const { data, error } = await admTenant.client.rpc("registrar_documento_fiscal", {
      p_tipo: "nfe", p_numero: "654321", p_chave_acesso: "35270912345678000199550010000006540000000065",
      p_entity_type: "necessidade_compra", p_entity_id: necessidadeId, p_dados: { valor_total: 1000 },
    });
    check("ADMIN registra documento já vinculado", !error && !!data);
    docVinculadoId = data;

    const { data: doc } = await admin.from("documentos_fiscais").select("*").eq("id", docVinculadoId).single();
    check("vínculo e dados salvos corretamente", doc?.entity_type === "necessidade_compra" && doc?.entity_id === necessidadeId && doc?.dados?.valor_total === 1000);
  }

  console.log("\n6. registrar_documento_fiscal() rejeita chave_acesso duplicada na mesma empresa (idempotência, §7)");
  {
    const { error } = await admTenant.client.rpc("registrar_documento_fiscal", {
      p_tipo: "nfe", p_numero: "999999", p_chave_acesso: "35270912345678000199550010000001231000000012",
    });
    check("mesma chave_acesso duas vezes na mesma empresa é rejeitada", !!error);
  }

  console.log("\n7. Chave de acesso repetida em OUTRA empresa não colide (isolamento)");
  {
    const { error } = await otherTenant.client.rpc("registrar_documento_fiscal", {
      p_tipo: "nfe", p_numero: "123456", p_chave_acesso: "35270912345678000199550010000001231000000012",
    });
    check("mesma chave_acesso em outro tenant não é rejeitada (índice único é por empresa)", !error);
  }

  console.log("\n8. vincular_documento_fiscal() exige fiscal.manage");
  {
    const { error } = await noPermTenant.client.rpc("vincular_documento_fiscal", { p_id: docSemVinculoId, p_entity_type: "necessidade_compra", p_entity_id: necessidadeId });
    check("sem fiscal.manage não vincula documento", !!error);
  }

  console.log("\n9. vincular_documento_fiscal() sucesso — vínculo tardio (§5)");
  {
    const { error } = await admTenant.client.rpc("vincular_documento_fiscal", { p_id: docSemVinculoId, p_entity_type: "necessidade_compra", p_entity_id: necessidadeId });
    check("vincula documento que estava sem vínculo", !error);
    const { data: doc } = await admin.from("documentos_fiscais").select("entity_type, entity_id").eq("id", docSemVinculoId).single();
    check("vínculo persistido", doc?.entity_type === "necessidade_compra" && doc?.entity_id === necessidadeId);
  }

  console.log("\n10. cancelar_documento_fiscal() exige fiscal.manage");
  {
    const { error } = await noPermTenant.client.rpc("cancelar_documento_fiscal", { p_id: docVinculadoId, p_motivo: "teste" });
    check("sem fiscal.manage não cancela documento", !!error);
  }

  console.log("\n11. cancelar_documento_fiscal() sucesso, com motivo");
  {
    const { error } = await admTenant.client.rpc("cancelar_documento_fiscal", { p_id: docVinculadoId, p_motivo: "duplicidade de lançamento" });
    check("cancela documento (correção interna)", !error);
    const { data: doc } = await admin.from("documentos_fiscais").select("status, motivo_cancelamento").eq("id", docVinculadoId).single();
    check("status vira 'cancelado' com motivo salvo", doc?.status === "cancelado" && doc?.motivo_cancelamento === "duplicidade de lançamento");
  }

  console.log("\n12. cancelar_documento_fiscal() rejeita documento já cancelado");
  {
    const { error } = await admTenant.client.rpc("cancelar_documento_fiscal", { p_id: docVinculadoId, p_motivo: "de novo" });
    check("cancelar documento já cancelado é rejeitado", !!error);
  }

  console.log("\n13. vincular_documento_fiscal() rejeita documento cancelado");
  {
    const { error } = await admTenant.client.rpc("vincular_documento_fiscal", { p_id: docVinculadoId, p_entity_type: "necessidade_compra", p_entity_id: necessidadeId });
    check("não vincula documento cancelado", !!error);
  }

  console.log("\n14. Isolamento entre tenants");
  {
    const { data: crossDocs } = await otherTenant.client.from("documentos_fiscais").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga documentos fiscais do tenant A", (crossDocs ?? []).length === 0);

    const { error } = await otherTenant.client.rpc("cancelar_documento_fiscal", { p_id: docSemVinculoId, p_motivo: "cross-tenant" });
    check("tenant B não consegue cancelar documento do tenant A", !!error);
  }

  console.log("\n15. SELECT liberado sem fiscal.manage (papel QUALIDADE lê normalmente)");
  {
    const { data, error } = await noPermTenant.client.from("documentos_fiscais").select("id").eq("id", docSemVinculoId);
    check("papel QUALIDADE (sem fiscal.manage) lê documentos_fiscais da própria empresa", !error && (data ?? []).length === 1);
  }

  console.log("\n16. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", ["fiscal.documento_registrado", "fiscal.documento_vinculado", "fiscal.documento_cancelado"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of ["fiscal.documento_registrado", "fiscal.documento_vinculado", "fiscal.documento_cancelado"]) {
      check(`${action} registrado`, actions.has(action));
    }
  }

  console.log("\n17. Massa de dados — documento novo, ainda não processado, pra testar reprocessamento");
  let docProcessamentoId;
  {
    const { data } = await admTenant.client.rpc("registrar_documento_fiscal", {
      p_tipo: "nfe", p_numero: "777777", p_chave_acesso: "35270912345678000199550010000007770000000077",
    });
    docProcessamentoId = data;
    check("documento pra teste de processamento criado", !!docProcessamentoId);
    const { data: doc } = await admin.from("documentos_fiscais").select("status_processamento").eq("id", docProcessamentoId).single();
    check("nasce com status_processamento='nao_processado'", doc?.status_processamento === "nao_processado");
  }

  console.log("\n18. registrar_tentativa_processamento_fiscal() exige fiscal.manage");
  {
    const { error } = await noPermTenant.client.rpc("registrar_tentativa_processamento_fiscal", { p_documento_id: docProcessamentoId, p_resultado: "erro" });
    check("sem fiscal.manage não registra tentativa", !!error);
  }

  console.log("\n19. registrar_tentativa_processamento_fiscal() rejeita resultado inválido");
  {
    const { error } = await admTenant.client.rpc("registrar_tentativa_processamento_fiscal", { p_documento_id: docProcessamentoId, p_resultado: "pendente" });
    check("resultado inválido é rejeitado", !!error);
  }

  console.log("\n20. registrar_tentativa_processamento_fiscal() rejeita documento cancelado");
  {
    const { error } = await admTenant.client.rpc("registrar_tentativa_processamento_fiscal", { p_documento_id: docVinculadoId, p_resultado: "erro" });
    check("documento cancelado não recebe tentativa", !!error);
  }

  console.log("\n21. registrar_tentativa_processamento_fiscal() sucesso — 1ª tentativa com erro");
  {
    const { data, error } = await admTenant.client.rpc("registrar_tentativa_processamento_fiscal", {
      p_documento_id: docProcessamentoId, p_resultado: "erro", p_mensagem_retorno: "timeout no provedor", p_provedor: "provedor-x",
    });
    check("registra 1ª tentativa (erro)", !error && !!data);
    const { data: tentativa } = await admin.from("documento_fiscal_tentativas").select("numero_tentativa, resultado").eq("id", data).single();
    check("1ª tentativa tem numero_tentativa=1", tentativa?.numero_tentativa === 1 && tentativa?.resultado === "erro");
    const { data: doc } = await admin.from("documentos_fiscais").select("status_processamento").eq("id", docProcessamentoId).single();
    check("documento fica 'com_erro'", doc?.status_processamento === "com_erro");
  }

  console.log("\n22. registrar_tentativa_processamento_fiscal() sucesso — 2ª tentativa incrementa número");
  {
    const { data, error } = await admTenant.client.rpc("registrar_tentativa_processamento_fiscal", { p_documento_id: docProcessamentoId, p_resultado: "rejeitado", p_mensagem_retorno: "rejeitado pelo provedor" });
    check("registra 2ª tentativa (rejeitado)", !error && !!data);
    const { data: tentativa } = await admin.from("documento_fiscal_tentativas").select("numero_tentativa").eq("id", data).single();
    check("2ª tentativa tem numero_tentativa=2", tentativa?.numero_tentativa === 2);
  }

  console.log("\n23. reprocessar_documento_fiscal() exige fiscal.manage");
  {
    const { error } = await noPermTenant.client.rpc("reprocessar_documento_fiscal", { p_documento_id: docProcessamentoId });
    check("sem fiscal.manage não solicita reprocessamento", !!error);
  }

  console.log("\n24. reprocessar_documento_fiscal() sucesso — documento com erro volta a 'nao_processado'");
  {
    const { error } = await admTenant.client.rpc("reprocessar_documento_fiscal", { p_documento_id: docProcessamentoId });
    check("reprocessa documento com erro", !error);
    const { data: doc } = await admin.from("documentos_fiscais").select("status_processamento").eq("id", docProcessamentoId).single();
    check("volta a 'nao_processado'", doc?.status_processamento === "nao_processado");
  }

  console.log("\n25. reprocessar_documento_fiscal() rejeita quando não está 'com_erro'");
  {
    const { error } = await admTenant.client.rpc("reprocessar_documento_fiscal", { p_documento_id: docProcessamentoId });
    check("não reprocessa documento que não está com erro (agora 'nao_processado')", !!error);
  }

  console.log("\n26. registrar_tentativa_processamento_fiscal() sucesso='sucesso' fecha o processamento");
  {
    const { error } = await admTenant.client.rpc("registrar_tentativa_processamento_fiscal", { p_documento_id: docProcessamentoId, p_resultado: "sucesso", p_provedor: "provedor-x" });
    check("registra 3ª tentativa (sucesso)", !error);
    const { data: doc } = await admin.from("documentos_fiscais").select("status_processamento").eq("id", docProcessamentoId).single();
    check("documento fica 'processado'", doc?.status_processamento === "processado");

    const { error: eReprocessarProcessado } = await admTenant.client.rpc("reprocessar_documento_fiscal", { p_documento_id: docProcessamentoId });
    check("não reprocessa documento já processado com sucesso", !!eReprocessarProcessado);
  }

  console.log("\n27. reprocessar_documento_fiscal() rejeita documento cancelado");
  {
    await admTenant.client.rpc("registrar_tentativa_processamento_fiscal", { p_documento_id: docSemVinculoId, p_resultado: "erro" });
    await admTenant.client.rpc("cancelar_documento_fiscal", { p_id: docSemVinculoId, p_motivo: "cancelado antes de reprocessar" });
    const { error } = await admTenant.client.rpc("reprocessar_documento_fiscal", { p_documento_id: docSemVinculoId });
    check("não reprocessa documento cancelado", !!error);
  }

  console.log("\n28. Isolamento cross-tenant em documento_fiscal_tentativas");
  {
    const { data: crossTentativas } = await otherTenant.client.from("documento_fiscal_tentativas").select("id").eq("documento_fiscal_id", docProcessamentoId);
    check("tenant B não enxerga tentativas do tenant A", (crossTentativas ?? []).length === 0);

    const { error } = await otherTenant.client.rpc("registrar_tentativa_processamento_fiscal", { p_documento_id: docProcessamentoId, p_resultado: "erro" });
    check("tenant B não registra tentativa em documento do tenant A", !!error);
  }

  console.log("\n29. Cada ação nova grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", ["fiscal.tentativa_processamento_registrada", "fiscal.documento_reprocessamento_solicitado"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of ["fiscal.tentativa_processamento_registrada", "fiscal.documento_reprocessamento_solicitado"]) {
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
