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
