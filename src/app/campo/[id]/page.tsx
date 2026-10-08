import { createClient } from "@/lib/supabase/server";
import CampoInstalacaoDetalhe from "./CampoInstalacaoDetalhe";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

export default async function CampoInstalacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_resource: "instalacao", p_action: "view" });

  if (!canView) {
    return (
      <main className="p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo Instalação desta empresa." />
      </main>
    );
  }

  return <CampoInstalacaoDetalhe instalacaoId={id} />;
}
