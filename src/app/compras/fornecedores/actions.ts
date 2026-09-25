"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertCriterioAvaliacaoFornecedorAction(formData: FormData) {
  const chave = String(formData.get("chave") ?? "");
  const peso = Number(formData.get("peso") ?? "");

  if (!chave) throw new Error("Critério é obrigatório.");
  if (!Number.isFinite(peso) || peso < 0) throw new Error("Peso inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_criterio_avaliacao_fornecedor", { p_chave: chave, p_peso: peso });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/fornecedores");
}

export async function avaliarFornecedorAction(formData: FormData) {
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  const periodoInicio = String(formData.get("periodo_inicio") ?? "");
  const periodoFim = String(formData.get("periodo_fim") ?? "");

  if (!pessoaId || !periodoInicio || !periodoFim) throw new Error("Fornecedor e período são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("avaliar_fornecedor", {
    p_pessoa_id: pessoaId,
    p_periodo_inicio: periodoInicio,
    p_periodo_fim: periodoFim,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/fornecedores");
}
