"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { CAMPOS_PESSOAS, CAMPOS_ITENS } from "./importacao-campos";

// TÓPICO 2 §28 / ADR-002 §4.2.1 — importação inicial de dados. Só CSV
// nesta fase (decisão de escopo registrada na migration
// 20260929000000_topico2_importacao_inicial.sql). Histórico,
// reprocessamento e mapeamento de colunas vieram depois, na Fase 7 do
// TÓPICO 13 §29 (migration 20261201000000).
export type ImportacaoLinha = Record<string, string>;
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
      mapeamento?: undefined;
      arquivoNome?: undefined;
      origemImportacaoId?: undefined;
    }
  | undefined;

// Regra 12 do CLAUDE.md (validar tamanho e tipo real, nunca só o MIME que
// o cliente informa): o limite é checado aqui, e "é CSV mesmo?" é provado
// pelo próprio parse — um binário renomeado para .csv não produz
// cabeçalho nem linhas e cai nos erros abaixo.
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;

async function lerCsv(file: File): Promise<{ colunas: string[]; linhas: ImportacaoLinha[] }> {
  if (file.size > TAMANHO_MAXIMO_BYTES) {
    throw new Error(
      `Arquivo maior que o limite de ${TAMANHO_MAXIMO_BYTES / 1024 / 1024} MB. Divida a importação em partes.`,
    );
  }
  const texto = await file.text();
  const resultado = Papa.parse<ImportacaoLinha>(texto, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (resultado.errors.length > 0) {
    const e = resultado.errors[0];
    throw new Error(`Erro ao ler o CSV (linha ${e.row ?? "?"}): ${e.message}`);
  }
  if (resultado.data.length === 0) {
    throw new Error("Arquivo CSV vazio ou sem linhas de dados.");
  }
  const colunas = (resultado.meta.fields ?? []).filter((c) => c.trim() !== "");
  if (colunas.length === 0) {
    throw new Error("Não foi possível ler o cabeçalho do arquivo (primeira linha).");
  }
  return { colunas, linhas: resultado.data };
}

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

  revalidatePath("/cadastros");
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

  revalidatePath("/cadastros");
  revalidatePath("/estoque");
}

function normalizarResultadosPessoas(rows: {
  linha: number;
  documento: string | null;
  nome: string | null;
  status: string | null;
  erro: string | null;
  campos_alterados: string[] | null;
}[]): ImportacaoResultadoLinha[] {
  return rows.map((r) => ({
    linha: r.linha,
    identificador: r.documento,
    rotulo: r.nome,
    status: r.status as ImportacaoResultadoLinha["status"],
    erro: r.erro,
    campos_alterados: r.campos_alterados,
  }));
}

function normalizarResultadosItens(rows: {
  linha: number;
  codigo: string | null;
  descricao: string | null;
  status: string | null;
  erro: string | null;
  campos_alterados: string[] | null;
}[]): ImportacaoResultadoLinha[] {
  return rows.map((r) => ({
    linha: r.linha,
    identificador: r.codigo,
    rotulo: r.descricao,
    status: r.status as ImportacaoResultadoLinha["status"],
    erro: r.erro,
    campos_alterados: r.campos_alterados,
  }));
}

export async function previsualizarImportacaoPessoasAction(
  _prevState: ImportacaoState,
  formData: FormData,
): Promise<ImportacaoState> {
  const arquivo = formData.get("arquivo") as File | null;
  if (!arquivo || arquivo.size === 0) return { error: "Selecione um arquivo CSV." };

  let lido: { colunas: string[]; linhas: ImportacaoLinha[] };
  try {
    lido = await lerCsv(arquivo);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao ler o arquivo." };
  }

  const mapeamento = lerMapeamentoDoForm(formData, lido.colunas, CAMPOS_PESSOAS);
  const linhas = aplicarMapeamento(lido.linhas, mapeamento);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("importar_pessoas", { p_linhas: linhas, p_dry_run: true });
  if (error) return { error: error.message };

  return {
    linhas,
    resultados: normalizarResultadosPessoas(data ?? []),
    confirmado: false,
    colunasArquivo: lido.colunas,
    mapeamento,
    arquivoNome: arquivo.name,
  };
}

