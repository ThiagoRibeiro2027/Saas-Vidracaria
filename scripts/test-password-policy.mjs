// Auditoria TR Systems 12/10/2026 — política de senha com número único.
//
// O app tinha três mínimos diferentes (10 na troca de senha; 8 na criação de
// usuário e na redefinição pelo admin) e um comentário afirmando que o config.toml
// garantia o GoTrue — o que só vale no banco local; na nuvem o mínimo é uma
// configuração do projeto e estava em 6 (`supabase config diff`). O app é a
// única barreira garantida, então o número precisa ser um só e acompanhar o
// config.toml.
//
// Puro (sem banco). Não consegue ver a configuração da NUVEM — para isso rode
// `npx supabase config diff` e confira `auth.minimum_password_length`.
//
// Uso: node scripts/test-password-policy.mjs

import "./lib/somente-local.mjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

function* arquivos(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) yield* arquivos(p);
    else if (/\.(ts|tsx)$/.test(nome)) yield p;
  }
}

const constante = readFileSync("src/lib/auth/password-policy.ts", "utf8").match(/MIN_PASSWORD_LENGTH\s*=\s*(\d+)/);
const config = readFileSync("supabase/config.toml", "utf8").match(/^minimum_password_length\s*=\s*(\d+)/m);

console.log("1. Fonte única");
check("a constante MIN_PASSWORD_LENGTH existe", !!constante);
check("supabase/config.toml declara minimum_password_length", !!config);
check(
  `a constante do app (${constante?.[1]}) é igual ao config.toml (${config?.[1]})`,
  !!constante && !!config && constante[1] === config[1],
);

console.log("\n2. Nenhum mínimo de senha escrito como número solto");
const literais = [];
const semConstante = [];
const usam = new Set();
for (const arq of arquivos("src")) {
  const txt = readFileSync(arq, "utf8");
  if (/MIN_PASSWORD_LENGTH/.test(txt) && !arq.endsWith("password-policy.ts")) usam.add(arq);
  // comparações de tamanho de variável de senha com literal numérico
  for (const m of txt.matchAll(/\b(password|novaSenha|senha|newPassword)\w*\.length\s*<\s*(\d+)/gi)) literais.push(`${arq}: ${m[0]}`);
  // atributos minLength numéricos em formulários (hoje só existem em campos de senha)
  for (const m of txt.matchAll(/minLength=\{(\d+)\}/g)) literais.push(`${arq}: ${m[0]}`);
}
check("nenhuma checagem de tamanho de senha usa número literal", literais.length === 0);
if (literais.length) for (const l of literais) console.error(`    ${l}`);

console.log("\n3. Os pontos que definem senha usam a constante");
for (const arq of ["src/app/change-password/page.tsx", "src/app/usuarios/FormsSenha.tsx"]) {
  check(`${arq} usa MIN_PASSWORD_LENGTH (atributo minLength do formulário)`, usam.has(arq));
}
const usuariosActions = readFileSync("src/app/usuarios/actions.ts", "utf8");
check(
  "criação de usuário E redefinição pelo admin validam a senha (2 usos de validatePassword em usuarios/actions.ts)",
  (usuariosActions.match(/validatePassword\(/g) ?? []).length >= 2,
);
check(
  "troca de senha valida com validatePassword",
  /validatePassword\(/.test(readFileSync("src/app/change-password/actions.ts", "utf8")),
);

console.log("\n4. Composição da senha (espelha password_requirements da nuvem)");
const { validatePassword } = await import("../src/lib/auth/password-policy.ts");
check("senha forte é aceita", validatePassword("Abcdef123!x") === null);
check("só minúsculas é recusada", validatePassword("abcdefghijkl") !== null);
check("sem maiúscula é recusada", validatePassword("abcdef123!x") !== null);
check("sem minúscula é recusada", validatePassword("ABCDEF123!X") !== null);
check("sem número é recusada", validatePassword("Abcdefghi!x") !== null);
check("sem símbolo é recusada", validatePassword("Abcdef1234x") !== null);
check("curta (9) é recusada mesmo com todas as classes", validatePassword("Abcde123!") !== null);
check("exatamente 10 com todas as classes é aceita", validatePassword("Abcde123!x") === null);
check("a mensagem diz a regra ao usuário", /maiúscula/.test(validatePassword("abc") ?? "") && /símbolo/.test(validatePassword("abc") ?? ""));

console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
process.exit(failed > 0 ? 1 : 0);
