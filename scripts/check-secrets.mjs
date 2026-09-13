// "Verificação de secrets" do pipeline de CI (ADR-009 §4.3). Antes disso a
// afirmação ("SUPABASE_SERVICE_ROLE_KEY só é referenciada em admin.ts;
// nenhum .env foi commitado") era só um comentário impresso por
// test-security-phase7.mjs, nunca checado de verdade a cada push — este
// script torna isso um teste real.
//
// Uso: node scripts/check-secrets.mjs

import { execFileSync } from "node:child_process";

let failed = false;
function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed = true;
  }
}

function gitLsFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
}

function grepSrc(pattern) {
  try {
    return execFileSync("grep", ["-rl", "-E", pattern, "src/"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch (err) {
    // grep sai com status 1 quando não encontra nada — não é erro aqui.
    if (err.status === 1) return [];
    throw err;
  }
}

console.log("1. Nenhum arquivo .env commitado");
{
  const tracked = gitLsFiles();
  const envFiles = tracked.filter((f) => /(^|\/)\.env($|\.[^/]*$)/.test(f) && f !== ".env.example");
  check("git ls-files não retorna nenhum .env*", envFiles.length === 0);
}

console.log("\n2. SUPABASE_SERVICE_ROLE_KEY só é referenciada em src/lib/supabase/admin.ts");
{
  const files = grepSrc("SUPABASE_SERVICE_ROLE_KEY");
  const unexpected = files.filter((f) => f !== "src/lib/supabase/admin.ts");
  check(
    "nenhuma referência à service role key fora de admin.ts",
    unexpected.length === 0,
  );
  if (unexpected.length > 0) console.error(`    encontrado em: ${unexpected.join(", ")}`);
}

console.log("\n3. Nenhum secret hardcoded óbvio (chave JWT/token literal) em src/");
{
  // Padrão grosseiro de propósito: pega string longa em base64/JWT-like
  // atribuída a uma const, não tenta ser um scanner de secrets completo.
  const files = grepSrc("eyJ[A-Za-z0-9_-]{20,}");
  check("nenhum JWT literal encontrado em src/", files.length === 0);
  if (files.length > 0) console.error(`    encontrado em: ${files.join(", ")}`);
}

console.log(`\n${failed ? "FALHOU" : "OK"}`);
process.exit(failed ? 1 : 0);
