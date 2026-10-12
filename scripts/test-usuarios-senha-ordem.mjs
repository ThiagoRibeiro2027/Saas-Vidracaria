// Auditoria 12/10/2026 — redefinição de senha na tela Usuários.
//
// (1) CROSS-TENANT: resetarSenhaAction trocava a senha pela Admin API (que ignora
//     RLS) usando o profile_id do FORMULÁRIO e só depois o banco verificava se o
//     perfil era da empresa. Provado no navegador, no banco local: um ADMIN da
//     jrbox redefiniu a senha de usuário de OUTRA empresa. Agora o banco valida
//     (marcar_troca_senha_obrigatoria: permissão, suspensão e empresa) ANTES de
//     qualquer chamada a auth.admin.updateUserById.
// (2) Em produção o Next esconde a mensagem de uma Server Action que lança
//     exceção ("This page couldn't load"). Erro esperado (senha fraca, sem
//     permissão) tem de voltar como valor.
//
// Estático (sem banco): garante a ORDEM e a ausência de throw nos dois caminhos.
// A prova comportamental (ataque + senha fraca + caminho legítimo) foi feita no
// navegador contra o banco local e está registrada no backlog.
//
// Uso: node scripts/test-usuarios-senha-ordem.mjs [arquivo]

import { readFileSync } from "node:fs";

const arquivo = process.argv[2] ?? "src/app/usuarios/actions.ts";
const src = readFileSync(arquivo, "utf8");

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; } else { console.error(`  ✗ ${label}`); failed++; }
}

function corpo(nome) {
  const i = src.indexOf(`export async function ${nome}(`);
  if (i < 0) return "";
  const prox = src.indexOf("\nexport async function ", i + 10);
  return src.slice(i, prox < 0 ? undefined : prox);
}

console.log("1. resetarSenhaAction: o banco valida ANTES da Admin API");
const reset = corpo("resetarSenhaAction");
const iGate = reset.indexOf('rpc("marcar_troca_senha_obrigatoria"');
const iAdmin = reset.indexOf("updateUserById(");
check("chama marcar_troca_senha_obrigatoria", iGate >= 0);
check("chama auth.admin.updateUserById", iAdmin >= 0);
check("a validação no banco vem ANTES de trocar a senha", iGate >= 0 && iAdmin >= 0 && iGate < iAdmin);
check("a senha só é trocada se o gate passou (retorna erro antes)", /if \(gateError\) return/.test(reset));

console.log("\n2. Erro esperado volta como valor, não como exceção");
const criar = corpo("criarUsuarioAction");
for (const [nome, c] of [["resetarSenhaAction", reset], ["criarUsuarioAction", criar]]) {
  check(`${nome}: senha fraca não lança exceção`, !/throw new Error\([^)]*(Senha|senha)/.test(c) && /validatePassword\(/.test(c) && /return \{ error:/.test(c));
  check(`${nome}: nenhum throw new Error`, !/throw new Error/.test(c));
}

console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
process.exit(failed > 0 ? 1 : 0);
