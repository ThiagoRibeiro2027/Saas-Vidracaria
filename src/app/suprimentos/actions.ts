"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarNecessidadeCompraAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const quantidade = Number(formData.get("quantidade") ?? 0);
  const dataNecessaria = String(formData.get("data_necessaria") ?? "").trim() || null;
  const origem = String(formData.get("origem") ?? "manual");
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!itemId || !(quantidade > 0)) {
    throw new Error("Item e quantidade (maior que zero) são obrigatórios.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_necessidade_compra", {
    p_item_id: itemId,
    p_quantidade: quantidade,
    p_data_necessaria: dataNecessaria,
    p_origem: origem,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/suprimentos");
}

export async function atenderNecessidadeCompraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Necessidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("atender_necessidade_compra", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/suprimentos");
}

export async function cancelarNecessidadeCompraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Necessidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_necessidade_compra", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/suprimentos");
}

export async function gerarNecessidadesDePedidoAction(formData: FormData) {
  const pedidoId = String(formData.get("pedido_id") ?? "");
  if (!pedidoId) throw new Error("Pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_necessidades_de_pedido", { p_pedido_id: pedidoId });
  if (error) throw new Error(error.message);

  revalidatePath("/suprimentos");
}

export async function gerarNecessidadesDeOrdemProducaoAction(formData: FormData) {
  const ordemProducaoId = String(formData.get("ordem_producao_id") ?? "");
  if (!ordemProducaoId) throw new Error("Ordem de produção inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_necessidades_de_ordem_producao", { p_ordem_producao_id: ordemProducaoId });
  if (error) throw new Error(error.message);

  revalidatePath("/suprimentos");
}
