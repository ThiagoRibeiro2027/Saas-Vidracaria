// Política de senha — fonte ÚNICA no código do app.
//
// Auditoria TR Systems (12/10/2026): o app tinha três valores diferentes
// (10 na troca de senha, 8 na criação e na redefinição pelo admin) e o
// comentário de change-password/actions.ts afirmava que o GoTrue "rejeita
// mesmo se este valor divergisse" por causa do config.toml. Isso só vale para
// o banco LOCAL: na nuvem o mínimo é uma configuração do projeto (painel,
// Authentication) separada do config.toml, e estava em 6. O app é, portanto, a
// única barreira garantida — e precisa de um número só.
//
// MANTER IGUAL a `minimum_password_length` em supabase/config.toml e na
// configuração do projeto na nuvem (verificar com `supabase config diff`).
// scripts/test-password-policy.mjs falha se o código e o config.toml divergirem.
export const MIN_PASSWORD_LENGTH = 10;

// Composição exigida. Na nuvem o GoTrue está com
// `password_requirements = lower_upper_letters_digits_symbols`: sem espelhar a
// regra aqui, uma senha de 10 letras minúsculas passa no app e é recusada pelo
// Auth com um erro genérico. Mesmos conjuntos de caracteres do GoTrue (ASCII).
// O config.toml local fica sem exigir composição de propósito — as fixtures dos
// testes criam usuários com senha só de minúsculas/dígitos.
export const PASSWORD_RULE_HINT = `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres, com letra maiúscula, letra minúscula, número e símbolo.`;

const SYMBOLS = /[!@#$%^&*()_+\-=[\]{};':"\\|<>?,./`~]/;

/** Devolve a mensagem de erro (para exibir ao usuário) ou null se a senha é válida. */
export function validatePassword(password: string): string | null {
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !SYMBOLS.test(password)
  ) {
    return `Senha fraca. ${PASSWORD_RULE_HINT}`;
  }
  return null;
}
