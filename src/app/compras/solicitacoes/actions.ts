"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarSolicitacaoCompraAction(formData: FormData) {
  const setor = String(formData.get("setor") ?? "").trim() || null;
  const prioridade = String(formData.get("prioridade") ?? "normal");
  const justificativa = String(formData.get("justificativa") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_solicitacao_compra", {
    p_setor: setor,
    p_prioridade: prioridade,
    p_justificativa: justificativa,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/solicitacoes");
}

export async function adicionarItemSolicitacaoAction(formData: FormData) {
  const solicitacaoId = String(formData.get("solicitacao_compra_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const quantidadeRaw = String(formData.get("quantidade") ?? "").trim();
  const dataNecessaria = String(formData.get("data_necessaria") ?? "").trim() || null;
  const aplicacao = String(formData.get("aplicacao") ?? "").trim() || null;
  const necessidadeId = String(formData.get("necessidade_compra_id") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!solicitacaoId || !itemId) throw new Error("Solicitação e item são obrigatórios.");
  const quantidade = Number(quantidadeRaw);
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("adicionar_item_solicitacao", {
    p_solicitacao_compra_id: solicitacaoId,
    p_item_id: itemId,
    p_quantidade: quantidade,
    p_data_necessaria: dataNecessaria,
    p_aplicacao: aplicacao,
    p_necessidade_compra_id: necessidadeId,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/solicitacoes");
}

export async function removerItemSolicitacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Item inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_item_solicitacao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/solicitacoes");
}

export async function enviarSolicitacaoCompraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Solicitação inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("enviar_solicitacao_compra", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/solicitacoes");
  revalidatePath("/suprimentos");
}

export async function cancelarSolicitacaoCompraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Solicitação inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_solicitacao_compra", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/solicitacoes");
}

export async function criarCompraDiretaAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const quantidadeRaw = String(formData.get("quantidade") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "");
  const justificativa = String(formData.get("justificativa") ?? "").trim();
  const necessidadeId = String(formData.get("necessidade_compra_id") ?? "").trim() || null;

  if (!itemId || !justificativa) throw new Error("Item e justificativa são obrigatórios.");
  const quantidade = Number(quantidadeRaw);
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_compra_direta", {
    p_item_id: itemId,
    p_quantidade: quantidade,
    p_motivo: motivo,
    p_justificativa: justificativa,
    p_necessidade_compra_id: necessidadeId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/solicitacoes");
  revalidatePath("/suprimentos");
}

export async function cancelarCompraDiretaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Compra direta inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_compra_direta", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/solicitacoes");
}
