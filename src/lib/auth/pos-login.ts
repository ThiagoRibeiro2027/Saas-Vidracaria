export const POS_LOGIN_COOKIE = "pos_login";

// Só caminho interno do próprio site: começa com uma única "/", não é a tela
// de login nem protocolo/host disfarçado ("//evil.com", "/\evil.com").
export function destinoPosLoginSeguro(valor: string | undefined | null): string {
  if (!valor || valor.length > 500) return "/";
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) return "/";
  if (valor.startsWith("/login")) return "/";
  return valor;
}
