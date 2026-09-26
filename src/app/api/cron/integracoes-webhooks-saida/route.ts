import "server-only";
import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/observability/log";

// TÓPICO 13 §14, Fase 4 — entrega de webhooks de saída gerados por regras
// de automação (nível Assistido, confirmadas manualmente em
// confirmar_execucao_regra()). Rodado 1x/dia via Vercel Cron
// (vercel.json) — mesma limitação de plano Hobby já aceita pros outros
// crons (RUNBOOK-GOVERNANCA-DE-SEGURANCA.md §3): o evento fica na fila
// (integracao_operacoes) até a próxima execução.
//
// Reaproveita a fila e o retry/backoff exponencial já existentes desde a
// Fase 1, só que pelo caminho "sistema_*" (sem sessão de usuário —
// assert_tenant_write() das funções tenant-facing exigiria auth.uid(),
// que não existe aqui).
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

async function entregar(
  url: string,
  secret: string,
  body: string,
  eventId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-id": eventId,
        "x-webhook-timestamp": timestamp,
        "x-webhook-signature": signature,
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, erro: `HTTP ${response.status} ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "erro de rede" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: pendentes, error } = await admin
    .from("integracao_operacoes")
    .select("id, payload")
    .eq("tipo", "webhook_saida")
    .in("status", ["pendente", "erro_temporario"])
    .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[integracoes-webhooks-saida] falha ao consultar fila:", error.message);
    await logSystemEvent(admin, {
      category: "job_failure",
      severity: "error",
      message: `integracoes-webhooks-saida: falha ao consultar fila: ${error.message}`,
    });
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  let entregues = 0;
  let falharam = 0;

  for (const op of pendentes ?? []) {
    const payload = (op.payload ?? {}) as Record<string, unknown>;
    const webhookSaidaId = typeof payload.webhook_saida_id === "string" ? payload.webhook_saida_id : null;

    if (!webhookSaidaId) {
      await admin.rpc("sistema_iniciar_processamento_operacao", { p_id: op.id });
      await admin.rpc("sistema_falhar_operacao", {
        p_id: op.id,
        p_erro: "payload sem webhook_saida_id",
        p_permanente: true,
      });
      falharam++;
      continue;
    }

    const { error: eIniciar } = await admin.rpc("sistema_iniciar_processamento_operacao", { p_id: op.id });
    if (eIniciar) {
      // já pendente há mais tempo do que deveria (ex.: concorrência entre
      // execuções do cron, ou reprocessamento manual em paralelo) — pula
      // pra próxima, a próxima execução tenta de novo.
      continue;
    }

    const { data: destino } = await admin
      .from("integracao_webhooks_saida")
      .select("url, secret, ativo")
      .eq("id", webhookSaidaId)
      .maybeSingle();

    if (!destino || !destino.ativo) {
      await admin.rpc("sistema_falhar_operacao", {
        p_id: op.id,
        p_erro: "destino de webhook de saída não encontrado ou inativo",
        p_permanente: true,
      });
      falharam++;
      continue;
    }

    const body = JSON.stringify({
      tipo: typeof payload.evento_tipo === "string" ? payload.evento_tipo : "evento",
      dados: payload.payload_original ?? null,
    });
    const resultado = await entregar(destino.url, destino.secret, body, op.id);

    if (resultado.ok) {
      await admin.rpc("sistema_concluir_operacao", {
        p_id: op.id,
        p_resultado: { entregue_em: new Date().toISOString() },
      });
      entregues++;
    } else {
      await admin.rpc("sistema_falhar_operacao", { p_id: op.id, p_erro: resultado.erro ?? "falha desconhecida" });
      falharam++;
    }
  }

  return Response.json({ ok: true, total: (pendentes ?? []).length, entregues, falharam });
}
