-- EXECUÇÃO REAL e IRREVERSÍVEL: apaga todas as empresas, dados e platform_admins,
-- exceto a empresa de slug 'jrbox'. Roda numa transação única: qualquer falha
-- desfaz tudo.
--
-- Como o banco é imutável de propósito (trigger em activity_logs) e tem ~126 FKs
-- sem cascata, a transação usa session_replication_role = replica (só dentro
-- desta transação, `set local`) para ignorar triggers e FKs durante o apagamento.
-- Depois confere o resultado e ABORTA se algo estiver fora do esperado.
--
-- NÃO apaga: dados da empresa jrbox, planos, permissões e papéis-modelo globais.
-- Os usuários do Auth e os arquivos do Storage são apagados por
-- scripts/limpeza/03-auth-storage.mjs, DEPOIS deste arquivo.
--
-- Uso: npx supabase db query --linked -f scripts/limpeza/02-executar.sql
begin;
set local session_replication_role = replica;

do $$
declare
  v_keep uuid := (select id from public.companies where slug = 'jrbox');
  r record;
begin
  if v_keep is null then raise exception 'Empresa jrbox não encontrada — abortando.'; end if;

  -- 1) todas as tabelas com company_id (exceto companies): apaga o que não é da jrbox
  for r in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'company_id' and t.table_type = 'BASE TABLE'
      and c.table_name <> 'companies'
  loop
    execute format('delete from public.%I where company_id <> %L', r.table_name, v_keep);
  end loop;

  -- 2) administradores de plataforma de teste (todos). Um novo é criado depois,
  --    com senha forte e MFA.
  delete from public.platform_admins;

  -- 3) trilha que sobrou sem dono (eventos de plataforma): desvincula usuários que
  --    vão deixar de existir, para não bloquear a exclusão no Auth.
  update public.activity_logs set user_id = null
  where user_id is not null and user_id not in (select id from public.profiles);
  update public.files set uploaded_by = null where uploaded_by is not null and uploaded_by not in (select id from public.profiles);
  update public.files set deleted_by = null where deleted_by is not null and deleted_by not in (select id from public.profiles);

  -- 4) as empresas
  delete from public.companies where id <> v_keep;
end $$;

-- Conferência: aborta (e desfaz tudo) se o resultado não for o esperado.
do $$
declare v_n int;
begin
  select count(*) into v_n from public.companies;
  if v_n <> 1 then raise exception 'LIMPEZA ABORTADA: esperava 1 empresa, ficaram %', v_n; end if;
  if not exists (select 1 from public.companies where slug = 'jrbox') then raise exception 'LIMPEZA ABORTADA: jrbox sumiu'; end if;
  select count(*) into v_n from public.profiles where company_id <> (select id from public.companies where slug = 'jrbox');
  if v_n <> 0 then raise exception 'LIMPEZA ABORTADA: perfis de outras empresas ficaram (%)', v_n; end if;
  select count(*) into v_n from public.platform_admins;
  if v_n <> 0 then raise exception 'LIMPEZA ABORTADA: platform_admins ficaram (%)', v_n; end if;
  if (select count(*) from public.profiles) < 1 then raise exception 'LIMPEZA ABORTADA: perfis da jrbox sumiram'; end if;
end $$;

select (select count(*) from public.companies) as empresas,
       (select count(*) from public.profiles) as perfis,
       (select count(*) from public.activity_logs) as logs,
       (select count(*) from public.platform_admins) as platform_admins;
commit;
