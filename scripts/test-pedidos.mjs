// Testes automatizados do TÓPICO 3 — Pedidos, recorte mínimo do M1 (PLANO
// DE ENTREGA — MVP DO PILOTO v1.0, outubro): conversão de orçamento
// aprovado, conferência, pendências e liberação. Sem cadastro direto de
// pedido nem importação neste recorte.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-pedidos.mjs

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

async function prepararOrcamentoAprovado(tenant, sufixo) {
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: `ORC${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido", p_prefixo: `PED${sufixo}-`, p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });

  const { data: pessoaId } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CNPJ", p_documento: `1122233300${sufixo}`, p_nome: "JR Box Vidros",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  const { data: obraId } = await tenant.client.rpc("upsert_obra", {
    p_id: null, p_pessoa_id: pessoaId, p_nome: "Obra Teste",
    p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });

  const { data: itemId } = await tenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: `VD-${sufixo}`, p_descricao: "Vidro temperado 10mm",
    p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
    p_situacao: "ativo",
  });

  const { data: orcamentoId } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: obraId, p_validade: null,
    p_condicao_comercial: null, p_observacoes: null,
  });
  await tenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: 5, p_preco_unitario: 200,
  });
  await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });

  return { pessoaId, obraId, itemId, orcamentoId };
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão, outro tenant)...");
  const admTenant = await createTenant("pedidos-test-admin", "Pedidos Admin Teste", "9901", "ADMIN");
  const noPermTenant = await createTenant("pedidos-test-noperm", "Pedidos SemPerm Teste", "9902", "COMERCIAL");
  const otherTenant = await createTenant("pedidos-test-other", "Pedidos Outro Teste", "9903", "ADMIN");

  console.log("\n0. Massa de dados — orçamento aprovado pronto para converter");
  const massa = await prepararOrcamentoAprovado(admTenant, "1");
  check("orçamento aprovado preparado", !!massa.orcamentoId);

  console.log("\n1. Conversão exige pedidos.manage");
  {
    const { error } = await noPermTenant.client.rpc("converter_orcamento_em_pedido", {
      p_orcamento_id: massa.orcamentoId,
    });
    check("sem pedidos.manage não converte orçamento", !!error);
  }

  console.log("\n2. Conversão exige orçamento aprovado");
  {
    const { data: rascunhoId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: massa.pessoaId, p_obra_id: null, p_validade: null,
      p_condicao_comercial: null, p_observacoes: null,
    });
    const { error } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: rascunhoId });
    check("orçamento em rascunho não pode ser convertido", !!error);
  }

  console.log("\n3. Converte orçamento aprovado — número gerado, itens copiados, status inicial");
  let pedidoId;
  {
    const { data: id, error } = await admTenant.client.rpc("converter_orcamento_em_pedido", {
      p_orcamento_id: massa.orcamentoId,
    });
    check("conversão bem-sucedida", !error && !!id);
    pedidoId = id;

    const { data: row } = await admin.from("pedidos").select("numero, status, pessoa_id, obra_id").eq("id", id).single();
    check("pedido nasce em 'recebido' com número gerado", row?.status === "recebido" && row?.numero === "PED1-0001");
    check("pedido herda pessoa e obra do orçamento", row?.pessoa_id === massa.pessoaId && row?.obra_id === massa.obraId);

    const { data: itensCopiados } = await admin.from("pedido_itens").select("*").eq("pedido_id", id);
    check("itens do orçamento foram copiados para o pedido", (itensCopiados ?? []).length === 1 && itensCopiados[0].quantidade === 5);
  }

  console.log("\n4. Mesmo orçamento não pode ser convertido duas vezes");
  {
    const { error } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: massa.orcamentoId });
    check("segunda conversão do mesmo orçamento é rejeitada", !!error);
  }

  console.log("\n5. Conferência e pendência");
  let pendenciaId;
  {
    const { error: liberarCedoError } = await admTenant.client.rpc("liberar_pedido", { p_id: pedidoId });
    check("não pode liberar pedido ainda 'recebido'", !!liberarCedoError);

    const { error: iniciarError } = await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
    check("inicia conferência", !iniciarError);

    const { data: pendId, error: pendError } = await admTenant.client.rpc("abrir_pendencia_pedido", {
      p_id: pedidoId, p_descricao: "Confirmar medida em obra",
    });
    check("abre pendência", !pendError && !!pendId);
    pendenciaId = pendId;

    const { data: row } = await admin.from("pedidos").select("status").eq("id", pedidoId).single();
    check("pedido vai para 'pendente' com pendência aberta", row?.status === "pendente");

    const { error: liberarComPendenciaError } = await admTenant.client.rpc("liberar_pedido", { p_id: pedidoId });
    check("não pode liberar com pendência aberta", !!liberarComPendenciaError);
  }

  console.log("\n6. Resolver pendência volta o pedido para conferência");
  {
    const { error } = await admTenant.client.rpc("resolver_pendencia_pedido", {
      p_pendencia_id: pendenciaId, p_resolucao: "Medida confirmada",
    });
    check("resolve pendência", !error);

    const { data: row } = await admin.from("pedidos").select("status").eq("id", pedidoId).single();
    check("pedido volta para 'em_conferencia' sem pendência aberta", row?.status === "em_conferencia");

    const { error: resolverDeNovoError } = await admTenant.client.rpc("resolver_pendencia_pedido", {
      p_pendencia_id: pendenciaId, p_resolucao: "de novo",
    });
    check("pendência já resolvida não pode ser resolvida de novo", !!resolverDeNovoError);
  }

  console.log("\n7. Liberação");
  {
    const { error } = await admTenant.client.rpc("liberar_pedido", { p_id: pedidoId });
    check("libera pedido sem pendência aberta", !error);

    const { data: row } = await admin.from("pedidos").select("status").eq("id", pedidoId).single();
    check("status vira 'liberado'", row?.status === "liberado");

    const { error: cancelarLiberadoError } = await admTenant.client.rpc("cancelar_pedido", { p_id: pedidoId });
    check("pedido liberado não pode ser cancelado", !!cancelarLiberadoError);

    const { error: pendenciaAposLiberarError } = await admTenant.client.rpc("abrir_pendencia_pedido", {
      p_id: pedidoId, p_descricao: "tarde demais",
    });
    check("não pode abrir pendência em pedido liberado", !!pendenciaAposLiberarError);
  }

  console.log("\n8. Cancelamento (em outro pedido, antes da liberação)");
  {
    const massa2 = await prepararOrcamentoAprovado(admTenant, "2");
    const { data: pedidoId2 } = await admTenant.client.rpc("converter_orcamento_em_pedido", {
      p_orcamento_id: massa2.orcamentoId,
    });
    const { error } = await admTenant.client.rpc("cancelar_pedido", { p_id: pedidoId2 });
    check("pedido 'recebido' pode ser cancelado", !error);

    const { data: row } = await admin.from("pedidos").select("status").eq("id", pedidoId2).single();
    check("status vira 'cancelado'", row?.status === "cancelado");
  }

  console.log("\n9. Isolamento entre tenants");
  {
    const { data: crossPedidos } = await otherTenant.client
      .from("pedidos")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga pedidos do tenant A", (crossPedidos ?? []).length === 0);

    const { error: crossLiberarError } = await otherTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
    check("tenant B não consegue alterar pedido do tenant A", !!crossLiberarError);
  }

  console.log("\n10. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "pedidos.pedido_convertido_de_orcamento",
        "pedidos.conferencia_iniciada",
        "pedidos.pendencia_aberta",
        "pedidos.pendencia_resolvida",
        "pedidos.pedido_liberado",
        "pedidos.pedido_cancelado",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("pedido_convertido_de_orcamento registrado", actions.has("pedidos.pedido_convertido_de_orcamento"));
    check("conferencia_iniciada registrado", actions.has("pedidos.conferencia_iniciada"));
    check("pendencia_aberta registrado", actions.has("pedidos.pendencia_aberta"));
    check("pendencia_resolvida registrado", actions.has("pedidos.pendencia_resolvida"));
    check("pedido_liberado registrado", actions.has("pedidos.pedido_liberado"));
    check("pedido_cancelado registrado", actions.has("pedidos.pedido_cancelado"));
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
