// Testes automatizados do TÓPICO 4 — Produção (PCP). Cobre o recorte
// mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0, novembro:
// apontamento, conclusão, cancelamento, lista de corte §54), a Fase 1
// (ADR-002 v2.2, 2026-09-16): produção parcial (1 pedido_item pode ter
// várias OPs, sem ultrapassar a quantidade do item), situação clara da OP
// com bloqueio por medida não confirmada (TÓPICO 16 §7) e engenharia
// liberada versionada (TÓPICO 4 §4), a Fase 2 (2026-09-17): roteiro
// produtivo configurável por item (§15) e acompanhamento por operação
// (§16), e a Fase 3 (2026-09-17): produção em lotes (§12) — cada OP nasce
// com 1 lote cobrindo a quantidade inteira (padrão) ou sem nenhum lote se
// "liberar integralmente" for desligado, liberando aos poucos via
// liberar_lote_producao(); e produção paralela/transferência entre
// recursos (§13) via alocar_recurso_operacao()/transferir_recurso_
// operacao()/apontar_producao_recurso() — apontar_producao() agora aponta
// numa op_lote_operacao específica (célula lote × operação do roteiro),
// não mais na OP como um todo —, a Fase 4 (2026-09-17): lote fabril
// (§14), agrupamento operacional/temporário de lotes de liberação
// (op_lotes) de diferentes OPs, com lista de corte combinada
// (lista_corte_lote_fabril()) — não altera pedido/item/OP/op_lote —, e a
// Fase 5a (2026-09-17): recursos produtivos e capacidade (§31-32) —
// "recurso" deixou de ser texto livre em roteiro_operacoes/op_lote_
// operacao_recursos, agora referencia recursos_produtivos (cadastro de
// máquina/equipamento/linha/posto/equipe/operador/ferramenta/
// dispositivo); calcular_capacidade_recurso()/listar_capacidade_
// recursos() comparam capacidade disponível × necessária (tempo_
// previsto_minutos × saldo pendente); e a Fase 5b (2026-09-17):
// manutenção preventiva (§34, desconta da capacidade futura), corretiva
// (§35, muda recursos_produtivos.situacao em tempo real) e análise de
// impacto no PCP (§36) — analisar_impacto_manutencao() lista operações
// afetadas (diretas e via split de recurso), listar_recursos_
// alternativos() sugere recursos do mesmo tipo disponíveis, e a
// reprogramação usa trocar_recurso_operacao() (recurso único, nova) ou
// transferir_recurso_operacao() (§13, já existente, produção dividida);
// e a Fase 5c (2026-09-17): gargalos (§37, fecha o §31-37) —
// listar_gargalos() é um recorte de listar_capacidade_recursos() (Fase
// 5a) só com os recursos em sobrecarga; e a Fase 6a (2026-09-18): base de
// dados de planejamento (§5) — prioridade (ordens_producao, 1-5, 1=mais
// urgente) e programação por operação/recurso (op_lote_operacoes.
// data_planejada_inicio/fim); listar_programacao() é leitura, traz o
// prazo prometido por join em pedidos.previsao_entrega (não duplicado) e
// filtra por intervalo de data, recurso e setor; e a Fase 6b
// (2026-09-19): sequenciamento inteligente (§6) — roteiro_operacoes/
// op_lote_operacoes ganham perfil/ferramenta/processo (viabiliza detecção
// de setup compartilhado); recomendar_sequenciamento() rankeia operações
// pendentes de um recurso por prazo/prioridade/setup compartilhado (rank
// por critério, não soma de magnitudes brutas), com pesos configuráveis
// por empresa (sequenciamento_pesos/definir_peso_sequenciamento(),
// default 1) e classificação risco/oportunidade/recomendado por
// comparação entre posição atual × recomendada. Decisão humana/simulação
// (§7-8), horizonte/congelamento (§9) e replanejamento (§10) — sub-fases
// seguintes, ainda não implementadas.
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

