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

  // =========================================================================
  // Fase F do plano de 23/09/2026 — Configurador (características de
  // peça). Dentro do que o ADR-002 §4.5 já autoriza ("características
  // técnicas" explícito na lista) — não precisa de emenda. Definir a
  // característica é pecas.manage; informar o valor por pedido_item é
  // engenharia.manage (ADR-002 §4.5, "medidas... características
  // técnicas" é Engenharia transformando pedido em informação
  // executável).
  // =========================================================================

  console.log("\n26. Massa de dados — peça com características numero/opcao");
  const { data: itemPecaCfgId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "JAN-PC-CFG", p_descricao: "Janela Cfg", p_tipo: "produto_acabado",
    p_classificacao: "esquadria", p_unidade_principal: "UN", p_situacao: "ativo",
  });
  const { data: pecaCfgId } = await admTenant.client.rpc("criar_peca", { p_item_id: itemPecaCfgId, p_descricao_tecnica: null });

  console.log("\n27. definir_caracteristica_peca() numero e opcao");
  const { data: caractLarguraId } = await admTenant.client.rpc("definir_caracteristica_peca", {
    p_peca_id: pecaCfgId, p_nome: "largura", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: true,
  });
  check("característica numérica criada", !!caractLarguraId);
  const { data: caractVidroId } = await admTenant.client.rpc("definir_caracteristica_peca", {
    p_peca_id: pecaCfgId, p_nome: "vidro", p_tipo: "opcao", p_unidade: null,
    p_opcoes: ["temperado_6mm", "temperado_8mm", "laminado"], p_obrigatoria: true,
  });
  check("característica de opção criada", !!caractVidroId);

  console.log("\n28. definir_caracteristica_peca() rejeita opção sem lista e não-opção com lista");
  {
    const { error: semListaErr } = await admTenant.client.rpc("definir_caracteristica_peca", {
      p_peca_id: pecaCfgId, p_nome: "acabamento", p_tipo: "opcao", p_unidade: null, p_opcoes: null, p_obrigatoria: true,
    });
    check("tipo opcao sem lista é rejeitado", !!semListaErr);

    const { error: comListaErr } = await admTenant.client.rpc("definir_caracteristica_peca", {
      p_peca_id: pecaCfgId, p_nome: "altura", p_tipo: "numero", p_unidade: "mm", p_opcoes: ["x"], p_obrigatoria: true,
    });
    check("tipo numero com lista é rejeitado", !!comListaErr);
  }

  console.log("\n29. definir_caracteristica_peca() exige pecas.manage");
  {
    const { error } = await noPermTenant.client.rpc("definir_caracteristica_peca", {
      p_peca_id: pecaCfgId, p_nome: "outra", p_tipo: "texto", p_unidade: null, p_opcoes: null, p_obrigatoria: false,
    });
    check("sem pecas.manage não define característica", !!error);
  }

  console.log("\n30. Pedido com item configurável — captura de valores");
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: "ORCPCF-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido", p_prefixo: "PEDPCF-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  const { data: clienteCfgId } = await admTenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CPF", p_documento: "77777777777", p_nome: "Cliente Cfg Teste",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: clienteCfgId, p_papel: "CLIENTE", p_ativo: true });
  const { data: orcamentoCfgId } = await admTenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: clienteCfgId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
  });
  await admTenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoCfgId, p_item_id: itemPecaCfgId, p_quantidade: 1, p_preco_unitario: 1000,
  });
  await admTenant.client.rpc("decidir_orcamento", { p_id: orcamentoCfgId, p_decisao: "aprovado" });
  const { data: pedidoCfgId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoCfgId });
  const { data: pedidoItemCfg } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoCfgId).single();
  const pedidoItemCfgId = pedidoItemCfg.id;

  console.log("\n31. definir_valor_caracteristica_pedido_item() sucesso e validações de tipo");
  {
    const { error: okErr } = await admTenant.client.rpc("definir_valor_caracteristica_pedido_item", {
      p_pedido_item_id: pedidoItemCfgId, p_peca_caracteristica_id: caractLarguraId, p_valor_numero: 1800, p_valor_texto: null,
    });
    check("valor numérico aceito", !okErr);

    const { error: tipoErradoErr } = await admTenant.client.rpc("definir_valor_caracteristica_pedido_item", {
      p_pedido_item_id: pedidoItemCfgId, p_peca_caracteristica_id: caractLarguraId, p_valor_numero: 1800, p_valor_texto: "errado",
    });
    check("numérico com valor_texto junto é rejeitado", !!tipoErradoErr);

    const { error: opcaoInvalidaErr } = await admTenant.client.rpc("definir_valor_caracteristica_pedido_item", {
      p_pedido_item_id: pedidoItemCfgId, p_peca_caracteristica_id: caractVidroId, p_valor_numero: null, p_valor_texto: "nao_existe",
    });
    check("opção fora da lista é rejeitada", !!opcaoInvalidaErr);

    const { error: opcaoOkErr } = await admTenant.client.rpc("definir_valor_caracteristica_pedido_item", {
      p_pedido_item_id: pedidoItemCfgId, p_peca_caracteristica_id: caractVidroId, p_valor_numero: null, p_valor_texto: "temperado_8mm",
    });
    check("opção válida aceita", !opcaoOkErr);
  }

  console.log("\n32. definir_valor_caracteristica_pedido_item() reexecutado atualiza (upsert)");
  {
    await admTenant.client.rpc("definir_valor_caracteristica_pedido_item", {
      p_pedido_item_id: pedidoItemCfgId, p_peca_caracteristica_id: caractLarguraId, p_valor_numero: 2000, p_valor_texto: null,
    });
    const { data } = await admin
      .from("pedido_item_caracteristicas")
      .select("valor_numero")
      .eq("pedido_item_id", pedidoItemCfgId)
      .eq("peca_caracteristica_id", caractLarguraId)
      .single();
    check("valor atualizado em vez de duplicar linha", Number(data?.valor_numero) === 2000);
  }

  console.log("\n33. definir_valor_caracteristica_pedido_item() exige engenharia.manage");
  {
    const { error } = await noPermTenant.client.rpc("definir_valor_caracteristica_pedido_item", {
      p_pedido_item_id: pedidoItemCfgId, p_peca_caracteristica_id: caractLarguraId, p_valor_numero: 1, p_valor_texto: null,
    });
    check("sem engenharia.manage não informa valor", !!error);
  }

  console.log("\n34. listar_valores_caracteristicas_pedido_item() traz as 2 características");
  {
    const { data } = await admTenant.client.rpc("listar_valores_caracteristicas_pedido_item", { p_pedido_item_id: pedidoItemCfgId });
    check("traz as 2 características da peça, com valor", (data ?? []).length === 2 && data.every((c) => c.valor_numero !== null || c.valor_texto !== null));
  }

  console.log("\n35. remover_caracteristica_peca() rejeita quando já há valor informado");
  {
    const { error } = await admTenant.client.rpc("remover_caracteristica_peca", { p_id: caractLarguraId });
    check("não remove característica com valor já informado", !!error);
  }

  console.log("\n36. Isolamento entre tenants (configurador)");
  {
    const { error: err1 } = await otherTenant.client.rpc("definir_caracteristica_peca", {
      p_peca_id: pecaCfgId, p_nome: "outra", p_tipo: "texto", p_unidade: null, p_opcoes: null, p_obrigatoria: false,
    });
    check("tenant B não define característica em peça do tenant A", !!err1);

    const { error: err2 } = await otherTenant.client.rpc("definir_valor_caracteristica_pedido_item", {
      p_pedido_item_id: pedidoItemCfgId, p_peca_caracteristica_id: caractLarguraId, p_valor_numero: 1, p_valor_texto: null,
    });
    check("tenant B não informa valor em pedido do tenant A", !!err2);
  }

  console.log("\n37. Auditoria do configurador");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", ["pecas.caracteristica_definida", "engenharia.caracteristica_valor_definido"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("pecas.caracteristica_definida registrado", actions.has("pecas.caracteristica_definida"));
    check("engenharia.caracteristica_valor_definido registrado", actions.has("engenharia.caracteristica_valor_definido"));
  }

  // =========================================================================
  // Fase G do plano de 23/09/2026 — motor de regras básico, liberado pela
  // emenda ao ADR-002 §4.5 v2.8. Regra imutável (versionada via
  // substitui_regra_id) e simular_bom_sugerida() só leitura — nada escreve
  // na composição real.
  // =========================================================================

  console.log("\n38. Massa de dados — peça com composição base + 2 características");
  const { data: itemPecaMrId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "JAN-PC-MR", p_descricao: "Janela MR", p_tipo: "produto_acabado",
    p_classificacao: "esquadria", p_unidade_principal: "UN", p_situacao: "ativo",
  });
  const { data: itemPerfilMrId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "PRF-PC-MR", p_descricao: "Perfil base", p_tipo: "materia_prima",
    p_classificacao: "perfil", p_unidade_principal: "M", p_situacao: "ativo",
  });
  const { data: itemReforcoMrId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "REF-PC-MR", p_descricao: "Reforço estrutural", p_tipo: "materia_prima",
    p_classificacao: "perfil", p_unidade_principal: "M", p_situacao: "ativo",
  });
  const { data: itemVidroMrId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "VID-PC-MR", p_descricao: "Vidro", p_tipo: "materia_prima",
    p_classificacao: "vidro", p_unidade_principal: "M2", p_situacao: "ativo",
  });
  const { data: pecaMrId } = await admTenant.client.rpc("criar_peca", { p_item_id: itemPecaMrId, p_descricao_tecnica: null });
  await admTenant.client.rpc("adicionar_material_peca", { p_peca_id: pecaMrId, p_material_item_id: itemPerfilMrId, p_quantidade_por_unidade: 2, p_observacao: null });
  await admTenant.client.rpc("adicionar_material_peca", { p_peca_id: pecaMrId, p_material_item_id: itemVidroMrId, p_quantidade_por_unidade: 1, p_observacao: null });
  const { data: caractLarguraMrId } = await admTenant.client.rpc("definir_caracteristica_peca", {
    p_peca_id: pecaMrId, p_nome: "largura", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: true,
  });
  const { data: caractVidroTipoId } = await admTenant.client.rpc("definir_caracteristica_peca", {
    p_peca_id: pecaMrId, p_nome: "vidro_tipo", p_tipo: "opcao", p_unidade: null, p_opcoes: ["comum", "temperado"], p_obrigatoria: true,
  });

  console.log("\n39. criar_regra_peca() rejeita ajustar_quantidade se material não está na composição base");
  {
    const { error } = await admTenant.client.rpc("criar_regra_peca", {
      p_peca_id: pecaMrId, p_caracteristica_id: caractLarguraMrId, p_operador: ">", p_valor_comparacao_numero: 1500, p_valor_comparacao_texto: null,
      p_acao: "ajustar_quantidade", p_acao_material_item_id: itemReforcoMrId, p_acao_quantidade: 1, p_motivo: null, p_substitui_regra_id: null,
    });
    check("ajustar_quantidade de material fora da composição é rejeitado", !!error);
  }

  console.log("\n40. criar_regra_peca() adicionar_material — largura > 1500 adiciona reforço");
  const { data: regraReforcoId } = await admTenant.client.rpc("criar_regra_peca", {
    p_peca_id: pecaMrId, p_caracteristica_id: caractLarguraMrId, p_operador: ">", p_valor_comparacao_numero: 1500, p_valor_comparacao_texto: null,
    p_acao: "adicionar_material", p_acao_material_item_id: itemReforcoMrId, p_acao_quantidade: 1, p_motivo: "reforço em vãos largos", p_substitui_regra_id: null,
  });
  check("regra de adicionar material criada", !!regraReforcoId);

  console.log("\n41. criar_regra_peca() rejeita adicionar_material já presente na composição base");
  {
    const { error } = await admTenant.client.rpc("criar_regra_peca", {
      p_peca_id: pecaMrId, p_caracteristica_id: caractLarguraMrId, p_operador: ">", p_valor_comparacao_numero: 1500, p_valor_comparacao_texto: null,
      p_acao: "adicionar_material", p_acao_material_item_id: itemPerfilMrId, p_acao_quantidade: 3, p_motivo: null, p_substitui_regra_id: null,
    });
    check("adicionar material já presente na composição é rejeitado", !!error);
  }

  console.log("\n42. criar_regra_peca() rejeita operador incompatível com tipo opcao");
  {
    const { error } = await admTenant.client.rpc("criar_regra_peca", {
      p_peca_id: pecaMrId, p_caracteristica_id: caractVidroTipoId, p_operador: ">", p_valor_comparacao_numero: null, p_valor_comparacao_texto: "temperado",
      p_acao: "ajustar_quantidade", p_acao_material_item_id: itemVidroMrId, p_acao_quantidade: 1, p_motivo: null, p_substitui_regra_id: null,
    });
    check("operador > em característica de opção é rejeitado", !!error);
  }

  console.log("\n43. criar_regra_peca() vidro_tipo=temperado ajusta quantidade do vidro");
  const { data: regraVidroId } = await admTenant.client.rpc("criar_regra_peca", {
    p_peca_id: pecaMrId, p_caracteristica_id: caractVidroTipoId, p_operador: "=", p_valor_comparacao_numero: null, p_valor_comparacao_texto: "temperado",
    p_acao: "ajustar_quantidade", p_acao_material_item_id: itemVidroMrId, p_acao_quantidade: 1.2, p_motivo: null, p_substitui_regra_id: null,
  });
  check("regra de ajuste de quantidade criada", !!regraVidroId);

  console.log("\n44. \"Editar\" regra via substitui_regra_id — versão incrementa, anterior desativa");
  const { data: regraReforcoV2Id } = await admTenant.client.rpc("criar_regra_peca", {
    p_peca_id: pecaMrId, p_caracteristica_id: caractLarguraMrId, p_operador: ">", p_valor_comparacao_numero: 1600, p_valor_comparacao_texto: null,
    p_acao: "adicionar_material", p_acao_material_item_id: itemReforcoMrId, p_acao_quantidade: 1, p_motivo: "limiar ajustado", p_substitui_regra_id: regraReforcoId,
  });
  {
    const { data: antiga } = await admin.from("peca_regras").select("ativo").eq("id", regraReforcoId).single();
    check("regra antiga desativada ao ser substituída", antiga?.ativo === false);
    const { data: nova } = await admin.from("peca_regras").select("versao, ativo").eq("id", regraReforcoV2Id).single();
    check("regra nova nasce com versão incrementada e ativa", nova?.versao === 2 && nova?.ativo === true);
  }

  console.log("\n45. Pedido com item configurável, sem valores capturados — simulação = composição base");
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: "ORCMRT-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido", p_prefixo: "PEDMRT-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  const { data: clienteMrId } = await admTenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CPF", p_documento: "99999999999", p_nome: "Cliente Motor Regras",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: clienteMrId, p_papel: "CLIENTE", p_ativo: true });
  const { data: orcamentoMrId } = await admTenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: clienteMrId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
  });
  await admTenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoMrId, p_item_id: itemPecaMrId, p_quantidade: 1, p_preco_unitario: 1000,
  });
  await admTenant.client.rpc("decidir_orcamento", { p_id: orcamentoMrId, p_decisao: "aprovado" });
  const { data: pedidoMrId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoMrId });
  const { data: pedidoItemMr } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoMrId).single();
  const pedidoItemMrId = pedidoItemMr.id;

  {
    const { data } = await admTenant.client.rpc("simular_bom_sugerida", { p_pedido_item_id: pedidoItemMrId });
    check("sem valores capturados, simulação = 2 materiais base", (data ?? []).length === 2 && data.every((d) => d.origem === "base"));
  }

  console.log("\n46. Captura largura=1800 (>1600) e vidro_tipo=temperado — simulação aplica as 2 regras");
  await admTenant.client.rpc("definir_valor_caracteristica_pedido_item", {
    p_pedido_item_id: pedidoItemMrId, p_peca_caracteristica_id: caractLarguraMrId, p_valor_numero: 1800, p_valor_texto: null,
  });
  await admTenant.client.rpc("definir_valor_caracteristica_pedido_item", {
    p_pedido_item_id: pedidoItemMrId, p_peca_caracteristica_id: caractVidroTipoId, p_valor_numero: null, p_valor_texto: "temperado",
  });
  {
    const { data } = await admTenant.client.rpc("simular_bom_sugerida", { p_pedido_item_id: pedidoItemMrId });
    const reforco = data?.find((d) => d.material_codigo === "REF-PC-MR");
    const vidro = data?.find((d) => d.material_codigo === "VID-PC-MR");
    check("simulação adiciona reforço (regra, sem base)", reforco?.origem === "regra" && reforco?.quantidade_base === null && Number(reforco?.quantidade_sugerida) === 1);
    check("simulação ajusta vidro de 1.0 para 1.2 (regra)", vidro?.origem === "regra" && Number(vidro?.quantidade_base) === 1 && Number(vidro?.quantidade_sugerida) === 1.2);
  }

  console.log("\n47. simular_bom_sugerida() não escreve nada na composição real");
  {
    const { data } = await admin.from("peca_composicao").select("material_item_id, quantidade_por_unidade").eq("peca_id", pecaMrId);
    check("composição real continua só com os 2 materiais base", (data ?? []).length === 2);
  }

  console.log("\n48. desativar_regra_peca()");
  {
    const { error } = await admTenant.client.rpc("desativar_regra_peca", { p_id: regraVidroId });
    check("ADMIN desativa regra ativa", !error);
    const { data } = await admin.from("peca_regras").select("ativo").eq("id", regraVidroId).single();
    check("regra marcada como inativa", data?.ativo === false);
  }

  console.log("\n49. criar_regra_peca()/simular_bom_sugerida() exigem permissão");
  {
    const { error: err1 } = await noPermTenant.client.rpc("criar_regra_peca", {
      p_peca_id: pecaMrId, p_caracteristica_id: caractLarguraMrId, p_operador: ">", p_valor_comparacao_numero: 1, p_valor_comparacao_texto: null,
      p_acao: "ajustar_quantidade", p_acao_material_item_id: itemPerfilMrId, p_acao_quantidade: 1, p_motivo: null, p_substitui_regra_id: null,
    });
    check("sem pecas.manage não cria regra", !!err1);

    const { error: err2 } = await noPermTenant.client.rpc("simular_bom_sugerida", { p_pedido_item_id: pedidoItemMrId });
    check("sem engenharia.view não simula BOM sugerida", !!err2);
  }

  console.log("\n50. Isolamento entre tenants (motor de regras)");
  {
    const { error: err1 } = await otherTenant.client.rpc("criar_regra_peca", {
      p_peca_id: pecaMrId, p_caracteristica_id: caractLarguraMrId, p_operador: ">", p_valor_comparacao_numero: 1, p_valor_comparacao_texto: null,
      p_acao: "ajustar_quantidade", p_acao_material_item_id: itemPerfilMrId, p_acao_quantidade: 1, p_motivo: null, p_substitui_regra_id: null,
    });
    check("tenant B não cria regra em peça do tenant A", !!err1);

    const { error: err2 } = await otherTenant.client.rpc("simular_bom_sugerida", { p_pedido_item_id: pedidoItemMrId });
    check("tenant B não simula BOM de pedido do tenant A", !!err2);
  }

  console.log("\n51. Auditoria do motor de regras");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", ["pecas.regra_criada", "pecas.regra_desativada"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("pecas.regra_criada registrado", actions.has("pecas.regra_criada"));
    check("pecas.regra_desativada registrado", actions.has("pecas.regra_desativada"));
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
