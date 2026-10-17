import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import AtualizacoesSection, { type AtualizacaoRow } from "./AtualizacoesSection";

export default async function AtualizacoesPage() {
  const supabase = await createClient();

  const [{ data: podeGerenciar }, { data: atualizacoes }] = await Promise.all([
    supabase.rpc("is_platform_admin_mfa_verified"),
    supabase
      .from("atualizacoes_sistema")
      .select("id, titulo, descricao, publicado_em")
      .order("publicado_em", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div>
      <PageHeader breadcrumb={["Sistema", "Atualizações"]} title="Atualizações" />
      <div className="mx-auto max-w-2xl p-6">
        <p className="mb-4 text-sm text-text-muted">
          O que mudou no sistema, em ordem cronológica.
        </p>
        <AtualizacoesSection
          atualizacoes={(atualizacoes as AtualizacaoRow[]) ?? []}
          podeGerenciar={!!podeGerenciar}
        />
      </div>
    </div>
  );
}
