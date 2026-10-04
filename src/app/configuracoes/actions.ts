"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const RESTART_VALUES = ["nunca", "anual", "mensal"] as const;

export async function upsertNumberingSequenceAction(formData: FormData) {
  const documentType = String(formData.get("document_type") ?? "");
  const prefixo = String(formData.get("prefixo") ?? "");
  const sufixo = String(formData.get("sufixo") ?? "");
  const digitos = Number(formData.get("digitos") ?? 6);
  const incluirAno = formData.get("incluir_ano") === "on";
  const incluirMes = formData.get("incluir_mes") === "on";
  const reinicio = String(formData.get("reinicio") ?? "nunca");

  if (
    !documentType ||
    !RESTART_VALUES.includes(reinicio as (typeof RESTART_VALUES)[number]) ||
    !Number.isInteger(digitos) ||
    digitos < 1 ||
    digitos > 12
  ) {
    throw new Error("Dados inválidos para configuração de numeração — dígitos deve ser um número inteiro entre 1 e 12.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_numbering_sequence", {
    p_document_type: documentType,
    p_prefixo: prefixo,
    p_sufixo: sufixo,
    p_digitos: digitos,
    p_incluir_ano: incluirAno,
    p_incluir_mes: incluirMes,
    p_reinicio: reinicio,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
}

export async function upsertCuttingMarginAction(formData: FormData) {
  const materialTipo = String(formData.get("material_tipo") ?? "").trim();
  const processo = String(formData.get("processo") ?? "").trim();
  const percentual = Number(formData.get("percentual") ?? "");
  const ativo = formData.get("ativo") === "on";

  if (!materialTipo || Number.isNaN(percentual) || percentual < 0) {
    throw new Error("Dados inválidos para margem de quebra.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_cutting_margin", {
    p_material_tipo: materialTipo,
    p_processo: processo,
    p_percentual: percentual,
    p_ativo: ativo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
}

export async function upsertMargemPrecoAction(formData: FormData) {
  const margem = Number(formData.get("margem_percentual") ?? "");

  if (Number.isNaN(margem) || margem < 0 || margem >= 100) {
    throw new Error("A margem deve ser maior ou igual a 0 e menor que 100.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_margem_preco", { p_percentual: margem });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
}

// Catálogo de variáveis configuráveis (Pré-engenharia, 2026-10-04) —
// cadastrado aqui (empresa) e consumido em Engenharia → Pré-engenharia,
// por isso revalida as duas rotas.
export async function criarVariavelCategoriaAction(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) throw new Error("Nome da categoria é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_variavel_categoria", { p_nome: nome });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
  revalidatePath("/engenharia");
}

export async function criarVariavelTemplateAction(formData: FormData) {
  const categoriaId = String(formData.get("categoria_id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  const unidade = String(formData.get("unidade") ?? "").trim() || null;
  const opcoesRaw = String(formData.get("opcoes") ?? "").trim();
  const obrigatoriaPadrao = formData.get("obrigatoria_padrao") === "on";
  if (!categoriaId) throw new Error("Categoria é obrigatória.");
  if (!nome) throw new Error("Nome da variável é obrigatório.");
  if (!["numero", "texto", "opcao"].includes(tipo)) throw new Error("Tipo de variável inválido.");

  const opcoes = tipo === "opcao" ? opcoesRaw.split(",").map((v) => v.trim()).filter(Boolean) : null;
  if (tipo === "opcao" && (!opcoes || opcoes.length === 0)) {
    throw new Error("Variável do tipo opção precisa de pelo menos um valor permitido.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_variavel_template", {
    p_categoria_id: categoriaId,
    p_nome: nome,
    p_tipo: tipo,
    p_unidade: unidade,
    p_opcoes: opcoes,
    p_obrigatoria_padrao: obrigatoriaPadrao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
  revalidatePath("/engenharia");
}

// Nome e tipo não aparecem aqui — são imutáveis depois de criados (mesma
// regra de atualizar_caracteristica_peca: valor já pode estar gravado em
// orçamento/pedido sob aquele tipo). Atualizar opções/unidade propaga pra
// toda peça que já anexou esta variável (RPC já faz isso).
export async function atualizarVariavelTemplateAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const unidade = String(formData.get("unidade") ?? "").trim() || null;
  const opcoesRaw = String(formData.get("opcoes") ?? "").trim();
  const obrigatoriaPadrao = formData.get("obrigatoria_padrao") === "on";
  const ativo = formData.get("ativo") === "on";
  if (!id) throw new Error("Variável inválida.");

  const opcoes = tipo === "opcao" ? opcoesRaw.split(",").map((v) => v.trim()).filter(Boolean) : null;
  if (tipo === "opcao" && (!opcoes || opcoes.length === 0)) {
    throw new Error("Variável do tipo opção precisa de pelo menos um valor permitido.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_variavel_template", {
    p_id: id,
    p_unidade: unidade,
    p_opcoes: opcoes,
    p_obrigatoria_padrao: obrigatoriaPadrao,
    p_ativo: ativo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
  revalidatePath("/engenharia");
}

export async function upsertMeasurementRuleAction(formData: FormData) {
  const tipoItem = String(formData.get("tipo_item") ?? "").trim();
  const exigeMedicao = formData.get("exige_medicao_confirmada") === "on";
  const ativo = formData.get("ativo") === "on";

  if (!tipoItem) {
    throw new Error("Tipo de item é obrigatório.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_measurement_rule", {
    p_tipo_item: tipoItem,
    p_exige_medicao_confirmada: exigeMedicao,
    p_ativo: ativo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
}

export async function upsertApprovalThresholdAction(formData: FormData) {
  const processo = String(formData.get("processo") ?? "").trim();
  const valorMinimo = Number(formData.get("valor_minimo") ?? "");
  const roleId = String(formData.get("role_id") ?? "");
  const ativo = formData.get("ativo") === "on";

  if (!processo || Number.isNaN(valorMinimo) || valorMinimo < 0 || !roleId) {
    throw new Error("Dados inválidos para alçada de aprovação.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_approval_threshold", {
    p_processo: processo,
    p_valor_minimo: valorMinimo,
    p_role_id: roleId,
    p_ativo: ativo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
}
