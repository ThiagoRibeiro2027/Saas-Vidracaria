// Fase 5 — Backup e Recuperação (Prompt Mestre item 38: TESTE DE
// RESTAURAÇÃO). Não basta ter backup configurado — este script executa o
// pipeline completo e produz um relatório:
//
//   backup → banco isolado → restauração → validação → relatório
//
// Valida: quantidade de registros (tabelas-chave batem com a origem),
// RLS ainda habilitada, trigger de imutabilidade de auditoria presente,
// integridade referencial básica.
//
// Uso: node scripts/test-restore.mjs

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { restore, dropDatabase } from "./restore-db.mjs";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PATH_WITH_LIBPQ = `/opt/homebrew/opt/libpq/bin:${process.env.PATH ?? ""}`;
const ENV = { ...process.env, PATH: PATH_WITH_LIBPQ };

const TABLES = [
  "companies",
  "profiles",
  "roles",
  "permissions",
  "role_permissions",
  "user_roles",
  "activity_logs",
  "files",
  "platform_admins",
];

function psql(dbUrl, sql) {
  return execFileSync("psql", [dbUrl, "-t", "-A", "-c", sql], { env: ENV }).toString().trim();
}

function countRows(dbUrl, table) {
  return Number(psql(dbUrl, `select count(*) from public.${table};`));
}

async function main() {
  const results = [];
  function check(label, condition) {
    results.push({ label, ok: condition });
    console.log(`  ${condition ? "✓" : "✗"} ${label}`);
  }

  console.log("1/4 — Gerando backup fresco...");
  execFileSync("node", ["scripts/backup-db.mjs"], { stdio: "inherit" });

  const dumpDir = join(process.cwd(), "backups", "db");
  const latestDump = readdirSync(dumpDir)
    .filter((f) => f.endsWith(".dump"))
    .map((f) => ({ f, mtime: statSync(join(dumpDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].f;
  const dumpPath = join(dumpDir, latestDump);

  const targetDb = `restore_test_${Date.now()}`;
  const targetUrl = new URL(DATABASE_URL);
  targetUrl.pathname = `/${targetDb}`;

  try {
    console.log("\n2/4 — Restaurando em banco isolado...");
    restore(dumpPath, targetDb);

    console.log("\n3/4 — Validando...");
    for (const table of TABLES) {
      const sourceCount = countRows(DATABASE_URL, table);
      const restoredCount = countRows(targetUrl.toString(), table);
      check(`${table}: ${restoredCount} registro(s) (igual à origem: ${sourceCount})`, restoredCount === sourceCount);
    }

    const rlsEnabled = psql(
      targetUrl.toString(),
      "select relrowsecurity from pg_class where relname = 'activity_logs';",
    );
    check("RLS continua habilitada em activity_logs", rlsEnabled === "t");

    const rlsFilesEnabled = psql(
      targetUrl.toString(),
      "select relrowsecurity from pg_class where relname = 'files';",
    );
    check("RLS continua habilitada em files", rlsFilesEnabled === "t");

    const triggerExists = psql(
      targetUrl.toString(),
      "select count(*) from pg_trigger where tgname = 'activity_logs_immutable';",
    );
    check("Trigger de imutabilidade de auditoria presente", triggerExists === "1");

    const orphanProfiles = psql(
      targetUrl.toString(),
      "select count(*) from public.profiles p left join public.companies c on c.id = p.company_id where c.id is null;",
    );
    check("Sem perfis órfãos (integridade referencial)", orphanProfiles === "0");
  } finally {
    console.log("\n4/4 — Limpando banco de teste...");
    dropDatabase(targetDb);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== RELATÓRIO DE TESTE DE RESTAURAÇÃO ===`);
  console.log(`Data: ${new Date().toISOString()}`);
  console.log(`Dump testado: ${dumpPath}`);
  console.log(`Resultado: ${results.length - failed.length}/${results.length} verificações OK.`);
  console.log(failed.length === 0 ? "STATUS: BACKUP VÁLIDO — restauração testada com sucesso." : "STATUS: FALHA — investigar antes de confiar neste backup.");

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado no teste de restauração:", err);
  process.exit(1);
});
