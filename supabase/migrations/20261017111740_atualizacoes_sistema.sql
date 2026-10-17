-- Sistema de atualizações (changelog) — desenho aprovado em conversa com o
-- usuário, 17/10/2026: histórico de mudanças do produto, visível a todos os
-- usuários de todas as empresas, mas só publicável por quem administra a
-- plataforma (não é dado de uma empresa específica — company_id fica de
-- fora de propósito, igual ao padrão já usado em tabelas globais do SaaS).
--
-- Conteúdo é escrito manualmente pelo platform admin direto na tela (não
-- puxado automaticamente de commits do Git) — por isso os RPCs de escrita,
-- não só uma função de leitura.

create table public.atualizacoes_sistema (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text not null,
  publicado_em date not null default current_date,
  -- Quem publica é sempre um platform admin (ADR-001 §6-8: platform_admins é
  -- tabela separada de profiles, nunca inferir uma a partir da outra).
  criado_por uuid references public.platform_admins(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.atualizacoes_sistema is 'Changelog do produto — nível de plataforma, sem company_id. Escrita só por is_platform_admin_mfa_verified(); leitura por qualquer usuário autenticado (deleted_at is null).';
create index atualizacoes_sistema_publicado_em_idx on public.atualizacoes_sistema (publicado_em desc) where deleted_at is null;

create trigger set_updated_at before update on public.atualizacoes_sistema
  for each row execute function public.set_updated_at();

alter table public.atualizacoes_sistema enable row level security;

-- Leitura: qualquer usuário autenticado, de qualquer empresa — não há
-- isolamento por tenant aqui porque o conteúdo não pertence a nenhuma
-- empresa, é sobre o próprio SaaS.
create policy atualizacoes_sistema_select on public.atualizacoes_sistema for select
  using (deleted_at is null);

grant select on public.atualizacoes_sistema to authenticated;
-- Sem policy de insert/update/delete pra authenticated — escrita só pelos
-- RPCs abaixo (security definer, gate de platform admin).

create or replace function public.criar_atualizacao_sistema(
  p_titulo text,
  p_descricao text,
  p_publicado_em date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_platform_admin_mfa_verified() then
    raise exception 'Sem permissão para publicar atualizações do sistema.';
  end if;
  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'Título é obrigatório.';
  end if;
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição é obrigatória.';
  end if;

  insert into public.atualizacoes_sistema (titulo, descricao, publicado_em, criado_por)
  values (p_titulo, p_descricao, coalesce(p_publicado_em, current_date), auth.uid())
  returning id into v_id;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (
    null, auth.uid(), 'platform.changelog_criado', 'atualizacao_sistema', v_id, p_titulo,
    jsonb_build_object('publicado_em', coalesce(p_publicado_em, current_date))
  );

  return v_id;
end;
$$;

grant execute on function public.criar_atualizacao_sistema(text, text, date) to authenticated;

create or replace function public.editar_atualizacao_sistema(
  p_id uuid,
  p_titulo text,
  p_descricao text,
  p_publicado_em date
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin_mfa_verified() then
    raise exception 'Sem permissão para editar atualizações do sistema.';
  end if;
  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'Título é obrigatório.';
  end if;
  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'Descrição é obrigatória.';
  end if;

  update public.atualizacoes_sistema set
    titulo = p_titulo, descricao = p_descricao, publicado_em = coalesce(p_publicado_em, publicado_em)
  where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Atualização não encontrada.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (null, auth.uid(), 'platform.changelog_editado', 'atualizacao_sistema', p_id, p_titulo, '{}'::jsonb);
end;
$$;

grant execute on function public.editar_atualizacao_sistema(uuid, text, text, date) to authenticated;

create or replace function public.remover_atualizacao_sistema(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin_mfa_verified() then
    raise exception 'Sem permissão para remover atualizações do sistema.';
  end if;

  update public.atualizacoes_sistema set deleted_at = now()
  where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Atualização não encontrada.';
  end if;

  insert into public.activity_logs (company_id, user_id, action, entity_type, entity_id, description, metadata)
  values (null, auth.uid(), 'platform.changelog_removido', 'atualizacao_sistema', p_id, null, '{}'::jsonb);
end;
$$;

grant execute on function public.remover_atualizacao_sistema(uuid) to authenticated;
