// Fase 5 — Backup e Recuperação (Prompt Mestre item 36).
// Backup do PostgreSQL NÃO cobre os binários do Storage — este script baixa
// todos os objetos do bucket privado company-files e exporta também um
// manifesto com os metadados (tabela public.files), preservando a relação
// empresa/entidade/arquivo mesmo fora do banco.
//
// Uso: set -a; source .env.local; set +a; node scripts/backup-storage.mjs

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = "company-files";

// A API de Storage só lista um nível de pasta por vez — precisamos descer
// recursivamente (company_id/entity_type/entity_id/arquivo).
async function listAllPaths(prefix = "") {
  const { data: entries, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;

  const paths = [];
  for (const entry of entries ?? []) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Pastas vêm com id/metadata nulos; arquivos reais têm metadata.
    if (entry.id === null && entry.metadata === null) {
      paths.push(...(await listAllPaths(fullPath)));
    } else {
      paths.push(fullPath);
    }
  }
  return paths;
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(process.cwd(), "backups", "storage", timestamp);

  console.log("Listando objetos do bucket company-files...");
  const paths = await listAllPaths();
  console.log(`${paths.length} objeto(s) encontrado(s).`);

  let totalBytes = 0;
  for (const path of paths) {
    const { data: blob, error } = await admin.storage.from(BUCKET).download(path);
    if (error) {
      console.error(`  ✗ falha ao baixar ${path}: ${error.message}`);
      continue;
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    const destPath = join(outDir, "objects", path);
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, buffer);
    totalBytes += buffer.byteLength;
    console.log(`  ✓ ${path} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
  }

  // Manifesto: metadados completos (inclusive soft-deletados, para
  // possibilitar auditoria/restauração seletiva) — já protegidos por RLS no
  // banco, mas aqui usamos a service role só para o snapshot do backup.
  const { data: filesMetadata, error: metaError } = await admin
    .from("files")
    .select("*")
    .order("created_at", { ascending: true });
  if (metaError) throw metaError;

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "files-metadata.json"), JSON.stringify(filesMetadata, null, 2));

  console.log(
    `\nBackup do Storage concluído em ${outDir}\n` +
      `  Objetos: ${paths.length} (${(totalBytes / 1024 / 1024).toFixed(2)} MB)\n` +
      `  Metadados: ${filesMetadata.length} registro(s) em files-metadata.json`,
  );
}

main().catch((err) => {
  console.error("Erro inesperado no backup do Storage:", err);
  process.exit(1);
});
