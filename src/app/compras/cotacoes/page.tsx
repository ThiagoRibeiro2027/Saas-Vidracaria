import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import CotacoesSection from "./CotacoesSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";

// TÓPICO 7 — Compras, Fase 5 da ADR-011: cotação, negociação, histórico
// de preços, custo total de aquisição e alçada de aprovação (§17-§23).
// custo_unitario é objetivo (preço - desconto + impostos + frete, por
// unidade) — sem score ponderado subjetivo; selecionar_fornecedor_
// cotacao() aceita qualquer proposta, sempre com justificativa (§13,
// "o sistema sugere, o humano decide").
export default async function CotacoesPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }, { data: profile }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "compras", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "compras", p_action: "manage" }),
    supabase.auth.getUser(),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar cotações desta empresa." />
      </div>
    );
  }

  const [
    { data: cotacoes },
    { data: cotacaoItens },
    { data: propostas },
    { data: negociacoes },
    { data: selecoes },
    { data: solicitacoes },
    { data: solicitacaoItens },
    { data: itens },
    { data: fornecedores },
    { data: pessoaPapeis },
    { data: aprovacoes },
    { data: aprovacaoEtapas },
    { data: alcadas },
    { data: roles },
    { data: userRoles },
  ] = await Promise.all([
    supabase.from("cotacoes").select("*").order("created_at", { ascending: false }),
    supabase.from("cotacao_itens").select("*"),
    supabase.from("cotacao_propostas").select("*"),
    supabase.from("cotacao_negociacoes").select("*").order("rodada"),
    supabase.from("cotacao_selecoes").select("*"),
    supabase.from("solicitacoes_compra").select("id, numero, status"),
    supabase.from("solicitacao_compra_itens").select("*"),
    supabase.from("itens").select("id, codigo, descricao, unidade_principal"),
    supabase.from("pessoas").select("id, nome, nome_fantasia"),
    supabase.from("pessoa_papeis").select("pessoa_id, papel, ativo"),
    supabase.from("compras_aprovacoes").select("*"),
    supabase.from("compras_aprovacao_etapas").select("*").order("ordem"),
    supabase.from("compras_alcada_etapas").select("*").order("processo, ordem"),
    supabase.from("roles").select("id, key, name, company_id").order("name"),
    supabase.from("user_roles").select("profile_id, role_id").is("valid_until", null),
  ]);

  const fornecedorIds = new Set((pessoaPapeis ?? []).filter((pp) => pp.papel === "FORNECEDOR" && pp.ativo).map((pp) => pp.pessoa_id));
  const fornecedoresAtivos = (fornecedores ?? []).filter((p) => fornecedorIds.has(p.id));
  const meuId = profile?.user?.id ?? null;
  const meusRoleIds = new Set((userRoles ?? []).filter((ur) => ur.profile_id === meuId).map((ur) => ur.role_id));

  return (
    <>
      <PageHeader breadcrumb={["Compras"]} title="Cotações" />
      <div className="mx-auto max-w-7xl p-6">
        <p className="text-sm text-text">
          Custo total por proposta (preço − desconto + impostos + frete, por unidade) é só um
          apoio: qualquer proposta pode ser escolhida, sempre com justificativa. Ao concluir a
          seleção, a cotação passa pela alçada configurada abaixo (múltiplas etapas por valor).{" "}
          <Link href="/compras/solicitacoes">← Voltar para Solicitações</Link>
        </p>

        <div className="mt-6">
          <CotacoesSection
            cotacoes={cotacoes ?? []}
            cotacaoItens={cotacaoItens ?? []}
            propostas={propostas ?? []}
            negociacoes={negociacoes ?? []}
            selecoes={selecoes ?? []}
            solicitacoes={solicitacoes ?? []}
            solicitacaoItens={solicitacaoItens ?? []}
            itens={itens ?? []}
            fornecedores={fornecedoresAtivos}
            aprovacoes={aprovacoes ?? []}
            aprovacaoEtapas={aprovacaoEtapas ?? []}
            alcadas={alcadas ?? []}
            roles={roles ?? []}
            meusRoleIds={meusRoleIds}
            canManage={!!canManage}
          />
        </div>
      </div>
    </>
  );
}
