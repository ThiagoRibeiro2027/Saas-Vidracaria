import { createClient } from "@/lib/supabase/server";
import UsuariosSection, { type Profile, type Role, type UserRoleRow } from "./UsuariosSection";
import PapeisSection, { type Permission } from "./PapeisSection";

// TÓPICO 14 — Usuários / Permissões, recorte mínimo (ADR-002 §4.10,
// decisão do responsável do produto em 2026-09-19, pré-requisito antes
// de considerar a Fase 8 concluída). Achado que motivou: a Fundação
// (Fase 2) construiu o modelo de dados (profiles/roles/permissions/
// role_permissions/user_roles + has_permission()) mas nenhuma tela
// jamais existiu pra usá-lo — toda criação de usuário até aqui era só
// via script de teste com a service role key.
//
// Convite administrativo (sem signup público, mesmo padrão do incidente
// enable_signup documentado no RUNBOOK-GOVERNANCA-DE-SEGURANCA.md):
// usuário nasce com senha temporária e must_change_password=true.
// E-mail de auth.users é sempre sintético — login continua por
// matrícula. "Revogar papel" é soft (valid_until), nunca some do
// histórico de auditoria. Papel de empresa é sempre uma linha própria
// (nunca edita um papel-modelo global, que afetaria todas as outras
// empresas que o usam).
export default async function UsuariosPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }, { data: canManageRoles }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "users", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "users", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "roles", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: "13px", color: "#9b2c2c", margin: 0 }}>
            Você não tem permissão para visualizar usuários desta empresa.
          </p>
        </div>
      </main>
    );
  }

  const [
    { data: profiles },
    { data: roles },
    { data: permissions },
    { data: rolePermissions },
    { data: userRoles },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, login_identifier, display_name, contact_email, active, must_change_password")
      .order("display_name"),
    supabase.from("roles").select("id, key, name, company_id").order("name"),
    supabase.from("permissions").select("id, resource, action, description").order("resource").order("action"),
    supabase.from("role_permissions").select("role_id, permission_id"),
    supabase.from("user_roles").select("id, profile_id, role_id, valid_until").is("valid_until", null),
  ]);

  const userRolesPorProfile = new Map<string, UserRoleRow[]>();
  for (const ur of userRoles ?? []) {
    const list = userRolesPorProfile.get(ur.profile_id) ?? [];
    list.push(ur);
    userRolesPorProfile.set(ur.profile_id, list);
  }

  const permissoesPorPapel = new Map<string, Set<string>>();
  for (const rp of rolePermissions ?? []) {
    const set = permissoesPorPapel.get(rp.role_id) ?? new Set<string>();
    set.add(rp.permission_id);
    permissoesPorPapel.set(rp.role_id, set);
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>TÓPICO 14 — Usuários / Permissões</p>
        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>Usuários e papéis</h1>
        <p style={{ fontSize: "13px", color: "#3e4d49", marginTop: 0 }}>
          Recorte mínimo: convite administrativo, atribuição/revogação de papel, desativação e
          reset de senha; papéis próprios da empresa com permissão configurável. Sem alçadas de
          aprovação, SSO, integrações de identidade ou acesso emergencial (fase futura).
        </p>

        <UsuariosSection
          profiles={(profiles as Profile[]) ?? []}
          roles={(roles as Role[]) ?? []}
          userRolesPorProfile={userRolesPorProfile}
          canManage={!!canManage}
        />

        <PapeisSection
          roles={(roles as Role[]) ?? []}
          permissions={(permissions as Permission[]) ?? []}
          permissoesPorPapel={permissoesPorPapel}
          canManage={!!canManageRoles}
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
  width: "900px",
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
