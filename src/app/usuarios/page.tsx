import { createClient } from "@/lib/supabase/server";
import UsuariosSection, { type Profile, type Role, type UserRoleRow } from "./UsuariosSection";
import PapeisSection, { type Permission } from "./PapeisSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

type TabSlug = "usuarios" | "papeis";

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
// 2026-10-04: mesmo tratamento já aplicado em Comercial/Pedidos/Engenharia/
// Fiscal/RH — tela larga, a lista de usuários (a que de fato cresce sem
// limite, um por funcionário/colaborador) paginada no servidor, e cada
// linha compacta que expande ao clicar pra mostrar papéis/ações. Papéis da
// empresa e papéis-modelo continuam como catálogo de configuração — bem
// mais limitado em tamanho (poucas dezenas no máximo), sem necessidade real
// de paginação — mas as linhas de papéis da empresa também passam a
// expandir ao clicar, em vez de sempre mostrar todas as permissões e o
// formulário de conceder.
export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; us_pagina?: string; us_por_pagina?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }, { data: canManageRoles }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "users", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "users", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "roles", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar usuários desta empresa." />
      </div>
    );
  }

  const availableTabs: { slug: TabSlug; label: string }[] = [
    { slug: "usuarios", label: "Usuários" },
    { slug: "papeis", label: "Papéis e permissões" },
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === params.tab) ? (params.tab as TabSlug) : "usuarios";

  const { pagina: usPaginaPedida, porPagina: usPorPagina } = lerParametrosPaginacao({
    pagina: params.us_pagina,
    por_pagina: params.us_por_pagina,
  });

  // Papéis e o catálogo de permissões são usados nas duas abas (nome de
  // papel atribuído a um usuário, opções de <select>) — buscados sempre,
  // inteiros, como qualquer lookup de configuração neste projeto.
  const [{ data: roles }, { data: permissions }] = await Promise.all([
    supabase.from("roles").select("id, key, name, company_id").order("name"),
    supabase.from("permissions").select("id, resource, action, description").order("resource").order("action"),
  ]);

  // Só a aba ativa busca sua consulta pesada.
  const { count: totalProfiles } = activeTab === "usuarios" ? await supabase.from("profiles").select("id", { count: "exact", head: true }) : { count: 0 };
  const { paginacao: usPaginacao, from: usFrom, to: usTo } = calcularPaginacao(usPaginaPedida, usPorPagina, totalProfiles ?? 0);
  const { data: profiles } =
    activeTab === "usuarios"
      ? await supabase
          .from("profiles")
          .select("id, login_identifier, display_name, contact_email, active, must_change_password")
          .order("display_name")
          .range(usFrom, usTo)
      : { data: [] as never[] };

  const profileIdsPagina = (profiles ?? []).map((p) => p.id);
  const { data: userRoles } =
    profileIdsPagina.length > 0
      ? await supabase.from("user_roles").select("id, profile_id, role_id, valid_until").is("valid_until", null).in("profile_id", profileIdsPagina)
      : { data: [] as never[] };

  const roleIdsDaEmpresa = (roles ?? []).filter((r) => r.company_id !== null).map((r) => r.id);
  const { data: rolePermissions } =
    activeTab === "papeis" && roleIdsDaEmpresa.length > 0
      ? await supabase.from("role_permissions").select("role_id, permission_id").in("role_id", roleIdsDaEmpresa)
      : { data: [] as never[] };

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
    <div className="mx-auto max-w-7xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 14 — Usuários / Permissões</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Usuários e papéis</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo: convite administrativo, atribuição/revogação de papel, desativação e
        reset de senha; papéis próprios da empresa com permissão configurável. Sem alçadas de
        aprovação, SSO, integrações de identidade ou acesso emergencial (fase futura).
      </p>

      <div className="mt-6">
        {activeTab === "usuarios" && (
          <UsuariosSection
            profiles={(profiles as Profile[]) ?? []}
            paginacao={usPaginacao}
            roles={(roles as Role[]) ?? []}
            userRolesPorProfile={userRolesPorProfile}
            canManage={!!canManage}
          />
        )}

        {activeTab === "papeis" && (
          <PapeisSection
            roles={(roles as Role[]) ?? []}
            permissions={(permissions as Permission[]) ?? []}
            permissoesPorPapel={permissoesPorPapel}
            canManage={!!canManageRoles}
          />
        )}
      </div>
    </div>
  );
}
