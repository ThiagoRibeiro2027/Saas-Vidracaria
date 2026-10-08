import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import MapaComprasSection from "./MapaComprasSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";

// TÓPICO 7 — Compras, Fase 3 da ADR-011: mapa de compras futuras (§12),
// motor de necessidades por política de abastecimento (§1/§8) e
// calendário de feriados (§11, usado por calcular_data_recomendada_
// compra()). Consolidação de necessidades (§7) e saldo projetado por
// item (§4) existem como RPC (consolidar_necessidades/
// calcular_saldo_projetado) mas ainda sem tela dedicada nesta fase.
export default async function MapaComprasPage() {
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "compras", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "compras", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o mapa de compras futuras desta empresa." />
      </div>
    );
  }

  const [{ data: mapa }, { data: feriados }] = await Promise.all([
    supabase.rpc("mapa_compras_futuras"),
    supabase.from("calendario_feriados").select("*").order("data"),
  ]);

  return (
    <>
      <PageHeader breadcrumb={["Compras"]} title="Mapa de Necessidades" />
      <div className="mx-auto max-w-7xl p-6">
        <p className="text-sm text-text">
          Necessidade aberta × saldo disponível (peça dimensional quando o item tem controle por
          peça, Fase 2; saldo escalar nos demais) × data recomendada de compra (lead time do
          fornecedor principal, ajustado por fim de semana/feriado). Risco: crítico (ruptura dentro
          do lead time), atenção (entre 1x e 2x o lead time, ou sem data prevista), ok (sem ruptura
          projetada). <Link href="/compras">← Voltar para Compras</Link>
        </p>

        <div className="mt-6">
          <MapaComprasSection mapa={mapa ?? []} feriados={feriados ?? []} canManage={!!canManage} />
        </div>
      </div>
    </>
  );
}
