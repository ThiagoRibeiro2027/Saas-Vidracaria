-- TÓPICO 13 — Integrações, Fase 3 (ADR-002 §4.17, emenda de 25/09/2026):
-- Webhooks recebidos de terceiros (§14, só a metade "recebidos" — envio de
-- webhook por este sistema e o motor de automação "Evento → Condição →
-- Ação" do próprio §14 continuam fora, sem aprovação). Cada integração
-- ativa pode ganhar um endpoint de entrada, autenticado por segredo
-- compartilhado (HMAC), cujos eventos caem na mesma fila com
-- idempotência/retry da Fase 1 — a UI da Fase 2 (Fila de operações) passa a
-- mostrar também o que chega de fora, sem nenhuma tela nova.
--
-- Proteções exigidas pelo §14 ("origem inválida, duplicidade, reutilização
-- indevida, eventos inválidos") e onde cada uma é resolvida:
--   - origem inválida：assinatura HMAC-SHA256 obrigatória (verificada em
--     src/app/api/webhooks/integracoes/[token]/route.ts, não aqui).
--   - duplicidade: chave_idempotencia (índice único já existente desde a
--     Fase 1) — o mesmo evento reenviado nunca duplica linha na fila.
--   - reutilização indevida (replay): assinatura cobre "timestamp.corpo",
--     não só o corpo — e o handler rejeita timestamp fora de uma janela de
--     tolerância (5 min), então uma requisição capturada não serve depois
--     dessa janela mesmo com a assinatura correta.
--   - eventos inválidos: handler exige JSON válido com campo de tipo antes
--     de chamar a função abaixo.
--
-- O segredo do webhook (public.integracao_webhooks.secret) é armazenado em
-- claro, não com hash — decisão deliberada, diferente de senha: HMAC exige
-- reproduzir a assinatura no recebimento, então o valor original tem que
-- estar disponível pro servidor, não só um hash unidirecional dele. A
-- proteção não é o hash, é o isolamento: RLS habilitada sem nenhuma policy
-- de SELECT (nem authenticated nem anon leem a tabela — só funções
-- SECURITY DEFINER abaixo tocam nela), e o valor em claro só é devolvido
-- uma vez, na hora de gerar/rotacionar (mesmo padrão de "mostrar a chave
-- só na criação" de API keys de mercado). Criptografia do valor em repouso
-- com uma chave de aplicação (KMS/pgsodium) fica para quando o projeto
-- adotar essa peça de infra — não existe hoje em nenhuma outra tabela do
-- projeto.
--
-- Checklist de segurança (auditoria 14/09/2026, CLAUDE.md): RLS habilitada
-- com teste de isolamento cross-tenant; gerar/desativar exigem
-- has_permission('integracoes','manage') via assert_tenant_write(), nunca
-- só RLS; obter_webhook_integracao() exige 'view' e nunca devolve o
-- segredo; registrar_operacao_webhook() é a única exceção documentada à
-- regra 1 (nunca aceitar company_id do cliente) porque não há sessão
-- nenhuma nesse caminho (chamada server-to-server por um terceiro) — o
-- company_id não vem de parâmetro, é derivado da própria integração
-- (FK imutável), o mesmo princípio da regra, aplicado sem current_
-- company_id() por não haver usuário autenticado; a função funciona só sob
-- service_role (revoke de anon/authenticated, grant só pra service_role —
-- mesmo padrão de find_orphaned_storage_objects,
-- 20260915030000_auditoria_15092026_p1.sql), nunca exposta ao usuário
-- final; SECURITY DEFINER com search_path=public em todas; teste negativo
-- (deny) cobre tanto permissão quanto a impossibilidade de um usuário
-- autenticado comum chamar registrar_operacao_webhook() diretamente.

create table public.integracao_webhooks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  integracao_id uuid not null unique references public.integracoes(id),
  token text not null unique,
  secret text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);
comment on table public.integracao_webhooks is
  'TÓPICO 13 §14, Fase 3 — um endpoint de webhook de entrada por integração. secret em claro (não hash — ver cabeçalho da migration), nunca exposto por SELECT: RLS sem nenhuma policy de leitura, só acessível via as funções SECURITY DEFINER desta migration.';
create index integracao_webhooks_company_id_idx on public.integracao_webhooks (company_id);

create trigger set_updated_at before update on public.integracao_webhooks
  for each row execute function public.set_updated_at();

alter table public.integracao_webhooks enable row level security;
-- Nenhuma policy de SELECT/INSERT/UPDATE/DELETE: RLS habilitada e sem
-- nenhuma regra permite tudo por padrão (deny-by-default do Postgres) —
-- nem o dono da empresa lê o segredo direto da tabela, só via
-- obter_webhook_integracao() (que nunca devolve secret) ou no retorno
-- único de gerar_webhook_integracao().
revoke all on public.integracao_webhooks from anon, authenticated;

-- =========================================================================
-- Gerar/rotacionar o webhook de uma integração — devolve o segredo em
-- claro só nesta chamada; nunca mais fica legível depois.
-- =========================================================================
create or replace function public.gerar_webhook_integracao(p_integracao_id uuid)
returns table (token text, secret text)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_integracao public.integracoes;
  v_token text;
  v_secret text;
begin
  select * into v_integracao from public.integracoes
  where id = p_integracao_id and company_id = v_company_id;
  if not found then
    raise exception 'Integração não encontrada nesta empresa.';
  end if;
  if v_integracao.status <> 'ativo' then
    raise exception 'Integração inativa: ative antes de gerar um webhook.';
  end if;

  -- gen_random_bytes vive no schema `extensions` (pgcrypto), fora do
  -- search_path=public desta função — precisa de qualificação explícita,
  -- diferente de gen_random_uuid() (nativo do pg_catalog, sempre visível).
  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.integracao_webhooks (company_id, integracao_id, token, secret, ativo, rotated_at)
  values (v_company_id, p_integracao_id, v_token, v_secret, true, now())
  on conflict (integracao_id) do update
    set token = excluded.token, secret = excluded.secret, ativo = true, rotated_at = now(), updated_at = now();

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description)
  values (v_company_id, auth.uid(), 'integracoes.webhook_gerado', 'integracao', p_integracao_id, v_integracao.apelido);

  return query select v_token, v_secret;
end;
$$;

grant execute on function public.gerar_webhook_integracao(uuid) to authenticated;

-- =========================================================================
-- Desativar (nunca apagar — mesmo espírito de desativar_integracao).
-- =========================================================================
create or replace function public.desativar_webhook_integracao(p_integracao_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.assert_tenant_write('integracoes', 'manage');
  v_row public.integracao_webhooks;
begin
  select * into v_row from public.integracao_webhooks
  where integracao_id = p_integracao_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Nenhum webhook configurado para esta integração.';
  end if;
  if not v_row.ativo then
    raise exception 'Webhook já está inativo.';
  end if;

  update public.integracao_webhooks set ativo = false where id = v_row.id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id)
  values (v_company_id, auth.uid(), 'integracoes.webhook_desativado', 'integracao', p_integracao_id);

  return p_integracao_id;
end;
$$;

grant execute on function public.desativar_webhook_integracao(uuid) to authenticated;

-- =========================================================================
-- Metadado seguro pra UI — nunca devolve secret.
-- =========================================================================
create or replace function public.obter_webhook_integracao(p_integracao_id uuid)
returns table (token text, ativo boolean, created_at timestamptz, rotated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.token, w.ativo, w.created_at, w.rotated_at
  from public.integracao_webhooks w
  where w.integracao_id = p_integracao_id
    and w.company_id = (select public.current_company_id())
    and (select public.has_permission('integracoes', 'view'));
$$;

grant execute on function public.obter_webhook_integracao(uuid) to authenticated;

-- =========================================================================
-- Recepção real do evento — chamada só pelo route handler (service_role),
-- nunca pelo usuário. Sem sessão: company_id vem da própria integração
-- (FK), nunca de parâmetro (ver nota de segurança no cabeçalho).
-- =========================================================================
create or replace function public.registrar_operacao_webhook(
  p_integracao_id uuid,
  p_tipo text,
  p_payload jsonb,
  p_chave_idempotencia text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_integracao public.integracoes;
  v_id uuid;
begin
  if p_tipo is null or btrim(p_tipo) = '' then
    raise exception 'Tipo do evento é obrigatório.';
  end if;
  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'Chave de idempotência é obrigatória para webhook.';
  end if;

  select * into v_integracao from public.integracoes where id = p_integracao_id;
  if not found or v_integracao.status <> 'ativo' then
    raise exception 'Integração inexistente ou inativa.';
  end if;

  if not exists (
    select 1 from public.integracao_webhooks
    where integracao_id = p_integracao_id and ativo = true
  ) then
    raise exception 'Webhook não configurado ou inativo para esta integração.';
  end if;

  if exists (
    select 1 from public.integracao_operacoes
    where company_id = v_integracao.company_id and chave_idempotencia = p_chave_idempotencia
  ) then
    select id into v_id from public.integracao_operacoes
    where company_id = v_integracao.company_id and chave_idempotencia = p_chave_idempotencia;
    return v_id;
  end if;

  insert into public.integracao_operacoes (
    company_id, integracao_id, origem, tipo, chave_idempotencia, payload
  ) values (
    v_integracao.company_id, p_integracao_id, 'webhook', p_tipo, p_chave_idempotencia, p_payload
  )
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    v_integracao.company_id, null, 'integracoes.webhook_recebido', 'integracao_operacao', v_id, p_tipo,
    jsonb_build_object('integracao_id', p_integracao_id)
  );

  return v_id;
end;
$$;

-- Só service_role — este é o caso que a regra 1 do CLAUDE.md descreve como
-- exceção documentada: sem sessão de usuário, então sem authenticated.
revoke all on function public.registrar_operacao_webhook(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.registrar_operacao_webhook(uuid, text, jsonb, text) to service_role;
