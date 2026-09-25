// Testes automatizados do TÓPICO 13 — Integrações, recorte mínimo do MVP
// (Fase 1, ADR-002 v2.5 §4.17): Central de Integrações, catálogo global,
// fila com idempotência/retry, fonte oficial e evento interno nível
// Informativo. Nenhum conector externo real é testado aqui — não existe
// nenhum.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-integracoes.mjs

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
  const testStartedAt = new Date().toISOString();
  console.log("Preparando tenants (admin, sem-permissão de integrações, outro tenant)...");
  const admTenant = await createTenant("integracoes-test-admin", "Integrações Admin Teste", "13i01", "ADMIN");
  // QUALIDADE administra Qualidade, não Integrações — prova a autoridade separada.
  const noPermTenant = await createTenant("integracoes-test-admin", "Integrações SemPerm Teste", "13i02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant("integracoes-test-other", "Integrações Outro Teste", "13i03", "ADMIN");

  console.log("\n0. Catálogo global — visível a qualquer autenticado, mesmo sem integracoes.view");
  {
    const { data, error } = await noPermTenant.client.from("integracoes_catalogo").select("key, disponivel");
    check("catálogo é legível sem integracoes.view (using(true))", !error && (data ?? []).length >= 2);
    const keys = new Set((data ?? []).map((r) => r.key));
    check("catálogo tem os dois ganchos vazios da Fase 1", keys.has("erp_generico") && keys.has("nfe_provedor"));
    check("nenhum item do catálogo está disponível de verdade nesta fase", (data ?? []).every((r) => r.disponivel === false));
  }

  console.log("\n1. configurar_integracao() exige integracoes.manage");
  {
    const { error } = await noPermTenant.client.rpc("configurar_integracao", { p_id: null, p_catalogo_key: "erp_generico" });
    check("sem integracoes.manage (papel QUALIDADE) não configura integração", !!error);
  }

  console.log("\n2. configurar_integracao() rejeita chave de catálogo inexistente");
  {
    const { error } = await admTenant.client.rpc("configurar_integracao", { p_id: null, p_catalogo_key: "conector-que-nao-existe" });
    check("chave de catálogo inexistente é rejeitada", !!error);
  }

  console.log("\n3. configurar_integracao() rejeita ambiente inválido");
  {
    const { error } = await admTenant.client.rpc("configurar_integracao", { p_id: null, p_catalogo_key: "erp_generico", p_ambiente: "producao-fake" });
    check("ambiente inválido é rejeitado", !!error);
  }

  console.log("\n4. configurar_integracao() sucesso — criação");
  let integracaoId;
  {
    const { data, error } = await admTenant.client.rpc("configurar_integracao", {
      p_id: null, p_catalogo_key: "erp_generico", p_apelido: "Nosso ERP", p_ambiente: "homologacao", p_config: { nota: "teste" },
    });
    check("ADMIN configura integração", !error && !!data);
    integracaoId = data;

    const { data: row } = await admin.from("integracoes").select("*").eq("id", integracaoId).single();
    check("nasce inativa, com apelido e ambiente corretos", row?.status === "inativo" && row?.apelido === "Nosso ERP" && row?.ambiente === "homologacao");
  }

  console.log("\n5. configurar_integracao() rejeita segunda configuração do mesmo conector");
  {
    const { error } = await admTenant.client.rpc("configurar_integracao", { p_id: null, p_catalogo_key: "erp_generico" });
    check("segunda configuração do mesmo conector é rejeitada (índice único)", !!error);
  }

  console.log("\n6. configurar_integracao() sucesso — edição");
  {
    const { data, error } = await admTenant.client.rpc("configurar_integracao", {
      p_id: integracaoId, p_catalogo_key: "erp_generico", p_apelido: "Nosso ERP v2", p_ambiente: "producao", p_config: null,
    });
    check("edição aceita", !error && data === integracaoId);
    const { data: row } = await admin.from("integracoes").select("apelido, ambiente").eq("id", integracaoId).single();
    check("campos atualizados", row?.apelido === "Nosso ERP v2" && row?.ambiente === "producao");
  }

  console.log("\n7. enfileirar_operacao() rejeita integração inativa");
  {
    const { error } = await admTenant.client.rpc("enfileirar_operacao", { p_integracao_id: integracaoId, p_tipo: "teste" });
    check("integração inativa não permite enfileirar (§2)", !!error);
  }

  console.log("\n8. ativar_integracao() exige integracoes.manage e funciona para ADMIN");
  {
    const { error: e1 } = await noPermTenant.client.rpc("ativar_integracao", { p_id: integracaoId });
    check("sem integracoes.manage não ativa", !!e1);

    const { error: e2 } = await admTenant.client.rpc("ativar_integracao", { p_id: integracaoId });
    check("ADMIN ativa integração", !e2);
    const { data: row } = await admin.from("integracoes").select("status, ativada_em").eq("id", integracaoId).single();
    check("status vira ativo com ativada_em preenchido", row?.status === "ativo" && !!row?.ativada_em);

    const { error: e3 } = await admTenant.client.rpc("ativar_integracao", { p_id: integracaoId });
    check("ativar de novo uma integração já ativa é rejeitado", !!e3);
  }

  console.log("\n9. enfileirar_operacao() — sucesso, idempotência e isolamento");
  let operacaoId;
  {
    const { data, error } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "sincronizacao_teste", p_payload: { x: 1 }, p_chave_idempotencia: "chave-abc",
    });
    check("ADMIN enfileira operação", !error && !!data);
    operacaoId = data;

    const { data: repetida, error: e2 } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "sincronizacao_teste", p_payload: { x: 2 }, p_chave_idempotencia: "chave-abc",
    });
    check("mesma chave de idempotência devolve a mesma operação, sem duplicar (§18)", !e2 && repetida === operacaoId);

    const { count } = await admin.from("integracao_operacoes").select("id", { count: "exact", head: true }).eq("chave_idempotencia", "chave-abc");
    check("só existe uma linha na fila para essa chave", count === 1);

    const { error: e3 } = await noPermTenant.client.rpc("enfileirar_operacao", { p_integracao_id: integracaoId, p_tipo: "x" });
    check("sem integracoes.manage não enfileira", !!e3);
  }

  console.log("\n10. Ciclo de vida da operação: iniciar → falhar (temporário) → reprocessar → iniciar → falhar (permanente)");
  {
    const { error: eStart } = await admTenant.client.rpc("iniciar_processamento_operacao", { p_id: operacaoId });
    check("inicia processamento", !eStart);
    let { data: row } = await admin.from("integracao_operacoes").select("*").eq("id", operacaoId).single();
    check("status vira processando", row?.status === "processando");

    const { error: eFail } = await admTenant.client.rpc("falhar_operacao", { p_id: operacaoId, p_erro: "timeout simulado" });
    check("marca falha temporária", !eFail);
    ({ data: row } = await admin.from("integracao_operacoes").select("*").eq("id", operacaoId).single());
    check("status vira erro_temporario, tentativas=1, próxima tentativa preenchida", row?.status === "erro_temporario" && row?.tentativas === 1 && !!row?.proxima_tentativa_em);

    const { error: eReproc } = await admTenant.client.rpc("reprocessar_operacao", { p_id: operacaoId });
    check("reprocessa manualmente", !eReproc);
    ({ data: row } = await admin.from("integracao_operacoes").select("*").eq("id", operacaoId).single());
    check("volta a pendente, reprocessamentos_manuais=1, tentativas preservadas (nunca apaga o processamento original)", row?.status === "pendente" && row?.reprocessamentos_manuais === 1 && row?.tentativas === 1);

    await admTenant.client.rpc("iniciar_processamento_operacao", { p_id: operacaoId });
    const { error: eFailPerm } = await admTenant.client.rpc("falhar_operacao", { p_id: operacaoId, p_erro: "erro definitivo", p_permanente: true });
    check("marca falha permanente", !eFailPerm);
    ({ data: row } = await admin.from("integracao_operacoes").select("*").eq("id", operacaoId).single());
    check("status vira erro_permanente", row?.status === "erro_permanente");

    const { data: sysEvent } = await admin
      .from("system_events")
      .select("category, correlation_id")
      .eq("category", "integration_failure")
      .eq("correlation_id", row?.correlacao_id)
      .maybeSingle();
    check("falha permanente registra system_event (ADR-009 §5.1)", !!sysEvent);
  }

  console.log("\n11. cancelar_operacao() — sucesso e rejeição de concluído");
  {
    const { data: op2 } = await admTenant.client.rpc("enfileirar_operacao", { p_integracao_id: integracaoId, p_tipo: "cancelavel" });
    const { error: eCancel } = await admTenant.client.rpc("cancelar_operacao", { p_id: op2 });
    check("cancela operação pendente", !eCancel);
    const { data: row } = await admin.from("integracao_operacoes").select("status").eq("id", op2).single();
    check("status vira cancelado", row?.status === "cancelado");

    const { data: op3 } = await admTenant.client.rpc("enfileirar_operacao", { p_integracao_id: integracaoId, p_tipo: "concluivel" });
    await admTenant.client.rpc("iniciar_processamento_operacao", { p_id: op3 });
    await admTenant.client.rpc("concluir_operacao", { p_id: op3, p_resultado: { ok: true } });
    const { error: eCancelConcluido } = await admTenant.client.rpc("cancelar_operacao", { p_id: op3 });
    check("não é possível cancelar operação já concluída", !!eCancelConcluido);
  }

  console.log("\n12. iniciar_processamento_operacao() rejeita quando a integração está inativa");
  {
    const { data: op4 } = await admTenant.client.rpc("enfileirar_operacao", { p_integracao_id: integracaoId, p_tipo: "sera-bloqueada" });
    await admTenant.client.rpc("desativar_integracao", { p_id: integracaoId });
    const { error } = await admTenant.client.rpc("iniciar_processamento_operacao", { p_id: op4 });
    check("integração desativada bloqueia novo processamento (§2)", !!error);

    const { data: row } = await admin.from("integracao_operacoes").select("status").eq("id", op4).single();
    check("dado da operação permanece intacto (não é apagado ao desativar)", row?.status === "pendente");

    await admTenant.client.rpc("ativar_integracao", { p_id: integracaoId }); // religa pra próximos testes
  }

  console.log("\n13. definir_fonte_oficial() — sucesso, upsert e permissão");
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("definir_fonte_oficial", { p_tipo_informacao: "clientes", p_sistema_fonte: "ERP" });
    check("sem integracoes.manage não define fonte oficial", !!eNoPerm);

    const { data: fonteId, error } = await admTenant.client.rpc("definir_fonte_oficial", { p_tipo_informacao: "clientes", p_sistema_fonte: "ERP", p_observacoes: "piloto" });
    check("ADMIN define fonte oficial", !error && !!fonteId);

    const { data: fonteId2, error: e2 } = await admTenant.client.rpc("definir_fonte_oficial", { p_tipo_informacao: "clientes", p_sistema_fonte: "SaaS" });
    check("redefinir o mesmo tipo faz upsert (mesma linha)", !e2 && fonteId2 === fonteId);
    const { data: row } = await admin.from("integracao_fonte_oficial").select("sistema_fonte").eq("id", fonteId).single();
    check("sistema_fonte foi atualizado", row?.sistema_fonte === "SaaS");
  }

  console.log("\n14. registrar_evento_integracao() — nível Informativo, vira activity_log");
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("registrar_evento_integracao", { p_modulo_origem: "pedidos", p_modulo_destino: "producao", p_tipo_evento: "pedido_liberado" });
    check("sem integracoes.manage não registra evento", !!eNoPerm);

    const { data: logId, error } = await admTenant.client.rpc("registrar_evento_integracao", {
      p_modulo_origem: "pedidos", p_modulo_destino: "producao", p_tipo_evento: "pedido_liberado", p_descricao: "teste de evento",
    });
    check("ADMIN registra evento interno informativo", !error && !!logId);

    const { data: log } = await admin.from("activity_logs").select("action, metadata").eq("id", logId).single();
    check("grava em activity_logs com metadata de módulo/nível", log?.action === "integracoes.evento_modulo" && log?.metadata?.nivel_automacao === "informativo" && log?.metadata?.modulo_origem === "pedidos");
  }

  console.log("\n15. SELECT exige integracoes.view em todas as tabelas do módulo");
  {
    const { data: d1 } = await noPermTenant.client.from("integracoes").select("id");
    check("papel QUALIDADE (sem integracoes.view) não lê integracoes", (d1 ?? []).length === 0);

    const { data: d2 } = await noPermTenant.client.from("integracao_operacoes").select("id");
    check("papel QUALIDADE não lê integracao_operacoes", (d2 ?? []).length === 0);

    const { data: d3 } = await noPermTenant.client.from("integracao_fonte_oficial").select("id");
    check("papel QUALIDADE não lê integracao_fonte_oficial", (d3 ?? []).length === 0);
  }

  console.log("\n16. Isolamento cross-tenant");
  {
    const { data: crossIntegracoes } = await otherTenant.client.from("integracoes").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga integrações do tenant A", (crossIntegracoes ?? []).length === 0);

    const { data: crossOps } = await otherTenant.client.from("integracao_operacoes").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga operações do tenant A", (crossOps ?? []).length === 0);

    const { data: crossFonte } = await otherTenant.client.from("integracao_fonte_oficial").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga fonte oficial do tenant A", (crossFonte ?? []).length === 0);

    const { error } = await otherTenant.client.rpc("ativar_integracao", { p_id: integracaoId });
    check("tenant B não consegue ativar integração do tenant A", !!error);

    const { error: e2 } = await otherTenant.client.rpc("enfileirar_operacao", { p_integracao_id: integracaoId, p_tipo: "cross" });
    check("tenant B não consegue enfileirar operação na integração do tenant A", !!e2);

    const { error: e3 } = await otherTenant.client.rpc("configurar_integracao", { p_id: integracaoId, p_catalogo_key: "erp_generico", p_apelido: "hack", p_ambiente: "producao", p_config: null });
    check("tenant B não consegue reconfigurar integração do tenant A", !!e3);

    const { error: e4 } = await otherTenant.client.rpc("definir_fonte_oficial", { p_tipo_informacao: "clientes", p_sistema_fonte: "hack" });
    check("tenant B define fonte oficial na própria empresa, sem afetar/ler a do tenant A (RPC não tem alvo cross-tenant)", !e4);

    // Operação fresca do tenant A pra testar os RPCs de ciclo de vida cross-tenant.
    const { data: opCross } = await admTenant.client.rpc("enfileirar_operacao", { p_integracao_id: integracaoId, p_tipo: "cross-lifecycle" });
    const { error: e5 } = await otherTenant.client.rpc("iniciar_processamento_operacao", { p_id: opCross });
    check("tenant B não consegue iniciar processamento de operação do tenant A", !!e5);

    await admTenant.client.rpc("iniciar_processamento_operacao", { p_id: opCross });
    const { error: e6 } = await otherTenant.client.rpc("concluir_operacao", { p_id: opCross, p_resultado: null });
    check("tenant B não consegue concluir operação do tenant A", !!e6);

    const { error: e7 } = await otherTenant.client.rpc("falhar_operacao", { p_id: opCross, p_erro: "hack" });
    check("tenant B não consegue marcar falha em operação do tenant A", !!e7);

    const { error: e8 } = await otherTenant.client.rpc("cancelar_operacao", { p_id: opCross });
    check("tenant B não consegue cancelar operação do tenant A", !!e8);

    await admTenant.client.rpc("falhar_operacao", { p_id: opCross, p_erro: "pra testar reprocessar" });
    const { error: e9 } = await otherTenant.client.rpc("reprocessar_operacao", { p_id: opCross });
    check("tenant B não consegue reprocessar operação do tenant A", !!e9);
  }

  console.log("\n17. Catálogo global não aceita escrita de autenticado (só leitura)");
  {
    const { error } = await admTenant.client.from("integracoes_catalogo").insert({ key: "hack", nome: "x", categoria: "outros" });
    check("INSERT direto no catálogo é rejeitado (sem grant de escrita)", !!error);
  }

  console.log("\n18. Cada ação relevante grava sua própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .eq("company_id", admTenant.company.id)
      .gte("created_at", testStartedAt)
      .in("action", [
        "integracoes.configurada", "integracoes.reconfigurada", "integracoes.ativada", "integracoes.desativada",
        "integracoes.operacao_enfileirada", "integracoes.operacao_concluida", "integracoes.operacao_falhou",
        "integracoes.operacao_reprocessada", "integracoes.operacao_cancelada", "integracoes.fonte_oficial_definida",
        "integracoes.evento_modulo",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of [
      "integracoes.configurada", "integracoes.reconfigurada", "integracoes.ativada", "integracoes.desativada",
      "integracoes.operacao_enfileirada", "integracoes.operacao_concluida", "integracoes.operacao_falhou",
      "integracoes.operacao_reprocessada", "integracoes.operacao_cancelada", "integracoes.fonte_oficial_definida",
      "integracoes.evento_modulo",
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
