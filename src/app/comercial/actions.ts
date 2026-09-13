"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertOrcamentoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  const obraId = String(formData.get("obra_id") ?? "") || null;
  const validade = String(formData.get("validade") ?? "") || null;
  const condicaoComercial = String(formData.get("condicao_comercial") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!pessoaId) throw new Error("Cliente é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_orcamento", {
    p_id: id,
    p_pessoa_id: pessoaId,
    p_obra_id: obraId,
    p_validade: validade,
    p_condicao_comercial: condicaoComercial,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function upsertOrcamentoItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const orcamentoId = String(formData.get("orcamento_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const quantidade = Number(formData.get("quantidade"));
  const precoUnitario = Number(formData.get("preco_unitario"));

  if (!orcamentoId || !itemId || !Number.isFinite(quantidade) || !Number.isFinite(precoUnitario)) {
    throw new Error("Dados inválidos para item do orçamento.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_orcamento_item", {
    p_id: id,
    p_orcamento_id: orcamentoId,
    p_item_id: itemId,
    p_quantidade: quantidade,
    p_preco_unitario: precoUnitario,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function removeOrcamentoItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Item inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_orcamento_item", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function decidirOrcamentoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  if (!id || (decisao !== "aprovado" && decisao !== "rejeitado")) {
    throw new Error("Decisão inválida.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decidir_orcamento", { p_id: id, p_decisao: decisao });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function cancelarOrcamentoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Orçamento inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_orcamento", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}
