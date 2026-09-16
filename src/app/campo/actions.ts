"use server";

import { uploadCompanyFiles } from "@/lib/storage/upload";

// Evidências fotográficas (ADR-008 §15) — mesmo caminho de src/app/files,
// entity_type="instalacao". Só-online neste recorte: guardar o arquivo
// binário em IndexedDB para reenvio posterior (fila de evidências offline,
// ADR-005 §22) é um pedaço de escopo à parte — a UI (CampoEvidencias)
// desabilita o formulário quando offline em vez de fingir que funciona.
export async function uploadEvidenciaAction(
  formData: FormData,
  instalacaoId: string,
): Promise<{ name: string; ok: true; fileId: string } | { name: string; ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { name: "arquivo", ok: false, error: "Nenhum arquivo enviado." };
  }

  try {
    const [result] = await uploadCompanyFiles([file], "instalacao", instalacaoId);
    return result;
  } catch (err) {
    return { name: file.name, ok: false, error: err instanceof Error ? err.message : "Erro ao enviar evidência." };
  }
}
