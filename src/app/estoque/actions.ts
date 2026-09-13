"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function ajustarSaldoAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const delta = Number(formData.get("quantidade_delta"));
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!itemId || !Number.isFinite(delta) || delta === 0 || !motivo) {
    throw new Error("Item, quantidade (diferente de zero) e motivo são obrigatórios.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("ajustar_saldo", {
    p_item_id: itemId,
    p_quantidade_delta: delta,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/estoque");
}

export async function reservarParaPedidoItemAction(formData: FormData) {
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  if (!pedidoItemId) throw new Error("Item de pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reservar_para_pedido_item", { p_pedido_item_id: pedidoItemId });
  if (error) throw new Error(error.message);

  revalidatePath("/estoque");
}

export async function liberarReservaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Reserva inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("liberar_reserva", { p_reserva_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/estoque");
}

export async function consumirReservaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Reserva inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("consumir_reserva", { p_reserva_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/estoque");
}

export async function registrarEntradaSobraAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const quantidade = Number(formData.get("quantidade"));
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "") || null;
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!itemId || !Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("Item e quantidade (maior que zero) são obrigatórios.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_entrada_sobra", {
    p_item_id: itemId,
    p_quantidade: quantidade,
    p_pedido_item_id: pedidoItemId,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/estoque");
}
