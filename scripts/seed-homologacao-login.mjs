// Atalho pra recriar o login de homologação depois de um `supabase db
// reset --local` (que apaga TUDO, inclusive auth.users — é por isso que o
// login para de funcionar depois de cada reset durante o desenvolvimento).
//
// Cria/restaura, sempre no Supabase LOCAL (nunca toca o banco remoto — as
// credenciais vêm de `supabase status`, nunca de .env.local):
//   - empresa "jrbox" (espelha a empresa real, só pra homologação)
//   - login de empresa: matrícula 0002, papel ADMIN
//   - login de administrador de plataforma: thiagodaroze@hotmail.com
//     (precisa configurar o autenticador de novo depois de cada reset —
//     MFA também é apagado pelo reset, não tem como preservar isso)
//
// Senhas FIXAS de propósito (nunca mudam) — é ambiente descartável, local,
// sem dado real; fixar a senha é o que torna o atalho útil (senão seria
// preciso pedir a senha nova toda vez). Nunca usar estas senhas em
// qualquer ambiente que não seja este Supabase local.
//
// Uso: npm run homolog:login
//
// Sem a trava de scripts/lib/somente-local.mjs de propósito: este script
// nunca lê NEXT_PUBLIC_SUPABASE_URL/.env.local pra decidir onde conectar —
// a URL e a chave vêm sempre de `supabase status` (só existe se o Supabase
// local estiver no ar), então não há como ele alcançar o banco remoto por
// engano, mesmo que essas variáveis estejam setadas no shell.

import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const SENHA_EMPRESA = "Homolog@2026!";
const SENHA_PLATAFORMA = "PlatAdmin@2026!";

function statusLocal() {
  const raw = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" });
  return JSON.parse(raw);
}

async function criarOuAtualizarUsuario(admin, email, password) {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created?.user) return created.user.id;
  const jaExistia = /already registered|already exists|email_exists/i.test(error?.message ?? error?.code ?? "");
  if (!jaExistia) {
    console.error(`[seed] criar usuário ${email} falhou:`, error);
  }
  const { data: list } = await admin.auth.admin.listUsers();
  const existente = list.users.find((u) => u.email === email);
  if (!existente) throw new Error(`Não foi possível criar nem encontrar o usuário ${email}.`);
  await admin.auth.admin.updateUserById(existente.id, { password });
  return existente.id;
}

async function main() {
  const status = statusLocal();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Empresa + login de empresa (jrbox / matrícula 0002).
  const { data: company, error: companyErr } = await admin
    .from("companies")
    .upsert({ slug: "jrbox", name: "JR Box (Homologação)" }, { onConflict: "slug" })
    .select()
    .single();
  if (companyErr) throw companyErr;

  const userIdEmpresa = await criarOuAtualizarUsuario(admin, "0002.jrbox@users.internal", SENHA_EMPRESA);
  await admin.from("profiles").upsert(
    { id: userIdEmpresa, company_id: company.id, login_identifier: "0002", display_name: "Thiago Ribeiro" },
    { onConflict: "id" },
  );
  const { data: roleAdmin } = await admin.from("roles").select("id").is("company_id", null).eq("key", "ADMIN").single();
  const { data: jaTemPapel } = await admin
    .from("user_roles")
    .select("id")
    .eq("profile_id", userIdEmpresa)
    .eq("role_id", roleAdmin.id)
    .is("valid_until", null)
    .maybeSingle();
  if (!jaTemPapel) {
    await admin.from("user_roles").insert({ profile_id: userIdEmpresa, role_id: roleAdmin.id });
  }

  // 2) Administrador de plataforma.
  const userIdPlataforma = await criarOuAtualizarUsuario(admin, "thiagodaroze@hotmail.com", SENHA_PLATAFORMA);
  const { data: jaEhAdmin } = await admin.from("platform_admins").select("id").eq("id", userIdPlataforma).maybeSingle();
  if (!jaEhAdmin) {
    await admin.from("platform_admins").insert({ id: userIdPlataforma, role: "SUPER_ADMIN" });
  }

  console.log("Login de homologação pronto (http://localhost:3001):\n");
  console.log("  Empresa ................ jrbox");
  console.log("  Matrícula ............... 0002");
  console.log(`  Senha ................... ${SENHA_EMPRESA}\n`);
  console.log("  Administrador de plataforma (campo Empresa fica em branco)");
  console.log("  E-mail .................. thiagodaroze@hotmail.com");
  console.log(`  Senha ................... ${SENHA_PLATAFORMA}`);
  console.log("  (vai pedir pra configurar o autenticador de novo — MFA some a cada reset)");
}

main().catch((err) => {
  console.error("Erro ao recriar o login de homologação:", err);
  process.exit(1);
});
