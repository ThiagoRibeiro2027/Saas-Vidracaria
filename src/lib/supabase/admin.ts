import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com a service role key — ignora RLS. Uso restrito a operações
// estruturais que não podem ser feitas pelo próprio usuário (ex.: criar a
// primeira empresa e seu admin, gerar login sintético). O import de
// "server-only" impede que este módulo seja incluído em um bundle de
// Client Component por engano (Prompt Mestre item 5).
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
