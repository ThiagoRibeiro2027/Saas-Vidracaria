-- Auditoria TR Systems (12/10/2026) — achado 4: EXECUTE aberto a PUBLIC/anon.
--
-- PROBLEMA. O Postgres concede EXECUTE a PUBLIC por padrão em toda função
-- nova. O reset de 20260914090000 fez `revoke ... from public` em todas as
-- funções que EXISTIAM naquele dia e `alter default privileges IN SCHEMA
-- public revoke ... from public/anon/authenticated`. O segundo comando não
-- faz o que parece: o PUBLIC=EXECUTE vem do default GLOBAL do Postgres, e
-- `in schema public` só mexe nas entradas específicas do schema — não
-- remove o default global. Resultado: toda função criada depois de 14/09
-- nasceu com PUBLIC=X (visto no proacl: `{=X/postgres,...}`). No banco
-- local, 325 de 387 funções de `public` estavam executáveis por `anon`
-- (371 por `authenticated`). Já tinham sido corrigidos casos isolados
-- (20260916040000 sync_claim; 20261010005300 evento_integracao_interno),
-- sempre função por função — este arquivo fecha a classe inteira.
--
-- IMPACTO REAL (provado no banco local, em transação revertida): sem login,
-- com só a anon key, `rpc/log_system_event` aceitou `p_company_id` de OUTRA
-- empresa e gravou o evento nela. Outras funções internas aceitam
-- `p_company_id` do cliente e não checam identidade no corpo
-- (submeter_aprovacao_compra/financeiro, criar_op_lote_operacoes,
-- calcular_necessidade_liquida_item) — CLAUDE.md regras 1 e 7.
--
-- O QUE ESTE ARQUIVO FAZ
--  1. Fecha o default global: função nova criada pelo `postgres` nasce SEM
--     EXECUTE para PUBLIC/anon/authenticated. Toda função nova passa a exigir
--     `grant execute ... to authenticated` explícito (regra 7).
--  2. Tira EXECUTE de PUBLIC e anon de TODAS as funções de `public`.
--  3. Preserva `authenticated` exatamente onde ele tem hoje (inclusive o que
--     vinha por PUBLIC), COM duas exceções deliberadas:
--       a) funções de trigger (o EXECUTE só é checado no CREATE TRIGGER);
--       b) a lista de INTERNAS abaixo — só chamadas por outras funções
--          SECURITY DEFINER (que rodam como dono e não dependem do grant),
--          nunca por cliente. Verificado em 12/10/2026: nenhuma é chamada
--          pelo app (src/), por teste via rpc, por policy ou por função
--          SECURITY INVOKER.
--  4. Garante `service_role` (Supabase Admin API / crons) em todas.
--  5. Se algo sair diferente do esperado, a própria migration aborta (e o
--     `db push` desfaz tudo) — ver as verificações no fim.
--
-- NÃO MUDA o corpo de nenhuma função. Fora do escopo, registrado como
-- achado 5: log_system_event() continua chamável por `authenticated` (o
-- test-governance exige isso) mas ainda confia em p_company_id do cliente;
-- precisa de reescrita do corpo (current_company_id()), não só de grant.
--
-- COMO REVERTER (não recomendado — reabre o achado): refazer
--   grant execute on all functions in schema public to authenticated;
--   grant execute on all functions in schema public to anon;
-- e `alter default privileges for role postgres grant execute on functions
-- to public;`.

-- 1. Default global ------------------------------------------------------
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

do $$
declare
  -- Só chamadas de dentro de outras funções SECURITY DEFINER.
  v_internas text[] := array[
    'criar_op_lote_operacoes',
    'calcular_necessidade_liquida_item',
    'submeter_aprovacao_compra',
    'submeter_aprovacao_financeiro',
    'gerar_bom_sugerida_a_partir_da_conversao',
    'liberar_reserva_interna',
    'recalcular_agregados_producao',
    'recalcular_situacao_ordem_producao',
    'snapshot_revisao_peca',
    'notificar_usuarios_com_permissao',
    'avaliar_regras_automacao',
    'avaliar_condicao',
    'audit_changed_fields',
    'extrair_campo_payload',
    'peca_contem_peca',
    'montar_rastreabilidade_pedido_item'
  ];
  v_keep oid[];
  v_oid oid;
  v_abertas text;
  v_perdidas text;
  v_vazadas text;
  v_qtd_antes int;
  v_qtd_depois int;
