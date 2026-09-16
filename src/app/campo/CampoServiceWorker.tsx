"use client";

import { useEffect } from "react";

// Registra o service worker só no escopo /campo (ADR-008 §5) — o restante
// do SaaS não é uma PWA e não deve ganhar nenhum comportamento de cache.
export default function CampoServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw-campo.js", { scope: "/campo" }).catch(() => {
      // Falha de registro não pode bloquear o uso online da PWA — só a
      // continuidade offline é que fica comprometida (ADR-008 §18: nenhum
      // processo crítico pode depender exclusivamente de um mecanismo
      // assíncrono/best-effort como este).
    });
  }, []);
  return null;
}
