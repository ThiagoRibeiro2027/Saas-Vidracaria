import type { NextConfig } from "next";
import { MAX_FILE_SIZE_BYTES } from "./src/lib/storage/constants";

// O Next.js aplica DOIS limites de corpo de requisição em camadas
// diferentes, e os dois pegam upload de arquivo porque src/proxy.ts roda em
// toda rota (inclusive Server Actions):
//
// 1. proxyClientMaxBodySize — quanto o proxy buferiza para poder ler o
//    corpo (necessário desde que middleware virou proxy). Acima disso o
//    corpo é truncado SILENCIOSAMENTE antes de chegar na Server Action,
//    quebrando o parser de multipart com "Unexpected end of form" em vez de
//    um erro claro de limite excedido.
// 2. serverActions.bodySizeLimit — o limite de corpo da própria Server
//    Action (padrão 1 MB, existe para evitar abuso — Prompt Mestre item
//    25/26).
//
// Os dois precisam cobrir pelo menos 1 arquivo de MAX_FILE_SIZE_BYTES
// (src/lib/storage/constants.ts) + margem para o overhead do
// multipart/form-data e do próprio protocolo de Server Actions — nunca o
// lote inteiro, pois cada upload em src/app/files/UploadForm.tsx envia 1
// arquivo por chamada.
const MAX_UPLOAD_BODY_BYTES = MAX_FILE_SIZE_BYTES + 4 * 1024 * 1024; // +4 MiB de folga

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: MAX_UPLOAD_BODY_BYTES,
    serverActions: {
      bodySizeLimit: MAX_UPLOAD_BODY_BYTES,
    },
  },
};

export default nextConfig;
