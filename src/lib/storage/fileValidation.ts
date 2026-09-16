import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "./constants";

export { MAX_FILE_SIZE_BYTES, MAX_FILES_PER_UPLOAD } from "./constants";

// Nunca confiar no que o navegador declara (Content-Type, extensão do
// nome) — sempre inspecionar os bytes (Prompt Mestre item 15/21).
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_MIME_TYPES_SET = new Set<string>(ALLOWED_MIME_TYPES);
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const MAX_IMAGE_DIMENSION = 2000; // px — item 21: não armazenar fotos gigantescas
const IMAGE_QUALITY = 80;

// F17 (Mapa_Fases_Lacunas_Risco.md, 15/09/2026): o limite de bytes do
// arquivo comprimido (MAX_FILE_SIZE_BYTES) não protege contra
// decompression bomb — um PNG pequeno pode declarar dimensões enormes e
// estourar memória na descompressão. sharp() sem limitInputPixels usa o
// default da libvips (~268 megapixels, hoje ainda ~1GB de buffer RGBA por
// decodificação); reduzimos pra um teto generoso o bastante pra qualquer
// foto real (câmera de 50MP tira ~8000x6250) mas que barra entradas
// desproporcionais antes de alocar o buffer de pixels. failOn: "error" já
// evita processar arquivos truncados/corrompidos.
const MAX_INPUT_PIXELS = 50_000_000;
// Watchdog de tempo: limitInputPixels barra o caso comum (dimensões
// declaradas gigantescas), mas não cobre toda entrada patológica que seja
// lenta de decodificar dentro do limite. Isto não cancela o trabalho nativo
// da libvips já em andamento, mas garante que a requisição do usuário não
// fique pendurada indefinidamente.
const PROCESSING_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new FileValidationError(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export class FileValidationError extends Error {}

export type ProcessedFile = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  width?: number;
  height?: number;
};

// Pipeline do item 21 para imagens: original → validação → redimensionamento
// → compressão → formato eficiente → Storage. PDFs seguem direto (apenas
// validados), pois compressão de PDF está fora do escopo desta fase.
export async function validateAndProcessFile(input: Buffer): Promise<ProcessedFile> {
  if (input.byteLength === 0) {
    throw new FileValidationError("Arquivo vazio.");
  }
  if (input.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new FileValidationError(
      `Arquivo excede o limite de ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MiB.`,
    );
  }

  const detected = await fileTypeFromBuffer(input);
  if (!detected || !ALLOWED_MIME_TYPES_SET.has(detected.mime)) {
    throw new FileValidationError(
      "Tipo de arquivo não permitido (aceitos: JPEG, PNG, WEBP, PDF).",
    );
  }

  if (!IMAGE_MIME_TYPES.has(detected.mime)) {
    return {
      buffer: input,
      mimeType: detected.mime,
      extension: EXTENSION_BY_MIME[detected.mime],
      sizeBytes: input.byteLength,
    };
  }

  let output;
  try {
    output = await withTimeout(
      sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
        .rotate() // aplica a orientação EXIF antes de descartar os metadados
        .resize({
          width: MAX_IMAGE_DIMENSION,
          height: MAX_IMAGE_DIMENSION,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: IMAGE_QUALITY })
        .toBuffer({ resolveWithObject: true }),
      PROCESSING_TIMEOUT_MS,
      "Tempo excedido ao processar a imagem.",
    );
  } catch (err) {
    if (err instanceof FileValidationError) throw err;
    throw new FileValidationError("Não foi possível processar a imagem (dimensões inválidas ou arquivo corrompido).");
  }

  return {
    buffer: output.data,
    mimeType: "image/webp",
    extension: "webp",
    sizeBytes: output.data.byteLength,
    width: output.info.width,
    height: output.info.height,
  };
}
