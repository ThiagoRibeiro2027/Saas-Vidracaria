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

export async function upsertCertificacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const funcionarioId = String(formData.get("funcionario_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const dataConclusao = String(formData.get("data_conclusao") ?? "").trim() || null;
  const dataValidade = String(formData.get("data_validade") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  if (!funcionarioId || !nome) throw new Error("Funcionário e nome são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_funcionario_certificacao", {
    p_id: id,
    p_funcionario_id: funcionarioId,
    p_tipo: tipo,
    p_nome: nome,
    p_data_conclusao: dataConclusao,
    p_data_validade: dataValidade,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/rh");
}

export async function removerCertificacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Registro inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_funcionario_certificacao", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/rh");
}

export async function upsertEpiAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const funcionarioId = String(formData.get("funcionario_id") ?? "");
  const tipoEpi = String(formData.get("tipo_epi") ?? "").trim();
  const ca = String(formData.get("ca") ?? "").trim() || null;
  const dataEntrega = String(formData.get("data_entrega") ?? "").trim() || null;
  const dataValidade = String(formData.get("data_validade") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  if (!funcionarioId || !tipoEpi) throw new Error("Funcionário e tipo de EPI são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_funcionario_epi", {
    p_id: id,
    p_funcionario_id: funcionarioId,
    p_tipo_epi: tipoEpi,
    p_data_entrega: dataEntrega,
    p_ca: ca,
    p_data_validade: dataValidade,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/rh");
}

export async function removerEpiAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Registro inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_funcionario_epi", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/rh");
}

export async function upsertHabilitacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const funcionarioId = String(formData.get("funcionario_id") ?? "");
  const recursoProdutivoId = String(formData.get("recurso_produtivo_id") ?? "");
  const dataObtencao = String(formData.get("data_obtencao") ?? "").trim() || null;
  const dataValidade = String(formData.get("data_validade") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  if (!funcionarioId || !recursoProdutivoId) throw new Error("Funcionário e recurso são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_funcionario_habilitacao", {
    p_id: id,
    p_funcionario_id: funcionarioId,
    p_recurso_produtivo_id: recursoProdutivoId,
    p_data_obtencao: dataObtencao,
    p_data_validade: dataValidade,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/rh");
}

export async function removerHabilitacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Registro inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_funcionario_habilitacao", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/rh");
}

export async function upsertAfastamentoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const funcionarioId = String(formData.get("funcionario_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const dataInicio = String(formData.get("data_inicio") ?? "").trim() || null;
  const dataFim = String(formData.get("data_fim") ?? "").trim() || null;
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  if (!funcionarioId) throw new Error("Funcionário é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_funcionario_afastamento", {
    p_id: id,
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

export async function removerAfastamentoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Registro inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_funcionario_afastamento", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/rh");
}
