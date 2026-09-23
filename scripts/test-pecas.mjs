// Testes automatizados de Peças Fabricadas — Fase A do plano de
// 23/09/2026 (fila de produção, peças fabricadas e necessidades
// automáticas de suprimentos). Camada de BOM leve: uma peça (item
// componente/produto_acabado) associada a uma lista plana de materiais
// (matéria-prima/insumo/material auxiliar) e quantidade por unidade — sem
// hierarquia, sem motor de regras.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-pecas.mjs

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

async function createTenant(slug, name, identifier, roleKey = "ADMIN", existingCompany = null) {
  let company = existingCompany;
  if (!company) {
    const { data } = await admin
      .from("companies")
      .upsert({ slug, name }, { onConflict: "slug" })
      .select()
      .single();
    company = data;
  }

  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";

  const { data: created } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }

  await admin.from("profiles").upsert(
    { id: userId, company_id: company.id, login_identifier: identifier, display_name: name },
    { onConflict: "id" },
  );

  const { data: role } = await admin
    .from("roles")
    .select("id")
    .is("company_id", null)
    .eq("key", roleKey)
    .single();

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

async function main() {
  console.log("Preparando tenants (admin, sem-permissão de peças, outro tenant)...");
  const admTenant = await createTenant("pecas-test-admin", "Peças Admin Teste", "pc01", "ADMIN");
  // QUALIDADE não administra Peças — prova a autoridade separada (mesmo padrão de test-suprimentos.mjs).
  const noPermTenant = await createTenant("pecas-test-admin", "Peças SemPerm Teste", "pc02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant("pecas-test-other", "Peças Outro Teste", "pc03", "ADMIN");

  console.log("\n0. Massa de dados — item peça (produto_acabado), item material (matéria-prima), item errado (serviço)");
  const { data: itemPecaId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "JAN-PC-1", p_descricao: "Janela modelo teste", p_tipo: "produto_acabado",
    p_classificacao: "esquadria", p_unidade_principal: "UN", p_situacao: "ativo",
  });
  const { data: itemMaterialId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "PRF-PC-1", p_descricao: "Perfil alumínio teste", p_tipo: "materia_prima",
    p_classificacao: "perfil", p_unidade_principal: "M", p_situacao: "ativo",
  });
  const { data: itemServicoId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "SRV-PC-1", p_descricao: "Serviço teste", p_tipo: "servico",
    p_classificacao: null, p_unidade_principal: "UN", p_situacao: "ativo",
  });
  check("item peça criado", !!itemPecaId);
  check("item material criado", !!itemMaterialId);
  check("item serviço criado", !!itemServicoId);

  console.log("\n1. criar_peca() exige pecas.manage");
  {
    const { error } = await noPermTenant.client.rpc("criar_peca", { p_item_id: itemPecaId, p_descricao_tecnica: null });
    check("sem pecas.manage (papel QUALIDADE) não cria peça", !!error);
  }

  console.log("\n2. criar_peca() rejeita item de outra empresa");
  {
    const { error } = await otherTenant.client.rpc("criar_peca", { p_item_id: itemPecaId, p_descricao_tecnica: null });
    check("item de outro tenant é rejeitado", !!error);
  }

  console.log("\n3. criar_peca() rejeita item de tipo errado (serviço)");
  {
    const { error } = await admTenant.client.rpc("criar_peca", { p_item_id: itemServicoId, p_descricao_tecnica: null });
    check("item tipo 'servico' é rejeitado", !!error);
  }

  console.log("\n4. criar_peca() sucesso");
  let pecaId;
  {
    const { data, error } = await admTenant.client.rpc("criar_peca", { p_item_id: itemPecaId, p_descricao_tecnica: "Janela de correr 2 folhas" });
    check("ADMIN cria peça", !error && !!data);
    pecaId = data;

    const { data: p } = await admin.from("pecas").select("*").eq("id", pecaId).single();
    check("peça nasce 'ativo' com o item correto", p?.situacao === "ativo" && p?.item_id === itemPecaId);
  }

  console.log("\n5. criar_peca() rejeita item já cadastrado como peça");
  {
    const { error } = await admTenant.client.rpc("criar_peca", { p_item_id: itemPecaId, p_descricao_tecnica: null });
    check("item duplicado como peça é rejeitado", !!error);
  }

  console.log("\n6. adicionar_material_peca() exige pecas.manage");
  {
    const { error } = await noPermTenant.client.rpc("adicionar_material_peca", {
      p_peca_id: pecaId, p_material_item_id: itemMaterialId, p_quantidade_por_unidade: 2, p_observacao: null,
    });
    check("sem pecas.manage não adiciona material", !!error);
  }

  console.log("\n7. adicionar_material_peca() rejeita material de tipo errado (produto_acabado não é material)");
  {
    const { error } = await admTenant.client.rpc("adicionar_material_peca", {
      p_peca_id: pecaId, p_material_item_id: itemPecaId, p_quantidade_por_unidade: 1, p_observacao: null,
    });
    check("item tipo 'produto_acabado' como material é rejeitado", !!error);
  }

  console.log("\n8. adicionar_material_peca() rejeita quantidade <= 0");
  {
    const { error } = await admTenant.client.rpc("adicionar_material_peca", {
      p_peca_id: pecaId, p_material_item_id: itemMaterialId, p_quantidade_por_unidade: 0, p_observacao: null,
    });
    check("quantidade zero é rejeitada", !!error);
  }

  console.log("\n9. adicionar_material_peca() sucesso");
  let composicaoId;
  {
    const { data, error } = await admTenant.client.rpc("adicionar_material_peca", {
      p_peca_id: pecaId, p_material_item_id: itemMaterialId, p_quantidade_por_unidade: 3.5, p_observacao: "2 verticais + 1 horizontal",
    });
    check("ADMIN adiciona material à peça", !error && !!data);
    composicaoId = data;

    const { data: c } = await admin.from("peca_composicao").select("*").eq("id", composicaoId).single();
    check("linha de composição nasce com a quantidade correta", Number(c?.quantidade_por_unidade) === 3.5);
  }

  console.log("\n10. adicionar_material_peca() rejeita material duplicado na mesma peça");
  {
    const { error } = await admTenant.client.rpc("adicionar_material_peca", {
      p_peca_id: pecaId, p_material_item_id: itemMaterialId, p_quantidade_por_unidade: 1, p_observacao: null,
    });
    check("material já presente na peça é rejeitado", !!error);
  }

  console.log("\n11. atualizar_material_peca() sucesso");
  {
    const { error } = await admTenant.client.rpc("atualizar_material_peca", {
      p_id: composicaoId, p_quantidade_por_unidade: 4, p_observacao: "ajustado",
    });
    check("ADMIN atualiza quantidade da composição", !error);
    const { data: c } = await admin.from("peca_composicao").select("quantidade_por_unidade, observacao").eq("id", composicaoId).single();
    check("quantidade e observação atualizadas", Number(c?.quantidade_por_unidade) === 4 && c?.observacao === "ajustado");
  }

  console.log("\n12. listar_composicao_peca() traz a linha com dados do item");
  {
    const { data, error } = await admTenant.client.rpc("listar_composicao_peca", { p_peca_id: pecaId });
    check("listar_composicao_peca() sem erro", !error);
    check("traz 1 linha com código do material", (data ?? []).length === 1 && data[0].material_codigo === "PRF-PC-1");
  }

  console.log("\n13. remover_material_peca() sucesso");
  {
    const { error } = await admTenant.client.rpc("remover_material_peca", { p_id: composicaoId });
    check("ADMIN remove material da composição", !error);
    const { data: c } = await admin.from("peca_composicao").select("id").eq("id", composicaoId).maybeSingle();
    check("linha de composição não existe mais", !c);
  }

  console.log("\n14. inativar_peca() / reativar_peca()");
  {
    const { error: inativarErr } = await admTenant.client.rpc("inativar_peca", { p_id: pecaId });
    check("ADMIN inativa peça ativa", !inativarErr);

    const { error: inativarDeNovoErr } = await admTenant.client.rpc("inativar_peca", { p_id: pecaId });
    check("inativar peça já inativa é rejeitado", !!inativarDeNovoErr);

    const { error: reativarErr } = await admTenant.client.rpc("reativar_peca", { p_id: pecaId });
    check("ADMIN reativa peça inativa", !reativarErr);
  }

  console.log("\n15. Isolamento entre tenants");
  {
    const { data: crossSelect } = await otherTenant.client.from("pecas").select("id").eq("company_id", admTenant.company.id);
    check("tenant B não enxerga peças do tenant A via SELECT direto", (crossSelect ?? []).length === 0);

    const { error } = await otherTenant.client.rpc("inativar_peca", { p_id: pecaId });
    check("tenant B não consegue inativar peça do tenant A", !!error);

    const { error: listarErr } = await otherTenant.client.rpc("listar_composicao_peca", { p_peca_id: pecaId });
    check("tenant B não consegue listar composição de peça do tenant A", !!listarErr);
  }

  console.log("\n16. SELECT liberado sem pecas.manage (papel QUALIDADE lê normalmente)");
  {
    const { data, error } = await noPermTenant.client.from("pecas").select("id").eq("id", pecaId);
    check("papel QUALIDADE (sem pecas.manage) lê pecas da própria empresa", !error && (data ?? []).length === 1);
  }

  console.log("\n17. Cada ação grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "pecas.peca_criada", "pecas.material_adicionado", "pecas.material_atualizado",
        "pecas.material_removido", "pecas.peca_inativada", "pecas.peca_reativada",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    for (const action of [
      "pecas.peca_criada", "pecas.material_adicionado", "pecas.material_atualizado",
      "pecas.material_removido", "pecas.peca_inativada", "pecas.peca_reativada",
    ]) {
      check(`${action} registrado`, actions.has(action));
    }
  }

  // =========================================================================
  // Fase E do plano de 23/09/2026 — BOM hierárquica (peça pode conter
  // outra peça como subconjunto, com trava de ciclo) e revisão básica
  // (snapshot a cada mudança estrutural). Dentro do que o ADR-002 §4.5 já
  // autoriza — não precisa de emenda.
  // =========================================================================

  console.log("\n18. Massa de dados — peça A (janela) e peça B (folha), ambas ativas");
  const { data: itemPecaAId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "JAN-PC-A", p_descricao: "Janela A", p_tipo: "produto_acabado",
    p_classificacao: "esquadria", p_unidade_principal: "UN", p_situacao: "ativo",
  });
  const { data: itemPecaBId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "FLH-PC-B", p_descricao: "Folha B", p_tipo: "componente",
    p_classificacao: "folha", p_unidade_principal: "UN", p_situacao: "ativo",
  });
  const { data: pecaAId } = await admTenant.client.rpc("criar_peca", { p_item_id: itemPecaAId, p_descricao_tecnica: null });
  const { data: pecaBId } = await admTenant.client.rpc("criar_peca", { p_item_id: itemPecaBId, p_descricao_tecnica: null });

  console.log("\n19. adicionar_material_peca() aceita subconjunto (peça B dentro de peça A)");
  {
    const { error } = await admTenant.client.rpc("adicionar_material_peca", {
      p_peca_id: pecaAId, p_material_item_id: itemPecaBId, p_quantidade_por_unidade: 2, p_observacao: "duas folhas por janela",
    });
    check("ADMIN adiciona peça B como subconjunto de peça A", !error);
  }

  console.log("\n20. adicionar_material_peca() rejeita ciclo direto e indireto");
  {
    const { error: diretoErr } = await admTenant.client.rpc("adicionar_material_peca", {
      p_peca_id: pecaAId, p_material_item_id: itemPecaAId, p_quantidade_por_unidade: 1, p_observacao: null,
    });
    check("ciclo direto (peça A dentro dela mesma) é rejeitado", !!diretoErr);

    const { error: indiretoErr } = await admTenant.client.rpc("adicionar_material_peca", {
      p_peca_id: pecaBId, p_material_item_id: itemPecaAId, p_quantidade_por_unidade: 1, p_observacao: null,
    });
    check("ciclo indireto (A dentro de B, que já está dentro de A) é rejeitado", !!indiretoErr);
  }

  console.log("\n21. adicionar_material_peca() rejeita item que ainda não é peça como subconjunto");
  {
    const { data: itemSemPecaId } = await admTenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: "JAN-PC-SEMBOM", p_descricao: "Janela sem peça", p_tipo: "produto_acabado",
      p_classificacao: "esquadria", p_unidade_principal: "UN", p_situacao: "ativo",
    });
    const { error } = await admTenant.client.rpc("adicionar_material_peca", {
      p_peca_id: pecaAId, p_material_item_id: itemSemPecaId, p_quantidade_por_unidade: 1, p_observacao: null,
    });
    check("item ainda não cadastrado como peça não vira subconjunto", !!error);
  }

  console.log("\n22. listar_composicao_peca() marca eh_peca corretamente");
  {
    const { data } = await admTenant.client.rpc("listar_composicao_peca", { p_peca_id: pecaAId });
    check("linha da peça B dentro de A tem eh_peca = true", data?.[0]?.eh_peca === true);
  }

  console.log("\n23. Revisão incrementada e histórico gravado");
  {
    const { data: peca } = await admin.from("pecas").select("revisao_atual").eq("id", pecaAId).single();
    check("revisao_atual incrementada para 1 após a 1ª mudança estrutural", peca?.revisao_atual === 1);

    const { data: revisoes, error } = await admTenant.client.rpc("listar_revisoes_peca", { p_peca_id: pecaAId });
    check("listar_revisoes_peca() sem erro", !error);
    check("traz 1 revisão com snapshot da composição", (revisoes ?? []).length === 1 && Array.isArray(revisoes[0].composicao_snapshot));
  }

  console.log("\n24. inativar_peca() rejeita peça usada como subconjunto ativo em outra peça");
  {
    const { error } = await admTenant.client.rpc("inativar_peca", { p_id: pecaBId });
    check("peça B (subconjunto ativo de A) não pode ser inativada", !!error);
  }

  console.log("\n25. gerar_necessidades_de_pedido() soma a árvore inteira (recursivo)");
  {
    const { data: itemMaterialXId } = await admTenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: "PRF-PC-X", p_descricao: "Perfil X", p_tipo: "materia_prima",
      p_classificacao: "perfil", p_unidade_principal: "M", p_situacao: "ativo",
    });
    await admTenant.client.rpc("adicionar_material_peca", {
      p_peca_id: pecaBId, p_material_item_id: itemMaterialXId, p_quantidade_por_unidade: 3, p_observacao: null,
    });

    await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "orcamento", p_prefixo: "ORCPC-", p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
    await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "pedido", p_prefixo: "PEDPC-", p_sufixo: "", p_digitos: 4,
      p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
    });
    const { data: clienteId } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: "CPF", p_documento: "55555555555", p_nome: "Cliente Peças Hier",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
      p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: clienteId, p_papel: "CLIENTE", p_ativo: true });
    const { data: orcamentoId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
    });
    await admTenant.client.rpc("upsert_orcamento_item", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemPecaAId, p_quantidade: 5, p_preco_unitario: 1000,
    });
    await admTenant.client.rpc("decidir_orcamento", { p_id: orcamentoId, p_decisao: "aprovado" });
    const { data: pedidoId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoId });
    await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoId });
    await admTenant.client.rpc("liberar_pedido", { p_id: pedidoId });

    // 5 janelas A x 2 folhas B x 3 perfis X = 30 — a folha B nunca aparece
    // como necessidade de compra (não é folha da árvore, é subconjunto).
    const { data } = await admTenant.client.rpc("gerar_necessidades_de_pedido", { p_pedido_id: pedidoId });
    check("necessidade recursiva soma a árvore inteira (5x2x3=30)", (data ?? []).length === 1 && Number(data[0].quantidade_gerada) === 30);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
