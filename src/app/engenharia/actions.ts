"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarItemProducaoAction(formData: FormData) {
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  if (!pedidoItemId) throw new Error("Item de pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_item_producao", { p_pedido_item_id: pedidoItemId });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function registrarMedicaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const ambiente = String(formData.get("ambiente") ?? "").trim() || null;
  const largura = Number(formData.get("largura_mm"));
  const altura = Number(formData.get("altura_mm"));
  if (!id || !Number.isFinite(largura) || !Number.isFinite(altura)) {
    throw new Error("Dados inválidos para medição.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_medicao", {
    p_id: id,
    p_ambiente: ambiente,
    p_largura_mm: largura,
    p_altura_mm: altura,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function confirmarMedicaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Item de produção inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmar_medicao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function gerarBomSugeridaAction(formData: FormData) {
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  if (!pedidoItemId) throw new Error("Item de pedido inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_bom_sugerida_pedido_item", { p_pedido_item_id: pedidoItemId });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function ajustarItemBomAction(formData: FormData) {
  const pedidoItemBomId = String(formData.get("pedido_item_bom_id") ?? "");
  const materialItemId = String(formData.get("material_item_id") ?? "");
  const quantidadeRaw = String(formData.get("quantidade_por_unidade") ?? "").trim();
  if (!pedidoItemBomId || !materialItemId) throw new Error("BOM e material são obrigatórios.");

  const quantidade = Number(quantidadeRaw);
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("ajustar_item_bom_pedido_item", {
    p_pedido_item_bom_id: pedidoItemBomId,
    p_material_item_id: materialItemId,
    p_quantidade_por_unidade: quantidade,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function removerItemBomAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Linha de BOM inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_item_bom_pedido_item", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function aprovarBomDefinitivaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("BOM inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("aprovar_bom_definitiva", { p_pedido_item_bom_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
  revalidatePath("/suprimentos");
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

  revalidatePath("/engenharia");
}

// Fase 2 da ADR-011 — controle dimensional do item (barra, chapa, bobina).
// Fica separado de upsertItemAction porque é outra função no banco, com
// regra própria: desligar o controle é recusado quando já existe peça
// registrada, e é o banco que decide isso, não a tela.
//
// dimensao_tipo vazio significa item escalar, o padrão de todo o catálogo
// (T6 inalterado) — por isso vira null, não string vazia. O peso só faz
// sentido com um tipo definido, então é zerado junto.
export async function definirPropriedadesDimensionaisItemAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const dimensaoTipo = String(formData.get("dimensao_tipo") ?? "").trim() || null;
  const pesoRaw = String(formData.get("peso_por_unidade_dimensao") ?? "").trim();
  if (!itemId) throw new Error("Item inválido.");
  if (dimensaoTipo !== null && !["linear", "area"].includes(dimensaoTipo)) {
    throw new Error("Tipo de dimensão inválido.");
  }

  const peso = dimensaoTipo === null || pesoRaw === "" ? null : Number(pesoRaw);
  if (peso !== null && (!Number.isFinite(peso) || peso <= 0)) {
    throw new Error("Peso por unidade de dimensão deve ser um número maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_propriedades_dimensionais_item", {
    p_item_id: itemId,
    p_dimensao_tipo: dimensaoTipo,
    p_peso_por_unidade_dimensao: peso,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
  revalidatePath("/estoque");
}

export async function definirValorCaracteristicaAction(formData: FormData) {
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  const pecaCaracteristicaId = String(formData.get("peca_caracteristica_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const valorRaw = String(formData.get("valor") ?? "").trim();
  if (!pedidoItemId || !pecaCaracteristicaId || !valorRaw) {
    throw new Error("Característica e valor são obrigatórios.");
  }

  const valorNumero = tipo === "numero" ? Number(valorRaw) : null;
  if (tipo === "numero" && !Number.isFinite(valorNumero)) throw new Error("Valor numérico inválido.");
  const valorTexto = tipo === "numero" ? null : valorRaw;

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_valor_caracteristica_pedido_item", {
    p_pedido_item_id: pedidoItemId,
    p_peca_caracteristica_id: pecaCaracteristicaId,
    p_valor_numero: valorNumero,
    p_valor_texto: valorTexto,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

// Roteiros produtivos — movido de producao/actions.ts (2026-10-10, pedido do
// responsável do produto: Roteiros passa a viver em Engenharia). A checagem
// de permissão (assert_tenant_write_any('engenharia', ...)) está dentro das
// funções do banco (migration 20261010010100_mover_roteiros_para_engenharia).
export async function criarRoteiroProdutivoAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!itemId) throw new Error("Item inválido.");
  if (!nome) throw new Error("Nome do roteiro é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_roteiro_produtivo", { p_item_id: itemId, p_nome: nome });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
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
  const perfil = String(formData.get("perfil") ?? "").trim() || null;
  const ferramenta = String(formData.get("ferramenta") ?? "").trim() || null;
  const processo = String(formData.get("processo") ?? "").trim() || null;

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
    p_perfil: perfil,
    p_ferramenta: ferramenta,
    p_processo: processo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function removerOperacaoRoteiroAction(formData: FormData) {
  const roteiroOperacaoId = String(formData.get("roteiro_operacao_id") ?? "");
  if (!roteiroOperacaoId) throw new Error("Operação inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_operacao_roteiro", {
    p_roteiro_operacao_id: roteiroOperacaoId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function desativarRoteiroAction(formData: FormData) {
  const roteiroId = String(formData.get("roteiro_id") ?? "");
  if (!roteiroId) throw new Error("Roteiro inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_roteiro", { p_roteiro_id: roteiroId });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}
