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
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">Fase 6 — Governança</p>
      <h1 className="mt-1 text-lg font-semibold text-text">
        {isPlatformAdmin ? "Empresas e assinaturas" : "Meu plano e consumo"}
      </h1>

      <div className="mt-6">
        {isPlatformAdmin ? <PlatformAdminView supabase={supabase} /> : <TenantView supabase={supabase} />}
      </div>
    </div>
  );
}

async function PlatformAdminView({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  // F24 (Mapa_Fases_Lacunas_Risco.md, 15/09/2026): esta tela lê empresas e
  // assinaturas de todos os tenants via bypass de RLS (is_platform_admin_
  // mfa_verified() — já exige AAL2). O que faltava era uma trilha de que o
  // bypass foi de fato exercido; não bloqueia a leitura (é um painel
  // cross-tenant por natureza), só registra.
  await supabase.rpc("log_platform_admin_access", { p_view: "governance.platform_admin_view" });

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
      <p className="mb-3 text-sm text-text">
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
    return <p className="text-sm text-danger">Não foi possível carregar seu consumo.</p>;
  }

  const userPct = row.max_users ? Math.round((row.user_count / row.max_users) * 100) : null;
  const storagePct = row.max_storage_bytes
    ? Math.round((row.storage_bytes_used / row.max_storage_bytes) * 100)
    : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text">
        Plano: <strong>{row.plan_name ?? "sem plano definido"}</strong> · Status da assinatura:{" "}
        <strong className="font-mono">{row.subscription_status ?? "—"}</strong>
      </p>

      <div>
        <p className="mb-1 text-sm text-text">
          Usuários: {row.user_count}
          {row.max_users ? ` / ${row.max_users} (${userPct}%)` : " (sem limite definido)"}
        </p>
        <p className="text-sm text-text">
          Storage: {formatBytes(row.storage_bytes_used)}
          {row.max_storage_bytes
            ? ` / ${formatBytes(row.max_storage_bytes)} (${storagePct}%)`
            : " (sem limite definido)"}
        </p>
      </div>

      {row.subscription_status === "suspended" && (
        <p className="text-sm text-danger">
          Sua empresa está suspensa por pendência comercial: novos envios de arquivo estão
          bloqueados. Leitura e exportação de dados continuam disponíveis.
        </p>
      )}
    </div>
  );
}
