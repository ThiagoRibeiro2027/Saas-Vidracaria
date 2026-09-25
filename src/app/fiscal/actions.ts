"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function registrarDocumentoFiscalAction(formData: FormData) {
  const tipo = String(formData.get("tipo") ?? "");
  const numero = String(formData.get("numero") ?? "").trim() || null;
  const chaveAcesso = String(formData.get("chave_acesso") ?? "").trim() || null;
  const entityType = String(formData.get("entity_type") ?? "").trim() || null;
  const entityId = String(formData.get("entity_id") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!tipo) throw new Error("Tipo do documento é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_documento_fiscal", {
    p_tipo: tipo,
    p_numero: numero,
    p_chave_acesso: chaveAcesso,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_dados: null,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/fiscal");
}

export async function vincularDocumentoFiscalAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const entityType = String(formData.get("entity_type") ?? "").trim();
  const entityId = String(formData.get("entity_id") ?? "").trim();
  if (!id || !entityType || !entityId) throw new Error("Documento, tipo e id da operação são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("vincular_documento_fiscal", {
    p_id: id,
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/fiscal");
}

export async function cancelarDocumentoFiscalAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Documento inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_documento_fiscal", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/fiscal");
}

export async function registrarTentativaProcessamentoAction(formData: FormData) {
  const documentoId = String(formData.get("documento_id") ?? "");
  const resultado = String(formData.get("resultado") ?? "");
  const mensagemRetorno = String(formData.get("mensagem_retorno") ?? "").trim() || null;
  const provedor = String(formData.get("provedor") ?? "").trim() || null;
  if (!documentoId || !resultado) throw new Error("Documento e resultado são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_tentativa_processamento_fiscal", {
    p_documento_id: documentoId,
    p_resultado: resultado,
    p_mensagem_retorno: mensagemRetorno,
    p_provedor: provedor,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/fiscal");
}

export async function reprocessarDocumentoFiscalAction(formData: FormData) {
  const documentoId = String(formData.get("documento_id") ?? "");
  if (!documentoId) throw new Error("Documento inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reprocessar_documento_fiscal", { p_documento_id: documentoId });
  if (error) throw new Error(error.message);

  revalidatePath("/fiscal");
}

export async function iniciarConferenciaDocumentoFiscalAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Documento inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("iniciar_conferencia_documento_fiscal", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/fiscal");
}

export async function avaliarDocumentoFiscalAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Documento inválido.");
  if (!decisao) throw new Error("Decisão é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("avaliar_documento_fiscal", { p_id: id, p_decisao: decisao, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/fiscal");
}

export async function reavaliarDocumentoFiscalAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Documento inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reavaliar_documento_fiscal", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/fiscal");
}
