"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { uploadCompanyFiles } from "@/lib/storage/upload";

const ANEXO_ENTITY_TYPE = "funcionario_documento";

export async function upsertFuncionarioAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const nome = String(formData.get("nome") ?? "").trim();
  const cargo = String(formData.get("cargo") ?? "").trim() || null;
  const funcao = String(formData.get("funcao") ?? "").trim() || null;
  const unidadeId = String(formData.get("unidade_id") ?? "").trim() || null;
  const dataAdmissao = String(formData.get("data_admissao") ?? "").trim() || null;
  const telefone = String(formData.get("telefone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const profileId = String(formData.get("profile_id") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "ativo");
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!nome) throw new Error("Nome é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_funcionario", {
    p_id: id,
    p_nome: nome,
    p_cargo: cargo,
    p_funcao: funcao,
    p_unidade_id: unidadeId,
    p_data_admissao: dataAdmissao,
    p_telefone: telefone,
    p_email: email,
    p_profile_id: profileId,
    p_status: status,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/rh");
}

export async function desligarFuncionarioAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const dataDesligamento = String(formData.get("data_desligamento") ?? "").trim() || null;
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Funcionário inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desligar_funcionario", {
    p_id: id,
    p_data_desligamento: dataDesligamento,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/rh");
}

export async function registrarDocumentoFuncionarioAction(formData: FormData) {
  const funcionarioId = String(formData.get("funcionario_id") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const dataReferencia = String(formData.get("data_referencia") ?? "").trim() || null;
  const validade = String(formData.get("validade") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  const recursoProdutivoId = String(formData.get("recurso_produtivo_id") ?? "").trim() || null;

  if (!funcionarioId) throw new Error("Funcionário é obrigatório.");
  if (!tipo) throw new Error("Tipo de documento é obrigatório.");
  if (!nome) throw new Error("Nome do documento é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_documento_funcionario", {
    p_funcionario_id: funcionarioId,
    p_tipo: tipo,
    p_nome: nome,
    p_data_referencia: dataReferencia,
    p_validade: validade,
    p_observacoes: observacoes,
    p_recurso_produtivo_id: recursoProdutivoId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/rh");
}

export async function cancelarDocumentoFuncionarioAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Documento inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_documento_funcionario", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/rh");
}

export async function registrarAfastamentoAction(formData: FormData) {
  const funcionarioId = String(formData.get("funcionario_id") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  const dataInicio = String(formData.get("data_inicio") ?? "").trim() || null;
  const dataFim = String(formData.get("data_fim") ?? "").trim() || null;
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!funcionarioId) throw new Error("Funcionário é obrigatório.");
  if (!tipo) throw new Error("Tipo de período é obrigatório.");
  if (!dataInicio) throw new Error("Data de início é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_afastamento", {
    p_funcionario_id: funcionarioId,
    p_tipo: tipo,
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
    p_motivo: motivo,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/rh");
}

export async function encerrarAfastamentoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const dataFim = String(formData.get("data_fim") ?? "").trim() || null;
  if (!id) throw new Error("Período inválido.");
  if (!dataFim) throw new Error("Data de fim é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("encerrar_afastamento", { p_id: id, p_data_fim: dataFim });
  if (error) throw new Error(error.message);

  revalidatePath("/rh");
}

export async function cancelarAfastamentoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Período inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_afastamento", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/rh");
}

// §6 — anexo do documento do colaborador (PDF do certificado, comprovante de
// entrega de EPI), reaproveitando a infraestrutura genérica de
// files/register_file(). register_file() exige rh.manage pra
// entity_type='funcionario_documento' (não só o files.upload genérico) — a
// checagem real é sempre no banco; aqui só confirmamos, pelo RLS (rh.view),
// que o documento existe nesta empresa e ainda está ativo.
export async function uploadDocumentoFuncionarioAnexoAction(
  formData: FormData,
): Promise<{ name: string; ok: true; fileId: string } | { name: string; ok: false; error: string }> {
  const documentoId = String(formData.get("documento_id") ?? "");
  const file = formData.get("file");
  if (!documentoId) return { name: "arquivo", ok: false, error: "Documento inválido." };
  if (!(file instanceof File) || file.size === 0) {
    return { name: "arquivo", ok: false, error: "Nenhum arquivo enviado." };
  }

  try {
    const supabase = await createClient();
    const { data: documento } = await supabase
      .from("funcionario_documentos")
      .select("status")
      .eq("id", documentoId)
      .maybeSingle();
    if (!documento) return { name: file.name, ok: false, error: "Documento não encontrado." };
    if (documento.status !== "ativo") {
      return { name: file.name, ok: false, error: "Documento cancelado não aceita anexo." };
    }

    const [result] = await uploadCompanyFiles([file], ANEXO_ENTITY_TYPE, documentoId);
    revalidatePath("/rh");
    return result;
  } catch (err) {
    return {
      name: file.name,
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao enviar arquivo.",
    };
  }
}

export async function deleteDocumentoFuncionarioAnexoAction(fileId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_file", { p_file_id: fileId });
  if (error) throw new Error(error.message);
  revalidatePath("/rh");
}

export async function getDocumentoFuncionarioAnexoSignedUrlAction(fileId: string): Promise<string> {
  const supabase = await createClient();
  const { data: file, error } = await supabase
    .from("files")
    .select("bucket_id, storage_path")
    .eq("id", fileId)
    .eq("entity_type", ANEXO_ENTITY_TYPE)
    .is("deleted_at", null)
    .single();
  if (error || !file) throw new Error("Arquivo não encontrado.");

  const { data: signed, error: signError } = await supabase.storage
    .from(file.bucket_id)
    .createSignedUrl(file.storage_path, 60);
  if (signError || !signed) throw new Error("Não foi possível gerar o link de download.");

  return signed.signedUrl;
}
