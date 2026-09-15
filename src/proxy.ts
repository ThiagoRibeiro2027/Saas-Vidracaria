import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Só api/cron/ fica de fora — rotas chamadas sem sessão de navegador
  // (ex.: Vercel Cron em src/app/api/cron/security-alerts), autenticadas
  // pelo próprio handler (CRON_SECRET), não por cookie de sessão. Achado
  // de code-review: excluir api/ inteiro deixaria qualquer rota de API
  // futura sem o redirecionamento de login/MFA por padrão, mesmo uma que
  // dependa de sessão de usuário — a exclusão fica restrita ao prefixo que
  // realmente precisa dela; uma rota nova sob api/ com sessão de navegador
  // continua passando por updateSession() normalmente.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
