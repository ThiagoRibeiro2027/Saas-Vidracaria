"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function gerarNecessidadesPoliticaAction() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_necessidades_de_politica_abastecimento", { p_item_id: null });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/mapa");
  revalidatePath("/suprimentos");
}

export async function upsertFeriadoAction(formData: FormData) {
  const data = String(formData.get("data") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim() || null;
  if (!data) throw new Error("Data é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_feriado", { p_data: data, p_descricao: descricao });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/mapa");
}

export async function removerFeriadoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Feriado inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_feriado", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/mapa");
}
