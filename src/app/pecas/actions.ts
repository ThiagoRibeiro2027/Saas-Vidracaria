"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarPecaAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const descricaoTecnica = String(formData.get("descricao_tecnica") ?? "").trim() || null;
  if (!itemId) throw new Error("Item inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_peca", { p_item_id: itemId, p_descricao_tecnica: descricaoTecnica });
  if (error) throw new Error(error.message);

  revalidatePath("/pecas");
}

export async function inativarPecaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Peça inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("inativar_peca", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/pecas");
}

export async function reativarPecaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Peça inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reativar_peca", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/pecas");
}

export async function adicionarMaterialPecaAction(formData: FormData) {
  const pecaId = String(formData.get("peca_id") ?? "");
  const materialItemId = String(formData.get("material_item_id") ?? "");
  const quantidadeRaw = String(formData.get("quantidade_por_unidade") ?? "").trim();
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!pecaId) throw new Error("Peça inválida.");
  if (!materialItemId) throw new Error("Material inválido.");

  const quantidade = Number(quantidadeRaw);
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade por unidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("adicionar_material_peca", {
    p_peca_id: pecaId,
    p_material_item_id: materialItemId,
    p_quantidade_por_unidade: quantidade,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/pecas");
}

export async function atualizarMaterialPecaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const quantidadeRaw = String(formData.get("quantidade_por_unidade") ?? "").trim();
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!id) throw new Error("Linha de composição inválida.");

  const quantidade = Number(quantidadeRaw);
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade por unidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_material_peca", {
    p_id: id,
    p_quantidade_por_unidade: quantidade,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/pecas");
}

export async function removerMaterialPecaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Linha de composição inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_material_peca", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/pecas");
}
