import "server-only";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/observability/log";

// TÓPICO 18 §7, alerta de vencimento de vigência/garantia (ADR-002,
// decisão de 26/09/2026 — 30 dias de antecedência). Rodado 1x/dia via
// Vercel Cron (vercel.json) — mesma limitação de plano Hobby já aceita
// pros outros crons (RUNBOOK-GOVERNANCA-DE-SEGURANCA.md §3).
//
// Varredura por DATA, não por evento — diferente dos outros crons deste
// projeto (fila técnica, e-mail pendente), que varrem por estado. O
// client admin bypassa RLS de propósito só pra achar QUAIS contratos
// entram na janela dos próximos 30 dias, cross-tenant; a notificação em
// si é gerada dentro da empresa certa por sistema_notificar_vencimento_
// contrato() (service_role only), nunca por este handler diretamente.
export const dynamic = "force-dynamic";

const DIAS_ANTECEDENCIA = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(hoje.getDate() + DIAS_ANTECEDENCIA);
  const hojeStr = hoje.toISOString().slice(0, 10);
  const limiteStr = limite.toISOString().slice(0, 10);

  let notificados = 0;
  let falharam = 0;

  const { data: vigenciaVencendo, error: eVigencia } = await admin
    .from("contratos")
    .select("id")
    .eq("status", "vigente")
    .is("alerta_vigencia_enviado_em", null)
    .not("data_fim", "is", null)
    .gte("data_fim", hojeStr)
    .lte("data_fim", limiteStr);

  if (eVigencia) {
    console.error("[contratos-vencimento] falha ao consultar vigência:", eVigencia.message);
    await logSystemEvent(admin, {
      category: "job_failure",
      severity: "error",
      message: `contratos-vencimento: falha ao consultar vigência: ${eVigencia.message}`,
    });
  }

  for (const contrato of vigenciaVencendo ?? []) {
    const { error } = await admin.rpc("sistema_notificar_vencimento_contrato", {
      p_contrato_id: contrato.id,
      p_tipo: "vigencia",
    });
    if (error) {
      falharam++;
      await logSystemEvent(admin, {
        category: "job_failure",
        severity: "error",
        message: `contratos-vencimento: falha ao notificar vigência do contrato ${contrato.id}: ${error.message}`,
        context: { contrato_id: contrato.id, tipo: "vigencia" },
      });
    } else {
      notificados++;
    }
  }

  const { data: garantiaVencendo, error: eGarantia } = await admin
    .from("contratos")
    .select("id")
    .eq("status", "vigente")
    .is("alerta_garantia_enviado_em", null)
    .not("garantia_fim", "is", null)
    .gte("garantia_fim", hojeStr)
    .lte("garantia_fim", limiteStr);

  if (eGarantia) {
    console.error("[contratos-vencimento] falha ao consultar garantia:", eGarantia.message);
    await logSystemEvent(admin, {
      category: "job_failure",
      severity: "error",
      message: `contratos-vencimento: falha ao consultar garantia: ${eGarantia.message}`,
    });
  }

  for (const contrato of garantiaVencendo ?? []) {
    const { error } = await admin.rpc("sistema_notificar_vencimento_contrato", {
      p_contrato_id: contrato.id,
      p_tipo: "garantia",
    });
    if (error) {
      falharam++;
      await logSystemEvent(admin, {
        category: "job_failure",
        severity: "error",
        message: `contratos-vencimento: falha ao notificar garantia do contrato ${contrato.id}: ${error.message}`,
        context: { contrato_id: contrato.id, tipo: "garantia" },
      });
    } else {
      notificados++;
    }
  }

  if (falharam > 0) {
    await logSystemEvent(admin, {
      category: "job_failure",
      severity: "error",
      message: `contratos-vencimento: ${falharam} contrato(s) falharam ao notificar.`,
    });
  }

  return Response.json({ ok: true, notificados, falharam });
}
