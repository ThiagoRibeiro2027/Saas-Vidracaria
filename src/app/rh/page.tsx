import { createClient } from "@/lib/supabase/server";
import RHSection from "./RHSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

// TÓPICO 17 — RH, recorte mínimo do MVP (Prompt TÓPICO 17 §11): cadastro
// de funcionários, vínculo com usuário, desligamento com revogação de
// acesso. "Cadastro de equipes" já foi antecipado no TÓPICO 16
// (equipes_instalacao) — ver cabeçalho da migration 20260916050000.
export default async function RHPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "rh", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "rh", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo RH desta empresa." />
      </div>
    );
  }

  const [{ data: funcionarios }, { data: unidades }, { data: profiles }] = await Promise.all([
    supabase.from("funcionarios").select("*").order("nome"),
    supabase.from("company_units").select("id, name").eq("active", true).order("name"),
    supabase.from("profiles").select("id, display_name, login_identifier").eq("active", true).order("display_name"),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 17 — RH</p>
      <h1 className="mt-1 text-lg font-semibold text-text">RH</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do MVP: cadastro de funcionários, vínculo com usuário e desligamento.
        Dados pessoais sensíveis (LGPD) — visível só a quem tem permissão explícita.
      </p>

      <div className="mt-6">
        <RHSection rows={funcionarios ?? []} unidades={unidades ?? []} profiles={profiles ?? []} canManage={!!canManage} />
      </div>
    </div>
  );
}
