import "server-only";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/observability/log";

// Fase P2 do Security Gate (RUNBOOK-GOVERNANCA-DE-SEGURANCA.md §3) —
// alerta próprio sobre activity_logs, sem serviço de terceiro contratado
// além do envio de e-mail (Resend, free tier). Rodado 1x/dia via Vercel
// Cron (vercel.json) — plano Hobby não permite frequência maior
// (https://vercel.com/docs/cron-jobs/usage-and-pricing).
//
// Gate técnico T4→T8 (Mapa_Fases_Lacunas_Risco.md §25, "observabilidade
// mínima concluída"): até aqui system_events (F23) só era consultável
// manualmente por platform_admin — uma falha real de storage/job passava
// despercebida porque este cron só olhava activity_logs. Agora também
// varre system_events (severidade error/critical) na mesma janela e no
// mesmo e-mail, sem duplicar a lógica de idempotência/janela abaixo.
//
// Idempotência (exigida pela própria Vercel — cron delivery é best-effort
// e pode invocar 2x ou pular uma execução): a janela verificada em cada
// execução vai do `checked_until` da última execução registrada até agora
// — nunca um intervalo fixo — então uma invocação duplicada só reprocessa
// uma janela vazia, e uma execução perdida é coberta na próxima. O
// marcador em si vive em public.cron_job_state (não em activity_logs —
// achado de code-review: activity_logs tem expurgo de retenção de 24
// meses, que apagaria o próprio marcador se o cron ficasse pausado por
// tempo demais).
export const dynamic = "force-dynamic";

const JOB_NAME = "security-alerts";

const WATCHED_ACTIONS = [
  "auth.login_blocked",
  "governance.subscription_transitioned",
  "lgpd.activity_logs_anonymized",
  "governance.activity_logs_retention_purge",
] as const;

const ALERT_SEVERITIES = ["error", "critical"] as const;

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type WatchedActivityEvent = {
  action: string;
  company_id: string | null;
  description: string | null;
  created_at: string;
};

