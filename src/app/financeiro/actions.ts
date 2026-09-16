"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function gerarTitulosPedidoAction(formData: FormData) {
  const pedidoId = String(formData.get("pedido_id") ?? "");
  const valores = formData.getAll("parcela_valor").map((v) => Number(v));
  const vencimentos = formData.getAll("parcela_vencimento").map((v) => String(v));
  const condicoes = formData.getAll("parcela_condicao").map((v) => String(v).trim() || null);

  if (!pedidoId || valores.length === 0 || valores.length !== vencimentos.length) {
    throw new Error("Pedido e ao menos uma parcela (valor + vencimento) são obrigatórios.");
  }

  const parcelas = valores.map((valor, i) => ({
    valor,
    vencimento: vencimentos[i],
    condicao_pagamento: condicoes[i],
  }));

  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_titulos_pedido", {
    p_pedido_id: pedidoId,
    p_parcelas: parcelas,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

export async function registrarRecebimentoTituloAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const valor = Number(formData.get("valor") ?? 0);
  const dataRecebimento = String(formData.get("data_recebimento") ?? "").trim() || null;

  if (!id || !(valor > 0)) {
    throw new Error("Título e valor (maior que zero) são obrigatórios.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_recebimento_titulo", {
    p_titulo_id: id,
    p_valor: valor,
    p_data_recebimento: dataRecebimento,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}

export async function cancelarTituloFinanceiroAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Título inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_titulo_financeiro", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/financeiro");
}
