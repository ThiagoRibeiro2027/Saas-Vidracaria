// Auditoria TR Systems 12/10/2026 — cron /api/cron/storage-reconciliation.
//
// Suspeita (confirmada pela leitura do código): a rota purgava os objetos
// órfãos do Storage e depois chamava admin.rpc("log_activity", ...) para
// deixar o rastro de auditoria "security.storage_orphans_purged". Mas
// log_activity() exige auth.uid() não nulo e a service role não tem uid, então
// a função levantava exceção — e a rota nunca olhava o retorno do rpc. A purga
// acontecia; o registro de auditoria nunca era gravado, em silêncio.
//
// Este teste exercita a rota DE VERDADE (sobe um `next dev` próprio), com um
// objeto órfão real no bucket, e confere o efeito observável: o objeto some, o
// objeto recente NÃO some (janela de tolerância) e a linha de auditoria existe
// em activity_logs com os caminhos purgados e sem empresa (o órfão nunca teve
// dono). Antes da correção, a última verificação falha.
//
// Uso: set -a; source .env.local; set +a; node scripts/test-cron-storage-reconciliation.mjs
// (no `npm test` as variáveis vêm do `supabase status`).

import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// Mesma convenção dos outros testes que usam psql (test-rls-performance.mjs).
const PATH_WITH_LIBPQ = `/opt/homebrew/opt/libpq/bin:${process.env.PATH ?? ""}`;

const BUCKET = "company-files";
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

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

function psql(sql) {
  return execFileSync("psql", [DATABASE_URL, "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PATH: PATH_WITH_LIBPQ },
  }).trim();
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitUp(base, child) {
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null) throw new Error("next dev encerrou antes de subir");
    try {
      await fetch(`${base}/login`, { redirect: "manual" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("next dev não subiu em 90s");
}

async function main() {
  const cronSecret = `test-cron-${randomUUID()}`;
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const child = spawn("npx", ["next", "dev", "-p", String(port)], {
    stdio: "ignore",
    env: { ...process.env, CRON_SECRET: cronSecret, NEXT_TELEMETRY_DISABLED: "1" },
  });

  const runId = randomUUID();
  // Pasta de empresa inexistente de propósito: o objeto não tem metadado em
  // public.files, que é a definição de órfão (find_orphaned_storage_objects).
  const orfaoAntigo = `${randomUUID()}/geral/geral/${runId}-cron-orfao-antigo.png`;
  const orfaoRecente = `${randomUUID()}/geral/geral/${runId}-cron-orfao-recente.png`;

  try {
    await waitUp(base, child);

    console.log("1. Autorização do cron");
    const semSegredo = await fetch(`${base}/api/cron/storage-reconciliation`);
    check("sem Authorization responde 401", semSegredo.status === 401);
    const segredoErrado = await fetch(`${base}/api/cron/storage-reconciliation`, {
      headers: { Authorization: "Bearer errado" },
    });
    check("com segredo errado responde 401", segredoErrado.status === 401);

    console.log("\n2. Fixtures — dois objetos órfãos reais no bucket");
    const up1 = await admin.storage.from(BUCKET).upload(orfaoAntigo, PNG_1X1, { contentType: "image/png" });
    const up2 = await admin.storage.from(BUCKET).upload(orfaoRecente, PNG_1X1, { contentType: "image/png" });
    check("(fixture) objetos órfãos criados via service role", !up1.error && !up2.error);
    // Só o "antigo" passa da janela de 1 hora; o recente tem que sobreviver.
    psql(`update storage.objects set created_at = now() - interval '3 hours' where bucket_id = '${BUCKET}' and name = '${orfaoAntigo}'`);

    console.log("\n3. A rota purga só o que passou da janela");
    const res = await fetch(`${base}/api/cron/storage-reconciliation`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const corpo = await res.json().catch(() => ({}));
    check("rota responde 200 com ok=true", res.status === 200 && corpo.ok === true);
    check("purgou ao menos o órfão antigo", (corpo.purged ?? 0) >= 1);
    check(
      "o órfão antigo saiu do Storage",
      psql(`select count(*) from storage.objects where bucket_id = '${BUCKET}' and name = '${orfaoAntigo}'`) === "0",
    );
    check(
      "o órfão recente (dentro da janela de 1h) continua no Storage",
      psql(`select count(*) from storage.objects where bucket_id = '${BUCKET}' and name = '${orfaoRecente}'`) === "1",
    );

    console.log("\n4. O rastro de auditoria foi realmente gravado (suspeita original)");
    const { data: logs } = await admin
      .from("activity_logs")
      .select("action, entity_type, company_id, user_id, metadata")
      .eq("action", "security.storage_orphans_purged")
      .order("created_at", { ascending: false })
      .limit(20);
    const linha = (logs ?? []).find((l) => (l.metadata?.paths ?? []).includes(orfaoAntigo));
    check("existe linha 'security.storage_orphans_purged' em activity_logs com o caminho purgado", !!linha);
    check("a linha não pertence a nenhuma empresa (o órfão nunca teve dono)", !!linha && linha.company_id === null);
    check("a linha é de plataforma, sem usuário", !!linha && linha.user_id === null);
    check("entity_type da linha é storage_object", !!linha && linha.entity_type === "storage_object");

    console.log("\n5. sistema_registrar_evento_plataforma() — só service_role, lista fechada (regra 8)");
    const marcaForjada = `forjado ${randomUUID()}`;
    const { error: acaoLivre } = await admin.rpc("sistema_registrar_evento_plataforma", {
      p_action: "admin.granted",
      p_description: marcaForjada,
      p_metadata: null,
    });
    check(
      "ação fora da lista fechada é rejeitada, mesmo vinda da service role",
      !!acaoLivre && /AUD-1210-06/.test(acaoLivre.message ?? ""),
    );

    const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: anonError } = await anon.rpc("sistema_registrar_evento_plataforma", {
      p_action: "security.storage_orphans_purged",
      p_description: marcaForjada,
      p_metadata: null,
    });
    check(
      "anon não consegue registrar evento de plataforma",
      !!anonError && (anonError.code === "42501" || anonError.code === "PGRST202" || /permission denied/i.test(anonError.message ?? "")),
    );
    const { count: forjadas } = await admin
      .from("activity_logs")
      .select("id", { count: "exact", head: true })
      .eq("description", marcaForjada);
    check("nenhuma linha forjada chegou a activity_logs", (forjadas ?? 0) === 0);
  } finally {
    child.kill("SIGTERM");
    await admin.storage.from(BUCKET).remove([orfaoAntigo, orfaoRecente]);
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erro inesperado nos testes:", err);
  process.exit(1);
});
