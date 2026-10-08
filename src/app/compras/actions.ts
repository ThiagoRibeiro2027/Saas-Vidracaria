"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertFornecedorDadosAction(formData: FormData) {
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  if (!pessoaId) throw new Error("Fornecedor inválido.");

  const prazoRaw = String(formData.get("prazo_pagamento_dias") ?? "").trim();
  const leadTimeRaw = String(formData.get("lead_time_dias") ?? "").trim();
  const banco = String(formData.get("banco") ?? "").trim() || null;
  const agencia = String(formData.get("agencia") ?? "").trim() || null;
  const conta = String(formData.get("conta") ?? "").trim() || null;
  const tipoConta = String(formData.get("tipo_conta") ?? "").trim() || null;
  const chavePix = String(formData.get("chave_pix") ?? "").trim() || null;
  const condicoesPadrao = String(formData.get("condicoes_padrao") ?? "").trim() || null;
  const homologado = formData.get("homologado") === "on";

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_fornecedor_dados", {
    p_pessoa_id: pessoaId,
    p_prazo_pagamento_dias: prazoRaw ? Number(prazoRaw) : null,
    p_lead_time_dias: leadTimeRaw ? Number(leadTimeRaw) : null,
    p_banco: banco,
    p_agencia: agencia,
    p_conta: conta,
    p_tipo_conta: tipoConta,
    p_chave_pix: chavePix,
    p_condicoes_padrao: condicoesPadrao,
    p_homologado: homologado,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras");
}

export async function upsertItemFornecedorAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  if (!itemId || !pessoaId) throw new Error("Item e fornecedor são obrigatórios.");

  const prioridadeRaw = String(formData.get("prioridade") ?? "").trim();
  const precoRaw = String(formData.get("preco_referencia") ?? "").trim();
  const homologado = formData.get("homologado") === "on";
  const condicoes = String(formData.get("condicoes") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_item_fornecedor", {
    p_item_id: itemId,
    p_pessoa_id: pessoaId,
    p_prioridade: prioridadeRaw ? Number(prioridadeRaw) : 100,
    p_homologado: homologado,
    p_preco_referencia: precoRaw ? Number(precoRaw) : null,
    p_condicoes: condicoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras");
}

export async function definirFornecedorPrincipalAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  if (!itemId || !pessoaId) throw new Error("Item e fornecedor são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_fornecedor_principal", {
    p_item_id: itemId,
    p_pessoa_id: pessoaId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras");
}

export async function upsertItemMaterialAlternativoAction(formData: FormData) {
  const itemOrigemId = String(formData.get("item_origem_id") ?? "");
  const itemEquivalenteId = String(formData.get("item_equivalente_id") ?? "");
  if (!itemOrigemId || !itemEquivalenteId) throw new Error("Item de origem e item equivalente são obrigatórios.");

  const exigeAprovacao = formData.get("exige_aprovacao") === "on";
  const regraSubstituicao = String(formData.get("regra_substituicao") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_item_material_alternativo", {
    p_item_origem_id: itemOrigemId,
    p_item_equivalente_id: itemEquivalenteId,
    p_exige_aprovacao: exigeAprovacao,
    p_regra_substituicao: regraSubstituicao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras");
}

export async function desativarItemMaterialAlternativoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Material alternativo inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_item_material_alternativo", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/compras");
}

export async function upsertPoliticaAbastecimentoAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!itemId) throw new Error("Item é obrigatório.");

  const tipo = String(formData.get("tipo") ?? "sob_demanda");
  const num = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    return raw ? Number(raw) : null;
  };
  const fornecedorPreferencialId = String(formData.get("fornecedor_preferencial_id") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_politica_abastecimento", {
    p_item_id: itemId,
    p_tipo: tipo,
    p_estoque_minimo: num("estoque_minimo"),
    p_estoque_seguranca: num("estoque_seguranca"),
    p_ponto_reposicao: num("ponto_reposicao"),
    p_lote_minimo: num("lote_minimo"),
    p_lote_economico: num("lote_economico"),
    p_multiplo: num("multiplo"),
    p_fornecedor_preferencial_id: fornecedorPreferencialId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras");
}

// =========================================================================
// Fornecedor (pessoa com papel FORNECEDOR) — 2026-10-04: até então só
// existia uma tela (/cadastros) pra criar qualquer pessoa; cliente passou a
// ser cadastrado em Comercial (ver src/app/comercial/actions.ts) e
// fornecedor aqui, sua contraparte natural de uso. Mesma tabela `pessoas`
// por trás, reaproveitando RPCs já existentes (upsert_pessoa,
// set_pessoa_papel) — nenhuma função SQL nova.
// =========================================================================

export type PessoaState = { error: string } | undefined;

// Composta: cria a pessoa e já liga o papel FORNECEDOR num único submit.
export async function criarFornecedorAction(
  _prevState: PessoaState,
  formData: FormData,
): Promise<PessoaState> {
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Nome é obrigatório." };

  const supabase = await createClient();
  const { data: pessoaId, error: erroPessoa } = await supabase.rpc("upsert_pessoa", {
    p_id: null,
    p_tipo_documento: String(formData.get("tipo_documento") ?? "") || null,
    p_documento: String(formData.get("documento") ?? "").trim() || null,
    p_nome: nome,
    p_nome_fantasia: String(formData.get("nome_fantasia") ?? "").trim() || null,
    p_telefone: String(formData.get("telefone") ?? "").trim() || null,
    p_email: String(formData.get("email") ?? "").trim() || null,
    p_logradouro: String(formData.get("logradouro") ?? "").trim() || null,
    p_cidade: String(formData.get("cidade") ?? "").trim() || null,
    p_uf: String(formData.get("uf") ?? "").trim() || null,
    p_cep: String(formData.get("cep") ?? "").trim() || null,
    p_situacao: "ativo",
  });
  if (erroPessoa) {
    if (erroPessoa.code === "23505") {
      return { error: "Já existe uma pessoa cadastrada com esse documento (CPF/CNPJ)." };
    }
    return { error: erroPessoa.message };
  }

  const { error: erroPapel } = await supabase.rpc("set_pessoa_papel", {
    p_pessoa_id: pessoaId,
    p_papel: "FORNECEDOR",
    p_ativo: true,
  });
  if (erroPapel) return { error: erroPapel.message };

  revalidatePath("/compras");
}

// Corrige a identidade (nome/documento/contato/endereço) de um fornecedor
// já existente — reaproveita upsert_pessoa, sem tocar no papel.
export async function atualizarIdentidadeFornecedorAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!id || !nome) throw new Error("Pessoa e nome são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_pessoa", {
    p_id: id,
    p_tipo_documento: String(formData.get("tipo_documento") ?? "") || null,
    p_documento: String(formData.get("documento") ?? "").trim() || null,
    p_nome: nome,
    p_nome_fantasia: String(formData.get("nome_fantasia") ?? "").trim() || null,
    p_telefone: String(formData.get("telefone") ?? "").trim() || null,
    p_email: String(formData.get("email") ?? "").trim() || null,
    p_logradouro: String(formData.get("logradouro") ?? "").trim() || null,
    p_cidade: String(formData.get("cidade") ?? "").trim() || null,
    p_uf: String(formData.get("uf") ?? "").trim() || null,
    p_cep: String(formData.get("cep") ?? "").trim() || null,
    p_situacao: "ativo",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras");
}
