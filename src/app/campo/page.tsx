import { createClient } from "@/lib/supabase/server";
import CampoAgenda from "./CampoAgenda";

// TÓPICO 16 — agenda da PWA de campo. Gate de permissão igual aos demais
// módulos (só se aplica quando a navegação realmente chega ao servidor —
// uma reabertura offline é servida pelo shell em cache do service worker,
// sem passar por aqui; a página cliente então trabalha só com o que já
// está em IndexedDB).
export default async function CampoPage() {
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

  return <CampoAgenda />;
}
