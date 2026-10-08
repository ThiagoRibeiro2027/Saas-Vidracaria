"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type OrcamentoState = { error: string } | { id: string } | undefined;

export async function upsertOrcamentoAction(
  _prevState: OrcamentoState,
  formData: FormData,
): Promise<OrcamentoState> {
  const id = String(formData.get("id") ?? "") || null;
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  const obraId = String(formData.get("obra_id") ?? "") || null;
  const validade = String(formData.get("validade") ?? "") || null;
  const condicaoComercial = String(formData.get("condicao_comercial") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!pessoaId) return { error: "Cliente é obrigatório." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_orcamento", {
    p_id: id,
    p_pessoa_id: pessoaId,
    p_obra_id: obraId,
    p_validade: validade,
    p_condicao_comercial: condicaoComercial,
    p_observacoes: observacoes,
  });
  if (error) return { error: error.message };

  revalidatePath("/comercial");
  // Devolve o id (upsert_orcamento retorna uuid) pra quem criou um orçamento
  // novo poder continuar na mesma janela e já incluir os itens, sem precisar
  // fechar e reabrir (ver OrcamentosSection.tsx).
  return { id: data as string };
}

export async function upsertOrcamentoItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const orcamentoId = String(formData.get("orcamento_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const quantidade = Number(formData.get("quantidade"));
  const precoUnitario = Number(formData.get("preco_unitario"));
  const custoUnitarioRaw = String(formData.get("custo_unitario") ?? "").trim();
  const custoUnitario = custoUnitarioRaw ? Number(custoUnitarioRaw) : null;
  const custoMaoObraRaw = String(formData.get("custo_mao_obra") ?? "").trim();
  const custoMaoObra = custoMaoObraRaw ? Number(custoMaoObraRaw) : null;

  if (!orcamentoId || !itemId || !Number.isFinite(quantidade) || !Number.isFinite(precoUnitario)) {
    throw new Error("Dados inválidos para item do orçamento.");
  }
  if (custoUnitario !== null && !Number.isFinite(custoUnitario)) {
    throw new Error("Custo unitário inválido.");
  }
  if (custoMaoObra !== null && !Number.isFinite(custoMaoObra)) {
    throw new Error("Custo de mão de obra inválido.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_orcamento_item", {
    p_id: id,
    p_orcamento_id: orcamentoId,
    p_item_id: itemId,
    p_quantidade: quantidade,
    p_preco_unitario: precoUnitario,
    p_custo_unitario: custoUnitario,
    p_custo_mao_obra: custoMaoObra,
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

export async function gerarPropostaAction(formData: FormData) {
  const orcamentoId = String(formData.get("orcamento_id") ?? "");
  const validade = String(formData.get("validade") ?? "");
  if (!orcamentoId || !validade) throw new Error("Orçamento e validade são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("gerar_proposta", {
    p_orcamento_id: orcamentoId,
    p_validade: validade,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function marcarPropostaEnviadaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const canal = String(formData.get("canal") ?? "").trim() || null;
  const destinatario = String(formData.get("destinatario") ?? "").trim() || null;
  if (!id) throw new Error("Proposta inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_proposta_enviada", {
    p_id: id,
    p_canal: canal,
    p_destinatario: destinatario,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function registrarAceitePropostaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const forcar = formData.get("forcar") === "true";
  if (!id) throw new Error("Proposta inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_aceite_proposta", { p_id: id, p_forcar: forcar });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function registrarRecusaPropostaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!id) throw new Error("Proposta inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_recusa_proposta", { p_id: id, p_observacao: observacao });
  if (error) throw new Error(error.message);

  revalidatePath("/comercial");
}

export async function cancelarPropostaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Proposta inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_proposta", { p_id: id });
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

// ADR-012 v1.1 — pré-cálculo (leitura pura, não grava nada): custo de
// material + mão de obra + preço sugerido a partir das características
// ainda não gravadas. Erro esperado volta como valor, não como exceção
// (o formulário mostra a mensagem sem derrubar a página).
export async function calcularPrecoConfiguradorAction(
  itemId: string,
  valores: Record<string, { n?: number; t?: string }>,
): Promise<{ error: string } | { data: Record<string, unknown> }> {
  if (!itemId) return { error: "Item inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calcular_preco_configurador", { p_item_id: itemId, p_valores: valores });
  if (error) return { error: error.message };
  return { data: data as Record<string, unknown> };
}

// ADR-012 v1.1 — grava item + características + custos + preço numa
// transação só. O servidor SEMPRE recalcula custo e preço; do navegador só
// vêm quantidade, valores das características e, se o vendedor digitou, o
// preço ajustado (precoOverride) — nunca custo.
export async function salvarItemConfiguradoAction(input: {
  id: string | null;
  orcamentoId: string;
  itemId: string;
  quantidade: number;
  valores: Record<string, { n?: number; t?: string }>;
  precoOverride: number | null;
}): Promise<{ error: string } | { ok: true }> {
  if (!input.orcamentoId || !input.itemId) return { error: "Orçamento e item são obrigatórios." };
  if (!Number.isFinite(input.quantidade) || input.quantidade <= 0) return { error: "Quantidade deve ser maior que zero." };
  if (input.precoOverride !== null && (!Number.isFinite(input.precoOverride) || input.precoOverride < 0)) {
    return { error: "Preço unitário inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_orcamento_item_configurado", {
    p_id: input.id,
    p_orcamento_id: input.orcamentoId,
    p_item_id: input.itemId,
    p_quantidade: input.quantidade,
    p_valores: input.valores,
    p_preco_override: input.precoOverride,
  });
  if (error) return { error: error.message };

  revalidatePath("/comercial");
  return { ok: true };
}

// ADR-012 Fase 4 — leitura pura (não grava nada). O vendedor decide se
// aplica o custo_total ao campo custo_mao_obra, via o form de edição do
// item já existente — nunca aplicado automaticamente.
export async function calcularMaoObraOrcamentoItemAction(
  orcamentoItemId: string,
): Promise<{ error: string } | { data: Record<string, unknown> }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calcular_mao_obra_orcamento_item", { p_orcamento_item_id: orcamentoItemId });
  if (error) return { error: error.message };
  return { data: data as Record<string, unknown> };
}

// =========================================================================
// Clientes (pessoas com papel CLIENTE) e Obras — 2026-10-04: cadastro de
// cliente saiu de /cadastros (T2) e passou a viver aqui, perto de quem mais
// usa (Orçamento). Fornecedor é a mesma tabela `pessoas`, mas com cadastro
// próprio em Compras (ver src/app/compras/actions.ts) — decisão do dono do
// produto. RPCs reaproveitadas sem nenhuma mudança: upsert_pessoa,
// set_pessoa_papel, upsert_obra já existiam e já checam has_permission
// internamente.
// =========================================================================

export type PessoaState = { error: string } | undefined;

export async function upsertPessoaAction(
  _prevState: PessoaState,
  formData: FormData,
): Promise<PessoaState> {
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

  if (!nome) return { error: "Nome é obrigatório." };

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
  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe uma pessoa cadastrada com esse documento (CPF/CNPJ)." };
    }
    return { error: error.message };
  }

  revalidatePath("/comercial");
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

  revalidatePath("/comercial");
}

// Composta: cria a pessoa e já liga o papel CLIENTE num único submit — o
// fluxo genérico (upsertPessoaAction + setPessoaPapelAction em dois passos)
// continua existindo para edição e para alternar o papel FORNECEDOR de um
// cliente que também vende para a empresa, mas "+ Novo cliente" não deveria
// exigir que o usuário lembre de ligar o papel depois de salvar.
export async function criarClienteAction(
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
    p_papel: "CLIENTE",
    p_ativo: true,
  });
  if (erroPapel) return { error: erroPapel.message };

  revalidatePath("/comercial");
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

  revalidatePath("/comercial");
}
