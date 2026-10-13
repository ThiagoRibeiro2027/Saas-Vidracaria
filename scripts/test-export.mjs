// Verifica a exportação de dados da empresa (src/app/export/actions.ts),
// achado da auditoria de gaps ADR-001 a ADR-012 (11/10/2026): a exportação
// só trazia profiles/files/activity_logs/subscription, sem nenhum dado de
// negócio — não cumpria ADR-003 §14 / Prompt Mestre item 32.
//
// exportCompanyDataAction() em si não dá pra chamar direto por um script
// Node (createClient() depende de next/headers, só existe dentro de uma
// requisição Next.js real) — por isso este teste replica exatamente a
// mesma lista de tabelas e consultas que a action usa, com um client
// autenticado comum (RLS de verdade, não service role), pra confirmar:
// (1) o gate de permissão export.company_data continua funcionando,
// (2) toda tabela da lista é consultável sem erro de SQL (pega nome de
//     tabela errado/renomeada, que é o risco real de uma lista grande),
// (3) dado de negócio inserido aparece de fato na exportação,
// (4) o link assinado de arquivo original é gerado e funciona.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-export.mjs

import "./lib/somente-local.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function createTenant(slug, name, identifier, roleKey) {
  const { data: company } = await admin
    .from("companies")
    .upsert({ slug, name }, { onConflict: "slug" })
    .select()
    .single();

  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";

  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }

  await admin.from("profiles").upsert(
    { id: userId, company_id: company.id, login_identifier: identifier, display_name: name },
    { onConflict: "id" },
  );

  const { data: role } = await admin.from("roles").select("id").is("company_id", null).eq("key", roleKey).single();
  const { data: existing } = await admin
    .from("user_roles")
    .select("id")
    .eq("profile_id", userId)
    .eq("role_id", role.id)
    .is("valid_until", null)
    .maybeSingle();
  if (!existing) {
    await admin.from("user_roles").insert({ profile_id: userId, role_id: role.id });
  }

  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });

  return { client, company, userId };
}

// Mesma lista de src/app/export/actions.ts (TENANT_TABLES) — mantida em
// sincronia manual; se divergir, é o próprio objetivo deste teste pegar.
const TENANT_TABLES = [
  "pessoas", "orcamentos", "orcamento_item_caracteristicas", "oportunidades", "propostas",
  "pedidos", "pedido_itens", "pedido_item_caracteristicas", "pedido_item_bom", "pedido_item_bom_itens",
  "pedido_item_divergencia_preco",
  "itens", "pecas", "peca_categorias", "peca_caracteristicas", "peca_composicao",
  "peca_composicao_comprimentos_barra", "peca_regras", "peca_revisoes", "engenharia_versoes",
  "itens_pecas_dimensionais", "item_materiais_alternativos", "measurement_rules", "company_measurement_units",
  "ordens_producao", "itens_producao", "op_lotes", "op_lote_operacoes", "op_lote_operacao_recursos",
  "lotes_fabris", "lote_fabril_itens", "roteiros_produtivos", "roteiro_operacoes", "recursos_produtivos",
  "producao_apontamentos", "producao_horizontes", "producao_status_labels", "sequenciamento_decisoes",
  "sequenciamento_pesos", "manutencoes_corretivas", "manutencoes_preventivas", "solicitacoes_nova_fabricacao",
  "inspecoes_qualidade", "nao_conformidades", "criterios_avaliacao_fornecedor", "fornecedor_avaliacoes",
  "expedicoes", "expedicao_itens", "ocorrencias_expedicao",
  "instalacoes", "instalacao_itens", "obras", "equipes_instalacao", "equipe_membros",
  "danos_instalacao", "ocorrencias_instalacao", "calendario_feriados",
  "estoque_saldos", "estoque_movimentacoes", "estoque_reservas",
  "necessidades_compra", "necessidade_consolidacao", "politicas_abastecimento", "solicitacoes_compra",
  "solicitacao_compra_itens", "cotacoes", "cotacao_itens", "cotacao_propostas", "cotacao_negociacoes",
  "cotacao_selecoes", "pedidos_compra", "pedido_compra_itens", "pedido_compra_programacoes",
  "compras_diretas", "compras_alcada_etapas", "compras_aprovacao_etapas", "compras_aprovacoes",
  "recebimentos_pedido_compra", "recebimento_itens", "divergencias_recebimento", "devolucoes_compra",
  "lotes_recebimento", "fornecedor_dados", "item_fornecedores", "historico_precos_item_fornecedor",
  "orcamentos_compra", "importacoes",
  "titulos_financeiros", "titulos_pagar", "cobrancas", "pagamentos_titulo_compra", "recebimentos_titulo",
  "contas_bancarias", "movimentacoes_bancarias", "financeiro_alcada_etapas", "financeiro_aprovacao_etapas",
  "financeiro_aprovacoes", "approval_thresholds", "pricing_settings",
  "documentos_fiscais", "documento_fiscal_tentativas",
  "contratos",
  "funcionarios", "funcionario_documentos", "funcionario_afastamentos",
  "notificacoes", "variavel_categorias", "variavel_templates",
  "company_units",
];

