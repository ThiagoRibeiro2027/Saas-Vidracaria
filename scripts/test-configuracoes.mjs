// Testes automatizados do TÓPICO 15 — Configurações, recorte mínimo do M1
// (PLANO DE ENTREGA — MVP DO PILOTO v1.0, seção 4): numeração (§7), margem
// de quebra (§31.4), regra de medição (§31.5) e alçadas de aprovação (§8,
// recortada).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-configuracoes.mjs

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

async function createTenant(slug, name, identifier, roleKey = "ADMIN") {
  const { data: company } = await admin
    .from("companies")
    .upsert({ slug, name }, { onConflict: "slug" })
    .select()
    .single();

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
  console.log("Preparando tenants (admin e sem-permissão) e um segundo tenant pra isolamento...");
  const admTenant = await createTenant("config-test-admin", "Config Admin Teste", "9601", "ADMIN");
  const noPermTenant = await createTenant("config-test-noperm", "Config SemPerm Teste", "9602", "COMERCIAL");
  const otherTenant = await createTenant("config-test-other", "Config Outro Teste", "9603", "ADMIN");

  console.log("\n1. Escrita exige configuracoes.manage");
  {
    const { error } = await noPermTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "pedido",
      p_prefixo: "PED-",
      p_sufixo: "",
      p_digitos: 6,
      p_incluir_ano: true,
      p_incluir_mes: false,
      p_reinicio: "anual",
    });
    check("usuário sem configuracoes.manage não consegue configurar numeração", !!error);
  }

  console.log("\n2. Numeração — ADMIN configura e persiste");
  {
    const { data: id, error } = await admTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "pedido",
      p_prefixo: "PED-",
      p_sufixo: "",
      p_digitos: 4,
      p_incluir_ano: true,
      p_incluir_mes: false,
      p_reinicio: "anual",
    });
    check("ADMIN consegue configurar a sequência de pedido", !error && !!id);

    const { data: row } = await admin
      .from("numbering_sequences")
      .select("prefixo, digitos, reinicio")
      .eq("id", id)
      .single();
    check("configuração persistida corretamente", row?.prefixo === "PED-" && row?.digitos === 4 && row?.reinicio === "anual");

    // Reexecuções deste script reaproveitam o mesmo tenant (upsert por
    // slug) — sem resetar o contador aqui, os testes de sequência abaixo
    // dependeriam do estado deixado pela rodada anterior.
    await admin.from("numbering_sequences").update({ current_value: 0, current_period_key: "" }).eq("id", id);
  }

  console.log("\n3. next_document_number() — sequência, zero-padding e sem duplicidade");
  {
    const year = new Date().getFullYear();
    const numbers = [];
    for (let i = 0; i < 5; i++) {
      const { data: num, error } = await admTenant.client.rpc("next_document_number", {
        p_document_type: "pedido",
      });
      check(`número ${i + 1} gerado sem erro`, !error);
      numbers.push(num);
    }
    check("todos os números são únicos", new Set(numbers).size === numbers.length);
    check(
      "primeiro número segue o formato PED-<ano><0001>",
      numbers[0] === `PED-${year}0001`,
    );
    check("números avançam em sequência", numbers[4] === `PED-${year}0005`);
  }

  console.log("\n4. Reinício anual — muda o período, reseta o contador");
  {
    // Simula virada de ano forçando current_period_key desatualizado via
    // service role (não há como manipular a data do servidor no teste).
    await admin
      .from("numbering_sequences")
      .update({ current_period_key: "1999" })
      .eq("company_id", admTenant.company.id)
      .eq("document_type", "pedido");

    const { data: num } = await admTenant.client.rpc("next_document_number", {
      p_document_type: "pedido",
    });
    const year = new Date().getFullYear();
    check("mudança de período reseta o contador para 0001", num === `PED-${year}0001`);
  }

  console.log("\n5. Margem de quebra — fallback do específico pro padrão do material");
  {
    await admTenant.client.rpc("upsert_cutting_margin", {
      p_material_tipo: "vidro_temperado",
      p_processo: "",
      p_percentual: 3.5,
      p_ativo: true,
    });
    await admTenant.client.rpc("upsert_cutting_margin", {
      p_material_tipo: "vidro_temperado",
      p_processo: "tempera",
      p_percentual: 5.0,
      p_ativo: true,
    });

    const { data: specific } = await admTenant.client.rpc("get_cutting_margin", {
      p_material_tipo: "vidro_temperado",
      p_processo: "tempera",
    });
    check("combinação específica (material+processo) tem prioridade", specific === 5);

    const { data: fallback } = await admTenant.client.rpc("get_cutting_margin", {
      p_material_tipo: "vidro_temperado",
      p_processo: "corte",
    });
    check("processo sem override cai para o padrão do material", fallback === 3.5);

    const { data: unset } = await admTenant.client.rpc("get_cutting_margin", {
      p_material_tipo: "aluminio",
      p_processo: "corte",
    });
    check("material sem nenhuma configuração retorna null", unset === null);
  }

  console.log("\n6. Regra de medição — bloqueia (sob medida) vs sinaliza (padrão)");
  {
    await admTenant.client.rpc("upsert_measurement_rule", {
      p_tipo_item: "vidro_temperado",
      p_exige_medicao_confirmada: true,
      p_ativo: true,
    });
    await admTenant.client.rpc("upsert_measurement_rule", {
      p_tipo_item: "padrao_catalogo",
      p_exige_medicao_confirmada: false,
      p_ativo: true,
    });

    const { data: rules } = await admTenant.client
      .from("measurement_rules")
      .select("tipo_item, exige_medicao_confirmada")
      .in("tipo_item", ["vidro_temperado", "padrao_catalogo"]);

    check(
      "item sob medida exige medição confirmada",
      rules.find((r) => r.tipo_item === "vidro_temperado")?.exige_medicao_confirmada === true,
    );
    check(
      "item padrão/catálogo não exige (só sinaliza)",
      rules.find((r) => r.tipo_item === "padrao_catalogo")?.exige_medicao_confirmada === false,
    );
  }

  console.log("\n7. Alçada de aprovação — valor mínimo + perfil aprovador");
  {
    const { data: adminRole } = await admin
      .from("roles")
      .select("id")
      .is("company_id", null)
      .eq("key", "ADMIN")
      .single();

    const { data: id, error } = await admTenant.client.rpc("upsert_approval_threshold", {
      p_processo: "orcamento_aprovacao",
      p_valor_minimo: 5000,
      p_role_id: adminRole.id,
      p_ativo: true,
    });
    check("ADMIN consegue configurar alçada de aprovação", !error && !!id);

    const { data: row } = await admin
      .from("approval_thresholds")
      .select("valor_minimo, role_id")
      .eq("id", id)
      .single();
    check("alçada persistida com valor e perfil corretos", Number(row?.valor_minimo) === 5000 && row?.role_id === adminRole.id);

    const { error: invalidRoleError } = await admTenant.client.rpc("upsert_approval_threshold", {
      p_processo: "pedido_liberacao",
      p_valor_minimo: 1000,
      p_role_id: "00000000-0000-0000-0000-000000000000",
      p_ativo: true,
    });
    check("perfil aprovador inexistente é rejeitado", !!invalidRoleError);
  }

  console.log("\n8. Isolamento entre tenants");
  {
    const { data: crossRead } = await otherTenant.client
      .from("numbering_sequences")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga numeração do tenant A", (crossRead ?? []).length === 0);

    const { data: crossMargin } = await otherTenant.client
      .from("cutting_margin_settings")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga margem de quebra do tenant A", (crossMargin ?? []).length === 0);

    const { error: crossWriteError } = await otherTenant.client.rpc("upsert_numbering_sequence", {
      p_document_type: "pedido",
      p_prefixo: "X",
      p_sufixo: "",
      p_digitos: 4,
      p_incluir_ano: false,
      p_incluir_mes: false,
      p_reinicio: "nunca",
    });
    check("tenant B configura a própria sequência sem afetar o tenant A (escopo correto)", !crossWriteError);

    const { data: aStillIntact } = await admin
      .from("numbering_sequences")
      .select("prefixo")
      .eq("company_id", admTenant.company.id)
      .eq("document_type", "pedido")
      .single();
    check("configuração do tenant A não foi alterada pelo tenant B", aStillIntact?.prefixo === "PED-");
  }

  console.log("\n9. Cada upsert grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "config.numbering_sequence_upserted",
        "config.cutting_margin_upserted",
        "config.measurement_rule_upserted",
        "config.approval_threshold_upserted",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("numbering_sequence_upserted registrado", actions.has("config.numbering_sequence_upserted"));
    check("cutting_margin_upserted registrado", actions.has("config.cutting_margin_upserted"));
    check("measurement_rule_upserted registrado", actions.has("config.measurement_rule_upserted"));
    check("approval_threshold_upserted registrado", actions.has("config.approval_threshold_upserted"));
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
