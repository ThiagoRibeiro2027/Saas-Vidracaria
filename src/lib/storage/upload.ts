import "server-only";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { logSystemEvent, newCorrelationId } from "@/lib/observability/log";
import {
  FileValidationError,
  MAX_FILES_PER_UPLOAD,
  validateAndProcessFile,
} from "./fileValidation";

const BUCKET = "company-files";

export type UploadResult =
  | { name: string; ok: true; fileId: string }
  | { name: string; ok: false; error: string };

// Faz upload usando o client vinculado à sessão do usuário (nunca a service
// role): a RLS de storage.objects e a função register_file() são a rede de
// segurança real, o código da aplicação é só a primeira camada (Prompt
// Mestre: RLS/multi-tenant/auditoria têm prioridade sobre velocidade).
export async function uploadCompanyFiles(
  files: File[],
  entityType: string,
  entityId: string | null,
): Promise<UploadResult[]> {
  if (files.length === 0) return [];
  if (files.length > MAX_FILES_PER_UPLOAD) {
    throw new FileValidationError(`Envie no máximo ${MAX_FILES_PER_UPLOAD} arquivos por vez.`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new FileValidationError("Sessão expirada.");

  const { data: companyId, error: companyError } = await supabase.rpc("current_company_id");
  if (companyError || !companyId) {
    throw new FileValidationError("Usuário sem empresa associada.");
  }

  const results: UploadResult[] = [];

  for (const file of files) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const processed = await validateAndProcessFile(Buffer.from(arrayBuffer));
      const storagePath = `${companyId}/${entityType}/${entityId ?? "geral"}/${randomUUID()}.${processed.extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, processed.buffer, {
          contentType: processed.mimeType,
          upsert: false,
        });
      if (uploadError) {
        // F23 (ADR-009 §5.2: "falhas de upload e de storage"): antes disso
        // só existia o erro devolvido ao usuário — nada consultável do
        // lado operacional quando o Storage falha.
        const correlationId = newCorrelationId();
        await logSystemEvent(supabase, {
          category: "storage_failure",
          message: `Falha ao enviar objeto para o bucket ${BUCKET}: ${uploadError.message}`,
          companyId,
          correlationId,
          context: { storage_path: storagePath, mime_type: processed.mimeType },
        });
        throw new FileValidationError(`Falha ao enviar arquivo (ref: ${correlationId}).`);
      }

      const { data: fileId, error: registerError } = await supabase.rpc("register_file", {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_storage_path: storagePath,
        p_original_name: file.name,
        p_mime_type: processed.mimeType,
        p_size_bytes: processed.sizeBytes,
        p_width: processed.width ?? null,
        p_height: processed.height ?? null,
      });
      if (registerError || !fileId) {
        // Sem metadado registrado, o objeto no Storage vira lixo — remove.
        // (Backstop estrutural pro resíduo do F01: find_orphaned_storage_
        // objects() purga o que sobreviver a esta limpeza best-effort.)
        await supabase.storage.from(BUCKET).remove([storagePath]);
        // registerError cobre tanto rejeição de negócio esperada (quota,
        // empresa suspensa, sem permissão) quanto falha real — loga como
        // warning porque o caminho feliz já lida com a maioria dos casos
        // via mensagem de erro específica do RPC.
        await logSystemEvent(supabase, {
          category: "storage_failure",
          severity: "warning",
          message: `register_file() rejeitou o objeto enviado: ${registerError?.message ?? "erro desconhecido"}`,
          companyId,
          context: { storage_path: storagePath },
        });
        throw new FileValidationError(
          `Falha ao registrar metadado: ${registerError?.message ?? "erro desconhecido"}`,
        );
      }

      results.push({ name: file.name, ok: true, fileId });
    } catch (err) {
      results.push({
        name: file.name,
        ok: false,
        error: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    }
  }

  return results;
}
