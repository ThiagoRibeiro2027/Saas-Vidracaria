"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertOrcamentoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  const obraId = String(formData.get("obra_id") ?? "") || null;
  const validade = String(formData.get("validade") ?? "") || null;
  const condicaoComercial = String(formData.get("condicao_comercial") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!pessoaId) throw new Error("Cliente é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_orcamento", {
    p_id: id,
    p_pessoa_id: pessoaId,
    p_obra_id: obraId,
    p_validade: validade,
    p_condicao_comercial: condicaoComercial,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function upsertOrcamentoItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const orcamentoId = String(formData.get("orcamento_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const quantidade = Number(formData.get("quantidade"));
  const precoUnitario = Number(formData.get("preco_unitario"));
  const custoUnitarioRaw = String(formData.get("custo_unitario") ?? "").trim();
  const custoUnitario = custoUnitarioRaw ? Number(custoUnitarioRaw) : null;

  if (!orcamentoId || !itemId || !Number.isFinite(quantidade) || !Number.isFinite(precoUnitario)) {
    throw new Error("Dados inválidos para item do orçamento.");
  }
  if (custoUnitario !== null && !Number.isFinite(custoUnitario)) {
    throw new Error("Custo unitário inválido.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_orcamento_item", {
    p_id: id,
    p_orcamento_id: orcamentoId,
    p_item_id: itemId,
    p_quantidade: quantidade,
    p_preco_unitario: precoUnitario,
    p_custo_unitario: custoUnitario,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function removeOrcamentoItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Item inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_orcamento_item", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function decidirOrcamentoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  if (!id || (decisao !== "aprovado" && decisao !== "rejeitado")) {
    throw new Error("Decisão inválida.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decidir_orcamento", { p_id: id, p_decisao: decisao });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function cancelarOrcamentoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Orçamento inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_orcamento", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function upsertOportunidadeAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  const origem = String(formData.get("origem") ?? "").trim() || null;
  const descricao = String(formData.get("descricao") ?? "").trim() || null;
  const valorPotencialRaw = String(formData.get("valor_potencial") ?? "").trim();
  const probabilidadeRaw = String(formData.get("probabilidade") ?? "").trim();
  const previsaoFechamento = String(formData.get("previsao_fechamento") ?? "") || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!pessoaId) throw new Error("Cliente/prospect é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_oportunidade", {
    p_id: id,
    p_pessoa_id: pessoaId,
    p_origem: origem,
    p_descricao: descricao,
    p_valor_potencial: valorPotencialRaw ? Number(valorPotencialRaw) : null,
    p_probabilidade: probabilidadeRaw ? Number(probabilidadeRaw) : null,
    p_previsao_fechamento: previsaoFechamento,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function mudarEstagioOportunidadeAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const estagio = String(formData.get("estagio") ?? "");
  const motivoPerda = String(formData.get("motivo_perda") ?? "") || null;
  if (!id || !estagio) throw new Error("Dados inválidos para mudança de estágio.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("mudar_estagio_oportunidade", {
    p_id: id,
    p_estagio: estagio,
    p_motivo_perda: motivoPerda,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function vincularOportunidadeOrcamentoAction(formData: FormData) {
  const orcamentoId = String(formData.get("orcamento_id") ?? "");
  const oportunidadeId = String(formData.get("oportunidade_id") ?? "");
  if (!orcamentoId || !oportunidadeId) throw new Error("Dados inválidos para vincular oportunidade.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("vincular_oportunidade_orcamento", {
    p_orcamento_id: orcamentoId,
    p_oportunidade_id: oportunidadeId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}
