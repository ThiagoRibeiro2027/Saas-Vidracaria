// Testes automatizados do ADR-007 — Notificações e Alertas, recorte
// mínimo. Cobre a infraestrutura (notificar_usuarios_com_permissao(),
// marcar_notificacao_lida(), isolamento — só o próprio destinatário lê
// a própria notificação, mais estrito que "toda a empresa") e os 3
// eventos wireados nesta fase: pendência aberta em pedido (T3), OP
// bloqueada por medição não confirmada (T4), não conformidade aberta
// (T8).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-notificacoes.mjs

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

// Usuário com um papel próprio da empresa, contendo só a permissão
// indicada — prova que notificar_usuarios_com_permissao() só alcança
// quem de fato tem a permissão do recurso, não todo mundo da empresa.
async function criarUsuarioComPermissao(company, identifier, roleKey, resource, actions) {
  const { data: role } = await admin
    .from("roles")
    .insert({ company_id: company.id, key: roleKey, name: roleKey })
    .select()
    .single();

  for (const action of actions) {
    const { data: perm } = await admin.from("permissions").select("id").eq("resource", resource).eq("action", action).single();
    await admin.from("role_permissions").insert({ role_id: role.id, permission_id: perm.id });
  }

  const email = `${identifier}@users.internal`;
  const password = "senha-de-teste-123456";
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }
  await admin.from("profiles").upsert({ id: userId, company_id: company.id, login_identifier: identifier, display_name: roleKey }, { onConflict: "id" });
  await admin.from("user_roles").insert({ profile_id: userId, role_id: role.id });

  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });
  return { client, userId };
}

