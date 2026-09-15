import "server-only";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Fase P2 do Security Gate (RUNBOOK-GOVERNANCA-DE-SEGURANCA.md §3) —
// alerta próprio sobre activity_logs, sem serviço de terceiro contratado
// além do envio de e-mail (Resend, free tier). Rodado 1x/dia via Vercel
// Cron (vercel.json) — plano Hobby não permite frequência maior
// (https://vercel.com/docs/cron-jobs/usage-and-pricing).
//
// Idempotência (exigida pela própria Vercel — cron delivery é best-effort
// e pode invocar 2x ou pular uma execução): a janela verificada em cada
// execução vai do `checked_until` da última execução registrada até agora
// — nunca um intervalo fixo — então uma invocação duplicada só reprocessa
// uma janela vazia, e uma execução perdida é coberta na próxima.
export const dynamic = "force-dynamic";

const WATCHED_ACTIONS = [
  "auth.login_blocked",
  "governance.subscription_transitioned",
  "lgpd.activity_logs_anonymized",
  "governance.activity_logs_retention_purge",
] as const;

const MARKER_ACTION = "system.security_alert_run";
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type WatchedEvent = {
  action: string;
  company_id: string | null;
  description: string | null;
  created_at: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendAlertEmail(events: WatchedEvent[]) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SECURITY_ALERT_EMAIL;
  if (!apiKey || !to) {
    console.error(
      "[security-alerts] RESEND_API_KEY ou SECURITY_ALERT_EMAIL não configurados — alerta não enviado.",
    );
    return;
  }

  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.action] = (acc[e.action] ?? 0) + 1;
    return acc;
  }, {});
  const summaryHtml = Object.entries(counts)
    .map(([action, count]) => `<li>${escapeHtml(action)}: ${count}</li>`)
    .join("");
  const rowsHtml = events
    .slice(0, 50)
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e.created_at)}</td><td>${escapeHtml(e.action)}</td>` +
        `<td>${escapeHtml(e.company_id ?? "-")}</td><td>${escapeHtml(e.description ?? "")}</td></tr>`,
    )
    .join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "SaaS Vidraçaria <onboarding@resend.dev>",
      to: [to],
      subject: `[Security Gate] ${events.length} evento(s) de segurança nas últimas 24h`,
      html: `
        <h2>Resumo</h2>
        <ul>${summaryHtml}</ul>
        <h2>Eventos (até 50)</h2>
        <table border="1" cellpadding="6" cellspacing="0">
          <tr><th>Quando</th><th>Ação</th><th>Empresa</th><th>Descrição</th></tr>
          ${rowsHtml}
        </table>
        <p>Runbook: docs/RUNBOOK-GOVERNANCA-DE-SEGURANCA.md</p>
      `,
    }),
  });

  if (!response.ok) {
    console.error("[security-alerts] falha ao enviar e-mail:", response.status, await response.text());
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  const { data: lastRun } = await admin
    .from("activity_logs")
    .select("metadata")
    .eq("action", MARKER_ACTION)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const checkedUntilRaw = (lastRun?.metadata as Record<string, unknown> | null)?.checked_until;
  const windowStart =
    typeof checkedUntilRaw === "string" ? new Date(checkedUntilRaw) : new Date(Date.now() - DEFAULT_LOOKBACK_MS);
  const windowEnd = new Date();

  const { data: events, error } = await admin
    .from("activity_logs")
    .select("action, company_id, description, created_at")
    .in("action", WATCHED_ACTIONS)
    .gte("created_at", windowStart.toISOString())
    .lt("created_at", windowEnd.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[security-alerts] falha ao consultar activity_logs:", error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const found = events ?? [];
  if (found.length > 0) {
    await sendAlertEmail(found);
  }

  // Marca a execução independentemente de ter achado algo — é o que dá o
  // ponto de partida (checked_until) pra próxima execução.
  await admin.from("activity_logs").insert({
    company_id: null,
    user_id: null,
    action: MARKER_ACTION,
    entity_type: "system",
    description: `Checagem de alertas de segurança — ${found.length} evento(s) encontrado(s) desde ${windowStart.toISOString()}.`,
    metadata: { checked_from: windowStart.toISOString(), checked_until: windowEnd.toISOString(), events_found: found.length },
  });

  return Response.json({ ok: true, events_found: found.length });
}
