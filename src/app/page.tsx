import { createClient } from "@/lib/supabase/server";
import { marcarNotificacaoLidaAction } from "./notificacoes/actions";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const PRIORIDADE_TONE: Record<string, "neutral" | "warning" | "danger"> = {
  informativa: "neutral",
  atencao: "warning",
  importante: "warning",
  critica: "danger",
};

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Toda a filtragem por empresa acontece via RLS no banco (current_company_id()),
  // nunca por um where manual aqui — a Fase 2 não confia no servidor de
  // aplicação como fronteira de segurança, só no banco.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, login_identifier, companies(name, slug)")
    .eq("id", user?.id ?? "")
    .single();

  const { data: roles } = await supabase
    .from("user_roles")
    .select("roles(name, key)")
    .is("valid_until", null);

  // ADR-007 — só as não lidas aqui; histórico completo fica pra quando
  // houver tela dedicada (fora deste recorte).
  const { data: notificacoes } = await supabase
    .from("notificacoes")
    .select("id, titulo, mensagem, prioridade, acao_necessaria, created_at")
    .eq("lida", false)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold text-text">
        Olá, {profile?.display_name ?? "usuário"}
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        {/* @ts-expect-error -- relação aninhada tipada como array pelo supabase-js */}
        Empresa: {profile?.companies?.name} · Matrícula: {profile?.login_identifier}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card padding="sm">
          <p className="text-xs text-text-muted">Notificações pendentes</p>
          <p className="mt-1 text-2xl font-semibold text-text">{notificacoes?.length ?? 0}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-text-muted">Papéis ativos</p>
          <p className="mt-1 text-2xl font-semibold text-text">{roles?.length ?? 0}</p>
        </Card>
      </div>

      <Card className="mt-6">
        <CardTitle>Notificações não lidas</CardTitle>
        {(notificacoes ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Nenhuma notificação pendente.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {notificacoes?.map((n) => (
              <div key={n.id} className="rounded-md border border-border-subtle p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={PRIORIDADE_TONE[n.prioridade] ?? "neutral"}>{n.titulo}</Badge>
                  <form action={marcarNotificacaoLidaAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="text-xs text-primary hover:underline">
                      marcar como lida
                    </button>
                  </form>
                </div>
                <p className="mt-1.5 text-text-muted">{n.mensagem}</p>
                {n.acao_necessaria && (
                  <p className="mt-1 italic text-text-muted">{n.acao_necessaria}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardTitle>Papéis ativos</CardTitle>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-text">
          {roles?.map((r, i) => (
            // @ts-expect-error -- relação aninhada tipada como array pelo supabase-js
            <li key={i}>{r.roles?.name}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
