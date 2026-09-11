import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "./login/actions";

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
