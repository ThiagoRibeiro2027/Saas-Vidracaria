import "server-only";
import { randomUUID } from "crypto";

// F23 (Mapa_Fases_Lacunas_Risco.md, 15/09/2026) / ADR-009 §5: observabilidade
// técnica é separada de auditoria de negócio (activity_logs) — ponto único
// de captura para erro/falha de storage/job/integração. Ferramenta externa
// e alertas (§5.5/§5.6) continuam decisão futura; isto cobre só o mínimo
// (registro consultável em public.system_events) exigido antes do M1.
// Nunca logar segredos/tokens/PII desnecessária em `message`/`context`
// (§5.4) — responsabilidade de quem chama esta função.

export type SystemEventCategory =
  | "app_error"
  | "auth_failure_volume"
  | "integration_failure"
  | "storage_failure"
  | "job_failure";

export type SystemEventSeverity = "info" | "warning" | "error" | "critical";

type SupabaseLike = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
};

// Gera um identificador de correlação por chamada (ADR-009 §5.3) — devolvido
// ao chamador pra poder ser exibido ao usuário ("ref: <id>") sem expor
// detalhes internos, permitindo localizar o evento depois em system_events.
export function newCorrelationId(): string {
  return randomUUID();
}

export async function logSystemEvent(
  supabase: SupabaseLike,
  params: {
    category: SystemEventCategory;
    message: string;
    severity?: SystemEventSeverity;
    companyId?: string | null;
    correlationId?: string | null;
    context?: Record<string, unknown> | null;
  },
): Promise<void> {
  const { error } = await supabase.rpc("log_system_event", {
    p_category: params.category,
    p_message: params.message,
    p_severity: params.severity ?? "error",
    p_company_id: params.companyId ?? null,
    p_correlation_id: params.correlationId ?? null,
    p_context: params.context ?? null,
  });
  if (error) {
    // Nunca deixar uma falha de observabilidade derrubar o fluxo principal;
    // console.error continua sendo a rede de segurança final (capturado
    // pelos logs da plataforma de hospedagem).
    console.error("[observability] falha ao gravar system_event:", error.message);
  }
}
