"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarOrdemProducaoAction(formData: FormData) {
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  if (!pedidoItemId) throw new Error("Item de pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_ordem_producao", { p_pedido_item_id: pedidoItemId });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function apontarProducaoAction(formData: FormData) {
  const ordemId = String(formData.get("ordem_producao_id") ?? "");
  const produzida = Number(formData.get("quantidade_produzida") || 0);
  const perdida = Number(formData.get("quantidade_perdida") || 0);
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!ordemId) throw new Error("Ordem de produção inválida.");
  if (!Number.isFinite(produzida) || !Number.isFinite(perdida) || produzida < 0 || perdida < 0) {
    throw new Error("Quantidade produzida e perdida devem ser números válidos e não negativos.");
  }
  if (produzida === 0 && perdida === 0) {
    throw new Error("Informe quantidade produzida e/ou perdida maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("apontar_producao", {
    p_ordem_producao_id: ordemId,
    p_quantidade_produzida: produzida,
    p_quantidade_perdida: perdida,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function concluirOrdemProducaoAction(formData: FormData) {
  const ordemId = String(formData.get("ordem_producao_id") ?? "");
  if (!ordemId) throw new Error("Ordem de produção inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("concluir_ordem_producao", { p_ordem_producao_id: ordemId });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function cancelarOrdemProducaoAction(formData: FormData) {
  const ordemId = String(formData.get("ordem_producao_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!ordemId) throw new Error("Ordem de produção inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_ordem_producao", {
    p_ordem_producao_id: ordemId,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}
