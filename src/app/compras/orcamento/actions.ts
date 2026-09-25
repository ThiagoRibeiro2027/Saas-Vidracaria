"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertOrcamentoCompraAction(formData: FormData) {
  const categoria = String(formData.get("categoria") ?? "").trim();
  const periodoInicio = String(formData.get("periodo_inicio") ?? "");
  const periodoFim = String(formData.get("periodo_fim") ?? "");
  const valorOrcado = Number(formData.get("valor_orcado") ?? "");

  if (!categoria || !periodoInicio || !periodoFim) throw new Error("Categoria e período são obrigatórios.");
  if (!Number.isFinite(valorOrcado) || valorOrcado < 0) throw new Error("Valor orçado inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_orcamento_compra", {
    p_categoria: categoria,
    p_periodo_inicio: periodoInicio,
    p_periodo_fim: periodoFim,
    p_valor_orcado: valorOrcado,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/orcamento");
}