begin
  -- 2. Quem tem EXECUTE hoje como `authenticated` (direto OU herdado de PUBLIC),
  --    descontadas as funções de trigger e as internas.
  select coalesce(array_agg(p.oid), '{}'::oid[]) into v_keep
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.prorettype <> 'trigger'::regtype
    and p.proname <> all (v_internas)
    and has_function_privilege('authenticated', p.oid, 'execute');
  v_qtd_antes := coalesce(array_length(v_keep, 1), 0);

  -- 3. Fecha tudo...
  revoke execute on all functions in schema public from public;
  revoke execute on all functions in schema public from anon;
  revoke execute on all functions in schema public from authenticated;

  -- 4. ...mantém service_role (crons, Admin API, funções sistema_*)...
  grant execute on all functions in schema public to service_role;

  -- 5. ...e devolve a `authenticated` só o que ele já tinha.
  foreach v_oid in array v_keep loop
    execute format('grant execute on function %s to authenticated', v_oid::regprocedure);
  end loop;

  -- 6. Verificações. Qualquer divergência aborta a migration inteira.

  -- 6.1 Nada em `public` pode continuar executável por anon (isto também
  --     cobre PUBLIC, já que anon herda de PUBLIC).
  select string_agg(p.proname, ', ' order by p.proname) into v_abertas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  if v_abertas is not null then
    raise exception 'AUD-1210-04: ainda há função de public executável por anon/PUBLIC: %', v_abertas;
  end if;

  -- 6.2 Ninguém perdeu o que deveria ter mantido.
  select string_agg(p.oid::regprocedure::text, ', ') into v_perdidas
  from pg_proc p
  where p.oid = any (v_keep) and not has_function_privilege('authenticated', p.oid, 'execute');
  if v_perdidas is not null then
    raise exception 'AUD-1210-04: authenticated perdeu EXECUTE indevidamente em: %', v_perdidas;
  end if;

  -- 6.3 As internas e os triggers não podem ficar com authenticated.
  select string_agg(p.oid::regprocedure::text, ', ') into v_vazadas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and (p.proname = any (v_internas) or p.prorettype = 'trigger'::regtype)
    and has_function_privilege('authenticated', p.oid, 'execute');
  if v_vazadas is not null then
    raise exception 'AUD-1210-04: interna/trigger ainda executável por authenticated: %', v_vazadas;
  end if;

  -- 6.4 Nenhuma interna listada pode ter sumido do banco sem a lista ser
  --     atualizada (evita lista apodrecida passar despercebida).
  select count(*) into v_qtd_depois
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any (v_internas);
  if v_qtd_depois < array_length(v_internas, 1) then
    raise exception 'AUD-1210-04: lista de internas desatualizada — % nomes, % funções encontradas',
      array_length(v_internas, 1), v_qtd_depois;
  end if;

  raise notice 'AUD-1210-04: authenticated manteve EXECUTE em % funções; anon/PUBLIC em nenhuma.', v_qtd_antes;
end $$;

-- 7. Prova funcional do default: uma função NOVA, criada agora, não pode
--    nascer executável por PUBLIC/anon/authenticated. A função de teste é
--    criada e removida na mesma transação da migration.
do $$
declare
  v_anon boolean;
  v_auth boolean;
begin
  create function public._probe_default_execute() returns int
    language sql as 'select 1';

  v_anon := has_function_privilege('anon', 'public._probe_default_execute()', 'execute');
  v_auth := has_function_privilege('authenticated', 'public._probe_default_execute()', 'execute');

  drop function public._probe_default_execute();

  if v_anon or v_auth then
    raise exception 'AUD-1210-04: função nova ainda nasce executável (anon=%, authenticated=%) — default global não fechou', v_anon, v_auth;
  end if;
end $$;
