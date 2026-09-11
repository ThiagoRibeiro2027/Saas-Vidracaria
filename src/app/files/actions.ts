"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadCompanyFiles } from "@/lib/storage/upload";

// Fase 3: infraestrutura genérica de Storage, ainda sem entidade de negócio
// para anexar (pedidos/projetos chegam nos Tópicos 2-5). entity_id fica nulo
// até essa ligação existir.
const ENTITY_TYPE = "geral";

export async function uploadFilesAction(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Selecione ao menos um arquivo." };

  try {
    const results = await uploadCompanyFiles(files, ENTITY_TYPE, null);
    revalidatePath("/files");

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      return { error: failed.map((f) => `${f.name}: ${f.error}`).join(" | ") };
    }
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao enviar arquivos." };
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
  const { data: file, error } = await supabase
    .from("files")
    .select("bucket_id, storage_path")
    .eq("id", fileId)
    .single();
  if (error || !file) throw new Error("Arquivo não encontrado.");

  const { data: signed, error: signError } = await supabase.storage
    .from(file.bucket_id)
    .createSignedUrl(file.storage_path, 60); // URL temporária — Prompt Mestre item 20
  if (signError || !signed) throw new Error("Não foi possível gerar o link de download.");

  return signed.signedUrl;
}
