-- SIMULAÇÃO (somente leitura): o que a limpeza apagaria, por tabela.
-- Mantém só a empresa de slug 'jrbox'. Termina com ROLLBACK.
-- Uso: npx supabase db query --linked -f scripts/limpeza/01-simulacao.sql
begin;
create temp table _plano (tabela text, apagar bigint, manter bigint) on commit drop;
do $$
declare
  v_keep uuid := (select id from public.companies where slug = 'jrbox');
  r record; v_apagar bigint; v_manter bigint;
begin
  if v_keep is null then raise exception 'Empresa jrbox não encontrada — nada a simular.'; end if;
  for r in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'company_id' and t.table_type = 'BASE TABLE'
    order by c.table_name
  loop
    execute format('select count(*) filter (where company_id <> %L), count(*) filter (where company_id = %L) from public.%I', v_keep, v_keep, r.table_name)
      into v_apagar, v_manter;
    if v_apagar > 0 or v_manter > 0 then insert into _plano values (r.table_name, v_apagar, v_manter); end if;
  end loop;
  insert into _plano select 'platform_admins (todos)', count(*), 0 from public.platform_admins;
  insert into _plano select 'auth.users (sem perfil jrbox)', count(*), (select count(*) from public.profiles where company_id = v_keep)
    from auth.users where id not in (select id from public.profiles where company_id = v_keep);
end $$;
select tabela, apagar, manter from _plano order by apagar desc limit 40;
rollback;
