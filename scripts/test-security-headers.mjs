// Auditoria TR Systems 12/10/2026, achado 2 — headers de segurança HTTP
// (next.config.ts). Antes da correção nenhuma resposta enviava CSP,
// X-Frame-Options nem nosniff (clickjacking).
//
// Não toca o banco: sobe um `next dev` próprio numa porta livre e confere
// os headers em todos os tipos de resposta do app — página pública (200),
// redirect do proxy (307), rota de cron sem segredo (401) e webhook com
// token inexistente (404). Respostas de erro e redirect também precisam dos
// headers, senão o iframe de terceiro ainda funcionaria nelas.
//
// Uso: node scripts/test-security-headers.mjs

import { spawn } from "node:child_process";
import { createServer } from "node:net";

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

const ROTAS = [
  { path: "/login", status: 200, nome: "página pública (200)" },
  { path: "/usuarios", status: 307, nome: "redirect do proxy sem sessão (307)" },
  { path: "/api/cron/security-alerts", status: 401, nome: "cron sem segredo (401)" },
  { path: "/api/webhooks/integracoes/token-inexistente", method: "POST", status: 404, nome: "webhook com token inexistente (404)" },
];

async function main() {
  const port = await freePort();
  const base = `http://localhost:${port}`;
  // HEADERS_MODE=prod testa o build de produção (`next build` antes; `next start`
  // aqui), onde a CSP não pode ter 'unsafe-eval'. Padrão: `next dev`.
  const prod = process.env.HEADERS_MODE === "prod";
  const child = spawn("npx", ["next", prod ? "start" : "dev", "-p", String(port)], {
    stdio: "ignore",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });

  try {
    await waitUp(base, child);

    for (const rota of ROTAS) {
      console.log(`\n${rota.nome} — ${rota.method ?? "GET"} ${rota.path}`);
      const res = await fetch(base + rota.path, {
        method: rota.method ?? "GET",
        redirect: "manual",
        headers: rota.method === "POST" ? { "Content-Type": "application/json" } : {},
        body: rota.method === "POST" ? JSON.stringify({ tipo: "x" }) : undefined,
      });
      const h = res.headers;
      const csp = h.get("content-security-policy") ?? "";

      check(`status ${rota.status}`, res.status === rota.status);
      check("CSP presente", csp.length > 0);
      check("CSP: frame-ancestors 'none'", /frame-ancestors 'none'/.test(csp));
      check("CSP: object-src 'none'", /object-src 'none'/.test(csp));
      check("CSP: base-uri 'self'", /base-uri 'self'/.test(csp));
      check("CSP: form-action 'self'", /form-action 'self'/.test(csp));
      check("CSP: default-src 'self'", /default-src 'self'/.test(csp));
      check("X-Frame-Options: DENY", h.get("x-frame-options") === "DENY");
      check("X-Content-Type-Options: nosniff", h.get("x-content-type-options") === "nosniff");
      check("Referrer-Policy definido", !!h.get("referrer-policy"));
      check("Permissions-Policy nega câmera/microfone/geolocalização", /camera=\(\)/.test(h.get("permissions-policy") ?? "") && /microphone=\(\)/.test(h.get("permissions-policy") ?? "") && /geolocation=\(\)/.test(h.get("permissions-policy") ?? ""));
      check("Strict-Transport-Security definido", /max-age=\d+/.test(h.get("strict-transport-security") ?? ""));
      check("X-Powered-By ausente", h.get("x-powered-by") === null);
    }

    // CSP não pode ter afrouxado além do que está documentado em
    // next.config.ts: sem curinga em script-src e sem 'unsafe-eval' fora de dev
    // (aqui é dev, então só o curinga é checável).
    console.log("\nCSP — sem curinga de origem em script-src");
    const res = await fetch(`${base}/login`);
    const scriptSrc = (res.headers.get("content-security-policy") ?? "").split(";").map((s) => s.trim()).find((s) => s.startsWith("script-src")) ?? "";
    check("script-src não aceita '*' nem http:/https: genérico", !/(^|\s)(\*|https?:)(\s|$)/.test(scriptSrc));
    if (prod) check("build de produção: script-src SEM 'unsafe-eval'", !/unsafe-eval/.test(scriptSrc));
  } finally {
    child.kill("SIGTERM");
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