// Item sem roteiro ativo gera OP com uma única operação genérica
// "Produção" (fallback, TÓPICO 4 §15), dentro do lote único que
// criar_ordem_producao() cria por padrão (liberar_integralmente=true,
// TÓPICO 4 §12) — helper pra resolver o op_lote_operacao_id nos testes
// que não exercitam roteiro multi-etapa nem lotes explícitos.
async function operacaoUnica(ordemProducaoId) {
  const { data, error } = await admin
    .from("op_lote_operacoes")
    .select("id")
    .eq("ordem_producao_id", ordemProducaoId)
    .single();
  if (error) console.error("[fixture] operacaoUnica falhou:", error);
  return data?.id;
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

    const opOpIdBloqueio = await operacaoUnica(opId);
    const { error: apontarBloqueadaError } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: opOpIdBloqueio, p_quantidade_produzida: 1, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    check("apontamento em OP bloqueada é rejeitado", !!apontarBloqueadaError);

    const { data: ipId } = await admTenant.client.rpc("criar_item_producao", { p_pedido_item_id: bloqueio.pedidoItemId });
    itemProducaoId = ipId;
    await admTenant.client.rpc("registrar_medicao", {
      p_id: itemProducaoId, p_ambiente: "Sala", p_largura_mm: 1200, p_altura_mm: 800,
    });
    await admTenant.client.rpc("confirmar_medicao", { p_id: itemProducaoId });

    const { error: apontarLiberadaError } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: opOpIdBloqueio, p_quantidade_produzida: 2, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
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
  let opOpId;
  {
    opOpId = await operacaoUnica(opId);
    check("OP sem roteiro configurado nasce com uma única operação 'Produção'", !!opOpId);
    const { data: unicaOp } = await admin.from("op_lote_operacoes").select("sequencia, descricao").eq("id", opOpId).single();
    check("operação de fallback é sequência 1 'Produção'", unicaOp?.sequencia === 1 && unicaOp?.descricao === "Produção");

    const { error: negativoError } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: opOpId, p_quantidade_produzida: -1, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    check("apontamento com quantidade negativa é rejeitado", !!negativoError);

    const { error: zeradoError } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: opOpId, p_quantidade_produzida: 0, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    check("apontamento zerado (todas as quantidades) é rejeitado", !!zeradoError);

    const { error } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: opOpId, p_quantidade_produzida: 2, p_quantidade_rejeitada: 0.5, p_quantidade_retrabalho: 0, p_observacao: "primeiro corte",
    });
    check("apontamento válido aceito", !error);

    const { data: op } = await admin.from("ordens_producao").select("*").eq("id", opId).single();
    check("quantidade_produzida acumulada", Number(op?.quantidade_produzida) === 2);
    check("quantidade_perdida acumulada (soma de rejeitada entre operações)", Number(op?.quantidade_perdida) === 0.5);
    check("status vira 'em_producao' após o primeiro apontamento", op?.status === "em_producao");
  }

  console.log("\n7. Múltiplos apontamentos acumulam até a quantidade planejada");
  {
    const { error } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: opOpId, p_quantidade_produzida: 3, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: "segundo corte",
    });
    check("segundo apontamento aceito", !error);

    const { data: op } = await admin.from("ordens_producao").select("quantidade_produzida").eq("id", opId).single();
    check("quantidade_produzida soma os dois apontamentos (5 de 5)", Number(op?.quantidade_produzida) === 5);

    const { data: operacao } = await admin.from("op_lote_operacoes").select("status, saldo").eq("id", opOpId).single();
    check("operação única vira 'concluida' ao atingir a quantidade planejada", operacao?.status === "concluida");
    check("saldo da operação zera", Number(operacao?.saldo) === 0);
  }

  console.log("\n8. Conclusão exige quantidade produzida >= planejada em TODAS as operações (§16)");
  {
    const cedo = await prepararPedidoLiberado(admTenant, "8", { quantidade: 10 });
    const { data: opCedoId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: cedo.pedidoItemId });
    const opCedoOpId = await operacaoUnica(opCedoId);
    await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: opCedoOpId, p_quantidade_produzida: 4, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    const { error: cedoError } = await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opCedoId });
    check("concluir antes de atingir a quantidade planejada é rejeitado", !!cedoError);

    const { error } = await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opId });
    check("conclui ordem de produção com quantidade atingida e todas as operações concluídas", !error);

    const { data: op } = await admin.from("ordens_producao").select("status").eq("id", opId).single();
    check("status vira 'concluida'", op?.status === "concluida");
  }

  console.log("\n9. OP concluída não aceita novo apontamento nem nova conclusão");
  {
    const { error: apontarError } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: opOpId, p_quantidade_produzida: 1, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
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
    const opIsolamentoOpId = await operacaoUnica(opIsolamentoId);

    const { error: crossApontarError } = await otherTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: opIsolamentoOpId, p_quantidade_produzida: 1, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    check("tenant B não consegue apontar produção em OP do tenant A", !!crossApontarError);

    const { data: crossOperacoes } = await otherTenant.client.from("op_lote_operacoes").select("id").eq("ordem_producao_id", opIsolamentoId);
    check("tenant B não enxerga op_lote_operacoes do tenant A", (crossOperacoes ?? []).length === 0);

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

  console.log("\n14. Roteiro produtivo (TÓPICO 4 §15) — CRUD e permissão");
  let roteiroId, opRoteiro1Id, opRoteiro2Id;
  {
    // quantidade 40 no pedido (não os 20 usados na 1ª OP) deixa saldo pra
    // criar uma 2ª OP em 14c, depois de desativar o roteiro.
    const roteiro = await prepararPedidoLiberado(admTenant, "14", { quantidade: 40 });

    const { error: semPermCriaError } = await noPermTenant.client.rpc("criar_roteiro_produtivo", {
      p_item_id: roteiro.itemId, p_nome: "Roteiro sem permissão",
    });
    check("sem producao.manage não cria roteiro", !!semPermCriaError);

    const { data: rId, error: criaError } = await admTenant.client.rpc("criar_roteiro_produtivo", {
      p_item_id: roteiro.itemId, p_nome: "Roteiro padrão vidro temperado",
    });
    check("ADMIN cria roteiro produtivo", !criaError && !!rId);
    roteiroId = rId;

    const { data: mesaCorteId } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "MESA-CORTE-1", p_nome: "Mesa de corte 1", p_tipo: "equipamento", p_setor: null, p_capacidade_horas_dia: 8,
    });

    const { data: op1Id, error: op1Error } = await admTenant.client.rpc("adicionar_operacao_roteiro", {
      p_roteiro_id: roteiroId, p_sequencia: 1, p_descricao: "Corte", p_recurso_produtivo_id: mesaCorteId,
      p_tempo_previsto_minutos: 10, p_requisitos: null, p_criterios_qualidade: null, p_equipamentos_alternativos: null,
    });
    check("adiciona operação 1 (Corte) ao roteiro", !op1Error && !!op1Id);
    opRoteiro1Id = op1Id;
    const { data: op1Row } = await admin.from("roteiro_operacoes").select("*").eq("id", opRoteiro1Id).single();
    check(
      "operação 1 salva recurso_produtivo_id e tempo_previsto_minutos",
      op1Row?.recurso_produtivo_id === mesaCorteId && Number(op1Row?.tempo_previsto_minutos) === 10,
    );

    const { data: op2Id, error: op2Error } = await admTenant.client.rpc("adicionar_operacao_roteiro", {
      p_roteiro_id: roteiroId, p_sequencia: 2, p_descricao: "Montagem", p_recurso_produtivo_id: null,
      p_tempo_previsto_minutos: null, p_requisitos: null, p_criterios_qualidade: null, p_equipamentos_alternativos: null,
    });
    check("adiciona operação 2 (Montagem) ao roteiro", !op2Error && !!op2Id);
    opRoteiro2Id = op2Id;

    const { error: sequenciaDuplicadaError } = await admTenant.client.rpc("adicionar_operacao_roteiro", {
      p_roteiro_id: roteiroId, p_sequencia: 1, p_descricao: "Corte duplicado", p_recurso_produtivo_id: null,
      p_tempo_previsto_minutos: null, p_requisitos: null, p_criterios_qualidade: null, p_equipamentos_alternativos: null,
    });
    check("sequência duplicada no mesmo roteiro é rejeitada", !!sequenciaDuplicadaError);

    const { data: crossRoteiros } = await otherTenant.client.from("roteiros_produtivos").select("id").eq("id", roteiroId);
    check("tenant B não enxerga roteiro do tenant A", (crossRoteiros ?? []).length === 0);
    const { data: crossOperacoesRoteiro } = await otherTenant.client.from("roteiro_operacoes").select("id").eq("roteiro_id", roteiroId);
    check("tenant B não enxerga operações do roteiro do tenant A", (crossOperacoesRoteiro ?? []).length === 0);

    console.log("\n14b. Snapshot do roteiro na OP e fluxo sequencial por operação (§16)");
    const { data: opComRoteiroId, error: opComRoteiroError } = await admTenant.client.rpc("criar_ordem_producao", {
      p_pedido_item_id: roteiro.pedidoItemId, p_quantidade: 20,
    });
    check("cria OP para item com roteiro ativo", !opComRoteiroError && !!opComRoteiroId);

    const { data: operacoesSnapshot } = await admin
      .from("op_lote_operacoes")
      .select("*")
      .eq("ordem_producao_id", opComRoteiroId)
      .order("sequencia", { ascending: true });
    check("OP nasce com 2 operações (snapshot do roteiro)", (operacoesSnapshot ?? []).length === 2);
    check(
      "operações do snapshot seguem a sequência e descrição do roteiro",
      operacoesSnapshot?.[0]?.descricao === "Corte" && operacoesSnapshot?.[1]?.descricao === "Montagem",
    );
    const [snapCorte, snapMontagem] = operacoesSnapshot ?? [];

    const { error: pulaOperacaoError } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: snapMontagem.id, p_quantidade_produzida: 5, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    check("apontar na 2ª operação antes da 1ª entregar nada é rejeitado (fluxo sequencial)", !!pulaOperacaoError);

    const { error: corteError } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: snapCorte.id, p_quantidade_produzida: 12, p_quantidade_rejeitada: 1, p_quantidade_retrabalho: 2, p_observacao: "corte lote 1",
    });
    check("aponta produzida/rejeitada/retrabalho na 1ª operação (Corte)", !corteError);

    const { error: excedeAnteriorError } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: snapMontagem.id, p_quantidade_produzida: 13, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    check(
      "2ª operação não pode acumular mais produzido do que a 1ª já entregou (12)",
      !!excedeAnteriorError,
    );

    const { error: dentroDoLimiteError } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: snapMontagem.id, p_quantidade_produzida: 12, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: "montagem lote 1",
    });
    check("2ª operação aceita produzir até o que a 1ª entregou (12)", !dentroDoLimiteError);

    const { error: concluirParcialError } = await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opComRoteiroId });
    check("conclusão é rejeitada enquanto a 1ª operação (planejada 20) não atingiu o total", !!concluirParcialError);

    await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: snapCorte.id, p_quantidade_produzida: 8, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: "corte lote 2",
    });
    await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: snapMontagem.id, p_quantidade_produzida: 8, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: "montagem lote 2",
    });

    const { data: operacoesFinal } = await admin
      .from("op_lote_operacoes")
      .select("status")
      .eq("ordem_producao_id", opComRoteiroId);
    check(
      "todas as operações do roteiro chegam a 'concluida'",
      (operacoesFinal ?? []).length === 2 && (operacoesFinal ?? []).every((o) => o.status === "concluida"),
    );

    const { error: concluirTotalError } = await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opComRoteiroId });
    check("conclui a OP com todas as operações do roteiro concluídas", !concluirTotalError);

    console.log("\n14c. Remover operação e desativar roteiro");
    const { error: semPermRemoveError } = await noPermTenant.client.rpc("remover_operacao_roteiro", {
      p_roteiro_operacao_id: opRoteiro2Id,
    });
    check("sem producao.manage não remove operação de roteiro", !!semPermRemoveError);

    const { error: removeError } = await admTenant.client.rpc("remover_operacao_roteiro", { p_roteiro_operacao_id: opRoteiro2Id });
    check("remove operação do roteiro", !removeError);

    const { error: semPermDesativaError } = await noPermTenant.client.rpc("desativar_roteiro", { p_roteiro_id: roteiroId });
    check("sem producao.manage não desativa roteiro", !!semPermDesativaError);

    const { error: desativaError } = await admTenant.client.rpc("desativar_roteiro", { p_roteiro_id: roteiroId });
    check("desativa roteiro", !desativaError);

    const { data: opAposDesativarId } = await admTenant.client.rpc("criar_ordem_producao", {
      p_pedido_item_id: roteiro.pedidoItemId,
    });
    const { data: operacoesAposDesativar } = await admin
      .from("op_lote_operacoes")
      .select("descricao, sequencia")
      .eq("ordem_producao_id", opAposDesativarId);
    check(
      "item com roteiro desativado volta a gerar OP com a operação única 'Produção' (fallback)",
      (operacoesAposDesativar ?? []).length === 1 && operacoesAposDesativar?.[0]?.descricao === "Produção",
    );
  }

  console.log("\n15. Produção em lotes (TÓPICO 4 §12)");
  {
    const lotes = await prepararPedidoLiberado(admTenant, "15", { quantidade: 10 });

    const { data: opSemLoteId, error: opSemLoteError } = await admTenant.client.rpc("criar_ordem_producao", {
      p_pedido_item_id: lotes.pedidoItemId, p_liberar_integralmente: false,
    });
    check("OP com liberar_integralmente=false é criada", !opSemLoteError && !!opSemLoteId);

    const { data: lotesIniciais } = await admin.from("op_lotes").select("id").eq("ordem_producao_id", opSemLoteId);
    check("OP nasce sem nenhum lote quando liberar_integralmente=false", (lotesIniciais ?? []).length === 0);

    const { error: semPermLiberaError } = await noPermTenant.client.rpc("liberar_lote_producao", {
      p_ordem_producao_id: opSemLoteId, p_quantidade: 4,
    });
    check("sem producao.manage não libera lote", !!semPermLiberaError);

    const { error: excedePlanejadoError } = await admTenant.client.rpc("liberar_lote_producao", {
      p_ordem_producao_id: opSemLoteId, p_quantidade: 11,
    });
    check("liberar mais do que a OP planejou (11 > 10) é rejeitado", !!excedePlanejadoError);

    const { data: lote1Id, error: lote1Error } = await admTenant.client.rpc("liberar_lote_producao", {
      p_ordem_producao_id: opSemLoteId, p_quantidade: 4,
    });
    check("libera o 1º lote (4 de 10)", !lote1Error && !!lote1Id);

    const { data: lote1 } = await admin.from("op_lotes").select("*").eq("id", lote1Id).single();
    check("lote nasce com numero=1 e quantidade_planejada=4", lote1?.numero === 1 && Number(lote1?.quantidade_planejada) === 4);

    const { data: lote1Operacoes } = await admin.from("op_lote_operacoes").select("*").eq("op_lote_id", lote1Id);
    check(
      "lote ganha seu próprio snapshot de operação (fallback 'Produção')",
      (lote1Operacoes ?? []).length === 1 && lote1Operacoes?.[0]?.descricao === "Produção",
    );
    const lote1OpId = lote1Operacoes?.[0]?.id;

    const { error: excedeLoteError } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: lote1OpId, p_quantidade_produzida: 5, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    check("produzir além do planejado do PRÓPRIO lote (5 > 4) é rejeitado", !!excedeLoteError);

    const { error: apontaLote1Error } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: lote1OpId, p_quantidade_produzida: 4, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: "lote 1 completo",
    });
    check("aponta o lote 1 até o limite (4)", !apontaLote1Error);

    const { data: opAposLote1 } = await admin.from("ordens_producao").select("quantidade_produzida").eq("id", opSemLoteId).single();
    check("quantidade_produzida da OP reflete só o que foi liberado (4 de 10)", Number(opAposLote1?.quantidade_produzida) === 4);

    const { error: concluirCedoError } = await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opSemLoteId });
    check("concluir com saldo ainda não liberado (6) é rejeitado", !!concluirCedoError);

    const { data: lote2Id } = await admTenant.client.rpc("liberar_lote_producao", {
      p_ordem_producao_id: opSemLoteId, p_quantidade: 6,
    });
    const { data: lote2Operacoes } = await admin.from("op_lote_operacoes").select("id").eq("op_lote_id", lote2Id);
    const lote2OpId = lote2Operacoes?.[0]?.id;

    const { error: excedeSaldoTotalError } = await admTenant.client.rpc("liberar_lote_producao", {
      p_ordem_producao_id: opSemLoteId, p_quantidade: 1,
    });
    check("liberar além do saldo total da OP (10 já liberado) é rejeitado", !!excedeSaldoTotalError);

    const { error: apontaLote2Error } = await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: lote2OpId, p_quantidade_produzida: 6, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: "lote 2 completo",
    });
    check("aponta o lote 2 até o limite (6)", !apontaLote2Error);

    const { error: concluirTotalError } = await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opSemLoteId });
    check("conclui a OP quando todos os lotes liberados estão concluídos e somam o planejado", !concluirTotalError);

    const { data: crossLotes } = await otherTenant.client.from("op_lotes").select("id").eq("ordem_producao_id", opSemLoteId);
    check("tenant B não enxerga lotes do tenant A", (crossLotes ?? []).length === 0);
  }

  console.log("\n16. Produção paralela e transferência de recurso (TÓPICO 4 §13)");
  {
    const recursos = await prepararPedidoLiberado(admTenant, "16", { quantidade: 200 });
    const { data: opRecursoId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: recursos.pedidoItemId });
    const opRecursoOpId = await operacaoUnica(opRecursoId);

    const { data: maquinaAId } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "MAQ-A-16", p_nome: "Máquina A", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: 8,
    });
    const { data: maquinaBId } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "MAQ-B-16", p_nome: "Máquina B", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: 8,
    });
    const { data: maquinaCId } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "MAQ-C-16", p_nome: "Máquina C", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: 8,
    });

    const { error: semPermAlocaError } = await noPermTenant.client.rpc("alocar_recurso_operacao", {
      p_op_lote_operacao_id: opRecursoOpId, p_recurso_produtivo_id: maquinaAId, p_quantidade: 100,
    });
    check("sem producao.manage não aloca recurso", !!semPermAlocaError);

    const { data: recursoAId, error: alocaAError } = await admTenant.client.rpc("alocar_recurso_operacao", {
      p_op_lote_operacao_id: opRecursoOpId, p_recurso_produtivo_id: maquinaAId, p_quantidade: 100,
    });
    check("aloca 100 pra Máquina A", !alocaAError && !!recursoAId);

    const { data: recursoBId, error: alocaBError } = await admTenant.client.rpc("alocar_recurso_operacao", {
      p_op_lote_operacao_id: opRecursoOpId, p_recurso_produtivo_id: maquinaBId, p_quantidade: 100,
    });
    check("aloca 100 pra Máquina B", !alocaBError && !!recursoBId);

    const { error: excedeAlocacaoError } = await admTenant.client.rpc("alocar_recurso_operacao", {
      p_op_lote_operacao_id: opRecursoOpId, p_recurso_produtivo_id: maquinaCId, p_quantidade: 1,
    });
    check("alocar além do planejado da operação (201 > 200) é rejeitado", !!excedeAlocacaoError);

    const { error: apontaAError } = await admTenant.client.rpc("apontar_producao_recurso", {
      p_op_lote_operacao_recurso_id: recursoAId, p_quantidade_produzida: 70, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: "Máquina A rodando",
    });
    check("aponta 70 na Máquina A", !apontaAError);

    const { error: excedeRecursoError } = await admTenant.client.rpc("apontar_producao_recurso", {
      p_op_lote_operacao_recurso_id: recursoAId, p_quantidade_produzida: 31, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    check("produzir além do alocado ao recurso (101 > 100) é rejeitado", !!excedeRecursoError);

    const { data: operacaoConsolidada } = await admin.from("op_lote_operacoes").select("quantidade_produzida").eq("id", opRecursoOpId).single();
    check("operação pai consolida o total dos splits (70 até aqui)", Number(operacaoConsolidada?.quantidade_produzida) === 70);

    // Máquina A falha com 30 restantes — transfere o saldo pra Máquina B.
    const { data: transferidoId, error: transfereError } = await admTenant.client.rpc("transferir_recurso_operacao", {
      p_op_lote_operacao_recurso_id: recursoAId, p_recurso_produtivo_destino_id: maquinaBId, p_quantidade: 30,
    });
    check("transfere o saldo (30) da Máquina A pra Máquina B", !transfereError && !!transferidoId);
    check("transferência reaproveita o split já existente de Máquina B (mesmo id)", transferidoId === recursoBId);

    const { data: recursoADepois } = await admin.from("op_lote_operacao_recursos").select("quantidade_alocada, status").eq("id", recursoAId).single();
    check(
      "Máquina A fica só com o que já produziu (100 -> 70 alocado) e conclui",
      Number(recursoADepois?.quantidade_alocada) === 70 && recursoADepois?.status === "concluida",
    );

    const { data: recursoBDepois } = await admin.from("op_lote_operacao_recursos").select("quantidade_alocada").eq("id", recursoBId).single();
    check("Máquina B ganha o saldo transferido (100 + 30 = 130 alocado)", Number(recursoBDepois?.quantidade_alocada) === 130);

    const { error: transfereExcedeError } = await admTenant.client.rpc("transferir_recurso_operacao", {
      p_op_lote_operacao_recurso_id: recursoAId, p_recurso_produtivo_destino_id: maquinaBId, p_quantidade: 1,
    });
    check("transferir mais do que o saldo restante (0) é rejeitado", !!transfereExcedeError);

    const { error: apontaBError } = await admTenant.client.rpc("apontar_producao_recurso", {
      p_op_lote_operacao_recurso_id: recursoBId, p_quantidade_produzida: 130, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: "Máquina B completa",
    });
    check("aponta o total transferido + alocado original na Máquina B (130)", !apontaBError);

    const { data: operacaoFinal } = await admin.from("op_lote_operacoes").select("quantidade_produzida, status").eq("id", opRecursoOpId).single();
    check(
      "operação pai consolida o total final (70+130=200) e conclui",
      Number(operacaoFinal?.quantidade_produzida) === 200 && operacaoFinal?.status === "concluida",
    );

    const { error: concluiRecursoError } = await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opRecursoId });
    check("conclui a OP após consolidar os recursos", !concluiRecursoError);

    const { data: crossRecursos } = await otherTenant.client.from("op_lote_operacao_recursos").select("id").eq("id", recursoAId);
    check("tenant B não enxerga split de recurso do tenant A", (crossRecursos ?? []).length === 0);
  }

  console.log("\n17. Recursos produtivos e capacidade (TÓPICO 4 §31-32)");
  {
    const { error: semPermCriaError } = await noPermTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "SEM-PERM-17", p_nome: "Recurso sem permissão", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: 8,
    });
    check("sem producao.manage não cria recurso produtivo", !!semPermCriaError);

    const { error: tipoInvalidoError } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "REC-17-INVALIDO", p_nome: "Recurso tipo inválido", p_tipo: "nao_existe", p_setor: null, p_capacidade_horas_dia: 8,
    });
    check("tipo de recurso inválido é rejeitado", !!tipoInvalidoError);

    const { data: recursoId, error: criaError } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "USIN-17", p_nome: "Usinagem 1", p_tipo: "maquina", p_setor: "Usinagem", p_capacidade_horas_dia: 8,
    });
    check("ADMIN cria recurso produtivo", !criaError && !!recursoId);

    const { error: codigoDuplicadoError } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "USIN-17", p_nome: "Usinagem duplicada", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: 8,
    });
    check("código duplicado na mesma empresa é rejeitado", !!codigoDuplicadoError);

    const { error: semPermEditaError } = await noPermTenant.client.rpc("editar_recurso_produtivo", {
      p_id: recursoId, p_nome: "Usinagem 1 editada", p_setor: null, p_capacidade_horas_dia: 8,
    });
    check("sem producao.manage não edita recurso produtivo", !!semPermEditaError);

    const { error: editaError } = await admTenant.client.rpc("editar_recurso_produtivo", {
      p_id: recursoId, p_nome: "Usinagem 1 (revisada)", p_setor: "Usinagem", p_capacidade_horas_dia: 10,
    });
    check("edita recurso produtivo", !editaError);
    const { data: recursoEditado } = await admin.from("recursos_produtivos").select("*").eq("id", recursoId).single();
    check(
      "capacidade_horas_dia atualizada (10)",
      recursoEditado?.nome === "Usinagem 1 (revisada)" && Number(recursoEditado?.capacidade_horas_dia) === 10,
    );

    const { error: situacaoInvalidaError } = await admTenant.client.rpc("atualizar_situacao_recurso", {
      p_id: recursoId, p_situacao: "nao_existe", p_motivo: null,
    });
    check("situação inválida é rejeitada", !!situacaoInvalidaError);

    const { error: semPermSituacaoError } = await noPermTenant.client.rpc("atualizar_situacao_recurso", {
      p_id: recursoId, p_situacao: "em_manutencao", p_motivo: "troca de peça",
    });
    check("sem producao.manage não atualiza situação do recurso", !!semPermSituacaoError);

    const { error: situacaoError } = await admTenant.client.rpc("atualizar_situacao_recurso", {
      p_id: recursoId, p_situacao: "em_manutencao", p_motivo: "troca de peça",
    });
    check("atualiza situação do recurso", !situacaoError);
    const { data: recursoSituacao } = await admin.from("recursos_produtivos").select("situacao, motivo_situacao").eq("id", recursoId).single();
    check(
      "situação e motivo persistidos",
      recursoSituacao?.situacao === "em_manutencao" && recursoSituacao?.motivo_situacao === "troca de peça",
    );

    // Roteiro com 1 operação de 20h previstas (tempo_previsto_minutos)
    // pra esse recurso — necessidade de capacidade deve refletir isso.
    const capacidade = await prepararPedidoLiberado(admTenant, "17b", { quantidade: 4 });
    const { data: roteiroCapId } = await admTenant.client.rpc("criar_roteiro_produtivo", {
      p_item_id: capacidade.itemId, p_nome: "Roteiro capacidade",
    });
    await admTenant.client.rpc("adicionar_operacao_roteiro", {
      p_roteiro_id: roteiroCapId, p_sequencia: 1, p_descricao: "Usinar", p_recurso_produtivo_id: recursoId,
      p_tempo_previsto_minutos: 300, p_requisitos: null, p_criterios_qualidade: null, p_equipamentos_alternativos: null,
    });
    // 4 unidades × 300min = 1200min = 20h de necessidade.
    await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: capacidade.pedidoItemId });

    const { data: capRows, error: capError } = await admTenant.client.rpc("calcular_capacidade_recurso", {
      p_recurso_produtivo_id: recursoId, p_dias: 7,
    });
    const cap = capRows?.[0];
    check("calcula capacidade sem erro", !capError && !!cap);
    check("capacidade disponível = capacidade_horas_dia × dias (10×7=70)", Number(cap?.capacidade_disponivel_horas) === 70);
    check("capacidade necessária reflete tempo_previsto × saldo pendente (20h)", Number(cap?.capacidade_necessaria_horas) === 20);
    check("classificação 'normal' quando necessário < disponível", cap?.classificacao === "normal");

    const { data: listaCap, error: listaCapError } = await admTenant.client.rpc("listar_capacidade_recursos", { p_dias: 7 });
    check(
      "listar_capacidade_recursos() traz o recurso com a mesma conta",
      !listaCapError && (listaCap ?? []).some((r) => r.recurso_produtivo_id === recursoId && Number(r.capacidade_necessaria_horas) === 20),
    );

    const { error: semPermDesativaError } = await noPermTenant.client.rpc("desativar_recurso_produtivo", { p_id: recursoId });
    check("sem producao.manage não desativa recurso produtivo", !!semPermDesativaError);

    const { error: desativaError } = await admTenant.client.rpc("desativar_recurso_produtivo", { p_id: recursoId });
    check("desativa recurso produtivo", !desativaError);
    const { data: recursoDesativado } = await admin.from("recursos_produtivos").select("ativo").eq("id", recursoId).single();
    check("ativo vira false", recursoDesativado?.ativo === false);

    const { data: crossRecursosProdutivos } = await otherTenant.client.from("recursos_produtivos").select("id").eq("id", recursoId);
    check("tenant B não enxerga recurso produtivo do tenant A", (crossRecursosProdutivos ?? []).length === 0);
  }

  console.log("\n17b. Manutenção e impacto no PCP (TÓPICO 4 §33-36)");
  {
    const { data: usinId } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "USIN-17B", p_nome: "Usinagem 17b", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: 8,
      p_localizacao: "Galpão 2",
    });
    const { data: usinAltId } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "USIN-17B-ALT", p_nome: "Usinagem 17b alternativa", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: 8,
    });

    console.log("  Manutenção preventiva (§34) — desconta da capacidade futura");
    {
      const { error: semPermError } = await noPermTenant.client.rpc("programar_manutencao_preventiva", {
        p_recurso_produtivo_id: usinId, p_tipo: "Troca de óleo", p_proxima_data: "2027-01-05",
        p_periodicidade_dias: 30, p_duracao_estimada_horas: 4, p_responsavel_id: null,
      });
      check("sem producao.manage não programa manutenção preventiva", !!semPermError);

      const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: preventivaId, error: programaError } = await admTenant.client.rpc("programar_manutencao_preventiva", {
        p_recurso_produtivo_id: usinId, p_tipo: "Troca de óleo", p_proxima_data: amanha,
        p_periodicidade_dias: 30, p_duracao_estimada_horas: 4, p_responsavel_id: null,
      });
      check("programa manutenção preventiva dentro da janela de 7 dias", !programaError && !!preventivaId);

      const { data: capAntes } = await admTenant.client.rpc("calcular_capacidade_recurso", { p_recurso_produtivo_id: usinId, p_dias: 7 });
      check(
        "capacidade disponível desconta a duração estimada da preventiva (8×7 - 4 = 52)",
        Number(capAntes?.[0]?.capacidade_disponivel_horas) === 52,
      );

      const depoisDeAmanha = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { error: semPermEditaError } = await noPermTenant.client.rpc("editar_manutencao_preventiva", {
        p_id: preventivaId, p_proxima_data: depoisDeAmanha, p_periodicidade_dias: 30, p_duracao_estimada_horas: 6, p_responsavel_id: null,
      });
      check("sem producao.manage não edita manutenção preventiva", !!semPermEditaError);

      const { error: editaError } = await admTenant.client.rpc("editar_manutencao_preventiva", {
        p_id: preventivaId, p_proxima_data: depoisDeAmanha, p_periodicidade_dias: 30, p_duracao_estimada_horas: 6, p_responsavel_id: null,
      });
      check("edita manutenção preventiva", !editaError);
      const { data: preventivaEditada } = await admin.from("manutencoes_preventivas").select("duracao_estimada_horas").eq("id", preventivaId).single();
      check("duração estimada atualizada (6h)", Number(preventivaEditada?.duracao_estimada_horas) === 6);

      const { error: semPermCancelaError } = await noPermTenant.client.rpc("cancelar_manutencao_preventiva", { p_id: preventivaId });
      check("sem producao.manage não cancela manutenção preventiva", !!semPermCancelaError);

      const { error: cancelaError } = await admTenant.client.rpc("cancelar_manutencao_preventiva", { p_id: preventivaId });
      check("cancela manutenção preventiva", !cancelaError);

      const { data: capDepois } = await admTenant.client.rpc("calcular_capacidade_recurso", { p_recurso_produtivo_id: usinId, p_dias: 7 });
      check(
        "capacidade volta ao normal após cancelar a preventiva (8×7 = 56)",
        Number(capDepois?.[0]?.capacidade_disponivel_horas) === 56,
      );

      const { data: crossPreventivas } = await otherTenant.client.from("manutencoes_preventivas").select("id").eq("id", preventivaId);
      check("tenant B não enxerga manutenção preventiva do tenant A", (crossPreventivas ?? []).length === 0);
    }

    console.log("  Manutenção corretiva (§35) — muda a situação do recurso em tempo real");
    let corretivaId;
    {
      const { error: semPermError } = await noPermTenant.client.rpc("iniciar_manutencao_corretiva", {
        p_recurso_produtivo_id: usinId, p_problema: "Sem permissão", p_motivo: null, p_previsao_retorno: null, p_responsavel_id: null,
      });
      check("sem producao.manage não inicia manutenção corretiva", !!semPermError);

      const { data: cId, error: iniciaError } = await admTenant.client.rpc("iniciar_manutencao_corretiva", {
        p_recurso_produtivo_id: usinId, p_problema: "Correia rompida", p_motivo: "desgaste", p_previsao_retorno: null, p_responsavel_id: null,
      });
      check("inicia manutenção corretiva", !iniciaError && !!cId);
      corretivaId = cId;

      const { data: recursoEmManutencao } = await admin.from("recursos_produtivos").select("situacao, motivo_situacao").eq("id", usinId).single();
      check(
        "situação do recurso vira 'em_manutencao' com o problema como motivo",
        recursoEmManutencao?.situacao === "em_manutencao" && recursoEmManutencao?.motivo_situacao === "Correia rompida",
      );

      const { error: duplicadaError } = await admTenant.client.rpc("iniciar_manutencao_corretiva", {
        p_recurso_produtivo_id: usinId, p_problema: "Outro problema", p_motivo: null, p_previsao_retorno: null, p_responsavel_id: null,
      });
      check("não inicia 2ª corretiva aberta pro mesmo recurso", !!duplicadaError);

      const { error: semPermEncerraError } = await noPermTenant.client.rpc("encerrar_manutencao_corretiva", {
        p_id: corretivaId, p_pecas: null, p_servicos: null, p_observacoes: null,
      });
      check("sem producao.manage não encerra manutenção corretiva", !!semPermEncerraError);

      const { error: encerraError } = await admTenant.client.rpc("encerrar_manutencao_corretiva", {
        p_id: corretivaId, p_pecas: "correia nova", p_servicos: "troca de correia", p_observacoes: "ok",
      });
      check("encerra manutenção corretiva", !encerraError);

      const { data: corretivaEncerrada } = await admin.from("manutencoes_corretivas").select("status, retorno_efetivo, pecas").eq("id", corretivaId).single();
      check(
        "corretiva encerrada com retorno efetivo e peças registradas",
        corretivaEncerrada?.status === "encerrada" && !!corretivaEncerrada?.retorno_efetivo && corretivaEncerrada?.pecas === "correia nova",
      );

      const { data: recursoDisponivel } = await admin.from("recursos_produtivos").select("situacao, motivo_situacao").eq("id", usinId).single();
      check(
        "situação do recurso volta pra 'disponivel' ao encerrar",
        recursoDisponivel?.situacao === "disponivel" && recursoDisponivel?.motivo_situacao === null,
      );

      const { error: encerraDeNovoError } = await admTenant.client.rpc("encerrar_manutencao_corretiva", {
        p_id: corretivaId, p_pecas: null, p_servicos: null, p_observacoes: null,
      });
      check("encerrar corretiva já encerrada é rejeitado", !!encerraDeNovoError);

      const { data: crossCorretivas } = await otherTenant.client.from("manutencoes_corretivas").select("id").eq("id", corretivaId);
      check("tenant B não enxerga manutenção corretiva do tenant A", (crossCorretivas ?? []).length === 0);
    }

    console.log("  Análise de impacto (§36) — operações afetadas, alternativas e reprogramação");
    {
      // Caminho direto: operação do roteiro referencia o recurso.
      const direto = await prepararPedidoLiberado(admTenant, "173", { quantidade: 4 });
      const { data: roteiroImpactoId } = await admTenant.client.rpc("criar_roteiro_produtivo", {
        p_item_id: direto.itemId, p_nome: "Roteiro impacto",
      });
      await admTenant.client.rpc("adicionar_operacao_roteiro", {
        p_roteiro_id: roteiroImpactoId, p_sequencia: 1, p_descricao: "Usinar direto", p_recurso_produtivo_id: usinId,
        p_tempo_previsto_minutos: 30, p_requisitos: null, p_criterios_qualidade: null, p_equipamentos_alternativos: null,
      });
      const { data: opImpactoId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: direto.pedidoItemId });
      const opImpactoOpId = await operacaoUnica(opImpactoId);
      await admTenant.client.rpc("apontar_producao", {
        p_op_lote_operacao_id: opImpactoOpId, p_quantidade_produzida: 1, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
      });
      // saldo pendente = 4 - 1 = 3; impacto = 3 * 30min / 60 = 1.5h.

      // Caminho por split de recurso (§13): operação de fallback (sem
      // recurso direto), com o recurso alocado como split.
      const viaSplit = await prepararPedidoLiberado(admTenant, "174", { quantidade: 10 });
      const { data: opSplitId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: viaSplit.pedidoItemId });
      const opSplitOpId = await operacaoUnica(opSplitId);
      // A operação de fallback não tem tempo_previsto_minutos — impacto_horas fica null pra essa linha.
      await admTenant.client.rpc("alocar_recurso_operacao", {
        p_op_lote_operacao_id: opSplitOpId, p_recurso_produtivo_id: usinId, p_quantidade: 6,
      });

      const { data: impactoRows, error: impactoError } = await admTenant.client.rpc("analisar_impacto_manutencao", {
        p_recurso_produtivo_id: usinId,
      });
      check("analisar_impacto_manutencao() executa sem erro", !impactoError && Array.isArray(impactoRows));
      const linhaDireta = impactoRows?.find((r) => r.origem === "operacao" && r.op_lote_operacao_id === opImpactoOpId);
      check(
        "linha direta traz saldo pendente e impacto em horas corretos (3 / 1.5h)",
        Number(linhaDireta?.saldo_pendente) === 3 && Number(linhaDireta?.impacto_horas) === 1.5,
      );
      const linhaSplit = impactoRows?.find((r) => r.origem === "split_recurso" && r.op_lote_operacao_id === opSplitOpId);
      check("linha via split de recurso aparece com saldo pendente correto (6)", Number(linhaSplit?.saldo_pendente) === 6);

      const { error: semPermImpactoError } = await noPermTenant.client.rpc("analisar_impacto_manutencao", { p_recurso_produtivo_id: usinId });
      check("sem producao.view não consulta impacto de manutenção de outra empresa", !!semPermImpactoError);

      const { data: alternativos, error: alternativosError } = await admTenant.client.rpc("listar_recursos_alternativos", {
        p_recurso_produtivo_id: usinId,
      });
      check(
        "listar_recursos_alternativos() traz o recurso do mesmo tipo disponível",
        !alternativosError && (alternativos ?? []).some((a) => a.id === usinAltId),
      );

      const { error: semPermTrocaError } = await noPermTenant.client.rpc("trocar_recurso_operacao", {
        p_op_lote_operacao_id: opImpactoOpId, p_novo_recurso_produtivo_id: usinAltId, p_motivo: null,
      });
      check("sem producao.manage não troca recurso da operação", !!semPermTrocaError);

      const { error: trocaError } = await admTenant.client.rpc("trocar_recurso_operacao", {
        p_op_lote_operacao_id: opImpactoOpId, p_novo_recurso_produtivo_id: usinAltId, p_motivo: "máquina em manutenção",
      });
      check("troca o recurso da operação (reprogramação, §36)", !trocaError);
      const { data: operacaoTrocada } = await admin.from("op_lote_operacoes").select("recurso_produtivo_id").eq("id", opImpactoOpId).single();
      check("operação passa a referenciar o novo recurso", operacaoTrocada?.recurso_produtivo_id === usinAltId);
    }
  }

  console.log("\n17c. Gargalos (TÓPICO 4 §37)");
  {
    // Recurso com capacidade baixa (1h/dia) e necessidade alta —
    // dispara sobrecarga: disponível 1×7=7h, necessário bem maior.
    const { data: gargaloRecursoId } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "GARGALO-17C", p_nome: "Recurso com gargalo", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: 1,
    });
    const gargalo = await prepararPedidoLiberado(admTenant, "175", { quantidade: 20 });
    const { data: roteiroGargaloId } = await admTenant.client.rpc("criar_roteiro_produtivo", {
      p_item_id: gargalo.itemId, p_nome: "Roteiro gargalo",
    });
    await admTenant.client.rpc("adicionar_operacao_roteiro", {
      p_roteiro_id: roteiroGargaloId, p_sequencia: 1, p_descricao: "Usinar gargalo", p_recurso_produtivo_id: gargaloRecursoId,
      p_tempo_previsto_minutos: 120, p_requisitos: null, p_criterios_qualidade: null, p_equipamentos_alternativos: null,
    });
    const { data: opGargaloId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: gargalo.pedidoItemId });
    const opGargaloOpId = await operacaoUnica(opGargaloId);
    // 20 unidades × 120min = 2400min = 40h de necessidade >> 7h disponível.

    const { data: gargalosAntes, error: gargalosError } = await admTenant.client.rpc("listar_gargalos", { p_dias: 7 });
    check("listar_gargalos() executa sem erro", !gargalosError && Array.isArray(gargalosAntes));
    const gargaloEncontrado = gargalosAntes?.find((g) => g.recurso_produtivo_id === gargaloRecursoId);
    check(
      "recurso em sobrecarga aparece em listar_gargalos() (7h disponível, 40h necessário)",
      !!gargaloEncontrado && Number(gargaloEncontrado.capacidade_disponivel_horas) === 7 && Number(gargaloEncontrado.capacidade_necessaria_horas) === 40,
    );

    const { error: semPermGargalosError } = await noPermTenant.client.rpc("listar_gargalos", { p_dias: 7 });
    check("sem producao.view não consulta gargalos de outra empresa", !!semPermGargalosError);

    const { data: crossGargalos } = await otherTenant.client.rpc("listar_gargalos", { p_dias: 7 });
    check(
      "tenant B não enxerga o gargalo do tenant A na própria consulta",
      !(crossGargalos ?? []).some((g) => g.recurso_produtivo_id === gargaloRecursoId),
    );

    // Aponta a produção inteira — saldo pendente zera, necessidade some,
    // gargalo deixa de aparecer.
    await admTenant.client.rpc("apontar_producao", {
      p_op_lote_operacao_id: opGargaloOpId, p_quantidade_produzida: 20, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    const { data: gargalosDepois } = await admTenant.client.rpc("listar_gargalos", { p_dias: 7 });
    check(
      "gargalo some da lista quando a operação é concluída (saldo pendente zera)",
      !(gargalosDepois ?? []).some((g) => g.recurso_produtivo_id === gargaloRecursoId),
    );
  }

  console.log("\n18. Lote fabril (TÓPICO 4 §14)");
  {
    const fabril = await prepararPedidoLiberado(admTenant, "18", { quantidade: 15 });
    const { data: opFabrilId } = await admTenant.client.rpc("criar_ordem_producao", {
      p_pedido_item_id: fabril.pedidoItemId, p_liberar_integralmente: false,
    });
    const { data: loteA } = await admTenant.client.rpc("liberar_lote_producao", { p_ordem_producao_id: opFabrilId, p_quantidade: 6 });
    const { data: loteB } = await admTenant.client.rpc("liberar_lote_producao", { p_ordem_producao_id: opFabrilId, p_quantidade: 9 });

    const { error: semPermCriaError } = await noPermTenant.client.rpc("criar_lote_fabril", { p_nome: "Sem permissão" });
    check("sem producao.manage não cria lote fabril", !!semPermCriaError);

    const { data: loteFabrilId, error: criaError } = await admTenant.client.rpc("criar_lote_fabril", {
      p_nome: "Lote Fabril 001", p_criterio_agrupamento: "mesmo material", p_observacoes: "corte combinado",
    });
    check("ADMIN cria lote fabril", !criaError && !!loteFabrilId);

    const { error: semPermAddError } = await noPermTenant.client.rpc("adicionar_item_lote_fabril", {
      p_lote_fabril_id: loteFabrilId, p_op_lote_id: loteA, p_quantidade: 6,
    });
    check("sem producao.manage não adiciona item ao lote fabril", !!semPermAddError);

    const { error: excedeError } = await admTenant.client.rpc("adicionar_item_lote_fabril", {
      p_lote_fabril_id: loteFabrilId, p_op_lote_id: loteA, p_quantidade: 7,
    });
    check("quantidade além do planejado do lote de liberação (7 > 6) é rejeitada", !!excedeError);

    const { data: itemAId, error: addAError } = await admTenant.client.rpc("adicionar_item_lote_fabril", {
      p_lote_fabril_id: loteFabrilId, p_op_lote_id: loteA, p_quantidade: 6,
    });
    check("agrupa o lote de liberação A (6)", !addAError && !!itemAId);

    const { data: itemBId, error: addBError } = await admTenant.client.rpc("adicionar_item_lote_fabril", {
      p_lote_fabril_id: loteFabrilId, p_op_lote_id: loteB, p_quantidade: 9,
    });
    check("agrupa o lote de liberação B (9)", !addBError && !!itemBId);

    const { data: linhas, error: listaError } = await admTenant.client.rpc("lista_corte_lote_fabril", { p_lote_fabril_id: loteFabrilId });
    check("lista_corte_lote_fabril() traz as 2 linhas agrupadas", !listaError && (linhas ?? []).length === 2);
    const quantidades = (linhas ?? []).map((l) => Number(l.quantidade)).sort((a, b) => a - b);
    check("quantidades da lista combinada são as agrupadas (6 e 9), não a da OP inteira", quantidades[0] === 6 && quantidades[1] === 9);

    const { error: semPermListaError } = await noPermTenant.client.rpc("lista_corte_lote_fabril", { p_lote_fabril_id: loteFabrilId });
    check("sem producao.view não consulta lista de corte de lote fabril de outra empresa", !!semPermListaError);

    const { error: semPermRemoveError } = await noPermTenant.client.rpc("remover_item_lote_fabril", { p_lote_fabril_item_id: itemAId });
    check("sem producao.manage não remove item do lote fabril", !!semPermRemoveError);

    const { error: removeError } = await admTenant.client.rpc("remover_item_lote_fabril", { p_lote_fabril_item_id: itemAId });
    check("remove item do lote fabril", !removeError);

    const { error: semPermEncerraError } = await noPermTenant.client.rpc("encerrar_lote_fabril", { p_lote_fabril_id: loteFabrilId });
    check("sem producao.manage não encerra lote fabril", !!semPermEncerraError);

    const { error: encerraError } = await admTenant.client.rpc("encerrar_lote_fabril", { p_lote_fabril_id: loteFabrilId });
    check("encerra lote fabril", !encerraError);

    const { error: encerraDeNovoError } = await admTenant.client.rpc("encerrar_lote_fabril", { p_lote_fabril_id: loteFabrilId });
    check("encerrar lote fabril já encerrado é rejeitado", !!encerraDeNovoError);

    const { error: addAposEncerrarError } = await admTenant.client.rpc("adicionar_item_lote_fabril", {
      p_lote_fabril_id: loteFabrilId, p_op_lote_id: loteA, p_quantidade: 1,
    });
    check("lote fabril encerrado não aceita novos itens", !!addAposEncerrarError);

    const { data: crossLotesFabris } = await otherTenant.client.from("lotes_fabris").select("id").eq("id", loteFabrilId);
    check("tenant B não enxerga lote fabril do tenant A", (crossLotesFabris ?? []).length === 0);
    const { data: crossItensLoteFabril } = await otherTenant.client.from("lote_fabril_itens").select("id").eq("lote_fabril_id", loteFabrilId);
    check("tenant B não enxerga itens do lote fabril do tenant A", (crossItensLoteFabril ?? []).length === 0);

    // O mesmo op_lote pode participar de outro lote fabril — §14: "uma OP
    // poderá participar de vários lotes fabris" (aqui, o lote de liberação).
    const { data: loteFabril2Id } = await admTenant.client.rpc("criar_lote_fabril", { p_nome: "Lote Fabril 002" });
    const { error: reusoError } = await admTenant.client.rpc("adicionar_item_lote_fabril", {
      p_lote_fabril_id: loteFabril2Id, p_op_lote_id: loteB, p_quantidade: 9,
    });
    check("o mesmo lote de liberação pode entrar em outro lote fabril", !reusoError);
  }

  console.log("\n19. Cada ação grava a própria linha de auditoria");
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
        "producao.roteiro_criado",
        "producao.operacao_roteiro_adicionada",
        "producao.operacao_roteiro_removida",
        "producao.roteiro_desativado",
        "producao.lote_liberado",
        "producao.recurso_alocado",
        "producao.recurso_transferido",
        "producao.lote_fabril_criado",
        "producao.item_lote_fabril_adicionado",
        "producao.item_lote_fabril_removido",
        "producao.lote_fabril_encerrado",
        "producao.recurso_produtivo_criado",
        "producao.recurso_produtivo_editado",
        "producao.recurso_produtivo_situacao_alterada",
        "producao.recurso_produtivo_desativado",
        "producao.manutencao_preventiva_programada",
        "producao.manutencao_preventiva_editada",
        "producao.manutencao_preventiva_cancelada",
        "producao.manutencao_corretiva_iniciada",
        "producao.manutencao_corretiva_encerrada",
        "producao.recurso_operacao_trocado",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("ordem_criada registrado", actions.has("producao.ordem_criada"));
    check("apontamento_registrado registrado", actions.has("producao.apontamento_registrado"));
    check("ordem_concluida registrado", actions.has("producao.ordem_concluida"));
    check("ordem_cancelada registrado", actions.has("producao.ordem_cancelada"));
    check("versao_liberada registrado", actions.has("engenharia.versao_liberada"));
    check("roteiro_criado registrado", actions.has("producao.roteiro_criado"));
    check("operacao_roteiro_adicionada registrado", actions.has("producao.operacao_roteiro_adicionada"));
    check("operacao_roteiro_removida registrado", actions.has("producao.operacao_roteiro_removida"));
    check("roteiro_desativado registrado", actions.has("producao.roteiro_desativado"));
    check("lote_liberado registrado", actions.has("producao.lote_liberado"));
    check("recurso_alocado registrado", actions.has("producao.recurso_alocado"));
    check("recurso_transferido registrado", actions.has("producao.recurso_transferido"));
    check("lote_fabril_criado registrado", actions.has("producao.lote_fabril_criado"));
    check("item_lote_fabril_adicionado registrado", actions.has("producao.item_lote_fabril_adicionado"));
    check("item_lote_fabril_removido registrado", actions.has("producao.item_lote_fabril_removido"));
    check("lote_fabril_encerrado registrado", actions.has("producao.lote_fabril_encerrado"));
    check("recurso_produtivo_criado registrado", actions.has("producao.recurso_produtivo_criado"));
    check("recurso_produtivo_editado registrado", actions.has("producao.recurso_produtivo_editado"));
    check("recurso_produtivo_situacao_alterada registrado", actions.has("producao.recurso_produtivo_situacao_alterada"));
    check("recurso_produtivo_desativado registrado", actions.has("producao.recurso_produtivo_desativado"));
    check("manutencao_preventiva_programada registrado", actions.has("producao.manutencao_preventiva_programada"));
    check("manutencao_preventiva_editada registrado", actions.has("producao.manutencao_preventiva_editada"));
    check("manutencao_preventiva_cancelada registrado", actions.has("producao.manutencao_preventiva_cancelada"));
    check("manutencao_corretiva_iniciada registrado", actions.has("producao.manutencao_corretiva_iniciada"));
    check("manutencao_corretiva_encerrada registrado", actions.has("producao.manutencao_corretiva_encerrada"));
    check("recurso_operacao_trocado registrado", actions.has("producao.recurso_operacao_trocado"));
  }

  console.log("\n20. Planejamento — prioridade e programação por operação (TÓPICO 4 §5, Fase 6a)");
  {
    const prog = await prepararPedidoLiberado(admTenant, "20", { quantidade: 5 });
    await admin.from("pedidos").update({ previsao_entrega: "2026-10-15" }).eq("id", prog.pedidoId);

    const { data: recursoProgId } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "PROG-20", p_nome: "Recurso de programação", p_tipo: "maquina", p_setor: "Corte", p_capacidade_horas_dia: 8,
    });
    const { data: roteiroProgId } = await admTenant.client.rpc("criar_roteiro_produtivo", {
      p_item_id: prog.itemId, p_nome: "Roteiro programação",
    });
    await admTenant.client.rpc("adicionar_operacao_roteiro", {
      p_roteiro_id: roteiroProgId, p_sequencia: 1, p_descricao: "Cortar programação", p_recurso_produtivo_id: recursoProgId,
      p_tempo_previsto_minutos: 60, p_requisitos: null, p_criterios_qualidade: null, p_equipamentos_alternativos: null,
    });
    const { data: opProgId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: prog.pedidoItemId });
    const opProgOperacaoId = await operacaoUnica(opProgId);

    const { error: prioridadeForaFaixaError } = await admTenant.client.rpc("definir_prioridade_op", {
      p_ordem_producao_id: opProgId, p_prioridade: 6,
    });
    check("prioridade fora da faixa 1-5 é rejeitada", !!prioridadeForaFaixaError);

    const { error: prioridadeError } = await admTenant.client.rpc("definir_prioridade_op", {
      p_ordem_producao_id: opProgId, p_prioridade: 1,
    });
    check("define prioridade 1 (mais urgente)", !prioridadeError);

    const { error: semPermPrioridadeError } = await noPermTenant.client.rpc("definir_prioridade_op", {
      p_ordem_producao_id: opProgId, p_prioridade: 2,
    });
    check("sem producao.manage não define prioridade de OP de outra empresa", !!semPermPrioridadeError);

    const { error: crossPrioridadeError } = await otherTenant.client.rpc("definir_prioridade_op", {
      p_ordem_producao_id: opProgId, p_prioridade: 2,
    });
    check("tenant B não define prioridade de OP do tenant A", !!crossPrioridadeError);

    const { error: dataInvalidaError } = await admTenant.client.rpc("programar_operacao", {
      p_op_lote_operacao_id: opProgOperacaoId, p_data_planejada_inicio: "2026-10-10", p_data_planejada_fim: "2026-10-05",
    });
    check("data planejada de fim anterior ao início é rejeitada", !!dataInvalidaError);

    const { error: programaError } = await admTenant.client.rpc("programar_operacao", {
      p_op_lote_operacao_id: opProgOperacaoId, p_data_planejada_inicio: "2026-10-01", p_data_planejada_fim: "2026-10-03",
    });
    check("programa a operação (datas válidas)", !programaError);

    const { error: semPermProgramaError } = await noPermTenant.client.rpc("programar_operacao", {
      p_op_lote_operacao_id: opProgOperacaoId, p_data_planejada_inicio: "2026-10-01", p_data_planejada_fim: "2026-10-03",
    });
    check("sem producao.manage não programa operação de outra empresa", !!semPermProgramaError);

    const { data: programacao, error: listaProgramacaoError } = await admTenant.client.rpc("listar_programacao", {
      p_data_inicio: "2026-09-25", p_data_fim: "2026-10-31", p_recurso_produtivo_id: null, p_setor: null,
    });
    check("listar_programacao() executa sem erro", !listaProgramacaoError && Array.isArray(programacao));
    const linhaProg = programacao?.find((r) => r.op_lote_operacao_id === opProgOperacaoId);
    check(
      "linha traz prioridade, prazo do pedido e datas planejadas",
      !!linhaProg && linhaProg.prioridade === 1 && linhaProg.previsao_entrega === "2026-10-15" &&
        linhaProg.data_planejada_inicio === "2026-10-01" && linhaProg.data_planejada_fim === "2026-10-03",
    );

    const { data: foraDoIntervalo } = await admTenant.client.rpc("listar_programacao", {
      p_data_inicio: "2026-11-01", p_data_fim: "2026-11-30", p_recurso_produtivo_id: null, p_setor: null,
    });
    check(
      "filtro de intervalo de data exclui operação fora da janela",
      !(foraDoIntervalo ?? []).some((r) => r.op_lote_operacao_id === opProgOperacaoId),
    );

    const { data: porRecurso } = await admTenant.client.rpc("listar_programacao", {
      p_data_inicio: null, p_data_fim: null, p_recurso_produtivo_id: recursoProgId, p_setor: null,
    });
    check("filtro por recurso encontra a operação", (porRecurso ?? []).some((r) => r.op_lote_operacao_id === opProgOperacaoId));

    const { data: porSetorErrado } = await admTenant.client.rpc("listar_programacao", {
      p_data_inicio: null, p_data_fim: null, p_recurso_produtivo_id: null, p_setor: "Setor Inexistente",
    });
    check(
      "filtro por setor errado não encontra a operação",
      !(porSetorErrado ?? []).some((r) => r.op_lote_operacao_id === opProgOperacaoId),
    );

    const { error: semPermListaProgramacaoError } = await noPermTenant.client.rpc("listar_programacao", {
      p_data_inicio: null, p_data_fim: null, p_recurso_produtivo_id: null, p_setor: null,
    });
    check("sem producao.view não consulta programação de outra empresa", !!semPermListaProgramacaoError);

    const { data: crossProgramacao } = await otherTenant.client.rpc("listar_programacao", {
      p_data_inicio: null, p_data_fim: null, p_recurso_produtivo_id: null, p_setor: null,
    });
    check(
      "tenant B não enxerga a programação do tenant A na própria consulta",
      !(crossProgramacao ?? []).some((r) => r.op_lote_operacao_id === opProgOperacaoId),
    );

    const { data: events20 } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", ["producao.prioridade_definida", "producao.operacao_programada"]);
    const actions20 = new Set((events20 ?? []).map((e) => e.action));
    check("prioridade_definida registrado", actions20.has("producao.prioridade_definida"));
    check("operacao_programada registrado", actions20.has("producao.operacao_programada"));
  }

  console.log("\n21. Sequenciamento inteligente (TÓPICO 4 §6, Fase 6b)");
  {
    const hoje = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    const menos5 = new Date(hoje); menos5.setDate(hoje.getDate() - 5);
    const mais30 = new Date(hoje); mais30.setDate(hoje.getDate() + 30);

    const { data: recursoSeqId } = await admTenant.client.rpc("criar_recurso_produtivo", {
      p_codigo: "SEQ-21", p_nome: "Recurso de sequenciamento", p_tipo: "maquina", p_setor: null, p_capacidade_horas_dia: 8,
    });

    async function prepararOperacaoSequenciamento(sufixo, { previsaoEntrega, perfil, ferramenta, processo }) {
      const dados = await prepararPedidoLiberado(admTenant, sufixo, { quantidade: 5 });
      await admin.from("pedidos").update({ previsao_entrega: previsaoEntrega }).eq("id", dados.pedidoId);
      const { data: roteiroId } = await admTenant.client.rpc("criar_roteiro_produtivo", {
        p_item_id: dados.itemId, p_nome: `Roteiro ${sufixo}`,
      });
      await admTenant.client.rpc("adicionar_operacao_roteiro", {
        p_roteiro_id: roteiroId, p_sequencia: 1, p_descricao: `Operação ${sufixo}`, p_recurso_produtivo_id: recursoSeqId,
        p_tempo_previsto_minutos: 30, p_requisitos: null, p_criterios_qualidade: null, p_equipamentos_alternativos: null,
        p_perfil: perfil, p_ferramenta: ferramenta, p_processo: processo,
      });
      const { data: opId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: dados.pedidoItemId });
      const { data: op } = await admin.from("ordens_producao").select("numero").eq("id", opId).single();
      return { opId, numero: op.numero, opLoteOperacaoId: await operacaoUnica(opId) };
    }

    // A: prazo vencido (5 dias atrás), setup isolado — sempre 'risco',
    // qualquer que seja a posição. B e C: mesmo prazo futuro e mesma
    // prioridade (empate nesses 2 critérios), mesmo perfil/ferramenta/
    // processo (setup compartilhado entre os 2) — nenhum vencido.
    const A = await prepararOperacaoSequenciamento("211", {
      previsaoEntrega: fmt(menos5), perfil: "SetupA", ferramenta: "ToolA", processo: "ProcA",
    });
    const B = await prepararOperacaoSequenciamento("212", {
      previsaoEntrega: fmt(mais30), perfil: "Comum", ferramenta: "FComum", processo: "ProcComum",
    });
    const C = await prepararOperacaoSequenciamento("213", {
      previsaoEntrega: fmt(mais30), perfil: "Comum", ferramenta: "FComum", processo: "ProcComum",
    });

    const { data: recDefault, error: recDefaultError } = await admTenant.client.rpc("recomendar_sequenciamento", {
      p_recurso_produtivo_id: recursoSeqId,
    });
    check("recomendar_sequenciamento() executa sem erro", !recDefaultError && Array.isArray(recDefault));

    const rowA = recDefault?.find((r) => r.op_lote_operacao_id === A.opLoteOperacaoId);
    const rowB = recDefault?.find((r) => r.op_lote_operacao_id === B.opLoteOperacaoId);
    const rowC = recDefault?.find((r) => r.op_lote_operacao_id === C.opLoteOperacaoId);
    check("as 3 operações pendentes aparecem na recomendação", !!rowA && !!rowB && !!rowC);

    check("OP com prazo vencido é classificada 'risco', com dias_para_prazo negativo", rowA?.classificacao === "risco" && rowA?.dias_para_prazo < 0);
    check("explicação de risco menciona atraso", (rowA?.explicacao ?? "").includes("atrasada"));

    check(
      "B e C compartilham setup (perfil/ferramenta/processo iguais) — setup_compartilhado_count=1 pros dois",
      rowB?.setup_compartilhado_count === 1 && rowC?.setup_compartilhado_count === 1 && rowA?.setup_compartilhado_count === 0,
    );
    check("perfil/ferramenta/processo retornados batem com o cadastrado", rowB?.perfil === "Comum" && rowB?.ferramenta === "FComum" && rowB?.processo === "ProcComum");

    // Sem data planejada em nenhuma das 3 (Fase 6a), posição atual empata
    // por prioridade e desempata por número da OP — ordem de criação
    // (A, B, C). Com pesos default (1/1/1), B e C (score 4) vêm antes de
    // A (score 5, penalizado por não compartilhar setup com ninguém) —
    // A cai pra 3ª posição recomendada mesmo sendo a 1ª na ordem atual.
    check("posição atual segue a ordem de criação (A=1, B=2, C=3), sem programação ainda", rowA?.posicao_atual === 1 && rowB?.posicao_atual === 2 && rowC?.posicao_atual === 3);
    check(
      "com pesos default, B e C (setup compartilhado) vêm à frente de A na posição recomendada",
      rowA?.posicao_recomendada === 3 && [rowB?.posicao_recomendada, rowC?.posicao_recomendada].sort().join(",") === "1,2",
    );
    check(
      "A (atrasada, posição recomendada pior que a atual) é classificada 'risco', não 'oportunidade'",
      rowA?.classificacao === "risco",
    );
    check("B e C (posição recomendada melhor que a atual) são classificadas 'oportunidade'", rowB?.classificacao === "oportunidade" && rowC?.classificacao === "oportunidade");
    check("explicação de oportunidade menciona o agrupamento por setup", (rowB?.explicacao ?? "").includes("agrupa com 1 operação"));

    const { error: semPermRecError } = await noPermTenant.client.rpc("recomendar_sequenciamento", { p_recurso_produtivo_id: recursoSeqId });
    check("sem producao.view não consulta recomendação de outra empresa", !!semPermRecError);

    const { data: crossRec } = await otherTenant.client.rpc("recomendar_sequenciamento", { p_recurso_produtivo_id: recursoSeqId });
    check("tenant B não enxerga a recomendação do tenant A na própria consulta", (crossRec ?? []).length === 0);

    // Pesos — validação, permissão, isolamento por empresa e efeito
    // observável no ranking.
    const { error: criterioInvalidoError } = await admTenant.client.rpc("definir_peso_sequenciamento", { p_criterio: "inexistente", p_peso: 1 });
    check("critério inválido é rejeitado", !!criterioInvalidoError);

    const { error: pesoNegativoError } = await admTenant.client.rpc("definir_peso_sequenciamento", { p_criterio: "prazo", p_peso: -1 });
    check("peso negativo é rejeitado", !!pesoNegativoError);

    const { error: semPermPesoError } = await noPermTenant.client.rpc("definir_peso_sequenciamento", { p_criterio: "prazo", p_peso: 2 });
    check("sem producao.manage não define peso de sequenciamento", !!semPermPesoError);

    // Outro tenant define um peso enorme na própria empresa — não deve
    // afetar em nada o cálculo do tenant A (isolamento por company_id).
    await otherTenant.client.rpc("definir_peso_sequenciamento", { p_criterio: "prazo", p_peso: 999 });
    const { data: recAposOutroTenant } = await admTenant.client.rpc("recomendar_sequenciamento", { p_recurso_produtivo_id: recursoSeqId });
    const rowAAposOutroTenant = recAposOutroTenant?.find((r) => r.op_lote_operacao_id === A.opLoteOperacaoId);
    check("peso definido por outro tenant não afeta o ranking do tenant A", rowAAposOutroTenant?.posicao_recomendada === 3);

    // O próprio tenant A aumenta bastante o peso de prazo — A (mais
    // urgente por prazo) deve saltar pra 1ª posição recomendada.
    const { error: pesoPrazoError } = await admTenant.client.rpc("definir_peso_sequenciamento", { p_criterio: "prazo", p_peso: 100 });
    check("define peso de prazo (100)", !pesoPrazoError);

    const { data: recPesoAlto } = await admTenant.client.rpc("recomendar_sequenciamento", { p_recurso_produtivo_id: recursoSeqId });
    const rowAPesoAlto = recPesoAlto?.find((r) => r.op_lote_operacao_id === A.opLoteOperacaoId);
    check("com peso de prazo dominante, A (mais urgente) assume a 1ª posição recomendada", rowAPesoAlto?.posicao_recomendada === 1);

    const { data: events21 } = await admin
      .from("activity_logs")
      .select("action")
      .eq("action", "producao.peso_sequenciamento_definido");
    check("peso_sequenciamento_definido registrado", (events21 ?? []).length > 0);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
