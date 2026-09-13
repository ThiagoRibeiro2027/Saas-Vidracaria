"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertPessoaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const tipoDocumento = String(formData.get("tipo_documento") ?? "") || null;
  const documento = String(formData.get("documento") ?? "").trim() || null;
  const nome = String(formData.get("nome") ?? "").trim();
  const nomeFantasia = String(formData.get("nome_fantasia") ?? "").trim() || null;
  const telefone = String(formData.get("telefone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const logradouro = String(formData.get("logradouro") ?? "").trim() || null;
  const cidade = String(formData.get("cidade") ?? "").trim() || null;
  const uf = String(formData.get("uf") ?? "").trim() || null;
  const cep = String(formData.get("cep") ?? "").trim() || null;
  const situacao = String(formData.get("situacao") ?? "ativo");

  if (!nome) throw new Error("Nome é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_pessoa", {
    p_id: id,
    p_tipo_documento: tipoDocumento,
    p_documento: documento,
    p_nome: nome,
    p_nome_fantasia: nomeFantasia,
    p_telefone: telefone,
    p_email: email,
    p_logradouro: logradouro,
    p_cidade: cidade,
    p_uf: uf,
    p_cep: cep,
    p_situacao: situacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/cadastros");
}

export async function setPessoaPapelAction(formData: FormData) {
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  const papel = String(formData.get("papel") ?? "");
  const ativo = formData.get("ativo") === "on";

  if (!pessoaId || (papel !== "CLIENTE" && papel !== "FORNECEDOR")) {
    throw new Error("Dados inválidos para papel de pessoa.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_pessoa_papel", {
    p_pessoa_id: pessoaId,
    p_papel: papel,
    p_ativo: ativo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/cadastros");
}

export async function upsertObraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const logradouro = String(formData.get("logradouro") ?? "").trim() || null;
  const cidade = String(formData.get("cidade") ?? "").trim() || null;
  const uf = String(formData.get("uf") ?? "").trim() || null;
  const cep = String(formData.get("cep") ?? "").trim() || null;
  const situacao = String(formData.get("situacao") ?? "ativo");

  if (!pessoaId || !nome) throw new Error("Cliente e nome da obra são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_obra", {
    p_id: id,
    p_pessoa_id: pessoaId,
    p_nome: nome,
    p_logradouro: logradouro,
    p_cidade: cidade,
    p_uf: uf,
    p_cep: cep,
    p_situacao: situacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/cadastros");
}

const ITEM_TIPOS = [
  "materia_prima",
  "insumo",
  "componente",
  "produto_intermediario",
  "produto_acabado",
  "material_auxiliar",
  "embalagem",
  "servico",
  "outro",
] as const;

export async function upsertItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const codigo = String(formData.get("codigo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  const classificacao = String(formData.get("classificacao") ?? "").trim() || null;
  const unidadePrincipal = String(formData.get("unidade_principal") ?? "").trim();
  const situacao = String(formData.get("situacao") ?? "ativo");

  if (
    !codigo ||
    !descricao ||
    !unidadePrincipal ||
    !ITEM_TIPOS.includes(tipo as (typeof ITEM_TIPOS)[number])
  ) {
    throw new Error("Código, descrição, tipo e unidade principal são obrigatórios.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_item", {
    p_id: id,
    p_codigo: codigo,
    p_descricao: descricao,
    p_tipo: tipo,
    p_classificacao: classificacao,
    p_unidade_principal: unidadePrincipal,
    p_situacao: situacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/cadastros");
}
