import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Renova a sessão a cada requisição e aplica os únicos dois gates que são
// aceitáveis fora do banco: (1) exigir MFA verificado + sessão aal2 para
// platform_admins (ADR-001 §26: obrigatório) e (2) forçar troca de senha
// quando must_change_password = true. Qualquer outra decisão de acesso
// continua sendo do RLS — isto aqui é roteamento, não autorização de dado
// (Prompt Mestre item 4).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  function redirectTo(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirectResponse = NextResponse.redirect(url);
    // Preserva cookies de sessão já renovados por getAll/setAll acima.
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLoginRoute = pathname.startsWith("/login");

  if (!user) {
    return isLoginRoute ? response : redirectTo("/login");
  }

  if (isLoginRoute) {
    return redirectTo("/");
  }

  const isMfaRoute = pathname.startsWith("/mfa/");
  const isChangePasswordRoute = pathname.startsWith("/change-password");

  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

  if (isPlatformAdmin) {
    const [{ data: aal }, { data: factors }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    const hasVerifiedFactor = (factors?.totp ?? []).some((f) => f.status === "verified");
    const isStepUpDone = aal?.currentLevel === "aal2";

    if (!hasVerifiedFactor) {
      return pathname.startsWith("/mfa/enroll") ? response : redirectTo("/mfa/enroll");
    }
    if (!isStepUpDone) {
      return pathname.startsWith("/mfa/verify") ? response : redirectTo("/mfa/verify");
    }
    if (isMfaRoute) {
      return redirectTo("/"); // já cumpriu os dois requisitos, não precisa mais estar aqui
    }
    return response;
  }

  // Usuário de tenant: MFA ainda não é obrigatório (ADR-001: apenas
  // recomendado para ADMIN, opcional para os demais no MVP). Só a troca de
  // senha forçada se aplica aqui.
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .single();

  if (profile?.must_change_password) {
    return isChangePasswordRoute ? response : redirectTo("/change-password");
  }
  if (isChangePasswordRoute) {
    return redirectTo("/");
  }

  return response;
}
