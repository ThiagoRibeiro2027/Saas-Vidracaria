import { createClient } from "@/lib/supabase/server";
import IntegracoesSection from "./IntegracoesSection";

// TÓPICO 13 — Integrações. Fase 1 (ADR-002 v2.5 §4.17): Central de
// Integrações (configurar/ativar/desativar) e fonte oficial por tipo de
// informação. Fase 2 (ADR-002 §4.17, emenda): UI da fila técnica de
// operações — visualização de tentativas/status/erro e reprocessamento
// manual (retry/idempotência já existiam no banco desde a Fase 1). Fase 3
// (ADR-002 §4.17, emenda): webhooks recebidos de terceiros (§14) — gerar/
// rotacionar/desativar o endpoint de entrada de cada integração; o evento
// recebido cai na mesma fila da Fase 2. Sem nenhum conector externo real
// ligado ainda — "testar conexão" e "sincronizar" ficam pra quando existir
// o primeiro conector de verdade (ver cabeçalho da migration
// 20261004000000). Fase 4 (ADR-002 §4.17, emenda): webhooks de saída +
// motor de automação Evento→Condição→Ação (§14-15), só níveis Informativo
// e Assistido — a entrega HTTP de fato roda num cron
// (api/cron/integracoes-webhooks-saida), 1x/dia (plano Hobby).
export default async function IntegracoesPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "integracoes", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "integracoes", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar a Central de Integrações desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: catalogo }, { data: integracoes }, { data: fontesOficiais }, { data: operacoes }, { data: logs }] = await Promise.all([
    supabase.from("integracoes_catalogo").select("*").order("categoria").order("nome"),
    supabase.from("integracoes").select("*, integracoes_catalogo(key, nome, categoria)").order("created_at", { ascending: false }),
    supabase.from("integracao_fonte_oficial").select("*").order("tipo_informacao"),
    supabase
      .from("integracao_operacoes")
      .select("*, integracoes(apelido, integracoes_catalogo(nome))")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("activity_logs")
      .select("id, action, description, metadata, created_at")
      .like("action", "integracoes.%")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  // integracao_webhooks não tem policy de SELECT própria (secret nunca deve
  // ser lido em lote) — o único jeito de saber o status por integração é
  // chamar obter_webhook_integracao() uma vez por linha, que nunca devolve
  // o segredo.
  const webhooksPorIntegracao: Record<string, { token: string; ativo: boolean } | null> = {};
  await Promise.all(
    (integracoes ?? []).map(async (integracao) => {
      const { data } = await supabase.rpc("obter_webhook_integracao", { p_integracao_id: integracao.id });
      const row = Array.isArray(data) ? data[0] : data;
      webhooksPorIntegracao[integracao.id] = row ? { token: row.token, ativo: row.ativo } : null;
    }),
  );

  const [{ data: webhooksSaida }, { data: regras }, { data: execucoesPendentes }] = await Promise.all([
    supabase.rpc("listar_webhooks_saida"),
    supabase.from("integracao_regras").select("*").order("created_at", { ascending: false }),
    supabase
      .from("integracao_execucoes_regra")
      .select("*, integracao_regras(nome), integracao_operacoes(tipo, payload)")
      .eq("status", "aguardando_confirmacao")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 13 — INTEGRAÇÕES</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Central de Integrações</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Registro e ativação de conectores, fonte oficial por tipo de informação, fila técnica com
          idempotência/retry, webhooks recebidos de terceiros e regras de automação com webhooks de
          saída (nível Informativo ou Assistido — com confirmação manual). Nenhum conector externo
          real está ligado ainda — o catálogo abaixo só documenta os ganchos preparados (ERP
          genérico, provedor de NF-e).
        </p>

        <IntegracoesSection
          catalogo={catalogo ?? []}
          integracoes={integracoes ?? []}
          fontesOficiais={fontesOficiais ?? []}
          operacoes={operacoes ?? []}
          webhooksPorIntegracao={webhooksPorIntegracao}
          webhooksSaida={webhooksSaida ?? []}
          regras={regras ?? []}
          execucoesPendentes={execucoesPendentes ?? []}
          logs={logs ?? []}
          canManage={!!canManage}
        />
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
  background: "#f5f7f5",
  padding: "48px 16px",
} as const;

const cardStyle = {
  background: "#fff",
  padding: "32px",
  borderRadius: "8px",
  width: "960px",
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px -12px rgba(0,0,0,.18)",
} as const;

const eyebrowStyle = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "#1f5d57",
  margin: 0,
} as const;