async function prepararPedidoConferencia(tenant, sufixo, { itemTipo = "materia_prima", quantidade = 5 } = {}) {
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: `ORC${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido", p_prefixo: `PED${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "ordem_producao", p_prefixo: `OP${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });

  const { data: pessoaId, error: pessoaErr } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CNPJ", p_documento: `1133344400${sufixo}`, p_nome: "JR Box Vidros",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  if (pessoaErr) console.error("[fixture] upsert_pessoa falhou:", pessoaErr);
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  const { data: itemId, error: itemErr } = await tenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: `VD-N${sufixo}`, p_descricao: "Vidro temperado 10mm",
    p_tipo: itemTipo, p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
    p_situacao: "ativo",
  });
  if (itemErr) console.error("[fixture] upsert_item falhou:", itemErr);

  const { data: orcamentoId, error: orcErr } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: null, p_validade: null,
    p_condicao_comercial: null, p_observacoes: null,
  });
  if (orcErr) console.error("[fixture] upsert_orcamento falhou:", orcErr);
  await tenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: quantidade, p_preco_unitario: 100,
  });
  await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });

  const { data: pedidoId, error: convErr } = await tenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  if (convErr) console.error("[fixture] converter_orcamento_em_pedido falhou:", convErr);
  await tenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });

  const { data: pedido } = await admin.from("pedidos").select("numero").eq("id", pedidoId).single();
  const { data: pedidoItem } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).single();

  return { pessoaId, itemId, pedidoId, pedidoNumero: pedido.numero, pedidoItemId: pedidoItem.id, quantidade };
}

async function operacaoUnica(ordemProducaoId) {
  const { data } = await admin.from("op_lote_operacoes").select("id").eq("ordem_producao_id", ordemProducaoId).single();
  return data?.id;
}

async function ultimaNotificacao(profileId, tipoEvento) {
  const { data } = await admin
    .from("notificacoes")
    .select("*")
    .eq("profile_id", profileId)
    .eq("tipo_evento", tipoEvento)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function main() {
  console.log("Preparando tenants (admin, outro tenant)...");
  const admTenant = await createTenant("notif-test-admin", "Notif Admin Teste", "15a01", "ADMIN");
  const otherTenant = await createTenant("notif-test-other", "Notif Outro Teste", "15a02", "ADMIN");

  console.log("\n1. notificar_usuarios_com_permissao() — só quem tem a permissão certa recebe");
  {
    const { userId: destinatarioId } = await criarUsuarioComPermissao(
      admTenant.company, "15b01", "SO_PEDIDOS_MANAGE", "pedidos", ["manage"],
    );
    const { client: semPermClient, userId: semPermId } = await criarUsuarioComPermissao(
      admTenant.company, "15b02", "SO_QUALIDADE_MANAGE", "qualidade", ["manage"],
    );

    const fixture = await prepararPedidoConferencia(admTenant, "301");
    // Quem abre a pendência precisa de pedidos.manage — reaproveita admTenant.
    const { data: pendenciaId, error } = await admTenant.client.rpc("abrir_pendencia_pedido", {
      p_id: fixture.pedidoId, p_descricao: "Aguardando confirmação de medida",
    });
    check("abrir_pendencia_pedido() executa sem erro", !error && !!pendenciaId);

    const notifDestinatario = await ultimaNotificacao(destinatarioId, "pedidos.pendencia_aberta");
    check("usuário com pedidos.manage recebe notificação", !!notifDestinatario);
    check("título traz o número do pedido", notifDestinatario?.titulo?.includes(fixture.pedidoNumero));
    check("prioridade é 'atencao'", notifDestinatario?.prioridade === "atencao");
    check("email_status é 'nao_aplicavel' pra prioridade não-crítica", notifDestinatario?.email_status === "nao_aplicavel");
    check("entity_type/entity_id apontam pra pedido_pendencia criada", notifDestinatario?.entity_type === "pedido_pendencia" && notifDestinatario?.entity_id === pendenciaId);

    const notifSemPerm = await ultimaNotificacao(semPermId, "pedidos.pendencia_aberta");
    check("usuário SEM pedidos.manage (só qualidade.manage) não recebe notificação", !notifSemPerm);

    const { data: viaSelectDestinatario } = await admTenant.client
      .from("notificacoes")
      .select("id")
      .eq("id", notifDestinatario.id)
      .maybeSingle();
    check("RLS: notificação não é lida pelo tenant como um todo (client genérico do admin não vê a de outro perfil)", !viaSelectDestinatario);

    const { data: viaSelectSemPerm } = await semPermClient.from("notificacoes").select("id").eq("id", notifDestinatario.id).maybeSingle();
    check("RLS: outro usuário da MESMA empresa não lê notificação de perfil alheio", !viaSelectSemPerm);
  }

  console.log("\n2. marcar_notificacao_lida()");
  {
    const { client: destClient, userId: destinatarioId } = await criarUsuarioComPermissao(
      admTenant.company, "15c01", "SO_PEDIDOS_MANAGE_2", "pedidos", ["manage"],
    );
    const fixture = await prepararPedidoConferencia(admTenant, "302");
    await admTenant.client.rpc("abrir_pendencia_pedido", { p_id: fixture.pedidoId, p_descricao: "teste leitura" });
    const notif = await ultimaNotificacao(destinatarioId, "pedidos.pendencia_aberta");

    const { data: antes } = await destClient.from("notificacoes").select("id").eq("lida", false).eq("id", notif.id).maybeSingle();
    check("destinatário enxerga a própria notificação via SELECT (RLS)", !!antes);

    const { error: marcarOutroError } = await otherTenant.client.rpc("marcar_notificacao_lida", { p_id: notif.id });
    check("tenant B não marca como lida notificação do tenant A", !!marcarOutroError);

    const { error: marcarError } = await destClient.rpc("marcar_notificacao_lida", { p_id: notif.id });
    check("destinatário marca a própria notificação como lida", !marcarError);

    const { data: depois } = await admin.from("notificacoes").select("lida, lida_em").eq("id", notif.id).single();
    check("lida=true e lida_em preenchido", depois?.lida === true && !!depois?.lida_em);
  }

  console.log("\n3. OP bloqueada por medição não confirmada (TÓPICO 4) — notifica producao.planejar/manage");
  {
    await admTenant.client.rpc("upsert_measurement_rule", {
      p_tipo_item: "produto_acabado", p_exige_medicao_confirmada: true, p_ativo: true,
    });
    const { userId: pcpId } = await criarUsuarioComPermissao(admTenant.company, "15d01", "SO_PRODUCAO_PLANEJAR", "producao", ["planejar"]);

    const fixture = await prepararPedidoConferencia(admTenant, "303", { itemTipo: "produto_acabado" });
    await admTenant.client.rpc("liberar_pedido", { p_id: fixture.pedidoId });
    const { data: opId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: fixture.pedidoItemId });

    const { data: op } = await admin.from("ordens_producao").select("numero, situacao").eq("id", opId).single();
    check("OP nasce bloqueada por medição (fixture)", op?.situacao === "bloqueada");

    const notif = await ultimaNotificacao(pcpId, "producao.ordem_bloqueada");
    check("usuário com producao.planejar recebe notificação de OP bloqueada", !!notif);
    check("título traz o número da OP", notif?.titulo?.includes(op.numero));
    check("prioridade é 'importante'", notif?.prioridade === "importante");
  }

  console.log("\n4. Não conformidade aberta (TÓPICO 8) — notifica qualidade.manage");
  {
    const { userId: qualidadeId } = await criarUsuarioComPermissao(admTenant.company, "15e01", "SO_QUALIDADE_MANAGE_2", "qualidade", ["manage"]);

    const fixture = await prepararPedidoConferencia(admTenant, "304");
    await admTenant.client.rpc("liberar_pedido", { p_id: fixture.pedidoId });
    const { data: opId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: fixture.pedidoItemId });
    const opOperacaoId = await operacaoUnica(opId);
    await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: opOperacaoId, p_quantidade_produzida: fixture.quantidade, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opId });

    const { data: op } = await admin.from("ordens_producao").select("numero").eq("id", opId).single();
    const { error: inspecaoError } = await admTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: opId, p_quantidade_aprovada: fixture.quantidade - 1, p_quantidade_reprovada: 1, p_observacoes: "1 peça trincada",
    });
    check("registrar_inspecao_qualidade() executa sem erro", !inspecaoError);

    const notif = await ultimaNotificacao(qualidadeId, "qualidade.nao_conformidade_aberta");
    check("usuário com qualidade.manage recebe notificação de NC aberta", !!notif);
    check("título traz o número da OP", notif?.titulo?.includes(op.numero));
    check("prioridade é 'importante'", notif?.prioridade === "importante");
  }

  console.log("\n5. Isolamento cross-tenant geral");
  {
    const { data: notifOutroTenant } = await otherTenant.client.from("notificacoes").select("id");
    check("tenant B nunca recebeu nenhuma notificação gerada no tenant A", (notifOutroTenant ?? []).length === 0);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
