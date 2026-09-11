// Fase 5 — Backup e Recuperação (Prompt Mestre item 37/38).
// Restaura um dump em um banco ISOLADO (nunca sobrescreve o banco de
// desenvolvimento/produção em uso) — "nunca testar restauração destrutiva
// diretamente em produção".
//
// Uso: node scripts/restore-db.mjs [caminho-do-dump] [nome-do-banco-alvo]
// Sem argumentos: usa o backup mais recente em backups/db/ e o banco
// restore_test_<timestamp>.

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PATH_WITH_LIBPQ = `/opt/homebrew/opt/libpq/bin:${process.env.PATH ?? ""}`;
const ENV = { ...process.env, PATH: PATH_WITH_LIBPQ };

function latestDumpFile() {
  const dir = join(process.cwd(), "backups", "db");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".dump"))
    .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) throw new Error("Nenhum backup encontrado em backups/db/.");
  return join(dir, files[0].f);
}

export function restore(dumpFile, targetDb) {
  const adminUrl = new URL(DATABASE_URL);
  const targetUrl = new URL(DATABASE_URL);
  targetUrl.pathname = `/${targetDb}`;
  adminUrl.pathname = "/postgres"; // banco de manutenção — nunca o alvo

  console.log(`Recriando banco isolado "${targetDb}"...`);
  execFileSync("psql", [adminUrl.toString(), "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${targetDb};`], {
    env: ENV,
    stdio: "inherit",
  });
  execFileSync("psql", [adminUrl.toString(), "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${targetDb};`], {
    env: ENV,
    stdio: "inherit",
  });
  // Todo banco novo já nasce com o schema public padrão do Postgres, que
  // colidiria com o "CREATE SCHEMA public;" do dump — remove antes, para
  // restaurar num banco realmente vazio (sem precisar de --clean, que por
  // sua vez falharia tentando dropar objetos de schemas que ainda não
  // existem nesse banco novo, como storage/auth).
  execFileSync("psql", [targetUrl.toString(), "-v", "ON_ERROR_STOP=1", "-c", "DROP SCHEMA public CASCADE;"], {
    env: ENV,
    stdio: "inherit",
  });

  console.log(`Restaurando ${dumpFile} em "${targetDb}"...`);
  execFileSync("pg_restore", [
    "--dbname", targetUrl.toString(),
    "--no-owner",
    "--no-privileges",
    dumpFile,
  ], { env: ENV, stdio: "inherit" });

  console.log(`Restauração concluída em "${targetDb}".`);
}

export function dropDatabase(targetDb) {
  const adminUrl = new URL(DATABASE_URL);
  adminUrl.pathname = "/postgres";
  execFileSync("psql", [adminUrl.toString(), "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${targetDb};`], {
    env: ENV,
    stdio: "inherit",
  });
}

// Executado diretamente via CLI (não quando importado por test-restore.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  const dumpFile = process.argv[2] ?? latestDumpFile();
  const targetDb = process.argv[3] ?? `restore_test_${Date.now()}`;
  restore(dumpFile, targetDb);
  console.log(`\nBanco de teste "${targetDb}" mantido para inspeção manual.`);
  console.log(`Para remover: psql "${DATABASE_URL.replace(/\/[^/]*$/, "/postgres")}" -c "DROP DATABASE ${targetDb};"`);
}
