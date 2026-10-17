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

// Headers de segurança (auditoria TR Systems 12/10/2026, achado 2): antes
// nenhuma resposta enviava CSP/X-Frame-Options/nosniff — o sistema podia ser
// embutido em iframe de terceiro (clickjacking).
//
// CSP: 'unsafe-inline' em script-src é concessão consciente — o Next.js
// injeta scripts inline de hidratação e a alternativa (nonce por request)
// obriga renderização dinâmica em todas as rotas. Em compensação, o resto é
// fechado: sem plugins (object-src), sem <base> estranho, sem form para
// fora, e frame-ancestors 'none' (anti-clickjacking, vale mais que o
// X-Frame-Options, mantido por compatibilidade). 'unsafe-eval' só em dev
// (React Refresh). connect-src inclui o Supabase porque o app de campo
// (PWA, ADR-008) sincroniza direto do navegador.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "https://*.supabase.co";
  }
})();
const supabaseWs = supabaseOrigin.replace(/^http/, "ws");
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// distDir separado para homologação (NEXT_DIST_DIR, exportado por
// scripts/dev-homologacao.sh) — sem isso, o Next recusa um 2º `next dev` no
// mesmo diretório de projeto mesmo em porta diferente (trava de instância
// única fica dentro de .next). Com distDir próprio, main (porta 3000) e
// homologação (porta 3001) rodam ao mesmo tempo sem conflito.
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    proxyClientMaxBodySize: MAX_UPLOAD_BODY_BYTES,
    serverActions: {
      bodySizeLimit: MAX_UPLOAD_BODY_BYTES,
    },
  },
};

export default nextConfig;
