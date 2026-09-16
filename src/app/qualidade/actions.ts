"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function registrarInspecaoAction(formData: FormData) {
  const ordemId = String(formData.get("ordem_producao_id") ?? "");
  const aprovada = Number(formData.get("quantidade_aprovada") || 0);
  const reprovada = Number(formData.get("quantidade_reprovada") || 0);
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  if (!ordemId) throw new Error("Ordem de produção inválida.");
  if (!Number.isFinite(aprovada) || !Number.isFinite(reprovada) || aprovada < 0 || reprovada < 0) {
    throw new Error("Quantidade aprovada e reprovada devem ser números válidos e não negativos.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_inspecao_qualidade", {
    p_ordem_producao_id: ordemId,
    p_quantidade_aprovada: aprovada,
    p_quantidade_reprovada: reprovada,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/qualidade");
}

export async function executarRetrabalhoAction(formData: FormData) {
  const naoConformidadeId = String(formData.get("nao_conformidade_id") ?? "");
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  if (!naoConformidadeId) throw new Error("Não conformidade inválida.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("executar_retrabalho", {
    p_nao_conformidade_id: naoConformidadeId,
    p_observacao: observacao,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/qualidade");
}

export async function reinspecionarRetrabalhoAction(formData: FormData) {
  const naoConformidadeId = String(formData.get("nao_conformidade_id") ?? "");
  const aprovada = Number(formData.get("quantidade_aprovada") || 0);
  const reprovada = Number(formData.get("quantidade_reprovada") || 0);
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  if (!naoConformidadeId) throw new Error("Não conformidade inválida.");
  if (!Number.isFinite(aprovada) || !Number.isFinite(reprovada) || aprovada < 0 || reprovada < 0) {
    throw new Error("Quantidade aprovada e reprovada devem ser números válidos e não negativos.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reinspecionar_retrabalho", {
    p_nao_conformidade_id: naoConformidadeId,
    p_quantidade_aprovada: aprovada,
    p_quantidade_reprovada: reprovada,
    p_observacoes: observacoes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/qualidade");
}
