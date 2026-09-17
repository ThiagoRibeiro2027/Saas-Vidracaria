// Testes automatizados do TÓPICO 4 — Produção (PCP). Cobre o recorte
// mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0, novembro:
// apontamento, conclusão, cancelamento, lista de corte §54) e a Fase 1 da
// ampliação de escopo (ADR-002 v2.2, 2026-09-16): produção parcial (1
// pedido_item pode ter várias OPs, sem ultrapassar a quantidade do item),
// situação clara da OP com bloqueio por medida não confirmada (TÓPICO 16
// §7) e engenharia liberada versionada (TÓPICO 4 §4).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-producao.mjs

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

async function prepararPedidoLiberado(tenant, sufixo, { itemTipo = "materia_prima", quantidade = 5, comObra = false } = {}) {
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

  // Erros das chamadas de fixture abaixo são logados (não só ignorados) —
  // sem isso, uma falha aqui (ex.: instabilidade pontual do Postgres local
  // sob a suíte inteira rodando em sequência) só aparece muito mais tarde
  // como "Cannot read properties of null", sem indicar qual chamada
  // realmente falhou.
  const { data: pessoaId, error: pessoaErr } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CNPJ", p_documento: `1122233300${sufixo}`, p_nome: "JR Box Vidros",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  if (pessoaErr) console.error("[fixture] upsert_pessoa falhou:", pessoaErr);
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  let obraId = null;
  if (comObra) {
    const { data } = await tenant.client.rpc("upsert_obra", {
      p_id: null, p_pessoa_id: pessoaId, p_nome: "Obra Teste Produção",
      p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    obraId = data;
  }

  const { data: itemId, error: itemErr } = await tenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: `VD-${sufixo}`, p_descricao: "Vidro temperado 10mm",
    p_tipo: itemTipo, p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
    p_situacao: "ativo",
  });
  if (itemErr) console.error("[fixture] upsert_item falhou:", itemErr);

  const { data: orcamentoId, error: orcErr } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: obraId, p_validade: null,
    p_condicao_comercial: null, p_observacoes: null,
  });
  if (orcErr) console.error("[fixture] upsert_orcamento falhou:", orcErr);
  const { error: orcItemErr } = await tenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: quantidade, p_preco_unitario: 100,
  });
  if (orcItemErr) console.error("[fixture] upsert_orcamento_item falhou:", orcItemErr);
  const { error: decidirErr } = await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });
  if (decidirErr) console.error("[fixture] decidir_orcamento falhou:", decidirErr);

  const { data: pedidoId, error: convErr } = await tenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  if (convErr) console.error("[fixture] converter_orcamento_em_pedido falhou:", convErr);
  const { error: confErr } = await tenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
  if (confErr) console.error("[fixture] iniciar_conferencia_pedido falhou:", confErr);
  const { error: libErr } = await tenant.client.rpc("liberar_pedido", { p_id: pedidoId });
  if (libErr) console.error("[fixture] liberar_pedido falhou:", libErr);

  const { data: pedidoItem } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).single();

  return { pessoaId, obraId, itemId, itemTipo, pedidoId, pedidoItemId: pedidoItem.id, quantidade };
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão, outro tenant)...");
  const admTenant = await createTenant("producao-test-admin", "Produção Admin Teste", "9c01", "ADMIN");
  const noPermTenant = await createTenant("producao-test-noperm", "Produção SemPerm Teste", "9c02", "COMERCIAL");
  const otherTenant = await createTenant("producao-test-other", "Produção Outro Teste", "9c03", "ADMIN");

  console.log("\n0. Massa de dados — pedido liberado, item sem regra de medição (não bloqueia)");
  const massa = await prepararPedidoLiberado(admTenant, "1", { itemTipo: "materia_prima", quantidade: 5, comObra: true });
  check("pedido liberado com item preparado", !!massa.pedidoItemId);

  console.log("\n1. Escrita exige producao.manage");
  {
    const { error } = await noPermTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: massa.pedidoItemId });
    check("sem producao.manage não cria ordem de produção", !!error);
  }

  console.log("\n2. Criação exige pedido liberado");
  {
    const naoLiberada = await prepararPedidoLiberado(admTenant, "2a", { quantidade: 1 });
    // Sobrescreve o status pra 'recebido' só pra este teste (a função pública sempre libera).
    await admin.from("pedidos").update({ status: "recebido" }).eq("id", naoLiberada.pedidoId);
    const { error } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: naoLiberada.pedidoItemId });
    check("pedido não liberado não pode gerar ordem de produção", !!error);
  }

  console.log("\n3. Situação da OP e bloqueio por medida não confirmada (TÓPICO 16 §7, TÓPICO 4 §3)");
  // Ampliação de escopo (Fase 1): a OP passa a NASCER bloqueada em vez de
  // ter a criação recusada — situação clara, com motivo/origem/impacto/
  // ação, reavaliada a cada apontamento/conclusão.
  let itemProducaoId;
  const bloqueio = await prepararPedidoLiberado(admTenant, "3", { itemTipo: "produto_acabado", quantidade: 2 });
  {
    await admTenant.client.rpc("upsert_measurement_rule", {
      p_tipo_item: bloqueio.itemTipo, p_exige_medicao_confirmada: true, p_ativo: true,
    });

    const { data: opId, error } = await admTenant.client.rpc("criar_ordem_producao", {
      p_pedido_item_id: bloqueio.pedidoItemId,
    });
    check("OP nasce mesmo sem medida confirmada, em vez de ter a criação recusada", !error && !!opId);

    const { data: op } = await admin.from("ordens_producao").select("*").eq("id", opId).single();
    check(
      "OP nasce com situação 'bloqueada' e motivo/origem/ação preenchidos",
      op?.situacao === "bloqueada" && op?.origem_bloqueio === "medicao" && !!op?.motivo_bloqueio && !!op?.acao_necessaria,
    );

    const { error: apontarBloqueadaError } = await admTenant.client.rpc("apontar_producao", {
      p_ordem_producao_id: opId, p_quantidade_produzida: 1, p_quantidade_perdida: 0, p_observacao: null,
    });
    check("apontamento em OP bloqueada é rejeitado", !!apontarBloqueadaError);

    const { data: ipId } = await admTenant.client.rpc("criar_item_producao", { p_pedido_item_id: bloqueio.pedidoItemId });
    itemProducaoId = ipId;
    await admTenant.client.rpc("registrar_medicao", {
      p_id: itemProducaoId, p_ambiente: "Sala", p_largura_mm: 1200, p_altura_mm: 800,
    });
    await admTenant.client.rpc("confirmar_medicao", { p_id: itemProducaoId });

    const { error: apontarLiberadaError } = await admTenant.client.rpc("apontar_producao", {
      p_ordem_producao_id: opId, p_quantidade_produzida: 2, p_quantidade_perdida: 0, p_observacao: null,
    });
    check("apontamento aceito depois da medida confirmada (situação reavaliada automaticamente)", !apontarLiberadaError);

    const { data: opDepois } = await admin.from("ordens_producao").select("situacao, motivo_bloqueio").eq("id", opId).single();
    check(
      "situação volta a 'liberada' e motivo é limpo após a medida ser confirmada",
      opDepois?.situacao === "liberada" && opDepois?.motivo_bloqueio === null,
    );
  }

  console.log("\n3b. Engenharia liberada (TÓPICO 4 §4) — versionamento e permissão");
  let engenhariaV2Id;
  {
    const { error: semPermError } = await noPermTenant.client.rpc("liberar_engenharia", {
      p_pedido_item_id: massa.pedidoItemId, p_observacoes: null,
    });
    check("sem engenharia.manage não libera engenharia", !!semPermError);

    const { data: v1Id, error: v1Error } = await admTenant.client.rpc("liberar_engenharia", {
      p_pedido_item_id: massa.pedidoItemId, p_observacoes: "versão inicial",
    });
    check("ADMIN libera a primeira versão de engenharia", !v1Error && !!v1Id);

    const { data: v1 } = await admin.from("engenharia_versoes").select("*").eq("id", v1Id).single();
    check("primeira versão nasce com versao=1 e situação 'liberada'", v1?.versao === 1 && v1?.situacao === "liberada");

    const { data: v2Id } = await admTenant.client.rpc("liberar_engenharia", {
      p_pedido_item_id: massa.pedidoItemId, p_observacoes: "revisão",
    });
    engenhariaV2Id = v2Id;
    const { data: v1Depois } = await admin
      .from("engenharia_versoes")
      .select("situacao, superseded_by_id")
      .eq("id", v1Id)
      .single();
    check(
      "versão anterior vira 'substituida' e aponta pra nova ao liberar outra",
      v1Depois?.situacao === "substituida" && v1Depois?.superseded_by_id === v2Id,
    );

    const { data: crossVersoes } = await otherTenant.client
      .from("engenharia_versoes")
      .select("id")
      .eq("id", v2Id);
    check("tenant B não enxerga versão de engenharia do tenant A", (crossVersoes ?? []).length === 0);
  }

  console.log("\n4. Cria OP — número gerado, quantidade planejada, status inicial");
  let opId;
  {
    const { data, error } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: massa.pedidoItemId });
    check("ADMIN cria ordem de produção", !error && !!data);
    opId = data;

    const { data: op } = await admin.from("ordens_producao").select("*").eq("id", opId).single();
    check("OP nasce em 'planejada' com quantidade planejada correta", op?.status === "planejada" && Number(op?.quantidade_planejada) === massa.quantidade);
    check("OP nasce vinculada à versão de engenharia vigente (v2)", op?.engenharia_versao_id === engenhariaV2Id);
    // Prefixo específico não é confiável aqui: prepararPedidoLiberado()
    // reconfigura numbering_sequences (company-scoped) a cada chamada, e
    // várias chamadas acontecem entre a massa (passo 0) e esta OP (passo
    // 4) — o que importa é que o formato (prefixo OP<n>- + 4 dígitos) saiu
    // de fato de next_document_number(), não um valor fixo.
    check("número da OP segue o formato configurado (prefixo + 4 dígitos)", /^OP\d+-\d{4}$/.test(op?.numero ?? ""));
  }

  console.log("\n5. Produção parcial — soma das OPs nunca ultrapassa a quantidade do item (TÓPICO 4 §11-12)");
  {
    const parcial = await prepararPedidoLiberado(admTenant, "5", { quantidade: 10 });

    const { data: op1Id, error: op1Error } = await admTenant.client.rpc("criar_ordem_producao", {
      p_pedido_item_id: parcial.pedidoItemId, p_quantidade: 6,
    });
    check("primeira OP parcial (6 de 10) aceita", !op1Error && !!op1Id);

    const { data: op2Id, error: op2Error } = await admTenant.client.rpc("criar_ordem_producao", {
      p_pedido_item_id: parcial.pedidoItemId, p_quantidade: 3,
    });
    check("segunda OP parcial (3 de 10, saldo restante 1) aceita", !op2Error && !!op2Id);

    const { error: excedeError } = await admTenant.client.rpc("criar_ordem_producao", {
      p_pedido_item_id: parcial.pedidoItemId, p_quantidade: 2,
    });
    check("terceira OP que ultrapassa o saldo restante (2 > 1) é rejeitada", !!excedeError);

    const { data: op3Id, error: op3Error } = await admTenant.client.rpc("criar_ordem_producao", {
      p_pedido_item_id: parcial.pedidoItemId,
    });
    check("OP sem quantidade explícita usa o saldo restante (1)", !op3Error && !!op3Id);
    const { data: op3 } = await admin.from("ordens_producao").select("quantidade_planejada").eq("id", op3Id).single();
    check("OP criada com o saldo restante correto (1)", Number(op3?.quantidade_planejada) === 1);

    const { error: semSaldoError } = await admTenant.client.rpc("criar_ordem_producao", {
      p_pedido_item_id: parcial.pedidoItemId,
    });
    check("nova OP sem saldo restante (0) é rejeitada", !!semSaldoError);
  }

  console.log("\n6. Apontamento — validações e efeito");
  {
    const { error: negativoError } = await admTenant.client.rpc("apontar_producao", {
      p_ordem_producao_id: opId, p_quantidade_produzida: -1, p_quantidade_perdida: 0, p_observacao: null,
    });
    check("apontamento com quantidade negativa é rejeitado", !!negativoError);

    const { error: zeradoError } = await admTenant.client.rpc("apontar_producao", {
      p_ordem_producao_id: opId, p_quantidade_produzida: 0, p_quantidade_perdida: 0, p_observacao: null,
    });
    check("apontamento zerado (produzida e perdida) é rejeitado", !!zeradoError);

    const { error } = await admTenant.client.rpc("apontar_producao", {
      p_ordem_producao_id: opId, p_quantidade_produzida: 2, p_quantidade_perdida: 0.5, p_observacao: "primeiro corte",
    });
    check("apontamento válido aceito", !error);

    const { data: op } = await admin.from("ordens_producao").select("*").eq("id", opId).single();
    check("quantidade_produzida acumulada", Number(op?.quantidade_produzida) === 2);
    check("quantidade_perdida acumulada", Number(op?.quantidade_perdida) === 0.5);
    check("status vira 'em_producao' após o primeiro apontamento", op?.status === "em_producao");
  }

  console.log("\n7. Múltiplos apontamentos acumulam até a quantidade planejada");
  {
    const { error } = await admTenant.client.rpc("apontar_producao", {
      p_ordem_producao_id: opId, p_quantidade_produzida: 3, p_quantidade_perdida: 0, p_observacao: "segundo corte",
    });
    check("segundo apontamento aceito", !error);

    const { data: op } = await admin.from("ordens_producao").select("quantidade_produzida").eq("id", opId).single();
    check("quantidade_produzida soma os dois apontamentos (5 de 5)", Number(op?.quantidade_produzida) === 5);
  }

  console.log("\n8. Conclusão exige quantidade produzida >= planejada");
  {
    const cedo = await prepararPedidoLiberado(admTenant, "8", { quantidade: 10 });
    const { data: opCedoId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: cedo.pedidoItemId });
    await admTenant.client.rpc("apontar_producao", {
      p_ordem_producao_id: opCedoId, p_quantidade_produzida: 4, p_quantidade_perdida: 0, p_observacao: null,
    });
    const { error: cedoError } = await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opCedoId });
    check("concluir antes de atingir a quantidade planejada é rejeitado", !!cedoError);

    const { error } = await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opId });
    check("conclui ordem de produção com quantidade atingida", !error);

    const { data: op } = await admin.from("ordens_producao").select("status").eq("id", opId).single();
    check("status vira 'concluida'", op?.status === "concluida");
  }

  console.log("\n9. OP concluída não aceita novo apontamento nem nova conclusão");
  {
    const { error: apontarError } = await admTenant.client.rpc("apontar_producao", {
      p_ordem_producao_id: opId, p_quantidade_produzida: 1, p_quantidade_perdida: 0, p_observacao: null,
    });
    check("apontar em OP concluída é rejeitado", !!apontarError);

    const { error: concluirDeNovoError } = await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opId });
    check("concluir OP já concluída de novo é rejeitado", !!concluirDeNovoError);
  }

  console.log("\n10. Cancelamento");
  {
    const { error: cancelarConcluidaError } = await admTenant.client.rpc("cancelar_ordem_producao", {
      p_ordem_producao_id: opId, p_motivo: "teste",
    });
    check("OP concluída não pode ser cancelada", !!cancelarConcluidaError);

    const cancelavel = await prepararPedidoLiberado(admTenant, "10", { quantidade: 1 });
    const { data: opCancelavelId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: cancelavel.pedidoItemId });

    const { error } = await admTenant.client.rpc("cancelar_ordem_producao", { p_ordem_producao_id: opCancelavelId, p_motivo: "pedido cancelado pelo cliente" });
    check("OP planejada pode ser cancelada", !error);

    const { data: op } = await admin.from("ordens_producao").select("status").eq("id", opCancelavelId).single();
    check("status vira 'cancelada'", op?.status === "cancelada");

    const { error: cancelarDeNovoError } = await admTenant.client.rpc("cancelar_ordem_producao", { p_ordem_producao_id: opCancelavelId, p_motivo: "de novo" });
    check("OP já cancelada não pode ser cancelada de novo", !!cancelarDeNovoError);
  }

  console.log("\n11. Lista de corte (TÓPICO 4 §54)");
  {
    // Achado de code-review (15/09): lista_corte() comparava
    // get_cutting_margin() contra itens.tipo (enum) em vez de
    // itens.classificacao (a classificação livre que get_cutting_margin
    // realmente usa — ver scripts/test-configuracoes.mjs). Sem configurar
    // uma margem de verdade aqui, o teste anterior passava com ou sem o
    // bug (NULL por falta de configuração é indistinguível de NULL por
    // comparar a coluna errada) — agora configura 4,5% pra
    // 'vidro_temperado' (mesma classificação usada em
    // prepararPedidoLiberado) e verifica o valor exato de volta.
    await admTenant.client.rpc("upsert_cutting_margin", {
      p_material_tipo: "vidro_temperado", p_processo: "", p_percentual: 4.5, p_ativo: true,
    });

    const { data: opParaLista } = await admin.from("ordens_producao").select("id").eq("pedido_item_id", bloqueio.pedidoItemId).single();
    const { data: linhas, error } = await admTenant.client.rpc("lista_corte", { p_ordem_producao_id: opParaLista.id });
    check("lista_corte() executa sem erro", !error && Array.isArray(linhas) && linhas.length === 1);
    const linha = linhas?.[0];
    check("lista_corte traz a medida confirmada em obra", Number(linha?.largura_mm) === 1200 && Number(linha?.altura_mm) === 800);
    check(
      "lista_corte traz a margem de quebra configurada pela classificação do item (TÓPICO 15)",
      Number(linha?.margem_quebra_percentual) === 4.5,
    );
    check("lista_corte traz pedido/pessoa/OP corretos", linha?.pessoa_nome === "JR Box Vidros" && linha?.numero?.length > 0);

    const { error: semPermError } = await noPermTenant.client.rpc("lista_corte", { p_ordem_producao_id: opParaLista.id });
    check("sem producao.view não consulta lista de corte de outra empresa", !!semPermError);
  }

  console.log("\n12. Isolamento entre tenants");
  {
    const { data: crossOps } = await otherTenant.client.from("ordens_producao").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga ordens de produção do tenant A", (crossOps ?? []).length === 0);

    const cancelavel2 = await prepararPedidoLiberado(admTenant, "12", { quantidade: 1 });
    const { data: opIsolamentoId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: cancelavel2.pedidoItemId });

    const { error: crossApontarError } = await otherTenant.client.rpc("apontar_producao", {
      p_ordem_producao_id: opIsolamentoId, p_quantidade_produzida: 1, p_quantidade_perdida: 0, p_observacao: null,
    });
    check("tenant B não consegue apontar produção em OP do tenant A", !!crossApontarError);

    const { error: crossCancelarError } = await otherTenant.client.rpc("cancelar_ordem_producao", {
      p_ordem_producao_id: opIsolamentoId, p_motivo: "invasão",
    });
    check("tenant B não consegue cancelar OP do tenant A", !!crossCancelarError);
  }

  console.log("\n13. next_document_number('ordem_producao') exige producao.manage (achado do code-review)");
  {
    const { error } = await noPermTenant.client.rpc("next_document_number", { p_document_type: "ordem_producao" });
    check("sem producao.manage não emite número de ordem de produção direto via RPC", !!error);

    const { data, error: comPermError } = await admTenant.client.rpc("next_document_number", { p_document_type: "ordem_producao" });
    check("com producao.manage emite número normalmente", !comPermError && !!data);
  }

  console.log("\n14. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "producao.ordem_criada",
        "producao.apontamento_registrado",
        "producao.ordem_concluida",
        "producao.ordem_cancelada",
        "engenharia.versao_liberada",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("ordem_criada registrado", actions.has("producao.ordem_criada"));
    check("apontamento_registrado registrado", actions.has("producao.apontamento_registrado"));
    check("ordem_concluida registrado", actions.has("producao.ordem_concluida"));
    check("ordem_cancelada registrado", actions.has("producao.ordem_cancelada"));
    check("versao_liberada registrado", actions.has("engenharia.versao_liberada"));
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
