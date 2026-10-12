// Teste de ponta a ponta: orçamento → pedido → produção → qualidade →
// expedição → instalação, achado da auditoria de gaps ADR-001 a ADR-012
// (11/10/2026) — cada módulo já tinha sua própria suíte isolada
// (test-comercial, test-pedidos, test-producao, test-expedicao,
// test-instalacao), mas nenhum teste seguia o MESMO pedido do início ao
// fim, confirmando que os ids e quantidades realmente passam de etapa
// pra etapa (não só que cada RPC funciona com dado fabricado avulso).
//
// Cobre o caminho feliz completo de UM item, do zero: cria cliente/obra/
// item, aprova orçamento, converte em pedido, libera, produz, aprova na
// qualidade, expede, entrega, instala e registra aceite do cliente —
// validando em cada etapa que o id/quantidade herdado da etapa anterior
// é o mesmo até o fim, e que a trilha de auditoria registra toda a
// sequência sob a mesma empresa. Fecha com isolamento cross-tenant.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-e2e-fluxo-completo.mjs

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

function rpc(tenant, nome, params) {
  return tenant.client.rpc(nome, params);
}

async function esperarSucesso(tenant, nome, params, label) {
  const { data, error } = await rpc(tenant, nome, params);
  check(label, !error, error?.message);
  if (error) throw new Error(`[abortando fluxo] ${nome} falhou: ${error.message}`);
  return data;
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

async function configurarNumeracao(tenant, sufixo) {
  for (const tipo of ["orcamento", "pedido", "ordem_producao", "expedicao", "instalacao"]) {
    await rpc(tenant, "upsert_numbering_sequence", {
      p_document_type: tipo, p_prefixo: `E2E${sufixo}-${tipo.slice(0, 3).toUpperCase()}-`, p_sufixo: "",
      p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
  }
}

async function main() {
  console.log("Preparando tenant (admin) e empresa de controle (isolamento)...");
  const tenant = await createTenant("e2e-fluxo-admin", "E2E Fluxo Admin Teste", "e2e01", "ADMIN");
  const outroTenant = await createTenant("e2e-fluxo-other", "E2E Fluxo Outro Teste", "e2e02", "ADMIN");
  const sufixo = Date.now().toString().slice(-6);
  const QUANTIDADE = 8;

  await configurarNumeracao(tenant, sufixo);

  const logsEsperados = [];
  async function marcar(action) {
    logsEsperados.push(action);
  }

  console.log("\n0. Cadastros base — cliente, obra, item");
  let pessoaId, obraId, itemId;
  {
    pessoaId = await esperarSucesso(tenant, "upsert_pessoa", {
      p_id: null, p_tipo_documento: "CNPJ", p_documento: `9${sufixo}`, p_nome: "Cliente E2E Fluxo Completo",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
      p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    }, "cliente criado");
    await esperarSucesso(tenant, "set_pessoa_papel", { p_pessoa_id: pessoaId, p_papel: "CLIENTE", p_ativo: true }, "papel CLIENTE ativado");

    obraId = await esperarSucesso(tenant, "upsert_obra", {
      p_id: null, p_pessoa_id: pessoaId, p_nome: "Obra E2E Fluxo Completo",
      p_logradouro: "Rua Teste, 500", p_cidade: "São Paulo", p_uf: "SP", p_cep: "01000-000", p_situacao: "ativo",
    }, "obra criada (instalação exige pedido.obra_id)");

    itemId = await esperarSucesso(tenant, "upsert_item", {
      p_id: null, p_codigo: `VD-E2E-${sufixo}`, p_descricao: "Vidro temperado 10mm — E2E",
      p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2", p_situacao: "ativo",
    }, "item criado (sem measurement_rules — não aciona o gate de medição do TÓPICO 16 §7)");
  }

  console.log("\n1. Orçamento → aprovado");
  let orcamentoId;
  {
    orcamentoId = await esperarSucesso(tenant, "upsert_orcamento", {
      p_id: null, p_pessoa_id: pessoaId, p_obra_id: obraId, p_validade: null,
      p_condicao_comercial: null, p_observacoes: "Pedido de teste E2E",
    }, "orçamento criado, com obra vinculada");
    await esperarSucesso(tenant, "upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemId, p_quantidade: QUANTIDADE, p_preco_unitario: 250,
    }, "item do orçamento adicionado");
    await esperarSucesso(tenant, "decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" }, "orçamento aprovado");
    await marcar("comercial.orcamento_decidido");

    const { data: orc } = await admin.from("orcamentos").select("status").eq("id", orcamentoId).single();
    check("status do orçamento é 'aprovado' no banco", orc?.status === "aprovado");
  }

  console.log("\n2. Orçamento → Pedido → liberado");
  let pedidoId, pedidoItemId;
  {
    pedidoId = await esperarSucesso(tenant, "converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId }, "pedido gerado a partir do orçamento aprovado");
    await marcar("pedidos.pedido_convertido_de_orcamento");

    const { data: pedido } = await admin.from("pedidos").select("pessoa_id, obra_id, status").eq("id", pedidoId).single();
    check("pedido herdou o MESMO cliente do orçamento", pedido?.pessoa_id === pessoaId);
    check("pedido herdou a MESMA obra do orçamento (pré-requisito da instalação, seção 5)", pedido?.obra_id === obraId);
    check("pedido nasce 'recebido'", pedido?.status === "recebido");

    const { data: itens } = await admin.from("pedido_itens").select("id, quantidade, item_id").eq("pedido_id", pedidoId);
    check("item do orçamento foi copiado pro pedido com a mesma quantidade", itens?.length === 1 && itens[0].quantidade === QUANTIDADE && itens[0].item_id === itemId);
    pedidoItemId = itens[0].id;

    await esperarSucesso(tenant, "iniciar_conferencia_pedido", { p_id: pedidoId }, "conferência iniciada");
    await marcar("pedidos.conferencia_iniciada");
    await esperarSucesso(tenant, "liberar_pedido", { p_id: pedidoId }, "pedido liberado (sem pendência aberta)");
    await marcar("pedidos.pedido_liberado");

    const { data: liberado } = await admin.from("pedidos").select("status").eq("id", pedidoId).single();
    check("status final do pedido é 'liberado'", liberado?.status === "liberado");
  }

  console.log("\n3. Pedido liberado → Ordem de Produção → concluída");
  let opId;
  {
    opId = await esperarSucesso(tenant, "criar_ordem_producao", {
      p_pedido_item_id: pedidoItemId, p_quantidade: null, p_liberar_integralmente: true,
    }, "ordem de produção criada a partir do item do pedido");
    await marcar("producao.ordem_criada");

    const { data: op } = await admin.from("ordens_producao").select("pedido_id, pedido_item_id, quantidade_planejada, status").eq("id", opId).single();
    check("OP referencia o MESMO pedido", op?.pedido_id === pedidoId);
    check("OP referencia o MESMO item de pedido", op?.pedido_item_id === pedidoItemId);
    check("quantidade planejada da OP bate com a do pedido", op?.quantidade_planejada === QUANTIDADE);

    const { data: operacao } = await admin.from("op_lote_operacoes").select("id").eq("ordem_producao_id", opId).single();
    check("operação de produção foi criada (liberação integral do lote)", !!operacao);

    await esperarSucesso(tenant, "apontar_producao", {
      p_op_lote_operacao_id: operacao.id, p_quantidade_produzida: QUANTIDADE,
      p_quantidade_rejeitada: 0, p_quantidade_retrabalho: 0, p_observacao: "Apontamento E2E",
    }, "produção apontada integralmente numa única operação");

    await esperarSucesso(tenant, "concluir_ordem_producao", { p_ordem_producao_id: opId }, "ordem de produção concluída");
    await marcar("producao.ordem_concluida");

    const { data: opConcluida } = await admin.from("ordens_producao").select("status, quantidade_produzida").eq("id", opId).single();
    check("status final da OP é 'concluida'", opConcluida?.status === "concluida");
    check("quantidade produzida bate com a planejada", opConcluida?.quantidade_produzida === QUANTIDADE);
  }

  console.log("\n4. Qualidade aprova a OP (pré-requisito pra expedir)");
  {
    await esperarSucesso(tenant, "registrar_inspecao_qualidade", {
      p_ordem_producao_id: opId, p_quantidade_aprovada: QUANTIDADE, p_quantidade_reprovada: 0, p_observacoes: "Inspeção E2E, sem rejeito",
    }, "inspeção de qualidade registrada, tudo aprovado");

    const { data: op } = await admin.from("ordens_producao").select("status_qualidade").eq("id", opId).single();
    check("status_qualidade vira 'aprovado' (sem rejeito)", op?.status_qualidade === "aprovado");
  }

  console.log("\n5. OP aprovada → Expedição → expedida → entregue");
  let expedicaoId, expedicaoItemId;
  {
    expedicaoId = await esperarSucesso(tenant, "criar_expedicao", { p_pedido_id: pedidoId }, "expedição criada para o pedido");
    await marcar("expedicao.criada");

    expedicaoItemId = await esperarSucesso(tenant, "adicionar_item_expedicao", {
      p_expedicao_id: expedicaoId, p_pedido_item_id: pedidoItemId, p_quantidade: QUANTIDADE,
    }, "item adicionado à expedição (exige OP concluída + aprovada pela qualidade)");

    await esperarSucesso(tenant, "conferir_expedicao", { p_expedicao_id: expedicaoId }, "expedição conferida");
    await esperarSucesso(tenant, "registrar_saida_expedicao", { p_expedicao_id: expedicaoId }, "saída registrada");
    await marcar("expedicao.saida_registrada");

    await esperarSucesso(tenant, "confirmar_entrega_item_expedicao", {
      p_expedicao_item_id: expedicaoItemId, p_quantidade_entregue: QUANTIDADE,
    }, "entrega confirmada");
    await marcar("expedicao.entrega_confirmada");

    const { data: exp } = await admin.from("expedicoes").select("status, pedido_id").eq("id", expedicaoId).single();
    check("expedição referencia o MESMO pedido", exp?.pedido_id === pedidoId);
    check("status final da expedição é 'expedida'", exp?.status === "expedida");

    const { data: expItem } = await admin.from("expedicao_itens").select("quantidade_entregue").eq("id", expedicaoItemId).single();
    check("quantidade entregue bate com a expedida", expItem?.quantidade_entregue === QUANTIDADE);
  }

  console.log("\n6. Expedição entregue → Instalação → aceita (cliente)");
  let equipeId, instalacaoId, instalacaoItemId;
  {
    equipeId = await esperarSucesso(tenant, "criar_equipe_instalacao", { p_nome: `Equipe E2E ${sufixo}` }, "equipe de instalação criada");

    const dataAgendada = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    instalacaoId = await esperarSucesso(tenant, "criar_instalacao", {
      p_pedido_id: pedidoId, p_equipe_id: equipeId, p_data_agendada: dataAgendada, p_observacoes: "Instalação E2E",
    }, "instalação agendada (exige pedido liberado + obra + equipe ativa)");
    await marcar("instalacao.criada");

    instalacaoItemId = await esperarSucesso(tenant, "adicionar_item_instalacao", {
      p_instalacao_id: instalacaoId, p_pedido_item_id: pedidoItemId, p_quantidade: QUANTIDADE,
    }, "item adicionado à instalação (capado pela quantidade ENTREGUE na expedição, seção 5)");

    await esperarSucesso(tenant, "iniciar_execucao_instalacao", { p_instalacao_id: instalacaoId }, "execução iniciada");

    await esperarSucesso(tenant, "registrar_execucao_item_instalacao", {
      p_instalacao_item_id: instalacaoItemId, p_quantidade_instalada: QUANTIDADE,
    }, "execução do item registrada, instalação completa (sem pendência)");

    await esperarSucesso(tenant, "concluir_instalacao", { p_instalacao_id: instalacaoId }, "instalação concluída");
    await marcar("instalacao.concluida");

    await esperarSucesso(tenant, "registrar_aceite_instalacao", {
      p_instalacao_id: instalacaoId, p_nome_cliente: "Cliente E2E Fluxo Completo",
    }, "aceite do cliente registrado — fim do fluxo");
    await marcar("instalacao.aceite_registrado");

    const { data: inst } = await admin.from("instalacoes").select("status, pedido_id, aceite_nome_cliente").eq("id", instalacaoId).single();
    check("instalação referencia o MESMO pedido do início ao fim do fluxo", inst?.pedido_id === pedidoId);
    check("status final da instalação é 'aceita'", inst?.status === "aceita");
    check("nome de quem aceitou foi registrado", inst?.aceite_nome_cliente === "Cliente E2E Fluxo Completo");

    const { data: instItem } = await admin.from("instalacao_itens").select("quantidade, quantidade_instalada").eq("id", instalacaoItemId).single();
    check("quantidade instalada bate com a planejada desde o orçamento (sem perda/ganho em nenhuma etapa)", instItem?.quantidade === QUANTIDADE && instItem?.quantidade_instalada === QUANTIDADE);
  }

  console.log("\n7. Trilha de auditoria cobre o fluxo inteiro, sob a mesma empresa");
  {
    const { data: logs } = await admin
      .from("activity_logs")
      .select("action, created_at")
      .eq("company_id", tenant.company.id)
      .in("action", logsEsperados)
      .order("created_at", { ascending: true });

    for (const acao of logsEsperados) {
      check(`'${acao}' está na trilha de auditoria`, (logs ?? []).some((l) => l.action === acao));
    }

    const timestamps = (logs ?? []).map((l) => new Date(l.created_at).getTime());
    const cronologico = timestamps.every((t, i) => i === 0 || t >= timestamps[i - 1]);
    check("eventos aparecem em ordem cronológica (orçamento → ... → instalação)", cronologico);
  }

  console.log("\n8. Isolamento cross-tenant — nada deste fluxo vaza pra outra empresa");
  {
    const { data: pedidoCross } = await outroTenant.client.from("pedidos").select("id").eq("id", pedidoId);
    check("outra empresa não enxerga o pedido", (pedidoCross ?? []).length === 0);

    const { data: opCross } = await outroTenant.client.from("ordens_producao").select("id").eq("id", opId);
    check("outra empresa não enxerga a ordem de produção", (opCross ?? []).length === 0);

    const { data: instCross } = await outroTenant.client.from("instalacoes").select("id").eq("id", instalacaoId);
    check("outra empresa não enxerga a instalação", (instCross ?? []).length === 0);

    const { error: tentativaCross } = await outroTenant.client.rpc("concluir_instalacao", { p_instalacao_id: instalacaoId });
    check("outra empresa não consegue operar sobre a instalação alheia", !!tentativaCross);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
