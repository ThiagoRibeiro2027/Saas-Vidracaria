// Constantes puras (sem sharp/file-type) para poderem ser importadas tanto
// no servidor quanto em Client Components, sem puxar dependências nativas
// para o bundle do navegador.

// Prompt Mestre de Segurança item 21: limite de tamanho, MIME, extensão e
// proteção contra arquivos maliciosos.
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // espelha o limite do bucket company-files
export const MAX_FILES_PER_UPLOAD = 10; // proteção técnica contra abuso (item 25), não é regra de negócio de módulo

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