export async function confirmarImportacaoPessoasAction(
  _prevState: ImportacaoState,
  formData: FormData,
): Promise<ImportacaoState> {
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
  const { data, error } = await supabase.rpc("importar_pessoas", {
    p_linhas: linhas,
    p_dry_run: false,
    p_arquivo_nome: arquivoNome,
    p_origem_importacao_id: origem,
  });
  if (error) return { error: error.message };

  revalidatePath("/cadastros");
  return {
    linhas,
    resultados: normalizarResultadosPessoas(data ?? []),
    confirmado: true,
    arquivoNome,
    origemImportacaoId: origem,
  };
}

export async function previsualizarImportacaoItensAction(
  _prevState: ImportacaoState,
  formData: FormData,
): Promise<ImportacaoState> {
  const arquivo = formData.get("arquivo") as File | null;
  if (!arquivo || arquivo.size === 0) return { error: "Selecione um arquivo CSV." };

  let lido: { colunas: string[]; linhas: ImportacaoLinha[] };
  try {
    lido = await lerCsv(arquivo);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao ler o arquivo." };
  }

  const mapeamento = lerMapeamentoDoForm(formData, lido.colunas, CAMPOS_ITENS);
  const linhas = aplicarMapeamento(lido.linhas, mapeamento);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("importar_itens", { p_linhas: linhas, p_dry_run: true });
  if (error) return { error: error.message };

  return {
    linhas,
    resultados: normalizarResultadosItens(data ?? []),
    confirmado: false,
    colunasArquivo: lido.colunas,
    mapeamento,
    arquivoNome: arquivo.name,
  };
}

export async function confirmarImportacaoItensAction(
  _prevState: ImportacaoState,
  formData: FormData,
): Promise<ImportacaoState> {
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
  const { data, error } = await supabase.rpc("importar_itens", {
    p_linhas: linhas,
    p_dry_run: false,
    p_arquivo_nome: arquivoNome,
    p_origem_importacao_id: origem,
  });
  if (error) return { error: error.message };

  revalidatePath("/cadastros");
  return {
    linhas,
    resultados: normalizarResultadosItens(data ?? []),
    confirmado: true,
    arquivoNome,
    origemImportacaoId: origem,
  };
}

// Reprocessamento (TÓPICO 13 §29): traz de volta o payload original das
// linhas que falharam numa importação anterior e roda a prévia com elas.
// Não existe um caminho de gravação próprio — a confirmação usa as mesmas
// actions acima, agora com origem_importacao_id preenchido, para o
// histórico ligar a tentativa nova à original.
export async function reprocessarImportacaoAction(
  _prevState: ImportacaoState,
  formData: FormData,
): Promise<ImportacaoState> {
  const importacaoId = String(formData.get("importacao_id") ?? "");
  const entidade = String(formData.get("entidade") ?? "");
  if (!importacaoId) return { error: "Importação não informada." };
  if (entidade !== "pessoas" && entidade !== "itens") {
    return { error: `Entidade de importação inválida: ${entidade}` };
  }

  const supabase = await createClient();
  const { data: linhasComErro, error: erroLeitura } = await supabase.rpc("obter_linhas_com_erro", {
    p_importacao_id: importacaoId,
  });
  if (erroLeitura) return { error: erroLeitura.message };

  const linhas = (linhasComErro ?? []) as ImportacaoLinha[];
  if (linhas.length === 0) {
    return { error: "Esta importação não tem linhas com erro para reprocessar." };
  }

  const { data, error } = await supabase.rpc(
    entidade === "pessoas" ? "importar_pessoas" : "importar_itens",
    { p_linhas: linhas, p_dry_run: true },
  );
  if (error) return { error: error.message };

  return {
    linhas,
    resultados:
      entidade === "pessoas"
        ? normalizarResultadosPessoas(data ?? [])
        : normalizarResultadosItens(data ?? []),
    confirmado: false,
    origemImportacaoId: importacaoId,
  };
}
