import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "./login/actions";
import { marcarNotificacaoLidaAction } from "./notificacoes/actions";

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

  const PRIORIDADE_COR: Record<string, string> = {
    informativa: "#6b7a75",
    atencao: "#b7791f",
    importante: "#c05621",
    critica: "#9b2c2c",
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        fontFamily: "system-ui, sans-serif",
        background: "#f5f7f5",
        padding: "48px",
      }}
    >
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        <p style={{ fontSize: "12px", letterSpacing: ".05em", color: "#1f5d57", fontFamily: "monospace" }}>
          FASE 6 — SAAS GOVERNANCE
        </p>
        <h1 style={{ fontSize: "24px", marginBottom: "4px" }}>
          Olá, {profile?.display_name ?? "usuário"}
        </h1>
        <p style={{ color: "#3e4d49", marginTop: 0 }}>
          {/* @ts-expect-error -- relação aninhada tipada como array pelo supabase-js */}
          Empresa: {profile?.companies?.name} ({profile?.companies?.slug}) · Matrícula:{" "}
          {profile?.login_identifier}
        </p>

        {(notificacoes ?? []).length > 0 && (
          <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <p style={{ fontSize: "13px", color: "#6b7a75", margin: 0 }}>
              Notificações não lidas ({notificacoes?.length}):
            </p>
            {notificacoes?.map((n) => (
              <div
                key={n.id}
                style={{ border: "1px solid #eef1ef", borderRadius: "6px", padding: "8px 10px", fontSize: "13px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                  <strong style={{ color: PRIORIDADE_COR[n.prioridade] ?? "#3e4d49" }}>{n.titulo}</strong>
                  <form action={marcarNotificacaoLidaAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      style={{ background: "none", border: "none", color: "#1f5d57", fontSize: "11px", cursor: "pointer" }}
                    >
                      marcar como lida
                    </button>
                  </form>
                </div>
                <p style={{ margin: "2px 0 0", color: "#3e4d49" }}>{n.mensagem}</p>
                {n.acao_necessaria && (
                  <p style={{ margin: "2px 0 0", color: "#6b7a75", fontStyle: "italic" }}>{n.acao_necessaria}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: "13px", color: "#6b7a75", marginTop: "24px" }}>
          Papéis ativos (lidos via RLS, isolados por empresa):
        </p>
        <ul>
          {roles?.map((r, i) => (
            // @ts-expect-error -- relação aninhada tipada como array pelo supabase-js
            <li key={i}>{r.roles?.name}</li>
          ))}
        </ul>

        <p style={{ marginTop: "24px" }}>
          <a href="/files" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Central de arquivos →
          </a>
        </p>
        <p style={{ marginTop: "4px" }}>
          <a href="/audit" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Central de auditoria →
          </a>
        </p>
        <p style={{ marginTop: "4px" }}>
          <a href="/governance" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Empresas e assinaturas →
          </a>
        </p>
        <p style={{ marginTop: "4px" }}>
          <a href="/export" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Exportar dados →
          </a>
        </p>
        <p style={{ marginTop: "4px" }}>
          <a href="/configuracoes" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Configurações →
          </a>
        </p>
        <p style={{ marginTop: "4px" }}>
          <a href="/cadastros" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Cadastros →
          </a>
        </p>
        <p style={{ marginTop: "4px" }}>
          <Link href="/usuarios" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Usuários e Permissões →
          </Link>
        </p>
        <p style={{ marginTop: "4px" }}>
          <Link href="/campo" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Instalação — Campo (PWA) →
          </Link>
        </p>
        <p style={{ marginTop: "4px" }}>
          <Link href="/suprimentos" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Suprimentos →
          </Link>
        </p>
        <p style={{ marginTop: "4px" }}>
          <Link href="/financeiro" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Financeiro →
          </Link>
        </p>
        <p style={{ marginTop: "4px" }}>
          <Link href="/rh" style={{ color: "#1f5d57", fontSize: "13px" }}>
            RH →
          </Link>
        </p>
        <p style={{ marginTop: "4px" }}>
          <Link href="/bi" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Indicadores (BI) →
          </Link>
        </p>
        <p style={{ marginTop: "4px" }}>
          <Link href="/fiscal" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Fiscal →
          </Link>
        </p>
        <p style={{ marginTop: "4px" }}>
          <Link href="/producao" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Produção →
          </Link>
        </p>
        <p style={{ marginTop: "4px" }}>
          <Link href="/qualidade" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Qualidade →
          </Link>
        </p>
        <p style={{ marginTop: "4px" }}>
          <Link href="/expedicao" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Expedição →
          </Link>
        </p>
        <p style={{ marginTop: "4px" }}>
          <Link href="/instalacao" style={{ color: "#1f5d57", fontSize: "13px" }}>
            Instalação — Escritório →
          </Link>
        </p>

        <form action={signOutAction} style={{ marginTop: "12px" }}>
          <button
            type="submit"
            style={{
              background: "#fff",
              border: "1px solid #dae2de",
              borderRadius: "6px",
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
