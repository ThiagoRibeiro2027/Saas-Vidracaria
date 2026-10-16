// Testes automatizados do Kanban da Fila de Produção (desenho aprovado em
// conversa com o usuário, 16/10/2026 — migration 20261016001507). Cobre o
// que é NOVO nesta migration:
//   1. pedidos.producao_iniciada_em — preenchido na 1a OP do pedido.
//   2. listar_fila_producao_kanban() — um registro por pedido, estágio
//      calculado (aguardando_liberacao/planejada/em_producao/expedicao/
//      instalacao/concluida), nunca gravado.
//   3. definir_prioridade_pedido() — aplica prioridade a todas as OPs do
//      pedido de uma vez, e exige producao.manage (não só configurar)
//      quando o pedido já tem material separado em estoque_reservas.
// Não repete os testes de listar_fila_producao() (tabela, OP a OP) nem do
// fluxo completo orçamento→instalação — já cobertos em test-fila-producao.mjs
// e test-e2e-fluxo-completo.mjs.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-fila-producao-kanban.mjs

import "./lib/somente-local.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
function check(label, condition, extra) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`, extra ?? "");
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

// E-mail sempre único (Date.now()) — mesma razão de test-permissao-individual.mjs:
// janela de propagação do GoTrue após deleteUser() rejeitaria um e-mail fixo reusado.
async function criarUsuarioExtra(prefixo, slug) {
  const email = `${prefixo}-${Date.now()}.${slug}@users.internal`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "senha-de-teste-123456", email_confirm: true });
  if (!data?.user) throw error ?? new Error(`usuário ${prefixo} não criado`);
  return { userId: data.user.id, email };
}

// Cria pessoa/obra/item(ns)/orçamento/pedido via RPCs reais (mesmo padrão de
// test-fila-producao.mjs). Se `itensExtras` > 0, cria itens adicionais no
// mesmo orçamento — vira mais de um pedido_item, e portanto mais de uma OP,
// pra testar que definir_prioridade_pedido() atualiza todas de uma vez.
async function prepararPedido(tenant, sufixo, { pessoaNome, itensExtras = 0 }) {
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: `ORCK${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido", p_prefixo: `PEDK${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "ordem_producao", p_prefixo: `OPK${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });

  const { data: pessoaId, error: pessoaErr } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CPF", p_documento: `2223334440${sufixo}`, p_nome: pessoaNome,
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  if (pessoaErr) console.error("[fixture] upsert_pessoa falhou:", pessoaErr);
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  const itemIds = [];
  for (let i = 0; i <= itensExtras; i++) {
    const { data: itemId, error: itemErr } = await tenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: `JAN-K${sufixo}-${i}`, p_descricao: "Janela modelo teste kanban",
      p_tipo: "produto_acabado", p_classificacao: "esquadria", p_unidade_principal: "UN",
      p_situacao: "ativo",
    });
    if (itemErr) console.error("[fixture] upsert_item falhou:", itemErr);
    itemIds.push(itemId);
  }

  const { data: orcamentoId, error: orcErr } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: null, p_validade: null,
    p_condicao_comercial: null, p_observacoes: null,
  });
  if (orcErr) console.error("[fixture] upsert_orcamento falhou:", orcErr);
  for (const itemId of itemIds) {
    const { error: orcItemErr } = await tenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: 5, p_preco_unitario: 500,
    });
    if (orcItemErr) console.error("[fixture] upsert_orcamento_item falhou:", orcItemErr);
  }
  const { error: decidirErr } = await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });
  if (decidirErr) console.error("[fixture] decidir_orcamento falhou:", decidirErr);

  const { data: pedidoId, error: convErr } = await tenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  if (convErr) console.error("[fixture] converter_orcamento_em_pedido falhou:", convErr);

  const { data: pedidoItens } = await admin.from("pedido_itens").select("id, item_id").eq("pedido_id", pedidoId);

  return { pessoaId, pedidoId, pedidoItens: pedidoItens ?? [] };
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão, outro tenant)...");
  const admTenant = await createTenant("fila-kanban-admin", "Fila Kanban Admin Teste", "flk01", "ADMIN");
  // QUALIDADE não administra Produção — mesmo padrão de test-fila-producao.mjs.
  const noPermTenant = await createTenant("fila-kanban-admin", "Fila Kanban SemPerm Teste", "flk02", "QUALIDADE");
  const otherTenant = await createTenant("fila-kanban-other", "Fila Kanban Outro Teste", "flk03", "ADMIN");

  console.log("\n0. Papel próprio (producao.configurar/planejar/view, SEM producao.manage)");
  // Perfil órfão de uma run anterior (matrícula é única por empresa) bloquearia
  // criar_perfil_usuario na próxima — mesmo padrão de test-permissao-individual.mjs.
  const { data: perfisAntigos } = await admin.from("profiles").select("id").eq("company_id", admTenant.company.id).eq("login_identifier", "flk04");
  if (perfisAntigos?.length) {
    for (const p of perfisAntigos) await admin.auth.admin.deleteUser(p.id).catch(() => {});
    await admin.from("profiles").delete().in("id", perfisAntigos.map((p) => p.id));
  }
  const { data: papeisAntigos } = await admin.from("roles").select("id").eq("company_id", admTenant.company.id).eq("key", "PRODUCAO_CONFIGURADOR_FLK");
  if (papeisAntigos?.length) {
    const ids = papeisAntigos.map((r) => r.id);
    await admin.from("role_permissions").delete().in("role_id", ids);
    await admin.from("user_roles").delete().in("role_id", ids);
    await admin.from("roles").delete().in("id", ids);
  }
  const { data: permView } = await admin.from("permissions").select("id").eq("resource", "producao").eq("action", "view").single();
  const { data: permConfigurar } = await admin.from("permissions").select("id").eq("resource", "producao").eq("action", "configurar").single();
  const { data: permPlanejar } = await admin.from("permissions").select("id").eq("resource", "producao").eq("action", "planejar").single();

  const { data: papelConfiguradorId } = await admTenant.client.rpc("criar_papel_empresa", { p_key: "PRODUCAO_CONFIGURADOR_FLK", p_name: "Produção Configurador FLK" });
  await admTenant.client.rpc("conceder_permissao_papel", { p_role_id: papelConfiguradorId, p_permission_id: permView.id });
  await admTenant.client.rpc("conceder_permissao_papel", { p_role_id: papelConfiguradorId, p_permission_id: permConfigurar.id });
  await admTenant.client.rpc("conceder_permissao_papel", { p_role_id: papelConfiguradorId, p_permission_id: permPlanejar.id });

  const { userId: configuradorUserId, email: configuradorEmail } = await criarUsuarioExtra("flk04", admTenant.company.slug);
  await admTenant.client.rpc("criar_perfil_usuario", { p_auth_user_id: configuradorUserId, p_login_identifier: "flk04", p_display_name: "Configurador FLK" });
  {
    const { error } = await admTenant.client.rpc("atribuir_papel_usuario", { p_profile_id: configuradorUserId, p_role_id: papelConfiguradorId, p_valid_until: null });
    if (error) throw new Error(`[fixture] atribuir_papel_usuario (configurador) falhou: ${error.message}`);
  }
  const configuradorClient = createClient(url, anonKey);
  await configuradorClient.auth.signInWithPassword({ email: configuradorEmail, password: "senha-de-teste-123456" });
  const configuradorTenant = { client: configuradorClient, company: admTenant.company, userId: configuradorUserId };

  console.log("\n1. Massa de dados — 3 pedidos em estágios diferentes");
  const pedidoAguardando = await prepararPedido(admTenant, "1", { pessoaNome: "Cliente Aguardando FLK" });
  // Fica em 'recebido' — nunca entra em conferência/liberação.

  const pedidoPlanejada = await prepararPedido(admTenant, "2", { pessoaNome: "Cliente Planejada FLK", itensExtras: 1 });
  await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoPlanejada.pedidoId });
  await admTenant.client.rpc("liberar_pedido", { p_id: pedidoPlanejada.pedidoId });
  const opsPlanejada = [];
  for (const pi of pedidoPlanejada.pedidoItens) {
    const { data: opId, error } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pi.id });
    if (error) console.error("[fixture] criar_ordem_producao (planejada) falhou:", error);
    opsPlanejada.push(opId);
  }

  const pedidoMaterial = await prepararPedido(admTenant, "3", { pessoaNome: "Cliente Material FLK" });
  await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoMaterial.pedidoId });
  await admTenant.client.rpc("liberar_pedido", { p_id: pedidoMaterial.pedidoId });
  const { data: opMaterialId, error: opMaterialErr } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedidoMaterial.pedidoItens[0].id });
  if (opMaterialErr) console.error("[fixture] criar_ordem_producao (material) falhou:", opMaterialErr);
  // Dá saldo físico ao item e reserva — só assim material_separado fica true.
  await admin.from("estoque_saldos").upsert(
    { company_id: admTenant.company.id, item_id: pedidoMaterial.pedidoItens[0].item_id, quantidade_fisica: 999 },
    { onConflict: "company_id,item_id" },
  );
  const { data: reservado, error: reservaErr } = await admTenant.client.rpc("reservar_para_pedido_item", { p_pedido_item_id: pedidoMaterial.pedidoItens[0].id });
  if (reservaErr) console.error("[fixture] reservar_para_pedido_item falhou:", reservaErr);
  check("fixture: reserva de material criada com saldo > 0", (reservado ?? 0) > 0);

  console.log("\n2. listar_fila_producao_kanban() — gate de permissão");
  {
    const { error } = await noPermTenant.client.rpc("listar_fila_producao_kanban", { p_pessoa_id: null, p_obra_id: null, p_estagio: null });
    check("sem producao.view (papel QUALIDADE) não consulta o kanban", !!error);
  }

  console.log("\n3. listar_fila_producao_kanban() — estágio calculado corretamente");
  {
    const { data, error } = await admTenant.client.rpc("listar_fila_producao_kanban", { p_pessoa_id: null, p_obra_id: null, p_estagio: null });
    check("ADMIN consulta o kanban sem erro", !error, error);
    check("traz os 3 pedidos cadastrados", (data ?? []).length === 3, data?.length);

    const aguardando = data?.find((r) => r.pedido_id === pedidoAguardando.pedidoId);
    check("pedido não liberado cai em 'aguardando_liberacao'", aguardando?.estagio === "aguardando_liberacao", aguardando);
    check("pedido não liberado não tem producao_iniciada_em", aguardando?.producao_iniciada_em == null);
    check("pedido não liberado tem total_ops = 0", aguardando?.total_ops === 0);

    const planejada = data?.find((r) => r.pedido_id === pedidoPlanejada.pedidoId);
    check("pedido liberado com 2 OPs em 'planejada' cai em 'planejada'", planejada?.estagio === "planejada", planejada);
    check("vínculo liberado→produção: producao_iniciada_em preenchido na 1a OP", planejada?.producao_iniciada_em != null);
    check("total_ops reflete as 2 OPs do pedido", planejada?.total_ops === 2, planejada?.total_ops);
    check("material_separado é false (nenhuma reserva feita)", planejada?.material_separado === false);

    const material = data?.find((r) => r.pedido_id === pedidoMaterial.pedidoId);
    check("pedido com reserva ativa tem material_separado = true", material?.material_separado === true, material);
  }

  console.log("\n4. listar_fila_producao_kanban() — filtro por estágio e isolamento entre tenants");
  {
    const { data: soPlanejada } = await admTenant.client.rpc("listar_fila_producao_kanban", { p_pessoa_id: null, p_obra_id: null, p_estagio: "planejada" });
    check("filtro por estágio traz só pedidos em planejada", (soPlanejada ?? []).every((r) => r.estagio === "planejada") && (soPlanejada ?? []).length >= 1);

    const { data: outroTenantData, error } = await otherTenant.client.rpc("listar_fila_producao_kanban", { p_pessoa_id: null, p_obra_id: null, p_estagio: null });
    check("tenant B não enxerga nenhum pedido do tenant A", !error && (outroTenantData ?? []).length === 0);
  }

  console.log("\n5. definir_prioridade_pedido() — aplica a TODAS as OPs do pedido de uma vez");
  {
    const { error } = await admTenant.client.rpc("definir_prioridade_pedido", { p_pedido_id: pedidoPlanejada.pedidoId, p_prioridade: 1 });
    check("ADMIN reordena prioridade do pedido sem erro", !error, error);

    const { data: ops } = await admin.from("ordens_producao").select("id, prioridade").in("id", opsPlanejada);
    check("as 2 OPs do pedido foram atualizadas para prioridade 1", (ops ?? []).every((o) => o.prioridade === 1), ops);
  }

  console.log("\n6. definir_prioridade_pedido() — exige producao.manage quando há material separado");
  {
    const { error: configuradorSemMaterial } = await configuradorTenant.client.rpc("definir_prioridade_pedido", {
      p_pedido_id: pedidoPlanejada.pedidoId, p_prioridade: 2,
    });
    check("configurador (sem manage) reordena pedido SEM material separado", !configuradorSemMaterial, configuradorSemMaterial);

    const { error: configuradorComMaterial } = await configuradorTenant.client.rpc("definir_prioridade_pedido", {
      p_pedido_id: pedidoMaterial.pedidoId, p_prioridade: 2,
    });
    check("configurador (sem manage) NÃO reordena pedido COM material separado", !!configuradorComMaterial);

    const { error: adminComMaterial } = await admTenant.client.rpc("definir_prioridade_pedido", {
      p_pedido_id: pedidoMaterial.pedidoId, p_prioridade: 2,
    });
    check("ADMIN (tem manage) reordena pedido COM material separado", !adminComMaterial, adminComMaterial);

    const { data: opMaterial } = await admin.from("ordens_producao").select("prioridade").eq("id", opMaterialId).single();
    check("prioridade da OP com material ficou em 2 (só o ADMIN aplicou)", opMaterial?.prioridade === 2, opMaterial);
  }

  console.log("\n7. definir_prioridade_pedido() — validações e isolamento");
  {
    const { error: prioridadeInvalida } = await admTenant.client.rpc("definir_prioridade_pedido", { p_pedido_id: pedidoPlanejada.pedidoId, p_prioridade: 9 });
    check("prioridade fora de 1-5 é rejeitada", !!prioridadeInvalida);

    const { error: pedidoInexistente } = await admTenant.client.rpc("definir_prioridade_pedido", { p_pedido_id: "00000000-0000-0000-0000-000000000000", p_prioridade: 1 });
    check("pedido inexistente é rejeitado", !!pedidoInexistente);

    const { error: semOp } = await admTenant.client.rpc("definir_prioridade_pedido", { p_pedido_id: pedidoAguardando.pedidoId, p_prioridade: 1 });
    check("pedido sem nenhuma OP ainda é rejeitado", !!semOp);

    const { error: crossTenant } = await otherTenant.client.rpc("definir_prioridade_pedido", { p_pedido_id: pedidoPlanejada.pedidoId, p_prioridade: 1 });
    check("tenant B não reordena pedido do tenant A", !!crossTenant);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
