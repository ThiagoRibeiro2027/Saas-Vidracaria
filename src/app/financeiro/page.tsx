import { createClient } from "@/lib/supabase/server";
import FinanceiroSection from "./FinanceiroSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

// TÓPICO 11 — Financeiro, recorte mínimo do MVP (ADR-002 §4.14, que
// prevalece sobre a seção 34 do prompt completo do tópico — ver cabeçalho
// da migration 20260916030000): só título a receber vinculado a pedido,
// parcelas planejadas, status básico e registro de recebimento. Sem plano
// de contas, contas a pagar, conciliação, DRE, empréstimos ou comissões.
export default async function FinanceiroPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }, { data: canReceber }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "receber" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Financeiro desta empresa." />
      </div>
    );
  }

  const [{ data: titulos }, { data: pedidosLiberados }, { data: pessoas }] = await Promise.all([
    supabase.from("titulos_financeiros").select("*").order("vencimento"),
    supabase.from("pedidos").select("id, numero, pessoa_id").eq("status", "liberado"),
    supabase.from("pessoas").select("id, nome"),
  ]);

  const pedidosComTitulo = new Set((titulos ?? []).map((t) => t.pedido_id));
  const pedidosSemTitulo = (pedidosLiberados ?? []).filter((p) => !pedidosComTitulo.has(p.id));
  const nomePorPedido = new Map((pedidosLiberados ?? []).map((p) => [p.id, p]));
  const nomePorPessoa = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 11 — Financeiro</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Financeiro</h1>
      <p className="mt-1 text-sm text-text">
        Recorte mínimo do MVP: títulos a receber vinculados ao pedido, com parcelas planejadas e
        registro de recebimento. Sem plano de contas, contas a pagar, conciliação ou DRE.
      </p>

      <div className="mt-6">
        <FinanceiroSection
          titulos={titulos ?? []}
          pedidosSemTitulo={pedidosSemTitulo}
          nomePorPedido={nomePorPedido}
          nomePorPessoa={nomePorPessoa}
          canManage={!!canManage}
          canReceber={!!canReceber}
        />
      </div>
    </div>
  );
}
