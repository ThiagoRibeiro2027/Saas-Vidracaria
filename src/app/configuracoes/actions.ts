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

// Melhorias 18/10/2026, item 3 — impostos e encargos que entram no preço
// sugerido (preço = custo ÷ (1 − (encargos + margem)/100)). Quem digita os
// percentuais é a empresa; o sistema não sugere alíquotas.
const CAMPOS_ENCARGOS = [
  "simples_nacional",
  "icms",
  "pis",
  "cofins",
  "iss",
  "ipi",
  "comissao",
  "despesas_fixas",
  "custo_financeiro_frete",
] as const;

export async function upsertEncargosPrecoAction(formData: FormData) {
  const regime = String(formData.get("regime_tributario") ?? "").trim() || null;
  if (regime !== null && !["mei", "simples_nacional", "lucro_presumido", "lucro_real"].includes(regime)) {
    throw new Error("Regime tributário inválido.");
  }
  const valores: Record<string, number> = {};
  for (const campo of CAMPOS_ENCARGOS) {
    const raw = String(formData.get(campo) ?? "").trim().replace(",", ".");
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0 || n >= 100) {
      throw new Error("Cada percentual deve ser maior ou igual a 0 e menor que 100.");
    }
    valores[campo] = n;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_pricing_cost_components", {
    p_regime: regime,
    p_simples_nacional: valores.simples_nacional,
    p_icms: valores.icms,
    p_pis: valores.pis,
    p_cofins: valores.cofins,
    p_iss: valores.iss,
    p_ipi: valores.ipi,
    p_comissao: valores.comissao,
    p_despesas_fixas: valores.despesas_fixas,
    p_custo_financeiro_frete: valores.custo_financeiro_frete,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
}

// Melhorias 18/10/2026, item 2 — horário de funcionamento da empresa. As
// horas do dia são calculadas no banco (início, fim e intervalo); aqui só
// monta a semana a partir do formulário.
export async function upsertHorarioFuncionamentoAction(formData: FormData) {
  const dias: { dia_semana: number; trabalha: boolean; inicio: string | null; fim: string | null; almoco_minutos: number }[] = [];
  for (let dia = 0; dia <= 6; dia++) {
    const trabalha = formData.get(`trabalha_${dia}`) === "on";
    const inicio = String(formData.get(`inicio_${dia}`) ?? "").trim() || null;
    const fim = String(formData.get(`fim_${dia}`) ?? "").trim() || null;
    const almoco = Number(String(formData.get(`almoco_${dia}`) ?? "0").trim() || 0);
    if (!Number.isFinite(almoco) || almoco < 0) throw new Error("O intervalo deve ser um número de minutos maior ou igual a 0.");
    dias.push({ dia_semana: dia, trabalha, inicio, fim, almoco_minutos: Math.round(almoco) });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_company_work_schedule", { p_dias: dias });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
  revalidatePath("/producao");
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

// Exclusão do catálogo (Melhorias 18/10/2026, item 4). Devolve o erro em vez
// de lançar, pra tela mostrar inline. Excluir variável/categoria EM USO é
// permitido: as peças mantêm a característica como campo avulso.
export async function excluirVariavelTemplateAction(id: string): Promise<{ error: string } | undefined> {
  if (!id) return { error: "Variável inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_variavel_template", { p_id: id });
  if (error) return { error: error.message };

  revalidatePath("/configuracoes");
  revalidatePath("/engenharia");
}

export async function excluirVariavelCategoriaAction(id: string): Promise<{ error: string } | undefined> {
  if (!id) return { error: "Categoria inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_variavel_categoria", { p_id: id });
  if (error) return { error: error.message };

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

// Melhorias 12/10/2026, item 8 — unidades de medida que a empresa escolheu
// usar; alimenta o dropdown de "unidade" no cadastro de item (Engenharia).
export async function upsertCompanyMeasurementUnitAction(formData: FormData) {
  const unidade = String(formData.get("unidade") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim() || null;
  const ativo = formData.get("ativo") === "on";

  if (!unidade) {
    throw new Error("Unidade é obrigatória.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_company_measurement_unit", {
    p_unidade: unidade,
    p_descricao: descricao,
    p_ativo: ativo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
  revalidatePath("/engenharia");
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
