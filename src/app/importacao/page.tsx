import { createClient } from "@/lib/supabase/server";
import ImportacaoSection from "./ImportacaoSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { ENTIDADES_IMPORTACAO, RECURSOS_IMPORTACAO } from "./importacao-entidades";

// TÓPICO 13 §29, Fase 8a — importação em massa, genérica por entidade
// (ENTIDADES_IMPORTACAO cobre 24 entidades de módulos diferentes). Até
// 2026-10-04 esta tela vivia dentro de /cadastros, junto de Pessoas e
// Obras — sem relação de uso entre si (importação é uma ferramenta
// transversal, não um cadastro). Virou rota própria no grupo Sistema.
export default async function ImportacaoPage() {
  const supabase = await createClient();

  // Quais blocos de importação este usuário pode usar. Sem isto a tela
  // oferecia os 24 a qualquer um que a enxergasse, e quem tem só
  // itens.manage descobria que não podia importar RH ao tentar. O gate
  // real continua no banco — aqui é só não oferecer o que vai falhar.
  const permissoesImportacao = await Promise.all(
    RECURSOS_IMPORTACAO.map(async (recurso) => {
      const { data } = await supabase.rpc("has_permission", { p_resource: recurso, p_action: "manage" });
      return [recurso, !!data] as const;
    }),
  );
  const recursosPermitidos = new Set(permissoesImportacao.filter(([, pode]) => pode).map(([r]) => r));
  const entidadesPermitidas = ENTIDADES_IMPORTACAO.filter((e) =>
    recursosPermitidos.has(e.recursoPermissao),
  ).map((e) => e.chave);

  if (entidadesPermitidas.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão de gestão em nenhum módulo com importação disponível." />
      </div>
    );
  }

  // Histórico de importações (TÓPICO 13 §29, Fase 7). A policy de SELECT
  // de public.importacoes já filtra por empresa E pela permissão do módulo
  // da entidade, então o que voltar aqui é só o que este usuário pode ver.
  const { data: historicoImportacoes } = await supabase
    .from("importacoes")
    .select(
      "id, entidade, arquivo_nome, total_linhas, novos, atualizados, invalidos, duplicados, origem_importacao_id, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 13 §29 — Importação</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Importação de dados</h1>
      <p className="mt-1 text-sm text-text">
        Importação em massa por planilha, uma entidade por vez — cada bloco abaixo pertence a um
        módulo diferente (Comercial, Engenharia, Produção, Estoque, Suprimentos, RH, Instalação,
        Financeiro, Configurações).
      </p>

      <div className="mt-6">
        <ImportacaoSection historico={historicoImportacoes ?? []} entidadesPermitidas={entidadesPermitidas} />
      </div>
    </div>
  );
}
