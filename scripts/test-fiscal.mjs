// Testes automatizados do ADR-004 — Estratégia Fiscal, completo:
// estrutura/registro/rastreabilidade de documento fiscal (§9.2) mais
// conferência/aprovação/rejeição/pendência no nível do documento (§6).
// Sem emissão, cancelamento fiscal real, inutilização ou transmissão
// (§9.3, fora do piloto da JR Box — §9.1).
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

  console.log("\n17. Massa de dados — documento fresco pra testar o fluxo de avaliação (§6)");
  const { data: docAvaliacaoId } = await admTenant.client.rpc("registrar_documento_fiscal", {
    p_tipo: "nfe", p_numero: "777777", p_chave_acesso: "35270912345678000199550010000007770000000077",
  });
  check("documento fresco criado", !!docAvaliacaoId);

  console.log("\n18. avaliar_documento_fiscal() exige fiscal.manage e rejeita decisão inválida");
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("avaliar_documento_fiscal", { p_id: docAvaliacaoId, p_decisao: "aprovado" });
    check("sem fiscal.manage não avalia documento", !!eNoPerm);

    const { error: eDecisao } = await admTenant.client.rpc("avaliar_documento_fiscal", { p_id: docAvaliacaoId, p_decisao: "invalida" });
    check("decisão inválida é rejeitada", !!eDecisao);
  }

  console.log("\n19. avaliar_documento_fiscal() sucesso — direto de 'recebido' pra 'aprovado' (§6, passo de conferência é opcional)");
  {
    const { error } = await admTenant.client.rpc("avaliar_documento_fiscal", { p_id: docAvaliacaoId, p_decisao: "aprovado", p_motivo: "conferido e ok" });
    check("ADMIN aprova documento direto de 'recebido'", !error);
    const { data: doc } = await admin.from("documentos_fiscais").select("status, decidido_por, decidido_em, motivo_decisao").eq("id", docAvaliacaoId).single();
    check("status vira 'aprovado' com decidido_por/decidido_em/motivo salvos", doc?.status === "aprovado" && !!doc?.decidido_por && !!doc?.decidido_em && doc?.motivo_decisao === "conferido e ok");
  }

  console.log("\n20. avaliar_documento_fiscal() rejeita reavaliação de documento já aprovado (fora de recebido/em_conferencia)");
  {
    const { error } = await admTenant.client.rpc("avaliar_documento_fiscal", { p_id: docAvaliacaoId, p_decisao: "rejeitado" });
    check("avaliar documento aprovado é rejeitado", !!error);
  }

  console.log("\n21. iniciar_conferencia_documento_fiscal() — permissão, sucesso, rejeita status errado");
  const { data: docConferenciaId } = await admTenant.client.rpc("registrar_documento_fiscal", {
    p_tipo: "nfse", p_numero: "888888",
  });
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("iniciar_conferencia_documento_fiscal", { p_id: docConferenciaId });
    check("sem fiscal.manage não inicia conferência", !!eNoPerm);

    const { error } = await admTenant.client.rpc("iniciar_conferencia_documento_fiscal", { p_id: docConferenciaId });
    check("ADMIN inicia conferência de documento recebido", !error);
    const { data: doc } = await admin.from("documentos_fiscais").select("status").eq("id", docConferenciaId).single();
    check("status vira 'em_conferencia'", doc?.status === "em_conferencia");

    const { error: eDeNovo } = await admTenant.client.rpc("iniciar_conferencia_documento_fiscal", { p_id: docConferenciaId });
    check("iniciar conferência de novo (já em conferência) é rejeitado", !!eDeNovo);
  }

  console.log("\n22. avaliar_documento_fiscal() sucesso a partir de 'em_conferencia' — rejeitado");
  {
    const { error } = await admTenant.client.rpc("avaliar_documento_fiscal", { p_id: docConferenciaId, p_decisao: "rejeitado", p_motivo: "divergência de valor" });
    check("ADMIN rejeita documento em conferência", !error);
    const { data: doc } = await admin.from("documentos_fiscais").select("status, motivo_decisao").eq("id", docConferenciaId).single();
    check("status vira 'rejeitado' com motivo salvo", doc?.status === "rejeitado" && doc?.motivo_decisao === "divergência de valor");
  }

  console.log("\n23. reavaliar_documento_fiscal() — permissão, sucesso (reprocessamento controlado, §7), rejeita status errado");
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("reavaliar_documento_fiscal", { p_id: docConferenciaId });
    check("sem fiscal.manage não reavalia documento", !!eNoPerm);

    const { error: eStatusErrado } = await admTenant.client.rpc("reavaliar_documento_fiscal", { p_id: docAvaliacaoId });
    check("reavaliar documento aprovado (não rejeitado/pendente) é rejeitado", !!eStatusErrado);

    const { error } = await admTenant.client.rpc("reavaliar_documento_fiscal", { p_id: docConferenciaId });
    check("ADMIN reavalia documento rejeitado", !error);
    const { data: doc } = await admin.from("documentos_fiscais").select("status, decidido_por, motivo_decisao").eq("id", docConferenciaId).single();
    check("volta pra 'em_conferencia', decisão anterior limpa (histórico fica em activity_logs)", doc?.status === "em_conferencia" && doc?.decidido_por === null && doc?.motivo_decisao === null);
  }

  console.log("\n24. Isolamento cross-tenant nos novos RPCs de avaliação");
  {
    const { error: e1 } = await otherTenant.client.rpc("avaliar_documento_fiscal", { p_id: docConferenciaId, p_decisao: "aprovado" });
    check("tenant B não consegue avaliar documento do tenant A", !!e1);

    const { error: e2 } = await otherTenant.client.rpc("iniciar_conferencia_documento_fiscal", { p_id: docSemVinculoId });
    check("tenant B não consegue iniciar conferência de documento do tenant A", !!e2);

    const { error: e3 } = await otherTenant.client.rpc("reavaliar_documento_fiscal", { p_id: docConferenciaId });
    check("tenant B não consegue reavaliar documento do tenant A", !!e3);
  }

  console.log("\n25. Cada ação de avaliação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", ["fiscal.documento_em_conferencia", "fiscal.documento_avaliado", "fiscal.documento_reavaliado"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of ["fiscal.documento_em_conferencia", "fiscal.documento_avaliado", "fiscal.documento_reavaliado"]) {
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
