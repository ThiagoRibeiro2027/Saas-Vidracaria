import { createClient } from "@/lib/supabase/server";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { Table, Th, Td } from "@/components/ui/Table";

const LOG_LIMIT = 100;

export default async function AuditPage() {
  const supabase = await createClient();

  // F24 (Mapa_Fases_Lacunas_Risco.md, 15/09/2026): quando quem está vendo é
  // platform_admin, esta página exerce o bypass cross-tenant de
  // activity_logs_select (já exige AAL2 via is_platform_admin_mfa_
  // verified()). Registra a trilha de que o acesso de suporte aconteceu —
  // não se aplica ao usuário de tenant vendo o próprio log.
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin_mfa_verified");
  if (isPlatformAdmin) {
    await supabase.rpc("log_platform_admin_access", {
      p_view: "audit.platform_admin_view",
      p_context: { limit: LOG_LIMIT },
    });
  }

  // A RLS de activity_logs (Fase 2) já resolve o escopo sozinha: usuário de
  // tenant só recebe linhas da própria empresa (e só com permissão
  // files... na verdade activity_logs.read); platform_admin recebe tudo.
  // Nenhum filtro manual de company_id é necessário nem confiável aqui.
  const { data: logs, error } = await supabase
    .from("activity_logs")
    .select("id, action, entity_type, entity_id, description, metadata, ip_address, user_agent, created_at, user_id, company_id")
    .order("created_at", { ascending: false })
    .limit(LOG_LIMIT);

  const userIds = [...new Set((logs ?? []).map((l) => l.user_id).filter((id): id is string => !!id))];
  const companyIds = [...new Set((logs ?? []).map((l) => l.company_id).filter((id): id is string => !!id))];

  const [{ data: profiles }, { data: companies }] = await Promise.all([
    userIds.length > 0
      ? supabase.from("profiles").select("id, display_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    companyIds.length > 0
      ? supabase.from("companies").select("id, name").in("id", companyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const companyNameById = new Map((companies ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">Fase 4 — Auditoria</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Central de auditoria</h1>
      <p className="mt-1 text-sm text-text">
        Últimos {LOG_LIMIT} eventos registrados. Os logs são somente-leitura: nenhum usuário
        (nem administrador de empresa) pode alterá-los ou apagá-los.
      </p>

      {error && (
        <div className="mt-4">
          <PermissionDenied message="Sem permissão para ver os logs." />
        </div>
      )}

      {!error && (logs ?? []).length === 0 && (
        <p className="mt-4 text-sm text-text-muted">Nenhum evento registrado ainda.</p>
      )}

      {!error && (logs ?? []).length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Data/hora</Th>
                <Th>Ação</Th>
                <Th>Empresa</Th>
                <Th>Usuário</Th>
                <Th>Entidade</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {logs!.map((log) => (
                <tr key={log.id}>
                  <Td>{new Date(log.created_at).toLocaleString("pt-BR")}</Td>
                  <Td className="font-mono">{log.action}</Td>
                  <Td>{log.company_id ? (companyNameById.get(log.company_id) ?? "—") : "—"}</Td>
                  <Td>{log.user_id ? (profileNameById.get(log.user_id) ?? "—") : "—"}</Td>
                  <Td>
                    {log.entity_type}
                    {log.description ? ` — ${log.description}` : ""}
                  </Td>
                  <Td className="font-mono">{log.ip_address ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
