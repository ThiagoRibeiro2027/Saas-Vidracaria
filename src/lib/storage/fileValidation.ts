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

  const output = await sharp(input, { failOn: "error" })
    .rotate() // aplica a orientação EXIF antes de descartar os metadados
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: output.data,
    mimeType: "image/webp",
    extension: "webp",
    sizeBytes: output.data.byteLength,
    width: output.info.width,
    height: output.info.height,
  };
}
