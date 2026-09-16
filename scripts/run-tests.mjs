// Suíte formal de testes (ADR-009 §4.2): comando único (`npm test`) que roda
// os scripts de verificação já existentes, sem reescrevê-los — cada um
// continua um processo Node independente, criando e destruindo seus
// próprios tenants (§4.4). Este arquivo só orquestra: garante o Supabase
// local no ar, deriva as credenciais via `supabase status` (em vez de
// exigir `source .env.local` manualmente) e agrega o resultado.
//
// Teste de restauração de backup (§4.5) fica de fora de propósito — é
// obrigação periódica, não por push (RUNBOOK-BACKUP-E-RECUPERACAO.md),
// e depende de um dump em backups/db/ que não existe num checkout limpo.
//
// Uso: npm test

import { execFileSync, spawnSync } from "node:child_process";

const TEST_SCRIPTS = [
  "scripts/test-foundation-rls.mjs",
  "scripts/test-mfa-and-password.mjs",
  "scripts/test-governance.mjs",
  "scripts/test-audit-events.mjs",
  "scripts/test-storage-rls.mjs",
  "scripts/test-rls-performance.mjs",
  "scripts/test-security-phase7.mjs",
  "scripts/test-lgpd-anonymization.mjs",
  "scripts/test-activity-logs-retention.mjs",
  "scripts/test-configuracoes.mjs",
  "scripts/test-cadastros.mjs",
  "scripts/test-comercial.mjs",
  "scripts/test-pedidos.mjs",
  "scripts/test-engenharia.mjs",
  "scripts/test-estoque.mjs",
  "scripts/test-producao.mjs",
  "scripts/test-qualidade.mjs",
  "scripts/test-expedicao.mjs",
  "scripts/test-instalacao.mjs",
  "scripts/test-suprimentos.mjs",
  "scripts/test-financeiro.mjs",
  "scripts/test-rh.mjs",
];

function supabaseCredentials() {
  execFileSync("supabase", ["start"], { stdio: "inherit" });
  const raw = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" });
  const status = JSON.parse(raw);
  return {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    DATABASE_URL: status.DB_URL,
  };
}

function main() {
  console.log("Preparando ambiente (supabase start + db reset)...\n");
  const credentials = supabaseCredentials();
  // db reset reaplica migrations + seed.sql do zero — garante que a suíte
  // sempre roda contra o schema atual, não contra sobras de uma run anterior.
  execFileSync("supabase", ["db", "reset", "--local"], { stdio: "inherit" });

  const env = { ...process.env, ...credentials };
  const results = [];

  for (const script of TEST_SCRIPTS) {
    console.log(`\n${"=".repeat(70)}\n${script}\n${"=".repeat(70)}`);
    const { status } = spawnSync("node", [script], { env, stdio: "inherit" });
    results.push({ script, ok: status === 0 });
  }

  console.log(`\n${"=".repeat(70)}\nResumo\n${"=".repeat(70)}`);
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.script}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} scripts passaram.`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
