// Redefine a senha de UM usuário pela Admin API (service role). Uso de suporte,
// para quando ninguém consegue entrar. Não passa pelo app: use com cuidado.
//
// Segurança:
//  - a senha é pedida no terminal SEM eco e nunca vai para argumento de linha de
//    comando (não fica no histórico do shell);
//  - mostra o banco que vai alterar e pede confirmação digitada;
//  - exige a mesma política do app (10+ caracteres, maiúscula, minúscula, número
//    e símbolo) — a nuvem recusa senha fraca de qualquer jeito;
//  - marca must_change_password=true para o usuário escolher outra no primeiro login.
//
// A chave de service role vem do ambiente, nunca é impressa e nunca deve ser
// colada em chat, commit ou log.
//
// Uso (apontando para a NUVEM, só quando for isso mesmo que você quer):
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<chave> \
//   node scripts/reset-password.mjs <email-do-usuario>
//
// E-mail dos usuários de empresa: <matricula>.<slug-da-empresa>@users.internal

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

const MIN = 10;
const SYMBOLS = /[!@#$%^&*()_+\-=[\]{};':"\\|<>?,./`~]/;
function senhaFraca(s) {
  return s.length < MIN || !/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/[0-9]/.test(s) || !SYMBOLS.test(s);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];

if (!url || !serviceKey || !email) {
  console.error("Uso: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reset-password.mjs <email>");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let mudo = false;
const escreverOriginal = rl._writeToOutput?.bind(rl);
rl._writeToOutput = (s) => { if (!mudo) (escreverOriginal ? escreverOriginal(s) : rl.output.write(s)); };
const fila = [];
let aguardando = null;
rl.on("line", (l) => { if (aguardando) { const r = aguardando; aguardando = null; r(l); } else fila.push(l); });
rl.on("close", () => { if (aguardando) { const r = aguardando; aguardando = null; r(""); } });
function perguntar(texto, { oculto = false } = {}) {
  return new Promise((resolve) => {
    process.stdout.write(texto);
    mudo = oculto;
    const fim = (r) => { mudo = false; if (oculto) process.stdout.write("\n"); resolve(r); };
    if (fila.length) fim(fila.shift()); else aguardando = fim;
  });
}

const host = new URL(url).host;
console.log(`Banco alvo: ${host}`);
console.log(`Usuário:    ${email}`);
const ok = await perguntar(`Digite o host acima (${host}) para confirmar: `);
if (ok.trim() !== host) {
  console.error("Confirmação não confere. Nada foi alterado.");
  process.exit(1);
}

const senha = await perguntar("Nova senha (não aparece na tela): ", { oculto: true });
if (senhaFraca(senha)) {
  console.error(`Senha fraca. Mínimo de ${MIN} caracteres, com maiúscula, minúscula, número e símbolo. Nada foi alterado.`);
  process.exit(1);
}
const repetir = await perguntar("Repita a senha: ", { oculto: true });
if (repetir !== senha) {
  console.error("As senhas não são iguais. Nada foi alterado.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: lista, error: listError } = await admin.auth.admin.listUsers({ perPage: 10000 });
if (listError) { console.error("Falha ao listar usuários:", listError.message); process.exit(1); }
const alvo = lista.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!alvo) { console.error("Nenhum usuário com esse e-mail. Nada foi alterado."); process.exit(1); }

const { error: upError } = await admin.auth.admin.updateUserById(alvo.id, { password: senha });
if (upError) { console.error("Falha ao atualizar a senha:", upError.message); process.exit(1); }

// Usuário de empresa: força a troca no primeiro login (platform_admin não tem profile).
const { error: profError } = await admin.from("profiles").update({ must_change_password: true }).eq("id", alvo.id);
if (profError) console.warn("Aviso: não consegui marcar must_change_password:", profError.message);

console.log("Senha redefinida. No login, o usuário será levado a trocá-la.");
rl.close();
