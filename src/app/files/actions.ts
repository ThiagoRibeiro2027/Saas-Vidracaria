"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadCompanyFiles } from "@/lib/storage/upload";

// Fase 3: infraestrutura genérica de Storage, ainda sem entidade de negócio
// para anexar (pedidos/projetos chegam nos Tópicos 2-5). entity_id fica nulo
// até essa ligação existir.
const ENTITY_TYPE = "geral";

// Um arquivo por chamada, nunca o lote inteiro: o limite de corpo de uma
// Server Action é dimensionado para 1 arquivo (ver next.config.ts) — juntar
// vários no mesmo FormData estouraria esse limite ou exigiria afrouxá-lo a
// ponto de virar vetor de abuso (Prompt Mestre item 25/26). O client
// (UploadForm) chama esta action uma vez por arquivo selecionado.
export async function uploadFileAction(
  formData: FormData,
): Promise<{ name: string; ok: true; fileId: string } | { name: string; ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { name: "arquivo", ok: false, error: "Nenhum arquivo enviado." };
  }

  try {
    const [result] = await uploadCompanyFiles([file], ENTITY_TYPE, null);
    revalidatePath("/files");
    return result;
  } catch (err) {
    return {
      name: file.name,
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao enviar arquivo.",
    };
  }
}

export async function deleteFileAction(fileId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_file", { p_file_id: fileId });
  if (error) throw new Error(error.message);
  revalidatePath("/files");
}

export async function getSignedUrlAction(fileId: string): Promise<string> {
  const supabase = await createClient();
  // F03 (Mapa_Fases_Lacunas_Risco.md, 15/09/2026): files_select (RLS) já
  // nega linhas com deleted_at preenchido — o filtro aqui é só para dar um
  // erro claro em vez de depender silenciosamente da política.
  const { data: file, error } = await supabase
    .from("files")
    .select("bucket_id, storage_path")
    .eq("id", fileId)
    .is("deleted_at", null)
    .single();
  if (error || !file) throw new Error("Arquivo não encontrado.");

  const { data: signed, error: signError } = await supabase.storage
    .from(file.bucket_id)
    .createSignedUrl(file.storage_path, 60); // URL temporária — Prompt Mestre item 20
  if (signError || !signed) throw new Error("Não foi possível gerar o link de download.");

  return signed.signedUrl;
}
