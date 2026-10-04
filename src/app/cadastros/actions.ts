"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { lerPlanilha, type ImportacaoLinha } from "./importacao-arquivo";
import { entidadePorChave, type EntidadeImportacao } from "./importacao-entidades";

// TÓPICO 2 §28 / ADR-002 §4.2.1 — importação inicial de dados. Só CSV
// nesta fase (decisão de escopo registrada na migration
// 20260929000000_topico2_importacao_inicial.sql). Histórico,
// reprocessamento e mapeamento de colunas vieram depois, na Fase 7 do
// TÓPICO 13 §29 (migration 20261201000000).
export type { ImportacaoLinha };
export type ImportacaoResultadoLinha = {
  linha: number;
  identificador: string | null;
  rotulo: string | null;
  status: "novo" | "atualizacao" | "invalido" | "duplicado_no_arquivo" | null;
  erro: string | null;
  campos_alterados: string[] | null;
};

export type ImportacaoState =
  | {
      linhas: ImportacaoLinha[];
      resultados: ImportacaoResultadoLinha[];
      confirmado: boolean;
      colunasArquivo?: string[];
      // Linhas como vieram do arquivo, antes do mapeamento — é o que a
      // re-prévia reenvia, já que o React limpa o input de arquivo.
      linhasBrutas?: ImportacaoLinha[];
      mapeamento?: Record<string, string>;
      arquivoNome?: string | null;
      origemImportacaoId?: string | null;
      error?: undefined;
    }
  | {
      error: string;
      linhas?: undefined;
      resultados?: undefined;
      confirmado?: undefined;
      colunasArquivo?: undefined;
      linhasBrutas?: undefined;
      mapeamento?: undefined;
      arquivoNome?: undefined;
      origemImportacaoId?: undefined;
    }
  | undefined;

// Normalização só para COMPARAR nomes de coluna: minúsculas, sem acento e
// sem separador. Faz "Nome Fantasia", "nome_fantasia" e "NOME-FANTASIA"
// caírem no mesmo campo, sem obrigar quem exportou de outro sistema a
// renomear coluna na mão.
function chaveComparavel(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function sugerirMapeamento(colunas: string[], campos: readonly string[]): Record<string, string> {
  const porChave = new Map(campos.map((c) => [chaveComparavel(c), c]));
  const mapeamento: Record<string, string> = {};
  const jaUsados = new Set<string>();
  for (const coluna of colunas) {
    const campo = porChave.get(chaveComparavel(coluna));
    // Coluna sem correspondência fica com destino vazio — a tela mostra
    // "(ignorar)" e o usuário escolhe, em vez de o sistema adivinhar.
    if (campo && !jaUsados.has(campo)) {
      mapeamento[coluna] = campo;
      jaUsados.add(campo);
    } else {
      mapeamento[coluna] = "";
    }
  }
  return mapeamento;
}

function aplicarMapeamento(
  linhas: ImportacaoLinha[],
  mapeamento: Record<string, string>,
): ImportacaoLinha[] {
  return linhas.map((linha) => {
    const destino: ImportacaoLinha = {};
    for (const [coluna, campo] of Object.entries(mapeamento)) {
      if (!campo) continue;
      destino[campo] = linha[coluna] ?? "";
    }
    return destino;
  });
}

// O React limpa o <input type="file"> depois que a action do formulário
// responde. Sem isto, "Pré-visualizar novamente" (o passo em que o usuário
// ajusta o mapeamento) vai ao servidor sem arquivo nenhum — e o campo
// being `required` faz o browser simplesmente engolir o clique. Por isso a
// re-prévia reenvia as linhas JÁ LIDAS, e o arquivo só é obrigatório na
// primeira leitura.
type EntradaImportacao = { colunas: string[]; linhas: ImportacaoLinha[]; arquivoNome: string | null };

async function lerEntrada(formData: FormData): Promise<EntradaImportacao | { error: string }> {
  const arquivo = formData.get("arquivo") as File | null;
  if (arquivo && arquivo.size > 0) {
    try {
      const { colunas, linhas } = await lerPlanilha(arquivo);
      return { colunas, linhas, arquivoNome: arquivo.name };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Falha ao ler o arquivo." };
    }
  }

  const brutasRaw = String(formData.get("linhas_brutas") ?? "");
  if (brutasRaw === "") return { error: "Selecione um arquivo .csv ou .xlsx." };
  try {
    const bruto = JSON.parse(brutasRaw) as { colunas: string[]; linhas: ImportacaoLinha[] };
    if (!Array.isArray(bruto.colunas) || !Array.isArray(bruto.linhas) || bruto.linhas.length === 0) {
      return { error: "Sessão de importação inválida — reenvie o arquivo." };
    }
    return {
      colunas: bruto.colunas,
      linhas: bruto.linhas,
      arquivoNome: String(formData.get("arquivo_nome") ?? "") || null,
    };
  } catch {
    return { error: "Sessão de importação inválida — reenvie o arquivo." };
  }
}

function lerMapeamentoDoForm(
  formData: FormData,
  colunas: string[],
  campos: readonly string[],
): Record<string, string> {
  const bruto = formData.get("mapeamento");
  if (typeof bruto !== "string" || bruto.trim() === "") {
    return sugerirMapeamento(colunas, campos);
  }
  let informado: Record<string, unknown>;
  try {
    informado = JSON.parse(bruto);
  } catch {
    return sugerirMapeamento(colunas, campos);
  }
  const permitidos = new Set<string>(campos);
  const mapeamento: Record<string, string> = {};
  for (const coluna of colunas) {
    const campo = informado[coluna];
    // Destino que não seja um campo conhecido vira "ignorar" — o usuário
    // não escolhe nome de campo livre, só um da lista.
    mapeamento[coluna] = typeof campo === "string" && permitidos.has(campo) ? campo : "";
  }
  return mapeamento;
}

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

  revalidatePath("/cadastros");
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

  revalidatePath("/cadastros");
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

  revalidatePath("/cadastros");
}

