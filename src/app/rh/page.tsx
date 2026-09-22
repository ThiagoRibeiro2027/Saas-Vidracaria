import { createClient } from "@/lib/supabase/server";
import RHSection from "./RHSection";
import CertificacoesSection from "./CertificacoesSection";
import EpisSection from "./EpisSection";
import HabilitacoesSection from "./HabilitacoesSection";
import AfastamentosSection from "./AfastamentosSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { Tabs } from "@/components/ui/Tabs";

type TabSlug = "funcionarios" | "certificacoes" | "epi" | "habilitacoes" | "afastamentos";

// TÓPICO 17 — RH completo (ROTEIRO §5.1): funcionários, vínculo com
// usuário e desligamento (recorte mínimo, migration 20260916050000) mais
// certificações/treinamentos (incl. segurança), EPI, habilitações para
// operar equipamento e afastamentos/férias (migration
// 20261004000000_topico17_rh_completo, Prompt TÓPICO 17 §6-7). "Cadastro
// de equipes" já foi antecipado no TÓPICO 16 (equipes_instalacao).
export default async function RHPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
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

  const [
    { data: funcionarios },
    { data: unidades },
    { data: profiles },
    { data: certificacoes },
    { data: epis },
    { data: habilitacoes },
    { data: afastamentos },
    { data: recursos },
  ] = await Promise.all([
    supabase.from("funcionarios").select("*").order("nome"),
    supabase.from("company_units").select("id, name").eq("active", true).order("name"),
    supabase.from("profiles").select("id, display_name, login_identifier").eq("active", true).order("display_name"),
    supabase.from("funcionario_certificacoes").select("*").order("data_conclusao", { ascending: false }),
    supabase.from("funcionario_epis").select("*").order("data_entrega", { ascending: false }),
    supabase.from("funcionario_habilitacoes").select("*").order("data_obtencao", { ascending: false }),
    supabase.from("funcionario_afastamentos").select("*").order("data_inicio", { ascending: false }),
    supabase.from("recursos_produtivos").select("id, codigo, nome, tipo").in("tipo", ["maquina", "equipamento"]).order("nome"),
  ]);

  // Duas listas: "todos" alimenta o mapa de nomes exibido nas tabelas (um
  // registro histórico de um funcionário já desligado continua exibindo o
  // nome dele) e o formulário de edição de um registro já existente;
  // "ativos" restringe o formulário de criação — o próprio banco rejeita
  // (assert_funcionario_editavel) um novo lançamento para quem está
  // desligado, então nem oferecer a opção evita o erro na cara do usuário.
  const funcionariosTodos = (funcionarios ?? []).map((f) => ({ id: f.id, nome: f.nome }));
  const funcionariosAtivos = (funcionarios ?? [])
    .filter((f) => f.status !== "desligado")
    .map((f) => ({ id: f.id, nome: f.nome }));

  const availableTabs: { slug: TabSlug; label: string }[] = [
    { slug: "funcionarios", label: "Funcionários" },
    { slug: "certificacoes", label: "Certificações" },
    { slug: "epi", label: "EPI" },
    { slug: "habilitacoes", label: "Habilitações" },
    { slug: "afastamentos", label: "Afastamentos e férias" },
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === tab) ? (tab as TabSlug) : "funcionarios";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 17 — RH</p>
      <h1 className="mt-1 text-lg font-semibold text-text">RH</h1>
      <p className="mt-1 text-sm text-text">
        Cadastro de funcionários, vínculo com usuário, desligamento, certificações/treinamentos
        (incl. segurança), EPI, habilitações para operar equipamento e afastamentos/férias. Dados
        pessoais sensíveis (LGPD) — visível só a quem tem permissão explícita. Sem folha de
        pagamento, encargos, rescisão, escala ou ponto (fora de escopo do módulo).
      </p>

      <div className="mt-6">
        <Tabs tabs={availableTabs} active={activeTab} basePath="/rh" />
      </div>

      <div className="mt-6">
        {activeTab === "funcionarios" && (
          <RHSection rows={funcionarios ?? []} unidades={unidades ?? []} profiles={profiles ?? []} canManage={!!canManage} />
        )}
        {activeTab === "certificacoes" && (
          <CertificacoesSection
            rows={certificacoes ?? []}
            funcionarios={funcionariosTodos}
            funcionariosAtivos={funcionariosAtivos}
            canManage={!!canManage}
          />
        )}
        {activeTab === "epi" && (
          <EpisSection
            rows={epis ?? []}
            funcionarios={funcionariosTodos}
            funcionariosAtivos={funcionariosAtivos}
            canManage={!!canManage}
          />
        )}
        {activeTab === "habilitacoes" && (
          <HabilitacoesSection
            rows={habilitacoes ?? []}
            funcionarios={funcionariosTodos}
            funcionariosAtivos={funcionariosAtivos}
            recursos={recursos ?? []}
            canManage={!!canManage}
          />
        )}
        {activeTab === "afastamentos" && (
          <AfastamentosSection
            rows={afastamentos ?? []}
            funcionarios={funcionariosTodos}
            funcionariosAtivos={funcionariosAtivos}
            canManage={!!canManage}
          />
        )}
      </div>
    </div>
  );
}
