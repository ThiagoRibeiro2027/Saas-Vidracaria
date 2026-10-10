// Testes automatizados de Peças Fabricadas — Fase A do plano de
// 23/09/2026 (fila de produção, peças fabricadas e necessidades
// automáticas de suprimentos). Camada de BOM leve: uma peça (item
// componente/produto_acabado) associada a uma lista plana de materiais
// (matéria-prima/insumo/material auxiliar) e quantidade por unidade — sem
// hierarquia, sem motor de regras.
//
// ADR-012, Fase 1 (27/09/2026): precificação dimensional — perfil por
// metro linear, vidro por metro quadrado, custo vindo do histórico de
// compras real (pedido_compra_itens.custo_unitario), acessório com
// quantidade condicional reaproveitando o motor de regras desta mesma
// Fase G (nenhuma tabela nova pra isso).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-pecas.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Sufixo de execução — o banco é único e compartilhado entre as máquinas
// (CLAUDE.md, "Banco e ambiente de trabalho"), então o tenant de teste
// sobrevive de uma sessão pra outra. Com slug fixo, a 2ª execução esbarrava
// em itens_company_codigo_unique logo na seção 0 (os `upsert_item` usam
// `p_id: null` com código fixo), `itemPecaId`/`itemMaterialId` voltavam
// nulos e daí praticamente toda seção seguinte falhava em cascata — dezenas
// de ✗ que não representavam bug nenhum no produto. Tenant por execução
// resolve a classe inteira do problema: cada rodada nasce num tenant vazio,
// e as asserções podem continuar assumindo estado zerado (revisao_atual = 1,
// "traz 1 revisão", "traz 1 linha"). O custo é acumular um tenant
// `pecas-test-*-<sufixo>` por execução no banco da nuvem — limpeza é
// separada e combinada com o responsável, nunca automática.
const RUN = Date.now().toString(36);

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
    // Banco único compartilhado entre as máquinas (CLAUDE.md) acumula
    // usuários de teste entre sessões — sem perPage alto, o fixture antigo
    // deste e-mail some da 1ª página do listUsers() e o fallback nunca acha.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 10000 });
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
  console.log(`Preparando tenants (admin, sem-permissão de peças, outro tenant) — execução ${RUN}...`);
  const admTenant = await createTenant(`pecas-test-admin-${RUN}`, "Peças Admin Teste", "pc01", "ADMIN");
  // QUALIDADE não administra Peças — prova a autoridade separada (mesmo padrão de test-suprimentos.mjs).
  const noPermTenant = await createTenant(`pecas-test-admin-${RUN}`, "Peças SemPerm Teste", "pc02", "QUALIDADE", admTenant.company);
  const otherTenant = await createTenant(`pecas-test-other-${RUN}`, "Peças Outro Teste", "pc03", "ADMIN");

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
      .eq("company_id", admTenant.company.id)
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

  console.log("\n29b. atualizar_caracteristica_peca() — editar sem apagar e recriar");
  {
    // A função existia desde 20261010000600 e nunca tinha sido coberta:
    // a tela só oferecia "Remover", então ninguém a exercitava. Coberta
    // junto da tela de edição (Bloco A da auditoria de 27/09/2026).
    const { error: semPermErr } = await noPermTenant.client.rpc("atualizar_caracteristica_peca", {
      p_id: caractLarguraId, p_unidade: "cm", p_opcoes: null, p_obrigatoria: false,
    });
    check("sem pecas.manage não atualiza característica", !!semPermErr);

    const { error: outroErr } = await otherTenant.client.rpc("atualizar_caracteristica_peca", {
      p_id: caractLarguraId, p_unidade: "cm", p_opcoes: null, p_obrigatoria: false,
    });
    check("característica de outra empresa não é encontrada", !!outroErr);

    const { error: opcaoSemListaErr } = await admTenant.client.rpc("atualizar_caracteristica_peca", {
      p_id: caractVidroId, p_unidade: null, p_opcoes: null, p_obrigatoria: true,
    });
    check("atualizar tipo opcao sem lista é rejeitado", !!opcaoSemListaErr);

    const { error: numeroComListaErr } = await admTenant.client.rpc("atualizar_caracteristica_peca", {
      p_id: caractLarguraId, p_unidade: "mm", p_opcoes: ["x"], p_obrigatoria: true,
    });
    check("atualizar tipo numero com lista é rejeitado", !!numeroComListaErr);

    const { error: okErr } = await admTenant.client.rpc("atualizar_caracteristica_peca", {
      p_id: caractLarguraId, p_unidade: "cm", p_opcoes: null, p_obrigatoria: false,
    });
    check("atualização válida executa sem erro", !okErr);
    const { data: depois } = await admin
      .from("peca_caracteristicas").select("nome, tipo, unidade, obrigatoria").eq("id", caractLarguraId).maybeSingle();
    check("unidade e obrigatoriedade foram gravadas", depois?.unidade === "cm" && depois?.obrigatoria === false);
    check("nome e tipo permanecem imutáveis", depois?.nome === "largura" && depois?.tipo === "numero");

    // Restaura o estado original: as seções seguintes deste arquivo
    // dependem de "largura" em mm e obrigatória.
    await admTenant.client.rpc("atualizar_caracteristica_peca", {
      p_id: caractLarguraId, p_unidade: "mm", p_opcoes: null, p_obrigatoria: true,
    });
    const { data: restaurada } = await admin
      .from("peca_caracteristicas").select("unidade, obrigatoria").eq("id", caractLarguraId).maybeSingle();
    check("estado original restaurado para as seções seguintes", restaurada?.unidade === "mm" && restaurada?.obrigatoria === true);
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
      .eq("company_id", admTenant.company.id)
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
      .eq("company_id", admTenant.company.id)
      .in("action", ["pecas.regra_criada", "pecas.regra_desativada"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("pecas.regra_criada registrado", actions.has("pecas.regra_criada"));
    check("pecas.regra_desativada registrado", actions.has("pecas.regra_desativada"));
  }

  // =========================================================================
  // Fase H do plano de 23/09/2026 — BOM sugerida → definitiva. Fecha o
  // ciclo: gera a sugestão (composição base + regras, achatada pela
  // hierarquia), Engenharia ajusta manualmente, aprova como definitiva —
  // e a partir daí Suprimentos (Fase C) usa a BOM definitiva em vez da
  // expansão ao vivo.
  // =========================================================================

  console.log("\n52. Massa de dados — peça A (contém peça B como subconjunto) + regra de reforço");
  const { data: itemPecaHId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "JAN-PC-H", p_descricao: "Janela H", p_tipo: "produto_acabado",
    p_classificacao: "esquadria", p_unidade_principal: "UN", p_situacao: "ativo",
  });
  const { data: itemFolhaHId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "FLH-PC-H", p_descricao: "Folha H", p_tipo: "componente",
    p_classificacao: "folha", p_unidade_principal: "UN", p_situacao: "ativo",
  });
  const { data: itemPerfilHId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "PRF-PC-H", p_descricao: "Perfil H", p_tipo: "materia_prima",
    p_classificacao: "perfil", p_unidade_principal: "M", p_situacao: "ativo",
  });
  const { data: itemReforcoHId } = await admTenant.client.rpc("upsert_item", {
    p_id: null, p_codigo: "REF-PC-H", p_descricao: "Reforço H", p_tipo: "materia_prima",
    p_classificacao: "perfil", p_unidade_principal: "M", p_situacao: "ativo",
  });
  const { data: pecaAHId } = await admTenant.client.rpc("criar_peca", { p_item_id: itemPecaHId, p_descricao_tecnica: null });
  const { data: pecaBHId } = await admTenant.client.rpc("criar_peca", { p_item_id: itemFolhaHId, p_descricao_tecnica: null });
  await admTenant.client.rpc("adicionar_material_peca", { p_peca_id: pecaAHId, p_material_item_id: itemFolhaHId, p_quantidade_por_unidade: 2, p_observacao: null });
  await admTenant.client.rpc("adicionar_material_peca", { p_peca_id: pecaBHId, p_material_item_id: itemPerfilHId, p_quantidade_por_unidade: 3, p_observacao: null });
  const { data: caractLarguraHId } = await admTenant.client.rpc("definir_caracteristica_peca", {
    p_peca_id: pecaAHId, p_nome: "largura", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: true,
  });
  const { data: regraReforcoHId } = await admTenant.client.rpc("criar_regra_peca", {
    p_peca_id: pecaAHId, p_caracteristica_id: caractLarguraHId, p_operador: ">", p_valor_comparacao_numero: 1500, p_valor_comparacao_texto: null,
    p_acao: "adicionar_material", p_acao_material_item_id: itemReforcoHId, p_acao_quantidade: 1, p_motivo: null, p_substitui_regra_id: null,
  });
  check("regra de reforço criada", !!regraReforcoHId);

  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "orcamento", p_prefixo: "ORCPCH-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  await admTenant.client.rpc("upsert_numbering_sequence", {
    p_document_type: "pedido", p_prefixo: "PEDPCH-", p_sufixo: "", p_digitos: 4,
    p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca",
  });
  const { data: clienteHId } = await admTenant.client.rpc("upsert_pessoa", {
    p_id: null, p_tipo_documento: "CPF", p_documento: "10101010101", p_nome: "Cliente BOM Definitiva",
    p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
    p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
  });
  await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: clienteHId, p_papel: "CLIENTE", p_ativo: true });
  const { data: orcamentoHId } = await admTenant.client.rpc("upsert_orcamento", {
    p_id: null, p_pessoa_id: clienteHId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
  });
  await admTenant.client.rpc("upsert_orcamento_item", {
    p_id: null, p_orcamento_id: orcamentoHId, p_item_id: itemPecaHId, p_quantidade: 5, p_preco_unitario: 1000,
  });
  await admTenant.client.rpc("decidir_orcamento", { p_id: orcamentoHId, p_decisao: "aprovado" });
  const { data: pedidoHId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcamentoHId });
  const { data: pedidoItemH } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoHId).single();
  const pedidoItemHId = pedidoItemH.id;
  await admTenant.client.rpc("definir_valor_caracteristica_pedido_item", {
    p_pedido_item_id: pedidoItemHId, p_peca_caracteristica_id: caractLarguraHId, p_valor_numero: 1800, p_valor_texto: null,
  });

  console.log("\n53. gerar_bom_sugerida_pedido_item() gera BOM achatada (só folha) com regra aplicada");
  const { data: bomHId } = await admTenant.client.rpc("gerar_bom_sugerida_pedido_item", { p_pedido_item_id: pedidoItemHId });
  check("BOM sugerida criada", !!bomHId);
  {
    const { data } = await admTenant.client.rpc("listar_bom_pedido_item", { p_pedido_item_id: pedidoItemHId });
    const perfil = data?.find((d) => d.material_codigo === "PRF-PC-H");
    const reforco = data?.find((d) => d.material_codigo === "REF-PC-H");
    check("perfil achatado da hierarquia (2 folhas x 3 perfis = 6), origem base", perfil?.origem === "base" && Number(perfil?.quantidade_por_unidade) === 6);
    check("reforço adicionado pela regra, origem regra", reforco?.origem === "regra" && Number(reforco?.quantidade_por_unidade) === 1);
    check("folha (subconjunto) não aparece na BOM achatada", !data?.some((d) => d.material_codigo === "FLH-PC-H"));
  }

  console.log("\n54. Regerar antes de aprovar substitui as linhas (não duplica)");
  {
    await admTenant.client.rpc("gerar_bom_sugerida_pedido_item", { p_pedido_item_id: pedidoItemHId });
    const { data } = await admin.from("pedido_item_bom_itens").select("id").eq("pedido_item_bom_id", bomHId);
    check("continua só 2 linhas após regenerar", (data ?? []).length === 2);
  }

  console.log("\n55. ajustar_item_bom_pedido_item() sobrescreve quantidade, origem vira manual");
  {
    const { error } = await admTenant.client.rpc("ajustar_item_bom_pedido_item", {
      p_pedido_item_bom_id: bomHId, p_material_item_id: itemReforcoHId, p_quantidade_por_unidade: 2.5,
    });
    check("ajuste manual aceito", !error);
    const { data } = await admin.from("pedido_item_bom_itens").select("quantidade_por_unidade, origem").eq("pedido_item_bom_id", bomHId).eq("material_item_id", itemReforcoHId).single();
    check("quantidade sobrescrita e origem vira manual", Number(data?.quantidade_por_unidade) === 2.5 && data?.origem === "manual");
  }

  console.log("\n56. ajustar_item_bom_pedido_item() rejeita subconjunto (peça) como material folha");
  {
    const { error } = await admTenant.client.rpc("ajustar_item_bom_pedido_item", {
      p_pedido_item_bom_id: bomHId, p_material_item_id: itemFolhaHId, p_quantidade_por_unidade: 1,
    });
    check("subconjunto como linha de BOM é rejeitado", !!error);
  }

  console.log("\n57. aprovar_bom_definitiva() rejeita BOM vazia");
  {
    const { data: itemVazioHId } = await admTenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: "JAN-PC-H-VAZIA", p_descricao: "Janela vazia H", p_tipo: "produto_acabado",
      p_classificacao: "esquadria", p_unidade_principal: "UN", p_situacao: "ativo",
    });
    await admTenant.client.rpc("criar_peca", { p_item_id: itemVazioHId, p_descricao_tecnica: null });
    const { data: orcVazioId } = await admTenant.client.rpc("upsert_orcamento", {
      p_id: null, p_pessoa_id: clienteHId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null,
    });
    await admTenant.client.rpc("upsert_orcamento_item", { p_id: null, p_orcamento_id: orcVazioId, p_item_id: itemVazioHId, p_quantidade: 1, p_preco_unitario: 100 });
    await admTenant.client.rpc("decidir_orcamento", { p_id: orcVazioId, p_decisao: "aprovado" });
    const { data: pedidoVazioId } = await admTenant.client.rpc("converter_orcamento_em_pedido", { p_orcamento_id: orcVazioId });
    const { data: pedidoItemVazio } = await admin.from("pedido_itens").select("id").eq("pedido_id", pedidoVazioId).single();
    const { data: bomVazioId } = await admTenant.client.rpc("gerar_bom_sugerida_pedido_item", { p_pedido_item_id: pedidoItemVazio.id });

    const { error } = await admTenant.client.rpc("aprovar_bom_definitiva", { p_pedido_item_bom_id: bomVazioId });
    check("BOM sem nenhum material não pode ser aprovada", !!error);
  }

  console.log("\n58. aprovar_bom_definitiva() sucesso, trava a BOM");
  {
    const { error } = await admTenant.client.rpc("aprovar_bom_definitiva", { p_pedido_item_bom_id: bomHId });
    check("ADMIN aprova BOM definitiva", !error);
    const { data } = await admin.from("pedido_item_bom").select("status, aprovado_por, aprovado_em").eq("id", bomHId).single();
    check("status vira definitiva com aprovador e data", data?.status === "definitiva" && !!data?.aprovado_por && !!data?.aprovado_em);

    const { error: gerarErr } = await admTenant.client.rpc("gerar_bom_sugerida_pedido_item", { p_pedido_item_id: pedidoItemHId });
    check("gerar de novo após definitiva é rejeitado", !!gerarErr);
    const { error: ajustarErr } = await admTenant.client.rpc("ajustar_item_bom_pedido_item", {
      p_pedido_item_bom_id: bomHId, p_material_item_id: itemPerfilHId, p_quantidade_por_unidade: 99,
    });
    check("ajustar após definitiva é rejeitado", !!ajustarErr);
    const { error: aprovarDeNovoErr } = await admTenant.client.rpc("aprovar_bom_definitiva", { p_pedido_item_bom_id: bomHId });
    check("aprovar de novo é rejeitado", !!aprovarDeNovoErr);
  }

  console.log("\n59. gerar_necessidades_de_pedido() usa a BOM definitiva (ajustada), não a expansão ao vivo");
  {
    await admTenant.client.rpc("iniciar_conferencia_pedido", { p_id: pedidoHId });
    await admTenant.client.rpc("liberar_pedido", { p_id: pedidoHId });

    // Definitiva: perfil=6 (base, intocado), reforço=2.5 (ajustado manualmente) — x5 (quantidade do pedido_item).
    // Expansão ao vivo daria reforço=1 (da regra), não 2.5 — prova que usou a definitiva.
    const { data } = await admTenant.client.rpc("gerar_necessidades_de_pedido", { p_pedido_id: pedidoHId });
    const perfil = data?.find((d) => d.item_codigo === "PRF-PC-H");
    const reforco = data?.find((d) => d.item_codigo === "REF-PC-H");
    check("necessidade de perfil usa a BOM definitiva (5x6=30)", Number(perfil?.quantidade_gerada) === 30);
    check("necessidade de reforço usa o ajuste manual da definitiva (5x2.5=12.5), não a regra (5x1=5)", Number(reforco?.quantidade_gerada) === 12.5);
  }

  console.log("\n60. gerar_bom_sugerida_pedido_item()/aprovar_bom_definitiva() exigem engenharia.manage");
  {
    const { error: err1 } = await noPermTenant.client.rpc("gerar_bom_sugerida_pedido_item", { p_pedido_item_id: pedidoItemHId });
    check("sem engenharia.manage não gera BOM sugerida", !!err1);
  }

  console.log("\n61. Isolamento entre tenants (Fase H)");
  {
    const { error: err1 } = await otherTenant.client.rpc("gerar_bom_sugerida_pedido_item", { p_pedido_item_id: pedidoItemHId });
    check("tenant B não gera BOM em pedido do tenant A", !!err1);
    const { error: err2 } = await otherTenant.client.rpc("aprovar_bom_definitiva", { p_pedido_item_bom_id: bomHId });
    check("tenant B não aprova BOM do tenant A", !!err2);
  }

  console.log("\n62. Auditoria da Fase H");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .eq("company_id", admTenant.company.id)
      .in("action", ["engenharia.bom_sugerida_gerada", "engenharia.bom_item_ajustado", "engenharia.bom_definitiva_aprovada"]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("engenharia.bom_sugerida_gerada registrado", actions.has("engenharia.bom_sugerida_gerada"));
    check("engenharia.bom_item_ajustado registrado", actions.has("engenharia.bom_item_ajustado"));
    check("engenharia.bom_definitiva_aprovada registrado", actions.has("engenharia.bom_definitiva_aprovada"));
  }

  console.log("\n63. ADR-012 Fase 1 — precificação dimensional (calcular_custo_orcamento_item)");
  {
    // Cadeia mínima de Compras (solicitação->cotação->pedido de compra)
    // só pra popular pedido_compra_itens.custo_unitario — não testa
    // Compras em si (já coberto em test-compras.mjs), só cria o dado que
    // calcular_custo_orcamento_item() precisa ler.
    async function registrarCustoCompra(companyId, solicitanteId, itemId, custoUnitario, fornecedorId) {
      const { data: sc } = await admin.from("solicitacoes_compra").insert({ company_id: companyId, numero: `SC-ADR012-${itemId.slice(0, 8)}`, solicitante_id: solicitanteId, status: "aberta" }).select().single();
      const { data: sci } = await admin.from("solicitacao_compra_itens").insert({ company_id: companyId, solicitacao_compra_id: sc.id, item_id: itemId, quantidade: 100 }).select().single();
      const { data: cot } = await admin.from("cotacoes").insert({ company_id: companyId, numero: `COT-ADR012-${itemId.slice(0, 8)}`, solicitacao_compra_id: sc.id, status: "selecionada" }).select().single();
      const { data: ci } = await admin.from("cotacao_itens").insert({ company_id: companyId, cotacao_id: cot.id, solicitacao_compra_item_id: sci.id }).select().single();
      const { data: pc } = await admin.from("pedidos_compra").insert({ company_id: companyId, numero: `PC-ADR012-${itemId.slice(0, 8)}`, cotacao_id: cot.id, pessoa_id: fornecedorId, status: "confirmado" }).select().single();
      await admin.from("pedido_compra_itens").insert({ company_id: companyId, pedido_compra_id: pc.id, cotacao_item_id: ci.id, item_id: itemId, quantidade: 100, preco_unitario: custoUnitario, custo_unitario: custoUnitario });
    }

    const { data: fornecedorId } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: "CNPJ", p_documento: "33344455000199", p_nome: "Fornecedor ADR012 Teste",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: fornecedorId, p_papel: "FORNECEDOR", p_ativo: true });
    const { data: clienteId } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: "CPF", p_documento: "11122233396", p_nome: "Cliente ADR012 Teste",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: clienteId, p_papel: "CLIENTE", p_ativo: true });
    await admTenant.client.rpc("upsert_numbering_sequence", { p_document_type: "orcamento", p_prefixo: "ORCADR012-", p_sufixo: "", p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca" });

    const { data: perfilId } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "PERFIL-ADR012", p_descricao: "Perfil alumínio", p_tipo: "materia_prima", p_classificacao: "perfil", p_unidade_principal: "M", p_situacao: "ativo" });
    const { data: vidroId } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "VIDRO-ADR012", p_descricao: "Vidro temperado", p_tipo: "materia_prima", p_classificacao: "vidro", p_unidade_principal: "M2", p_situacao: "ativo" });
    const { data: roldanaId } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "ROLD-ADR012", p_descricao: "Roldana", p_tipo: "materia_prima", p_classificacao: "acessorio", p_unidade_principal: "UN", p_situacao: "ativo" });
    const { data: fechoId } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "FECHO-ADR012", p_descricao: "Fecho sem custo", p_tipo: "materia_prima", p_classificacao: "acessorio", p_unidade_principal: "UN", p_situacao: "ativo" });

    await registrarCustoCompra(admTenant.company.id, admTenant.userId, perfilId, 25.5, fornecedorId);
    await registrarCustoCompra(admTenant.company.id, admTenant.userId, vidroId, 180.0, fornecedorId);
    await registrarCustoCompra(admTenant.company.id, admTenant.userId, roldanaId, 12.0, fornecedorId);
    // fechoId propositalmente sem custo cadastrado.

    const { data: boxItemId } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "BOX-ADR012", p_descricao: "Box de correr", p_tipo: "produto_acabado", p_classificacao: "box", p_unidade_principal: "UN", p_situacao: "ativo" });
    const { data: pecaBoxId } = await admTenant.client.rpc("criar_peca", { p_item_id: boxItemId, p_descricao_tecnica: "Box 2 folhas" });
    const { data: caractLargura } = await admTenant.client.rpc("definir_caracteristica_peca", { p_peca_id: pecaBoxId, p_nome: "largura", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: true });
    const { data: caractAltura } = await admTenant.client.rpc("definir_caracteristica_peca", { p_peca_id: pecaBoxId, p_nome: "altura", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: true });

    const { error: eTipoInvalido } = await admTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: caractLargura, p_papel: "diagonal" });
    check("papel dimensional inválido é rejeitado", !!eTipoInvalido);
    const { error: eSemPerm } = await noPermTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: caractLargura, p_papel: "largura" });
    check("sem pecas.manage não define papel dimensional", !!eSemPerm);
    const { error: ePapelL } = await admTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: caractLargura, p_papel: "largura" });
    const { error: ePapelA } = await admTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: caractAltura, p_papel: "altura" });
    check("ADMIN define largura e altura como papel dimensional", !ePapelL && !ePapelA);

    // FIX (achado em teste manual, 27/09/2026): reatribuir um papel já
    // usado por outra característica da mesma peça não deve dar erro de
    // constraint — deve desmarcar a anterior automaticamente.
    const { data: caractLarguraDuplicada } = await admTenant.client.rpc("definir_caracteristica_peca", { p_peca_id: pecaBoxId, p_nome: "largura2", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: false });
    const { error: eReatribuir } = await admTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: caractLarguraDuplicada, p_papel: "largura" });
    check("reatribuir 'largura' pra outra característica não dá erro (desmarca a anterior)", !eReatribuir);
    const { data: listaAposReatribuir } = await admTenant.client.rpc("listar_caracteristicas_peca", { p_peca_id: pecaBoxId });
    const antiga = listaAposReatribuir?.find((c) => c.id === caractLargura);
    const nova = listaAposReatribuir?.find((c) => c.id === caractLarguraDuplicada);
    check("característica antiga perde o papel dimensional, a nova assume", antiga?.papel_dimensional === null && nova?.papel_dimensional === "largura");
    // Devolve o papel pra característica original, pro resto do teste (largura=2000/2600) continuar funcionando.
    await admTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: caractLargura, p_papel: "largura" });
    await admTenant.client.rpc("remover_caracteristica_peca", { p_id: caractLarguraDuplicada });

    const { data: compPerfil } = await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaBoxId, material_item_id: perfilId, quantidade_por_unidade: 1 }).select().single();
    const { data: compVidro } = await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaBoxId, material_item_id: vidroId, quantidade_por_unidade: 1 }).select().single();
    const { data: compRoldana } = await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaBoxId, material_item_id: roldanaId, quantidade_por_unidade: 2 }).select().single();
    await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaBoxId, material_item_id: fechoId, quantidade_por_unidade: 4 });

    const { error: eFixoComPerda } = await admTenant.client.rpc("definir_tipo_calculo_composicao", { p_composicao_id: compRoldana.id, p_tipo_calculo: "fixo", p_percentual_perda: 5 });
    check("tipo_calculo fixo com percentual_perda != 0 é rejeitado", !!eFixoComPerda);
    const { error: eTipoPerfil } = await admTenant.client.rpc("definir_tipo_calculo_composicao", { p_composicao_id: compPerfil.id, p_tipo_calculo: "linear", p_percentual_perda: 10 });
    const { error: eTipoVidro } = await admTenant.client.rpc("definir_tipo_calculo_composicao", { p_composicao_id: compVidro.id, p_tipo_calculo: "area", p_percentual_perda: 5 });
    check("ADMIN define perfil como linear e vidro como área", !eTipoPerfil && !eTipoVidro);

    await admTenant.client.rpc("criar_regra_peca", {
      p_peca_id: pecaBoxId, p_caracteristica_id: caractLargura, p_operador: ">=", p_valor_comparacao_numero: 2500, p_valor_comparacao_texto: null,
      p_acao: "ajustar_quantidade", p_acao_material_item_id: roldanaId, p_acao_quantidade: 3, p_motivo: "porta larga precisa de mais roldanas",
    });

    const { data: orcamentoId } = await admTenant.client.rpc("upsert_orcamento", { p_id: null, p_pessoa_id: clienteId, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null });
    await admTenant.client.rpc("upsert_orcamento_item", { p_id: null, p_orcamento_id: orcamentoId, p_item_id: boxItemId, p_quantidade: 1, p_preco_unitario: 100 });
    const { data: orcItem } = await admin.from("orcamento_itens").select("id").eq("orcamento_id", orcamentoId).single();

    await admTenant.client.rpc("definir_valor_caracteristica_orcamento_item", { p_orcamento_item_id: orcItem.id, p_peca_caracteristica_id: caractLargura, p_valor_numero: 2000, p_valor_texto: null });
    await admTenant.client.rpc("definir_valor_caracteristica_orcamento_item", { p_orcamento_item_id: orcItem.id, p_peca_caracteristica_id: caractAltura, p_valor_numero: 1500, p_valor_texto: null });

    const { data: calc1, error: eCalc1 } = await admTenant.client.rpc("calcular_custo_orcamento_item", { p_orcamento_item_id: orcItem.id });
    check("cálculo sem erro (largura 2000)", !eCalc1 && calc1?.aplica_configurador === true);
    // perímetro = 2*(2000+1500)/1000 = 7m * 1.10 = 7.7m * 25.50 = 196.35
    // área = (2000*1500)/1e6 = 3m² * 1.05 = 3.15m² * 180.00 = 567.00
    // roldana = 2 * 12.00 = 24.00 (regra não ativa, largura < 2500)
    // total = 787.35
    check("custo_total bate com o cálculo manual (787.35, largura 2000)", calc1?.custo_total === 787.35);
    check("fecho sem custo aparece em materiais_sem_custo, não conta no total", calc1?.materiais_sem_custo?.some((m) => m.codigo === "FECHO-ADR012") && calc1?.materiais_sem_custo?.length === 1);

    const { error: eSemPermCalc } = await noPermTenant.client.rpc("calcular_custo_orcamento_item", { p_orcamento_item_id: orcItem.id });
    check("sem orcamentos.view não calcula custo", !!eSemPermCalc);

    await admTenant.client.rpc("definir_valor_caracteristica_orcamento_item", { p_orcamento_item_id: orcItem.id, p_peca_caracteristica_id: caractLargura, p_valor_numero: 2600, p_valor_texto: null });
    const { data: calc2 } = await admTenant.client.rpc("calcular_custo_orcamento_item", { p_orcamento_item_id: orcItem.id });
    const roldanaComp = calc2?.componentes?.find((c) => c.codigo === "ROLD-ADR012");
    check("regra de quantidade condicional dispara com largura 2600 (roldana vira 3)", roldanaComp?.quantidade === 3);
    check("perfil/vidro recalculam com a nova largura (custo_total muda)", calc2?.custo_total !== calc1?.custo_total);

    const { data: itemSemPecaId } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "SIMPLES-ADR012", p_descricao: "Item simples, não é peça", p_tipo: "produto_acabado", p_classificacao: null, p_unidade_principal: "UN", p_situacao: "ativo" });
    await admTenant.client.rpc("upsert_orcamento_item", { p_id: null, p_orcamento_id: orcamentoId, p_item_id: itemSemPecaId, p_quantidade: 1, p_preco_unitario: 50 });
    const { data: orcItemSimples } = await admin.from("orcamento_itens").select("id").eq("orcamento_id", orcamentoId).eq("item_id", itemSemPecaId).single();
    const { data: calcSimples } = await admTenant.client.rpc("calcular_custo_orcamento_item", { p_orcamento_item_id: orcItemSimples.id });
    check("item que não é peça configurável retorna aplica_configurador=false, sem erro", calcSimples?.aplica_configurador === false);
  }

  console.log("\n64. ADR-012 Fase 2 — combinação de barras de menor custo (definir_comprimento_barra_composicao)");
  {
    async function registrarCustoCompra(companyId, solicitanteId, itemId, custoUnitario, fornecedorId) {
      const { data: sc } = await admin.from("solicitacoes_compra").insert({ company_id: companyId, numero: `SC-F2-${itemId.slice(0, 8)}`, solicitante_id: solicitanteId, status: "aberta" }).select().single();
      const { data: sci } = await admin.from("solicitacao_compra_itens").insert({ company_id: companyId, solicitacao_compra_id: sc.id, item_id: itemId, quantidade: 50 }).select().single();
      const { data: cot } = await admin.from("cotacoes").insert({ company_id: companyId, numero: `COT-F2-${itemId.slice(0, 8)}`, solicitacao_compra_id: sc.id, status: "selecionada" }).select().single();
      const { data: ci } = await admin.from("cotacao_itens").insert({ company_id: companyId, cotacao_id: cot.id, solicitacao_compra_item_id: sci.id }).select().single();
      const { data: pc } = await admin.from("pedidos_compra").insert({ company_id: companyId, numero: `PC-F2-${itemId.slice(0, 8)}`, cotacao_id: cot.id, pessoa_id: fornecedorId, status: "confirmado" }).select().single();
      await admin.from("pedido_compra_itens").insert({ company_id: companyId, pedido_compra_id: pc.id, cotacao_item_id: ci.id, item_id: itemId, quantidade: 50, preco_unitario: custoUnitario, custo_unitario: custoUnitario });
    }

    const { data: fornecedorF2Id } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: "CNPJ", p_documento: "99988877000166", p_nome: "Fornecedor Fase2 Teste",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: fornecedorF2Id, p_papel: "FORNECEDOR", p_ativo: true });
    const { data: clienteF2Id } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: "CPF", p_documento: "44455566620", p_nome: "Cliente Fase2 Teste",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    await admTenant.client.rpc("set_pessoa_papel", { p_pessoa_id: clienteF2Id, p_papel: "CLIENTE", p_ativo: true });
    await admTenant.client.rpc("upsert_numbering_sequence", { p_document_type: "orcamento", p_prefixo: "ORCF2-", p_sufixo: "", p_digitos: 4, p_incluir_ano: false, p_incluir_mes: false, p_reinicio: "nunca" });

    const { data: janelaItemId } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "JAN-F2", p_descricao: "Janela Fase 2", p_tipo: "produto_acabado", p_classificacao: "janela", p_unidade_principal: "UN", p_situacao: "ativo" });
    const { data: pecaJanelaId } = await admTenant.client.rpc("criar_peca", { p_item_id: janelaItemId, p_descricao_tecnica: "Janela de correr" });
    const { data: caractLarguraF2 } = await admTenant.client.rpc("definir_caracteristica_peca", { p_peca_id: pecaJanelaId, p_nome: "largura", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: true });
    const { data: caractAlturaF2 } = await admTenant.client.rpc("definir_caracteristica_peca", { p_peca_id: pecaJanelaId, p_nome: "altura", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: true });
    await admTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: caractLarguraF2, p_papel: "largura" });
    await admTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: caractAlturaF2, p_papel: "altura" });

    const { data: perfilGenericoId } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "PERFIL-GEN-F2", p_descricao: "Perfil genérico (sem barra)", p_tipo: "materia_prima", p_classificacao: "perfil", p_unidade_principal: "M", p_situacao: "ativo" });
    const { data: compPerfilF2 } = await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaJanelaId, material_item_id: perfilGenericoId, quantidade_por_unidade: 1 }).select().single();
    await admTenant.client.rpc("definir_tipo_calculo_composicao", { p_composicao_id: compPerfilF2.id, p_tipo_calculo: "linear", p_percentual_perda: 0 });
    await registrarCustoCompra(admTenant.company.id, admTenant.userId, perfilGenericoId, 25.0, fornecedorF2Id);

    const { data: orcamentoF2Id } = await admTenant.client.rpc("upsert_orcamento", { p_id: null, p_pessoa_id: clienteF2Id, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null });
    await admTenant.client.rpc("upsert_orcamento_item", { p_id: null, p_orcamento_id: orcamentoF2Id, p_item_id: janelaItemId, p_quantidade: 1, p_preco_unitario: 100 });
    const { data: orcItemF2 } = await admin.from("orcamento_itens").select("id").eq("orcamento_id", orcamentoF2Id).single();
    // perímetro = 2*(2000+1500)/1000 = 7m (sem perda nesta peça)
    await admTenant.client.rpc("definir_valor_caracteristica_orcamento_item", { p_orcamento_item_id: orcItemF2.id, p_peca_caracteristica_id: caractLarguraF2, p_valor_numero: 2000, p_valor_texto: null });
    await admTenant.client.rpc("definir_valor_caracteristica_orcamento_item", { p_orcamento_item_id: orcItemF2.id, p_peca_caracteristica_id: caractAlturaF2, p_valor_numero: 1500, p_valor_texto: null });

    const { data: calcSemBarra } = await admTenant.client.rpc("calcular_custo_orcamento_item", { p_orcamento_item_id: orcItemF2.id });
    check("sem comprimento de barra cadastrado, comporta-se como Fase 1 (7m x 25.00 = 175.00)", calcSemBarra?.custo_total === 175);

    const { error: eTipoErrado } = await admTenant.client.rpc("definir_comprimento_barra_composicao", { p_peca_composicao_id: compPerfilF2.id, p_item_id: perfilGenericoId, p_comprimento_metros: -1 });
    check("comprimento de barra <= 0 é rejeitado", !!eTipoErrado);

    const { data: vidroDummyId } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "VIDRO-DUMMY-F2", p_descricao: "Vidro dummy (só pra testar rejeição)", p_tipo: "materia_prima", p_classificacao: "vidro", p_unidade_principal: "M2", p_situacao: "ativo" });
    const { data: compVidroF2 } = await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaJanelaId, material_item_id: vidroDummyId, quantidade_por_unidade: 1, tipo_calculo: "area" }).select().single();
    const { error: eNaoLinear } = await admTenant.client.rpc("definir_comprimento_barra_composicao", { p_peca_composicao_id: compVidroF2.id, p_item_id: perfilGenericoId, p_comprimento_metros: 3 });
    check("comprimento de barra rejeitado numa linha que não é 'linear'", !!eNaoLinear);

    const { data: item3mF2 } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "PERFIL-3M-F2", p_descricao: "Perfil 3m", p_tipo: "materia_prima", p_classificacao: "perfil", p_unidade_principal: "UN", p_situacao: "ativo" });
    const { data: item6mF2 } = await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: "PERFIL-6M-F2", p_descricao: "Perfil 6m", p_tipo: "materia_prima", p_classificacao: "perfil", p_unidade_principal: "UN", p_situacao: "ativo" });
    await registrarCustoCompra(admTenant.company.id, admTenant.userId, item3mF2, 80.0, fornecedorF2Id);
    await registrarCustoCompra(admTenant.company.id, admTenant.userId, item6mF2, 150.0, fornecedorF2Id);

    const { error: eSemPermBarra } = await noPermTenant.client.rpc("definir_comprimento_barra_composicao", { p_peca_composicao_id: compPerfilF2.id, p_item_id: item3mF2, p_comprimento_metros: 3 });
    check("sem pecas.manage não cadastra comprimento de barra", !!eSemPermBarra);

    const { error: e3m } = await admTenant.client.rpc("definir_comprimento_barra_composicao", { p_peca_composicao_id: compPerfilF2.id, p_item_id: item3mF2, p_comprimento_metros: 3 });
    const { error: e6m } = await admTenant.client.rpc("definir_comprimento_barra_composicao", { p_peca_composicao_id: compPerfilF2.id, p_item_id: item6mF2, p_comprimento_metros: 6 });
    check("ADMIN cadastra os dois comprimentos de barra", !e3m && !e6m);

    const { error: eDuplicado } = await admTenant.client.rpc("definir_comprimento_barra_composicao", { p_peca_composicao_id: compPerfilF2.id, p_item_id: item3mF2, p_comprimento_metros: 3 });
    check("mesmo item de barra duas vezes na mesma composição é rejeitado", !!eDuplicado);

    // necessidade = 7m; opções: 3m (R$80) e 6m (R$150).
    // Combinações possíveis: 1x6m+1x3m=9m/R$230; 3x3m=9m/R$240; 2x6m=12m/R$300.
    // Menor custo: 1x6m+1x3m = R$230.
    const { data: calcComBarra, error: eCalcBarra } = await admTenant.client.rpc("calcular_custo_orcamento_item", { p_orcamento_item_id: orcItemF2.id });
    check("cálculo com comprimentos de barra sem erro", !eCalcBarra);
    const perfilComponentes = (calcComBarra?.componentes ?? []).filter((c) => c.codigo === "PERFIL-3M-F2" || c.codigo === "PERFIL-6M-F2");
    const custoPerfilTotal = perfilComponentes.reduce((s, c) => s + c.subtotal, 0);
    check("escolhe a combinação de menor custo (1x6m + 1x3m = R$230,00), não 2x6m nem 3x3m", Math.abs(custoPerfilTotal - 230) < 0.01);
    check("usa exatamente 1 barra de cada comprimento", perfilComponentes.length === 2 && perfilComponentes.every((c) => c.quantidade === 1));

    const { data: compRow } = await admin.from("peca_composicao_comprimentos_barra").select("id").eq("peca_composicao_id", compPerfilF2.id).eq("item_id", item3mF2).single();
    const { error: eSemPermRemover } = await noPermTenant.client.rpc("remover_comprimento_barra_composicao", { p_id: compRow.id });
    check("sem pecas.manage não remove comprimento de barra", !!eSemPermRemover);
    const { error: eRemover } = await admTenant.client.rpc("remover_comprimento_barra_composicao", { p_id: compRow.id });
    check("ADMIN remove comprimento de barra de 3m", !eRemover);

    const { data: calcSoComBarra6m } = await admTenant.client.rpc("calcular_custo_orcamento_item", { p_orcamento_item_id: orcItemF2.id });
    const perfil6mSozinho = (calcSoComBarra6m?.componentes ?? []).find((c) => c.codigo === "PERFIL-6M-F2");
    check("com só o comprimento de 6m restante, usa 2 barras de 6m (12m cobre os 7m necessários)", perfil6mSozinho?.quantidade === 2 && Math.abs(perfil6mSozinho.subtotal - 300) < 0.01);
  }

  console.log("\n65. ADR-012 v1.1 — cálculo automático (calcular_preco_configurador, margem por empresa, gravação atômica)");
  {
    async function registrarCustoCompra(companyId, solicitanteId, itemId, custoUnitario, fornecedorId) {
      const { data: sc } = await admin.from("solicitacoes_compra").insert({ company_id: companyId, numero: `SC-V11-${itemId.slice(0, 8)}`, solicitante_id: solicitanteId, status: "aberta" }).select().single();
      const { data: sci } = await admin.from("solicitacao_compra_itens").insert({ company_id: companyId, solicitacao_compra_id: sc.id, item_id: itemId, quantidade: 100 }).select().single();
      const { data: cot } = await admin.from("cotacoes").insert({ company_id: companyId, numero: `COT-V11-${itemId.slice(0, 8)}`, solicitacao_compra_id: sc.id, status: "selecionada" }).select().single();
      const { data: ci } = await admin.from("cotacao_itens").insert({ company_id: companyId, cotacao_id: cot.id, solicitacao_compra_item_id: sci.id }).select().single();
      const { data: pc } = await admin.from("pedidos_compra").insert({ company_id: companyId, numero: `PC-V11-${itemId.slice(0, 8)}`, cotacao_id: cot.id, pessoa_id: fornecedorId, status: "confirmado" }).select().single();
      await admin.from("pedido_compra_itens").insert({ company_id: companyId, pedido_compra_id: pc.id, cotacao_item_id: ci.id, item_id: itemId, quantidade: 100, preco_unitario: custoUnitario, custo_unitario: custoUnitario });
    }
    const novoItem = async (tenant, codigo, descricao, tipo, classificacao, unidade) =>
      (await tenant.client.rpc("upsert_item", { p_id: null, p_codigo: codigo, p_descricao: descricao, p_tipo: tipo, p_classificacao: classificacao, p_unidade_principal: unidade, p_situacao: "ativo" })).data;

    // Reaproveita fornecedor e cliente já criados na seção 63 (mesmo tenant).
    const { data: fornecedorRow } = await admin.from("pessoas").select("id").eq("company_id", admTenant.company.id).eq("nome", "Fornecedor ADR012 Teste").single();
    const { data: clienteRow } = await admin.from("pessoas").select("id").eq("company_id", admTenant.company.id).eq("nome", "Cliente ADR012 Teste").single();

    const perfilId = await novoItem(admTenant, "PERFIL-V11", "Perfil v1.1", "materia_prima", "perfil", "M");
    const vidroId = await novoItem(admTenant, "VIDRO-V11", "Vidro v1.1", "materia_prima", "vidro", "M2");
    const acessId = await novoItem(admTenant, "ACESS-V11", "Acessório v1.1", "materia_prima", "acessorio", "UN");
    const fechoId = await novoItem(admTenant, "FECHO-V11", "Fecho sem custo v1.1", "materia_prima", "acessorio", "UN");
    const portaItemId = await novoItem(admTenant, "PORTA-V11", "Porta v1.1", "produto_acabado", "porta", "UN");
    const simplesItemId = await novoItem(admTenant, "SIMPLES-V11", "Item simples v1.1", "produto_acabado", null, "UN");
    await registrarCustoCompra(admTenant.company.id, admTenant.userId, perfilId, 25.5, fornecedorRow.id);
    await registrarCustoCompra(admTenant.company.id, admTenant.userId, vidroId, 180.0, fornecedorRow.id);
    await registrarCustoCompra(admTenant.company.id, admTenant.userId, acessId, 12.0, fornecedorRow.id);

    const { data: pecaId } = await admTenant.client.rpc("criar_peca", { p_item_id: portaItemId, p_descricao_tecnica: "Porta v1.1" });
    const { data: cLargura } = await admTenant.client.rpc("definir_caracteristica_peca", { p_peca_id: pecaId, p_nome: "largura", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: true });
    const { data: cAltura } = await admTenant.client.rpc("definir_caracteristica_peca", { p_peca_id: pecaId, p_nome: "altura", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: true });
    const { data: cVidro } = await admTenant.client.rpc("definir_caracteristica_peca", { p_peca_id: pecaId, p_nome: "vidro", p_tipo: "opcao", p_unidade: null, p_opcoes: ["temperado", "laminado"], p_obrigatoria: false });
    await admTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: cLargura, p_papel: "largura" });
    await admTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: cAltura, p_papel: "altura" });

    const { data: compPerfil } = await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaId, material_item_id: perfilId, quantidade_por_unidade: 1 }).select().single();
    const { data: compVidro } = await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaId, material_item_id: vidroId, quantidade_por_unidade: 1 }).select().single();
    await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaId, material_item_id: acessId, quantidade_por_unidade: 2 });
    await admTenant.client.rpc("definir_tipo_calculo_composicao", { p_composicao_id: compPerfil.id, p_tipo_calculo: "linear", p_percentual_perda: 10 });
    await admTenant.client.rpc("definir_tipo_calculo_composicao", { p_composicao_id: compVidro.id, p_tipo_calculo: "area", p_percentual_perda: 5 });

    // Mão de obra: 1 operação de 30 min num recurso de R$ 60/h = R$ 30,00.
    const { data: recursoMo } = await admin.from("recursos_produtivos").insert({ company_id: admTenant.company.id, codigo: "SERRA-V11", nome: "Serra v1.1", tipo: "maquina", custo_hora: 60 }).select().single();
    const { data: roteiroMo } = await admin.from("roteiros_produtivos").insert({ company_id: admTenant.company.id, item_id: portaItemId, nome: "Roteiro v1.1", ativo: true }).select().single();
    await admin.from("roteiro_operacoes").insert({ company_id: admTenant.company.id, roteiro_id: roteiroMo.id, sequencia: 1, descricao: "Corte", tempo_previsto_minutos: 30, recurso_produtivo_id: recursoMo.id });

    const valoresOk = { [cLargura]: { n: 2000 }, [cAltura]: { n: 1500 } };
    // perfil 7m*1,10*25,50 = 196,35; vidro 3m²*1,05*180 = 567,00; acessório 2*12 = 24,00 => material 787,35.

    // --- listar_caracteristicas_configurador
    const { data: listaCfg, error: eListaCfg } = await admTenant.client.rpc("listar_caracteristicas_configurador", { p_item_id: portaItemId });
    check("listar_caracteristicas_configurador devolve as 3 características, com papel dimensional e opções", !eListaCfg && listaCfg?.length === 3
      && listaCfg.find((c) => c.nome === "largura")?.papel_dimensional === "largura"
      && listaCfg.find((c) => c.nome === "vidro")?.opcoes?.length === 2);
    const { error: eListaSemPerm } = await noPermTenant.client.rpc("listar_caracteristicas_configurador", { p_item_id: portaItemId });
    check("sem orcamentos.view não lista características", !!eListaSemPerm);
    const { error: eListaOutro } = await otherTenant.client.rpc("listar_caracteristicas_configurador", { p_item_id: portaItemId });
    check("outro tenant não lista características de item alheio", !!eListaOutro);

    // --- pré-cálculo: gates e validação de entrada
    const { error: ePrevSemPerm } = await noPermTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: valoresOk });
    check("sem orcamentos.view não calcula preço", !!ePrevSemPerm);
    const { error: ePrevOutro } = await otherTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: valoresOk });
    check("outro tenant não calcula com item alheio", !!ePrevOutro);

    const itemOutroId = await novoItem(otherTenant, "PORTA-V11-B", "Porta de outra empresa", "produto_acabado", "porta", "UN");
    const { data: pecaOutroId } = await otherTenant.client.rpc("criar_peca", { p_item_id: itemOutroId, p_descricao_tecnica: null });
    const { data: cOutro } = await otherTenant.client.rpc("definir_caracteristica_peca", { p_peca_id: pecaOutroId, p_nome: "largura", p_tipo: "numero", p_unidade: "mm", p_opcoes: null, p_obrigatoria: true });
    const { error: eInjecao } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: { [cOutro]: { n: 2000 } } });
    check("característica de outra empresa injetada no payload é rejeitada", !!eInjecao);
    const { error: eInjecaoInversa } = await otherTenant.client.rpc("calcular_preco_configurador", { p_item_id: itemOutroId, p_valores: { [cLargura]: { n: 2000 } } });
    check("característica de outra peça/empresa (direção inversa) é rejeitada", !!eInjecaoInversa);
    const { error: eChaveInvalida } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: { "nao-e-uuid": { n: 1 } } });
    check("chave que não é UUID é rejeitada", !!eChaveInvalida);
    const { error: eNumeroTexto } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: { [cLargura]: { n: "2000" } } });
    check("número enviado como texto é rejeitado", !!eNumeroTexto);
    const { error: eDimZero } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: { [cLargura]: { n: 0 } } });
    check("dimensão <= 0 é rejeitada", !!eDimZero);
    const { error: eOpcaoInvalida } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: { ...valoresOk, [cVidro]: { t: "comum" } } });
    check("opção fora da lista permitida é rejeitada", !!eOpcaoInvalida);
    const { error: eNaoObjeto } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: [1, 2] });
    check("p_valores que não é objeto é rejeitado", !!eNaoObjeto);
    const { error: eCampoAusente } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: { [cLargura]: {} } });
    check("valor sem 'n' nem 't' é rejeitado", !!eCampoAusente);

    const { data: prevSimples } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: simplesItemId, p_valores: {} });
    check("item que não é peça retorna aplica_configurador=false, sem erro", prevSimples?.aplica_configurador === false);

    // --- pré-cálculo sem margem configurada
    const { data: semMargem, error: eSemMargem } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: valoresOk });
    check("pré-cálculo sem erro", !eSemMargem && semMargem?.aplica_configurador === true);
    check("material 787,35 + mão de obra 30,00 = custo_total 817,35", semMargem?.custo_material === 787.35 && semMargem?.custo_mao_obra === 30 && semMargem?.custo_total === 817.35);
    check("sem margem configurada: custo completo, mas sem preço sugerido (motivo margem_nao_configurada)", semMargem?.custo_completo === true && semMargem?.preco_sugerido === null && semMargem?.motivo_sem_preco === "margem_nao_configurada");

    const { data: prevPendente } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: { [cLargura]: { n: 2000 } } });
    check("característica obrigatória pendente (altura): motivo caracteristicas_pendentes, sem preço", prevPendente?.motivo_sem_preco === "caracteristicas_pendentes"
      && prevPendente?.custo_completo === false && prevPendente?.caracteristicas_pendentes?.includes("altura") && prevPendente?.preco_sugerido === null);

    // --- margem por empresa
    const { error: eMargemSemPerm } = await noPermTenant.client.rpc("upsert_margem_preco", { p_percentual: 30 });
    check("sem configuracoes.manage não define margem", !!eMargemSemPerm);
    const { error: eMargem100 } = await admTenant.client.rpc("upsert_margem_preco", { p_percentual: 100 });
    const { error: eMargemNeg } = await admTenant.client.rpc("upsert_margem_preco", { p_percentual: -1 });
    const { error: eMargemNula } = await admTenant.client.rpc("upsert_margem_preco", { p_percentual: null });
    check("margem >= 100, negativa ou nula é rejeitada", !!eMargem100 && !!eMargemNeg && !!eMargemNula);

    // Salvar sem margem e sem preço digitado precisa falhar com mensagem clara (antes de configurar a margem).
    const { data: orcamentoId } = await admTenant.client.rpc("upsert_orcamento", { p_id: null, p_pessoa_id: clienteRow.id, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null });
    const { error: eSalvarSemMargem } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 1, p_valores: valoresOk, p_preco_override: null,
    });
    check("salvar sem margem configurada e sem preço digitado é rejeitado", !!eSalvarSemMargem);

    const { error: eMargemOk } = await admTenant.client.rpc("upsert_margem_preco", { p_percentual: 30 });
    check("ADMIN define margem de 30%", !eMargemOk);
    const { data: margemRow } = await admTenant.client.from("pricing_settings").select("margem_percentual").eq("company_id", admTenant.company.id).single();
    check("margem persistida (30)", Number(margemRow?.margem_percentual) === 30);
    const { data: margemOutro } = await otherTenant.client.from("pricing_settings").select("id").eq("company_id", admTenant.company.id);
    check("outro tenant não enxerga a margem da empresa", (margemOutro ?? []).length === 0);

    const { data: comMargem } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: valoresOk });
    // 817,35 / (1 - 0,30) = 1167,642857... => 1167,64
    check("preço sugerido = custo / (1 - margem) = 1167,64", comMargem?.preco_sugerido === 1167.64 && comMargem?.margem_percentual === 30 && comMargem?.motivo_sem_preco === null);

    // --- gravação atômica
    const { error: eSalvarSemPerm } = await noPermTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 1, p_valores: valoresOk, p_preco_override: null,
    });
    check("sem orcamentos.manage não grava item configurado", !!eSalvarSemPerm);
    const { error: eSalvarNaoPeca } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: simplesItemId, p_quantidade: 1, p_valores: {}, p_preco_override: null,
    });
    check("item que não é peça configurável é rejeitado na gravação", !!eSalvarNaoPeca);
    const { error: eSalvarPendente } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 1, p_valores: { [cLargura]: { n: 2000 } }, p_preco_override: null,
    });
    check("característica obrigatória pendente bloqueia a gravação", !!eSalvarPendente);
    const { error: eSalvarQtd } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 0, p_valores: valoresOk, p_preco_override: null,
    });
    const { error: eSalvarPrecoNeg } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 1, p_valores: valoresOk, p_preco_override: -5,
    });
    check("quantidade 0 e preço negativo são rejeitados", !!eSalvarQtd && !!eSalvarPrecoNeg);
    const { error: eSalvarOutro } = await otherTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 1, p_valores: valoresOk, p_preco_override: null,
    });
    check("outro tenant não grava item no orçamento alheio", !!eSalvarOutro);

    const { data: orcItemId, error: eSalvar } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 2, p_valores: valoresOk, p_preco_override: null,
    });
    check("ADMIN grava item configurado sem digitar preço", !eSalvar && !!orcItemId);
    const { data: orcRow } = await admin.from("orcamento_itens").select("preco_unitario, custo_unitario, custo_mao_obra, quantidade").eq("id", orcItemId).single();
    check("servidor gravou preço 1167,64, custo 787,35 e mão de obra 30,00", Number(orcRow?.preco_unitario) === 1167.64 && Number(orcRow?.custo_unitario) === 787.35 && Number(orcRow?.custo_mao_obra) === 30 && Number(orcRow?.quantidade) === 2);
    const { data: caracGravadas } = await admin.from("orcamento_item_caracteristicas").select("peca_caracteristica_id, valor_numero").eq("orcamento_item_id", orcItemId);
    check("largura e altura gravadas junto com o item", caracGravadas?.length === 2 && Number(caracGravadas.find((c) => c.peca_caracteristica_id === cLargura)?.valor_numero) === 2000);

    // Regressão: a função antiga (valores gravados) dá o mesmo resultado do pré-cálculo.
    const { data: calcAntigo } = await admTenant.client.rpc("calcular_custo_orcamento_item", { p_orcamento_item_id: orcItemId });
    check("regressão: calcular_custo_orcamento_item (gravado) == pré-cálculo (787,35)", calcAntigo?.custo_total === 787.35 && calcAntigo?.custo_total === comMargem?.material?.custo_total);
    const { data: moAntiga } = await admTenant.client.rpc("calcular_mao_obra_orcamento_item", { p_orcamento_item_id: orcItemId });
    check("regressão: calcular_mao_obra_orcamento_item continua devolvendo 30,00", moAntiga?.tem_roteiro === true && moAntiga?.custo_total === 30);

    // Preço ajustado pelo vendedor prevalece; característica opcional entra e depois sai.
    const { error: eOverride } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: orcItemId, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 2,
      p_valores: { ...valoresOk, [cVidro]: { t: "temperado" } }, p_preco_override: 1500,
    });
    const { data: orcRow2 } = await admin.from("orcamento_itens").select("preco_unitario").eq("id", orcItemId).single();
    const { data: carac3 } = await admin.from("orcamento_item_caracteristicas").select("id").eq("orcamento_item_id", orcItemId);
    check("preço digitado pelo vendedor prevalece (1500) e a característica opcional foi gravada", !eOverride && Number(orcRow2?.preco_unitario) === 1500 && carac3?.length === 3);
    await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: orcItemId, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 2, p_valores: valoresOk, p_preco_override: null,
    });
    const { data: carac2 } = await admin.from("orcamento_item_caracteristicas").select("id").eq("orcamento_item_id", orcItemId);
    const { data: orcRow3 } = await admin.from("orcamento_itens").select("preco_unitario").eq("id", orcItemId).single();
    check("regravar sem a característica opcional remove o valor antigo e volta ao preço sugerido", carac2?.length === 2 && Number(orcRow3?.preco_unitario) === 1167.64);

    // Custo incompleto: material sem histórico => sem preço sugerido, custo não gravado.
    const { data: compFecho } = await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaId, material_item_id: fechoId, quantidade_por_unidade: 4 }).select().single();
    const { data: prevIncompleto } = await admTenant.client.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: valoresOk });
    check("material sem histórico: motivo custo_material_incompleto, sem preço sugerido", prevIncompleto?.motivo_sem_preco === "custo_material_incompleto" && prevIncompleto?.custo_completo === false && prevIncompleto?.preco_sugerido === null);
    const { error: eSalvarIncompleto } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: orcItemId, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 2, p_valores: valoresOk, p_preco_override: null,
    });
    check("custo incompleto sem preço digitado bloqueia a gravação", !!eSalvarIncompleto);
    const { error: eSalvarIncompletoOverride } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: orcItemId, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 2, p_valores: valoresOk, p_preco_override: 2000,
    });
    const { data: orcRow4 } = await admin.from("orcamento_itens").select("preco_unitario, custo_unitario, custo_mao_obra").eq("id", orcItemId).single();
    check("com preço digitado grava, mas o custo parcial NÃO é gravado (fica nulo)", !eSalvarIncompletoOverride && Number(orcRow4?.preco_unitario) === 2000 && orcRow4?.custo_unitario === null && orcRow4?.custo_mao_obra === null);
    await admin.from("peca_composicao").delete().eq("id", compFecho.id);

    // --- auditoria
    const { data: eventosV11 } = await admin.from("activity_logs").select("action, metadata").eq("company_id", admTenant.company.id).in("action", ["config.margem_preco_upserted", "comercial.orcamento_item_upserted"]);
    check("config.margem_preco_upserted registrado", (eventosV11 ?? []).some((e) => e.action === "config.margem_preco_upserted"));
    check("orcamento_item_upserted registrado com origem 'configurador' e preço ajustado sinalizado", (eventosV11 ?? []).some((e) => e.metadata?.origem === "configurador" && e.metadata?.preco_ajustado_pelo_vendedor === true));

    // --- privilégios: anon não executa; funções internas não são chamáveis por authenticated
    const anonClient = createClient(url, anonKey);
    const { error: eAnon } = await anonClient.rpc("calcular_preco_configurador", { p_item_id: portaItemId, p_valores: valoresOk });
    check("anon não executa calcular_preco_configurador", !!eAnon);
    const { error: eInternaCusto } = await admTenant.client.rpc("_calcular_custo_peca", { p_company_id: admTenant.company.id, p_peca_id: pecaId, p_valores: valoresOk });
    const { error: eInternaPreco } = await admTenant.client.rpc("_calcular_preco_configurador", { p_company_id: admTenant.company.id, p_item_id: portaItemId, p_valores: valoresOk });
    check("funções internas (_calcular_*) não são chamáveis por usuário autenticado", !!eInternaCusto && !!eInternaPreco);

    // --- orçamento fora de rascunho é terminal
    await admTenant.client.rpc("cancelar_orcamento", { p_id: orcamentoId });
    const { error: eAposCancelado } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: orcItemId, p_orcamento_id: orcamentoId, p_item_id: portaItemId, p_quantidade: 2, p_valores: valoresOk, p_preco_override: 1500,
    });
    check("orçamento cancelado (fora de rascunho) não aceita gravação de item configurado", !!eAposCancelado);
  }

  console.log("\n66. ADR-012 v1.1 — unidade das dimensões (mm, cm, m) lida do cadastro da característica");
  {
    async function registrarCustoCompra(companyId, solicitanteId, itemId, custoUnitario, fornecedorId) {
      const { data: sc } = await admin.from("solicitacoes_compra").insert({ company_id: companyId, numero: `SC-V12-${itemId.slice(0, 8)}`, solicitante_id: solicitanteId, status: "aberta" }).select().single();
      const { data: sci } = await admin.from("solicitacao_compra_itens").insert({ company_id: companyId, solicitacao_compra_id: sc.id, item_id: itemId, quantidade: 100 }).select().single();
      const { data: cot } = await admin.from("cotacoes").insert({ company_id: companyId, numero: `COT-V12-${itemId.slice(0, 8)}`, solicitacao_compra_id: sc.id, status: "selecionada" }).select().single();
      const { data: ci } = await admin.from("cotacao_itens").insert({ company_id: companyId, cotacao_id: cot.id, solicitacao_compra_item_id: sci.id }).select().single();
      const { data: pc } = await admin.from("pedidos_compra").insert({ company_id: companyId, numero: `PC-V12-${itemId.slice(0, 8)}`, cotacao_id: cot.id, pessoa_id: fornecedorId, status: "confirmado" }).select().single();
      await admin.from("pedido_compra_itens").insert({ company_id: companyId, pedido_compra_id: pc.id, cotacao_item_id: ci.id, item_id: itemId, quantidade: 100, preco_unitario: custoUnitario, custo_unitario: custoUnitario });
    }
    const novoItem = async (codigo, descricao, tipo, classificacao, unidade) =>
      (await admTenant.client.rpc("upsert_item", { p_id: null, p_codigo: codigo, p_descricao: descricao, p_tipo: tipo, p_classificacao: classificacao, p_unidade_principal: unidade, p_situacao: "ativo" })).data;

    const { data: fornecedorRow } = await admin.from("pessoas").select("id").eq("company_id", admTenant.company.id).eq("nome", "Fornecedor ADR012 Teste").single();
    const { data: clienteRow } = await admin.from("pessoas").select("id").eq("company_id", admTenant.company.id).eq("nome", "Cliente ADR012 Teste").single();
    const perfilId = await novoItem("PERFIL-V12", "Perfil v1.2", "materia_prima", "perfil", "M");
    const vidroId = await novoItem("VIDRO-V12", "Vidro v1.2", "materia_prima", "vidro", "M2");
    await registrarCustoCompra(admTenant.company.id, admTenant.userId, perfilId, 25.5, fornecedorRow.id);
    await registrarCustoCompra(admTenant.company.id, admTenant.userId, vidroId, 180.0, fornecedorRow.id);

    // Peça com perfil linear + vidro por área (sem perda) e dimensões na unidade informada.
    // 2 m x 1,5 m: perímetro 7 m x 25,50 = 178,50; área 3 m² x 180 = 540,00 => material 718,50.
    async function criarPecaDim(sufixo, unidade) {
      const itemId = await novoItem(`JAN-${sufixo}-V12`, `Janela ${sufixo} v1.2`, "produto_acabado", "janela", "UN");
      const { data: pecaId } = await admTenant.client.rpc("criar_peca", { p_item_id: itemId, p_descricao_tecnica: null });
      const { data: cL } = await admTenant.client.rpc("definir_caracteristica_peca", { p_peca_id: pecaId, p_nome: "largura", p_tipo: "numero", p_unidade: unidade, p_opcoes: null, p_obrigatoria: true });
      const { data: cA } = await admTenant.client.rpc("definir_caracteristica_peca", { p_peca_id: pecaId, p_nome: "altura", p_tipo: "numero", p_unidade: unidade, p_opcoes: null, p_obrigatoria: true });
      await admTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: cL, p_papel: "largura" });
      await admTenant.client.rpc("definir_papel_dimensional_caracteristica", { p_caracteristica_id: cA, p_papel: "altura" });
      const { data: compP } = await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaId, material_item_id: perfilId, quantidade_por_unidade: 1 }).select().single();
      const { data: compV } = await admin.from("peca_composicao").insert({ company_id: admTenant.company.id, peca_id: pecaId, material_item_id: vidroId, quantidade_por_unidade: 1 }).select().single();
      await admTenant.client.rpc("definir_tipo_calculo_composicao", { p_composicao_id: compP.id, p_tipo_calculo: "linear", p_percentual_perda: 0 });
      await admTenant.client.rpc("definir_tipo_calculo_composicao", { p_composicao_id: compV.id, p_tipo_calculo: "area", p_percentual_perda: 0 });
      return { itemId, cL, cA };
    }
    const prever = (p, largura, altura) =>
      admTenant.client.rpc("calcular_preco_configurador", { p_item_id: p.itemId, p_valores: { [p.cL]: { n: largura }, [p.cA]: { n: altura } } }).then((r) => r.data);

    const pM = await criarPecaDim("M", "m");
    const pCm = await criarPecaDim("CM", "cm");
    const pMaiusc = await criarPecaDim("MAIUSC", "MM");
    const pPol = await criarPecaDim("POL", "pol");
    const pVazia = await criarPecaDim("VAZIA", null);

    const calcM = await prever(pM, 2, 1.5);
    check("unidade 'm': 2 m x 1,5 m dá material 718,50 (antes dava ~0,00 por supor mm)", calcM?.custo_material === 718.5 && calcM?.material?.unidade_dimensao_invalida === false);
    const calcCm = await prever(pCm, 200, 150);
    check("unidade 'cm': 200 cm x 150 cm dá o mesmo material, 718,50", calcCm?.custo_material === 718.5);
    const calcMaiusc = await prever(pMaiusc, 2000, 1500);
    check("unidade 'MM' (maiúscula) é aceita e dá 718,50", calcMaiusc?.custo_material === 718.5);
    check("preço sugerido segue a margem de 30% (718,50 / 0,70 = 1026,43)", calcM?.preco_sugerido === 1026.43 && calcM?.motivo_sem_preco === null);

    const calcPol = await prever(pPol, 2, 1.5);
    check("unidade desconhecida ('pol'): sinaliza, não calcula as linhas dimensionais e não sugere preço", calcPol?.material?.unidade_dimensao_invalida === true
      && calcPol?.motivo_sem_preco === "unidade_dimensao_invalida" && calcPol?.preco_sugerido === null && calcPol?.custo_completo === false && calcPol?.custo_material === 0);
    const calcVazia = await prever(pVazia, 2, 1.5);
    check("unidade vazia: mesmo bloqueio (não adivinha mm)", calcVazia?.motivo_sem_preco === "unidade_dimensao_invalida" && calcVazia?.preco_sugerido === null);

    const { data: orcamentoId } = await admTenant.client.rpc("upsert_orcamento", { p_id: null, p_pessoa_id: clienteRow.id, p_obra_id: null, p_validade: null, p_condicao_comercial: null, p_observacoes: null });
    const { data: orcItemM, error: eSalvarM } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: pM.itemId, p_quantidade: 1, p_valores: { [pM.cL]: { n: 2 }, [pM.cA]: { n: 1.5 } }, p_preco_override: null,
    });
    const { data: rowM } = await admin.from("orcamento_itens").select("preco_unitario, custo_unitario").eq("id", orcItemM).single();
    check("grava item de peça em metros com preço 1026,43 e custo 718,50", !eSalvarM && Number(rowM?.preco_unitario) === 1026.43 && Number(rowM?.custo_unitario) === 718.5);
    const { data: antigaM } = await admTenant.client.rpc("calcular_custo_orcamento_item", { p_orcamento_item_id: orcItemM });
    check("regressão: calcular_custo_orcamento_item (gravado) também respeita a unidade (718,50)", antigaM?.custo_total === 718.5);

    const { error: eSalvarPol } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: pPol.itemId, p_quantidade: 1, p_valores: { [pPol.cL]: { n: 2 }, [pPol.cA]: { n: 1.5 } }, p_preco_override: null,
    });
    check("unidade inválida sem preço digitado bloqueia a gravação, dizendo o motivo", !!eSalvarPol && /unidade/i.test(eSalvarPol.message));
    const { data: orcItemPol, error: eSalvarPolOverride } = await admTenant.client.rpc("upsert_orcamento_item_configurado", {
      p_id: null, p_orcamento_id: orcamentoId, p_item_id: pPol.itemId, p_quantidade: 1, p_valores: { [pPol.cL]: { n: 2 }, [pPol.cA]: { n: 1.5 } }, p_preco_override: 500,
    });
    const { data: rowPol } = await admin.from("orcamento_itens").select("preco_unitario, custo_unitario").eq("id", orcItemPol).single();
    check("com preço digitado grava, e o custo (incompleto por unidade inválida) fica nulo", !eSalvarPolOverride && Number(rowPol?.preco_unitario) === 500 && rowPol?.custo_unitario === null);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
