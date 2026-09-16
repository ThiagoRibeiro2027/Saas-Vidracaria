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
        .select("id, entity_type, entity_id, original_name, mime_type, size_bytes, created_at")
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

  const bundle = {
    exported_at: new Date().toISOString(),
    company: company.data,
    users: profiles.data,
    files: files.data,
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
