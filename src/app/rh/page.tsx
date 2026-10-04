import { createClient } from "@/lib/supabase/server";
import RHSection from "./RHSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

// TÓPICO 17 — RH completo: cadastro de funcionários, vínculo com usuário,
// desligamento com revogação de acesso (recorte mínimo, migration
// 20260916050000), mais documentos/EPI/habilitações e afastamentos/
// férias (§6-7, migration 20261006000000), com vínculo opcional de
// habilitação a um recurso produtivo cadastrado (complemento,
// 20261029000000). "Cadastro de equipes" já foi antecipado no TÓPICO 16
// (equipes_instalacao).
//
// 2026-10-04: mesmo tratamento de layout já aplicado em Comercial/
// Pedidos/Engenharia/Fiscal — tela larga e as 3 listas (funcionários,
// documentos, afastamentos) paginadas no servidor, cada uma com seu
// próprio par de parâmetros (a mesma rota tem as 3, sem abas). O
// cadastro completo de funcionários continua buscado à parte (sem
// paginação) — Documentos/Afastamentos e os formulários de lançamento
// precisam do nome de qualquer funcionário, não só dos da página atual.
export default async function RHPage({
  searchParams,
}: {
  searchParams: Promise<{
    fu_pagina?: string;
    fu_por_pagina?: string;
    doc_pagina?: string;
    doc_por_pagina?: string;
    af_pagina?: string;
    af_por_pagina?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_resource: "rh", p_action: "view" }),
    supabase.rpc("has_permission", { p_resource: "rh", p_action: "manage" }),
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PermissionDenied message="Você não tem permissão para visualizar o módulo RH desta empresa." />
      </div>
    );
  }

  const { pagina: fuPaginaPedida, porPagina: fuPorPagina } = lerParametrosPaginacao({
    pagina: params.fu_pagina,
    por_pagina: params.fu_por_pagina,
  });
  const { pagina: docPaginaPedida, porPagina: docPorPagina } = lerParametrosPaginacao({
    pagina: params.doc_pagina,
    por_pagina: params.doc_por_pagina,
  });
  const { pagina: afPaginaPedida, porPagina: afPorPagina } = lerParametrosPaginacao({
    pagina: params.af_pagina,
    por_pagina: params.af_por_pagina,
  });

  const [{ count: totalFuncionarios }, { count: totalDocumentos }, { count: totalAfastamentos }] = await Promise.all([
    supabase.from("funcionarios").select("id", { count: "exact", head: true }),
    supabase.from("funcionario_documentos").select("id", { count: "exact", head: true }),
    supabase.from("funcionario_afastamentos").select("id", { count: "exact", head: true }),
  ]);
  const { paginacao: fuPaginacao, from: fuFrom, to: fuTo } = calcularPaginacao(fuPaginaPedida, fuPorPagina, totalFuncionarios ?? 0);
  const { paginacao: docPaginacao, from: docFrom, to: docTo } = calcularPaginacao(docPaginaPedida, docPorPagina, totalDocumentos ?? 0);
  const { paginacao: afPaginacao, from: afFrom, to: afTo } = calcularPaginacao(afPaginaPedida, afPorPagina, totalAfastamentos ?? 0);

  const [
    { data: funcionariosPagina },
    { data: funcionariosTodos },
    { data: unidades },
    { data: profiles },
    { data: documentos },
    { data: afastamentos },
    { data: recursos },
  ] = await Promise.all([
    supabase.from("funcionarios").select("*").order("nome").range(fuFrom, fuTo),
    // Lookups (nome por funcionário) e os <select> dos formulários de
    // Documentos/Afastamentos precisam de qualquer funcionário, não só
    // dos da página atual — mesmo padrão de itens/pessoas em Comercial.
    supabase.from("funcionarios").select("id, nome, status, profile_id").order("nome"),
    supabase.from("company_units").select("id, name").eq("active", true).order("name"),
    supabase.from("profiles").select("id, display_name, login_identifier").eq("active", true).order("display_name"),
    supabase.from("funcionario_documentos").select("*").order("created_at", { ascending: false }).range(docFrom, docTo),
    supabase.from("funcionario_afastamentos").select("*").order("data_inicio", { ascending: false }).range(afFrom, afTo),
    supabase.from("recursos_produtivos").select("id, codigo, nome, tipo").in("tipo", ["maquina", "equipamento"]).order("nome"),
  ]);

  const documentoIds = (documentos ?? []).map((d) => d.id);
  // §6 — anexos por documento; files_select já filtra por rh.view pra
  // entity_type='funcionario_documento' (migration 20261010000000).
  const { data: anexos } =
    documentoIds.length > 0
      ? await supabase
          .from("files")
          .select("id, entity_id, original_name, mime_type, size_bytes, created_at")
          .eq("entity_type", "funcionario_documento")
          .in("entity_id", documentoIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: [] as never[] };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <p className="font-mono text-[11px] text-primary">TÓPICO 17 — RH</p>
      <h1 className="mt-1 text-lg font-semibold text-text">RH</h1>
      <p className="mt-1 text-sm text-text">
        Cadastro de funcionários, vínculo com usuário, desligamento, documentos de admissão,
        certificações/treinamentos (incl. segurança), EPI, habilitações para operar equipamento
        (com vínculo opcional a um recurso produtivo cadastrado) e afastamentos/férias. Dados
        pessoais sensíveis (LGPD) — visível só a quem tem permissão explícita. Sem folha de
        pagamento, encargos, rescisão, escala ou ponto (fora de escopo do módulo).
      </p>

      <div className="mt-6">
        <RHSection
          rows={funcionariosPagina ?? []}
          fuPaginacao={fuPaginacao}
          funcionariosTodos={funcionariosTodos ?? []}
          unidades={unidades ?? []}
          profiles={profiles ?? []}
          documentos={documentos ?? []}
          docPaginacao={docPaginacao}
          afastamentos={afastamentos ?? []}
          afPaginacao={afPaginacao}
          recursos={recursos ?? []}
          anexos={anexos ?? []}
          canManage={!!canManage}
        />
      </div>
    </div>
  );
}
