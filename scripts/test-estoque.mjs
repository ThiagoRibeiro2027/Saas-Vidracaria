// Testes automatizados do TÓPICO 6 — Estoque, recorte mínimo do M1 (PLANO
// DE ENTREGA — MVP DO PILOTO v1.0, novembro): saldo, reserva para o
// pedido (com reserva parcial), consumo e registro de sobra. Sem
// localização, lote/serial, peça física individual ou inventário.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-estoque.mjs

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

async function prepararPedidoLiberado(tenant, sufixo, quantidade = 10) {
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

  const { data: itemId } = await tenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: `VD-${sufixo}`, p_descricao: "Vidro temperado 10mm",
    p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
    p_situacao: "ativo",
  });

  const { data: orcamentoId } = await tenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: pessoaId, p_obra_id: null, p_validade: null,
    p_condicao_comercial: null, p_observacoes: null,
  });
  await tenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: quantidade, p_preco_unitario: 100,
  });
  await tenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });

  const { data: pedidoId } = await tenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  await tenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
  await tenant.client.rpc("liberar_pedido", { p_id: pedidoId });

  const { data: pedidoItem } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoId).single();

  return { pessoaId, itemId, pedidoId, pedidoItemId: pedidoItem.id, quantidade };
}

async function main() {
  console.log("Preparando tenants (admin, sem-permissão, outro tenant)...");
  const admTenant = await createTenant("estoque-test-admin", "Estoque Admin Teste", "9b01", "ADMIN");
  const noPermTenant = await createTenant("estoque-test-noperm", "Estoque SemPerm Teste", "9b02", "COMERCIAL");
  const otherTenant = await createTenant("estoque-test-other", "Estoque Outro Teste", "9b03", "ADMIN");

  console.log("\n0. Massa de dados — pedido liberado precisando de 10 M2");
  const massa = await prepararPedidoLiberado(admTenant, "1", 10);
  check("pedido liberado com item preparado", !!massa.pedidoItemId);

  console.log("\n1. Escrita exige estoque.manage");
  {
    const { error } = await noPermTenant.client.rpc("ajustar_saldo", {
      p_item_id: massa.itemId, p_quantidade_delta: 100, p_motivo: "teste",
    });
    check("sem estoque.manage não ajusta saldo", !!error);
  }

  console.log("\n2. Ajuste de saldo — impede negativo, exige motivo");
  {
    const { error: semMotivoError } = await admTenant.client.rpc("ajustar_saldo", {
      p_item_id: massa.itemId, p_quantidade_delta: 100, p_motivo: "",
    });
    check("ajuste sem motivo é rejeitado", !!semMotivoError);

    const { error: negativoError } = await admTenant.client.rpc("ajustar_saldo", {
      p_item_id: massa.itemId, p_quantidade_delta: -50, p_motivo: "teste negativo cedo demais",
    });
    check("ajuste que deixaria saldo negativo é rejeitado", !!negativoError);

    const { error } = await admTenant.client.rpc("ajustar_saldo", {
      p_item_id: massa.itemId, p_quantidade_delta: 6, p_motivo: "saldo inicial do piloto",
    });
    check("ajuste positivo aceito", !error);

    const { data: saldo } = await admin.from("estoque_saldos").select("*").eq("item_id", massa.itemId).single();
    check("saldo físico reflete o ajuste (6 M2)", Number(saldo?.quantidade_fisica) === 6);
  }

  console.log("\n3. Reserva parcial quando o disponível não cobre a necessidade (10 necessários, só 6 em estoque)");
  let reservaId;
  {
    const { data: reservado, error } = await admTenant.client.rpc("reservar_para_pedido_item", {
      p_pedido_item_id: massa.pedidoItemId,
    });
    check("reserva parcial aceita sem erro", !error);
    check("reserva parcial reserva só o disponível (6 de 10)", Number(reservado) === 6);

    const { data: reservaRow } = await admin.from("estoque_reservas").select("*").eq("pedido_item_id", massa.pedidoItemId).single();
    reservaId = reservaRow.id;
    check("linha de reserva criada com status 'reservado'", reservaRow?.status === "reservado" && Number(reservaRow?.quantidade) === 6);

    const { data: saldo } = await admin.from("estoque_saldos").select("*").eq("item_id", massa.itemId).single();
    check("quantidade_reservada reflete a reserva", Number(saldo?.quantidade_reservada) === 6);
    check("quantidade_fisica não muda ao reservar (reserva não é saída física)", Number(saldo?.quantidade_fisica) === 6);
  }

  console.log("\n4. Não é possível reservar de novo enquanto já há reserva ativa");
  {
    const { error } = await admTenant.client.rpc("reservar_para_pedido_item", { p_pedido_item_id: massa.pedidoItemId });
    check("segunda reserva sobre o mesmo item de pedido é rejeitada", !!error);
  }

  console.log("\n5. Liberar reserva — reversível, não altera físico");
  {
    const { error } = await admTenant.client.rpc("liberar_reserva", { p_reserva_id: reservaId });
    check("libera reserva", !error);

    const { data: reservaRow } = await admin.from("estoque_reservas").select("status").eq("id", reservaId).single();
    check("status vira 'liberado'", reservaRow?.status === "liberado");

    const { data: saldo } = await admin.from("estoque_saldos").select("*").eq("item_id", massa.itemId).single();
    check("quantidade_reservada volta a zero", Number(saldo?.quantidade_reservada) === 0);
    check("quantidade_fisica não muda ao liberar", Number(saldo?.quantidade_fisica) === 6);

    const { error: liberarDeNovoError } = await admTenant.client.rpc("liberar_reserva", { p_reserva_id: reservaId });
    check("reserva já liberada não pode ser liberada de novo", !!liberarDeNovoError);
  }

  console.log("\n6. Reservar de novo (agora que a anterior foi liberada) e consumir");
  let segundaReservaId;
  {
    const { data: reservado } = await admTenant.client.rpc("reservar_para_pedido_item", { p_pedido_item_id: massa.pedidoItemId });
    check("nova reserva aceita após liberar a anterior", Number(reservado) === 6);

    const { data: reservaRow } = await admin
      .from("estoque_reservas")
      .select("*")
      .eq("pedido_item_id", massa.pedidoItemId)
      .eq("status", "reservado")
      .single();
    segundaReservaId = reservaRow.id;

    const { error } = await admTenant.client.rpc("consumir_reserva", { p_reserva_id: segundaReservaId });
    check("consumo aceito", !error);

    const { data: reservaConsumida } = await admin.from("estoque_reservas").select("status").eq("id", segundaReservaId).single();
    check("status vira 'consumido'", reservaConsumida?.status === "consumido");

    const { data: saldo } = await admin.from("estoque_saldos").select("*").eq("item_id", massa.itemId).single();
    check("quantidade_fisica baixa com o consumo", Number(saldo?.quantidade_fisica) === 0);
    check("quantidade_reservada volta a zero após consumo", Number(saldo?.quantidade_reservada) === 0);

    const { error: consumirDeNovoError } = await admTenant.client.rpc("consumir_reserva", { p_reserva_id: segundaReservaId });
    check("reserva já consumida não pode ser consumida de novo", !!consumirDeNovoError);
  }

  console.log("\n7. Registrar entrada de sobra — ação independente, some para o saldo físico");
  {
    const { error } = await admTenant.client.rpc("registrar_entrada_sobra", {
      p_item_id: massa.itemId, p_quantidade: 1.5, p_pedido_item_id: massa.pedidoItemId, p_observacao: "sobra do corte",
    });
    check("sobra registrada", !error);

    const { data: saldo } = await admin.from("estoque_saldos").select("quantidade_fisica").eq("item_id", massa.itemId).single();
    check("sobra volta a somar no saldo físico", Number(saldo?.quantidade_fisica) === 1.5);

    const { error: quantidadeInvalidaError } = await admTenant.client.rpc("registrar_entrada_sobra", {
      p_item_id: massa.itemId, p_quantidade: 0, p_pedido_item_id: null, p_observacao: null,
    });
    check("sobra com quantidade zero é rejeitada", !!quantidadeInvalidaError);
  }

  console.log("\n8. Reserva só é permitida para pedido liberado");
  {
    await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "orcamento", p_prefixo: "ORCX-", p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
    await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "pedido", p_prefixo: "PEDX-", p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
    const { data: orcId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: massa.pessoaId, p_obra_id: null, p_validade: null,
      p_condicao_comercial: null, p_observacoes: null,
    });
    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcId, p_item_id: massa.itemId, p_quantidade: 1, p_preco_unitario: 10,
    });
    await admTenant.client.rpc("decidir_orcamento", { p_id: orcId, p_decisao: "aprovado" });
    const { data: pedidoNaoLiberadoId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcId });
    // Fica em 'recebido' de propósito — nem inicia conferência.

    const { data: pedidoItemNaoLiberado } = await admin
      .from("pedido_itens")
      .select("id")
      .eq("pedido_id", pedidoNaoLiberadoId)
      .single();

    const { error } = await admTenant.client.rpc("reservar_para_pedido_item", {
      p_pedido_item_id: pedidoItemNaoLiberado.id,
    });
    check("reserva contra pedido 'recebido' (não liberado) é rejeitada", !!error);
  }

  console.log("\n9. Isolamento entre tenants");
  {
    const { data: crossSaldos } = await otherTenant.client
      .from("estoque_saldos")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga saldos do tenant A", (crossSaldos ?? []).length === 0);

    const { error: crossError } = await otherTenant.client.rpc("ajustar_saldo", {
      p_item_id: massa.itemId, p_quantidade_delta: 1000, p_motivo: "invasão",
    });
    check("tenant B não consegue ajustar saldo de item do tenant A", !!crossError);
  }

  console.log("\n10. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "estoque.saldo_ajustado",
        "estoque.reserva_criada",
        "estoque.reserva_liberada",
        "estoque.reserva_consumida",
        "estoque.sobra_registrada",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("saldo_ajustado registrado", actions.has("estoque.saldo_ajustado"));
    check("reserva_criada registrado", actions.has("estoque.reserva_criada"));
    check("reserva_liberada registrado", actions.has("estoque.reserva_liberada"));
    check("reserva_consumida registrado", actions.has("estoque.reserva_consumida"));
    check("sobra_registrada registrado", actions.has("estoque.sobra_registrada"));
  }

  console.log("\n11. Concorrência real — ajustar_saldo() sob duas requisições simultâneas (gate técnico T4→T8)");
  {
    // Item isolado só pra este teste, sem depender de pedido. select ... for
    // update em ajustar_saldo() (linha ~137) deve serializar as duas
    // chamadas — sem o lock, um "lost update" deixaria o físico em -2 (duas
    // leituras de 10, cada uma decrementando 6 sem ver a outra) em vez de
    // rejeitar a segunda.
    const { data: itemConcId } = await admTenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: "VD-CONC", p_descricao: "Vidro para teste de concorrência",
      p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
      p_situacao: "ativo",
    });
    await admTenant.client.rpc("ajustar_saldo", {
      p_item_id: itemConcId, p_quantidade_delta: 10, p_motivo: "saldo inicial do teste de concorrência",
    });

    const [ajusteA, ajusteB] = await Promise.all([
      admTenant.client.rpc("ajustar_saldo", { p_item_id: itemConcId, p_quantidade_delta: -6, p_motivo: "baixa concorrente A" }),
      admTenant.client.rpc("ajustar_saldo", { p_item_id: itemConcId, p_quantidade_delta: -6, p_motivo: "baixa concorrente B" }),
    ]);
    const sucessos = [ajusteA, ajusteB].filter((r) => !r.error).length;
    const falhas = [ajusteA, ajusteB].filter((r) => !!r.error).length;
    check(
      "exatamente uma das duas baixas concorrentes de -6 é aceita (10 disponível só cobre uma)",
      sucessos === 1 && falhas === 1,
    );

    const { data: saldoConc } = await admin.from("estoque_saldos").select("quantidade_fisica").eq("item_id", itemConcId).single();
    check(
      "saldo final é 4 (10 - 6 uma única vez), nunca negativo nem com a baixa aplicada em dobro",
      Number(saldoConc?.quantidade_fisica) === 4,
    );
  }

  console.log("\n12. Concorrência real — reservar_para_pedido_item() sob duas requisições simultâneas");
  {
    // Dois pedido_itens (pedidos diferentes) disputando o mesmo item, cuja
    // demanda somada (16) excede o físico disponível (10) — sem o lock em
    // estoque_saldos (reservar_para_pedido_item, linha ~206), as duas
    // chamadas leriam "10 disponível" ao mesmo tempo e reservariam 8+8=16,
    // violando físico >= reservado (F05).
    const pedidoA = await prepararPedidoLiberado(admTenant, "conc-a", 8);
    const itemPartilhado = pedidoA.itemId;

    await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "orcamento", p_prefixo: "ORCCB-", p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
    await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "pedido", p_prefixo: "PEDCB-", p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
    const { data: orcBId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: pedidoA.pessoaId, p_obra_id: null, p_validade: null,
      p_condicao_comercial: null, p_observacoes: null,
    });
    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcBId, p_item_id: itemPartilhado, p_quantidade: 8, p_preco_unitario: 100,
    });
    await admTenant.client.rpc("decidir_orcamento", { p_id: orcBId, p_decisao: "aprovado" });
    const { data: pedidoBId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcBId });
    await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoBId });
    await admTenant.client.rpc("liberar_pedido", { p_id: pedidoBId });
    const { data: pedidoItemB } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoBId).single();

    await admTenant.client.rpc("ajustar_saldo", {
      p_item_id: itemPartilhado, p_quantidade_delta: 10, p_motivo: "saldo pro teste de concorrência de reserva",
    });

    const [reservaA, reservaB] = await Promise.all([
      admTenant.client.rpc("reservar_para_pedido_item", { p_pedido_item_id: pedidoA.pedidoItemId }),
      admTenant.client.rpc("reservar_para_pedido_item", { p_pedido_item_id: pedidoItemB.id }),
    ]);
    const totalReservado = Number(reservaA.data ?? 0) + Number(reservaB.data ?? 0);
    check(
      "as duas reservas concorrentes (8+8 pedido) somam exatamente o disponível (10), sem oversell",
      !reservaA.error && !reservaB.error && totalReservado === 10,
    );

    const { data: saldoPartilhado } = await admin
      .from("estoque_saldos")
      .select("quantidade_fisica, quantidade_reservada")
      .eq("item_id", itemPartilhado)
      .single();
    check(
      "quantidade_reservada final é 10 (nunca ultrapassa o físico, mesmo sob concorrência real) — F05",
      Number(saldoPartilhado?.quantidade_reservada) === 10 && Number(saldoPartilhado?.quantidade_fisica) === 10,
    );
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