async function main() {
  console.log("Preparando tenants (admin, sem-permissão)...");
  const admTenant = await createTenant("t-export-admin", "Export Admin Teste", "exp01", "ADMIN");
  const noPermTenant = await createTenant("t-export-noperm", "Export SemPerm Teste", "exp02", "COMERCIAL");

  console.log("\n1. Gate de permissão export.company_data");
  {
    const { data: semPerm } = await noPermTenant.client.rpc("has_permission", {
      p_resource: "export", p_action: "company_data",
    });
    check("usuário COMERCIAL não tem permissão de exportar", !semPerm);

    const { data: comPerm } = await admTenant.client.rpc("has_permission", {
      p_resource: "export", p_action: "company_data",
    });
    check("ADMIN tem permissão de exportar", !!comPerm);
  }

  console.log("\n2. Dado de negócio inserido aparece na consulta de exportação");
  {
    const { data: pessoa, error: pessoaError } = await admin
      .from("pessoas")
      .insert({ company_id: admTenant.company.id, nome: "Cliente Teste Exportação", situacao: "ativo" })
      .select()
      .single();
    check("fixture: cliente de teste criado", !pessoaError && !!pessoa);

    const { data: pessoasExport, error: pessoasExportError } = await admTenant.client
      .from("pessoas").select("*").order("id", { ascending: true }).range(0, 999);
    check("consulta de exportação (pessoas) não dá erro", !pessoasExportError);
    check("cliente de teste aparece na exportação", (pessoasExport ?? []).some((p) => p.id === pessoa.id));
  }

  console.log("\n3. Toda tabela da lista é consultável sem erro de SQL (RLS real, não service role)");
  {
    const orderByOverride = { peca_categorias: ["peca_id", "categoria_id"] };
    let semErro = 0;
    const comErro = [];
    for (const table of TENANT_TABLES) {
      let query = admTenant.client.from(table).select("*");
      for (const column of orderByOverride[table] ?? ["id"]) query = query.order(column, { ascending: true });
      const { error } = await query.range(0, 999);
      if (error) comErro.push(`${table}: ${error.message}`);
      else semErro++;
    }
    check(`todas as ${TENANT_TABLES.length} tabelas consultadas sem erro (${semErro} ok)`, comErro.length === 0);
    if (comErro.length > 0) console.error("    Falharam:\n      " + comErro.join("\n      "));
  }

  console.log("\n4. Link assinado do arquivo original (não só metadado)");
  {
    // Bucket "company-files" só aceita imagem/PDF (allowed_mime_types) — um
    // PDF mínimo válido serve de fixture.
    const pdfBytes = new TextEncoder().encode(
      "%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>",
    );
    const path = `${admTenant.company.id}/teste/geral/export-teste-${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("company-files")
      .upload(path, new Blob([pdfBytes], { type: "application/pdf" }), {
        contentType: "application/pdf", upsert: true,
      });
    if (uploadError) console.error("    [debug] uploadError:", uploadError);
    check("fixture: upload de arquivo de teste", !uploadError);

    const { data: file, error: fileError } = await admin
      .from("files")
      .insert({
        company_id: admTenant.company.id, entity_type: "teste", entity_id: admTenant.userId,
        original_name: "export-teste.pdf", mime_type: "application/pdf", size_bytes: pdfBytes.length,
        bucket_id: "company-files", storage_path: path, uploaded_by: admTenant.userId,
      })
      .select()
      .single();
    check("fixture: linha de files criada", !fileError && !!file);

    if (file) {
      const { data: filesExport } = await admTenant.client
        .from("files")
        .select("id, bucket_id, storage_path")
        .eq("id", file.id)
        .single();
      const { data: signed, error: signError } = await admTenant.client.storage
        .from(filesExport.bucket_id)
        .createSignedUrl(filesExport.storage_path, 86400);
      if (signError) console.error("    [debug] signError:", signError, "path:", filesExport.storage_path);
      check("link assinado gerado sem erro", !signError && !!signed?.signedUrl);

      if (signed?.signedUrl) {
        const resp = await fetch(signed.signedUrl);
        check("link assinado baixa o conteúdo original", resp.ok);
      }
    }
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