// =========================================================================
// Importação — Fase 8a: uma action por etapa, não por entidade.
//
// A entidade chega pelo formulário e é resolvida contra o registro em
// importacao-entidades.ts. Nome que não está no registro é recusado antes
// de qualquer chamada ao banco, então o cliente não escolhe que função SQL
// será executada — ele escolhe entre as que o registro permite.
// =========================================================================

// As funções importar_<x> devolvem sempre (linha, <identificador>,
// <rotulo>, status, erro, campos_alterados). Quais são as duas colunas do
// meio muda por entidade, e é o registro que diz.
function normalizarResultados(
  rows: Record<string, unknown>[],
  entidade: EntidadeImportacao,
): ImportacaoResultadoLinha[] {
  return rows.map((r) => ({
    linha: Number(r.linha),
    identificador: (r[entidade.colunaIdentificador] as string | null) ?? null,
    rotulo: (r[entidade.colunaRotulo] as string | null) ?? null,
    status: r.status as ImportacaoResultadoLinha["status"],
    erro: (r.erro as string | null) ?? null,
    campos_alterados: (r.campos_alterados as string[] | null) ?? null,
  }));
}

// Reprocessamento (TÓPICO 13 §29): traz de volta o payload original das
// linhas que falharam numa importação anterior e roda a prévia com elas.
// Não tem caminho de gravação próprio — a confirmação usa a mesma action
// de confirmar, agora com origem_importacao_id preenchido, para o histórico
// ligar a tentativa nova à original.
//
// Não é uma action separada de propósito: reprocessar produz uma PRÉVIA,
// igual a subir um arquivo. Com dois estados de formulário concorrentes, a
// tela mostrava a prévia do reprocessamento mesmo depois de o usuário subir
// um arquivo novo — o estado velho vencia. Um estado só elimina a disputa.
async function previaDeReprocessamento(
  formData: FormData,
  entidade: EntidadeImportacao,
): Promise<ImportacaoState | null> {
  const importacaoId = String(formData.get("importacao_id") ?? "");
  if (!importacaoId) return null;

  const supabase = await createClient();
  const { data: linhasComErro, error: erroLeitura } = await supabase.rpc("obter_linhas_com_erro", {
    p_importacao_id: importacaoId,
  });
  if (erroLeitura) return { error: erroLeitura.message };

  const linhas = (linhasComErro ?? []) as ImportacaoLinha[];
  if (linhas.length === 0) {
    return { error: "Esta importação não tem linhas com erro para reprocessar." };
  }

  // Carrega o nome do arquivo original para o reprocessamento herdar: sem
  // isso a linha nova do histórico fica sem arquivo nenhum, e quem olha
  // depois não liga a tentativa ao arquivo que a originou.
  const { data: origem } = await supabase
    .from("importacoes")
    .select("arquivo_nome")
    .eq("id", importacaoId)
    .maybeSingle();

  const { data, error } = await supabase.rpc(entidade.rpc, { p_linhas: linhas, p_dry_run: true });
  if (error) return { error: error.message };

  return {
    linhas,
    resultados: normalizarResultados((data ?? []) as Record<string, unknown>[], entidade),
    confirmado: false,
    arquivoNome: origem?.arquivo_nome ?? null,
    origemImportacaoId: importacaoId,
  };
}

