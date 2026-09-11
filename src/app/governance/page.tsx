import { createClient } from "@/lib/supabase/server";
import AdminSubscriptionsTable from "./AdminSubscriptionsTable";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function GovernancePage() {
  const supabase = await createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>Fase 6 — Governança</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>
          {isPlatformAdmin ? "Empresas e assinaturas" : "Meu plano e consumo"}
        </h1>

        {isPlatformAdmin ? <PlatformAdminView supabase={supabase} /> : <TenantView supabase={supabase} />}
      </div>
    </main>
  );
}

async function PlatformAdminView({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("company_id, status")
    .order("created_at", { ascending: false });

  const companyIds = (subscriptions ?? []).map((s) => s.company_id);
  const { data: companies } =
    companyIds.length > 0
      ? await supabase.from("companies").select("id, name").in("id", companyIds)
      : { data: [] as { id: string; name: string }[] };
  const companyNameById = new Map((companies ?? []).map((c) => [c.id, c.name]));

  const usageRows = await Promise.all(
    (subscriptions ?? []).map(async (sub) => {
      const { data: usage } = await supabase.rpc("company_usage", { p_company_id: sub.company_id });
      const u = usage?.[0];
      return {
        companyId: sub.company_id,
        companyName: companyNameById.get(sub.company_id) ?? "—",
        status: sub.status,
        planName: u?.plan_name ?? null,
        userCount: u?.user_count ?? 0,
        storageBytesUsed: u?.storage_bytes_used ?? 0,
        maxUsers: u?.max_users ?? null,
        maxStorageBytes: u?.max_storage_bytes ?? null,
      };
    }),
  );

  return (
    <>
      <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
        Painel do administrador de plataforma (item 24 do Prompt Mestre). Mudar o status aqui é a
        única via de transição — não há gateway de pagamento real nesta fase (ADR-006 §3.25),
        então toda transição é uma decisão administrativa manual e fica auditada.
      </p>
      <AdminSubscriptionsTable rows={usageRows} />
    </>
  );
}

async function TenantView({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  const { data: usage, error } = await supabase.rpc("company_usage");
  const row = usage?.[0];

  if (error || !row) {
    return <p style={{ color: "#9b2c2c", fontSize: "13px" }}>Não foi possível carregar seu consumo.</p>;
  }

  const userPct = row.max_users ? Math.round((row.user_count / row.max_users) * 100) : null;
  const storagePct = row.max_storage_bytes
    ? Math.round((row.storage_bytes_used / row.max_storage_bytes) * 100)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
        Plano: <strong>{row.plan_name ?? "sem plano definido"}</strong> · Status da assinatura:{" "}
        <strong style={{ fontFamily: "monospace" }}>{row.subscription_status ?? "—"}</strong>
      </p>

      <div>
        <p style={{ fontSize: "13px", margin: "0 0 4px" }}>
          Usuários: {row.user_count}
          {row.max_users ? ` / ${row.max_users} (${userPct}%)` : " (sem limite definido)"}
        </p>
        <p style={{ fontSize: "13px", margin: 0 }}>
          Storage: {formatBytes(row.storage_bytes_used)}
          {row.max_storage_bytes
            ? ` / ${formatBytes(row.max_storage_bytes)} (${storagePct}%)`
            : " (sem limite definido)"}
        </p>
      </div>

      {row.subscription_status === "suspended" && (
        <p style={{ color: "#9b2c2c", fontSize: "13px" }}>
          Sua empresa está suspensa por pendência comercial: novos envios de arquivo estão
          bloqueados. Leitura e exportação de dados continuam disponíveis.
        </p>
      )}
    </div>
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
