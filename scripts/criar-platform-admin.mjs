// Cria um administrador de plataforma (SUPER_ADMIN) com senha forte escolhida por
// você. Substitui o scripts/seed-platform-admin.mjs, que tem senha FIXA no
// repositório e NUNCA deve ser usado fora do banco local de teste.
//
// Segurança:
//  - senha pedida no terminal SEM eco, nunca em argumento (não vai para o histórico);
//  - mostra o banco alvo e exige que você digite o host para confirmar;
//  - política do app: 10+ caracteres, maiúscula, minúscula, número e símbolo;
//  - recusa criar se o e-mail já existir (não sobrescreve conta alheia);
//  - o MFA é obrigatório no banco (platform_admins.mfa_enforced): no primeiro
//    login você é levado a cadastrar o autenticador em /mfa/enroll. Sem MFA
//    verificado (AAL2) o banco nega as operações de plataforma.
//
// Use um e-mail REAL seu, que você controla (login de plataforma é por e-mail).
// A chave de service role vem do ambiente e nunca é impressa.
//
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<chave> \
//   node scripts/criar-platform-admin.mjs <seu-email>

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

const MIN = 10;
const SYMBOLS = /[!@#$%^&*()_+\-=[\]{};':"\\|<>?,./`~]/;
const senhaFraca = (s) => s.length < MIN || !/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/[0-9]/.test(s) || !SYMBOLS.test(s);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2]?.trim();
if (!url || !key || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Uso: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/criar-platform-admin.mjs <seu-email>");
  process.exit(1);
}
if (/@users\.internal$|@saas-vidracaria\.internal$/.test(email)) {
  console.error("Use um e-mail real seu, não um endereço interno de teste.");
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
console.log(`Banco alvo: ${host}\nE-mail:     ${email}`);
if ((await perguntar(`Digite o host (${host}) para confirmar: `)).trim() !== host) {
  console.error("Confirmação não confere. Nada foi criado.");
  process.exit(1);
}
const senha = await perguntar("Senha (não aparece na tela): ", { oculto: true });
if (senhaFraca(senha)) {
  console.error(`Senha fraca. Mínimo de ${MIN} caracteres, com maiúscula, minúscula, número e símbolo. Nada foi criado.`);
  process.exit(1);
}
if ((await perguntar("Repita a senha: ", { oculto: true })) !== senha) {
  console.error("As senhas não são iguais. Nada foi criado.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: lista, error: listError } = await admin.auth.admin.listUsers({ perPage: 10000 });
if (listError) { console.error("Falha ao listar usuários:", listError.message); process.exit(1); }
if (lista.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
  console.error("Já existe um usuário com esse e-mail. Nada foi criado (use reset-password.mjs para trocar a senha).");
  process.exit(1);
}

const { data: criado, error: createError } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
if (createError || !criado?.user) { console.error("Falha ao criar o usuário:", createError?.message); process.exit(1); }

const { error: paError } = await admin.from("platform_admins").insert({ id: criado.user.id, role: "SUPER_ADMIN" });
if (paError) {
  await admin.auth.admin.deleteUser(criado.user.id); // não deixa usuário órfão sem papel
  console.error("Falha ao registrar como platform_admin (usuário desfeito):", paError.message);
  process.exit(1);
}

console.log("Platform admin criado. No primeiro login (campo Empresa em branco) cadastre o autenticador em /mfa/enroll.");
rl.close();
