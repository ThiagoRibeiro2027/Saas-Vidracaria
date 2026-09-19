"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function marcarNotificacaoLidaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Notificação inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_notificacao_lida", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/");
}
