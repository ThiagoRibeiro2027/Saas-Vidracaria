// Trava: scripts de teste e de seed só podem rodar contra o banco LOCAL.
//
// Auditoria 12/10/2026, achado 12: testes rodados contra a nuvem deixaram 248
// empresas, 382 usuários e 11 platform_admins de teste (com senha fixa pública)
// no banco de produção. Este módulo é importado no topo de cada test-*.mjs e
// seed-*.mjs e encerra o processo se a URL (ou DATABASE_URL) não for local.
// Não há override por variável de ambiente de propósito: quem precisa de um
// script que toque a nuvem (limpeza, reset de senha, criar platform_admin) usa
// os scripts específicos, que pedem confirmação do host.

const LOCAIS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function hostDe(valor) {
  try { return new URL(valor).hostname; } catch { return null; }
}

for (const nome of ["NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL"]) {
  const valor = process.env[nome];
  if (!valor) continue;
  const host = hostDe(valor);
  if (!host || !LOCAIS.has(host)) {
    console.error(
      `\nRECUSADO: ${nome} aponta para "${host ?? "valor inválido"}", que não é um banco local.\n` +
      "Testes e seeds criam empresas e usuários com senha fixa e NUNCA devem rodar contra a nuvem.\n" +
      "Use o banco local: `npm test` (sobe o Supabase local e faz db reset) ou `supabase start`.\n",
    );
    process.exit(1);
  }
}
