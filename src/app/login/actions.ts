"use server";

import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getClientContext } from "@/lib/audit/log";

// Mensagem única para qualquer falha de login (empresa, matrícula ou senha
// incorretos) — evita enumeração de empresas/usuários (Prompt Mestre:
// "proteção contra enumeração").
const GENERIC_ERROR = "Empresa, matrícula/e-mail ou senha inválidos.";

// Mensagem do rate limit (SEC-010) é deliberadamente distinta da genérica
// acima: informar "muitas tentativas" não confirma se a conta existe (quem
// está gerando as tentativas já sabe o identificador que está testando) —
// só o resultado de cada tentativa individual precisa ficar genérico.
const LOCKED_ERROR = "Muitas tentativas de login. Tente novamente em alguns minutos.";

// ADR-010 §6 / Security Gate Fase 8, item 2.1: o identificador digitado no
// login pode ser e-mail real — nunca gravar em texto puro num log que não
// tem user_id (e por isso nunca passa por anonymize_activity_logs_for_user()).
// Hash estável (sem salt) preserva a única utilidade real do campo — agrupar
// tentativas para detecção de força bruta/rate limiting — sem reter o valor
// em claro.
function hashIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier).digest("hex").slice(0, 32);
}

// Security Gate Fase 8 (SEC-010): 5 tentativas falhas em 15 minutos travam
// por 30 minutos — por identificador de conta E por IP, independentemente
// um do outro (Prompt Mestre item 26: "não depender exclusivamente de
// IP" — evita tanto um IP atacando várias contas quanto uma conta sendo
// atacada de vários IPs). Reaproveita as linhas de auth.login_failed que
// já existiam em activity_logs (identifier_hash em metadata, ip_address na
// coluna própria) em vez de criar uma tabela de estado nova.
const LOGIN_LOCKOUT = {
  windowMinutes: 15,
  maxAttempts: 5,
  lockoutMinutes: 30,
} as const;

function isLockedByRecentFailures(failureTimestamps: string[]): boolean {
  if (failureTimestamps.length < LOGIN_LOCKOUT.maxAttempts) return false;
  // Consultas abaixo já vêm ordenadas created_at desc — o último elemento
  // das 5 mais recentes é o momento em que o limite foi cruzado.
  const thresholdCrossedAt = new Date(failureTimestamps[failureTimestamps.length - 1]).getTime();
  const lockedUntil = thresholdCrossedAt + LOGIN_LOCKOUT.lockoutMinutes * 60_000;
  return Date.now() < lockedUntil;
}

async function isLoginLocked(identifierHash: string, ip: string | null): Promise<boolean> {
  const admin = createAdminClient();
  const windowStart = new Date(Date.now() - LOGIN_LOCKOUT.windowMinutes * 60_000).toISOString();

  const byAccountQuery = admin
    .from("activity_logs")
    .select("created_at")
    .eq("action", "auth.login_failed")
    .eq("metadata->>identifier_hash", identifierHash)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(LOGIN_LOCKOUT.maxAttempts);

  const byIpQuery = ip
    ? admin
        .from("activity_logs")
        .select("created_at")
        .eq("action", "auth.login_failed")
        .eq("ip_address", ip)
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(LOGIN_LOCKOUT.maxAttempts)
    : null;

  const [byAccount, byIp] = await Promise.all([byAccountQuery, byIpQuery ?? Promise.resolve({ data: [] })]);

  return (
    isLockedByRecentFailures((byAccount.data ?? []).map((r) => r.created_at)) ||
    isLockedByRecentFailures((byIp.data ?? []).map((r) => r.created_at))
  );
}

// Registrado à parte de auth.login_failed (não conta pro limite acima) —
// só para dar visibilidade na auditoria de quantas tentativas foram
// efetivamente bloqueadas pelo rate limit, sem fazer o bloqueio se
// realimentar indefinidamente a cada nova tentativa recusada.
async function logLoginBlocked(identifier: string) {
  const { ip, userAgent } = await getClientContext();
  const admin = createAdminClient();
  await admin.from("activity_logs").insert({
    company_id: null,
    user_id: null,
    action: "auth.login_blocked",
    entity_type: "auth",
    metadata: { identifier_hash: hashIdentifier(identifier) },
    ip_address: ip,
    user_agent: userAgent,
  });
}

