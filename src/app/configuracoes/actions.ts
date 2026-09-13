"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const RESTART_VALUES = ["nunca", "anual", "mensal"] as const;

export async function upsertNumberingSequenceAction(formData: FormData) {
  const documentType = String(formData.get("document_type") ?? "");
  const prefixo = String(formData.get("prefixo") ?? "");
  const sufixo = String(formData.get("sufixo") ?? "");
  const digitos = Number(formData.get("digitos") ?? 6);
  const incluirAno = formData.get("incluir_ano") === "on";
  const incluirMes = formData.get("incluir_mes") === "on";
  const reinicio = String(formData.get("reinicio") ?? "nunca");

  if (!documentType || !RESTART_VALUES.includes(reinicio as (typeof RESTART_VALUES)[number])) {
    throw new Error("Dados inválidos para configuração de numeração.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_numbering_sequence", {
    p_document_type: documentType,
    p_prefixo: prefixo,
    p_sufixo: sufixo,
    p_digitos: digitos,
    p_incluir_ano: incluirAno,
    p_incluir_mes: incluirMes,
    p_reinicio: reinicio,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
}

export async function upsertCuttingMarginAction(formData: FormData) {
  const materialTipo = String(formData.get("material_tipo") ?? "").trim();
  const processo = String(formData.get("processo") ?? "").trim();
  const percentual = Number(formData.get("percentual") ?? "");
  const ativo = formData.get("ativo") === "on";

  if (!materialTipo || Number.isNaN(percentual) || percentual < 0) {
    throw new Error("Dados inválidos para margem de quebra.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_cutting_margin", {
    p_material_tipo: materialTipo,
    p_processo: processo,
    p_percentual: percentual,
    p_ativo: ativo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
}

export async function upsertMeasurementRuleAction(formData: FormData) {
  const tipoItem = String(formData.get("tipo_item") ?? "").trim();
  const exigeMedicao = formData.get("exige_medicao_confirmada") === "on";
  const ativo = formData.get("ativo") === "on";

  if (!tipoItem) {
    throw new Error("Tipo de item é obrigatório.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_measurement_rule", {
    p_tipo_item: tipoItem,
    p_exige_medicao_confirmada: exigeMedicao,
    p_ativo: ativo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
}

export async function upsertApprovalThresholdAction(formData: FormData) {
  const processo = String(formData.get("processo") ?? "").trim();
  const valorMinimo = Number(formData.get("valor_minimo") ?? "");
  const roleId = String(formData.get("role_id") ?? "");
  const ativo = formData.get("ativo") === "on";

  if (!processo || Number.isNaN(valorMinimo) || valorMinimo < 0 || !roleId) {
    throw new Error("Dados inválidos para alçada de aprovação.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_approval_threshold", {
    p_processo: processo,
    p_valor_minimo: valorMinimo,
    p_role_id: roleId,
    p_ativo: ativo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
}
