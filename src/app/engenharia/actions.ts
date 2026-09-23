"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarItemProducaoAction(formData: FormData) {
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  if (!pedidoItemId) throw new Error("Item de pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_item_producao", { p_pedido_item_id: pedidoItemId });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function registrarMedicaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const ambiente = String(formData.get("ambiente") ?? "").trim() || null;
  const largura = Number(formData.get("largura_mm"));
  const altura = Number(formData.get("altura_mm"));
  if (!id || !Number.isFinite(largura) || !Number.isFinite(altura)) {
    throw new Error("Dados inválidos para medição.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_medicao", {
    p_id: id,
    p_ambiente: ambiente,
    p_largura_mm: largura,
    p_altura_mm: altura,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function confirmarMedicaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Item de produção inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmar_medicao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function definirValorCaracteristicaAction(formData: FormData) {
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  const pecaCaracteristicaId = String(formData.get("peca_caracteristica_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const valorRaw = String(formData.get("valor") ?? "").trim();
  if (!pedidoItemId || !pecaCaracteristicaId || !valorRaw) {
    throw new Error("Característica e valor são obrigatórios.");
  }

  const valorNumero = tipo === "numero" ? Number(valorRaw) : null;
  if (tipo === "numero" && !Number.isFinite(valorNumero)) throw new Error("Valor numérico inválido.");
  const valorTexto = tipo === "numero" ? null : valorRaw;

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_valor_caracteristica_pedido_item", {
    p_pedido_item_id: pedidoItemId,
    p_peca_caracteristica_id: pecaCaracteristicaId,
    p_valor_numero: valorNumero,
    p_valor_texto: valorTexto,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}
