import { createClient } from "@/lib/supabase/server";
import RHSection from "./RHSection";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { calcularPaginacao, lerParametrosPaginacao } from "@/lib/paginacao";

// TÓPICO 17 — RH completo: cadastro de funcionários, vínculo com usuário,
// desligamento com revogação de acesso (recorte mínimo, migration
// 20260916050000), mais documentos/EPI/habilitações e afastamentos/
// férias (§6-7, migration 20261006000000), com vínculo opcional de
// habilitação a um recurso produtivo cadastrado (complemento,
// 20261010001900). "Cadastro de equipes" já foi antecipado no TÓPICO 16
// (equipes_instalacao).
//
// 2026-10-04: mesmo tratamento de Financeiro — as 3 seções (funcionários,
// documentos, afastamentos) viram abas na barra lateral, com uma aba
// "Visão geral" nova (indicadores) na frente. Só a aba ativa busca sua
// lista paginada; funcionários/unidades/profiles/recursos continuam
// sempre buscados (sem paginação) por serem usados como lookup/opção em
// mais de uma aba.
type TabSlug = "geral" | "funcionarios" | "documentos" | "afastamentos";

// ADR-013 (Identidade D), Fase 4.
const TAB_TITLE: Record<TabSlug, string> = {
  geral: "Visão geral",
  funcionarios: "Funcionários",
  documentos: "Documentos, EPI e habilitações",
  afastamentos: "Afastamentos e férias",
};

