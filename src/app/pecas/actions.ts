"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarPecaAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const descricaoTecnica = String(formData.get("descricao_tecnica") ?? "").trim() || null;
  if (!itemId) throw new Error("Item inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_peca", { p_item_id: itemId, p_descricao_tecnica: descricaoTecnica });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function inativarPecaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Peça inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("inativar_peca", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function reativarPecaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Peça inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reativar_peca", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function adicionarMaterialPecaAction(formData: FormData) {
  const pecaId = String(formData.get("peca_id") ?? "");
  const materialItemId = String(formData.get("material_item_id") ?? "");
  const quantidadeRaw = String(formData.get("quantidade_por_unidade") ?? "").trim();
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!pecaId) throw new Error("Peça inválida.");
  if (!materialItemId) throw new Error("Material inválido.");

  const quantidade = Number(quantidadeRaw);
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade por unidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("adicionar_material_peca", {
    p_peca_id: pecaId,
    p_material_item_id: materialItemId,
    p_quantidade_por_unidade: quantidade,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function atualizarMaterialPecaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const quantidadeRaw = String(formData.get("quantidade_por_unidade") ?? "").trim();
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!id) throw new Error("Linha de composição inválida.");

  const quantidade = Number(quantidadeRaw);
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade por unidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_material_peca", {
    p_id: id,
    p_quantidade_por_unidade: quantidade,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function removerMaterialPecaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Linha de composição inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_material_peca", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function definirCaracteristicaPecaAction(formData: FormData) {
  const pecaId = String(formData.get("peca_id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  const unidade = String(formData.get("unidade") ?? "").trim() || null;
  const opcoesRaw = String(formData.get("opcoes") ?? "").trim();
  const obrigatoria = formData.get("obrigatoria") === "on";
  if (!pecaId) throw new Error("Peça inválida.");
  if (!nome) throw new Error("Nome da característica é obrigatório.");
  if (!["numero", "texto", "opcao"].includes(tipo)) throw new Error("Tipo de característica inválido.");

  const opcoes = tipo === "opcao" ? opcoesRaw.split(",").map((v) => v.trim()).filter(Boolean) : null;
  if (tipo === "opcao" && (!opcoes || opcoes.length === 0)) {
    throw new Error("Característica do tipo opção precisa de pelo menos um valor permitido.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_caracteristica_peca", {
    p_peca_id: pecaId,
    p_nome: nome,
    p_tipo: tipo,
    p_unidade: unidade,
    p_opcoes: opcoes,
    p_obrigatoria: obrigatoria,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

// A função do banco só deixa mexer em unidade, opções e obrigatoriedade —
// nome e tipo são imutáveis depois de criados, porque valores já
// informados em orçamento/pedido foram gravados sob aquele tipo. A tela
// reflete isso: os dois aparecem como texto fixo no formulário de edição.
export async function atualizarCaracteristicaPecaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const unidade = String(formData.get("unidade") ?? "").trim() || null;
  const opcoesRaw = String(formData.get("opcoes") ?? "").trim();
  const obrigatoria = formData.get("obrigatoria") === "on";
  if (!id) throw new Error("Característica inválida.");

  const opcoes = tipo === "opcao" ? opcoesRaw.split(",").map((v) => v.trim()).filter(Boolean) : null;
  if (tipo === "opcao" && (!opcoes || opcoes.length === 0)) {
    throw new Error("Característica do tipo opção precisa de pelo menos um valor permitido.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_caracteristica_peca", {
    p_id: id,
    p_unidade: unidade,
    p_opcoes: opcoes,
    p_obrigatoria: obrigatoria,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function removerCaracteristicaPecaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Característica inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_caracteristica_peca", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function criarRegraPecaAction(formData: FormData) {
  const pecaId = String(formData.get("peca_id") ?? "");
  const caracteristicaId = String(formData.get("caracteristica_id") ?? "");
  const operador = String(formData.get("operador") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const valorComparacaoRaw = String(formData.get("valor_comparacao") ?? "").trim();
  const acao = String(formData.get("acao") ?? "");
  const acaoMaterialItemId = String(formData.get("acao_material_item_id") ?? "");
  const acaoQuantidadeRaw = String(formData.get("acao_quantidade") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  const substituiRegraId = String(formData.get("substitui_regra_id") ?? "").trim() || null;

  if (!pecaId || !caracteristicaId || !operador || !valorComparacaoRaw || !acao || !acaoMaterialItemId) {
    throw new Error("Preencha condição e ação da regra.");
  }

  const valorComparacaoNumero = tipo === "numero" ? Number(valorComparacaoRaw) : null;
  if (tipo === "numero" && !Number.isFinite(valorComparacaoNumero)) throw new Error("Valor de comparação inválido.");
  const valorComparacaoTexto = tipo === "numero" ? null : valorComparacaoRaw;

  const acaoQuantidade = acao === "remover_material" ? null : Number(acaoQuantidadeRaw);
  if (acao !== "remover_material" && !Number.isFinite(acaoQuantidade)) throw new Error("Quantidade da ação inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_regra_peca", {
    p_peca_id: pecaId,
    p_caracteristica_id: caracteristicaId,
    p_operador: operador,
    p_valor_comparacao_numero: valorComparacaoNumero,
    p_valor_comparacao_texto: valorComparacaoTexto,
    p_acao: acao,
    p_acao_material_item_id: acaoMaterialItemId,
    p_acao_quantidade: acaoQuantidade,
    p_motivo: motivo,
    p_substitui_regra_id: substituiRegraId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function desativarRegraPecaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Regra inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_regra_peca", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

// ADR-012 §2.1 — marca uma característica numérica como largura/altura
// da peça, pra alimentar a fórmula de perímetro/área.
export async function definirPapelDimensionalAction(formData: FormData) {
  const caracteristicaId = String(formData.get("caracteristica_id") ?? "");
  const papelRaw = String(formData.get("papel_dimensional") ?? "").trim();
  if (!caracteristicaId) throw new Error("Característica inválida.");
  const papel = papelRaw === "" ? null : papelRaw;

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_papel_dimensional_caracteristica", {
    p_caracteristica_id: caracteristicaId,
    p_papel: papel,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

// ADR-012 §2.2 — tipo de cálculo (fixo/linear/área) e percentual de
// perda de uma linha de composição.
export async function definirTipoCalculoComposicaoAction(formData: FormData) {
  const composicaoId = String(formData.get("composicao_id") ?? "");
  const tipoCalculo = String(formData.get("tipo_calculo") ?? "");
  const percentualPerdaRaw = String(formData.get("percentual_perda") ?? "0").trim();
  if (!composicaoId || !tipoCalculo) throw new Error("Dados inválidos.");
  const percentualPerda = tipoCalculo === "fixo" ? 0 : Number(percentualPerdaRaw || "0");
  if (!Number.isFinite(percentualPerda) || percentualPerda < 0) throw new Error("Percentual de perda inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_tipo_calculo_composicao", {
    p_composicao_id: composicaoId,
    p_tipo_calculo: tipoCalculo,
    p_percentual_perda: percentualPerda,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

// ADR-012 Fase 2 — comprimentos de barra candidatos de uma linha de
// composição 'linear'. Cada comprimento é um item comprável distinto.
export async function definirComprimentoBarraAction(formData: FormData) {
  const composicaoId = String(formData.get("composicao_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const comprimentoRaw = String(formData.get("comprimento_metros") ?? "").trim();
  if (!composicaoId || !itemId || !comprimentoRaw) throw new Error("Item e comprimento são obrigatórios.");
  const comprimento = Number(comprimentoRaw);
  if (!Number.isFinite(comprimento) || comprimento <= 0) throw new Error("Comprimento inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_comprimento_barra_composicao", {
    p_peca_composicao_id: composicaoId,
    p_item_id: itemId,
    p_comprimento_metros: comprimento,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

export async function removerComprimentoBarraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Comprimento inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_comprimento_barra_composicao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

// Catálogo de variáveis configuráveis (2026-10-04) — substitui o conjunto
// inteiro de categorias da peça (editor de tags: a tela manda a lista
// completa marcada, não um add/remove individual).
export async function definirCategoriasPecaAction(formData: FormData) {
  const pecaId = String(formData.get("peca_id") ?? "");
  const categoriaIds = formData.getAll("categoria_ids").map((v) => String(v));
  if (!pecaId) throw new Error("Peça inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_categorias_peca", {
    p_peca_id: pecaId,
    p_categoria_ids: categoriaIds,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}

// Anexa uma variável do catálogo na peça — copia nome/tipo/unidade/opções
// do template (ver anexar_variavel_peca no banco); obrigatória continua
// editável por peça depois (mesma action de sempre, atualizarCaracteristicaPecaAction).
export async function anexarVariavelPecaAction(formData: FormData) {
  const pecaId = String(formData.get("peca_id") ?? "");
  const templateId = String(formData.get("template_id") ?? "");
  const obrigatoria = formData.get("obrigatoria") === "on";
  if (!pecaId) throw new Error("Peça inválida.");
  if (!templateId) throw new Error("Variável inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("anexar_variavel_peca", {
    p_peca_id: pecaId,
    p_template_id: templateId,
    p_obrigatoria: obrigatoria,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/engenharia");
}
