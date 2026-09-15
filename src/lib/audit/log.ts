import "server-only";
import { headers } from "next/headers";

// Prompt Mestre de Segurança item 17: registrar IP/User-Agent de eventos de
// autenticação. Lido dos headers da requisição no nosso próprio servidor
// Next.js (nunca de um valor enviado pelo body/JS do navegador — item 15).
//
// SEC-013 (Security Gate Fase 8, trust boundary do X-Forwarded-For):
// hospedagem é só Vercel, sem proxy/CDN adicional na frente. A própria
// Vercel garante isso — "we currently overwrite the X-Forwarded-For header
// and do not forward external IPs. This restriction is in place to prevent
// IP spoofing" (https://vercel.com/docs/headers/request-headers#x-forwarded-for)
// — então x-forwarded-for já seria confiável aqui. `x-vercel-forwarded-for`
// é preferido mesmo assim: é o valor que a própria Vercel calcula
// internamente, imune ao cenário em que x-forwarded-for pode ser
// sobrescrito por um proxy externo colocado NA FRENTE da Vercel (ex.: um
// WAF/CDN próprio) — cenário que este projeto não usa hoje, mas que
// invalidaria a suposição acima se alguém adicionar um no futuro sem
// revisar este arquivo.
//
// Se um proxy adicional for colocado na frente da Vercel no futuro, isto
// precisa ser revisto: ou configurar o Trusted Proxy da Vercel (plano
// Enterprise) para esse proxy, ou mover a resolução de IP para dentro dele.
export async function getClientContext() {
  const h = await headers();
  const forwardedFor = h.get("x-vercel-forwarded-for") ?? h.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : (h.get("x-real-ip") ?? null);
  const userAgent = h.get("user-agent");
  return { ip, userAgent };
}
