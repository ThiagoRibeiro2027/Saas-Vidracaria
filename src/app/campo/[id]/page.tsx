import { createClient } from "@/lib/supabase/server";
import CampoInstalacaoDetalhe from "./CampoInstalacaoDetalhe";

export default async function CampoInstalacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_resource: "instalacao", p_action: "view" });

  if (!canView) {
    return (
      <main style={{ padding: "24px", fontFamily: "system-ui, sans-serif" }}>
        <p style={{ fontSize: "13px", color: "#9b2c2c" }}>
          Você não tem permissão para visualizar o módulo Instalação desta empresa.
        </p>
      </main>
    );
  }

  return <CampoInstalacaoDetalhe instalacaoId={id} />;
}
