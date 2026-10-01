import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";

// TÓPICO 13 §29, Fase 7b — leitura do arquivo de importação. Fica fora de
// actions.ts porque um módulo "use server" só pode exportar funções async,
// e porque o exceljs é pesado e não pode vazar para o bundle do cliente
// (daí o "server-only" acima).
//
// As duas origens — CSV e XLSX — devolvem exatamente a mesma forma
// { colunas, linhas }, com todo valor já em texto. Tudo daí para frente
// (mapeamento, prévia, gravação, histórico) não sabe nem precisa saber de
// que formato o arquivo veio.
export type ImportacaoLinha = Record<string, string>;
export type ArquivoLido = { colunas: string[]; linhas: ImportacaoLinha[] };

// Regra 12 do CLAUDE.md: validar tamanho e tipo REAL, nunca o MIME que o
// cliente informa. O tipo real é provado pelo parse — um binário renomeado
// para .csv não produz cabeçalho, e um arquivo que não é um zip OOXML faz
// o exceljs falhar.
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;

function validarColunas(brutas: { nome: string; indice: number }[]): { nome: string; indice: number }[] {
  const preenchidas = brutas.filter((c) => c.nome !== "");
  if (preenchidas.length === 0) {
    throw new Error("Não foi possível ler o cabeçalho do arquivo (primeira linha).");
  }
  const vistas = new Set<string>();
  const repetidas = new Set<string>();
  for (const c of preenchidas) {
    if (vistas.has(c.nome)) repetidas.add(c.nome);
    vistas.add(c.nome);
  }
  // Duas colunas com o mesmo nome fariam uma sobrescrever a outra em
  // silêncio — inclusive no CSV, onde o parser já colapsa as duas na mesma
  // chave. Melhor recusar e dizer o que renomear.
  if (repetidas.size > 0) {
    throw new Error(
      `Cabeçalho com coluna repetida: ${[...repetidas].join(", ")}. Renomeie para que cada coluna tenha um nome único.`,
    );
  }
  return preenchidas;
}

// Uma célula de planilha pode ser texto, número, data, fórmula, texto rico
// ou hyperlink. Tudo vira texto, porque é isso que as funções de
// importação do banco recebem (jsonb de strings).
function celulaParaTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) {
    // Data de planilha é guardada em UTC pelo exceljs. Ler as partes em UTC
    // evita voltar um dia em fuso negativo — o mesmo erro corrigido na
    // manutenção preventiva em 28/09/2026.
    const ano = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(valor.getUTCDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }
  if (typeof valor === "object") {
    const v = valor as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return v.richText.map((p) => celulaParaTexto((p as { text?: unknown }).text)).join("").trim();
    }
    // Fórmula: interessa o resultado calculado, não a fórmula em si.
    if ("result" in v) return celulaParaTexto(v.result);
    if ("text" in v) return celulaParaTexto(v.text);
    // Célula em erro (#N/A, #REF!) entra como vazia e a validação por
    // linha do banco reclama do campo faltando, com a linha identificada.
    return "";
  }
  return String(valor).trim();
}

async function lerCsv(file: File): Promise<ArquivoLido> {
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
  const colunas = validarColunas(
    (resultado.meta.fields ?? []).map((nome, indice) => ({ nome: nome.trim(), indice })),
  ).map((c) => c.nome);
  return { colunas, linhas: resultado.data };
}

async function lerXlsx(file: File): Promise<ArquivoLido> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("Não foi possível abrir a planilha. Confira se o arquivo é mesmo .xlsx e não está corrompido.");
  }

  const planilha = workbook.worksheets[0];
  if (!planilha) throw new Error("A planilha não tem nenhuma aba.");

  const cabecalho = planilha.getRow(1);
  const colunas = validarColunas(
    Array.from({ length: planilha.columnCount }, (_, i) => ({
      nome: celulaParaTexto(cabecalho.getCell(i + 1).value),
      indice: i + 1,
    })),
  );

  const linhas: ImportacaoLinha[] = [];
  for (let n = 2; n <= planilha.rowCount; n++) {
    const linha = planilha.getRow(n);
    const registro: ImportacaoLinha = {};
    let temConteudo = false;
    for (const coluna of colunas) {
      const texto = celulaParaTexto(linha.getCell(coluna.indice).value);
      registro[coluna.nome] = texto;
      if (texto !== "") temConteudo = true;
    }
    // Linha totalmente vazia no meio da planilha é resíduo de edição, não
    // registro — entraria como "inválido" e sujaria a conferência.
    if (temConteudo) linhas.push(registro);
  }
  if (linhas.length === 0) throw new Error("Planilha sem linhas de dados (só o cabeçalho).");

  // Só a primeira aba é lida — a tela avisa isso, para ninguém descobrir
  // depois que metade da planilha ficou de fora.
  return { colunas: colunas.map((c) => c.nome), linhas };
}

export async function lerPlanilha(file: File): Promise<ArquivoLido> {
  if (file.size > TAMANHO_MAXIMO_BYTES) {
    throw new Error(
      `Arquivo maior que o limite de ${TAMANHO_MAXIMO_BYTES / 1024 / 1024} MB. Divida a importação em partes.`,
    );
  }
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".xlsx")) return lerXlsx(file);
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) return lerCsv(file);
  // .xls (formato binário antigo) e .ods não são suportados: o exceljs não
  // lê nenhum dos dois. Dizer isso é melhor que falhar com erro de parse.
  throw new Error("Formato não suportado. Use .csv ou .xlsx (o formato .xls antigo precisa ser salvo como .xlsx).");
}
