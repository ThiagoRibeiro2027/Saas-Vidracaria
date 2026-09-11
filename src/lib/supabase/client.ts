import { createBrowserClient } from "@supabase/ssr";

// Cliente para uso em Client Components. Usa apenas a anon key — nunca a
// service role (Prompt Mestre de Segurança item 5: service role key nunca
// no navegador). A autorização real acontece via RLS no banco.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
