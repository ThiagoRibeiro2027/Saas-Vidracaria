import { createClient } from "@/lib/supabase/server";
import RHSection from "./RHSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

// TÓPICO 17 — RH completo: cadastro de funcionários, vínculo com usuário,
// desligamento com revogação de acesso (recorte mínimo, migration
// 20260916050000), mais documentos/EPI/habilitações e afastamentos/
// férias (§6-7, migration 20261006000000), com vínculo opcional de
// habilitação a um recurso produtivo cadastrado (complemento,
// 20261029000000). "Cadastro de equipes" já foi antecipado no TÓPICO 16
// (equipes_instalacao).
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

  const [{ data: funcionarios }, { data: unidades }, { data: profiles }, { data: documentos }, { data: afastamentos }, { data: recursos }, { data: anexos }] =
    await Promise.all([
      supabase.from("funcionarios").select("*").order("nome"),
      supabase.from("company_units").select("id, name").eq("active", true).order("name"),
      supabase.from("profiles").select("id, display_name, login_identifier").eq("active", true).order("display_name"),
      supabase.from("funcionario_documentos").select("*").order("created_at", { ascending: false }),
      supabase.from("funcionario_afastamentos").select("*").order("data_inicio", { ascending: false }),
      supabase.from("recursos_produtivos").select("id, codigo, nome, tipo").in("tipo", ["maquina", "equipamento"]).order("nome"),
      // §6 — anexos por documento; files_select já filtra por rh.view pra
      // entity_type='funcionario_documento' (migration 20261010000000).
      supabase
        .from("files")
        .select("id, entity_id, original_name, mime_type, size_bytes, created_at")
        .eq("entity_type", "funcionario_documento")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 17 — RH</p>
      <h1 className="mt-1 text-lg font-semibold text-text">RH</h1>
      <p className="mt-1 text-sm text-text">
        Cadastro de funcionários, vínculo com usuário, desligamento, documentos de admissão,
        certificações/treinamentos (incl. segurança), EPI, habilitações para operar equipamento
        (com vínculo opcional a um recurso produtivo cadastrado) e afastamentos/férias. Dados
        pessoais sensíveis (LGPD) — visível só a quem tem permissão explícita. Sem folha de
        pagamento, encargos, rescisão, escala ou ponto (fora de escopo do módulo).
      </p>

      <div className="mt-6">
        <RHSection
          rows={funcionarios ?? []}
          unidades={unidades ?? []}
          profiles={profiles ?? []}
          documentos={documentos ?? []}
          afastamentos={afastamentos ?? []}
          recursos={recursos ?? []}
          anexos={anexos ?? []}
          canManage={!!canManage}
        />
      </div>
    </div>
  );
}
