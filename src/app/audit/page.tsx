import { createClient } from "@/lib/supabase/server";

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
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>Fase 4 — Auditoria</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Central de auditoria</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Últimos {LOG_LIMIT} eventos registrados. Os logs são somente-leitura: nenhum usuário
          (nem administrador de empresa) pode alterá-los ou apagá-los.
        </p>

        {error && <p style={{ color: "#9b2c2c", fontSize: "13px" }}>Sem permissão para ver os logs.</p>}

        {!error && (logs ?? []).length === 0 && (
          <p style={{ fontSize: "13px", color: "#6b7a75" }}>Nenhum evento registrado ainda.</p>
        )}

        {!error && (logs ?? []).length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #dae2de" }}>
                  <th style={thStyle}>Data/hora</th>
                  <th style={thStyle}>Ação</th>
                  <th style={thStyle}>Empresa</th>
                  <th style={thStyle}>Usuário</th>
                  <th style={thStyle}>Entidade</th>
                  <th style={thStyle}>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs!.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #eef1ef" }}>
                    <td style={tdStyle}>{new Date(log.created_at).toLocaleString("pt-BR")}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace" }}>{log.action}</td>
                    <td style={tdStyle}>{log.company_id ? (companyNameById.get(log.company_id) ?? "—") : "—"}</td>
                    <td style={tdStyle}>{log.user_id ? (profileNameById.get(log.user_id) ?? "—") : "—"}</td>
                    <td style={tdStyle}>
                      {log.entity_type}
                      {log.description ? ` — ${log.description}` : ""}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace" }}>{log.ip_address ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
  background: "#f5f7f5",
  padding: "48px 16px",
} as const;

const cardStyle = {
  background: "#fff",
  padding: "32px",
  borderRadius: "8px",
  width: "820px",
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px -12px rgba(0,0,0,.18)",
} as const;

const eyebrowStyle = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "#1f5d57",
  margin: 0,
} as const;

const thStyle = { padding: "6px 8px" } as const;
const tdStyle = { padding: "6px 8px" } as const;
