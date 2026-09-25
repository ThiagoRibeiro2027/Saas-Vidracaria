"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarCotacaoDeSolicitacaoAction(formData: FormData) {
  const solicitacaoId = String(formData.get("solicitacao_compra_id") ?? "");
  if (!solicitacaoId) throw new Error("Solicitação é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_cotacao_de_solicitacao", {
    p_solicitacao_compra_id: solicitacaoId,
    p_item_ids: null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/cotacoes");
}

export async function registrarPropostaCotacaoAction(formData: FormData) {
  const cotacaoItemId = String(formData.get("cotacao_item_id") ?? "");
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  const precoUnitario = Number(formData.get("preco_unitario") ?? "");
  const desconto = Number(String(formData.get("desconto") ?? "0").trim() || "0");
  const impostos = Number(String(formData.get("impostos") ?? "0").trim() || "0");
  const frete = Number(String(formData.get("frete") ?? "0").trim() || "0");
  const prazoRaw = String(formData.get("prazo_entrega_dias") ?? "").trim();
  const condicaoPagamento = String(formData.get("condicao_pagamento") ?? "").trim() || null;
  const validade = String(formData.get("validade") ?? "").trim() || null;

  if (!cotacaoItemId || !pessoaId) throw new Error("Item de cotação e fornecedor são obrigatórios.");
  if (!Number.isFinite(precoUnitario) || precoUnitario < 0) throw new Error("Preço unitário inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_proposta_cotacao", {
    p_cotacao_item_id: cotacaoItemId,
    p_pessoa_id: pessoaId,
    p_preco_unitario: precoUnitario,
    p_desconto: desconto,
    p_impostos: impostos,
    p_frete: frete,
    p_prazo_entrega_dias: prazoRaw ? Number(prazoRaw) : null,
    p_condicao_pagamento: condicaoPagamento,
    p_validade: validade,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/cotacoes");
}

export async function registrarNegociacaoCotacaoAction(formData: FormData) {
  const propostaId = String(formData.get("cotacao_proposta_id") ?? "");
  const precoNovo = Number(formData.get("preco_novo") ?? "");
  const condicaoNova = String(formData.get("condicao_nova") ?? "").trim() || null;
  const observacao = String(formData.get("observacao") ?? "").trim() || null;

  if (!propostaId) throw new Error("Proposta é obrigatória.");
  if (!Number.isFinite(precoNovo) || precoNovo < 0) throw new Error("Preço novo inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_negociacao_cotacao", {
    p_cotacao_proposta_id: propostaId,
    p_preco_novo: precoNovo,
    p_condicao_nova: condicaoNova,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/cotacoes");
}

export async function selecionarFornecedorCotacaoAction(formData: FormData) {
  const cotacaoItemId = String(formData.get("cotacao_item_id") ?? "");
  const propostaId = String(formData.get("cotacao_proposta_id") ?? "");
  const quantidade = Number(formData.get("quantidade") ?? "");
  const justificativa = String(formData.get("justificativa") ?? "").trim();

  if (!cotacaoItemId || !propostaId) throw new Error("Item de cotação e proposta são obrigatórios.");
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");
  if (!justificativa) throw new Error("Justificativa é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("selecionar_fornecedor_cotacao", {
    p_cotacao_item_id: cotacaoItemId,
    p_cotacao_proposta_id: propostaId,
    p_quantidade: quantidade,
    p_justificativa: justificativa,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/cotacoes");
}

export async function concluirSelecaoCotacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Cotação inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("concluir_selecao_cotacao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/cotacoes");
}

export async function cancelarCotacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Cotação inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_cotacao", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/cotacoes");
}

export async function upsertAlcadaCompraAction(formData: FormData) {
  const processo = String(formData.get("processo") ?? "cotacao");
  const ordem = Number(formData.get("ordem") ?? "");
  const valorMinimo = Number(formData.get("valor_minimo") ?? "");
  const roleId = String(formData.get("role_id") ?? "");

  if (!roleId) throw new Error("Perfil aprovador é obrigatório.");
  if (!Number.isInteger(ordem) || ordem <= 0) throw new Error("Ordem inválida.");
  if (!Number.isFinite(valorMinimo) || valorMinimo < 0) throw new Error("Valor mínimo inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_alcada_compra", {
    p_processo: processo,
    p_ordem: ordem,
    p_valor_minimo: valorMinimo,
    p_role_id: roleId,
    p_ativo: true,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/cotacoes");
}

export async function desativarAlcadaCompraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Etapa de alçada inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_alcada_compra", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/cotacoes");
}

export async function decidirEtapaAprovacaoCompraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  const observacao = String(formData.get("observacao") ?? "").trim() || null;

  if (!id || !["aprovar", "rejeitar"].includes(decisao)) throw new Error("Decisão inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("decidir_etapa_aprovacao_compra", {
    p_etapa_id: id,
    p_decisao: decisao,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/compras/cotacoes");
}
