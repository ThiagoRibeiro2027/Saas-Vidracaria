"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function configurarIntegracaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const catalogoKey = String(formData.get("catalogo_key") ?? "").trim();
  const apelido = String(formData.get("apelido") ?? "").trim() || null;
  const ambiente = String(formData.get("ambiente") ?? "producao");

  if (!id && !catalogoKey) throw new Error("Conector do catálogo é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("configurar_integracao", {
    p_id: id,
    p_catalogo_key: catalogoKey,
    p_apelido: apelido,
    p_ambiente: ambiente,
    p_config: null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function ativarIntegracaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Integração inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("ativar_integracao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function desativarIntegracaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Integração inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_integracao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

// Chamada diretamente por um Client Component (não via <form>), pra poder
// devolver o segredo pra tela mostrar uma única vez — nenhuma outra action
// deste arquivo precisa de retorno porque nenhuma outra expõe um segredo.
export async function gerarWebhookIntegracaoAction(integracaoId: string): Promise<{ token: string; secret: string }> {
  if (!integracaoId) throw new Error("Integração inválida.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gerar_webhook_integracao", { p_integracao_id: integracaoId });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token || !row?.secret) throw new Error("Resposta inesperada ao gerar webhook.");
  return { token: row.token, secret: row.secret };
}

export async function desativarWebhookIntegracaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Integração inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_webhook_integracao", { p_integracao_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function reprocessarOperacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Operação inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reprocessar_operacao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function cancelarOperacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Operação inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_operacao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function configurarWebhookSaidaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const integracaoId = String(formData.get("integracao_id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const secret = String(formData.get("secret") ?? "");

  if (!integracaoId) throw new Error("Integração é obrigatória.");
  if (!nome) throw new Error("Nome é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("configurar_webhook_saida", {
    p_id: id,
    p_integracao_id: integracaoId,
    p_nome: nome,
    p_url: url,
    p_secret: secret,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function ativarWebhookSaidaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Webhook de saída inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("ativar_webhook_saida", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function desativarWebhookSaidaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Webhook de saída inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_webhook_saida", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function configurarRegraAutomacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "") || null;
  const nome = String(formData.get("nome") ?? "").trim();
  const eventoTipo = String(formData.get("evento_tipo") ?? "").trim();
  const condicaoOperador = String(formData.get("condicao_operador") ?? "E");
  const condicoesRaw = String(formData.get("condicoes") ?? "").trim();
  const nivelAutomacao = String(formData.get("nivel_automacao") ?? "");
  const acaoTipo = String(formData.get("acao_tipo") ?? "");
  const webhookSaidaId = String(formData.get("webhook_saida_id") ?? "") || null;

  if (!nome) throw new Error("Nome é obrigatório.");
  if (!eventoTipo) throw new Error("Tipo de evento é obrigatório.");

  let condicoes: unknown;
  try {
    condicoes = JSON.parse(condicoesRaw);
  } catch {
    throw new Error('Condições precisam ser um JSON válido, ex.: [{"campo":"valor","operador":">","valor":"5000"}]');
  }

  const acaoConfig = acaoTipo === "webhook_saida" ? { webhook_saida_id: webhookSaidaId } : null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("configurar_regra_automacao", {
    p_id: id,
    p_nome: nome,
    p_evento_tipo: eventoTipo,
    p_condicao_operador: condicaoOperador,
    p_condicoes: condicoes,
    p_nivel_automacao: nivelAutomacao,
    p_acao_tipo: acaoTipo,
    p_acao_config: acaoConfig,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function ativarRegraAutomacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Regra inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("ativar_regra_automacao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function desativarRegraAutomacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Regra inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desativar_regra_automacao", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function confirmarExecucaoRegraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Execução inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmar_execucao_regra", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function rejeitarExecucaoRegraAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Execução inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("rejeitar_execucao_regra", { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}

export async function definirFonteOficialAction(formData: FormData) {
  const tipoInformacao = String(formData.get("tipo_informacao") ?? "").trim();
  const sistemaFonte = String(formData.get("sistema_fonte") ?? "").trim();
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!tipoInformacao) throw new Error("Tipo de informação é obrigatório.");
  if (!sistemaFonte) throw new Error("Sistema fonte é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_fonte_oficial", {
    p_tipo_informacao: tipoInformacao,
    p_sistema_fonte: sistemaFonte,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/integracoes");
}
