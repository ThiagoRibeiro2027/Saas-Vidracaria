// Testes automatizados do TÓPICO 16 — Instalação/Montagem, recorte mínimo
// do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0, dezembro): agenda,
// execução, ocorrências, dano/nova fabricação (§8), conclusão e aceite,
// com suporte a instalação parcial. Integração com T9 é só por LEITURA de
// expedicao_itens.quantidade_entregue — nenhum teste aqui deve encontrar
// mudança de comportamento em T3/T4/T8/T9.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-instalacao.mjs

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
// (100%), com obra definida — pronto pra instalação.
async function prepararItemEntregue(tenant, sufixo, quantidade = 10, { comObra = true } = {}) {
  for (const [documentType, prefixo] of [
    ["orcamento", "ORC"], ["pedido", "PED"], ["ordem_producao", "OP"],
    ["expedicao", "EXP"], ["instalacao", "INST"],
  ]) {
    await tenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: documentType, p_prefixo: `${prefixo}${sufixo}-`, p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
  }

  const { data: pessoaId, error: pessoaErr } = await tenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CNPJ", p_documento: `1133344400${sufixo}`, p_nome: "JR Box Vidros",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  if (pessoaErr) console.error("[fixture] upsert_pessoa falhou:", pessoaErr);
  await tenant.client.rpc("set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true });

  let obraId = null;
  if (comObra) {
    const { data, error } = await tenant.client.rpc("upsert_obra", {
      p_id: null, p_pessoa_id: pessoaId, p_nome: `Obra ${sufixo}`,
      p_logradouro: "Rua Teste, 100", p_cidade: "São Paulo", p_uf: "SP", p_cep: "01000-000",
      p_situacao: "ativo",
    });
    if (error) console.error("[fixture] upsert_obra falhou:", error);
    obraId = data;
  }

  const { data: itemId, error: itemErr } = await tenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: `VD-${sufixo}`, p_descricao: "Vidro temperado 10mm",
    p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
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

  const { data: opId, error: criarErr } = await tenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pedidoItem.id });
  if (criarErr) console.error("[fixture] criar_ordem_producao falhou:", criarErr);
  // TÓPICO 4 §16 (Fase 2): sem roteiro configurado, a OP nasce com uma
  // única op_operacao "Produção" — apontar_producao() aponta nela.
  const { data: opOperacao } = await admin.from("op_lote_operacoes").select("id").eq("ordem_producao_id", opId).single();
  const { error: apontarErr } = await tenant.client.rpc("apontar_producao", {
    p_op_lote_operacao_id: opOperacao?.id, p_quantidade_produzida: quantidade, p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: "lote único",
  });
  if (apontarErr) console.error("[fixture] apontar_producao falhou:", apontarErr);
  const { error: concluirErr } = await tenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opId });
  if (concluirErr) console.error("[fixture] concluir_ordem_producao falhou:", concluirErr);
  const { error: inspecaoErr } = await tenant.client.rpc("registrar_inspecao_qualidade", {
    p_ordem_producao_id: opId, p_quantidade_aprovada: quantidade, p_quantidade_reprovada: 0, p_observacoes: null,
  });
  if (inspecaoErr) console.error("[fixture] registrar_inspecao_qualidade falhou:", inspecaoErr);

  const { data: expedicaoId, error: expErr } = await tenant.client.rpc("criar_expedicao", { p_pedido_id: pedidoId });
  if (expErr) console.error("[fixture] criar_expedicao falhou:", expErr);
  const { data: expItemId, error: expItemErr } = await tenant.client.rpc("adicionar_item_expedicao", {
    p_expedicao_id: expedicaoId, p_pedido_item_id: pedidoItem.id, p_quantidade: quantidade,
  });
  if (expItemErr) console.error("[fixture] adicionar_item_expedicao falhou:", expItemErr);
  const { error: conferirErr } = await tenant.client.rpc("conferir_expedicao", { p_expedicao_id: expedicaoId });
  if (conferirErr) console.error("[fixture] conferir_expedicao falhou:", conferirErr);
  const { error: saidaErr } = await tenant.client.rpc("registrar_saida_expedicao", { p_expedicao_id: expedicaoId });
  if (saidaErr) console.error("[fixture] registrar_saida_expedicao falhou:", saidaErr);
  const { error: entregaErr } = await tenant.client.rpc("confirmar_entrega_item_expedicao", {
    p_expedicao_item_id: expItemId, p_quantidade_entregue: quantidade,
  });
  if (entregaErr) console.error("[fixture] confirmar_entrega_item_expedicao falhou:", entregaErr);

  return { pessoaId, obraId, itemId, pedidoId, pedidoItemId: pedidoItem.id, opId, expedicaoId, quantidade };
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão de instalação, outro tenant)...");
  const admTenant = await createTenant("instalacao-test-admin", "Instalação Admin Teste", "16i01", "ADMIN");
  // EXPEDICAO administra Expedição, não Instalação — prova a autoridade
  // separada: quem expede não pode, só por isso, instalar.
  const noPermTenant = await createTenant("instalacao-test-admin", "Instalação SemPerm Teste", "16i02", "EXPEDICAO", admTenant.company);
  const otherTenant = await createTenant("instalacao-test-other", "Instalação Outro Teste", "16i03", "ADMIN");

  console.log("\n0. Massa de dados — item entregue por T9 (10 unidades), com obra");
  const massa = await prepararItemEntregue(admTenant, "1", 10);
  check("item entregue e pronto pra instalação", !!massa.pedidoItemId && !!massa.obraId);
  {
    const { data: expItem } = await admin.from("expedicao_itens").select("quantidade_entregue").eq("expedicao_id", massa.expedicaoId).single();
    check("pré-condição: 10 unidades entregues", Number(expItem?.quantidade_entregue) === 10);
  }

  console.log("\n1. criar_equipe_instalacao() exige instalacao.manage");
  {
    const { error } = await noPermTenant.client.rpc("criar_equipe_instalacao", { p_nome: "Equipe A" });
    check("sem instalacao.manage (papel EXPEDICAO) não cria equipe", !!error);
  }

  console.log("\n2. criar_equipe_instalacao() sucesso + adicionar/remover membro");
  let equipeId;
  {
    const { data, error } = await admTenant.client.rpc("criar_equipe_instalacao", { p_nome: "Equipe A" });
    check("ADMIN cria equipe", !error && !!data);
    equipeId = data;

    const { data: membroId, error: membroErr } = await admTenant.client.rpc("adicionar_membro_equipe", {
      p_equipe_id: equipeId, p_profile_id: admTenant.userId,
    });
    check("adiciona membro à equipe", !membroErr && !!membroId);

    const { error: crossMembroErr } = await admTenant.client.rpc("adicionar_membro_equipe", {
      p_equipe_id: equipeId, p_profile_id: otherTenant.userId,
    });
    check("não adiciona usuário de outra empresa como membro", !!crossMembroErr);

    const { error: removeErr } = await admTenant.client.rpc("remover_membro_equipe", { p_equipe_membro_id: membroId });
    check("remove membro da equipe", !removeErr);

    await admTenant.client.rpc("adicionar_membro_equipe", { p_equipe_id: equipeId, p_profile_id: admTenant.userId });
  }

  console.log("\n3. criar_instalacao() exige instalacao.manage");
  {
    const { error } = await noPermTenant.client.rpc("criar_instalacao", {
      p_pedido_id: massa.pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-01-10",
    });
    check("sem instalacao.manage não agenda instalação", !!error);
  }

  console.log("\n4. criar_instalacao() rejeita pedido não liberado");
  {
    const naoLiberado = await (async () => {
      const { data: orcId } = await admTenant.client.rpc("upsert_orcamento", {
        p_id: null, p_pessoa_id: massa.pessoaId, p_obra_id: massa.obraId, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
      });
      await admTenant.client.rpc("upsert_orcamento_item", {
        p_id: null, p_orcamento_id: orcId, p_item_id: massa.itemId, p_quantidade: 1, p_preco_unitario: 10,
      });
      await admTenant.client.rpc("decidir_orcamento", { p_id: orcId, p_decisao: "aprovado" });
      const { data: pedidoId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcId });
      return pedidoId; // fica em 'recebido' de propósito
    })();
    const { error } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: naoLiberado, p_equipe_id: equipeId, p_data_agendada: "2027-01-10",
    });
    check("pedido 'recebido' (não liberado) não pode gerar instalação", !!error);
  }

  console.log("\n5. criar_instalacao() rejeita pedido sem obra associada");
  {
    const semObra = await prepararItemEntregue(admTenant, "5", 3, { comObra: false });
    const { error } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: semObra.pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-01-10",
    });
    check("pedido sem obra_id não pode gerar instalação", !!error);
  }

  console.log("\n6. criar_instalacao() rejeita equipe inativa/inexistente");
  {
    const { error } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: massa.pedidoId, p_equipe_id: "00000000-0000-0000-0000-000000000000", p_data_agendada: "2027-01-10",
    });
    check("equipe inexistente é rejeitada", !!error);
  }

  console.log("\n7. criar_instalacao() sucesso");
  let instalacaoId;
  {
    const { data, error } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: massa.pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-01-10",
    });
    check("ADMIN agenda instalação", !error && !!data);
    instalacaoId = data;

    const { data: inst } = await admin.from("instalacoes").select("*").eq("id", instalacaoId).single();
    check("instalação nasce em 'agendada' com número gerado", inst?.status === "agendada" && /^INST\d+-\d{4}$/.test(inst?.numero ?? ""));
  }

  console.log("\n8. adicionar_item_instalacao() rejeita quantidade acima do entregue");
  {
    const { error } = await admTenant.client.rpc("adicionar_item_instalacao", {
      p_instalacao_id: instalacaoId, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 11,
    });
    check("quantidade (11) maior que a entregue (10) é rejeitada", !!error);
  }

  console.log("\n9. adicionar_item_instalacao() sucesso");
  let itemInstalacaoId;
  {
    const { data, error } = await admTenant.client.rpc("adicionar_item_instalacao", {
      p_instalacao_id: instalacaoId, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 6,
    });
    check("adiciona 6 de 10 entregues", !error && !!data);
    itemInstalacaoId = data;

    const { data: item } = await admin.from("instalacao_itens").select("*").eq("id", itemInstalacaoId).single();
    check("linha criada com quantidade_instalada=0 e quantidade_pendente=quantidade", Number(item?.quantidade) === 6 && Number(item?.quantidade_instalada) === 0 && Number(item?.quantidade_pendente) === 6);
  }

  console.log("\n10. Segunda instalação do mesmo item respeita o que já foi reservado");
  let instalacao2Id;
  let itemRemovivelId;
  {
    const { data } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: massa.pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-01-11",
    });
    instalacao2Id = data;

    const { error: excedeError } = await admTenant.client.rpc("adicionar_item_instalacao", {
      p_instalacao_id: instalacao2Id, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 5,
    });
    check("5 unidades excede o restante disponível (4 de 10, já que 6 foram reservadas)", !!excedeError);

    const { data: okId, error: okError } = await admTenant.client.rpc("adicionar_item_instalacao", {
      p_instalacao_id: instalacao2Id, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 4,
    });
    check("4 unidades (o restante exato) é aceito", !okError && !!okId);
    itemRemovivelId = okId;
  }

  console.log("\n11. remover_item_instalacao() funciona em 'agendada' e libera a disponibilidade");
  {
    const { error: removeError } = await admTenant.client.rpc("remover_item_instalacao", { p_instalacao_item_id: itemRemovivelId });
    check("remove item com instalação agendada", !removeError);

    const { data: readd, error: readdError } = await admTenant.client.rpc("adicionar_item_instalacao", {
      p_instalacao_id: instalacao2Id, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 4,
    });
    check("readiciona a mesma quantidade depois de remover", !readdError && !!readd);
    itemRemovivelId = readd;
  }

  console.log("\n12. iniciar_execucao_instalacao() rejeita instalação sem itens");
  {
    const { data: vaziaId } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: massa.pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-01-12",
    });
    const { error } = await admTenant.client.rpc("iniciar_execucao_instalacao", { p_instalacao_id: vaziaId });
    check("instalação sem itens não pode iniciar execução", !!error);
  }

  console.log("\n13. iniciar_execucao_instalacao() sucesso");
  {
    const { error } = await admTenant.client.rpc("iniciar_execucao_instalacao", { p_instalacao_id: instalacaoId });
    check("inicia execução de instalação agendada com itens", !error);
    const { data: inst } = await admin.from("instalacoes").select("status").eq("id", instalacaoId).single();
    check("status vira 'em_execucao'", inst?.status === "em_execucao");
  }

  console.log("\n14. adicionar_item_instalacao() rejeita depois de 'em_execucao'");
  {
    const { error } = await admTenant.client.rpc("adicionar_item_instalacao", {
      p_instalacao_id: instalacaoId, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 1,
    });
    check("não adiciona item em instalação já em execução", !!error);
  }

  console.log("\n15. registrar_execucao_item_instalacao() acumula por soma, sem exceder a quantidade");
  {
    const { error: e1 } = await admTenant.client.rpc("registrar_execucao_item_instalacao", {
      p_instalacao_item_id: itemInstalacaoId, p_quantidade_instalada: 4,
    });
    const { error: e2 } = await admTenant.client.rpc("registrar_execucao_item_instalacao", {
      p_instalacao_item_id: itemInstalacaoId, p_quantidade_instalada: 1,
    });
    check("duas execuções parciais aceitas", !e1 && !e2);

    const { data: itemFinal } = await admin.from("instalacao_itens").select("*").eq("id", itemInstalacaoId).single();
    check("quantidade_instalada acumulada por soma (5 de 6)", Number(itemFinal?.quantidade_instalada) === 5);
    check("quantidade_pendente reflete a soma (1)", Number(itemFinal?.quantidade_pendente) === 1);

    const { error: excessoError } = await admTenant.client.rpc("registrar_execucao_item_instalacao", {
      p_instalacao_item_id: itemInstalacaoId, p_quantidade_instalada: 2,
    });
    check("execução além da quantidade planejada é rejeitada", !!excessoError);
  }

  console.log("\n16. concluir_instalacao() aceita quantidade_pendente > 0 (instalação parcial)");
  {
    const { error } = await admTenant.client.rpc("concluir_instalacao", { p_instalacao_id: instalacaoId });
    check("conclui instalação mesmo com pendência (1 de 6)", !error);
    const { data: inst } = await admin.from("instalacoes").select("status").eq("id", instalacaoId).single();
    check("status vira 'concluida'", inst?.status === "concluida");
  }

  console.log("\n17. registrar_dano_instalacao() sucesso e valida causa");
  let danoId;
  {
    const { error: causaInvalidaError } = await admTenant.client.rpc("registrar_dano_instalacao", {
      p_instalacao_item_id: itemInstalacaoId, p_quantidade: 1, p_causa: "invalida", p_descricao: null,
    });
    check("causa inválida é rejeitada", !!causaInvalidaError);

    const { data, error } = await admTenant.client.rpc("registrar_dano_instalacao", {
      p_instalacao_item_id: itemInstalacaoId, p_quantidade: 1, p_causa: "transporte", p_descricao: "vidro trincado no transporte",
    });
    check("registra dano com causa válida", !error && !!data);
    danoId = data;
  }

  console.log("\n18. registrar_aceite_instalacao() exige instalacao.aceite (distinta de manage)");
  {
    // ADMIN tem todas as permissões de fundação (seed.sql), incluindo
    // instalacao.aceite — usamos EXPEDICAO (sem nenhuma permissão de
    // instalação) pra provar a negação, e um papel dedicado só com
    // instalacao.manage pra provar que manage sozinho não basta.
    const soManageRole = await admin.from("roles").insert({
      company_id: admTenant.company.id, key: "INSTALACAO_SO_MANAGE", name: "Instalação (só manage)",
    }).select().single();
    const { data: manageP } = await admin.from("permissions").select("id").eq("resource", "instalacao").eq("action", "manage").single();
    await admin.from("role_permissions").insert({ role_id: soManageRole.data.id, permission_id: manageP.id });

    const email = "16i04.instalacao-test-admin@users.internal";
    const { data: created } = await admin.auth.admin.createUser({ email, password: "senha-de-teste-123456", email_confirm: true });
    let userId = created?.user?.id;
    if (!userId) {
      const { data: list } = await admin.auth.admin.listUsers();
      userId = list.users.find((u) => u.email === email)?.id;
    }
    await admin.from("profiles").upsert({ id: userId, company_id: admTenant.company.id, login_identifier: "16i04", display_name: "Só Manage" }, { onConflict: "id" });
    await admin.from("user_roles").insert({ profile_id: userId, role_id: soManageRole.data.id });
    const soManageClient = createClient(url, anonKey);
    await soManageClient.auth.signInWithPassword({ email, password: "senha-de-teste-123456" });

    const { error: semAceiteError } = await soManageClient.rpc("registrar_aceite_instalacao", {
      p_instalacao_id: instalacaoId, p_nome_cliente: "Fulano",
    });
    check("instalacao.manage sozinho não registra aceite", !!semAceiteError);

    const { error: noPermError } = await noPermTenant.client.rpc("registrar_aceite_instalacao", {
      p_instalacao_id: instalacaoId, p_nome_cliente: "Fulano",
    });
    check("papel sem nenhuma permissão de instalação não registra aceite", !!noPermError);
  }

  console.log("\n19. registrar_aceite_instalacao() rejeita fora de 'concluida'");
  {
    const { error } = await admTenant.client.rpc("registrar_aceite_instalacao", {
      p_instalacao_id: instalacao2Id, p_nome_cliente: "Fulano",
    });
    check("não aceita instalação ainda agendada", !!error);
  }

  console.log("\n20. registrar_aceite_instalacao() sucesso");
  {
    const { error } = await admTenant.client.rpc("registrar_aceite_instalacao", {
      p_instalacao_id: instalacaoId, p_nome_cliente: "Fulano de Tal",
    });
    check("ADMIN (com instalacao.aceite) registra aceite", !error);
    const { data: inst } = await admin.from("instalacoes").select("status, aceite_nome_cliente").eq("id", instalacaoId).single();
    check("status vira 'aceita' com nome do cliente registrado", inst?.status === "aceita" && inst?.aceite_nome_cliente === "Fulano de Tal");
  }

  console.log("\n21. cancelar_instalacao() rejeita depois de 'aceita'");
  {
    const { error } = await admTenant.client.rpc("cancelar_instalacao", { p_instalacao_id: instalacaoId, p_motivo: "teste" });
    check("não cancela instalação já aceita", !!error);
  }

  console.log("\n22. cancelar_instalacao() sucesso antes da execução — libera quantidade");
  let inst3Id;
  {
    const { error } = await admTenant.client.rpc("cancelar_instalacao", { p_instalacao_id: instalacao2Id, p_motivo: "remarcação" });
    check("cancela instalação agendada", !error);
    const { data: inst } = await admin.from("instalacoes").select("status").eq("id", instalacao2Id).single();
    check("status vira 'cancelada'", inst?.status === "cancelada");

    const { data } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: massa.pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-01-13",
    });
    inst3Id = data;
    const { error: novaError } = await admTenant.client.rpc("adicionar_item_instalacao", {
      p_instalacao_id: inst3Id, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 4,
    });
    check("quantidade da instalação cancelada volta a ficar disponível", !novaError);
  }

  console.log("\n23. solicitar_nova_fabricacao() e decidir_nova_fabricacao() (dano/§8)");
  let solicitacaoId;
  {
    const { data, error } = await admTenant.client.rpc("solicitar_nova_fabricacao", {
      p_dano_id: danoId, p_motivo: "reposição da unidade trincada no transporte",
    });
    check("solicita nova fabricação a partir do dano", !error && !!data);
    solicitacaoId = data;

    const { error: decisaoInvalidaError } = await admTenant.client.rpc("decidir_nova_fabricacao", {
      p_solicitacao_id: solicitacaoId, p_decisao: "invalida", p_motivo: null,
    });
    check("decisão inválida é rejeitada", !!decisaoInvalidaError);

    const { error: semPermError } = await noPermTenant.client.rpc("decidir_nova_fabricacao", {
      p_solicitacao_id: solicitacaoId, p_decisao: "aprovada", p_motivo: null,
    });
    check("sem instalacao.decidir_dano não decide solicitação", !!semPermError);

    const { error: aprovaError } = await admTenant.client.rpc("decidir_nova_fabricacao", {
      p_solicitacao_id: solicitacaoId, p_decisao: "aprovada", p_motivo: "autorizado pelo gerente",
    });
    check("ADMIN aprova a solicitação", !aprovaError);

    const { error: repetidaError } = await admTenant.client.rpc("decidir_nova_fabricacao", {
      p_solicitacao_id: solicitacaoId, p_decisao: "rejeitada", p_motivo: null,
    });
    check("solicitação já decidida não pode ser decidida de novo", !!repetidaError);

    const { data: sol } = await admin.from("solicitacoes_nova_fabricacao").select("status").eq("id", solicitacaoId).single();
    check("status persistido como 'aprovada'", sol?.status === "aprovada");
  }

  console.log("\n24. registrar_ocorrencia_instalacao() sucesso e rejeita descrição vazia");
  {
    const { data: ocId, error } = await admTenant.client.rpc("registrar_ocorrencia_instalacao", {
      p_instalacao_id: instalacaoId, p_descricao: "acesso à obra liberado só após 14h",
    });
    check("registra ocorrência com sucesso", !error && !!ocId);

    const { error: vaziaError } = await admTenant.client.rpc("registrar_ocorrencia_instalacao", {
      p_instalacao_id: instalacaoId, p_descricao: "",
    });
    check("descrição vazia é rejeitada", !!vaziaError);
  }

  console.log("\n25. Concorrência real — adicionar_item_instalacao() sob duas requisições simultâneas");
  {
    const concorrencia = await prepararItemEntregue(admTenant, "25", 10);
    const { data: instA } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: concorrencia.pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-02-01",
    });
    const { data: instB } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: concorrencia.pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-02-01",
    });

    const [resA, resB] = await Promise.all([
      admTenant.client.rpc("adicionar_item_instalacao", { p_instalacao_id: instA, p_pedido_item_id: concorrencia.pedidoItemId, p_quantidade: 6 }),
      admTenant.client.rpc("adicionar_item_instalacao", { p_instalacao_id: instB, p_pedido_item_id: concorrencia.pedidoItemId, p_quantidade: 6 }),
    ]);
    const sucessos = [resA, resB].filter((r) => !r.error).length;
    check("duas chamadas concorrentes de 6 (disponível=10) — exatamente uma é aceita", sucessos === 1);

    const { data: totalUsado } = await admin
      .from("instalacao_itens")
      .select("quantidade")
      .eq("pedido_item_id", concorrencia.pedidoItemId);
    const soma = (totalUsado ?? []).reduce((acc, r) => acc + Number(r.quantidade), 0);
    check("total reservado nunca ultrapassa o entregue (10), mesmo sob concorrência real", soma <= 10);
  }

  console.log("\n26. Isolamento entre tenants");
  {
    const { data: crossInst } = await otherTenant.client.from("instalacoes").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga instalações do tenant A", (crossInst ?? []).length === 0);

    const { error: crossCriarError } = await otherTenant.client.rpc("criar_instalacao", {
      p_pedido_id: massa.pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-01-15",
    });
    check("tenant B não consegue agendar instalação pro pedido do tenant A", !!crossCriarError);

    const { error: crossAdicionarError } = await otherTenant.client.rpc("adicionar_item_instalacao", {
      p_instalacao_id: instalacaoId, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 1,
    });
    check("tenant B não consegue adicionar item na instalação do tenant A", !!crossAdicionarError);
  }

  console.log("\n27. SELECT liberado sem instalacao.manage (papel EXPEDICAO lê normalmente)");
  {
    const { data: insts, error } = await noPermTenant.client.from("instalacoes").select("id").eq("id", instalacaoId);
    check("papel EXPEDICAO (sem instalacao.manage) lê instalações da própria empresa", !error && (insts ?? []).length === 1);

    const { data: itens, error: itensError } = await noPermTenant.client.from("instalacao_itens").select("id").eq("instalacao_id", instalacaoId);
    check("papel EXPEDICAO lê instalacao_itens da própria empresa", !itensError && (itens ?? []).length > 0);
  }

  console.log("\n28. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "instalacao.criada", "instalacao.item_adicionado", "instalacao.item_removido",
        "instalacao.execucao_iniciada", "instalacao.execucao_registrada", "instalacao.concluida",
        "instalacao.aceite_registrado", "instalacao.cancelada", "instalacao.ocorrencia_registrada",
        "instalacao.dano_registrado", "instalacao.nova_fabricacao_solicitada", "instalacao.nova_fabricacao_decidida",
        "instalacao.equipe_criada", "instalacao.membro_adicionado", "instalacao.membro_removido",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of [
      "instalacao.criada", "instalacao.item_adicionado", "instalacao.item_removido",
      "instalacao.execucao_iniciada", "instalacao.execucao_registrada", "instalacao.concluida",
      "instalacao.aceite_registrado", "instalacao.cancelada", "instalacao.ocorrencia_registrada",
      "instalacao.dano_registrado", "instalacao.nova_fabricacao_solicitada", "instalacao.nova_fabricacao_decidida",
      "instalacao.equipe_criada", "instalacao.membro_adicionado", "instalacao.membro_removido",
    ]) {
      check(`${action} registrado`, actions.has(action));
    }
  }

  console.log("\n29. Idempotência (ADR-005 §11/§24) — reenvio com o mesmo client_operation_id não duplica efeito");
  {
    const idem = await prepararItemEntregue(admTenant, "29", 10);
    const { data: instIdemId } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: idem.pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-03-01",
    });
    const { data: itemIdemId } = await admTenant.client.rpc("adicionar_item_instalacao", {
      p_instalacao_id: instIdemId, p_pedido_item_id: idem.pedidoItemId, p_quantidade: 5,
    });

    const opId = crypto.randomUUID();
    const [r1, r2] = await Promise.all([
      admTenant.client.rpc("iniciar_execucao_instalacao", { p_instalacao_id: instIdemId, p_client_operation_id: opId }),
      admTenant.client.rpc("iniciar_execucao_instalacao", { p_instalacao_id: instIdemId, p_client_operation_id: opId }),
    ]);
    check("duas chamadas concorrentes com o mesmo client_operation_id não erram (uma reivindica, a outra replica)", !r1.error && !r2.error);
    check("as duas retornam o mesmo id", r1.data === r2.data);

    const opExec = crypto.randomUUID();
    const { error: e1 } = await admTenant.client.rpc("registrar_execucao_item_instalacao", {
      p_instalacao_item_id: itemIdemId, p_quantidade_instalada: 3, p_client_operation_id: opExec,
    });
    const { error: e2 } = await admTenant.client.rpc("registrar_execucao_item_instalacao", {
      p_instalacao_item_id: itemIdemId, p_quantidade_instalada: 3, p_client_operation_id: opExec,
    });
    check("reenvio sequencial do mesmo client_operation_id não erra", !e1 && !e2);

    const { data: itemFinal } = await admin.from("instalacao_itens").select("quantidade_instalada").eq("id", itemIdemId).single();
    check("quantidade_instalada aplicada UMA vez só (3, não 6) apesar do reenvio", Number(itemFinal?.quantidade_instalada) === 3);

    const opOc = crypto.randomUUID();
    await admTenant.client.rpc("registrar_ocorrencia_instalacao", { p_instalacao_id: instIdemId, p_descricao: "acesso liberado às 8h", p_client_operation_id: opOc });
    await admTenant.client.rpc("registrar_ocorrencia_instalacao", { p_instalacao_id: instIdemId, p_descricao: "acesso liberado às 8h", p_client_operation_id: opOc });
    const { data: ocorrencias } = await admin.from("ocorrencias_instalacao").select("id").eq("instalacao_id", instIdemId);
    check("reenvio de registrar_ocorrencia_instalacao não cria linha duplicada", (ocorrencias ?? []).length === 1);

    const opSemId = null;
    const { error: e3 } = await admTenant.client.rpc("registrar_ocorrencia_instalacao", { p_instalacao_id: instIdemId, p_descricao: "sem client_operation_id", p_client_operation_id: opSemId });
    const { error: e4 } = await admTenant.client.rpc("registrar_ocorrencia_instalacao", { p_instalacao_id: instIdemId, p_descricao: "sem client_operation_id", p_client_operation_id: opSemId });
    check("chamada síncrona (client_operation_id nulo) sempre executa, sem idempotência", !e3 && !e4);
    const { data: ocorrenciasSemId } = await admin.from("ocorrencias_instalacao").select("id").eq("instalacao_id", instIdemId).eq("descricao", "sem client_operation_id");
    check("sem client_operation_id, duas chamadas geram duas linhas (comportamento síncrono normal)", (ocorrenciasSemId ?? []).length === 2);
  }

  console.log("\n29b. sync_claim()/sync_operation_complete() não são chamáveis direto via RPC (achado do code-review)");
  {
    // Helpers internos, só deveriam ser alcançáveis de dentro de outra
    // função SECURITY DEFINER (que já resolveu o has_permission/
    // assert_tenant_write antes) — nunca direto via PostgREST, onde
    // sync_operation_complete() gravaria um result_id arbitrário.
    const { error: e1 } = await admTenant.client.rpc("sync_claim", { p_rpc_name: "registrar_aceite_instalacao", p_client_operation_id: crypto.randomUUID() });
    check("sync_claim() direto via RPC é rejeitado (sem GRANT a authenticated)", !!e1);

    const { error: e2 } = await admTenant.client.rpc("sync_operation_complete", { p_rpc_name: "registrar_aceite_instalacao", p_client_operation_id: crypto.randomUUID(), p_result_id: crypto.randomUUID() });
    check("sync_operation_complete() direto via RPC é rejeitado (sem GRANT a authenticated)", !!e2);
  }

  console.log("\n29c. Concorrência real — registrar_execucao_item_instalacao() trava instalacoes.status (achado do code-review)");
  {
    // Duas OPs de teste concluem exatamente na janela em que a outra tenta
    // registrar execução no mesmo instante — sem o FOR UPDATE adicionado
    // no achado do code-review, a leitura de status sem lock podia ver o
    // snapshot pré-commit de 'em_execucao' e aplicar a execução mesmo
    // depois da instalação já concluída por outra transação concorrente.
    const concorrencia = await prepararItemEntregue(admTenant, "292", 5);
    const { data: instConcId } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: concorrencia.pedidoId, p_equipe_id: equipeId, p_data_agendada: "2027-04-01",
    });
    const { data: itemConcId } = await admTenant.client.rpc("adicionar_item_instalacao", {
      p_instalacao_id: instConcId, p_pedido_item_id: concorrencia.pedidoItemId, p_quantidade: 5,
    });
    await admTenant.client.rpc("iniciar_execucao_instalacao", { p_instalacao_id: instConcId });

    const [resConcluir, resExecucao] = await Promise.all([
      admTenant.client.rpc("concluir_instalacao", { p_instalacao_id: instConcId }),
      admTenant.client.rpc("registrar_execucao_item_instalacao", { p_instalacao_item_id: itemConcId, p_quantidade_instalada: 2 }),
    ]);
    check("concluir_instalacao sempre ganha ou espera a vez, nunca falha nessa corrida", !resConcluir.error);

    const { data: instConcFinal } = await admin.from("instalacoes").select("status").eq("id", instConcId).single();
    const { data: itemConcFinal } = await admin.from("instalacao_itens").select("quantidade_instalada").eq("id", itemConcId).single();
    check("instalação sempre termina concluída", instConcFinal?.status === "concluida");

    if (resExecucao.error) {
      check(
        "quando a execução perde a corrida, é rejeitada por status desatualizado (prova que releu o valor pós-commit, não um snapshot obsoleto) e não altera quantidade_instalada",
        /em execução/i.test(resExecucao.error.message) && Number(itemConcFinal?.quantidade_instalada) === 0,
      );
    } else {
      check("quando a execução ganha a corrida (roda antes do commit da conclusão), quantidade_instalada reflete a execução aplicada", Number(itemConcFinal?.quantidade_instalada) === 2);
    }
  }

  console.log("\n30. sync_operations respeita isolamento entre tenants");
  {
    const { data: crossSync } = await otherTenant.client.from("sync_operations").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga sync_operations do tenant A", (crossSync ?? []).length === 0);
  }

  console.log("\n31. server_now() executa e devolve um timestamp próximo de agora");
  {
    const { data, error } = await admTenant.client.rpc("server_now");
    check("server_now() executa sem erro", !error && !!data);
    const diffMs = Math.abs(new Date(data).getTime() - Date.now());
    check("timestamp do servidor está a poucos segundos do relógio local", diffMs < 15000);
  }

  console.log("\n32. pacote_offline_instalacoes() — só instalações das equipes do próprio usuário");
  {
    const { data: pacote, error } = await admTenant.client.rpc("pacote_offline_instalacoes");
    check("pacote_offline_instalacoes() executa sem erro", !error && Array.isArray(pacote));
    check("só traz status agendada/em_execucao/concluida (nunca aceita/cancelada)", pacote.every((p) => ["agendada", "em_execucao", "concluida"].includes(p.status)));
    check("não traz instalação cancelada", !pacote.some((p) => p.status === "cancelada"));

    const equipeSemMembro = await admTenant.client.rpc("criar_equipe_instalacao", { p_nome: "Equipe Sem Membro" });
    const { data: instSemEquipeMembro } = await admTenant.client.rpc("criar_instalacao", {
      p_pedido_id: massa.pedidoId, p_equipe_id: equipeSemMembro.data, p_data_agendada: "2027-03-05",
    });
    const { data: pacoteDepois } = await admTenant.client.rpc("pacote_offline_instalacoes");
    check("instalação de equipe sem o usuário como membro não aparece no pacote offline", !pacoteDepois.some((p) => p.id === instSemEquipeMembro));

    const itemDoPacote = pacote.find((p) => p.id === inst3Id);
    check("instalação agendada traz itens/pedido/pessoa/obra aninhados", !!itemDoPacote && Array.isArray(itemDoPacote.itens) && itemDoPacote.itens.length > 0 && itemDoPacote.pedido?.numero && itemDoPacote.obra?.nome);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
