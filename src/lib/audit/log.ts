import "server-only";
import { headers } from "next/headers";

// Prompt Mestre de Segurança item 17: registrar IP/User-Agent de eventos de
// autenticação. Lido dos headers da requisição no nosso próprio servidor
// Next.js (nunca de um valor enviado pelo body/JS do navegador — item 15).
// Em produção, x-forwarded-for/x-real-ip são preenchidos pela infraestrutura
// (ex.: Vercel), não pelo cliente diretamente.
export async function getClientContext() {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : (h.get("x-real-ip") ?? null);
  const userAgent = h.get("user-agent");
  return { ip, userAgent };
}
