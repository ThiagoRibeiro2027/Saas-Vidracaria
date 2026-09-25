import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/observability/log";

// TÓPICO 13 §14, Fase 3 — endpoint de entrada de webhooks de terceiros.
// Sem sessão de navegador (proxy.ts exclui api/webhooks/ do middleware de
// auth, igual a api/cron/): a origem é autenticada por assinatura HMAC, não
// por cookie. Todo o resto da checagem de tenant/permissão já aconteceu na
// migration (registrar_operacao_webhook roda como service_role e resolve o
// company_id a partir da própria integração, nunca de um parâmetro vindo
// daqui) — este handler só verifica que a requisição é legítima antes de
// repassar pra fila.
//
// Contrato exigido do remetente (documentado aqui porque não há tela de
// terceiro pra descrever): headers `X-Webhook-Id` (identificador único do
// evento, vira a chave de idempotência), `X-Webhook-Timestamp` (epoch em
// segundos) e `X-Webhook-Signature` (hex de
// HMAC-SHA256(secret, "<timestamp>.<corpo cru>")); corpo JSON com um campo
// `tipo` (string) identificando o tipo de evento.

const MAX_BODY_BYTES = 256 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const HEX64 = /^[0-9a-f]{64}$/i;

function tokenPrefix(token: string): string {
  // Nunca logar o token inteiro (é, junto com o segredo, o que autentica o
  // remetente) — só o suficiente pra correlacionar tentativas no log.
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

async function reject(
  admin: ReturnType<typeof createAdminClient>,
  status: number,
  error: string,
  token: string,
  extra?: Record<string, unknown>,
) {
  await logSystemEvent(admin, {
    category: "integration_failure",
    severity: "warning",
    message: `webhook rejeitado: ${error}`,
    context: { token_hash: tokenPrefix(token), ...extra },
  });
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  if (!token) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: webhook } = await admin
    .from("integracao_webhooks")
    .select("integracao_id, secret, ativo")
    .eq("token", token)
    .maybeSingle();

  if (!webhook || !webhook.ativo) {
    // Mesma resposta genérica pra token inexistente ou desativado — não dá
    // pra quem está tentando adivinhar diferenciar os dois casos.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return reject(admin, 413, "payload_too_large", token);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return reject(admin, 413, "payload_too_large", token);
  }

  const eventId = request.headers.get("x-webhook-id");
  const timestampHeader = request.headers.get("x-webhook-timestamp");
  const signatureHeader = request.headers.get("x-webhook-signature");

  if (!eventId || !timestampHeader || !signatureHeader) {
    return reject(admin, 400, "missing_headers", token);
  }
  if (!HEX64.test(signatureHeader)) {
    return reject(admin, 401, "invalid_signature", token);
  }

  const timestampSeconds = Number(timestampHeader);
  if (!Number.isFinite(timestampSeconds)) {
    return reject(admin, 400, "invalid_timestamp", token);
  }
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    // §14 "reutilização indevida": uma requisição capturada e reenviada
    // depois da janela de tolerância é rejeitada mesmo com assinatura
    // válida, porque o timestamp faz parte do material assinado abaixo.
    return reject(admin, 400, "stale_timestamp", token);
  }

  const expectedSignature = createHmac("sha256", webhook.secret)
    .update(`${timestampHeader}.${rawBody}`)
    .digest("hex");
  const signatureBuffer = Buffer.from(signatureHeader, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return reject(admin, 401, "invalid_signature", token);
  }

  let payload: unknown;
  try {
    payload = rawBody.length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    return reject(admin, 400, "invalid_json", token);
  }
  const tipo =
    payload && typeof payload === "object" && "tipo" in payload && typeof (payload as { tipo: unknown }).tipo === "string"
      ? (payload as { tipo: string }).tipo
      : null;
  if (!tipo) {
    return reject(admin, 400, "invalid_event", token);
  }

  const { data: operacaoId, error } = await admin.rpc("registrar_operacao_webhook", {
    p_integracao_id: webhook.integracao_id,
    p_tipo: tipo,
    p_payload: payload,
    p_chave_idempotencia: `webhook:${webhook.integracao_id}:${eventId}`,
  });

  if (error) {
    await logSystemEvent(admin, {
      category: "integration_failure",
      severity: "error",
      message: `webhook: falha ao registrar operação: ${error.message}`,
      context: { token_hash: tokenPrefix(token), integracao_id: webhook.integracao_id },
    });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, operacao_id: operacaoId }, { status: 202 });
}
