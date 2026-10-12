// Segunda metade da limpeza: apaga do Auth os usuários que ficaram sem perfil e do
// Storage os arquivos de empresas que não existem mais. Roda DEPOIS de
// scripts/limpeza/02-executar.sql.
//
// Seguro por padrão: sem --executar, só LISTA o que apagaria.
//   - mantém todo usuário que ainda tem perfil em public.profiles (a jrbox);
//   - mantém os arquivos cuja pasta de empresa ainda existe em public.companies.
//
// A chave de service role vem do ambiente e nunca é impressa:
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chave> \
//   node scripts/limpeza/03-auth-storage.mjs [--executar]

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const executar = process.argv.includes("--executar");
const BUCKET = "company-files";

if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const host = new URL(url).host;
console.log(`Banco: ${host}  |  modo: ${executar ? "EXECUÇÃO REAL" : "simulação (nada é apagado)"}`);

// ---- o que manter
const { data: perfis, error: pErr } = await admin.from("profiles").select("id");
if (pErr) { console.error("Falha ao ler profiles:", pErr.message); process.exit(1); }
const { data: empresas, error: cErr } = await admin.from("companies").select("id, slug");
if (cErr) { console.error("Falha ao ler companies:", cErr.message); process.exit(1); }
if (empresas.length !== 1 || empresas[0].slug !== "jrbox") {
  console.error(`Esperava só a empresa jrbox (rode antes o 02-executar.sql). Encontrei ${empresas.length}: ${empresas.map((e) => e.slug).join(", ")}. Abortando.`);
  process.exit(1);
}
const manterUsuarios = new Set(perfis.map((p) => p.id));
const manterPastas = new Set(empresas.map((e) => e.id));

// ---- usuários do Auth
const todos = [];
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) { console.error("Falha ao listar usuários:", error.message); process.exit(1); }
  todos.push(...data.users);
  if (data.users.length < 1000) break;
}
const apagarUsuarios = todos.filter((u) => !manterUsuarios.has(u.id));
console.log(`Auth: ${todos.length} usuários; manter ${todos.length - apagarUsuarios.length}; apagar ${apagarUsuarios.length}`);

// ---- arquivos do Storage (recursivo por pasta)
async function listarTudo(prefixo) {
  const out = [];
  const { data, error } = await admin.storage.from(BUCKET).list(prefixo, { limit: 1000 });
  if (error) throw error;
  for (const item of data ?? []) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
    if (item.id === null) out.push(...(await listarTudo(caminho))); // pasta
    else out.push(caminho);
  }
  return out;
}
const arquivos = await listarTudo("");
const apagarArquivos = arquivos.filter((p) => !manterPastas.has(p.split("/")[0]));
console.log(`Storage (${BUCKET}): ${arquivos.length} arquivos; manter ${arquivos.length - apagarArquivos.length}; apagar ${apagarArquivos.length}`);

if (!executar) {
  console.log("\nSimulação concluída. Para apagar de verdade, rode de novo com --executar.");
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const resp = await new Promise((r) => rl.question(`\nIRREVERSÍVEL. Digite o host (${host}) para confirmar: `, r));
rl.close();
if (resp.trim() !== host) { console.error("Confirmação não confere. Nada foi apagado."); process.exit(1); }

// storage primeiro (lotes de 100), depois usuários
for (let i = 0; i < apagarArquivos.length; i += 100) {
  const { error } = await admin.storage.from(BUCKET).remove(apagarArquivos.slice(i, i + 100));
  if (error) { console.error("Falha ao remover arquivos:", error.message); process.exit(1); }
}
let falhas = 0;
for (const u of apagarUsuarios) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) { falhas++; console.error(`Falha ao apagar usuário ${u.id}: ${error.message}`); }
}
console.log(`Concluído. Arquivos apagados: ${apagarArquivos.length}. Usuários apagados: ${apagarUsuarios.length - falhas}. Falhas: ${falhas}.`);
process.exit(falhas ? 1 : 0);
