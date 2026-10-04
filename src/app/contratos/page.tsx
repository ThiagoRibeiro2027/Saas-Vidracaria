import { createClient } from "@/lib/supabase/server";
import ContratosSection from "./ContratosSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

// TÓPICO 18 — Contratos completo (§4-7, §10): estrutura genérica única com
// os três tipos (cliente/fornecedor/funcionário), ciclo de vida completo
// (rascunho → em aprovação → vigente → suspenso → encerrado/cancelado)
// com alçada de aprovação, garantia (só cliente), vínculo financeiro
// detalhado (contrato → título financeiro, só cliente vigente), alertas de
// vencimento (ADR-007) e documentos anexos (§8, migration 20261209000000).
// Só a integração real de assinatura eletrônica (§10, DocuSign/Clicksign)
// segue fora, por decisão consciente do próprio doc — o campo de
// referência externa já existe.
//
// 2026-10-04: a tela usava um estilo próprio (inline style), diferente do
// resto do app — migrada pros componentes padrão (Table/Button/Input...)
// e pro mesmo tratamento de layout dos demais módulos (tela larga, lista
// paginada no servidor, linha compacta que expande pro detalhe e ações).
export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; por_pagina?: string }>;
}) {
  const { pagina: paginaParam, por_pagina: porPaginaParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }, { data: canAprovar }, { data: canGerarTitulos }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "contratos", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "contratos", p_action: "manage" }),
    supabase.rpc("has_permission", { p_resource: "contratos", p_action: "aprovar" }),
    supabase.rpc("has_permission", { p_resource: "financeiro", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar os contratos desta empresa." />
      </div>
    );
  }

  const { pagina: paginaPedida, porPagina } = lerParametrosPaginacao({
    pagina: paginaParam,
    por_pagina: porPaginaParam,
  });
  const { count: totalContratos } = await supabase.from("contratos").select("id", { count: "exact", head: true });
  const { paginacao, from, to } = calcularPaginacao(paginaPedida, porPagina, totalContratos ?? 0);

  const [{ data: contratos }, { data: pessoas }, { data: papeis }, { data: obras }, { data: pedidos }, { data: funcionarios }, { data: titulos }] =
    await Promise.all([
      supabase.from("contratos").select("*").order("created_at", { ascending: false }).order("id").range(from, to),
      supabase.from("pessoas").select("id, nome").order("nome"),
      supabase.from("pessoa_papeis").select("pessoa_id, papel, ativo"),
      supabase.from("obras").select("id, nome, pessoa_id").order("nome"),
      supabase.from("pedidos").select("id, numero, pessoa_id").order("numero"),
      supabase.from("funcionarios").select("id, nome").order("nome"),
      supabase.from("titulos_financeiros").select("contrato_id").not("contrato_id", "is", null),
    ]);

  const clienteIds = new Set((papeis ?? []).filter((pp) => pp.papel === "CLIENTE" && pp.ativo).map((pp) => pp.pessoa_id));
  const fornecedorIds = new Set((papeis ?? []).filter((pp) => pp.papel === "FORNECEDOR" && pp.ativo).map((pp) => pp.pessoa_id));
  const clientes = (pessoas ?? []).filter((p) => clienteIds.has(p.id));
  const fornecedores = (pessoas ?? []).filter((p) => fornecedorIds.has(p.id));
  const contratoIdsComTitulo = new Set((titulos ?? []).map((t) => t.contrato_id as string));

  const contratoIds = (contratos ?? []).map((c) => c.id);
  // §8 — anexos por contrato (agrupados no client, mesmo padrão dos outros
  // mapas desta página). files_select já filtra por entity_type/
  // contratos.view (migration 20261209000000).
  const { data: anexos } =
    contratoIds.length > 0
      ? await supabase
          .from("files")
          .select("id, entity_id, original_name, mime_type, size_bytes, created_at")
          .eq("entity_type", "contrato")
          .in("entity_id", contratoIds)
          .order("created_at", { ascending: false })
      : { data: [] as never[] };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 18 — Contratos</p>
      <h1 className="mt-1 text-lg font-semibold text-text">Contratos</h1>
      <p className="mt-1 text-sm text-text">
        Estrutura genérica para contratos com cliente, fornecedor e funcionário/prestador. Ciclo
        de vida completo com alçada de aprovação, garantia (só cliente) e vínculo financeiro
        detalhado (título financeiro gerado a partir de contrato vigente com cliente).
      </p>

      <div className="mt-6">
        <ContratosSection
          rows={contratos ?? []}
          paginacao={paginacao}
          pessoas={pessoas ?? []}
          clientes={clientes}
          fornecedores={fornecedores}
          obras={obras ?? []}
          pedidos={pedidos ?? []}
          funcionarios={funcionarios ?? []}
          contratoIdsComTitulo={contratoIdsComTitulo}
          anexos={anexos ?? []}
          canManage={!!canManage}
          canAprovar={!!canAprovar}
          canGerarTitulos={!!canGerarTitulos}
        />
      </div>
    </div>
  );
}
