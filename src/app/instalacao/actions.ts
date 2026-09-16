"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarEquipeAction(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) throw new Error("Nome da equipe é obrigatório.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_equipe_instalacao", { p_nome: nome });
  if (error) throw new Error(error.message);

  revalidatePath("/instalacao");
}

export async function definirAtivoEquipeAction(formData: FormData) {
  const equipeId = String(formData.get("equipe_id") ?? "");
  const ativo = String(formData.get("ativo") ?? "") === "true";
  if (!equipeId) throw new Error("Equipe inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_ativo_equipe_instalacao", { p_equipe_id: equipeId, p_ativo: ativo });
  if (error) throw new Error(error.message);

  revalidatePath("/instalacao");
}

export async function adicionarMembroEquipeAction(formData: FormData) {
  const equipeId = String(formData.get("equipe_id") ?? "");
  const profileId = String(formData.get("profile_id") ?? "");
  if (!equipeId || !profileId) throw new Error("Equipe e usuário são obrigatórios.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("adicionar_membro_equipe", { p_equipe_id: equipeId, p_profile_id: profileId });
  if (error) throw new Error(error.message);

  revalidatePath("/instalacao");
}

export async function removerMembroEquipeAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Membro inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_membro_equipe", { p_equipe_membro_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/instalacao");
}

export async function criarInstalacaoAction(formData: FormData) {
  const pedidoId = String(formData.get("pedido_id") ?? "");
  const equipeId = String(formData.get("equipe_id") ?? "");
  const dataAgendada = String(formData.get("data_agendada") ?? "");
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  if (!pedidoId || !equipeId || !dataAgendada) {
    throw new Error("Pedido, equipe e data agendada são obrigatórios.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_instalacao", {
    p_pedido_id: pedidoId,
    p_equipe_id: equipeId,
    p_data_agendada: dataAgendada,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/instalacao");
}

export async function adicionarItemInstalacaoAction(formData: FormData) {
  const instalacaoId = String(formData.get("instalacao_id") ?? "");
  const pedidoItemId = String(formData.get("pedido_item_id") ?? "");
  const quantidade = Number(formData.get("quantidade"));
  if (!instalacaoId || !pedidoItemId) throw new Error("Instalação e item de pedido são obrigatórios.");
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("Quantidade precisa ser maior que zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("adicionar_item_instalacao", {
    p_instalacao_id: instalacaoId,
    p_pedido_item_id: pedidoItemId,
    p_quantidade: quantidade,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/instalacao");
}

export async function removerItemInstalacaoAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Item de instalação inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_item_instalacao", { p_instalacao_item_id: id });
  if (error) throw new Error(error.message);

  revalidatePath("/instalacao");
}

export async function cancelarInstalacaoAction(formData: FormData) {
  const instalacaoId = String(formData.get("instalacao_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!instalacaoId) throw new Error("Instalação inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_instalacao", { p_instalacao_id: instalacaoId, p_motivo: motivo });
  if (error) throw new Error(error.message);

  revalidatePath("/instalacao");
}

export async function registrarOcorrenciaInstalacaoAction(formData: FormData) {
  const instalacaoId = String(formData.get("instalacao_id") ?? "");
  const descricao = String(formData.get("descricao") ?? "").trim();
  if (!instalacaoId) throw new Error("Instalação inválida.");
  if (!descricao) throw new Error("Descrição da ocorrência é obrigatória.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_ocorrencia_instalacao", {
    p_instalacao_id: instalacaoId,
    p_descricao: descricao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/instalacao");
}

export async function decidirNovaFabricacaoAction(formData: FormData) {
  const solicitacaoId = String(formData.get("solicitacao_id") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  if (!solicitacaoId || (decisao !== "aprovada" && decisao !== "rejeitada")) {
    throw new Error("Solicitação e decisão (aprovada/rejeitada) são obrigatórias.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decidir_nova_fabricacao", {
    p_solicitacao_id: solicitacaoId,
    p_decisao: decisao,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/instalacao");
}
