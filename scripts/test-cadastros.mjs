// Testes automatizados do TÓPICO 2 — Cadastros, recorte mínimo do M1
// (PLANO DE ENTREGA — MVP DO PILOTO v1.0, outubro): Pessoa + Papéis
// (§4-6), Item unificado (§7-10) e Obra mínima (fora do TÓPICO 2 — vem do
// TÓPICO 16/ADR-002 §4.9, aqui só o registro básico que T3 Pedidos precisa).
//
// Uso: set -a; source .env.local; set +a; node scripts/test-cadastros.mjs

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
  console.log("Preparando tenants (admin, sem-permissão, outro tenant)...");
  const admTenant = await createTenant("cadastros-test-admin", "Cadastros Admin Teste", "9701", "ADMIN");
  const noPermTenant = await createTenant("cadastros-test-noperm", "Cadastros SemPerm Teste", "9702", "COMERCIAL");
  const otherTenant = await createTenant("cadastros-test-other", "Cadastros Outro Teste", "9703", "ADMIN");

  console.log("\n1. Escrita exige a permissão *.manage correta por entidade");
  {
    const { error: pessoaError } = await noPermTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: "CNPJ", p_documento: "00000000000191", p_nome: "X",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
      p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    check("sem pessoas.manage não cria pessoa", !!pessoaError);

    const { error: itemError } = await noPermTenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: "IT-1", p_descricao: "Vidro", p_tipo: "materia_prima",
      p_classificacao: null, p_unidade_principal: "M2", p_situacao: "ativo",
    });
    check("sem itens.manage não cria item", !!itemError);
  }

  console.log("\n2. Pessoa + Papéis — cria, evita documento duplicado, liga/desliga papel");
  let clienteId;
  {
    const { data: id, error } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: "CNPJ", p_documento: "11222333000181", p_nome: "JR Box Vidros",
      p_nome_fantasia: "JR Box", p_telefone: "11999990000", p_email: "contato@jrbox.example",
      p_logradouro: "Rua das Esquadrias, 100", p_cidade: "São Paulo", p_uf: "SP", p_cep: "01000-000",
      p_situacao: "ativo",
    });
    check("ADMIN cria pessoa", !error && !!id);
    clienteId = id;

    console.log("\n2a. Minimização de PII no snapshot de auditoria (F11, auditoria 15/09/2026)");
    {
      const { data: createLog } = await admin
        .from("activity_logs")
        .select("metadata")
        .eq("action", "cadastro.pessoa_upserted")
        .eq("entity_id", clienteId)
        .order("created_at", { ascending: true })
        .limit(1);
      const createdMetadata = createLog?.[0]?.metadata;
      check(
        "log de criação não guarda to_jsonb(before) — só a lista de campos alterados",
        Array.isArray(createdMetadata?.changed) && !("before" in (createdMetadata ?? {})),
      );
      check(
        "metadata da criação lista 'documento' como campo preenchido, sem o valor em texto livre",
        (createdMetadata?.changed ?? []).includes("documento") &&
          !JSON.stringify(createdMetadata).includes("11222333000181"),
      );

      const { error: updateError } = await admTenant.client.rpc("upsert_pessoa", {
        p_id: clienteId, p_tipo_documento: "CNPJ", p_documento: "11222333000181", p_nome: "JR Box Vidros",
        p_nome_fantasia: "JR Box", p_telefone: "11988887777", p_email: "novo-contato@jrbox.example",
        p_logradouro: "Rua das Esquadrias, 100", p_cidade: "São Paulo", p_uf: "SP", p_cep: "01000-000",
        p_situacao: "ativo",
      });
      check("ADMIN edita telefone/email da pessoa", !updateError);

      const { data: updateLog } = await admin
        .from("activity_logs")
        .select("metadata")
        .eq("action", "cadastro.pessoa_upserted")
        .eq("entity_id", clienteId)
        .order("created_at", { ascending: false })
        .limit(1);
      const updatedMetadata = updateLog?.[0]?.metadata;
      check(
        "log de edição lista telefone/email como campos alterados",
        (updatedMetadata?.changed ?? []).includes("telefone") &&
          (updatedMetadata?.changed ?? []).includes("email"),
      );
      check(
        "log de edição não guarda o telefone/email antigos em texto livre",
        !JSON.stringify(updatedMetadata).includes("11999990000") &&
          !JSON.stringify(updatedMetadata).includes("contato@jrbox.example"),
      );
      check(
        "log de edição não lista 'nome' como alterado (não mudou)",
        !(updatedMetadata?.changed ?? []).includes("nome"),
      );
    }

    const { error: dupError } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: "CNPJ", p_documento: "11222333000181", p_nome: "Outra Razão Social",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
      p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    check("documento duplicado na mesma empresa é rejeitado", !!dupError);

    const { error: dupFormatadoError } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: "CNPJ", p_documento: "11.222.333/0001-81", p_nome: "Mesma empresa, outro formato",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
      p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    check(
      "o mesmo documento com formatação diferente (pontos/traço) também é rejeitado",
      !!dupFormatadoError,
    );

    const { error: papelError } = await admTenant.client.rpc("set_pessoa_papel", {
      p_pessoa_id: clienteId, p_papel: "CLIENTE", p_ativo: true,
    });
    check("papel CLIENTE ligado com sucesso", !papelError);

    const { data: papeis } = await admin
      .from("pessoa_papeis")
      .select("id")
      .eq("pessoa_id", clienteId)
      .eq("papel", "CLIENTE");
    check("ligar o mesmo papel duas vezes não duplica a linha (ON CONFLICT)", (papeis ?? []).length === 1);

    await admTenant.client.rpc("set_pessoa_papel", {
      p_pessoa_id: clienteId, p_papel: "FORNECEDOR", p_ativo: true,
    });
    const { data: ambosPapeis } = await admin
      .from("pessoa_papeis")
      .select("papel")
      .eq("pessoa_id", clienteId);
    check(
      "a mesma pessoa pode ter os dois papéis (cliente e fornecedor)",
      new Set((ambosPapeis ?? []).map((p) => p.papel)).size === 2,
    );
  }

  console.log("\n3. Obra exige pessoa com papel CLIENTE ativo");
  let obraId;
  {
    const { data: pessoaSemPapel } = await admTenant.client.rpc("upsert_pessoa", {
      p_id: null, p_tipo_documento: null, p_documento: null, p_nome: "Fulano Sem Papel",
      p_nome_fantasia: null, p_telefone: null, p_email: null, p_logradouro: null,
      p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });

    const { error: obraSemClienteError } = await admTenant.client.rpc("upsert_obra", {
      p_id: null, p_pessoa_id: pessoaSemPapel, p_nome: "Obra Inválida",
      p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    check("obra rejeita pessoa sem papel CLIENTE ativo", !!obraSemClienteError);

    const { data: id, error } = await admTenant.client.rpc("upsert_obra", {
      p_id: null, p_pessoa_id: clienteId, p_nome: "Residencial Alto da Serra",
      p_logradouro: "Av. Central, 500", p_cidade: "São Paulo", p_uf: "SP", p_cep: "02000-000",
      p_situacao: "ativo",
    });
    check("obra com pessoa CLIENTE ativa é criada", !error && !!id);
    obraId = id;
  }

  console.log("\n4. Item — código duplicado na mesma empresa é rejeitado");
  {
    const { data: id, error } = await admTenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: "VD-TEMP-10", p_descricao: "Vidro temperado 10mm",
      p_tipo: "materia_prima", p_classificacao: "vidro_temperado", p_unidade_principal: "M2",
      p_situacao: "ativo",
    });
    check("ADMIN cria item", !error && !!id);

    const { error: dupError } = await admTenant.client.rpc("upsert_item", {
      p_id: null, p_codigo: "VD-TEMP-10", p_descricao: "Outro item com mesmo código",
      p_tipo: "produto_acabado", p_classificacao: null, p_unidade_principal: "UN",
      p_situacao: "ativo",
    });
    check("código duplicado na mesma empresa é rejeitado", !!dupError);
  }

  console.log("\n5. Isolamento entre tenants");
  {
    const { data: crossPessoas } = await otherTenant.client
      .from("pessoas")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga pessoas do tenant A", (crossPessoas ?? []).length === 0);

    const { data: crossObras } = await otherTenant.client
      .from("obras")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga obras do tenant A", (crossObras ?? []).length === 0);

    const { data: crossItens } = await otherTenant.client
      .from("itens")
      .select("id")
      .eq("company_id", admTenant.company.id);
    check("tenant B não enxerga itens do tenant A", (crossItens ?? []).length === 0);

    const { error: crossPapelError } = await otherTenant.client.rpc("set_pessoa_papel", {
      p_pessoa_id: clienteId, p_papel: "CLIENTE", p_ativo: false,
    });
    check("tenant B não consegue alterar papel de pessoa do tenant A", !!crossPapelError);

    const { error: crossObraError } = await otherTenant.client.rpc("upsert_obra", {
      p_id: obraId, p_pessoa_id: clienteId, p_nome: "Sequestro de obra",
      p_logradouro: null, p_cidade: null, p_uf: null, p_cep: null, p_situacao: "ativo",
    });
    check("tenant B não consegue editar obra do tenant A", !!crossObraError);
  }

  console.log("\n6. Cada upsert grava a própria linha de auditoria");
  {
    const { data: events } = await admin
      .from("activity_logs")
      .select("action")
      .in("action", [
        "cadastro.pessoa_upserted",
        "cadastro.pessoa_papel_set",
        "cadastro.obra_upserted",
        "cadastro.item_upserted",
      ]);
    const actions = new Set((events ?? []).map((e) => e.action));
    check("pessoa_upserted registrado", actions.has("cadastro.pessoa_upserted"));
    check("pessoa_papel_set registrado", actions.has("cadastro.pessoa_papel_set"));
    check("obra_upserted registrado", actions.has("cadastro.obra_upserted"));
    check("item_upserted registrado", actions.has("cadastro.item_upserted"));
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
