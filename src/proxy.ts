import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // api/ fica de fora: são rotas chamadas sem sessão de navegador (ex.:
  // Vercel Cron em src/app/api/cron/security-alerts) e autenticadas pelo
  // próprio handler (CRON_SECRET), não por cookie de sessão — do contrário
  // updateSession() redireciona pra /login antes do handler rodar.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
