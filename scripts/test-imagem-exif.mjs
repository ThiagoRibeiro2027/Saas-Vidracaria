// Auditoria TR Systems 12/10/2026 — LGPD, minimização de fotos de obra (ADR-010
// §8; ADR-008): foto de obra pode carregar GPS no EXIF — a localização da casa
// de um cliente final, dado pessoal — e dados do aparelho. O pipeline de upload
// (src/lib/storage/fileValidation.ts) converte tudo para WebP via sharp, e o
// sharp descarta o EXIF POR PADRÃO, desde que ninguém acrescente
// `.withMetadata()`/`.keepExif()`. Hoje isso vale por omissão; este teste
// transforma a omissão em contrato: se alguém passar a preservar metadados, a
// suíte falha.
//
// Exercita a função REAL (validateAndProcessFile) com uma JPEG que tem GPS de
// verdade no EXIF — não um mock. Puro, sem banco.
//
// Uso: node scripts/test-imagem-exif.mjs

import { register } from "node:module";
import sharp from "sharp";

// fileValidation.ts importa "./constants" sem extensão (válido para o Next/tsc,
// não para o Node puro). Este hook só resolve o especificador relativo com
// ".ts" quando a resolução normal falha — não altera o código do app.
register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); }
  catch (e) {
    if (e.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".")) return nextResolve(specifier + ".ts", context);
    throw e;
  }
}`),
  import.meta.url,
);

const { validateAndProcessFile } = await import("../src/lib/storage/fileValidation.ts");

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// JPEG 3000x600 (maior que o limite de 2000px) com GPS no EXIF, em São Paulo.
const entrada = await sharp({ create: { width: 3000, height: 600, channels: 3, background: { r: 200, g: 30, b: 30 } } })
  .jpeg()
  .withExif({
    IFD0: { Make: "AparelhoDeTeste", Model: "Modelo-123", Software: "teste-exif" },
    IFD3: {
      GPSLatitudeRef: "S",
      GPSLatitude: "23/1 32/1 56/1",
      GPSLongitudeRef: "W",
      GPSLongitude: "46/1 38/1 20/1",
    },
  })
  .toBuffer();

console.log("1. Premissa do teste — a foto de entrada TEM EXIF com GPS");
const metaEntrada = await sharp(entrada).metadata();
check("a JPEG de entrada carrega um bloco EXIF", !!metaEntrada.exif && metaEntrada.exif.length > 0);
check("o EXIF de entrada contém os dados de GPS e do aparelho", entrada.includes(Buffer.from("AparelhoDeTeste")) && entrada.includes(Buffer.from("Exif")));

console.log("\n2. Depois do pipeline de upload");
const saida = await validateAndProcessFile(entrada);
const metaSaida = await sharp(saida.buffer).metadata();
check("a saída é WebP", saida.mimeType === "image/webp" && metaSaida.format === "webp");
check("a saída NÃO tem bloco EXIF", !metaSaida.exif);
check("a saída NÃO tem perfil XMP", !metaSaida.xmp);
check("o modelo do aparelho não sobrou nos bytes da saída", !saida.buffer.includes(Buffer.from("AparelhoDeTeste")) && !saida.buffer.includes(Buffer.from("Modelo-123")));
check("nenhum bloco 'Exif' sobrou nos bytes da saída", !saida.buffer.includes(Buffer.from("Exif")));

console.log("\n3. Redução de tamanho continua valendo (item 21: sem fotos gigantes)");
check("a largura foi limitada a 2000px", saida.width === 2000 && metaSaida.width === 2000);
check("a saída é menor que a entrada", saida.sizeBytes < entrada.byteLength);

console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
process.exit(failed > 0 ? 1 : 0);
