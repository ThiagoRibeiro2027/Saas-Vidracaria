// Testes automatizados do TÓPICO 13 — Integrações (Fase 1, ADR-002 v2.5
// §4.17): Central de Integrações, catálogo global, fila com idempotência/
// retry, fonte oficial e evento interno nível Informativo. Fase 3 (ADR-002
// §4.17, emenda de 25/09/2026): webhooks recebidos de terceiros — geração/
// rotação/desativação do endpoint e a função que registra o evento na fila
// (só chamável por service_role, nunca authenticated — a verificação de
// assinatura HMAC em si é testada só implicitamente aqui, porque vive no
// route handler HTTP, fora do escopo deste script). Nenhum conector
// externo real é testado aqui — não existe nenhum. Fase 4 (ADR-002 §4.17,
// emenda de 25/09/2026): webhooks de saída + motor de automação Evento→
// Condição→Ação (§14-15) — só níveis Informativo e Assistido (Automático
// fica de fora, exige autorização própria); a entrega HTTP de fato roda
// num cron (src/app/api/cron/integracoes-webhooks-saida), fora do escopo
// deste script — aqui só o caminho de banco (enfileirar via
// confirmar_execucao_regra() e o ciclo de vida via sistema_*) é testado.
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

  console.log("\n19. gerar_webhook_integracao() — sucesso, permissão e exige integração ativa");
  let webhookToken;
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("gerar_webhook_integracao", { p_integracao_id: integracaoId });
    check("sem integracoes.manage não gera webhook", !!eNoPerm);

    const { data, error } = await admTenant.client.rpc("gerar_webhook_integracao", { p_integracao_id: integracaoId });
    const row = Array.isArray(data) ? data[0] : data;
    check("ADMIN gera webhook e recebe token+segredo", !error && !!row?.token && !!row?.secret);
    webhookToken = row?.token;

    const { data: log } = await admin
      .from("activity_logs")
      .select("action")
      .eq("company_id", admTenant.company.id)
      .eq("action", "integracoes.webhook_gerado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    check("integracoes.webhook_gerado registrado", log?.action === "integracoes.webhook_gerado");

    await admTenant.client.rpc("desativar_integracao", { p_id: integracaoId });
    const { error: eInativa } = await admTenant.client.rpc("gerar_webhook_integracao", { p_integracao_id: integracaoId });
    check("integração inativa não permite gerar webhook", !!eInativa);
    await admTenant.client.rpc("ativar_integracao", { p_id: integracaoId }); // religa pra próximos testes
  }

  console.log("\n20. obter_webhook_integracao() — metadado seguro, nunca o segredo");
  {
    const { data, error } = await admTenant.client.rpc("obter_webhook_integracao", { p_integracao_id: integracaoId });
    const row = Array.isArray(data) ? data[0] : data;
    check("obter_webhook_integracao devolve token e ativo", !error && row?.token === webhookToken && row?.ativo === true);
    check("obter_webhook_integracao nunca devolve o segredo", !!row && !("secret" in row));

    const { data: dataNoPerm } = await noPermTenant.client.rpc("obter_webhook_integracao", { p_integracao_id: integracaoId });
    check("sem integracoes.view não lê metadado do webhook", (dataNoPerm ?? []).length === 0);

    const { data: dataCross } = await otherTenant.client.rpc("obter_webhook_integracao", { p_integracao_id: integracaoId });
    check("tenant B não lê webhook do tenant A", (dataCross ?? []).length === 0);

    const { data: rawSelect } = await admTenant.client.from("integracao_webhooks").select("*");
    check("SELECT direto na tabela integracao_webhooks é rejeitado (sem policy de leitura)", (rawSelect ?? []).length === 0);
  }

  console.log("\n21. registrar_operacao_webhook() — só service_role, nunca authenticated; idempotência");
  {
    const { error: eAuth } = await admTenant.client.rpc("registrar_operacao_webhook", {
      p_integracao_id: integracaoId, p_tipo: "teste", p_payload: null, p_chave_idempotencia: "deny-test",
    });
    check("usuário autenticado não pode chamar registrar_operacao_webhook (sem grant)", !!eAuth);

    const chave = `webhook:${integracaoId}:evt-${Date.now()}`;
    const { data: opId, error } = await admin.rpc("registrar_operacao_webhook", {
      p_integracao_id: integracaoId, p_tipo: "nfe_recebida", p_payload: { valor: 100 }, p_chave_idempotencia: chave,
    });
    check("service_role registra operação de webhook", !error && !!opId);

    const { data: opRow } = await admin.from("integracao_operacoes").select("origem, tipo, status").eq("id", opId).single();
    check("operação nasce com origem 'webhook' e status pendente", opRow?.origem === "webhook" && opRow?.status === "pendente");

    const { data: opId2 } = await admin.rpc("registrar_operacao_webhook", {
      p_integracao_id: integracaoId, p_tipo: "nfe_recebida", p_payload: { valor: 999 }, p_chave_idempotencia: chave,
    });
    check("reenvio com a mesma chave de idempotência não duplica (§14 'duplicidade')", opId2 === opId);

    const { data: log } = await admin
      .from("activity_logs")
      .select("action")
      .eq("company_id", admTenant.company.id)
      .eq("action", "integracoes.webhook_recebido")
      .limit(1)
      .maybeSingle();
    check("integracoes.webhook_recebido registrado", log?.action === "integracoes.webhook_recebido");

    const { error: eSemTipo } = await admin.rpc("registrar_operacao_webhook", {
      p_integracao_id: integracaoId, p_tipo: "", p_payload: null, p_chave_idempotencia: "sem-tipo",
    });
    check("tipo vazio é rejeitado", !!eSemTipo);

    await admTenant.client.rpc("desativar_integracao", { p_id: integracaoId });
    const { error: eIntegracaoInativa } = await admin.rpc("registrar_operacao_webhook", {
      p_integracao_id: integracaoId, p_tipo: "x", p_payload: null, p_chave_idempotencia: `${chave}-integracao-inativa`,
    });
    check("integração inativa rejeita webhook recebido", !!eIntegracaoInativa);
    await admTenant.client.rpc("ativar_integracao", { p_id: integracaoId }); // religa pra próximos testes
  }

  console.log("\n22. desativar_webhook_integracao() — sucesso, dupla desativação e isolamento");
  {
    const { error: eCross } = await otherTenant.client.rpc("desativar_webhook_integracao", { p_integracao_id: integracaoId });
    check("tenant B não desativa webhook do tenant A", !!eCross);

    const { data: id, error } = await admTenant.client.rpc("desativar_webhook_integracao", { p_integracao_id: integracaoId });
    check("ADMIN desativa webhook", !error && id === integracaoId);

    const { error: eDup } = await admTenant.client.rpc("desativar_webhook_integracao", { p_integracao_id: integracaoId });
    check("desativar de novo um webhook já inativo é rejeitado", !!eDup);

    const { error: eWebhookInativo } = await admin.rpc("registrar_operacao_webhook", {
      p_integracao_id: integracaoId, p_tipo: "pos-desativacao", p_payload: null,
      p_chave_idempotencia: `webhook:${integracaoId}:pos-desativacao-${Date.now()}`,
    });
    check("webhook desativado rejeita novo evento (mesmo espírito de integração desativada)", !!eWebhookInativo);
  }

  console.log("\n23. configurar_webhook_saida() — validações, permissão, exige integração ativa");
  let webhookSaidaId;
  {
    const { error: eNoPerm } = await noPermTenant.client.rpc("configurar_webhook_saida", {
      p_id: null, p_integracao_id: integracaoId, p_nome: "x", p_url: "https://example.com/hook", p_secret: "a".repeat(20),
    });
    check("sem integracoes.manage não configura webhook de saída", !!eNoPerm);

    const { error: eHttp } = await admTenant.client.rpc("configurar_webhook_saida", {
      p_id: null, p_integracao_id: integracaoId, p_nome: "x", p_url: "http://example.com/hook", p_secret: "a".repeat(20),
    });
    check("URL sem https:// é rejeitada", !!eHttp);

    const { error: eCurto } = await admTenant.client.rpc("configurar_webhook_saida", {
      p_id: null, p_integracao_id: integracaoId, p_nome: "x", p_url: "https://example.com/hook", p_secret: "curto",
    });
    check("segredo curto (<16) é rejeitado", !!eCurto);

    const { data, error } = await admTenant.client.rpc("configurar_webhook_saida", {
      p_id: null, p_integracao_id: integracaoId, p_nome: "ERP destino", p_url: "https://example.com/hook", p_secret: "segredo-de-teste-bem-longo-123",
    });
    check("ADMIN configura webhook de saída", !error && !!data);
    webhookSaidaId = data;

    await admTenant.client.rpc("desativar_integracao", { p_id: integracaoId });
    const { error: eInativa } = await admTenant.client.rpc("configurar_webhook_saida", {
      p_id: null, p_integracao_id: integracaoId, p_nome: "y", p_url: "https://example.com/hook2", p_secret: "a".repeat(20),
    });
    check("integração inativa não permite configurar webhook de saída", !!eInativa);
    await admTenant.client.rpc("ativar_integracao", { p_id: integracaoId }); // religa pra próximos testes
  }

  console.log("\n24. listar_webhooks_saida() — nunca expõe o segredo; isolamento");
  {
    const { data, error } = await admTenant.client.rpc("listar_webhooks_saida");
    const row = (data ?? []).find((r) => r.id === webhookSaidaId);
    check("listar_webhooks_saida devolve o registro criado", !error && !!row && row.url === "https://example.com/hook");
    check("listar_webhooks_saida nunca devolve o segredo", !!row && !("secret" in row));

    const { data: dataNoPerm } = await noPermTenant.client.rpc("listar_webhooks_saida");
    check("sem integracoes.view não lista webhooks de saída", (dataNoPerm ?? []).length === 0);

    const { data: dataCross } = await otherTenant.client.rpc("listar_webhooks_saida");
    check("tenant B não lista webhooks de saída do tenant A", (dataCross ?? []).filter((r) => r.id === webhookSaidaId).length === 0);

    const { data: rawSelect } = await admTenant.client.from("integracao_webhooks_saida").select("*");
    check("SELECT direto na tabela integracao_webhooks_saida é rejeitado (sem policy de leitura)", (rawSelect ?? []).length === 0);
  }

  console.log("\n25. ativar/desativar_webhook_saida() — toggle e isolamento");
  {
    const { error: eCross } = await otherTenant.client.rpc("desativar_webhook_saida", { p_id: webhookSaidaId });
    check("tenant B não desativa webhook de saída do tenant A", !!eCross);

    const { error } = await admTenant.client.rpc("desativar_webhook_saida", { p_id: webhookSaidaId });
    check("ADMIN desativa webhook de saída", !error);
    const { data: apósDesativar } = await admTenant.client.rpc("listar_webhooks_saida");
    check("status ativo=false após desativar", apósDesativar.find((r) => r.id === webhookSaidaId)?.ativo === false);

    const { error: eAtivar } = await admTenant.client.rpc("ativar_webhook_saida", { p_id: webhookSaidaId });
    check("ADMIN reativa webhook de saída", !eAtivar);
    const { data: apósAtivar } = await admTenant.client.rpc("listar_webhooks_saida");
    check("status ativo=true após reativar", apósAtivar.find((r) => r.id === webhookSaidaId)?.ativo === true);
  }

  console.log("\n26. configurar_regra_automacao() — validações e pareamento nível×ação (§15)");
  let regraInformativaId, regraAssistidaId;
  {
    const base = {
      p_id: null, p_condicao_operador: "E", p_condicoes: [{ campo: "valor", operador: ">", valor: "1000" }],
    };

    const { error: eNoPerm } = await noPermTenant.client.rpc("configurar_regra_automacao", {
      ...base, p_nome: "x", p_evento_tipo: "x", p_nivel_automacao: "informativo", p_acao_tipo: "notificar", p_acao_config: null,
    });
    check("sem integracoes.manage não configura regra", !!eNoPerm);

    const { error: eAuto } = await admTenant.client.rpc("configurar_regra_automacao", {
      ...base, p_nome: "x", p_evento_tipo: "x", p_nivel_automacao: "automatico", p_acao_tipo: "notificar", p_acao_config: null,
    });
    check("nível 'automatico' é rejeitado — exige autorização própria (§15)", !!eAuto);

    const { error: eInfComWebhook } = await admTenant.client.rpc("configurar_regra_automacao", {
      ...base, p_nome: "x", p_evento_tipo: "x", p_nivel_automacao: "informativo", p_acao_tipo: "webhook_saida",
      p_acao_config: { webhook_saida_id: webhookSaidaId },
    });
    check("nível informativo não aceita ação webhook_saida (só notificar)", !!eInfComWebhook);

    const { error: eAssistidoNotificar } = await admTenant.client.rpc("configurar_regra_automacao", {
      ...base, p_nome: "x", p_evento_tipo: "x", p_nivel_automacao: "assistido", p_acao_tipo: "notificar", p_acao_config: null,
    });
    check("nível assistido não aceita ação notificar (só webhook_saida)", !!eAssistidoNotificar);

    const { error: eSemDestino } = await admTenant.client.rpc("configurar_regra_automacao", {
      ...base, p_nome: "x", p_evento_tipo: "x", p_nivel_automacao: "assistido", p_acao_tipo: "webhook_saida", p_acao_config: null,
    });
    check("assistido sem webhook_saida_id é rejeitado", !!eSemDestino);

    const { error: eDestinoInexistente } = await admTenant.client.rpc("configurar_regra_automacao", {
      ...base, p_nome: "x", p_evento_tipo: "x", p_nivel_automacao: "assistido", p_acao_tipo: "webhook_saida",
      p_acao_config: { webhook_saida_id: "00000000-0000-0000-0000-000000000000" },
    });
    check("assistido com webhook_saida_id inexistente é rejeitado", !!eDestinoInexistente);

    const { error: eCondVazia } = await admTenant.client.rpc("configurar_regra_automacao", {
      p_id: null, p_condicao_operador: "E", p_condicoes: [], p_nome: "x", p_evento_tipo: "x",
      p_nivel_automacao: "informativo", p_acao_tipo: "notificar", p_acao_config: null,
    });
    check("condições vazias são rejeitadas", !!eCondVazia);

    const { error: eCondIncompleta } = await admTenant.client.rpc("configurar_regra_automacao", {
      p_id: null, p_condicao_operador: "E", p_condicoes: [{ campo: "valor" }], p_nome: "x", p_evento_tipo: "x",
      p_nivel_automacao: "informativo", p_acao_tipo: "notificar", p_acao_config: null,
    });
    check("condição sem operador/valor é rejeitada", !!eCondIncompleta);

    const { error: eOperadorInvalido } = await admTenant.client.rpc("configurar_regra_automacao", {
      p_id: null, p_condicao_operador: "E", p_condicoes: [{ campo: "valor", operador: "~=", valor: "1" }], p_nome: "x", p_evento_tipo: "x",
      p_nivel_automacao: "informativo", p_acao_tipo: "notificar", p_acao_config: null,
    });
    check("operador de condição inválido é rejeitado", !!eOperadorInvalido);

    const { data: idInf, error: eInf } = await admTenant.client.rpc("configurar_regra_automacao", {
      ...base, p_nome: "Pedido grande — informar", p_evento_tipo: "pedido_grande", p_nivel_automacao: "informativo",
      p_acao_tipo: "notificar", p_acao_config: null,
    });
    check("cria regra informativo+notificar com sucesso", !eInf && !!idInf);
    regraInformativaId = idInf;

    const { data: idAss, error: eAss } = await admTenant.client.rpc("configurar_regra_automacao", {
      p_id: null, p_condicao_operador: "E", p_condicoes: [{ campo: "valor", operador: ">", valor: "1000" }],
      p_nome: "Pedido grande — avisar terceiro", p_evento_tipo: "pedido_grande_saida", p_nivel_automacao: "assistido",
      p_acao_tipo: "webhook_saida", p_acao_config: { webhook_saida_id: webhookSaidaId },
    });
    check("cria regra assistido+webhook_saida com sucesso", !eAss && !!idAss);
    regraAssistidaId = idAss;
  }

  console.log("\n27. Trigger dispara regra Informativo ao inserir operação correspondente");
  {
    const { data: opMatch } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "pedido_grande", p_payload: { valor: 5000 },
      p_chave_idempotencia: `regra-informativo-match-${Date.now()}`,
    });
    const { data: execMatch } = await admin
      .from("integracao_execucoes_regra")
      .select("status")
      .eq("regra_id", regraInformativaId)
      .eq("operacao_id", opMatch)
      .maybeSingle();
    check("condição satisfeita cria execução 'executada_informativo'", execMatch?.status === "executada_informativo");

    const { data: logRegra } = await admin
      .from("activity_logs")
      .select("action")
      .eq("company_id", admTenant.company.id)
      .eq("action", "integracoes.regra_disparada")
      .eq("entity_id", (await admin.from("integracao_execucoes_regra").select("id").eq("operacao_id", opMatch).single()).data.id)
      .maybeSingle();
    check("integracoes.regra_disparada registrado", logRegra?.action === "integracoes.regra_disparada");

    const { data: opSemMatch } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "pedido_grande", p_payload: { valor: 500 },
      p_chave_idempotencia: `regra-informativo-nomatch-${Date.now()}`,
    });
    const { data: execSemMatch } = await admin
      .from("integracao_execucoes_regra")
      .select("id")
      .eq("operacao_id", opSemMatch);
    check("condição não satisfeita não cria execução", (execSemMatch ?? []).length === 0);
  }

  console.log("\n28. Trigger dispara regra Assistido → aguardando confirmação; condições E/OU");
  let execucaoAssistidaId;
  {
    const { data: opAssistido } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "pedido_grande_saida", p_payload: { valor: 5000 },
      p_chave_idempotencia: `regra-assistido-match-${Date.now()}`,
    });
    const { data: execAssistido } = await admin
      .from("integracao_execucoes_regra")
      .select("id, status")
      .eq("regra_id", regraAssistidaId)
      .eq("operacao_id", opAssistido)
      .maybeSingle();
    check("condição satisfeita (assistido) cria execução 'aguardando_confirmacao'", execAssistido?.status === "aguardando_confirmacao");
    execucaoAssistidaId = execAssistido?.id;

    const { data: notif } = await admin
      .from("notificacoes")
      .select("id")
      .eq("company_id", admTenant.company.id)
      .eq("tipo_evento", "integracoes.regra_aguardando_confirmacao")
      .eq("entity_id", execucaoAssistidaId);
    check("notificação de confirmação foi gerada (ADR-007)", (notif ?? []).length > 0);

    // condição composta OU: uma das duas basta.
    await admTenant.client.rpc("configurar_regra_automacao", {
      p_id: null, p_condicao_operador: "OU",
      p_condicoes: [{ campo: "a", operador: "=", valor: "x" }, { campo: "b", operador: "=", valor: "y" }],
      p_nome: "Teste OU", p_evento_tipo: "teste_ou", p_nivel_automacao: "informativo", p_acao_tipo: "notificar", p_acao_config: null,
    });
    const { data: opOuMatch } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "teste_ou", p_payload: { a: "x", b: "z" },
      p_chave_idempotencia: `regra-ou-match-${Date.now()}`,
    });
    const { data: execOuMatch } = await admin.from("integracao_execucoes_regra").select("id").eq("operacao_id", opOuMatch);
    check("OU: uma condição verdadeira já dispara a regra", (execOuMatch ?? []).length > 0);

    const { data: opOuSemMatch } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "teste_ou", p_payload: { a: "q", b: "z" },
      p_chave_idempotencia: `regra-ou-nomatch-${Date.now()}`,
    });
    const { data: execOuSemMatch } = await admin.from("integracao_execucoes_regra").select("id").eq("operacao_id", opOuSemMatch);
    check("OU: nenhuma condição verdadeira não dispara a regra", (execOuSemMatch ?? []).length === 0);

    // condição composta E: as duas precisam ser verdadeiras.
    await admTenant.client.rpc("configurar_regra_automacao", {
      p_id: null, p_condicao_operador: "E",
      p_condicoes: [{ campo: "a", operador: "=", valor: "x" }, { campo: "b", operador: "=", valor: "y" }],
      p_nome: "Teste E", p_evento_tipo: "teste_e", p_nivel_automacao: "informativo", p_acao_tipo: "notificar", p_acao_config: null,
    });
    const { data: opEMatch } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "teste_e", p_payload: { a: "x", b: "y" },
      p_chave_idempotencia: `regra-e-match-${Date.now()}`,
    });
    const { data: execEMatch } = await admin.from("integracao_execucoes_regra").select("id").eq("operacao_id", opEMatch);
    check("E: as duas condições verdadeiras dispara a regra", (execEMatch ?? []).length > 0);

    const { data: opEParcial } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "teste_e", p_payload: { a: "x", b: "z" },
      p_chave_idempotencia: `regra-e-parcial-${Date.now()}`,
    });
    const { data: execEParcial } = await admin.from("integracao_execucoes_regra").select("id").eq("operacao_id", opEParcial);
    check("E: só uma condição verdadeira não dispara a regra", (execEParcial ?? []).length === 0);
  }

  console.log("\n29. confirmar_execucao_regra() — sucesso, dupla confirmação, destino inativo, isolamento");
  {
    const { error: eCross } = await otherTenant.client.rpc("confirmar_execucao_regra", { p_id: execucaoAssistidaId });
    check("tenant B não confirma execução do tenant A", !!eCross);

    const { data: novaOperacaoId, error } = await admTenant.client.rpc("confirmar_execucao_regra", { p_id: execucaoAssistidaId });
    check("ADMIN confirma execução e enfileira webhook de saída", !error && !!novaOperacaoId);

    const { data: novaOp } = await admin
      .from("integracao_operacoes")
      .select("origem, tipo, status, payload")
      .eq("id", novaOperacaoId)
      .single();
    check(
      "nova operação nasce com origem 'automacao', tipo 'webhook_saida' e referência ao destino",
      novaOp?.origem === "automacao" && novaOp?.tipo === "webhook_saida" && novaOp?.payload?.webhook_saida_id === webhookSaidaId,
    );

    const { error: eDup } = await admTenant.client.rpc("confirmar_execucao_regra", { p_id: execucaoAssistidaId });
    check("confirmar de novo uma execução já confirmada é rejeitado", !!eDup);

    // Destino inativo: nova execução aguardando, tenta confirmar, é rejeitada.
    await admTenant.client.rpc("desativar_webhook_saida", { p_id: webhookSaidaId });
    const { data: opParaDestinoInativo } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "pedido_grande_saida", p_payload: { valor: 9999 },
      p_chave_idempotencia: `regra-assistido-destino-inativo-${Date.now()}`,
    });
    const { data: execDestinoInativo } = await admin
      .from("integracao_execucoes_regra")
      .select("id")
      .eq("operacao_id", opParaDestinoInativo)
      .single();
    const { error: eDestinoInativo } = await admTenant.client.rpc("confirmar_execucao_regra", { p_id: execDestinoInativo.id });
    check("confirmar com destino de webhook de saída inativo é rejeitado", !!eDestinoInativo);
    await admTenant.client.rpc("ativar_webhook_saida", { p_id: webhookSaidaId }); // religa pra próximos testes

    // limpa a execução deixada pendente pelo teste acima, pra não sobrar "aguardando_confirmacao" fora de controle.
    await admTenant.client.rpc("rejeitar_execucao_regra", { p_id: execDestinoInativo.id });
  }

  console.log("\n30. rejeitar_execucao_regra() — sucesso e rejeição de dupla decisão");
  {
    const { data: opParaRejeitar } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "pedido_grande_saida", p_payload: { valor: 1500 },
      p_chave_idempotencia: `regra-assistido-rejeitar-${Date.now()}`,
    });
    const { data: execParaRejeitar } = await admin
      .from("integracao_execucoes_regra")
      .select("id")
      .eq("operacao_id", opParaRejeitar)
      .single();

    const { data: id, error } = await admTenant.client.rpc("rejeitar_execucao_regra", { p_id: execParaRejeitar.id });
    check("ADMIN rejeita execução aguardando confirmação", !error && id === execParaRejeitar.id);

    const { error: eDup } = await admTenant.client.rpc("rejeitar_execucao_regra", { p_id: execParaRejeitar.id });
    check("rejeitar de novo uma execução já decidida é rejeitado", !!eDup);
  }

  console.log("\n31. Funções sistema_* — só service_role, nunca authenticated; ciclo de entrega simulado");
  {
    const { data: opSistema } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "webhook_saida", p_payload: { webhook_saida_id: webhookSaidaId, evento_tipo: "x", payload_original: {} },
      p_chave_idempotencia: `sistema-teste-${Date.now()}`,
    });

    const { error: eAuthIniciar } = await admTenant.client.rpc("sistema_iniciar_processamento_operacao", { p_id: opSistema });
    check("authenticated não pode chamar sistema_iniciar_processamento_operacao (sem grant)", !!eAuthIniciar);

    const { error: eIniciar } = await admin.rpc("sistema_iniciar_processamento_operacao", { p_id: opSistema });
    check("service_role inicia processamento via caminho de sistema", !eIniciar);

    const { data: opProcessando } = await admin.from("integracao_operacoes").select("status").eq("id", opSistema).single();
    check("status vira 'processando'", opProcessando?.status === "processando");

    const { error: eConcluir } = await admin.rpc("sistema_concluir_operacao", { p_id: opSistema, p_resultado: { ok: true } });
    check("service_role conclui operação via caminho de sistema", !eConcluir);

    const { data: opConcluida } = await admin.from("integracao_operacoes").select("status").eq("id", opSistema).single();
    check("status vira 'concluido'", opConcluida?.status === "concluido");

    // ciclo de falha temporária → permanente pelo caminho de sistema.
    const { data: opFalha } = await admTenant.client.rpc("enfileirar_operacao", {
      p_integracao_id: integracaoId, p_tipo: "webhook_saida", p_payload: { webhook_saida_id: webhookSaidaId, evento_tipo: "x", payload_original: {} },
      p_chave_idempotencia: `sistema-falha-${Date.now()}`,
    });
    await admin.rpc("sistema_iniciar_processamento_operacao", { p_id: opFalha });
    const { error: eAuthFalhar } = await admTenant.client.rpc("sistema_falhar_operacao", { p_id: opFalha, p_erro: "x" });
    check("authenticated não pode chamar sistema_falhar_operacao (sem grant)", !!eAuthFalhar);

    await admin.rpc("sistema_falhar_operacao", { p_id: opFalha, p_erro: "timeout simulado" });
    const { data: opErroTemp } = await admin.from("integracao_operacoes").select("status, tentativas").eq("id", opFalha).single();
    check("falha temporária via sistema", opErroTemp?.status === "erro_temporario" && opErroTemp?.tentativas === 1);

    // erro_temporario não é reprocessável por sistema_iniciar_processamento_operacao (só aceita
    // 'pendente', igual ao caminho tenant-facing) — reprocessar_operacao (tenant-facing, já
    // testado na seção 10) devolve a 'pendente' antes de tentar de novo.
    await admTenant.client.rpc("reprocessar_operacao", { p_id: opFalha });
    await admin.rpc("sistema_iniciar_processamento_operacao", { p_id: opFalha });
    await admin.rpc("sistema_falhar_operacao", { p_id: opFalha, p_erro: "erro definitivo simulado", p_permanente: true });
    const { data: opErroPerm } = await admin.from("integracao_operacoes").select("status").eq("id", opFalha).single();
    check("falha permanente via sistema", opErroPerm?.status === "erro_permanente");
  }

  console.log("\n32. Isolamento cross-tenant — regras, execuções e webhooks de saída");
  {
    const { data: crossRegras } = await otherTenant.client.from("integracao_regras").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga regras do tenant A", (crossRegras ?? []).length === 0);

    const { data: crossExec } = await otherTenant.client.from("integracao_execucoes_regra").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga execuções de regra do tenant A", (crossExec ?? []).length === 0);

    const { error: eCrossConfigurar } = await otherTenant.client.rpc("configurar_regra_automacao", {
      p_id: regraInformativaId, p_condicao_operador: "E", p_condicoes: [{ campo: "x", operador: "=", valor: "1" }],
      p_nome: "hack", p_evento_tipo: "hack", p_nivel_automacao: "informativo", p_acao_tipo: "notificar", p_acao_config: null,
    });
    check("tenant B não reconfigura regra do tenant A", !!eCrossConfigurar);

    const { error: eCrossAtivar } = await otherTenant.client.rpc("ativar_regra_automacao", { p_id: regraInformativaId });
    check("tenant B não ativa/desativa regra do tenant A", !!eCrossAtivar);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
