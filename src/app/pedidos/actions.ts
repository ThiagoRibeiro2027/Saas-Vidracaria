"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function converterOrcamentoAction(formData: FormData) {
  const orcamentoId = String(formData.get("orcamento_id") ?? "");
  if (!orcamentoId) throw new Error("Orçamento inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
  if (error) throw new Error(error.message);

  revalidatePath("/pedidos");
}

export async function iniciarConferenciaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("iniciar_conferencia_pedido", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/pedidos");
}

export async function abrirPendenciaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const descricao = String(formData.get("descricao") ?? "").trim();
  if (!id || !descricao) throw new Error("Descrição da pendência é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("abrir_pendencia_pedido", { p_id: id, p_descricao: descricao });
  if (error) throw new Error(error.message);

  revalidatePath("/pedidos");
}

export async function resolverPendenciaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const resolucao = String(formData.get("resolucao") ?? "").trim() || null;
  if (!id) throw new Error("Pendência inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolver_pendencia_pedido", { p_pendencia_id: id, p_resolucao: resolucao });
  if (error) throw new Error(error.message);

  revalidatePath("/pedidos");
}

export async function liberarPedidoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("liberar_pedido", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/pedidos");
}

export async function cancelarPedidoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_pedido", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/pedidos");
}
