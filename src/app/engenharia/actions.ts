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

export async function gerarBomSugeridaAction(formData: FormData) {
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  if (!pedidoItemId) throw new Error("Item de pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_bom_sugerida_pedido_item", { p_pedido_item_id: pedidoItemId });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function ajustarItemBomAction(formData: FormData) {
  const pedidoItemBomId = String(formData.get("pedido_item_bom_id") ?? "");
  const materialItemId = String(formData.get("material_item_id") ?? "");
  const quantidadeRaw = String(formData.get("quantidade_por_unidade") ?? "").trim();
  if (!pedidoItemBomId || !materialItemId) throw new Error("BOM e material são obrigatórios.");

  const quantidade = Number(quantidadeRaw);
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("ajustar_item_bom_pedido_item", {
    p_pedido_item_bom_id: pedidoItemBomId,
    p_material_item_id: materialItemId,
    p_quantidade_por_unidade: quantidade,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function removerItemBomAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Linha de BOM inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_item_bom_pedido_item", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function aprovarBomDefinitivaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("BOM inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("aprovar_bom_definitiva", { p_pedido_item_bom_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
  revalidatePath("/suprimentos");
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
