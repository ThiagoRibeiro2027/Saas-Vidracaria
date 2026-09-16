// Service worker da PWA de campo (TÓPICO 16, ADR-008 §5/§6). Escopo restrito
// a /campo (registrado com { scope: "/campo" } em CampoServiceWorker.tsx) —
// o resto do SaaS (desktop) não é uma PWA e não deve ganhar cache algum daqui.
//
// O que este service worker NÃO faz, de propósito: não intercepta nem
// cacheia chamadas à API do Supabase (REST/RPC, origem diferente). Dados
// offline vivem em IndexedDB (src/lib/offline/db.ts), com validade e fila
// de sincronização controladas explicitamente pelo app (ADR-005 §8/§9/§12)
// — um cache HTTP implícito aqui serviria dado desatualizado sem as regras
// de expiração de 3/7 dias que o ADR exige. O único papel deste arquivo é
// manter o SHELL (HTML/JS/CSS/ícones) disponível pra reabrir o app offline.

const CACHE_VERSION = "campo-v1";
const OFFLINE_FALLBACK_URL = "/campo/offline.html";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll([OFFLINE_FALLBACK_URL, "/campo-manifest.json"])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin || request.method !== "GET") {
    return; // API do Supabase e mutações passam direto, sem cache.
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const isShellAsset = url.pathname.startsWith("/_next/") || url.pathname.startsWith("/icons/") || url.pathname === "/campo-manifest.json";
  if (isShellAsset) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached ?? (await cache.match(OFFLINE_FALLBACK_URL));
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return cached ?? Response.error();
  }
}
