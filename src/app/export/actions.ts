"use server";

import { createClient } from "@/lib/supabase/server";

// F10 (Mapa_Fases_Lacunas_Risco.md, auditoria 15/09/2026): a Data API do
// Supabase (PostgREST) tem um teto de linhas por resposta (padrão 1000,
// via max_rows) — sem paginar, uma empresa com mais linhas do que esse
// teto em qualquer tabela recebia uma exportação incompleta e silenciosa,
// sem qualquer indício de que faltavam dados. fetchAllRows() varre em
// páginas (cada chamada monta a query completa terminando em .range()) até
// a página vir mais curta que PAGE_SIZE.
const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error: error.message };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: rows, error: null };
}

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>;

// Toda tabela de TENANT_TABLES tem "id" como chave primária, exceto
// peca_categorias (N:N pura, chave composta peca_id+categoria_id) e
// company_work_schedule (chave composta company_id+dia_semana) e as
// tabelas de calendário (sem coluna id) — sem
// uma ordenação determinística, o .range() de fetchAllRows pode repetir ou
// pular linha entre páginas.
const ORDER_BY_OVERRIDE: Record<string, string[]> = {
  peca_categorias: ["peca_id", "categoria_id"],
  company_work_schedule: ["company_id", "dia_semana"],
  company_calendar_settings: ["company_id"],
  company_calendar_exceptions: ["company_id", "data"],
};

async function fetchAllFromTable(
  supabase: SupabaseClientLike,
  table: string,
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const orderColumns = ORDER_BY_OVERRIDE[table] ?? ["id"];
  return fetchAllRows((from, to) => {
    let query = supabase.from(table).select("*");
    for (const column of orderColumns) query = query.order(column, { ascending: true });
    return query.range(from, to);
  });
}

// Achado da auditoria de gaps ADR-001 a ADR-012 (11/10/2026): a exportação
// só trazia profiles/files/activity_logs/subscription — nenhum dado de
// negócio (clientes, pedidos, produção, instalação, financeiro, etc.), o
// que não cumpre ADR-003 §14 ("cadastros, registros operacionais,
// históricos e demais dados armazenados") nem o Prompt Mestre item 32
// ("clientes, projetos, pedidos, itens, instalações, histórico").
//
// Lista deliberadamente ampla: toda tabela com company_id, MENOS:
//   - profiles/files/activity_logs — já exportadas separadamente abaixo;
//   - roles — RBAC/governança de acesso, não "dado da empresa" no sentido
//     contratual (clientes/pedidos/produção/etc.), análogo a por que
//     "subscriptions" (plano/assinatura com o próprio SaaS) também fica
//     fora daqui (já resumido via company_usage());
//   - sync_operations, system_events, numbering_sequences — bookkeeping
//     técnico interno, sem valor de negócio isolado;
//   - integracoes* / integracao_* — o campo `config`/`secret` destas
//     tabelas pode conter credencial de sistema externo (ver comentário de
//     integracao_webhooks na migration 20261010002000); nunca incluir
//     segredo em um arquivo de exportação, mesmo que seja "da própria
//     empresa" — o arquivo exportado tem proteção muito mais fraca que o
//     banco. RLS destas tabelas já bloqueia SELECT por padrão de qualquer
//     forma (exceto integracoes/integracao_fonte_oficial/integracao_regras,
//     que têm config jsonb igualmente arriscado).
const TENANT_TABLES = [
  // Comercial / clientes
  "pessoas",
  "orcamentos",
  "orcamento_item_caracteristicas",
  "oportunidades",
  "propostas",
  // Pedidos
  "pedidos",
  "pedido_itens",
  "pedido_item_caracteristicas",
  "pedido_item_bom",
  "pedido_item_bom_itens",
  "pedido_item_divergencia_preco",
  // Engenharia / peças
  "itens",
  "pecas",
  "peca_categorias",
  "peca_caracteristicas",
  "peca_composicao",
  "peca_composicao_comprimentos_barra",
  "peca_regras",
  "peca_revisoes",
  "engenharia_versoes",
  "itens_pecas_dimensionais",
  "item_materiais_alternativos",
  "measurement_rules",
  "company_measurement_units",
  "company_work_schedule",
  "company_calendar_settings",
  "company_calendar_exceptions",
  // Produção
  "ordens_producao",
  "itens_producao",
  "op_lotes",
  "op_lote_operacoes",
  "op_lote_operacao_recursos",
  "lotes_fabris",
  "lote_fabril_itens",
  "roteiros_produtivos",
  "roteiro_operacoes",
  "recursos_produtivos",
  "producao_apontamentos",
  "producao_horizontes",
  "producao_status_labels",
  "sequenciamento_decisoes",
  "sequenciamento_pesos",
  "manutencoes_corretivas",
  "manutencoes_preventivas",
  "solicitacoes_nova_fabricacao",
  // Qualidade
  "inspecoes_qualidade",
  "nao_conformidades",
  "criterios_avaliacao_fornecedor",
  "fornecedor_avaliacoes",
  // Expedição
  "expedicoes",
  "expedicao_itens",
  "ocorrencias_expedicao",
  // Instalação
  "instalacoes",
  "instalacao_itens",
  "obras",
  "equipes_instalacao",
  "equipe_membros",
  "danos_instalacao",
  "ocorrencias_instalacao",
  "calendario_feriados",
  // Estoque
  "estoque_saldos",
  "estoque_movimentacoes",
  "estoque_reservas",
  // Suprimentos / compras
  "necessidades_compra",
  "necessidade_consolidacao",
  "politicas_abastecimento",
  "solicitacoes_compra",
  "solicitacao_compra_itens",
  "cotacoes",
  "cotacao_itens",
  "cotacao_propostas",
  "cotacao_negociacoes",
  "cotacao_selecoes",
  "pedidos_compra",
  "pedido_compra_itens",
  "pedido_compra_programacoes",
  "compras_diretas",
  "compras_alcada_etapas",
  "compras_aprovacao_etapas",
  "compras_aprovacoes",
  "recebimentos_pedido_compra",
  "recebimento_itens",
  "divergencias_recebimento",
  "devolucoes_compra",
  "lotes_recebimento",
  "fornecedor_dados",
  "item_fornecedores",
  "historico_precos_item_fornecedor",
  "orcamentos_compra",
  "importacoes",
  // Financeiro
  "titulos_financeiros",
  "titulos_pagar",
  "cobrancas",
  "pagamentos_titulo_compra",
  "recebimentos_titulo",
  "contas_bancarias",
  "movimentacoes_bancarias",
  "financeiro_alcada_etapas",
  "financeiro_aprovacao_etapas",
  "financeiro_aprovacoes",
  "approval_thresholds",
  "pricing_settings",
  "pricing_cost_components",
  // Fiscal
  "documentos_fiscais",
  "documento_fiscal_tentativas",
  // Contratos
  "contratos",
  // RH
  "funcionarios",
  "funcionario_documentos",
  "funcionario_afastamentos",
  // Notificações / variáveis configuráveis
  "notificacoes",
  "variavel_categorias",
  "variavel_templates",
  // Governança multiempresa
  "company_units",
] as const;

