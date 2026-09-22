import { createClient } from "@/lib/supabase/server";
import SuprimentosSection from "./SuprimentosSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

// TÓPICO 7 — Suprimentos e Compras, recorte mínimo do MVP (ADR-002 §4.18,
// que prevalece sobre a menção mais ampla do PLANO DE ENTREGA §6 — ver
// cabeçalho da migration 20260916020000): só registro e acompanhamento de
// necessidade de compra. Sem fornecedor, cotação, pedido de compra ou
// recebimento — a efetivação da compra acontece fora do SaaS neste recorte.
export default async function SuprimentosPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "suprimentos", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "suprimentos", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Suprimentos desta empresa." />
      </div>
    );
  }

  const [{ data: necessidades }, { data: itens }] = await Promise.all([
    supabase.from("necessidades_compra").select("*").order("created_at", { ascending: false }),
    supabase.from("itens").select("id, codigo, descricao, unidade_principal").eq("situacao", "ativo").order("codigo"),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 7 — Suprimentos</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Suprimentos e Compras</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do MVP: registrar necessidade de material e acompanhar até atendida ou
        cancelada. Sem cotação, pedido de compra ou recebimento.
      </p>

      <div className="mt-6">
        <SuprimentosSection rows={necessidades ?? []} itens={itens ?? []} canManage={!!canManage} />
      </div>
    </div>
  );
}
