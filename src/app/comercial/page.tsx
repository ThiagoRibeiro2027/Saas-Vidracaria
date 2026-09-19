import { createClient } from "@/lib/supabase/server";
import OrcamentosSection from "./OrcamentosSection";
import OportunidadesSection from "./OportunidadesSection";
import PropostasSection from "./PropostasSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

// TÓPICO 10 — orçamento simples (cabeçalho + itens + decisão), recorte
// mínimo do M1 (PLANO DE ENTREGA — MVP DO PILOTO v1.0). Oportunidades e
// funil comercial fixo são ampliação de escopo aprovada em ADR-002 v2.4
// (19/09/2026) — ainda sem versionamento de orçamento, proposta formal ou
// formação de custo. A conversão real em Pedido é do TÓPICO 3.
export default async function ComercialPage() {
  const supabase = await createClient();

  const [
    { data: canView },
    { data: canManage },
    { data: canViewOportunidades },
    { data: canManageOportunidades },
    { data: canViewPropostas },
    { data: canManagePropostas },
  ] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "orcamentos", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "orcamentos", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "oportunidades", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "oportunidades", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "propostas", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "propostas", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Comercial desta empresa." />
      </div>
    );
  }

  // obras/itens vêm SEM filtro de situacao: uma obra/item inativado depois
  // de referenciado por um orçamento ainda precisa aparecer (rótulo + guard
  // de seleção atual no formulário de edição) — o filtro pra "ativo" fica só
  // na hora de montar a lista de opções selecionáveis, dentro da seção.
  const [
    { data: orcamentos },
    { data: orcamentoItens },
    { data: pessoas },
    { data: papeis },
    { data: obras },
    { data: itens },
    { data: oportunidades },
    { data: propostas },
  ] = await Promise.all([
    supabase.from("orcamentos").select("*").order("created_at", { ascending: false }),
    supabase.from("orcamento_itens").select("*"),
    supabase.from("pessoas").select("id, nome").order("nome"),
    supabase.from("pessoa_papeis").select("pessoa_id, papel, ativo"),
    supabase.from("obras").select("id, nome, pessoa_id, situacao").order("nome"),
    supabase.from("itens").select("id, codigo, descricao, unidade_principal, situacao").order("codigo"),
    canViewOportunidades
      ? supabase.from("oportunidades").select("*").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    canViewPropostas
      ? supabase.from("propostas").select("*").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const clienteIds = new Set(
    (papeis ?? []).filter((pp) => pp.papel === "CLIENTE" && pp.ativo).map((pp) => pp.pessoa_id),
  );
  const clientesElegiveis = (pessoas ?? []).filter((p) => clienteIds.has(p.id));

  const itensPorOrcamento = new Map<string, typeof orcamentoItens>();
  for (const oi of orcamentoItens ?? []) {
    const list = itensPorOrcamento.get(oi.orcamento_id) ?? [];
    list.push(oi);
    itensPorOrcamento.set(oi.orcamento_id, list);
  }

  // Mesma fórmula usada por decidir_orcamento() pra checar a alçada
  // (approval_thresholds) — uma única fonte de verdade via RPC, em vez de
  // recalcular o total no client com uma soma que poderia divergir da soma
  // usada pra decidir se a alçada se aplica.
  const totaisEntries = await Promise.all(
    (orcamentos ?? []).map(async (o) => {
      const { data } = await supabase.rpc("orcamento_valor_total", { p_orcamento_id: o.id });
      return [o.id, Number(data ?? 0)] as const;
    }),
  );
  const totais = new Map(totaisEntries);

  const oportunidadesAbertas = (oportunidades ?? []).filter(
    (o) => o.estagio !== "ganha" && o.estagio !== "perdida",
  );

  const orcamentosAprovados = (orcamentos ?? []).filter((o) => o.status === "aprovado");

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 10 — Comercial</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Orçamentos</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do M1: orçamento simples com itens e decisão de aprovação, sem tabela de
        preços, descontos ou versionamento.
      </p>

      <div className="mt-6">
        <OrcamentosSection
          orcamentos={orcamentos ?? []}
          itensPorOrcamento={itensPorOrcamento as Map<string, NonNullable<typeof orcamentoItens>>}
          totais={totais}
          clientesElegiveis={clientesElegiveis}
          todasPessoas={pessoas ?? []}
          obras={obras ?? []}
          itens={itens ?? []}
          oportunidadesAbertas={oportunidadesAbertas}
          canManage={!!canManage}
        />
      </div>

      {canViewOportunidades && (
        <OportunidadesSection
          oportunidades={oportunidades ?? []}
          todasPessoas={pessoas ?? []}
          canManage={!!canManageOportunidades}
        />
      )}

      {canViewPropostas && (
        <PropostasSection
          propostas={propostas ?? []}
          orcamentosAprovados={orcamentosAprovados}
          todasPessoas={pessoas ?? []}
          canManage={!!canManagePropostas}
        />
      )}
    </div>
  );
}
