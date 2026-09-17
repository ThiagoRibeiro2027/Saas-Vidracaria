// Testes automatizados do TÓPICO 8 — Qualidade, recorte mínimo do M1
// (PLANO DE ENTREGA — MVP DO PILOTO v1.0, dezembro): inspeção simples de
// OP concluída, aprovação/reprovação, não conformidade, retrabalho e
// reinspeção. Qualidade é uma autoridade PARALELA à de Produção — nenhum
// teste aqui deve encontrar mudança de comportamento em criar_ordem_
// producao/apontar_producao/concluir_ordem_producao/cancelar_ordem_
// producao (ver item 22 abaixo, que reproduz invariantes de
// test-producao.mjs contra uma OP também bloqueada por qualidade).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-qualidade.mjs

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

// Pedido liberado -> OP criada -> apontada de uma vez -> concluída.
// quantidade_produzida sai igual à planejada (sem perda), pra deixar a
// aritmética de aprovada/reprovada dos testes de Qualidade simples.
async function prepararOrdemConcluida(tenant, sufixo, quantidade = 10) {
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
    p_id: null, p_tipo_documento: "CNPJ", p_documento: `1122233300${sufixo}`, p_nome: "JR Box Vidros",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  if (pessoaErr) console.error("[fixture] upsert_pessoa falhou:", pessoaErr);
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  const { data: itemId, error: itemErr } = await tenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: `VD-${sufixo}`, p_descricao: "Vidro temperado 10mm",
    p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
    p_situacao: "ativo",
  });
  if (itemErr) console.error("[fixture] upsert_item falhou:", itemErr);

  const { data: orcamentoId, error: orcErr } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: null, p_validade: null,
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

  const { data: opId, error: criarErr } = await tenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedidoItem.id });
  if (criarErr) console.error("[fixture] criar_ordem_producao falhou:", criarErr);
  // TÓPICO 4 §16 (Fase 2): sem roteiro configurado, a OP nasce com uma
  // única op_operacao "Produção" — apontar_producao() aponta nela.
  const { data: opOperacao } = await admin.from("op_operacoes").select("id").eq("ordem_producao_id", opId).single();
  const { error: apontarErr } = await tenant.client.rpc("apontar_producao", {
    p_op_operacao_id: opOperacao?.id, p_quantidade_produzida: quantidade, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: "lote único",
  });
  if (apontarErr) console.error("[fixture] apontar_producao falhou:", apontarErr);
  const { error: concluirErr } = await tenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opId });
  if (concluirErr) console.error("[fixture] concluir_ordem_producao falhou:", concluirErr);

  return { pessoaId, itemId, pedidoId, pedidoItemId: pedidoItem.id, opId, quantidade };
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão de qualidade, outro tenant)...");
  const admTenant = await createTenant("qualidade-test-admin", "Qualidade Admin Teste", "9d01", "ADMIN");
  // PRODUCAO administra Produção, não Qualidade — prova a autoridade
  // paralela: quem cria/apontar/conclui OP não pode, só por isso,
  // inspecionar a qualidade dela.
  const noPermTenant = await createTenant("qualidade-test-admin", "Qualidade SemPerm Teste", "9d02", "PRODUCAO", admTenant.company);
  const otherTenant = await createTenant("qualidade-test-other", "Qualidade Outro Teste", "9d03", "ADMIN");

  console.log("\n0. Massa de dados — OP concluída com 10 unidades produzidas");
  const massa = await prepararOrdemConcluida(admTenant, "1", 10);
  check("OP concluída pronta pra inspeção", !!massa.opId);
  {
    const { data: op } = await admin.from("ordens_producao").select("status, status_qualidade").eq("id", massa.opId).single();
    check("OP está 'concluida' antes de qualquer inspeção", op?.status === "concluida");
    check("status_qualidade nasce 'pendente'", op?.status_qualidade === "pendente");
  }

  console.log("\n1. registrar_inspecao_qualidade() exige qualidade.manage");
  {
    const { error } = await noPermTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: massa.opId, p_quantidade_aprovada: 10, p_quantidade_reprovada: 0, p_observacoes: null,
    });
    check("sem qualidade.manage (papel PRODUCAO) não registra inspeção", !!error);
  }

  console.log("\n2. Exige OP concluída");
  {
    const emAndamento = await (async () => {
      const { data: pessoaId } = await admTenant.client.rpc("upsert_pessoa", {
        p_id: null, p_tipo_documento: "CNPJ", p_documento: "11222333002a", p_nome: "JR Box Vidros",
        p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
        p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
      });
      await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });
      const { data: itemId } = await admTenant.client.rpc("upsert_item", {
        p_id: null, p_codigo: "VD-2a", p_descricao: "Vidro temperado 10mm",
        p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2", p_situacao: "ativo",
      });
      const { data: orcamentoId } = await admTenant.client.rpc("upsert_orcamento", {
        p_id: null, p_pessoa_id: pessoaId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
      });
      await admTenant.client.rpc("upsert_orcamento_item", {
        p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: 3, p_preco_unitario: 100,
      });
      await admTenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });
      const { data: pedidoId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
      await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
      await admTenant.client.rpc("liberar_pedido", { p_id: pedidoId });
      const { data: pedidoItem } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).single();
      const { data: opId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedidoItem.id });
      return opId;
    })();

    const { error: planejadaError } = await admTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: emAndamento, p_quantidade_aprovada: 3, p_quantidade_reprovada: 0, p_observacoes: null,
    });
    check("OP 'planejada' (nunca apontada) é rejeitada", !!planejadaError);

    const { data: opOperacaoEmAndamento } = await admin.from("op_operacoes").select("id").eq("ordem_producao_id", emAndamento).single();
    await admTenant.client.rpc("apontar_producao", {
      p_op_operacao_id: opOperacaoEmAndamento?.id, p_quantidade_produzida: 3, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    const { error: emProducaoError } = await admTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: emAndamento, p_quantidade_aprovada: 3, p_quantidade_reprovada: 0, p_observacoes: null,
    });
    check("OP 'em_producao' (apontada mas não concluída) é rejeitada", !!emProducaoError);
  }

  console.log("\n3. Soma menor que quantidade_produzida é rejeitada");
  {
    const { error } = await admTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: massa.opId, p_quantidade_aprovada: 4, p_quantidade_reprovada: 4, p_observacoes: null,
    });
    check("soma (8) menor que produzida (10) é rejeitada", !!error);
  }

  console.log("\n4. Soma maior que quantidade_produzida é rejeitada");
  {
    const { error } = await admTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: massa.opId, p_quantidade_aprovada: 8, p_quantidade_reprovada: 4, p_observacoes: null,
    });
    check("soma (12) maior que produzida (10) é rejeitada", !!error);
  }

  console.log("\n5. Quantidade negativa é rejeitada");
  {
    const { error } = await admTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: massa.opId, p_quantidade_aprovada: -1, p_quantidade_reprovada: 11, p_observacoes: null,
    });
    check("quantidade_aprovada negativa é rejeitada", !!error);
  }

  console.log("\n6. Inspeção 100% reprovada — cobre o caso quantidade_aprovada = 0 (item 8 do plano)");
  let ncId;
  {
    const { data: inspecaoId, error } = await admTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: massa.opId, p_quantidade_aprovada: 0, p_quantidade_reprovada: 10, p_observacoes: "lote todo fora de especificação",
    });
    check("inspeção 100% reprovada é aceita", !error && !!inspecaoId);

    const { data: inspecao } = await admin.from("inspecoes_qualidade").select("resultado").eq("id", inspecaoId).single();
    check("resultado da inspeção é 'reprovado'", inspecao?.resultado === "reprovado");

    const { data: op } = await admin.from("ordens_producao").select("status_qualidade").eq("id", massa.opId).single();
    check("status_qualidade vira 'bloqueado'", op?.status_qualidade === "bloqueado");

    const { data: nc } = await admin.from("nao_conformidades").select("*").eq("ordem_producao_id", massa.opId).single();
    check("não conformidade aberta com a quantidade reprovada inteira (10)", nc?.status === "aberta" && Number(nc?.quantidade) === 10);
    ncId = nc.id;
  }

  console.log("\n7. Segunda inspeção 'primeira' na mesma OP é rejeitada");
  {
    const { error } = await admTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: massa.opId, p_quantidade_aprovada: 10, p_quantidade_reprovada: 0, p_observacoes: null,
    });
    check("já existe inspeção registrada para esta OP", !!error);
  }

  console.log("\n8. Inspeção parcialmente reprovada (outra OP) — item 7 do plano");
  let parcial;
  {
    parcial = await prepararOrdemConcluida(admTenant, "8", 10);
    const { data: inspecaoId, error } = await admTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: parcial.opId, p_quantidade_aprovada: 6, p_quantidade_reprovada: 4, p_observacoes: "4 unidades com bolha",
    });
    check("inspeção parcialmente reprovada é aceita", !error && !!inspecaoId);

    const { data: nc } = await admin.from("nao_conformidades").select("*").eq("ordem_producao_id", parcial.opId).single();
    check("NC aberta só com a quantidade reprovada (4 de 10)", nc?.status === "aberta" && Number(nc?.quantidade) === 4);

    const { data: op } = await admin.from("ordens_producao").select("status_qualidade").eq("id", parcial.opId).single();
    check("status_qualidade bloqueado mesmo com aprovação parcial", op?.status_qualidade === "bloqueado");
  }

  console.log("\n9. Inspeção 100% aprovada não abre NC");
  let aprovada;
  {
    aprovada = await prepararOrdemConcluida(admTenant, "9", 5);
    const { data: inspecaoId, error } = await admTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: aprovada.opId, p_quantidade_aprovada: 5, p_quantidade_reprovada: 0, p_observacoes: null,
    });
    check("inspeção 100% aprovada é aceita", !error && !!inspecaoId);

    const { data: inspecao } = await admin.from("inspecoes_qualidade").select("resultado").eq("id", inspecaoId).single();
    check("resultado é 'aprovado'", inspecao?.resultado === "aprovado");

    const { data: ncs } = await admin.from("nao_conformidades").select("id").eq("ordem_producao_id", aprovada.opId);
    check("nenhuma NC criada", (ncs ?? []).length === 0);

    const { data: op } = await admin.from("ordens_producao").select("status_qualidade").eq("id", aprovada.opId).single();
    check("status_qualidade vira 'aprovado'", op?.status_qualidade === "aprovado");
  }

  console.log("\n10. executar_retrabalho() exige qualidade.manage");
  {
    const { error } = await noPermTenant.client.rpc("executar_retrabalho", { p_nao_conformidade_id: ncId, p_observacao: null });
    check("sem qualidade.manage não executa retrabalho", !!error);
  }

  console.log("\n11. executar_retrabalho() em NC de outra empresa é rejeitado");
  {
    const { error } = await otherTenant.client.rpc("executar_retrabalho", { p_nao_conformidade_id: ncId, p_observacao: null });
    check("tenant B não executa retrabalho de NC do tenant A", !!error);
  }

  console.log("\n12. executar_retrabalho() — sucesso e idempotência negativa");
  {
    const { data, error } = await admTenant.client.rpc("executar_retrabalho", {
      p_nao_conformidade_id: ncId, p_observacao: "retrabalhado no forno 2",
    });
    check("retrabalho executado com sucesso", !error && data === ncId);

    const { data: nc } = await admin.from("nao_conformidades").select("retrabalho_executado_em").eq("id", ncId).single();
    check("retrabalho_executado_em foi preenchido", !!nc?.retrabalho_executado_em);

    const { error: duplicadoError } = await admTenant.client.rpc("executar_retrabalho", {
      p_nao_conformidade_id: ncId, p_observacao: "de novo",
    });
    check("executar retrabalho duas vezes na mesma NC é rejeitado", !!duplicadoError);
  }

  console.log("\n13. reinspecionar_retrabalho() sem executar_retrabalho antes é rejeitado (NC nova, do teste 8)");
  let ncParcialId;
  {
    const { data: nc } = await admin.from("nao_conformidades").select("id").eq("ordem_producao_id", parcial.opId).single();
    ncParcialId = nc.id;
    const { error } = await admTenant.client.rpc("reinspecionar_retrabalho", {
      p_nao_conformidade_id: ncParcialId, p_quantidade_aprovada: 4, p_quantidade_reprovada: 0, p_observacoes: null,
    });
    check("reinspeção sem retrabalho executado é rejeitada", !!error);
  }

  console.log("\n14. reinspecionar_retrabalho() com soma diferente da quantidade em retrabalho é rejeitada");
  {
    await admTenant.client.rpc("executar_retrabalho", { p_nao_conformidade_id: ncParcialId, p_observacao: "retrabalho" });
    const { error } = await admTenant.client.rpc("reinspecionar_retrabalho", {
      p_nao_conformidade_id: ncParcialId, p_quantidade_aprovada: 3, p_quantidade_reprovada: 0, p_observacoes: null,
    });
    check("soma (3) diferente da quantidade em retrabalho (4) é rejeitada", !!error);
  }

  console.log("\n15. reinspecionar_retrabalho() — reprovada=0 fecha a NC e libera a OP");
  {
    const { data: inspecaoId, error } = await admTenant.client.rpc("reinspecionar_retrabalho", {
      p_nao_conformidade_id: ncParcialId, p_quantidade_aprovada: 4, p_quantidade_reprovada: 0, p_observacoes: "retrabalho recuperou tudo",
    });
    check("reinspeção total aceita", !error && !!inspecaoId);

    const { data: nc } = await admin.from("nao_conformidades").select("status, encerrada_em").eq("id", ncParcialId).single();
    check("NC encerrada", nc?.status === "encerrada" && !!nc?.encerrada_em);

    const { data: op } = await admin.from("ordens_producao").select("status_qualidade").eq("id", parcial.opId).single();
    check("status_qualidade volta a 'aprovado'", op?.status_qualidade === "aprovado");
  }

  console.log("\n16. reinspecionar_retrabalho() — reprovada>0 fecha a NC atual e abre uma nova (item 16 do plano)");
  let ncCicloId;
  {
    // ncId (testes 6/12) já teve retrabalho executado — reinspeciona com reprovação parcial.
    const { data: inspecaoId, error } = await admTenant.client.rpc("reinspecionar_retrabalho", {
      p_nao_conformidade_id: ncId, p_quantidade_aprovada: 7, p_quantidade_reprovada: 3, p_observacoes: "melhorou, mas ainda sobrou defeito",
    });
    check("reinspeção parcial aceita", !error && !!inspecaoId);

    const { data: ncAntiga } = await admin.from("nao_conformidades").select("status").eq("id", ncId).single();
    check("NC original encerrada", ncAntiga?.status === "encerrada");

    const { data: ncsAbertas } = await admin
      .from("nao_conformidades")
      .select("id, quantidade, status")
      .eq("ordem_producao_id", massa.opId)
      .eq("status", "aberta");
    check("uma NOVA NC foi aberta com a quantidade remanescente (3)", ncsAbertas?.length === 1 && Number(ncsAbertas[0]?.quantidade) === 3);
    ncCicloId = ncsAbertas[0]?.id;

    const { data: op } = await admin.from("ordens_producao").select("status_qualidade").eq("id", massa.opId).single();
    check("status_qualidade continua 'bloqueado'", op?.status_qualidade === "bloqueado");
  }

  console.log("\n17. Segundo ciclo completo até aprovação final — histórico das duas NCs preservado");
  {
    await admTenant.client.rpc("executar_retrabalho", { p_nao_conformidade_id: ncCicloId, p_observacao: "segundo retrabalho" });
    const { error } = await admTenant.client.rpc("reinspecionar_retrabalho", {
      p_nao_conformidade_id: ncCicloId, p_quantidade_aprovada: 3, p_quantidade_reprovada: 0, p_observacoes: "agora aprovou",
    });
    check("segunda reinspeção (100% aprovada) aceita", !error);

    const { data: op } = await admin.from("ordens_producao").select("status_qualidade").eq("id", massa.opId).single();
    check("status_qualidade finalmente 'aprovado'", op?.status_qualidade === "aprovado");

    const { data: todasNcs } = await admin
      .from("nao_conformidades")
      .select("id, status")
      .eq("ordem_producao_id", massa.opId)
      .order("aberta_em", { ascending: true });
    check(
      "as duas NCs do ciclo continuam legíveis e encerradas (nada foi apagado)",
      todasNcs?.length === 2 && todasNcs.every((nc) => nc.status === "encerrada"),
    );

    const { data: todasInspecoes } = await admin
      .from("inspecoes_qualidade")
      .select("id")
      .eq("ordem_producao_id", massa.opId);
    check("3 inspeções registradas ao todo (inicial + 2 reinspeções)", (todasInspecoes ?? []).length === 3);
  }

  console.log("\n18. reinspecionar_retrabalho() numa NC já encerrada é rejeitado");
  {
    const { error } = await admTenant.client.rpc("reinspecionar_retrabalho", {
      p_nao_conformidade_id: ncCicloId, p_quantidade_aprovada: 3, p_quantidade_reprovada: 0, p_observacoes: null,
    });
    check("reinspecionar NC já encerrada é rejeitado", !!error);
  }

  console.log("\n19. Isolamento entre tenants");
  {
    const { data: crossInspecoes } = await otherTenant.client
      .from("inspecoes_qualidade")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga inspeções do tenant A", (crossInspecoes ?? []).length === 0);

    const { data: crossNcs } = await otherTenant.client
      .from("nao_conformidades")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga não conformidades do tenant A", (crossNcs ?? []).length === 0);

    const { error: crossInspecionarError } = await otherTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: aprovada.opId, p_quantidade_aprovada: 5, p_quantidade_reprovada: 0, p_observacoes: null,
    });
    check("tenant B não consegue inspecionar OP do tenant A", !!crossInspecionarError);
  }

  console.log("\n20. SELECT liberado sem qualidade.manage (tenant PRODUCAO lê normalmente)");
  {
    const { data: inspecoes, error } = await noPermTenant.client
      .from("inspecoes_qualidade")
      .select("id")
      .eq("ordem_producao_id", massa.opId);
    check("papel PRODUCAO (sem qualidade.manage) lê inspecoes_qualidade da própria empresa", !error && (inspecoes ?? []).length > 0);

    const { data: ncs, error: ncError } = await noPermTenant.client
      .from("nao_conformidades")
      .select("id")
      .eq("ordem_producao_id", massa.opId);
    check("papel PRODUCAO lê nao_conformidades da própria empresa", !ncError && (ncs ?? []).length > 0);
  }

  console.log("\n21. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "qualidade.inspecao_registrada",
        "qualidade.retrabalho_executado",
        "qualidade.reinspecao_registrada",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("inspecao_registrada registrado", actions.has("qualidade.inspecao_registrada"));
    check("retrabalho_executado registrado", actions.has("qualidade.retrabalho_executado"));
    check("reinspecao_registrada registrado", actions.has("qualidade.reinspecao_registrada"));
  }

  console.log("\n22. Invariantes de T4 preservados numa OP bloqueada por qualidade (sem regressão)");
  {
    const { data: opOperacaoParcial } = await admin.from("op_operacoes").select("id").eq("ordem_producao_id", parcial.opId).single();
    const { error: apontarError } = await admTenant.client.rpc("apontar_producao", {
      p_op_operacao_id: opOperacaoParcial?.id, p_quantidade_produzida: 1, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: null,
    });
    check("apontar em OP concluída continua rejeitado, mesmo já aprovada pela qualidade", !!apontarError);

    const { error: cancelarError } = await admTenant.client.rpc("cancelar_ordem_producao", {
      p_ordem_producao_id: parcial.opId, p_motivo: "teste",
    });
    check("cancelar OP concluída continua rejeitado, mesmo já aprovada pela qualidade", !!cancelarError);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
