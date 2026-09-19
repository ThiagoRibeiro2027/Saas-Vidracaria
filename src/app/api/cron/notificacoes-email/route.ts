import "server-only";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/observability/log";

// ADR-007 §5 — e-mail só para notificação prioridade='critica'. Rodado
// 1x/dia via Vercel Cron (vercel.json) — plano Hobby não permite
// frequência maior (mesma limitação já documentada em
// RUNBOOK-GOVERNANCA-DE-SEGURANCA.md §3 pro cron de security-alerts).
// "E-mail não é garantia de entrega" (§5) — este atraso de até 24h pra
// crítica é uma limitação conhecida deste recorte, não um bug.
//
// Sem janela de tempo (diferente de security-alerts): a consulta varre
// por ESTADO (email_status='pendente'), não por intervalo — uma
// invocação duplicada da Vercel Cron naturalmente encontra zero
// pendências na segunda vez, idempotente por desenho, sem precisar de
// cron_job_state.
//
// ⚠️ Mesma restrição do remetente sandbox já documentada pro cron de
// security-alerts (RUNBOOK-GOVERNANCA-DE-SEGURANCA.md §3): sem domínio
// próprio verificado no Resend, onboarding@resend.dev só entrega pro
// e-mail cadastrado como DONO da conta Resend — não pro contact_email
// arbitrário de cada usuário. Até a verificação de domínio (mesmo
// procedimento da seção 4 daquele runbook), todo envio pra alguém que
// não seja o dono da conta falha, e fica registrado em email_erro
// (nunca silenciosamente, ao contrário do cron de security-alerts que
// só loga no console).
export const dynamic = "force-dynamic";

async function enviarEmail(to: string, titulo: string, mensagem: string, acaoNecessaria: string | null): Promise<{ ok: boolean; erro?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, erro: "RESEND_API_KEY não configurada" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "SaaS Vidraçaria <onboarding@resend.dev>",
      to: [to],
      subject: `[Crítico] ${titulo}`,
      html: `<p>${mensagem}</p>${acaoNecessaria ? `<p><strong>Ação necessária:</strong> ${acaoNecessaria}</p>` : ""}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const hint = /only send testing emails|verify a domain/i.test(body)
      ? " (causa provável: remetente sandbox só entrega pro dono da conta Resend — ver RUNBOOK-GOVERNANCA-DE-SEGURANCA.md §3-4)"
      : "";
    return { ok: false, erro: `${response.status} ${body}${hint}` };
  }
  return { ok: true };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  const { data: pendentes, error } = await admin
    .from("notificacoes")
    .select("id, titulo, mensagem, acao_necessaria, profile_id, profiles(contact_email)")
    .eq("email_status", "pendente")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[notificacoes-email] falha ao consultar pendências:", error.message);
    await logSystemEvent(admin, {
      category: "job_failure",
      severity: "error",
      message: `notificacoes-email: falha ao consultar pendências: ${error.message}`,
    });
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  let enviados = 0;
  let falharam = 0;

  for (const n of pendentes ?? []) {
    // @ts-expect-error -- relação aninhada tipada como array pelo supabase-js
    const contactEmail: string | null = n.profiles?.contact_email ?? null;

    if (!contactEmail) {
      await admin
        .from("notificacoes")
        .update({ email_status: "falhou", email_erro: "usuário sem e-mail de contato cadastrado" })
        .eq("id", n.id);
      falharam++;
      continue;
    }

    const resultado = await enviarEmail(contactEmail, n.titulo, n.mensagem, n.acao_necessaria);
    await admin
      .from("notificacoes")
      .update(
        resultado.ok
          ? { email_status: "enviado" }
          : { email_status: "falhou", email_erro: resultado.erro },
      )
      .eq("id", n.id);

    if (resultado.ok) enviados++;
    else falharam++;
  }

  return Response.json({ ok: true, total: (pendentes ?? []).length, enviados, falharam });
}
