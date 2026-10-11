-- Achado da auditoria de gaps ADR-001 a ADR-012 (11/10/2026): o
-- escritório não tinha como ver qual instalador está com o celular
-- atrasado pra sincronizar. sync_operations (20260916010000) já registra
-- quando uma AÇÃO de campo é enviada, mas não quando o PACOTE é baixado
-- (pacote_offline_instalacoes()) — o "syncedAt" que decide o bloqueio
-- local (ADR-005 §8/§9, src/lib/offline/validade.ts) nunca sai do
-- IndexedDB do aparelho. Sem isso, um celular com fila vazia mas pacote
-- local velho aparecia "em dia" pra qualquer visão só de sync_operations.
--
-- Tabela dedicada (não reaproveitar sync_operations): o pacote é baixado
-- de novo a cada 60s enquanto o app de campo está aberto e online
-- (retry do ADR-005 §28, CampoProvider.tsx) — inserir uma linha nova a
-- cada tentativa inflaria sync_operations (criado pra deduplicar AÇÕES
-- de campo, não pra um heartbeat de alta frequência) sem necessidade:
-- só o timestamp MAIS RECENTE importa pra visibilidade do escritório, daí
-- "upsert por profile_id", não um log de todas as tentativas.
create table public.offline_pull_status (
  profile_id uuid primary key references public.profiles(id),
  company_id uuid not null references public.companies(id),
  last_synced_at timestamptz not null,
  updated_at timestamptz not null default now()
);
comment on table public.offline_pull_status is
  'ADR-005 §28 / visibilidade de sync pro escritório — 1 linha por usuário de campo, sempre sobrescrita com o timestamp (server_now()) do último pacote_offline_instalacoes() bem-sucedido. Nunca histórico, só "quando foi a última vez".';
create index offline_pull_status_company_id_idx on public.offline_pull_status (company_id);

alter table public.offline_pull_status enable row level security;
create policy offline_pull_status_select on public.offline_pull_status for select
  using (company_id = (select public.current_company_id()));
grant select on public.offline_pull_status to authenticated;

create or replace function public.registrar_sincronizacao_offline(p_synced_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;
  if p_synced_at is null then
    raise exception 'Horário de sincronização é obrigatório.';
  end if;

  insert into public.offline_pull_status (profile_id, company_id, last_synced_at, updated_at)
  values (auth.uid(), v_company_id, p_synced_at, now())
  on conflict (profile_id) do update set last_synced_at = excluded.last_synced_at, updated_at = now();
end;
$$;

grant execute on function public.registrar_sincronizacao_offline(timestamptz) to authenticated;
