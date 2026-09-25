"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function gerarTitulosPedidoAction(formData: FormData) {
  const pedidoId = String(formData.get("pedido_id") ?? "");
  const valores = formData.getAll("parcela_valor").map((v) => Number(v));
  const vencimentos = formData.getAll("parcela_vencimento").map((v) => String(v));
  const condicoes = formData.getAll("parcela_condicao").map((v) => String(v).trim() || null);

  if (!pedidoId || valores.length === 0 || valores.length !== vencimentos.length) {
    throw new Error("Pedido e ao menos uma parcela (valor + vencimento) são obrigatórios.");
  }

  const parcelas = valores.map((valor, i) => ({
    valor,
    vencimento: vencimentos[i],
    condicao_pagamento: condicoes[i],
  }));

  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_titulos_pedido", {
    p_pedido_id: pedidoId,
    p_parcelas: parcelas,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

export async function registrarRecebimentoTituloAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const valor = Number(formData.get("valor") ?? 0);
  const dataRecebimento = String(formData.get("data_recebimento") ?? "").trim() || null;

  if (!id || !(valor > 0)) {
    throw new Error("Título e valor (maior que zero) são obrigatórios.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_recebimento_titulo", {
    p_titulo_id: id,
    p_valor: valor,
    p_data_recebimento: dataRecebimento,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

export async function cancelarTituloFinanceiroAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Título inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_titulo_financeiro", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

// TÓPICO 13 §6, Fase 5 — bancos, boletos, PIX (ADR-002 §4.14/§4.17, emenda).

export async function configurarContaBancariaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const banco = String(formData.get("banco") ?? "").trim();
  const agencia = String(formData.get("agencia") ?? "").trim();
  const conta = String(formData.get("conta") ?? "").trim();
  const tipoConta = String(formData.get("tipo_conta") ?? "");
  const pixChave = String(formData.get("pix_chave") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("configurar_conta_bancaria", {
    p_id: id, p_banco: banco, p_agencia: agencia, p_conta: conta, p_tipo_conta: tipoConta, p_pix_chave: pixChave,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

export async function ativarContaBancariaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Conta bancária inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("ativar_conta_bancaria", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/financeiro");
}

export async function desativarContaBancariaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Conta bancária inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_conta_bancaria", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/financeiro");
}

export async function upsertAlcadaFinanceiroAction(formData: FormData) {
  const processo = String(formData.get("processo") ?? "titulo_pagar");
  const ordem = Number(formData.get("ordem") ?? 0);
  const valorMinimo = Number(formData.get("valor_minimo") ?? 0);
  const roleId = String(formData.get("role_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_alcada_financeiro", {
    p_processo: processo, p_ordem: ordem, p_valor_minimo: valorMinimo, p_role_id: roleId, p_ativo: true,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

export async function desativarAlcadaFinanceiroAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Etapa de alçada inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_alcada_financeiro", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/financeiro");
}

export async function submeterPagamentoTituloAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Título a pagar inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submeter_pagamento_titulo", { p_titulo_pagar_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/financeiro");
}

export async function decidirEtapaAprovacaoFinanceiroAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!id || (decisao !== "aprovar" && decisao !== "rejeitar")) throw new Error("Decisão inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("decidir_etapa_aprovacao_financeiro", { p_etapa_id: id, p_decisao: decisao, p_observacao: observacao });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

export async function registrarPagamentoTituloCompraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const valor = Number(formData.get("valor") ?? 0);
  const dataPagamento = String(formData.get("data_pagamento") ?? "").trim() || null;
  const contaBancariaId = String(formData.get("conta_bancaria_id") ?? "") || null;
  const formaPagamento = String(formData.get("forma_pagamento") ?? "") || null;

  if (!id || !(valor > 0)) throw new Error("Título e valor (maior que zero) são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_pagamento_titulo_compra", {
    p_titulo_id: id, p_valor: valor, p_data_pagamento: dataPagamento, p_conta_bancaria_id: contaBancariaId, p_forma_pagamento: formaPagamento,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

export async function gerarCobrancaAction(formData: FormData) {
  const tituloId = String(formData.get("titulo_id") ?? "");
  const contaBancariaId = String(formData.get("conta_bancaria_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  if (!tituloId || !contaBancariaId || !tipo) throw new Error("Título, conta bancária e tipo são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_cobranca", { p_titulo_id: tituloId, p_conta_bancaria_id: contaBancariaId, p_tipo: tipo });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

export async function cancelarCobrancaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Cobrança inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_cobranca", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/financeiro");
}

export async function marcarCobrancaPagaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const dataRecebimento = String(formData.get("data_recebimento") ?? "").trim() || null;
  if (!id) throw new Error("Cobrança inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_cobranca_paga", { p_id: id, p_data_recebimento: dataRecebimento });
  if (error) throw new Error(error.message);
  revalidatePath("/financeiro");
}

export async function registrarMovimentacaoBancariaAction(formData: FormData) {
  const contaBancariaId = String(formData.get("conta_bancaria_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const valor = Number(formData.get("valor") ?? 0);
  const dataMovimento = String(formData.get("data_movimento") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim() || null;

  if (!contaBancariaId || !tipo || !(valor > 0) || !dataMovimento) {
    throw new Error("Conta, tipo, valor (maior que zero) e data são obrigatórios.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_movimentacao_bancaria", {
    p_conta_bancaria_id: contaBancariaId, p_tipo: tipo, p_valor: valor, p_data_movimento: dataMovimento, p_descricao: descricao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

export async function conciliarMovimentacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const tipoAlvo = String(formData.get("tipo_alvo") ?? "");
  const alvoId = String(formData.get("alvo_id") ?? "");
  if (!id || !tipoAlvo || !alvoId) throw new Error("Movimentação, tipo de alvo e alvo são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("conciliar_movimentacao", { p_movimentacao_id: id, p_tipo_alvo: tipoAlvo, p_alvo_id: alvoId });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

export async function desconciliarMovimentacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Movimentação inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("desconciliar_movimentacao", { p_movimentacao_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/financeiro");
}
