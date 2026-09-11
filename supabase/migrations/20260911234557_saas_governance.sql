-- Fase 6 — SaaS Governance
-- ADR-006 (Modelo Comercial) v2.0 + Prompt Mestre de Segurança itens 22-24.
--
-- IMPORTANTE — o que este migration NÃO faz, deliberadamente:
-- ADR-006 §3.3/§4 e sua Prompt Final de Implementação §22-23 são explícitos:
-- "a composição definitiva de cada plano" (nomes, limites, preços) e a
-- "duração do trial e política definitiva de inadimplência" são decisões
-- comerciais ainda não tomadas, e "nenhuma dessas definições deve ser
-- inventada durante a implementação; quando necessárias, devem ser
-- registradas como decisão futura formal". Por isso:
--   - nenhum plano com nome/limite comercial "de verdade" é semeado aqui;
--   - o único plano criado (PILOTO) é explicitamente um placeholder sem
--     limites, só para o tenant do piloto (JR Box) ter uma assinatura
--     funcional enquanto o modelo comercial não é formalizado;
--   - não há duração de trial nem prazo de tolerância (grace period)
--     hardcoded — os campos existem e ficam nulos até serem configurados.
-- ADR-006 §3.25 confirma que gateway de pagamento real, planos comerciais
-- completos e automações financeiras NÃO são requisito do MVP — só a
-- arquitetura extensível.

-- =========================================================================
-- 1. PLANOS — catálogo, nunca hardcoded como enum de aplicação
-- =========================================================================

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  max_users integer, -- null = sem limite definido/ilimitado
  max_storage_bytes bigint, -- null = sem limite definido/ilimitado
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.plans is
  'Catálogo de planos comerciais. ADR-006 §3.3/§4: composição definitiva (nomes, limites, preços) é decisão comercial ainda não tomada — não inventar números aqui.';

-- =========================================================================
-- 2. ASSINATURAS ("contratação", ADR-006 §3.2) — entidade própria,
--    deliberadamente separada de companies.status (Fase 2). companies.status
--    é o ciclo de vida de EXISTÊNCIA do tenant (ativa/cancelamento/
--    suspensa/retenção/exclusão); subscriptions.status é o ciclo de vida
--    COMERCIAL (trial/ativo/inadimplente/suspenso/cancelado/expirado).
--    ADR-006 §3: "Nenhuma camada poderá ser usada para fazer o papel de
--    outra" — nunca fundir as duas.
-- =========================================================================

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id),
  plan_id uuid references public.plans(id),
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'suspended', 'canceled', 'expired')),
  trial_ends_at timestamptz, -- null = sem trial definido (ADR-006: duração ainda não decidida)
  past_due_since timestamptz,
  grace_period_days integer, -- null = tolerância ainda não configurada (não inventar um número)
  suspended_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.subscriptions is
  'Contratação/assinatura do tenant (ADR-006 §3.2, §3.6). Estados: trial→active→past_due→suspended→canceled→expired. Transições sempre via transition_subscription(), nunca direto — ADR-006: "centralizado, nunca disperso pelos módulos operacionais".';

-- =========================================================================
-- 3. FUNÇÕES
-- =========================================================================

-- Única via de transição de status — auditável e centralizada (ADR-006).
-- Só platform_admin: hoje não existe gateway de pagamento real (ADR-006
-- §3.25 tira isso do escopo do MVP), então toda mudança de status é uma
-- decisão administrativa manual, nunca automática vinda de webhook.
create or replace function public.transition_subscription(
  p_company_id uuid,
  p_new_status text,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Apenas administradores de plataforma podem alterar o status de assinatura.';
  end if;
  if p_new_status not in ('trial', 'active', 'past_due', 'suspended', 'canceled', 'expired') then
    raise exception 'Status de assinatura inválido: %', p_new_status;
  end if;

  select status into v_old_status from public.subscriptions where company_id = p_company_id;
  if v_old_status is null then
    raise exception 'Empresa % não possui assinatura.', p_company_id;
  end if;

  update public.subscriptions
  set
    status = p_new_status,
    past_due_since = case when p_new_status = 'past_due' then now() else past_due_since end,
    suspended_at = case when p_new_status = 'suspended' then now() else suspended_at end,
    canceled_at = case when p_new_status = 'canceled' then now() else canceled_at end,
    updated_at = now()
  where company_id = p_company_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    p_company_id, auth.uid(), 'governance.subscription_transitioned', 'subscription', p_company_id,
    p_reason, jsonb_build_object('from', v_old_status, 'to', p_new_status)
  );
end;
$$;

grant execute on function public.transition_subscription(uuid, text, text) to authenticated;