export default async function RHPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    fu_pagina?: string;
    fu_por_pagina?: string;
    doc_pagina?: string;
    doc_por_pagina?: string;
    af_pagina?: string;
    af_por_pagina?: string;
    fu_q?: string;
    fu_ordenar?: string;
    fu_status?: string;
    doc_q?: string;
    doc_ordenar?: string;
    doc_tipo?: string;
    af_ordenar?: string;
    af_tipo?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // 2026-10-11: busca/ordenação/filtro nas 3 listas paginadas (prefixo de
  // parâmetro próprio por lista, mesmo padrão já usado em Financeiro).
  const FU_ORDENAVEIS = ["nome", "status"] as const;
  const DOC_ORDENAVEIS = ["tipo", "status", "created_at"] as const;
  const AF_ORDENAVEIS = ["tipo", "data_inicio"] as const;
  const FUNCIONARIO_STATUS_VALORES = ["ativo", "afastado", "desligado"] as const;
  const TIPO_DOCUMENTO_VALORES = ["admissao", "certificacao", "epi", "habilitacao"] as const;
  const TIPO_AFASTAMENTO_VALORES = ["afastamento", "ferias"] as const;

  function lerOrdenacao(valor: string | undefined, permitidas: readonly string[]) {
    const [campo, direcao] = valor?.split(":") ?? [null, null];
    return campo && permitidas.includes(campo) ? { campo, ascending: direcao === "asc" } : null;
  }

  const fuBusca = params.fu_q?.trim() || null;
  const fuStatus = (FUNCIONARIO_STATUS_VALORES as readonly string[]).includes(params.fu_status ?? "") ? params.fu_status! : null;
  const fuOrdenacao = lerOrdenacao(params.fu_ordenar, FU_ORDENAVEIS);

  const docBusca = params.doc_q?.trim() || null;
  const docTipo = (TIPO_DOCUMENTO_VALORES as readonly string[]).includes(params.doc_tipo ?? "") ? params.doc_tipo! : null;
  const docOrdenacao = lerOrdenacao(params.doc_ordenar, DOC_ORDENAVEIS);

  const afTipo = (TIPO_AFASTAMENTO_VALORES as readonly string[]).includes(params.af_tipo ?? "") ? params.af_tipo! : null;
  const afOrdenacao = lerOrdenacao(params.af_ordenar, AF_ORDENAVEIS);

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

  const availableTabs: { slug: TabSlug; label: string }[] = [
    { slug: "geral", label: "Visão geral" },
    { slug: "funcionarios", label: "Funcionários" },
    { slug: "documentos", label: "Documentos, EPI e habilitações" },
    { slug: "afastamentos", label: "Afastamentos e férias" },
  ];
  const activeTab: TabSlug = availableTabs.some((t) => t.slug === params.tab) ? (params.tab as TabSlug) : "geral";

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

  const agora = new Date();
  const hoje = agora.toISOString().slice(0, 10);
  const em30Dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let totalFuncionariosQuery = supabase.from("funcionarios").select("id", { count: "exact", head: true });
  if (fuBusca) totalFuncionariosQuery = totalFuncionariosQuery.ilike("nome", `%${fuBusca}%`);
  if (fuStatus) totalFuncionariosQuery = totalFuncionariosQuery.eq("status", fuStatus);

  let totalDocumentosQuery = supabase.from("funcionario_documentos").select("id", { count: "exact", head: true });
  if (docBusca) totalDocumentosQuery = totalDocumentosQuery.ilike("nome", `%${docBusca}%`);
  if (docTipo) totalDocumentosQuery = totalDocumentosQuery.eq("tipo", docTipo);

  let totalAfastamentosQuery = supabase.from("funcionario_afastamentos").select("id", { count: "exact", head: true });
  if (afTipo) totalAfastamentosQuery = totalAfastamentosQuery.eq("tipo", afTipo);

  const [
    { count: totalFuncionarios },
    { count: totalDocumentos },
    { count: totalAfastamentos },
    { count: funcionariosAtivosCount },
    { count: funcionariosAfastadosCount },
    { count: funcionariosDesligadosCount },
    { count: documentosAtivosCount },
    { count: documentosVencendoCount },
    { count: afastamentosAbertosCount },
  ] = await Promise.all([
    totalFuncionariosQuery,
    totalDocumentosQuery,
    totalAfastamentosQuery,
    supabase.from("funcionarios").select("id", { count: "exact", head: true }).eq("status", "ativo"),
    supabase.from("funcionarios").select("id", { count: "exact", head: true }).eq("status", "afastado"),
    supabase.from("funcionarios").select("id", { count: "exact", head: true }).eq("status", "desligado"),
    supabase.from("funcionario_documentos").select("id", { count: "exact", head: true }).eq("status", "ativo"),
    supabase
      .from("funcionario_documentos")
      .select("id", { count: "exact", head: true })
      .eq("status", "ativo")
      .gte("validade", hoje)
      .lte("validade", em30Dias),
    supabase
      .from("funcionario_afastamentos")
      .select("id", { count: "exact", head: true })
      .eq("status", "ativo")
      .is("data_fim", null),
  ]);
  const { paginacao: fuPaginacao, from: fuFrom, to: fuTo } = calcularPaginacao(fuPaginaPedida, fuPorPagina, totalFuncionarios ?? 0);
  const { paginacao: docPaginacao, from: docFrom, to: docTo } = calcularPaginacao(docPaginaPedida, docPorPagina, totalDocumentos ?? 0);
  const { paginacao: afPaginacao, from: afFrom, to: afTo } = calcularPaginacao(afPaginaPedida, afPorPagina, totalAfastamentos ?? 0);

  let funcionariosPaginaQuery = supabase.from("funcionarios").select("*");
  if (fuBusca) funcionariosPaginaQuery = funcionariosPaginaQuery.ilike("nome", `%${fuBusca}%`);
  if (fuStatus) funcionariosPaginaQuery = funcionariosPaginaQuery.eq("status", fuStatus);
  funcionariosPaginaQuery = fuOrdenacao
    ? funcionariosPaginaQuery.order(fuOrdenacao.campo, { ascending: fuOrdenacao.ascending })
    : funcionariosPaginaQuery.order("nome");

  let documentosQuery = supabase.from("funcionario_documentos").select("*");
  if (docBusca) documentosQuery = documentosQuery.ilike("nome", `%${docBusca}%`);
  if (docTipo) documentosQuery = documentosQuery.eq("tipo", docTipo);
  documentosQuery = docOrdenacao
    ? documentosQuery.order(docOrdenacao.campo, { ascending: docOrdenacao.ascending })
    : documentosQuery.order("created_at", { ascending: false });

  let afastamentosQuery = supabase.from("funcionario_afastamentos").select("*");
  if (afTipo) afastamentosQuery = afastamentosQuery.eq("tipo", afTipo);
  afastamentosQuery = afOrdenacao
    ? afastamentosQuery.order(afOrdenacao.campo, { ascending: afOrdenacao.ascending })
    : afastamentosQuery.order("data_inicio", { ascending: false });

  const [
    { data: funcionariosPagina },
    { data: funcionariosTodos },
    { data: unidades },
    { data: profiles },
    { data: documentos },
    { data: afastamentos },
    { data: recursos },
  ] = await Promise.all([
    activeTab === "funcionarios" ? funcionariosPaginaQuery.range(fuFrom, fuTo) : Promise.resolve({ data: [] as never[] }),
    // Lookups (nome por funcionário) e os <select> dos formulários de
    // Documentos/Afastamentos precisam de qualquer funcionário, não só
    // dos da página atual — mesmo padrão de itens/pessoas em Comercial.
    supabase.from("funcionarios").select("id, nome, status, profile_id").order("nome"),
    supabase.from("company_units").select("id, name").eq("active", true).order("name"),
    supabase.from("profiles").select("id, display_name, login_identifier").eq("active", true).order("display_name"),
    activeTab === "documentos" ? documentosQuery.range(docFrom, docTo) : Promise.resolve({ data: [] as never[] }),
    activeTab === "afastamentos" ? afastamentosQuery.range(afFrom, afTo) : Promise.resolve({ data: [] as never[] }),
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
    <>
      <PageHeader breadcrumb={["RH"]} title={TAB_TITLE[activeTab]} />
      <div className="mx-auto max-w-7xl p-6">
      <p className="text-sm text-text">
        Cadastro de funcionários, vínculo com usuário, desligamento, documentos de admissão,
        certificações/treinamentos (incl. segurança), EPI, habilitações para operar equipamento
        (com vínculo opcional a um recurso produtivo cadastrado) e afastamentos/férias. Dados
        pessoais sensíveis (LGPD) — visível só a quem tem permissão explícita. Sem folha de
        pagamento, encargos, rescisão, escala ou ponto (fora de escopo do módulo).
      </p>

      <div className="mt-6">
        <RHSection
          activeTab={activeTab}
          indicadores={{
            funcionariosAtivos: funcionariosAtivosCount ?? 0,
            funcionariosAfastados: funcionariosAfastadosCount ?? 0,
            funcionariosDesligados: funcionariosDesligadosCount ?? 0,
            documentosAtivos: documentosAtivosCount ?? 0,
            documentosVencendo: documentosVencendoCount ?? 0,
            afastamentosAbertos: afastamentosAbertosCount ?? 0,
          }}
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
    </>
  );
}
