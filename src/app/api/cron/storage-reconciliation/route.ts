import "server-only";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/observability/log";

// F01 (Mapa_Fases_Lacunas_Risco.md, 15/09/2026). Até 20260915040000, um
// usuário com files.upload podia contornar fileValidation.ts fazendo
// upload direto na Data API e só depois chamando register_file() pra
// legitimar o objeto — RLS não lê bytes, então não dava pra impedir isso
// só com policy. Esta era a razão original deste cron.
//
// Desde 20260915040000, storage.objects não concede mais INSERT/UPDATE/
// DELETE pra `authenticated`: a única escrita física é a service role, de
// dentro de src/lib/storage/upload.ts, depois que o arquivo já passou pelo
// pipeline de validação. O bypass deliberado deixou de ser possível — este
// cron agora é só rede de segurança para o crash window residual (a
// service role sobe o objeto físico e o processo morre antes de rodar
// register_file()/o rollback), não mais a defesa principal contra bypass.
// find_orphaned_storage_objects() continua restrita a service_role (ver
// migration 20260915030000).
//
// Vercel Hobby permite no máximo 2 cron jobs, 1x/dia cada (mesma restrição
// já documentada em security-alerts/route.ts) — então um objeto órfão pode
// persistir até ~24h antes de ser varrido. Aceitável para o estágio atual;
// revisar se o plano mudar.
export const dynamic = "force-dynamic";

const ORPHAN_MIN_AGE = "1 hour";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  const { data: orphans, error } = await admin.rpc("find_orphaned_storage_objects", {
    p_older_than: ORPHAN_MIN_AGE,
  });

  if (error) {
    console.error("[storage-reconciliation] falha ao buscar objetos órfãos:", error.message);
    await logSystemEvent(admin, {
      category: "job_failure",
      message: `storage-reconciliation: falha ao consultar objetos órfãos: ${error.message}`,
    });
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const found = orphans ?? [];
  if (found.length === 0) {
    return Response.json({ ok: true, purged: 0 });
  }

  const paths = found.map((o: { name: string }) => o.name);
  const { error: removeError } = await admin.storage.from("company-files").remove(paths);
  if (removeError) {
    console.error("[storage-reconciliation] falha ao remover objetos órfãos:", removeError.message);
    await logSystemEvent(admin, {
      category: "job_failure",
      message: `storage-reconciliation: falha ao remover objetos órfãos: ${removeError.message}`,
      context: { attempted_paths: paths },
    });
    return Response.json({ ok: false, error: removeError.message }, { status: 500 });
  }

  // Registro de segurança (não observabilidade técnica): evidência de que
  // um upload contornou o pipeline da aplicação (register_file()) vale
  // como rastro de auditoria, não só como log operacional — company_id
  // fica nulo porque o objeto órfão nunca foi atribuído a um tenant do
  // ponto de vista da aplicação (sem metadado registrado).
  await admin.rpc("log_activity", {
    p_action: "security.storage_orphans_purged",
    p_entity_type: "storage_object",
    p_entity_id: null,
    p_description: `${found.length} objeto(s) órfão(s) purgado(s) do bucket company-files`,
    p_metadata: { paths },
  });

  return Response.json({ ok: true, purged: found.length });
}
