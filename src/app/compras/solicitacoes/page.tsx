import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import SolicitacoesComprasSection from "./SolicitacoesComprasSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";

// TÓPICO 7 — Compras, Fase 4 da ADR-011: Solicitação de Compra (§16) e
// Compras Diretas (§2). Item de SC com necessidade_compra_id vinculada
// só atende a necessidade (atender_necessidade_compra() já existente) no
// envio da SC — rascunho é edição local, sem efeito colateral.
export default async function SolicitacoesComprasPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "compras", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "compras", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar solicitações de compra desta empresa." />
      </div>
    );
  }

  const [
    { data: solicitacoes },
    { data: itensSolicitacao },
    { data: comprasDiretas },
    { data: itens },
    { data: necessidades },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("solicitacoes_compra").select("*").order("created_at", { ascending: false }),
    supabase.from("solicitacao_compra_itens").select("*"),
    supabase.from("compras_diretas").select("*").order("created_at", { ascending: false }),
    supabase
      .from("itens")
      .select("id, codigo, descricao, unidade_principal, tipo")
      .in("tipo", ["materia_prima", "insumo", "material_auxiliar"])
      .eq("situacao", "ativo")
      .order("codigo"),
    supabase.from("necessidades_compra").select("id, item_id, quantidade, origem").eq("status", "aberta"),
    supabase.from("profiles").select("id, display_name").order("display_name"),
  ]);

  return (
    <>
      <PageHeader breadcrumb={["Compras"]} title="Solicitações" />
      <div className="mx-auto max-w-7xl p-6">
        <p className="text-sm text-text">
          SC em rascunho pode ganhar/perder item livremente; ao enviar, cada item com necessidade
          vinculada atende essa necessidade automaticamente. Compra direta é um bypass deliberado da
          SC — sempre exige motivo e justificativa. Compra emergencial (Fase 8, §32) é uma SC com
          urgência marcada e motivo/impacto obrigatórios — segue o mesmo fluxo de cotação/aprovação/PC
          das demais. <Link href="/compras">← Voltar para Compras</Link> ·{" "}
          <Link href="/compras/fornecedores">Avaliação de fornecedores e rastreabilidade →</Link>
        </p>

        <div className="mt-6">
          <SolicitacoesComprasSection
            solicitacoes={solicitacoes ?? []}
            itensSolicitacao={itensSolicitacao ?? []}
            comprasDiretas={comprasDiretas ?? []}
            itens={itens ?? []}
            necessidades={necessidades ?? []}
            profiles={profiles ?? []}
            canManage={!!canManage}
          />
        </div>
      </div>
    </>
  );
}
