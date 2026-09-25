"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
