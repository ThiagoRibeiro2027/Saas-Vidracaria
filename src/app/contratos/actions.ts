"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertContratoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const tipo = String(formData.get("tipo") ?? "");
  const pessoaId = String(formData.get("pessoa_id") ?? "").trim() || null;
  const obraId = String(formData.get("obra_id") ?? "").trim() || null;
  const pedidoId = String(formData.get("pedido_id") ?? "").trim() || null;
  const funcionarioId = String(formData.get("funcionario_id") ?? "").trim() || null;
  const objeto = String(formData.get("objeto") ?? "").trim();
  const dataInicio = String(formData.get("data_inicio") ?? "").trim() || null;
  const dataFim = String(formData.get("data_fim") ?? "").trim() || null;
  const renovacao = String(formData.get("renovacao") ?? "manual");
  const valorRaw = String(formData.get("valor") ?? "").trim();
  const valor = valorRaw ? Number(valorRaw) : null;
  if (valor !== null && !Number.isFinite(valor)) throw new Error("Valor inválido.");
  const formaPagamento = String(formData.get("forma_pagamento") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!tipo) throw new Error("Tipo de contrato é obrigatório.");
  if (!objeto) throw new Error("Objeto do contrato é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_contrato", {
    p_id: id,
    p_tipo: tipo,
    p_pessoa_id: pessoaId,
    p_obra_id: obraId,
    p_pedido_id: pedidoId,
    p_funcionario_id: funcionarioId,
    p_objeto: objeto,
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
    p_renovacao: renovacao,
    p_valor: valor,
    p_forma_pagamento: formaPagamento,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
}

export async function ativarContratoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Contrato inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("ativar_contrato", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
}

export async function encerrarContratoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Contrato inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("encerrar_contrato", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
}
