import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

// ADR-010 §6, item 2.2 do Security Gate Fase 8. `supabase` é o client
// vinculado à sessão de quem está pedindo a anonimização — a autorização
// real (só platform_admin) é decidida dentro de anonymize_activity_logs_for_user()
// via auth.uid(), não aqui. Só depois que o banco aceitar o pedido é que
// usamos a service role para o passo que o Postgres não alcança: mudar o
// e-mail em auth.users via Admin API do GoTrue.
export async function anonymizeDataSubject(
  supabase: SupabaseClient,
  userId: string,
  reason?: string,
): Promise<{ rowsAnonymized: number; authEmailAnonymized: boolean }> {
  const { data: rowsAnonymized, error } = await supabase.rpc(
    "anonymize_activity_logs_for_user",
    { p_user_id: userId, p_reason: reason ?? null },
  );
  if (error) throw error;

  // E-mail sintético em domínio reservado a endereços inexistentes (RFC
  // 2606) — nunca é entregável, então não há risco de reatribuir a conta a
  // outra pessoa nem de e-mail de recuperação vazar para terceiro.
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email: `anon-${userId}@anonimizado.invalid`,
    email_confirm: true,
  });
  if (authError) {
    // Não falha a operação inteira: activity_logs e profiles já foram
    // anonimizados (irreversível, por desenho). O e-mail de auth.users fica
    // como pendência a ser resolvida manualmente — melhor que apagar o
    // rastro do que já foi feito.
    return { rowsAnonymized: rowsAnonymized ?? 0, authEmailAnonymized: false };
  }

  return { rowsAnonymized: rowsAnonymized ?? 0, authEmailAnonymized: true };
}
