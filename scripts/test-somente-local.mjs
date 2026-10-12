// Auditoria 12/10/2026, achado 12: a trava scripts/lib/somente-local.mjs precisa
// (a) recusar URL/DATABASE_URL que não sejam locais e (b) estar importada em TODO
// test-*.mjs e seed-*.mjs que toque o banco. Puro, sem banco.
//
// Uso: node scripts/test-somente-local.mjs

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; } else { console.error(`  ✗ ${label}`); failed++; }
}

function rodarTrava(env) {
  return spawnSync("node", ["scripts/lib/somente-local.mjs"], {
    env: { PATH: process.env.PATH, ...env }, encoding: "utf8",
  });
}

console.log("1. A trava recusa o que não é local");
const nuvem = rodarTrava({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghij.supabase.co" });
check("URL do Supabase na nuvem é recusada (exit 1)", nuvem.status === 1 && /RECUSADO/.test(nuvem.stderr));
const dbNuvem = rodarTrava({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", DATABASE_URL: "postgresql://u:p@db.abcdefghij.supabase.co:5432/postgres" });
check("DATABASE_URL da nuvem é recusada mesmo com a URL local", dbNuvem.status === 1);
const invalido = rodarTrava({ NEXT_PUBLIC_SUPABASE_URL: "isso-nao-e-url" });
check("valor inválido é recusado, não ignorado", invalido.status === 1);

console.log("\n2. A trava aceita o banco local");
check("127.0.0.1 passa", rodarTrava({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }).status === 0);
check("localhost passa", rodarTrava({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" }).status === 0);
check("sem variáveis passa (os testes puros não usam banco)", rodarTrava({}).status === 0);

console.log("\n3. Todo teste/seed que usa banco importa a trava");
const PUROS = new Set(["test-imagem-exif.mjs", "test-formatar-data.mjs", "test-offline-validade.mjs", "test-security-headers.mjs", "test-password-policy.mjs", "test-usuarios-senha-ordem.mjs", "test-somente-local.mjs"]);
const sem = [];
for (const f of readdirSync("scripts")) {
  if (!/^(test|seed)-.*\.mjs$/.test(f) || PUROS.has(f)) continue;
  if (!/somente-local\.mjs/.test(readFileSync(`scripts/${f}`, "utf8"))) sem.push(f);
}
check("nenhum test-*/seed-* com banco ficou sem a trava", sem.length === 0);
if (sem.length) console.error("    sem trava:", sem.join(", "));

console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
process.exit(failed > 0 ? 1 : 0);
