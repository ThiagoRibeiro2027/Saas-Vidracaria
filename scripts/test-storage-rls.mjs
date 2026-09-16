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

async function createTenant(slug, name, identifier, roleKey = "ADMIN", existingCompany = null) {
  let company = existingCompany;
  if (!company) {
    const { data, error: companyError } = await admin
      .from("companies")
      .upsert({ slug, name }, { onConflict: "slug" })
      .select()
      .single();
    if (companyError) throw companyError;
    company = data;
  }

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
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { client, company, userId };
}

async function main() {
  console.log("Preparando dois tenants de teste (storage-a, storage-b)...");
  const tenantA = await createTenant("storage-a-test", "Storage A Teste", "9101");
  const tenantB = await createTenant("storage-b-test", "Storage B Teste", "9102");
  // Mesma empresa do tenant A, papel COMERCIAL — sem files.read/files.upload
  // por padrão (seed.sql só concede permissões de fundação ao ADMIN). Usado
  // para testar o Security Gate Fase 8 (SEC-002/003/004): tenant isolation
  // sozinho não basta, o bucket precisa respeitar RBAC também.
  const tenantANoPerm = await createTenant("storage-a-test", "Storage A Sem Permissão", "9103", "COMERCIAL", tenantA.company);

  // Sufixo único por execução: soft delete (item 16) mantém o objeto físico
  // no Storage entre execuções, e files_storage_path_unique impediria
  // re-registrar o mesmo caminho — caminhos fixos tornariam este script
  // não-idempotente entre rodadas sem um reset completo do banco.
  const runId = crypto.randomUUID();
  const pathA = `${tenantA.company.id}/geral/geral/${runId}-teste-a.png`;
  const pathB = `${tenantB.company.id}/geral/geral/${runId}-teste-b.png`;

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

  console.log("\n8. UPDATE (upsert em path já existente) — Security Gate Fase 8");
  {
    // upload(..., {upsert:true}) para um path que já existe vira internamente
    // um INSERT ... ON CONFLICT DO UPDATE. Até 20260912150000 não havia
    // policy de UPDATE em storage.objects: o próprio dono do arquivo era
    // barrado de reenviar/substituir o próprio objeto (bug real, encontrado
    // no Security Gate da Fase 8 — sem policy, RLS nega por padrão).
    const { error: ownUpdateError } = await tenantA.client.storage
      .from(BUCKET)
      .upload(pathA, PNG_1X1, { contentType: "image/png", upsert: true });
    check(
      "tenant A consegue sobrescrever (UPDATE) o próprio objeto já existente",
      !ownUpdateError,
    );

    const { error: foreignUpdateError } = await tenantB.client.storage
      .from(BUCKET)
      .upload(pathA, PNG_1X1, { contentType: "image/png", upsert: true });
    check(
      "tenant B não consegue sobrescrever (UPDATE) o objeto existente do tenant A",
      !!foreignUpdateError,
    );
  }

  console.log("\n9. RBAC no Storage — Security Gate Fase 8 (SEC-002/003/004)");
  {
    const { error: readError } = await tenantANoPerm.client.storage.from(BUCKET).download(pathA);
    check(
      "usuário do mesmo tenant sem files.read não consegue baixar objeto (SEC-002)",
      !!readError,
    );

    const { error: signedError } = await tenantANoPerm.client.storage
      .from(BUCKET)
      .createSignedUrl(pathA, 30);
    check(
      "usuário sem files.read não consegue gerar signed URL (SEC-002)",
      !!signedError,
    );

    const uploadPath = `${tenantA.company.id}/geral/geral/${runId}-sem-permissao.png`;
    const { error: uploadError } = await tenantANoPerm.client.storage
      .from(BUCKET)
      .upload(uploadPath, PNG_1X1, { contentType: "image/png", upsert: true });
    check(
      "usuário sem files.upload não consegue subir arquivo direto no bucket (SEC-003)",
      !!uploadError,
    );

    const { error: updateError } = await tenantANoPerm.client.storage
      .from(BUCKET)
      .upload(pathA, PNG_1X1, { contentType: "image/png", upsert: true });
    check(
      "usuário sem files.upload não consegue sobrescrever objeto existente (SEC-004)",
      !!updateError,
    );

    const { error: ownReadError } = await tenantA.client.storage.from(BUCKET).download(pathA);
    check(
      "usuário do mesmo tenant COM files.read continua baixando normalmente (sem regressão)",
      !ownReadError,
    );
  }

  console.log("\n10. RBAC no Storage — DELETE (achado de code-review, 15/09)");
  {
    // A policy de DELETE do storage.objects só checava tenant, sem
    // has_permission('files','delete') — mesma classe de gap que
    // SEC-002/003/004 fechou pros outros três verbos. Reprodutível via
    // src/lib/storage/upload.ts:71, que chama .remove() direto do client
    // como rollback de upload sem metadado registrado.
    const deletePath = `${tenantA.company.id}/geral/geral/${runId}-para-deletar.png`;
    await tenantA.client.storage.from(BUCKET).upload(deletePath, PNG_1X1, { contentType: "image/png", upsert: true });

    // DELETE bloqueado por RLS não retorna erro pelo Storage API — o
    // comando afeta 0 linhas silenciosamente (diferente de INSERT/UPDATE,
    // cujo WITH CHECK falhado levanta exceção). O sinal real de que a
    // policy bloqueou é o objeto continuar existindo depois.
    await tenantANoPerm.client.storage.from(BUCKET).remove([deletePath]);

    const { error: stillThereError } = await tenantA.client.storage.from(BUCKET).download(deletePath);
    check("usuário sem files.delete não consegue apagar objeto (objeto sobrevive)", !stillThereError);

    const { error: deleteComPermError } = await tenantA.client.storage.from(BUCKET).remove([deletePath]);
    check("usuário COM files.delete consegue apagar o próprio objeto", !deleteComPermError);
  }

  console.log("\n11. Soft-delete não deixa arquivo baixável (F03, auditoria 15/09/2026)");
  {
    const deletedPath = `${tenantA.company.id}/geral/geral/${runId}-soft-deleted.png`;
    await tenantA.client.storage.from(BUCKET).upload(deletedPath, PNG_1X1, { contentType: "image/png", upsert: true });
    const { data: deletedFileId } = await tenantA.client.rpc("register_file", {
      p_entity_type: "geral",
      p_entity_id: null,
      p_storage_path: deletedPath,
      p_original_name: "soft-deleted.png",
      p_mime_type: "image/png",
      p_size_bytes: PNG_1X1.byteLength,
      p_width: 1,
      p_height: 1,
    });
    await tenantA.client.rpc("delete_file", { p_file_id: deletedFileId });

    const { data: selectAfterDelete } = await tenantA.client
      .from("files")
      .select("id")
      .eq("id", deletedFileId);
    check(
      "arquivo com soft-delete não aparece mais em files_select, mesmo pro próprio dono",
      (selectAfterDelete ?? []).length === 0,
    );

    // O objeto físico continua no Storage (purge físico é decisão futura,
    // Mapa §11) — o que muda é o acesso lógico via metadado/policy.
    const { error: stillDownloadableError } = await tenantA.client.storage
      .from(BUCKET)
      .download(deletedPath);
    check(
      "objeto físico permanece no Storage após soft-delete (sem purge físico ainda)",
      !stillDownloadableError,
    );
  }

  console.log("\n12. Reconciliação de objetos órfãos no Storage (F01 residual, auditoria 15/09/2026)");
  {
    // Simula o "Caminho B" do Mapa: upload direto no Storage sem passar
    // por register_file() — o objeto existe fisicamente sem metadado.
    const orphanPath = `${tenantA.company.id}/geral/geral/${runId}-orfao.png`;
    await tenantA.client.storage.from(BUCKET).upload(orphanPath, PNG_1X1, { contentType: "image/png", upsert: true });

    const { data: notYetOrphan } = await admin.rpc("find_orphaned_storage_objects", {
      p_older_than: "1 hour",
    });
    check(
      "objeto recém-enviado ainda não entra na lista de órfãos (janela de tolerância)",
      !(notYetOrphan ?? []).some((o) => o.name === orphanPath),
    );

    const { data: orphansNow, error: orphansError } = await admin.rpc("find_orphaned_storage_objects", {
      p_older_than: "0 seconds",
    });
    check(
      "find_orphaned_storage_objects() detecta o objeto sem metadado registrado",
      !orphansError && (orphansNow ?? []).some((o) => o.name === orphanPath),
    );
    check(
      "find_orphaned_storage_objects() não lista o objeto já registrado do tenant A (pathA)",
      !(orphansNow ?? []).some((o) => o.name === pathA),
    );

    const { error: directCallError } = await tenantA.client.rpc("find_orphaned_storage_objects", {
      p_older_than: "0 seconds",
    });
    check(
      "usuário autenticado (não service_role) não consegue chamar find_orphaned_storage_objects()",
      !!directCallError,
    );

    const { error: removeError } = await admin.storage.from(BUCKET).remove([orphanPath]);
    check("reconciliação consegue purgar o objeto órfão via service role", !removeError);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
