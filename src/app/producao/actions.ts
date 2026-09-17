"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function liberarEngenhariaAction(formData: FormData) {
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  if (!pedidoItemId) throw new Error("Item de pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("liberar_engenharia", {
    p_pedido_item_id: pedidoItemId,
    p_observacoes: null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function criarOrdemProducaoAction(formData: FormData) {
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  const quantidadeRaw = String(formData.get("quantidade") ?? "").trim();
  // TÓPICO 4 §12 (Fase 3): checkbox desmarcado = OP nasce sem nenhum lote
  // liberado, precisa de liberar_lote_producao() antes de apontar.
  const liberarIntegralmente = formData.get("liberar_integralmente") !== null;
  if (!pedidoItemId) throw new Error("Item de pedido inválido.");
  if (quantidadeRaw && (!Number.isFinite(Number(quantidadeRaw)) || Number(quantidadeRaw) <= 0)) {
    throw new Error("Quantidade deve ser um número maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_ordem_producao", {
    p_pedido_item_id: pedidoItemId,
    p_quantidade: quantidadeRaw ? Number(quantidadeRaw) : null,
    p_liberar_integralmente: liberarIntegralmente,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function liberarLoteProducaoAction(formData: FormData) {
  const ordemId = String(formData.get("ordem_producao_id") ?? "");
  const quantidadeRaw = String(formData.get("quantidade") ?? "").trim();
  if (!ordemId) throw new Error("Ordem de produção inválida.");
  const quantidade = Number(quantidadeRaw);
  if (!quantidadeRaw || !Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("Quantidade deve ser um número maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("liberar_lote_producao", {
    p_ordem_producao_id: ordemId,
    p_quantidade: quantidade,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function apontarProducaoAction(formData: FormData) {
  const opLoteOperacaoId = String(formData.get("op_lote_operacao_id") ?? "");
  const produzida = Number(formData.get("quantidade_produzida") || 0);
  const rejeitada = Number(formData.get("quantidade_rejeitada") || 0);
  const retrabalho = Number(formData.get("quantidade_retrabalho") || 0);
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!opLoteOperacaoId) throw new Error("Operação inválida.");
  if (
    !Number.isFinite(produzida) || !Number.isFinite(rejeitada) || !Number.isFinite(retrabalho) ||
    produzida < 0 || rejeitada < 0 || retrabalho < 0
  ) {
    throw new Error("Quantidades devem ser números válidos e não negativos.");
  }
  if (produzida === 0 && rejeitada === 0 && retrabalho === 0) {
    throw new Error("Informe ao menos uma quantidade (produzida, rejeitada ou retrabalho) maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("apontar_producao", {
    p_op_lote_operacao_id: opLoteOperacaoId,
    p_quantidade_produzida: produzida,
    p_quantidade_rejeitada: rejeitada,
    p_quantidade_retrabalho: retrabalho,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function concluirOrdemProducaoAction(formData: FormData) {
  const ordemId = String(formData.get("ordem_producao_id") ?? "");
  if (!ordemId) throw new Error("Ordem de produção inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("concluir_ordem_producao", { p_ordem_producao_id: ordemId });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function criarRoteiroProdutivoAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!itemId) throw new Error("Item inválido.");
  if (!nome) throw new Error("Nome do roteiro é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_roteiro_produtivo", { p_item_id: itemId, p_nome: nome });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function adicionarOperacaoRoteiroAction(formData: FormData) {
  const roteiroId = String(formData.get("roteiro_id") ?? "");
  const sequenciaRaw = String(formData.get("sequencia") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const recursoProdutivoId = String(formData.get("recurso_produtivo_id") ?? "").trim() || null;
  const tempoPrevistoRaw = String(formData.get("tempo_previsto_minutos") ?? "").trim();
  const requisitos = String(formData.get("requisitos") ?? "").trim() || null;
  const criteriosQualidade = String(formData.get("criterios_qualidade") ?? "").trim() || null;
  const equipamentosAlternativos = String(formData.get("equipamentos_alternativos") ?? "").trim() || null;

  if (!roteiroId) throw new Error("Roteiro inválido.");
  const sequencia = Number(sequenciaRaw);
  if (!Number.isFinite(sequencia) || sequencia <= 0) {
    throw new Error("Sequência deve ser um número maior que zero.");
  }
  if (!descricao) throw new Error("Descrição da operação é obrigatória.");
  const tempoPrevisto = tempoPrevistoRaw ? Number(tempoPrevistoRaw) : null;
  if (tempoPrevisto !== null && (!Number.isFinite(tempoPrevisto) || tempoPrevisto <= 0)) {
    throw new Error("Tempo previsto deve ser um número maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("adicionar_operacao_roteiro", {
    p_roteiro_id: roteiroId,
    p_sequencia: sequencia,
    p_descricao: descricao,
    p_recurso_produtivo_id: recursoProdutivoId,
    p_tempo_previsto_minutos: tempoPrevisto,
    p_requisitos: requisitos,
    p_criterios_qualidade: criteriosQualidade,
    p_equipamentos_alternativos: equipamentosAlternativos,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function removerOperacaoRoteiroAction(formData: FormData) {
  const roteiroOperacaoId = String(formData.get("roteiro_operacao_id") ?? "");
  if (!roteiroOperacaoId) throw new Error("Operação inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_operacao_roteiro", {
    p_roteiro_operacao_id: roteiroOperacaoId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function desativarRoteiroAction(formData: FormData) {
  const roteiroId = String(formData.get("roteiro_id") ?? "");
  if (!roteiroId) throw new Error("Roteiro inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_roteiro", { p_roteiro_id: roteiroId });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function criarRecursoProdutivoAction(formData: FormData) {
  const codigo = String(formData.get("codigo") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "").trim();
  const setor = String(formData.get("setor") ?? "").trim() || null;
  const capacidadeRaw = String(formData.get("capacidade_horas_dia") ?? "").trim();
  if (!codigo) throw new Error("Código do recurso é obrigatório.");
  if (!nome) throw new Error("Nome do recurso é obrigatório.");
  if (!tipo) throw new Error("Tipo do recurso é obrigatório.");
  const capacidade = capacidadeRaw ? Number(capacidadeRaw) : null;
  if (capacidade !== null && (!Number.isFinite(capacidade) || capacidade <= 0)) {
    throw new Error("Capacidade (horas/dia) deve ser um número maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_recurso_produtivo", {
    p_codigo: codigo,
    p_nome: nome,
    p_tipo: tipo,
    p_setor: setor,
    p_capacidade_horas_dia: capacidade,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function atualizarSituacaoRecursoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const situacao = String(formData.get("situacao") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!id) throw new Error("Recurso inválido.");
  if (!situacao) throw new Error("Situação é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_situacao_recurso", {
    p_id: id,
    p_situacao: situacao,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function desativarRecursoProdutivoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Recurso inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_recurso_produtivo", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function criarLoteFabrilAction(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  const criterioAgrupamento = String(formData.get("criterio_agrupamento") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  if (!nome) throw new Error("Nome do lote fabril é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_lote_fabril", {
    p_nome: nome,
    p_criterio_agrupamento: criterioAgrupamento,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function adicionarItemLoteFabrilAction(formData: FormData) {
  const loteFabrilId = String(formData.get("lote_fabril_id") ?? "");
  const opLoteId = String(formData.get("op_lote_id") ?? "");
  const quantidadeRaw = String(formData.get("quantidade") ?? "").trim();
  if (!loteFabrilId) throw new Error("Lote fabril inválido.");
  if (!opLoteId) throw new Error("Selecione um lote de liberação.");
  const quantidade = Number(quantidadeRaw);
  if (!quantidadeRaw || !Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("Quantidade deve ser um número maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("adicionar_item_lote_fabril", {
    p_lote_fabril_id: loteFabrilId,
    p_op_lote_id: opLoteId,
    p_quantidade: quantidade,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function removerItemLoteFabrilAction(formData: FormData) {
  const loteFabrilItemId = String(formData.get("lote_fabril_item_id") ?? "");
  if (!loteFabrilItemId) throw new Error("Item inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_item_lote_fabril", { p_lote_fabril_item_id: loteFabrilItemId });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function encerrarLoteFabrilAction(formData: FormData) {
  const loteFabrilId = String(formData.get("lote_fabril_id") ?? "");
  if (!loteFabrilId) throw new Error("Lote fabril inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("encerrar_lote_fabril", { p_lote_fabril_id: loteFabrilId });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}

export async function cancelarOrdemProducaoAction(formData: FormData) {
  const ordemId = String(formData.get("ordem_producao_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!ordemId) throw new Error("Ordem de produção inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_ordem_producao", {
    p_ordem_producao_id: ordemId,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/producao");
}
