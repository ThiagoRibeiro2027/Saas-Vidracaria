import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // api/cron/ e api/webhooks/ ficam de fora — rotas chamadas sem sessão de
  // navegador (Vercel Cron em src/app/api/cron/security-alerts; webhooks de
  // terceiros em src/app/api/webhooks/integracoes/[token], TÓPICO 13 §14),
  // cada uma autenticada pelo próprio handler (CRON_SECRET ou assinatura
  // HMAC), não por cookie de sessão. Achado de code-review: excluir api/
  // inteiro deixaria qualquer rota de API futura sem o redirecionamento de
  // login/MFA por padrão, mesmo uma que dependa de sessão de usuário — a
  // exclusão fica restrita aos prefixos que realmente precisam dela; uma
  // rota nova sob api/ com sessão de navegador continua passando por
  // updateSession() normalmente.
  //
  // campo-manifest.json/sw-campo.js/campo/offline.html (TÓPICO 16, ADR-008)
  // também ficam fora: são arquivos estáticos de public/ que o navegador
  // busca por conta própria (registro do service worker, <link
  // rel="manifest">, cache de instalação do próprio worker) — precisam
  // responder 200 mesmo sem sessão, nunca um redirect 307 pra /login, ou o
  // registro do service worker falha (não é HTML/JS válido). Nenhum dado de
  // negócio é servido por eles; a autorização real continua nas RPCs.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron/|api/webhooks/|campo-manifest\\.json|sw-campo\\.js|campo/offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
