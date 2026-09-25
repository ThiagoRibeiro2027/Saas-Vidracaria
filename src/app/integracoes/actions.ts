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