// ADR-006 §3.22 / ADR-003 §14 / Prompt Mestre item 32: a empresa tem
// direito de exportar os próprios dados, em formato estruturado, sem que
// isso implique fornecer o banco de dados interno ou a arquitetura
// proprietária do SaaS — por isso montamos um JSON curado por tabela, nunca
// um dump bruto. company_id nunca é aceito como parâmetro: a RLS de cada
// tabela consultada já garante que só vem o dado da própria empresa.
export async function exportCompanyDataAction(): Promise<{ error: string } | { data: string }> {
  const supabase = await createClient();

  const { data: canExport } = await supabase.rpc("has_permission", {
    p_resource: "export",
    p_action: "company_data",
  });
  if (!canExport) return { error: "Sem permissão para exportar os dados da empresa." };

  const [company, profiles, files, activityLogs, subscription] = await Promise.all([
    supabase.from("companies").select("id, name, slug, timezone, status, created_at").single(),
    fetchAllRows((from, to) =>
      supabase
        .from("profiles")
        .select("id, login_identifier, display_name, contact_email, active, created_at")
        .is("deleted_at", null)
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("files")
        .select("id, entity_type, entity_id, original_name, mime_type, size_bytes, bucket_id, storage_path, created_at")
        .is("deleted_at", null)
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("activity_logs")
        .select("id, action, entity_type, entity_id, description, created_at")
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    supabase.rpc("company_usage"),
  ]);

  if (company.error) return { error: "Não foi possível carregar os dados da empresa." };
  if (profiles.error || files.error || activityLogs.error) {
    return { error: "Não foi possível carregar todos os dados da empresa para exportação." };
  }

  // Link temporário (24h) pro arquivo original — ADR-003 §14 exige o
  // documento "em formato preservável ou no formato original", não só o
  // metadado. Bucket é privado (Prompt Mestre item 20): nunca URL pública.
  const filesWithLinks = await Promise.all(
    files.data.map(async ({ bucket_id, storage_path, ...rest }) => {
      const { data: signed } = await supabase.storage.from(bucket_id).createSignedUrl(storage_path, 86400);
      return { ...rest, download_url: signed?.signedUrl ?? null };
    }),
  );

  // Dump genérico de todo o resto do dado operacional da empresa (ver lista
  // e exclusões comentadas em TENANT_TABLES). Sequencial de propósito — são
  // ~100 tabelas, e isto não é um caminho de uso frequente.
  const business: Record<string, Record<string, unknown>[]> = {};
  for (const table of TENANT_TABLES) {
    const { data, error } = await fetchAllFromTable(supabase, table);
    if (error) return { error: `Não foi possível carregar os dados de "${table}" para exportação.` };
    business[table] = data;
  }

  const bundle = {
    exported_at: new Date().toISOString(),
    company: company.data,
    users: profiles.data,
    files: filesWithLinks,
    ...business,
    activity_log: activityLogs.data,
    subscription: subscription.data?.[0] ?? null,
  };

  await supabase.rpc("log_client_event", {
    p_action: "governance.data_exported",
    p_entity_type: "company",
    p_entity_id: company.data.id,
  });

  return { data: JSON.stringify(bundle, null, 2) };
}
