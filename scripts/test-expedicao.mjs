// Testes automatizados do TÓPICO 9 — Expedição, recorte mínimo do M1
// (PLANO DE ENTREGA — MVP DO PILOTO v1.0, dezembro): separação
// (adicionar item), conferência, romaneio (leitura) e saída, com suporte
// a expedição parcial. Integração com T8 é só por leitura de
// ordens_producao.status_qualidade — nenhum teste aqui deve encontrar
// mudança de comportamento em T4/T8.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-expedicao.mjs

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

// Pedido liberado -> OP concluída -> aprovada pela qualidade (100%) ->
// pronta pra expedição. quantidade_produzida == quantidade == disponível.
async function prepararItemAprovado(tenant, sufixo, quantidade = 10) {
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
  await tenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "expedicao", p_prefixo: `EXP${sufixo}-`, p_sufixo: "", p_digitos: 4,
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
  const { error: apontarErr } = await tenant.client.rpc("apontar_producao", {
    p_ordem_producao_id: opId, p_quantidade_produzida: quantidade, p_quantidade_perdida: 0, p_observacao: "lote único",
  });
  if (apontarErr) console.error("[fixture] apontar_producao falhou:", apontarErr);
  const { error: concluirErr } = await tenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opId });
  if (concluirErr) console.error("[fixture] concluir_ordem_producao falhou:", concluirErr);
  const { error: inspecaoErr } = await tenant.client.rpc("registrar_inspecao_qualidade", {
    p_ordem_producao_id: opId, p_quantidade_aprovada: quantidade, p_quantidade_reprovada: 0, p_observacoes: null,
  });
  if (inspecaoErr) console.error("[fixture] registrar_inspecao_qualidade falhou:", inspecaoErr);

  return { pessoaId, itemId, pedidoId, pedidoItemId: pedidoItem.id, opId, quantidade };
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão de expedição, outro tenant)...");
  const admTenant = await createTenant("expedicao-test-admin", "Expedição Admin Teste", "9e01", "ADMIN");
  // QUALIDADE administra Qualidade, não Expedição — prova a autoridade
  // separada: quem inspeciona não pode, só por isso, expedir.
  const noPermTenant = await createTenant("expedicao-test-admin", "Expedição SemPerm Teste", "9e02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant("expedicao-test-other", "Expedição Outro Teste", "9e03", "ADMIN");

  console.log("\n0. Massa de dados — item aprovado pela qualidade, pronto pra expedição (10 unidades)");
  const massa = await prepararItemAprovado(admTenant, "1", 10);
  check("item aprovado e pronto pra expedição", !!massa.pedidoItemId && !!massa.opId);
  {
    const { data: op } = await admin.from("ordens_producao").select("status, status_qualidade").eq("id", massa.opId).single();
    check("pré-condição: OP concluída e aprovada", op?.status === "concluida" && op?.status_qualidade === "aprovado");
  }

  console.log("\n1. criar_expedicao() exige expedicao.manage");
  {
    const { error } = await noPermTenant.client.rpc("criar_expedicao", { p_pedido_id: massa.pedidoId });
    check("sem expedicao.manage (papel QUALIDADE) não cria expedição", !!error);
  }

  console.log("\n2. criar_expedicao() rejeita pedido não liberado");
  {
    const naoLiberado = await (async () => {
      const { data: orcId } = await admTenant.client.rpc("upsert_orcamento", {
        p_id: null, p_pessoa_id: massa.pessoaId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
      });
      await admTenant.client.rpc("upsert_orcamento_item", {
        p_id: null, p_orcamento_id: orcId, p_item_id: massa.itemId, p_quantidade: 1, p_preco_unitario: 10,
      });
      await admTenant.client.rpc("decidir_orcamento", { p_id: orcId, p_decisao: "aprovado" });
      const { data: pedidoId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcId });
      return pedidoId; // fica em 'recebido' de propósito
    })();
    const { error } = await admTenant.client.rpc("criar_expedicao", { p_pedido_id: naoLiberado });
    check("pedido 'recebido' (não liberado) não pode gerar expedição", !!error);
  }

  console.log("\n3. criar_expedicao() sucesso");
  let expedicaoId;
  {
    const { data, error } = await admTenant.client.rpc("criar_expedicao", { p_pedido_id: massa.pedidoId });
    check("ADMIN cria expedição", !error && !!data);
    expedicaoId = data;

    const { data: exp } = await admin.from("expedicoes").select("*").eq("id", expedicaoId).single();
    check("expedição nasce em 'preparando' com número gerado", exp?.status === "preparando" && /^EXP\d+-\d{4}$/.test(exp?.numero ?? ""));
  }

  console.log("\n4. adicionar_item_expedicao() exige expedicao.manage");
  {
    const { error } = await noPermTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicaoId, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 1,
    });
    check("sem expedicao.manage não adiciona item", !!error);
  }

  console.log("\n5. adicionar_item_expedicao() rejeita pedido_item sem ordem_producao");
  {
    const semOp = await (async () => {
      const { data: orcId } = await admTenant.client.rpc("upsert_orcamento", {
        p_id: null, p_pessoa_id: massa.pessoaId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
      });
      await admTenant.client.rpc("upsert_orcamento_item", {
        p_id: null, p_orcamento_id: orcId, p_item_id: massa.itemId, p_quantidade: 2, p_preco_unitario: 10,
      });
      await admTenant.client.rpc("decidir_orcamento", { p_id: orcId, p_decisao: "aprovado" });
      const { data: pedidoId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcId });
      await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
      await admTenant.client.rpc("liberar_pedido", { p_id: pedidoId });
      const { data: pi } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).single();
      return { pedidoId, pedidoItemId: pi.id };
    })();
    const { data: expSemOp } = await admTenant.client.rpc("criar_expedicao", { p_pedido_id: semOp.pedidoId });
    const { error } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expSemOp, p_pedido_item_id: semOp.pedidoItemId, p_quantidade: 1,
    });
    check("item sem ordem de produção é rejeitado", !!error);
  }

  console.log("\n6. adicionar_item_expedicao() rejeita OP não concluída");
  {
    // Pedido com OP apontada, mas ainda 'em_producao' (não concluída).
    const { data: orcId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: massa.pessoaId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
    });
    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcId, p_item_id: massa.itemId, p_quantidade: 2, p_preco_unitario: 10,
    });
    await admTenant.client.rpc("decidir_orcamento", { p_id: orcId, p_decisao: "aprovado" });
    const { data: pedidoId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcId });
    await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
    await admTenant.client.rpc("liberar_pedido", { p_id: pedidoId });
    const { data: pi } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).single();
    const { data: opId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pi.id });
    await admTenant.client.rpc("apontar_producao", {
      p_ordem_producao_id: opId, p_quantidade_produzida: 1, p_quantidade_perdida: 0, p_observacao: null,
    });

    const { error } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicaoId, p_pedido_item_id: pi.id, p_quantidade: 1,
    });
    check("item com OP 'em_producao' (não concluída) é rejeitado", !!error);
  }

  console.log("\n7. adicionar_item_expedicao() rejeita status_qualidade='pendente'");
  let naoInspecionado;
  {
    const { data: orcId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: massa.pessoaId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
    });
    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcId, p_item_id: massa.itemId, p_quantidade: 4, p_preco_unitario: 10,
    });
    await admTenant.client.rpc("decidir_orcamento", { p_id: orcId, p_decisao: "aprovado" });
    const { data: pedidoId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcId });
    await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
    await admTenant.client.rpc("liberar_pedido", { p_id: pedidoId });
    const { data: pi } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).single();
    const { data: opId } = await admTenant.client.rpc("criar_ordem_producao", { p_pedido_item_id: pi.id });
    await admTenant.client.rpc("apontar_producao", {
      p_ordem_producao_id: opId, p_quantidade_produzida: 4, p_quantidade_perdida: 0, p_observacao: null,
    });
    await admTenant.client.rpc("concluir_ordem_producao", { p_ordem_producao_id: opId });
    naoInspecionado = { pedidoItemId: pi.id, opId };

    const { error } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicaoId, p_pedido_item_id: pi.id, p_quantidade: 1,
    });
    check("item nunca inspecionado (status_qualidade='pendente') é rejeitado", !!error);
  }

  console.log("\n8. adicionar_item_expedicao() rejeita status_qualidade='bloqueado' (integração com T8)");
  {
    const { error: inspError } = await admTenant.client.rpc("registrar_inspecao_qualidade", {
      p_ordem_producao_id: naoInspecionado.opId, p_quantidade_aprovada: 0, p_quantidade_reprovada: 4, p_observacoes: "reprovado",
    });
    check("(fixture) inspeção 100% reprovada aceita", !inspError);

    const { error } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicaoId, p_pedido_item_id: naoInspecionado.pedidoItemId, p_quantidade: 1,
    });
    check("item bloqueado pela qualidade não pode ser expedido (item 14 do prompt completo)", !!error);
  }

  console.log("\n9. adicionar_item_expedicao() rejeita pedido_item de outro pedido");
  {
    const outroPedido = await prepararItemAprovado(admTenant, "9", 2);
    const { error } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicaoId, p_pedido_item_id: outroPedido.pedidoItemId, p_quantidade: 1,
    });
    check("item de outro pedido não pode entrar nesta expedição", !!error);
  }

  console.log("\n10. adicionar_item_expedicao() rejeita quantidade maior que a disponível");
  {
    const { error } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicaoId, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 11,
    });
    check("quantidade (11) maior que a disponível (10) é rejeitada", !!error);
  }

  console.log("\n11. adicionar_item_expedicao() sucesso");
  let itemExpedicaoId;
  {
    const { data, error } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicaoId, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 4,
    });
    check("adiciona 4 de 10 disponíveis", !error && !!data);
    itemExpedicaoId = data;

    const { data: item } = await admin.from("expedicao_itens").select("*").eq("id", itemExpedicaoId).single();
    check("linha criada com quantidade_entregue=0 e quantidade_pendente=quantidade", Number(item?.quantidade) === 4 && Number(item?.quantidade_entregue) === 0 && Number(item?.quantidade_pendente) === 4);
  }

  console.log("\n12. Segunda expedição do mesmo item respeita a quantidade já usada (expedição parcial)");
  let expedicao2Id;
  let itemRemovivelId;
  {
    const { data } = await admTenant.client.rpc("criar_expedicao", { p_pedido_id: massa.pedidoId });
    expedicao2Id = data;

    const { error: excedeError } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicao2Id, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 7,
    });
    check("7 unidades excede o restante disponível (6 de 10, já que 4 foram usadas)", !!excedeError);

    const { data: okId, error: okError } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicao2Id, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 6,
    });
    check("6 unidades (o restante exato) é aceito", !okError && !!okId);
    itemRemovivelId = okId;
  }

  console.log("\n13. remover_item_expedicao() funciona em 'preparando' e libera a disponibilidade");
  {
    const { error: removeError } = await admTenant.client.rpc("remover_item_expedicao", {
      p_expedicao_item_id: itemRemovivelId,
    });
    check("remove item com expedição em preparando", !removeError);

    const { data: readd, error: readdError } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicao2Id, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 6,
    });
    check("readiciona a mesma quantidade depois de remover (disponibilidade foi liberada)", !readdError && !!readd);
    itemRemovivelId = readd;
  }

  console.log("\n14. remover_item_expedicao() rejeita fora de 'preparando'");
  {
    await admTenant.client.rpc("conferir_expedicao", { p_expedicao_id: expedicao2Id });
    const { error } = await admTenant.client.rpc("remover_item_expedicao", { p_expedicao_item_id: itemRemovivelId });
    check("não remove item de expedição já conferida", !!error);
  }

  console.log("\n15. conferir_expedicao() rejeita expedição sem itens");
  {
    const { data: vaziaId } = await admTenant.client.rpc("criar_expedicao", { p_pedido_id: massa.pedidoId });
    const { error } = await admTenant.client.rpc("conferir_expedicao", { p_expedicao_id: vaziaId });
    check("expedição sem itens não pode ser conferida", !!error);
  }

  console.log("\n16. conferir_expedicao() sucesso");
  {
    const { error } = await admTenant.client.rpc("conferir_expedicao", { p_expedicao_id: expedicaoId });
    check("confere expedição com itens", !error);
    const { data: exp } = await admin.from("expedicoes").select("status").eq("id", expedicaoId).single();
    check("status vira 'conferida'", exp?.status === "conferida");
  }

  console.log("\n17. conferir_expedicao() rejeita se já não está 'preparando'");
  {
    const { error } = await admTenant.client.rpc("conferir_expedicao", { p_expedicao_id: expedicaoId });
    check("conferir expedição já conferida de novo é rejeitado", !!error);
  }

  console.log("\n18. adicionar_item_expedicao() rejeita depois de 'conferida'");
  {
    const { error } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicaoId, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 1,
    });
    check("não adiciona item em expedição já conferida", !!error);
  }

  console.log("\n19. registrar_saida_expedicao() rejeita se não 'conferida'");
  {
    const { data: preparandoId } = await admTenant.client.rpc("criar_expedicao", { p_pedido_id: massa.pedidoId });
    const { error } = await admTenant.client.rpc("registrar_saida_expedicao", { p_expedicao_id: preparandoId });
    check("não registra saída de expedição ainda em preparação", !!error);
  }

  console.log("\n20. registrar_saida_expedicao() sucesso");
  {
    const { error } = await admTenant.client.rpc("registrar_saida_expedicao", { p_expedicao_id: expedicaoId });
    check("registra saída de expedição conferida", !error);
    const { data: exp } = await admin.from("expedicoes").select("status").eq("id", expedicaoId).single();
    check("status vira 'expedida'", exp?.status === "expedida");
  }

  console.log("\n21. cancelar_expedicao() rejeita depois de 'expedida'");
  {
    const { error } = await admTenant.client.rpc("cancelar_expedicao", { p_expedicao_id: expedicaoId, p_motivo: "teste" });
    check("não cancela expedição já com saída registrada", !!error);
  }

  console.log("\n22. cancelar_expedicao() sucesso antes da saída — libera quantidade pra nova expedição");
  {
    const { error } = await admTenant.client.rpc("cancelar_expedicao", { p_expedicao_id: expedicao2Id, p_motivo: "pedido do cliente" });
    check("cancela expedição em preparação/conferida", !error);
    const { data: exp } = await admin.from("expedicoes").select("status").eq("id", expedicao2Id).single();
    check("status vira 'cancelada'", exp?.status === "cancelada");

    const { data: exp3Id } = await admTenant.client.rpc("criar_expedicao", { p_pedido_id: massa.pedidoId });
    const { error: novaError } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: exp3Id, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 6,
    });
    check("quantidade da expedição cancelada volta a ficar disponível", !novaError);
  }

  console.log("\n23. confirmar_entrega_item_expedicao() rejeita se não 'expedida'");
  {
    // Expedição nova, ainda 'preparando' — item aprovado dedicado pra não
    // disputar disponibilidade com o restante do arquivo.
    const naoExpedida = await prepararItemAprovado(admTenant, "23", 5);
    const { data: expPreparandoId } = await admTenant.client.rpc("criar_expedicao", { p_pedido_id: naoExpedida.pedidoId });
    const { data: itemPreparandoId } = await admTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expPreparandoId, p_pedido_item_id: naoExpedida.pedidoItemId, p_quantidade: 5,
    });

    const { error } = await admTenant.client.rpc("confirmar_entrega_item_expedicao", {
      p_expedicao_item_id: itemPreparandoId, p_quantidade_entregue: 1,
    });
    check("não confirma entrega de expedição ainda em preparação", !!error);
  }

  console.log("\n24. confirmar_entrega_item_expedicao() acumula por soma, sem exceder a quantidade");
  {
    const { error: e1 } = await admTenant.client.rpc("confirmar_entrega_item_expedicao", {
      p_expedicao_item_id: itemExpedicaoId, p_quantidade_entregue: 3,
    });
    const { error: e2 } = await admTenant.client.rpc("confirmar_entrega_item_expedicao", {
      p_expedicao_item_id: itemExpedicaoId, p_quantidade_entregue: 1,
    });
    check("duas confirmações parciais aceitas", !e1 && !e2);

    const { data: itemFinal } = await admin.from("expedicao_itens").select("*").eq("id", itemExpedicaoId).single();
    check("quantidade_entregue acumulada por soma (4 de 4)", Number(itemFinal?.quantidade_entregue) === 4);
    check("quantidade_pendente reflete a soma (0)", Number(itemFinal?.quantidade_pendente) === 0);
  }

  console.log("\n25. confirmar_entrega_item_expedicao() rejeita excesso de entrega");
  {
    const { error } = await admTenant.client.rpc("confirmar_entrega_item_expedicao", {
      p_expedicao_item_id: itemExpedicaoId, p_quantidade_entregue: 1,
    });
    check("entregar além da quantidade expedida é rejeitado", !!error);
  }

  console.log("\n26. Concorrência real — adicionar_item_expedicao() sob duas requisições simultâneas");
  {
    const concorrencia = await prepararItemAprovado(admTenant, "26", 10);
    const { data: expA } = await admTenant.client.rpc("criar_expedicao", { p_pedido_id: concorrencia.pedidoId });
    const { data: expB } = await admTenant.client.rpc("criar_expedicao", { p_pedido_id: concorrencia.pedidoId });

    const [resA, resB] = await Promise.all([
      admTenant.client.rpc("adicionar_item_expedicao", { p_expedicao_id: expA, p_pedido_item_id: concorrencia.pedidoItemId, p_quantidade: 6 }),
      admTenant.client.rpc("adicionar_item_expedicao", { p_expedicao_id: expB, p_pedido_item_id: concorrencia.pedidoItemId, p_quantidade: 6 }),
    ]);
    const sucessos = [resA, resB].filter((r) => !r.error).length;
    check("duas chamadas concorrentes de 6 (disponível=10) — exatamente uma é aceita", sucessos === 1);

    const { data: totalUsado } = await admin
      .from("expedicao_itens")
      .select("quantidade")
      .eq("pedido_item_id", concorrencia.pedidoItemId);
    const soma = (totalUsado ?? []).reduce((acc, r) => acc + Number(r.quantidade), 0);
    check("total usado nunca ultrapassa o disponível (10), mesmo sob concorrência real", soma <= 10);
  }

  console.log("\n27. registrar_ocorrencia_expedicao() sucesso e rejeita descrição vazia");
  {
    const { data: ocId, error } = await admTenant.client.rpc("registrar_ocorrencia_expedicao", {
      p_expedicao_id: expedicaoId, p_descricao: "cliente pediu troca do horário de entrega",
    });
    check("registra ocorrência com sucesso", !error && !!ocId);

    const { error: vaziaError } = await admTenant.client.rpc("registrar_ocorrencia_expedicao", {
      p_expedicao_id: expedicaoId, p_descricao: "",
    });
    check("descrição vazia é rejeitada", !!vaziaError);
  }

  console.log("\n28. romaneio_expedicao() retorna linhas corretas");
  {
    const { data: linhas, error } = await admTenant.client.rpc("romaneio_expedicao", { p_expedicao_id: expedicaoId });
    check("romaneio_expedicao() executa sem erro", !error && Array.isArray(linhas) && linhas.length === 1);
    const linha = linhas?.[0];
    check("romaneio traz pedido/pessoa/item corretos", linha?.pessoa_nome === "JR Box Vidros" && linha?.item_codigo === "VD-1");
    check("romaneio traz quantidade/entregue/pendente corretos", Number(linha?.quantidade) === 4 && Number(linha?.quantidade_entregue) === 4 && Number(linha?.quantidade_pendente) === 0);
  }

  console.log("\n29. Isolamento entre tenants");
  {
    const { data: crossExp } = await otherTenant.client.from("expedicoes").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga expedições do tenant A", (crossExp ?? []).length === 0);

    const { error: crossCriarError } = await otherTenant.client.rpc("criar_expedicao", { p_pedido_id: massa.pedidoId });
    check("tenant B não consegue criar expedição pro pedido do tenant A", !!crossCriarError);

    const { error: crossAdicionarError } = await otherTenant.client.rpc("adicionar_item_expedicao", {
      p_expedicao_id: expedicaoId, p_pedido_item_id: massa.pedidoItemId, p_quantidade: 1,
    });
    check("tenant B não consegue adicionar item na expedição do tenant A", !!crossAdicionarError);
  }

  console.log("\n30. SELECT liberado sem expedicao.manage (papel QUALIDADE lê normalmente)");
  {
    const { data: exps, error } = await noPermTenant.client.from("expedicoes").select("id").eq("id", expedicaoId);
    check("papel QUALIDADE (sem expedicao.manage) lê expedicoes da própria empresa", !error && (exps ?? []).length === 1);

    const { data: itens, error: itensError } = await noPermTenant.client.from("expedicao_itens").select("id").eq("expedicao_id", expedicaoId);
    check("papel QUALIDADE lê expedicao_itens da própria empresa", !itensError && (itens ?? []).length > 0);
  }

  console.log("\n31. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "expedicao.criada",
        "expedicao.item_adicionado",
        "expedicao.item_removido",
        "expedicao.conferida",
        "expedicao.saida_registrada",
        "expedicao.cancelada",
        "expedicao.entrega_confirmada",
        "expedicao.ocorrencia_registrada",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of [
      "expedicao.criada", "expedicao.item_adicionado", "expedicao.item_removido",
      "expedicao.conferida", "expedicao.saida_registrada", "expedicao.cancelada",
      "expedicao.entrega_confirmada", "expedicao.ocorrencia_registrada",
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
