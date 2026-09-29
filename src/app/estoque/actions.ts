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

// =========================================================================
// Fase 2 da ADR-011 — estoque dimensional (TÓPICO 7 §5-6, §9 base).
//
// Item com dimensao_tipo definido deixa de ser saldo escalar e passa a ter
// peça física individual: barra, chapa, bobina. Consumir parte de uma peça
// só reduz a quantidade disponível DELA — o que sobra já é a sobra
// reaproveitável, sem tabela nem estado separado. Por isso não há ação de
// "registrar sobra" aqui: sobra não é entrada, é o saldo que ficou.
// =========================================================================

export async function registrarPecaDimensionalAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const quantidade = Number(formData.get("quantidade"));
  const identificador = String(formData.get("identificador") ?? "").trim() || null;
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!itemId) throw new Error("Item inválido.");
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("Quantidade da peça deve ser maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_peca_dimensional", {
    p_item_id: itemId,
    p_quantidade: quantidade,
    p_identificador: identificador,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/estoque");
}

export async function consumirPecaDimensionalAction(formData: FormData) {
  const pecaId = String(formData.get("peca_id") ?? "");
  const quantidade = Number(formData.get("quantidade"));
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!pecaId) throw new Error("Peça inválida.");
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("Quantidade a consumir deve ser maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("consumir_peca_dimensional", {
    p_peca_id: pecaId,
    p_quantidade: quantidade,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/estoque");
}

// Conversão é consulta (exige só estoque.view) e devolve um número para a
// tela mostrar — por isso usa estado de formulário, não redirecionamento.
// O fator não é genérico: é a propriedade física do próprio item
// (peso_por_unidade_dimensao), então converter item sem ela é recusado
// pelo banco.
export type ConversaoState =
  | { resultado: number; unidade: string; error?: undefined }
  | { error: string; resultado?: undefined; unidade?: undefined }
  | undefined;

export async function converterUnidadeDimensionalAction(
  _prevState: ConversaoState,
  formData: FormData,
): Promise<ConversaoState> {
  const itemId = String(formData.get("item_id") ?? "");
  const sentido = String(formData.get("sentido") ?? "");
  const quantidade = Number(formData.get("quantidade"));
  if (!itemId) return { error: "Selecione um item com controle dimensional." };
  if (sentido !== "para_peso" && sentido !== "de_peso") {
    return { error: "Sentido de conversão inválido." };
  }
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    return { error: "Quantidade deve ser maior que zero." };
  }

  const supabase = await createClient();
  // As duas funções não são simétricas no nome do parâmetro:
  // converter_item_para_peso recebe p_quantidade (na unidade do item) e
  // converter_item_de_peso recebe p_quantidade_kg. Passar o nome errado
  // não falha na compilação — o PostgREST é que não acha a função.
  const { data, error } =
    sentido === "para_peso"
      ? await supabase.rpc("converter_item_para_peso", { p_item_id: itemId, p_quantidade: quantidade })
      : await supabase.rpc("converter_item_de_peso", { p_item_id: itemId, p_quantidade_kg: quantidade });
  if (error) return { error: error.message };

  if (sentido === "para_peso") return { resultado: Number(data), unidade: "kg" };

  // Convertendo de kg de volta, o resultado sai na unidade principal do
  // próprio item (metro ou m²) — lida aqui em vez de viajar pelo
  // formulário, para não depender de um campo que o cliente controla.
  const { data: item } = await supabase
    .from("itens")
    .select("unidade_principal")
    .eq("id", itemId)
    .maybeSingle();

  return { resultado: Number(data), unidade: item?.unidade_principal ?? "un" };
}