-- Checagem centralizada de bloqueio por suspensão (política definida pelo
-- responsável do produto na Fase 6: SUSPENSA bloqueia escrita, mantém
-- leitura/exportação). Chamada pelas funções de escrita de negócio — hoje
-- só register_file(); novos módulos operacionais devem chamar esta mesma
-- função em vez de duplicar a checagem (ADR-006: "centralizado").
create or replace function public.assert_company_not_suspended()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    return; -- platform_admin ou sem empresa: regra não se aplica
  end if;
  if exists (
    select 1 from public.subscriptions
    where company_id = v_company_id and status = 'suspended'
  ) then
    raise exception 'Empresa suspensa por pendência comercial: novas operações de escrita estão bloqueadas até a regularização. Leitura e exportação continuam disponíveis.';
  end if;
end;
$$;

grant execute on function public.assert_company_not_suspended() to authenticated;

-- register_file() (Fase 3) passa a checar suspensão antes de gravar.
create or replace function public.register_file(
  p_entity_type text,
  p_entity_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_width integer default null,
  p_height integer default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_id uuid;
begin
  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada não pode registrar arquivos.';
  end if;
  if not public.has_permission('files', 'upload') then
    raise exception 'Sem permissão para enviar arquivos.';
  end if;
  perform public.assert_company_not_suspended();
  if split_part(p_storage_path, '/', 1) <> v_company_id::text then
    raise exception 'Caminho de armazenamento fora do escopo da empresa.';
  end if;

  insert into public.files (
    company_id, uploaded_by, entity_type, entity_id, storage_path,
    original_name, mime_type, size_bytes, width, height
  ) values (
    v_company_id, auth.uid(), p_entity_type, p_entity_id, p_storage_path,
    p_original_name, p_mime_type, p_size_bytes, p_width, p_height
  ) returning id into v_id;

  perform public.log_activity(
    'file.upload', 'file', v_id, p_original_name,
    jsonb_build_object('mime_type', p_mime_type, 'size_bytes', p_size_bytes)
  );

  return v_id;
end;
$$;

-- Monitoramento de consumo (item 24): contratado → utilizado → disponível.
-- LEFT JOIN deliberado: empresa sem assinatura/plano ainda retorna uso
-- zerado em vez de erro (ex.: tenants de script de teste).
create or replace function public.company_usage(p_company_id uuid default null)
returns table (
  company_id uuid,
  user_count bigint,
  active_user_count bigint,
  storage_bytes_used bigint,
  file_count bigint,
  plan_name text,
  max_users integer,
  max_storage_bytes bigint,
  subscription_status text
)
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
begin
  if p_company_id is null then
    v_company_id := public.current_company_id();
  elsif p_company_id = public.current_company_id() or public.is_platform_admin() then
    v_company_id := p_company_id;
  else
    raise exception 'Sem permissão para consultar consumo de outra empresa.';
  end if;

  if v_company_id is null then
    raise exception 'Nenhuma empresa informada nem associada ao usuário atual.';
  end if;

  -- Subqueries qualificadas com alias: o parâmetro de saída "company_id" da
  -- própria função (returns table) entra em escopo no corpo do plpgsql e,
  -- sem alias, colide com a coluna company_id das tabelas ("ambiguous").
  return query
  select
    v_company_id,
    (select count(*) from public.profiles pr where pr.company_id = v_company_id and pr.deleted_at is null),
    (select count(*) from public.profiles pr where pr.company_id = v_company_id and pr.deleted_at is null and pr.active = true),
    coalesce((select sum(f.size_bytes) from public.files f where f.company_id = v_company_id and f.deleted_at is null), 0)::bigint,
    (select count(*) from public.files f where f.company_id = v_company_id and f.deleted_at is null),
    p.name,
    p.max_users,
    p.max_storage_bytes,
    s.status
  from (select v_company_id as id) c
  left join public.subscriptions s on s.company_id = c.id
  left join public.plans p on p.id = s.plan_id;
end;
$$;

grant execute on function public.company_usage(uuid) to authenticated;

-- =========================================================================
-- 4. RLS
-- =========================================================================

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

create policy plans_select on public.plans for select
  using (true); -- catálogo global, não contém dado de tenant

create policy subscriptions_select on public.subscriptions for select
  using (company_id = public.current_company_id() or public.is_platform_admin());

-- Sem policy de INSERT/UPDATE/DELETE para authenticated: planos são
-- provisionados por script administrativo (service role); assinaturas só
-- mudam via transition_subscription() (SECURITY DEFINER acima).

revoke all on public.plans, public.subscriptions from anon, authenticated;
grant select on public.plans, public.subscriptions to authenticated;

create trigger set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 5. PLANO PLACEHOLDER DO PILOTO — não é uma definição comercial (ver
--    comentário no topo do arquivo), só o mínimo para o tenant já
--    operacional (JR Box, ADR-003) ter uma assinatura funcional.
-- =========================================================================

insert into public.plans (key, name, max_users, max_storage_bytes, active)
values ('piloto', 'Piloto (sem limites comerciais definidos — ADR-006 pendente)', null, null, true)
on conflict (key) do nothing;
