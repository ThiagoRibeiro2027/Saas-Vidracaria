import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente para Server Components, Route Handlers e Server Actions. Usa a
// anon key + os cookies da sessão do usuário — toda leitura/escrita passa
// pelas policies de RLS, nunca por bypass de company_id vindo do cliente.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado a partir de um Server Component sem permissão de
            // escrita de cookies — o middleware já cuida do refresh de
            // sessão nesse caso, então é seguro ignorar aqui.
          }
        },
      },
    },
  );
}
