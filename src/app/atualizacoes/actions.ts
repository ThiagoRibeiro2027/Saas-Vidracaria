"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarAtualizacaoAction(formData: FormData) {
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const publicadoEm = String(formData.get("publicado_em") ?? "").trim();
  if (!titulo) throw new Error("Título é obrigatório.");
  if (!descricao) throw new Error("Descrição é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_atualizacao_sistema", {
    p_titulo: titulo,
    p_descricao: descricao,
    p_publicado_em: publicadoEm || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/atualizacoes");
}

export async function editarAtualizacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const publicadoEm = String(formData.get("publicado_em") ?? "").trim();
  if (!id) throw new Error("Atualização inválida.");
  if (!titulo) throw new Error("Título é obrigatório.");
  if (!descricao) throw new Error("Descrição é obrigatória.");
  if (!publicadoEm) throw new Error("Data de publicação é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("editar_atualizacao_sistema", {
    p_id: id,
    p_titulo: titulo,
    p_descricao: descricao,
    p_publicado_em: publicadoEm,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/atualizacoes");
}

export async function removerAtualizacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Atualização inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_atualizacao_sistema", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/atualizacoes");
}
