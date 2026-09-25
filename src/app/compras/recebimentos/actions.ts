"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function registrarRecebimentoPedidoCompraAction(formData: FormData) {
  const pedidoCompraId = String(formData.get("pedido_compra_id") ?? "");
  const numeroNf = String(formData.get("numero_nf") ?? "").trim() || null;
  const transportadora = String(formData.get("transportadora") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!pedidoCompraId) throw new Error("Pedido de compra é obrigatório.");

  const itens: { pedido_compra_item_id: string; quantidade_recebida: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qtd_")) continue;
    const quantidade = Number(value);
    if (Number.isFinite(quantidade) && quantidade > 0) {
      itens.push({ pedido_compra_item_id: key.slice(4), quantidade_recebida: quantidade });
    }
  }
  if (itens.length === 0) throw new Error("Informe a quantidade recebida de ao menos um item.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_recebimento_pedido_compra", {
    p_pedido_compra_id: pedidoCompraId,
    p_itens: itens,
    p_numero_nf: numeroNf,
    p_transportadora: transportadora,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/recebimentos");
}

export async function registrarLoteRecebimentoAction(formData: FormData) {
  const recebimentoItemId = String(formData.get("recebimento_item_id") ?? "");
  const numeroLote = String(formData.get("numero_lote") ?? "").trim();
  const quantidade = Number(formData.get("quantidade") ?? "");
  const dataFabricacao = String(formData.get("data_fabricacao") ?? "").trim() || null;
  const dataValidade = String(formData.get("data_validade") ?? "").trim() || null;
  const certificado = String(formData.get("certificado") ?? "").trim() || null;

  if (!recebimentoItemId || !numeroLote) throw new Error("Item de recebimento e número do lote são obrigatórios.");
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade do lote inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_lote_recebimento", {
    p_recebimento_item_id: recebimentoItemId,
    p_numero_lote: numeroLote,
    p_quantidade: quantidade,
    p_data_fabricacao: dataFabricacao,
    p_data_validade: dataValidade,
    p_certificado: certificado,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/recebimentos");
}

export async function registrarDivergenciaRecebimentoAction(formData: FormData) {
  const recebimentoItemId = String(formData.get("recebimento_item_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const descricao = String(formData.get("descricao") ?? "").trim();
  const quantidadeRaw = String(formData.get("quantidade_divergente") ?? "").trim();

  if (!recebimentoItemId || !tipo) throw new Error("Item de recebimento e tipo são obrigatórios.");
  if (!descricao) throw new Error("Descrição da divergência é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_divergencia_recebimento", {
    p_recebimento_item_id: recebimentoItemId,
    p_tipo: tipo,
    p_descricao: descricao,
    p_quantidade_divergente: quantidadeRaw ? Number(quantidadeRaw) : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/recebimentos");
}

export async function tratarDivergenciaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  const observacao = String(formData.get("observacao") ?? "").trim() || null;

  if (!id || !["aceitar", "recusar"].includes(decisao)) throw new Error("Decisão inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("tratar_divergencia", {
    p_id: id,
    p_decisao: decisao,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/recebimentos");
}

export async function finalizarConferenciaRecebimentoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Recebimento inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("finalizar_conferencia_recebimento", { p_recebimento_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/recebimentos");
}

export async function registrarDevolucaoCompraAction(formData: FormData) {
  const recebimentoItemId = String(formData.get("recebimento_item_id") ?? "");
  const quantidade = Number(formData.get("quantidade") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  const divergenciaId = String(formData.get("divergencia_id") ?? "").trim() || null;

  if (!recebimentoItemId) throw new Error("Item de recebimento é obrigatório.");
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");
  if (!motivo) throw new Error("Motivo da devolução é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_devolucao_compra", {
    p_recebimento_item_id: recebimentoItemId,
    p_quantidade: quantidade,
    p_motivo: motivo,
    p_divergencia_id: divergenciaId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/recebimentos");
}
