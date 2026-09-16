"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarExpedicaoAction(formData: FormData) {
  const pedidoId = String(formData.get("pedido_id") ?? "");
  if (!pedidoId) throw new Error("Pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_expedicao", { p_pedido_id: pedidoId });
  if (error) throw new Error(error.message);

  revalidatePath("/expedicao");
}

export async function adicionarItemExpedicaoAction(formData: FormData) {
  const expedicaoId = String(formData.get("expedicao_id") ?? "");
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  const quantidade = Number(formData.get("quantidade"));
  if (!expedicaoId || !pedidoItemId) throw new Error("Expedição e item de pedido são obrigatórios.");
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("Quantidade precisa ser maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("adicionar_item_expedicao", {
    p_expedicao_id: expedicaoId,
    p_pedido_item_id: pedidoItemId,
    p_quantidade: quantidade,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/expedicao");
}

export async function removerItemExpedicaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Item de expedição inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_item_expedicao", { p_expedicao_item_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/expedicao");
}

export async function conferirExpedicaoAction(formData: FormData) {
  const expedicaoId = String(formData.get("expedicao_id") ?? "");
  if (!expedicaoId) throw new Error("Expedição inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("conferir_expedicao", { p_expedicao_id: expedicaoId });
  if (error) throw new Error(error.message);

  revalidatePath("/expedicao");
}

export async function registrarSaidaExpedicaoAction(formData: FormData) {
  const expedicaoId = String(formData.get("expedicao_id") ?? "");
  if (!expedicaoId) throw new Error("Expedição inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_saida_expedicao", { p_expedicao_id: expedicaoId });
  if (error) throw new Error(error.message);

  revalidatePath("/expedicao");
}

export async function cancelarExpedicaoAction(formData: FormData) {
  const expedicaoId = String(formData.get("expedicao_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!expedicaoId) throw new Error("Expedição inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_expedicao", { p_expedicao_id: expedicaoId, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/expedicao");
}

export async function confirmarEntregaItemExpedicaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const quantidadeEntregue = Number(formData.get("quantidade_entregue"));
  if (!id) throw new Error("Item de expedição inválido.");
  if (!Number.isFinite(quantidadeEntregue) || quantidadeEntregue <= 0) {
    throw new Error("Quantidade entregue precisa ser maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmar_entrega_item_expedicao", {
    p_expedicao_item_id: id,
    p_quantidade_entregue: quantidadeEntregue,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/expedicao");
}

export async function registrarOcorrenciaExpedicaoAction(formData: FormData) {
  const expedicaoId = String(formData.get("expedicao_id") ?? "");
  const descricao = String(formData.get("descricao") ?? "").trim();
  if (!expedicaoId) throw new Error("Expedição inválida.");
  if (!descricao) throw new Error("Descrição da ocorrência é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_ocorrencia_expedicao", {
    p_expedicao_id: expedicaoId,
    p_descricao: descricao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/expedicao");
}