type WatchedSystemEvent = {
  category: string;
  severity: string;
  company_id: string | null;
  message: string;
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

// Achado de code-review: o remetente onboarding@resend.dev é o domínio
// sandbox do Resend — só entrega pro e-mail cadastrado como dono da
// própria conta Resend, não pra um destinatário arbitrário. Sem domínio
// próprio verificado (ver RUNBOOK §4), SECURITY_ALERT_EMAIL só funciona
// de fato se for igual ao e-mail da conta Resend usada aqui.
async function sendAlertEmail(
  activityEvents: WatchedActivityEvent[],
  systemEvents: WatchedSystemEvent[],
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SECURITY_ALERT_EMAIL;
  if (!apiKey || !to) {
    console.error(
      "[security-alerts] RESEND_API_KEY ou SECURITY_ALERT_EMAIL não configurados — alerta não enviado.",
    );
    return;
  }

  const activityCounts = activityEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.action] = (acc[e.action] ?? 0) + 1;
    return acc;
  }, {});
  const activitySummaryHtml = Object.entries(activityCounts)
    .map(([action, count]) => `<li>${escapeHtml(action)}: ${count}</li>`)
    .join("");
  const activityRowsHtml = activityEvents
    .slice(0, 50)
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e.created_at)}</td><td>${escapeHtml(e.action)}</td>` +
        `<td>${escapeHtml(e.company_id ?? "-")}</td><td>${escapeHtml(e.description ?? "")}</td></tr>`,
    )
    .join("");

  const systemCounts = systemEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1;
    return acc;
  }, {});
  const systemSummaryHtml = Object.entries(systemCounts)
    .map(([category, count]) => `<li>${escapeHtml(category)}: ${count}</li>`)
    .join("");
  const systemRowsHtml = systemEvents
    .slice(0, 50)
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e.created_at)}</td><td>${escapeHtml(e.severity)}</td>` +
        `<td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.company_id ?? "-")}</td>` +
        `<td>${escapeHtml(e.message)}</td></tr>`,
    )
    .join("");

  const systemEventsSectionHtml =
    systemEvents.length > 0
      ? `
        <h2>Observabilidade técnica (system_events, ADR-009 §5.1)</h2>
        <ul>${systemSummaryHtml}</ul>
        <table border="1" cellpadding="6" cellspacing="0">
          <tr><th>Quando</th><th>Severidade</th><th>Categoria</th><th>Empresa</th><th>Mensagem</th></tr>
          ${systemRowsHtml}
        </table>
      `
      : "";

  const total = activityEvents.length + systemEvents.length;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "SaaS Vidraçaria <onboarding@resend.dev>",
      to: [to],
      subject: `[Security Gate] ${total} evento(s) nas últimas 24h (${activityEvents.length} auditoria, ${systemEvents.length} técnico)`,
      html: `
        <h2>Auditoria de negócio (activity_logs)</h2>
        <ul>${activitySummaryHtml || "<li>nenhum</li>"}</ul>
        <table border="1" cellpadding="6" cellspacing="0">
          <tr><th>Quando</th><th>Ação</th><th>Empresa</th><th>Descrição</th></tr>
          ${activityRowsHtml}
        </table>
        ${systemEventsSectionHtml}
        <p>Runbook: docs/RUNBOOK-GOVERNANCA-DE-SEGURANCA.md</p>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const hint = /only send testing emails|verify a domain/i.test(body)
      ? " (causa provável: remetente sandbox só entrega pro e-mail dono da conta Resend — ver RUNBOOK-GOVERNANCA-DE-SEGURANCA.md §3-4)"
      : "";
    console.error(`[security-alerts] falha ao enviar e-mail: ${response.status} ${body}${hint}`);
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
    .from("cron_job_state")
    .select("checked_until")
    .eq("job_name", JOB_NAME)
    .maybeSingle();

  const windowStart = lastRun?.checked_until
    ? new Date(lastRun.checked_until)
    : new Date(Date.now() - DEFAULT_LOOKBACK_MS);
  const windowEnd = new Date();

  // As duas consultas rodam antes de qualquer efeito colateral (envio de
  // e-mail, gravação do marcador) — se qualquer uma falhar, a execução
  // aborta sem mover checked_until, e a próxima tentativa cobre a mesma
  // janela inteira (nenhum evento se perde por uma falha de leitura).
  const [activityResult, systemEventsResult] = await Promise.all([
    admin
      .from("activity_logs")
      .select("action, company_id, description, created_at")
      .in("action", WATCHED_ACTIONS)
      .gte("created_at", windowStart.toISOString())
      .lt("created_at", windowEnd.toISOString())
      .order("created_at", { ascending: true }),
    admin
      .from("system_events")
      .select("category, severity, company_id, message, created_at")
      .in("severity", ALERT_SEVERITIES)
      .gte("created_at", windowStart.toISOString())
      .lt("created_at", windowEnd.toISOString())
      .order("created_at", { ascending: true }),
  ]);

  if (activityResult.error || systemEventsResult.error) {
    const message = activityResult.error?.message ?? systemEventsResult.error?.message ?? "erro desconhecido";
    console.error("[security-alerts] falha ao consultar eventos:", message);
    // F23 (ADR-009 §5.2: "falhas de jobs e rotinas automáticas") — antes só
    // existia console.error, sem registro consultável fora do log bruto da
    // hospedagem.
    await logSystemEvent(admin, {
      category: "job_failure",
      severity: "error",
      message: `security-alerts: falha ao consultar eventos: ${message}`,
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }

  const activityEvents = activityResult.data ?? [];
  const systemEvents = systemEventsResult.data ?? [];
  const total = activityEvents.length + systemEvents.length;

  if (total > 0) {
    // Achado de code-review: uma falha de rede no fetch() ao Resend (não
    // só uma resposta não-2xx, que sendAlertEmail já trata sozinha) não
    // pode impedir a gravação do marcador abaixo — do contrário a janela
    // da próxima execução cresce sem limite e reenvia os mesmos eventos
    // em todo run seguinte até um envio finalmente funcionar.
    try {
      await sendAlertEmail(activityEvents, systemEvents);
    } catch (err) {
      console.error("[security-alerts] exceção ao enviar e-mail (marcador será gravado mesmo assim):", err);
    }
  }

  // Marca a execução independentemente de ter achado algo (ou de o envio
  // ter funcionado) — é o que dá o ponto de partida (checked_until) pra
  // próxima execução.
  await admin
    .from("cron_job_state")
    .upsert({ job_name: JOB_NAME, checked_until: windowEnd.toISOString() }, { onConflict: "job_name" });

  return Response.json({
    ok: true,
    events_found: total,
    activity_events_found: activityEvents.length,
    system_events_found: systemEvents.length,
  });
}
