// Libera um e-mail do Auth que está "preso" a um USUÁRIO DE EMPRESA, para que o
// mesmo e-mail possa virar platform_admin (cada e-mail só existe uma vez no Auth).
//
// O que faz: troca o e-mail de LOGIN do usuário de empresa (auth.users.email) para
// o endereço interno <matricula>.<slug>@users.internal. O usuário NÃO é apagado
// nem desativado: perfil, papéis, histórico e auditoria continuam intactos (dezenas
// de tabelas o referenciam e a trilha é imutável, então apagar não é possível).
//
// Por que é seguro para o login: com o campo Empresa preenchido, o app localiza o
// perfil por matrícula OU por profiles.contact_email e entra pelo e-mail interno do
// Auth, que ele mesmo busca. O contact_email (usado nas notificações) é preservado
// e, se estiver vazio, recebe o e-mail antigo. Depois disto, o mesmo e-mail pode ser
// cadastrado como platform_admin com scripts/criar-platform-admin.mjs.
//
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<chave> \
//   node scripts/liberar-email-auth.mjs <email-a-liberar>

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2]?.trim().toLowerCase();
if (!url || !key || !email) {
  console.error("Uso: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/liberar-email-auth.mjs <email>");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
const fila = [];
let aguardando = null;
rl.on("line", (l) => { if (aguardando) { const r = aguardando; aguardando = null; r(l); } else fila.push(l); });
rl.on("close", () => { if (aguardando) { const r = aguardando; aguardando = null; r(""); } });
function perguntar(texto) {
  return new Promise((resolve) => {
    process.stdout.write(texto);
    if (fila.length) resolve(fila.shift()); else aguardando = resolve;
  });
}
function sair(msg, code = 1) { console.error(msg); rl.close(); process.exit(code); }

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const host = new URL(url).host;

const { data: lista, error: listError } = await admin.auth.admin.listUsers({ perPage: 10000 });
if (listError) sair(`Falha ao listar usuários: ${listError.message}`);
const alvo = lista.users.find((u) => u.email?.toLowerCase() === email);
if (!alvo) sair("Nenhum usuário com esse e-mail no Auth. Nada foi alterado.");

const { data: perfil } = await admin.from("profiles").select("id, login_identifier, contact_email, company_id").eq("id", alvo.id).maybeSingle();
if (!perfil) sair("Esse e-mail não pertence a um usuário de empresa (sem perfil). Nada foi alterado.");
const { data: empresa } = await admin.from("companies").select("slug").eq("id", perfil.company_id).single();
const { data: ehPlatform } = await admin.from("platform_admins").select("id").eq("id", alvo.id).maybeSingle();
if (ehPlatform) sair("Esse usuário já é platform_admin. Nada foi alterado.");

const novoEmail = `${perfil.login_identifier}.${empresa.slug}@users.internal`.toLowerCase();
if (lista.users.some((u) => u.email?.toLowerCase() === novoEmail)) sair(`O e-mail interno ${novoEmail} já existe. Nada foi alterado.`);

console.log(`Banco alvo:        ${host}`);
console.log(`Usuário:           matrícula ${perfil.login_identifier} da empresa ${empresa.slug}`);
console.log(`E-mail de login:   ${email}  ->  ${novoEmail}`);
console.log(`contact_email:     ${perfil.contact_email ?? "(vazio, receberá o e-mail antigo)"}`);
if ((await perguntar(`Digite o host (${host}) para confirmar: `)).trim() !== host) sair("Confirmação não confere. Nada foi alterado.");

if (!perfil.contact_email) {
  const { error } = await admin.from("profiles").update({ contact_email: email }).eq("id", alvo.id);
  if (error) sair(`Falha ao preservar o contact_email: ${error.message}. Nada foi alterado no Auth.`);
}
const { error: upError } = await admin.auth.admin.updateUserById(alvo.id, { email: novoEmail, email_confirm: true });
if (upError) sair(`Falha ao trocar o e-mail do Auth: ${upError.message}`);

console.log(`Pronto. O usuário continua entrando com Empresa "${empresa.slug}" + matrícula ${perfil.login_identifier}.`);
console.log(`O e-mail ${email} está livre: rode scripts/criar-platform-admin.mjs ${email}`);
rl.close();
