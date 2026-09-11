// Testes automatizados da Fase 3 — Storage e Arquivos (Prompt Mestre itens
// 19-21): isolamento multi-tenant no bucket privado, autorização via
// register_file()/delete_file(), imutabilidade da tabela files para
// escrita direta e enforcement de MIME/tamanho no próprio bucket.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-storage-rls.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = "company-files";

// PNG 1x1 válido (assinatura real, para passar pela checagem de bytes).
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

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

async function createTenant(slug, name, identifier) {
  const { data: company, error: companyError } = await admin
    .from("companies")
    .upsert({ slug, name }, { onConflict: "slug" })
    .select()
    .single();
  if (companyError) throw companyError;

  const email = `${identifier}.${slug}@users.internal`;
  const password = "senha-de-teste-123456";

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
  }
  if (!userId) throw userError ?? new Error("usuário não criado");

  await admin.from("profiles").upsert(
    { id: userId, company_id: company.id, login_identifier: identifier, display_name: name },
    { onConflict: "id" },
  );

  const { data: adminRole } = await admin
    .from("roles")
    .select("id")
    .is("company_id", null)
    .eq("key", "ADMIN")
    .single();

  const { data: existing } = await admin
    .from("user_roles")
    .select("id")
    .eq("profile_id", userId)
    .eq("role_id", adminRole.id)
    .is("valid_until", null)
    .maybeSingle();
  if (!existing) {
    await admin.from("user_roles").insert({ profile_id: userId, role_id: adminRole.id });
  }

  const client = createClient(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { client, company, userId };
}

async function main() {
  console.log("Preparando dois tenants de teste (storage-a, storage-b)...");
  const tenantA = await createTenant("storage-a-test", "Storage A Teste", "9101");
  const tenantB = await createTenant("storage-b-test", "Storage B Teste", "9102");

  const pathA = `${tenantA.company.id}/geral/geral/teste-a.png`;
  const pathB = `${tenantB.company.id}/geral/geral/teste-b.png`;

  console.log("\n1. Upload no próprio prefixo — permitido");
  {
    const { error } = await tenantA.client.storage
      .from(BUCKET)
      .upload(pathA, PNG_1X1, { contentType: "image/png", upsert: true });
    check("tenant A consegue subir arquivo no próprio prefixo", !error);
  }

  console.log("\n2. Upload no prefixo de outro tenant — bloqueado pela RLS de storage.objects");
  {
    const forgedPath = `${tenantB.company.id}/geral/geral/invasao.png`;
    const { error } = await tenantA.client.storage
      .from(BUCKET)
      .upload(forgedPath, PNG_1X1, { contentType: "image/png", upsert: true });
    check("tenant A não consegue subir arquivo no prefixo do tenant B", !!error);
  }

  console.log("\n3. Isolamento de leitura no Storage");
  {
    const { error } = await tenantB.client.storage.from(BUCKET).download(pathA);
    check("tenant B não consegue baixar o objeto do tenant A", !!error);

    const { data: signed } = await tenantA.client.storage
      .from(BUCKET)
      .createSignedUrl(pathA, 30);
    check("tenant A consegue gerar signed URL do próprio objeto", !!signed?.signedUrl);
  }

  console.log("\n4. register_file() — metadado só é aceito dentro do próprio escopo");
  {
    const { data: fileId, error } = await tenantA.client.rpc("register_file", {
      p_entity_type: "geral",
      p_entity_id: null,
      p_storage_path: pathA,
      p_original_name: "teste-a.png",
      p_mime_type: "image/png",
      p_size_bytes: PNG_1X1.byteLength,
      p_width: 1,
      p_height: 1,
    });
    check("register_file() aceita caminho dentro do próprio tenant", !error && !!fileId);
    tenantA.fileId = fileId;

    const { error: forgedError } = await tenantA.client.rpc("register_file", {
      p_entity_type: "geral",
      p_entity_id: null,
      p_storage_path: pathB, // caminho de outro tenant, mesmo autenticado como A
      p_original_name: "forjado.png",
      p_mime_type: "image/png",
      p_size_bytes: PNG_1X1.byteLength,
    });
    check("register_file() rejeita caminho fora do escopo da empresa do chamador", !!forgedError);
  }

  console.log("\n5. Metadados — isolamento e imutabilidade por escrita direta");
  {
    const { data: crossRead } = await tenantB.client
      .from("files")
      .select("id")
      .eq("id", tenantA.fileId);
    check("tenant B não enxerga o metadado do arquivo do tenant A", (crossRead ?? []).length === 0);

    const { data: ownRead } = await tenantA.client
      .from("files")
      .select("id, original_name")
      .eq("id", tenantA.fileId);
    check("tenant A enxerga o próprio metadado", ownRead?.[0]?.original_name === "teste-a.png");

    const { error: directInsertError } = await tenantA.client.from("files").insert({
      company_id: tenantA.company.id,
      uploaded_by: tenantA.userId,
      entity_type: "geral",
      storage_path: `${tenantA.company.id}/geral/geral/direto.png`,
      original_name: "direto.png",
      mime_type: "image/png",
      size_bytes: 100,
    });
    check("cliente não consegue inserir direto em files (só via register_file)", !!directInsertError);
  }

  console.log("\n6. delete_file() — soft delete escopado por empresa");
  {
    const { error: crossDeleteError } = await tenantB.client.rpc("delete_file", {
      p_file_id: tenantA.fileId,
    });
    check("tenant B não consegue remover arquivo do tenant A", !!crossDeleteError);

    const { error: ownDeleteError } = await tenantA.client.rpc("delete_file", {
      p_file_id: tenantA.fileId,
    });
    check("tenant A remove (soft delete) o próprio arquivo", !ownDeleteError);

    const { data: afterDelete } = await admin
      .from("files")
      .select("deleted_at")
      .eq("id", tenantA.fileId)
      .single();
    check("deleted_at foi preenchido após a remoção", !!afterDelete?.deleted_at);
  }

  console.log("\n7. Enforcement no próprio bucket (defesa em profundidade)");
  {
    const { error: mimeError } = await tenantA.client.storage
      .from(BUCKET)
      .upload(`${tenantA.company.id}/geral/geral/malicioso.txt`, Buffer.from("conteudo"), {
        contentType: "text/plain",
        upsert: true,
      });
    check("bucket rejeita MIME fora da allow-list mesmo com RLS satisfeita", !!mimeError);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
