// Testes automatizados do TÓPICO 12 — BI, Fase 2 ainda básica
// (ADR-002 v2.6 §4.16): indicadores operacionais básicos (contagens/somas
// por status) + filtro de período + quatro indicadores calculados
// (ticket médio, conversão orçamento→pedido, taxa de não conformidade,
// OTIF básico). Sem KPI versionado, drill-down, DRE ou assistente
// analítico.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-bi.mjs

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

// Pedido liberado -> OP concluída -> aprovada -> expedida -> entregue
// (100%) -> instalação concluída e aceita. Mesmo pipeline de
// test-instalacao.mjs, resumido, só pra gerar 1 linha em cada módulo.
async function prepararPipelineCompleto(tenant, sufixo, quantidade = 10, precoUnitario = 100) {
  for (const [dt, pfx] of [
    ["orcamento", "ORC"], ["pedido", "PED"], ["ordem_producao", "OP"],
    ["expedicao", "EXP"], ["instalacao", "INST"], ["titulo_financeiro", "TIT"],
  ]) {
    await tenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: dt, p_prefixo: `${pfx}${sufixo}-`, p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
  }

  const { data: pessoaId } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CNPJ", p_documento: `1155566600${sufixo}`, p_nome: "JR Box Vidros",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  const { data: obraId } = await tenant.client.rpc("upsert_obra", {
    p_id: null, p_pessoa_id: pessoaId, p_nome: `Obra ${sufixo}`,
    p_logradouro: "Rua Teste, 100", p_cidade: "São Paulo", p_uf: "SP", p_cep: "01000-000", p_situacao: "ativo",
  });

  const { data: itemId } = await tenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: `VD-BI-${sufixo}`, p_descricao: "Vidro temperado 10mm",
    p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2", p_situacao: "ativo",
  });

  const { data: orcamentoId } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: obraId, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
  });
  await tenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: quantidade, p_preco_unitario: precoUnitario,
  });
  await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });
  const { data: pedidoId } = await tenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  await tenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
  await tenant.client.rpc("liberar_pedido", { p_id: pedidoId });

  const { data: pedidoItem } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).single();

  const { data: opId } = await tenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedidoItem.id });
  // TÓPICO 4 §16 (Fase 2): sem roteiro configurado, a OP nasce com uma
  // única op_operacao "Produção" — apontar_producao() aponta nela.
  const { data: opOperacao } = await admin.from("op_lote_operacoes").select("id").eq("ordem_producao_id", opId).single();
  await tenant.client.rpc("apontar_producao", {
    p_op_lote_operacao_id: opOperacao?.id, p_quantidade_produzida: quantidade, p_quantidade_rejeitada: 1, p_quantidade_retrabalho: 0, p_observacao: null,
  });
  await tenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opId });
  await tenant.client.rpc("registrar_inspecao_qualidade", { p_ordem_producao_id: opId, p_quantidade_aprovada: quantidade, p_quantidade_reprovada: 0, p_observacoes: null });

  const { data: expedicaoId } = await tenant.client.rpc("criar_expedicao", { p_pedido_id: pedidoId });
  const { data: expItemId } = await tenant.client.rpc("adicionar_item_expedicao", { p_expedicao_id: expedicaoId, p_pedido_item_id: pedidoItem.id, p_quantidade: quantidade });
  await tenant.client.rpc("conferir_expedicao", { p_expedicao_id: expedicaoId });
  await tenant.client.rpc("registrar_saida_expedicao", { p_expedicao_id: expedicaoId });
  await tenant.client.rpc("confirmar_entrega_item_expedicao", { p_expedicao_item_id: expItemId, p_quantidade_entregue: quantidade });

  const { data: equipeId } = await tenant.client.rpc("criar_equipe_instalacao", { p_nome: `Equipe BI ${sufixo}` });
  const { data: instalacaoId } = await tenant.client.rpc("criar_instalacao", { p_pedido_id: pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-01-10" });
  await tenant.client.rpc("adicionar_item_instalacao", { p_instalacao_id: instalacaoId, p_pedido_item_id: pedidoItem.id, p_quantidade: quantidade });
  await tenant.client.rpc("iniciar_execucao_instalacao", { p_instalacao_id: instalacaoId });
  const { data: instItem } = await admin.from("instalacao_itens").select("id").eq("instalacao_id", instalacaoId).single();
  await tenant.client.rpc("registrar_execucao_item_instalacao", { p_instalacao_item_id: instItem.id, p_quantidade_instalada: quantidade });
  await tenant.client.rpc("registrar_dano_instalacao", { p_instalacao_item_id: instItem.id, p_quantidade: 1, p_causa: "transporte", p_descricao: "teste BI" });
  await tenant.client.rpc("concluir_instalacao", { p_instalacao_id: instalacaoId });
  await tenant.client.rpc("registrar_aceite_instalacao", { p_instalacao_id: instalacaoId, p_nome_cliente: "Fulano" });

  await tenant.client.rpc("criar_necessidade_compra", { p_item_id: itemId, p_quantidade: 5, p_data_necessaria: null, p_origem: "manual", p_observacoes: null });

  const { data: tituloIds } = await tenant.client.rpc("gerar_titulos_pedido", { p_pedido_id: pedidoId, p_parcelas: [{ valor: quantidade * precoUnitario, vencimento: "2020-01-01" }] });
  await tenant.client.rpc("registrar_recebimento_titulo", { p_titulo_id: tituloIds[0], p_valor: quantidade * precoUnitario / 2, p_data_recebimento: "2027-01-05" });

  return { pedidoId, valorPedido: quantidade * precoUnitario };
}

async function main() {
  console.log("Preparando tenants (admin com bi.view, sem-permissão, outro tenant)...");
  const admTenant = await createTenant("bi-test-admin", "BI Admin Teste", "12b01", "ADMIN");
  const noPermTenant = await createTenant("bi-test-admin", "BI SemPerm Teste", "12b02", "PRODUCAO", admTenant.company);
  const otherTenant = await createTenant("bi-test-other", "BI Outro Teste", "12b03", "ADMIN");

  console.log("\n0. Massa de dados — pipeline completo (pedido->produção->qualidade->expedição->instalação->suprimentos->financeiro)");
  const massa = await prepararPipelineCompleto(admTenant, "1", 10, 100);
  check("pipeline preparado", !!massa.pedidoId);

  // Massa num segundo tenant, pra provar isolamento nos agregados.
  await prepararPipelineCompleto(otherTenant, "9", 4, 50);

  console.log("\n1. dashboard_operacional() exige bi.view");
  {
    const { error } = await noPermTenant.client.rpc("dashboard_operacional");
    check("sem bi.view (papel PRODUCAO) não consulta o dashboard", !!error);
  }

  console.log("\n2. dashboard_operacional() sucesso — estrutura e contagens batem com o pipeline");
  {
    const { data, error } = await admTenant.client.rpc("dashboard_operacional");
    check("ADMIN consulta o dashboard sem erro", !error && !!data);

    check("pedidos.por_status.liberado == 1", data?.pedidos?.por_status?.liberado === 1);
    check("pedidos.valor_liberado == 1000", Number(data?.pedidos?.valor_liberado) === 1000);

    check("producao.por_status.concluida == 1", data?.producao?.por_status?.concluida === 1);
    check("producao.quantidade_produzida == 10 e quantidade_perdida == 1", Number(data?.producao?.quantidade_produzida) === 10 && Number(data?.producao?.quantidade_perdida) === 1);

    check("qualidade.inspecoes_por_resultado.aprovado == 1", data?.qualidade?.inspecoes_por_resultado?.aprovado === 1);

    check("expedicao.por_status.expedida == 1", data?.expedicao?.por_status?.expedida === 1);
    check("expedicao.itens_com_pendencia == 0 (entrega total)", data?.expedicao?.itens_com_pendencia === 0);

    check("instalacao.por_status.aceita == 1", data?.instalacao?.por_status?.aceita === 1);
    check("instalacao.danos_por_causa.transporte == 1", data?.instalacao?.danos_por_causa?.transporte === 1);

    check("suprimentos.necessidades_por_status.aberta == 1", data?.suprimentos?.necessidades_por_status?.aberta === 1);

    check("financeiro.titulos_por_status.parcial == 1", data?.financeiro?.titulos_por_status?.parcial === 1);
    check("financeiro.valor_total == 1000 e valor_recebido == 500", Number(data?.financeiro?.valor_total) === 1000 && Number(data?.financeiro?.valor_recebido) === 500);
    check("financeiro.titulos_vencidos == 1 (vencimento 2020, ainda parcial)", data?.financeiro?.titulos_vencidos === 1);
  }

  console.log("\n3. Isolamento entre tenants — os agregados do tenant A não incluem o tenant B");
  {
    const { data: dataA } = await admTenant.client.rpc("dashboard_operacional");
    const { data: dataB } = await otherTenant.client.rpc("dashboard_operacional");
    check("tenant A só enxerga 1 pedido liberado (não 2)", dataA?.pedidos?.por_status?.liberado === 1);
    check("tenant B só enxerga o próprio pedido liberado (não o do tenant A)", dataB?.pedidos?.por_status?.liberado === 1);
    check("valores agregados diferem entre tenants (dados diferentes)", Number(dataA?.pedidos?.valor_liberado) !== Number(dataB?.pedidos?.valor_liberado));
  }

  console.log("\n4. dashboard_operacional() não depende de nenhuma permissão de módulo operacional, só bi.view");
  {
    // PRODUCAO tem producao.manage mas não bi.view — já provado no teste 1
    // que isso não basta. Aqui provamos o oposto: um papel customizado só
    // com bi.view (sem nenhuma outra permissão de módulo) consegue ler.
    const soViewRole = await admin.from("roles").insert({ company_id: admTenant.company.id, key: "BI_SO_VIEW", name: "BI só view" }).select().single();
    const { data: biPerm } = await admin.from("permissions").select("id").eq("resource", "bi").eq("action", "view").single();
    await admin.from("role_permissions").insert({ role_id: soViewRole.data.id, permission_id: biPerm.id });

    const email = "12b04.bi-test-admin@users.internal";
    const { data: created } = await admin.auth.admin.createUser({ email, password: "senha-de-teste-123456", email_confirm: true });
    let userId = created?.user?.id;
    if (!userId) {
      const { data: list } = await admin.auth.admin.listUsers();
      userId = list.users.find((u) => u.email === email)?.id;
    }
    await admin.from("profiles").upsert({ id: userId, company_id: admTenant.company.id, login_identifier: "12b04", display_name: "Só BI" }, { onConflict: "id" });
    await admin.from("user_roles").insert({ profile_id: userId, role_id: soViewRole.data.id });
    const soViewClient = createClient(url, anonKey);
    await soViewClient.auth.signInWithPassword({ email, password: "senha-de-teste-123456" });

    const { data, error } = await soViewClient.rpc("dashboard_operacional");
    check("papel só com bi.view (sem pedidos.view/producao.view/etc.) consegue ler o dashboard inteiro", !error && data?.pedidos?.por_status?.liberado === 1);
  }

  console.log("\n5. Indicadores calculados (Fase 2, ADR-002 v2.6 §4.16) batem com o pipeline");
  {
    const { data, error } = await admTenant.client.rpc("dashboard_operacional");
    check("ADMIN consulta o dashboard sem erro", !error && !!data);

    check("ticket_medio == 1000 (1 pedido liberado de 1000)", Number(data?.indicadores?.ticket_medio) === 1000);
    check("pedidos_liberados_amostra == 1", data?.indicadores?.pedidos_liberados_amostra === 1);

    check("taxa_conversao_orcamento_pedido == 100 (1 orçamento, 1 convertido)", Number(data?.indicadores?.taxa_conversao_orcamento_pedido) === 100);
    check("orcamentos_amostra == 1", data?.indicadores?.orcamentos_amostra === 1);

    check("taxa_nao_conformidade == 0 (1 inspeção aprovada, 0 reprovada)", Number(data?.indicadores?.taxa_nao_conformidade) === 0);
    check("inspecoes_amostra == 1", data?.indicadores?.inspecoes_amostra === 1);

    // pedidos.previsao_entrega nunca é preenchido por nenhuma função do
    // sistema (gap pré-existente, fora do escopo desta fase) — "no prazo"
    // não deve afirmar um percentual sem dado pra sustentar (§10), mas
    // "integral" não depende disso e deve fechar em 100% (entrega total).
    check("otif.amostra_com_previsao == 0 (previsao_entrega nunca é preenchida)", data?.indicadores?.otif?.amostra_com_previsao === 0);
    check("otif.no_prazo_pct é null (sem dado pra sustentar)", data?.indicadores?.otif?.no_prazo_pct === null);
    check("otif.integral_pct == 100 (entrega total, sem pendência)", Number(data?.indicadores?.otif?.integral_pct) === 100);
    check("otif.amostra == 1 (1 expedição expedida)", data?.indicadores?.otif?.amostra === 1);
  }

  console.log("\n6. Filtro de período (p_data_inicio/p_data_fim)");
  {
    const { data: dataFuturo, error: e1 } = await admTenant.client.rpc("dashboard_operacional", {
      p_data_inicio: "2099-01-01", p_data_fim: "2099-12-31",
    });
    check("período no futuro não dá erro", !e1);
    check("período no futuro não enxerga o pedido liberado do pipeline", (dataFuturo?.pedidos?.por_status?.liberado ?? 0) === 0);
    check("período no futuro devolve indicadores como 'sem dados' (amostra 0)", dataFuturo?.indicadores?.ticket_medio === null && dataFuturo?.indicadores?.pedidos_liberados_amostra === 0);

    const { data: dataAmplo, error: e2 } = await admTenant.client.rpc("dashboard_operacional", {
      p_data_inicio: "2020-01-01", p_data_fim: "2099-12-31",
    });
    check("período amplo não dá erro", !e2);
    check("período amplo enxerga o mesmo pedido liberado do recorte sem filtro", dataAmplo?.pedidos?.por_status?.liberado === 1);

    const { error: e3 } = await admTenant.client.rpc("dashboard_operacional", { p_data_inicio: "2027-06-01", p_data_fim: "2027-01-01" });
    check("data_fim anterior à data_inicio é rejeitada", !!e3);

    const { data: dataEcoa } = await admTenant.client.rpc("dashboard_operacional", { p_data_inicio: "2020-01-01", p_data_fim: "2099-12-31" });
    check("retorno ecoa o período recebido (§44)", dataEcoa?.periodo?.data_inicio === "2020-01-01" && dataEcoa?.periodo?.data_fim === "2099-12-31");
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
