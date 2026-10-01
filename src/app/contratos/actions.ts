"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { uploadCompanyFiles } from "@/lib/storage/upload";

const ANEXO_ENTITY_TYPE = "contrato";

export async function upsertContratoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const tipo = String(formData.get("tipo") ?? "");
  const pessoaId = String(formData.get("pessoa_id") ?? "").trim() || null;
  const obraId = String(formData.get("obra_id") ?? "").trim() || null;
  const pedidoId = String(formData.get("pedido_id") ?? "").trim() || null;
  const funcionarioId = String(formData.get("funcionario_id") ?? "").trim() || null;
  const objeto = String(formData.get("objeto") ?? "").trim();
  const dataInicio = String(formData.get("data_inicio") ?? "").trim() || null;
  const dataFim = String(formData.get("data_fim") ?? "").trim() || null;
  const renovacao = String(formData.get("renovacao") ?? "manual");
  const valorRaw = String(formData.get("valor") ?? "").trim();
  const valor = valorRaw ? Number(valorRaw) : null;
  if (valor !== null && !Number.isFinite(valor)) throw new Error("Valor inválido.");
  const formaPagamento = String(formData.get("forma_pagamento") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  const garantiaInicio = String(formData.get("garantia_inicio") ?? "").trim() || null;
  const garantiaFim = String(formData.get("garantia_fim") ?? "").trim() || null;
  const parcelasRaw = String(formData.get("parcelas") ?? "").trim();
  const parcelas = parcelasRaw ? Number(parcelasRaw) : null;
  if (parcelas !== null && !Number.isFinite(parcelas)) throw new Error("Número de parcelas inválido.");
  const reajustePrevisto = String(formData.get("reajuste_previsto") ?? "").trim() || null;
  const assinaturaReferenciaExterna = String(formData.get("assinatura_referencia_externa") ?? "").trim() || null;

  if (!tipo) throw new Error("Tipo de contrato é obrigatório.");
  if (!objeto) throw new Error("Objeto do contrato é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_contrato", {
    p_id: id,
    p_tipo: tipo,
    p_pessoa_id: pessoaId,
    p_obra_id: obraId,
    p_pedido_id: pedidoId,
    p_funcionario_id: funcionarioId,
    p_objeto: objeto,
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
    p_renovacao: renovacao,
    p_valor: valor,
    p_forma_pagamento: formaPagamento,
    p_observacoes: observacoes,
    p_garantia_inicio: garantiaInicio,
    p_garantia_fim: garantiaFim,
    p_parcelas: parcelas,
    p_reajuste_previsto: reajustePrevisto,
    p_assinatura_referencia_externa: assinaturaReferenciaExterna,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
}

// §8 — anexo de documento do contrato (PDF assinado, etc.), reaproveitando a
// infraestrutura genérica de files/register_file() já usada por /files —
// register_file() exige contratos.manage pra entity_type='contrato' (não só
// o files.upload genérico), mesmo padrão já usado pra documento de RH.
export async function uploadContratoAnexoAction(
  formData: FormData,
): Promise<{ name: string; ok: true; fileId: string } | { name: string; ok: false; error: string }> {
  const contratoId = String(formData.get("contrato_id") ?? "");
  const file = formData.get("file");
  if (!contratoId) return { name: "arquivo", ok: false, error: "Contrato inválido." };
  if (!(file instanceof File) || file.size === 0) {
    return { name: "arquivo", ok: false, error: "Nenhum arquivo enviado." };
  }

  try {
    const [result] = await uploadCompanyFiles([file], ANEXO_ENTITY_TYPE, contratoId);
    revalidatePath("/contratos");
    return result;
  } catch (err) {
    return {
      name: file.name,
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao enviar arquivo.",
    };
  }
}

export async function deleteContratoAnexoAction(fileId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_file", { p_file_id: fileId });
  if (error) throw new Error(error.message);
  revalidatePath("/contratos");
}

export async function getContratoAnexoSignedUrlAction(fileId: string): Promise<string> {
  const supabase = await createClient();
  const { data: file, error } = await supabase
    .from("files")
    .select("bucket_id, storage_path")
    .eq("id", fileId)
    .is("deleted_at", null)
    .single();
  if (error || !file) throw new Error("Arquivo não encontrado.");

  const { data: signed, error: signError } = await supabase.storage
    .from(file.bucket_id)
    .createSignedUrl(file.storage_path, 60);
  if (signError || !signed) throw new Error("Não foi possível gerar o link de download.");

  return signed.signedUrl;
}

export async function enviarContratoParaAprovacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Contrato inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("enviar_contrato_para_aprovacao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
}

export async function aprovarContratoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Contrato inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("aprovar_contrato", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
}

export async function reprovarContratoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Contrato inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reprovar_contrato", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
}

export async function suspenderContratoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Contrato inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("suspender_contrato", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
}

export async function retomarContratoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Contrato inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("retomar_contrato", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
}

export async function cancelarContratoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Contrato inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_contrato", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
}

export async function encerrarContratoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Contrato inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("encerrar_contrato", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
}

export async function gerarTitulosContratoAction(formData: FormData) {
  const contratoId = String(formData.get("contrato_id") ?? "");
  const valores = formData.getAll("parcela_valor").map((v) => Number(v));
  const vencimentos = formData.getAll("parcela_vencimento").map((v) => String(v));
  const condicoes = formData.getAll("parcela_condicao").map((v) => String(v).trim() || null);

  if (!contratoId || valores.length === 0 || valores.length !== vencimentos.length) {
    throw new Error("Contrato e ao menos uma parcela (valor + vencimento) são obrigatórios.");
  }

  const parcelas = valores.map((valor, i) => ({
    valor,
    vencimento: vencimentos[i],
    condicao_pagamento: condicoes[i],
  }));

  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_titulos_contrato", {
    p_contrato_id: contratoId,
    p_parcelas: parcelas,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
  revalidatePath("/financeiro");
}
