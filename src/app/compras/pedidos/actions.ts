"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function gerarPedidoCompraDeCotacaoAction(formData: FormData) {
  const cotacaoId = String(formData.get("cotacao_id") ?? "");
  if (!cotacaoId) throw new Error("Cotação é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_pedido_compra_de_cotacao", { p_cotacao_id: cotacaoId });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/pedidos");
}

export async function atualizarStatusPedidoCompraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id || !["confirmado", "cancelado"].includes(status)) throw new Error("Status inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_status_pedido_compra", { p_id: id, p_status: status, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/pedidos");
}

export async function vincularPedidoCompraContratoAction(formData: FormData) {
  const pedidoCompraId = String(formData.get("pedido_compra_id") ?? "");
  const contratoId = String(formData.get("contrato_id") ?? "");
  if (!pedidoCompraId || !contratoId) throw new Error("Pedido de compra e contrato são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("vincular_pedido_compra_contrato", { p_pedido_compra_id: pedidoCompraId, p_contrato_id: contratoId });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/pedidos");
}

export async function programarEntregaPedidoCompraAction(formData: FormData) {
  const pedidoCompraId = String(formData.get("pedido_compra_id") ?? "");
  const dataEntrega = String(formData.get("data_entrega") ?? "");
  const quantidade = Number(formData.get("quantidade") ?? "");
  if (!pedidoCompraId || !dataEntrega) throw new Error("Pedido de compra e data de entrega são obrigatórios.");
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("programar_entrega_pedido_compra", {
    p_pedido_compra_id: pedidoCompraId,
    p_data_entrega: dataEntrega,
    p_quantidade: quantidade,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/pedidos");
}

export async function gerarTitulosPedidoCompraAction(formData: FormData) {
  const pedidoCompraId = String(formData.get("pedido_compra_id") ?? "");
  const valorTotal = Number(formData.get("valor_total") ?? "");
  const vencimento = String(formData.get("vencimento") ?? "");
  const condicaoPagamento = String(formData.get("condicao_pagamento") ?? "").trim() || null;

  if (!pedidoCompraId || !vencimento) throw new Error("Pedido de compra e vencimento são obrigatórios.");
  if (!Number.isFinite(valorTotal) || valorTotal <= 0) throw new Error("Valor inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_titulos_pedido_compra", {
    p_pedido_compra_id: pedidoCompraId,
    p_parcelas: [{ valor: valorTotal, vencimento, condicao_pagamento: condicaoPagamento }],
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/pedidos");
}

export async function registrarPagamentoTituloCompraAction(formData: FormData) {
  const tituloId = String(formData.get("titulo_id") ?? "");
  const valor = Number(formData.get("valor") ?? "");
  const dataPagamento = String(formData.get("data_pagamento") ?? "").trim() || null;

  if (!tituloId) throw new Error("Título é obrigatório.");
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("Valor inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_pagamento_titulo_compra", {
    p_titulo_id: tituloId,
    p_valor: valor,
    p_data_pagamento: dataPagamento,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/pedidos");
}
