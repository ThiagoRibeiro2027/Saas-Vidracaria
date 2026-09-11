-- Fase 2 — resolve as pendências levantadas na primeira entrega da
-- Fundação de Segurança: MFA obrigatório para platform_admins (ADR-001
-- §26) e troca de senha forçada no primeiro acesso.

alter table public.profiles
  add column must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'Verdadeiro quando a senha atual foi definida por outra pessoa (bootstrap/reset administrativo) e ainda não foi trocada pelo próprio usuário.';

-- Único caminho de escrita desta flag para o próprio usuário — mantém a
-- regra de que profiles não recebe UPDATE direto do papel authenticated.
create or replace function public.complete_password_change()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
  set must_change_password = false
  where id = auth.uid();

  perform public.log_activity(
    'auth.password_changed', 'profile', auth.uid(),
    'Usuário concluiu a troca de senha obrigatória.'
  );
end;
$$;

grant execute on function public.complete_password_change() to authenticated;