export async function previsualizarImportacaoAction(
  _prevState: ImportacaoState,
  formData: FormData,
): Promise<ImportacaoState> {
  const entidade = entidadePorChave(String(formData.get("entidade") ?? ""));
  if (!entidade) return { error: "Entidade de importação inválida." };

  // A mesma action atende ao reprocessamento: os dois produzem uma prévia.
  const reprocessamento = await previaDeReprocessamento(formData, entidade);
  if (reprocessamento) return reprocessamento;

  const lido = await lerEntrada(formData);
  if ("error" in lido) return { error: lido.error };

  const mapeamento = lerMapeamentoDoForm(formData, lido.colunas, entidade.campos);
  const linhas = aplicarMapeamento(lido.linhas, mapeamento);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(entidade.rpc, { p_linhas: linhas, p_dry_run: true });
  if (error) return { error: error.message };

  return {
    linhas,
    resultados: normalizarResultados((data ?? []) as Record<string, unknown>[], entidade),
    confirmado: false,
    colunasArquivo: lido.colunas,
    linhasBrutas: lido.linhas,
    mapeamento,
    arquivoNome: lido.arquivoNome,
  };
}

export async function confirmarImportacaoAction(
  _prevState: ImportacaoState,
  formData: FormData,
): Promise<ImportacaoState> {
  const entidade = entidadePorChave(String(formData.get("entidade") ?? ""));
  if (!entidade) return { error: "Entidade de importação inválida." };

  const linhasRaw = String(formData.get("linhas") ?? "");
  let linhas: ImportacaoLinha[];
  try {
    linhas = JSON.parse(linhasRaw);
  } catch {
    return { error: "Sessão de importação inválida — reenvie o arquivo." };
  }

  const arquivoNome = String(formData.get("arquivo_nome") ?? "") || null;
  const origem = String(formData.get("origem_importacao_id") ?? "") || null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(entidade.rpc, {
    p_linhas: linhas,
    p_dry_run: false,
    p_arquivo_nome: arquivoNome,
    p_origem_importacao_id: origem,
  });
  if (error) return { error: error.message };

  // Revalida a tela dona do dado, não sempre /cadastros: importar recurso
  // produtivo precisa atualizar /producao para o usuário ver o resultado.
  revalidatePath(entidade.caminhoRevalidar);
  return {
    linhas,
    resultados: normalizarResultados((data ?? []) as Record<string, unknown>[], entidade),
    confirmado: true,
    arquivoNome,
    origemImportacaoId: origem,
  };
}
