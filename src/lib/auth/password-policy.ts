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
