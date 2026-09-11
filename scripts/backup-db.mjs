// Fase 5 — Backup e Recuperação (Prompt Mestre item 34).
// Gera um dump completo (schema + dados) do Postgres em formato custom do
// pg_dump (comprimido, restaurável seletivamente com pg_restore).
//
// Uso: node scripts/backup-db.mjs
// Variáveis: DATABASE_URL (default: banco local do `supabase start`)

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// libpq instalado via `brew install libpq` fica fora do PATH por padrão no
// macOS (é keg-only). Adicionamos como fallback sem exigir configuração
// prévia do shell; em outros ambientes (CI, Linux) pg_dump já estará no PATH.
const PATH_WITH_LIBPQ = `/opt/homebrew/opt/libpq/bin:${process.env.PATH ?? ""}`;

const BACKUP_DIR = join(process.cwd(), "backups", "db");
mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = join(BACKUP_DIR, `${timestamp}.dump`);

console.log(`Gerando backup do banco em ${outFile}...`);

// Só os schemas que são "nossos": public (app), auth (contas de usuário,
// necessário para restaurar login) e storage (metadados dos arquivos — os
// binários em si vêm de backup-storage.mjs, item 36). Os demais schemas
// (realtime, vault, _analytics, etc.) são infraestrutura interna do
// Supabase: pertencem a roles de superusuário que nem em produção
// teríamos permissão de restaurar, e são cobertos pelo backup
// automático da própria plataforma (item 34), não por este script.
execFileSync(
  "pg_dump",
  [
    DATABASE_URL,
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--schema=public",
    "--schema=auth",
    "--schema=storage",
    "--file",
    outFile,
  ],
  { env: { ...process.env, PATH: PATH_WITH_LIBPQ }, stdio: "inherit" },
);

const { size } = statSync(outFile);
console.log(`Backup concluído: ${outFile} (${(size / 1024).toFixed(1)} KB)`);