// Sem sessão (a tentativa falhou), log_client_event() não pode ser chamada —
// exige o papel `authenticated`. A gravação usa a service role direto,
// mesmo padrão já estabelecido para operações sem usuário autenticado
// (Auditoria Fase 1, item 02) — nunca grava senha nem identificador em claro,
// só o hash dele (Prompt Mestre item 18: nada de senhas/tokens/secrets nos
// logs; ADR-010 §6: nada de PII em claro fora do alcance da anonimização).
async function logLoginFailure(
  companyId: string | null,
  identifier: string,
  extra: Record<string, unknown> = {},
) {
  const { ip, userAgent } = await getClientContext();
  const admin = createAdminClient();
  await admin.from("activity_logs").insert({
    company_id: companyId,
    user_id: null,
    action: "auth.login_failed",
    entity_type: "auth",
    metadata: { identifier_hash: hashIdentifier(identifier), ...extra },
    ip_address: ip,
    user_agent: userAgent,
  });
}

// Aqui já existe sessão (login acabou de suceder no mesmo `supabase`
// client), então passa pela função de auditoria normal.
async function logLoginSuccess(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { ip, userAgent } = await getClientContext();
  await supabase.rpc("log_client_event", {
    p_action: "auth.login_success",
    p_entity_type: "auth",
    p_entity_id: null,
    p_ip_address: ip,
    p_user_agent: userAgent,
  });
}

export async function signInAction(
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const companySlug = String(formData.get("company") ?? "").trim().toLowerCase();
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return { error: GENERIC_ERROR };
  }

  const identifierHash = hashIdentifier(identifier);
  const { ip: currentIp } = await getClientContext();
  if (await isLoginLocked(identifierHash, currentIp)) {
    await logLoginBlocked(identifier);
    return { error: LOCKED_ERROR };
  }

  const supabase = await createClient();

  // Administrador de plataforma (ADR-001 §6-8): não pertence a nenhuma
  // empresa, então não há matrícula/company a resolver — usa o e-mail real
  // diretamente. Campo "Empresa" fica vazio nesse caso.
  if (!companySlug) {
    if (!identifier.includes("@")) return { error: GENERIC_ERROR };
    const { error } = await supabase.auth.signInWithPassword({
      email: identifier,
      password,
    });
    if (error) {
      await logLoginFailure(null, identifier);
      return { error: GENERIC_ERROR };
    }
    await logLoginSuccess(supabase);
    redirect("/");
  }

  // Usuário de tenant: resolver empresa + matrícula -> e-mail técnico do
  // Supabase Auth exige bypass de RLS (ainda não há sessão) — uso legítimo
  // e restrito da service role, só de leitura, só para esta resolução
  // (decisão registrada na Auditoria Fase 1, item 02).
  const admin = createAdminClient();

  const { data: company } = await admin
    .from("companies")
    .select("id")
    .eq("slug", companySlug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!company) {
    await logLoginFailure(null, identifier, { company_slug: companySlug });
    return { error: GENERIC_ERROR };
  }

  const isEmail = identifier.includes("@");
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("company_id", company.id)
    .eq(isEmail ? "contact_email" : "login_identifier", identifier)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!profile) {
    await logLoginFailure(company.id, identifier);
    return { error: GENERIC_ERROR };
  }

  const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
  if (!authUser?.user?.email) {
    await logLoginFailure(company.id, identifier);
    return { error: GENERIC_ERROR };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: authUser.user.email,
    password,
  });

  if (error) {
    await logLoginFailure(company.id, identifier);
    return { error: GENERIC_ERROR };
  }

  await logLoginSuccess(supabase);
  redirect("/");
}

export async function signOutAction() {
  const supabase = await createClient();
  // Precisa acontecer ANTES do signOut: log_client_event() exige o papel
  // `authenticated`, que deixa de valer assim que a sessão é encerrada.
  const { ip, userAgent } = await getClientContext();
  await supabase.rpc("log_client_event", {
    p_action: "auth.logout",
    p_entity_type: "auth",
    p_entity_id: null,
    p_ip_address: ip,
    p_user_agent: userAgent,
  });
  await supabase.auth.signOut();
  redirect("/login");
}
