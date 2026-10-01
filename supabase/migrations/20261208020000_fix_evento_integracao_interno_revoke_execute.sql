-- Corrige achado do próprio teste automatizado desta fase: Postgres concede
-- EXECUTE a PUBLIC por padrão em toda função nova (diferente de tabelas),
-- e a migration 20261208000000 não revogou isso pra
-- registrar_evento_integracao_interno() — a suposição de que "sem grant
-- explícito = ninguém chama" (comentário daquela migration) estava errada.
-- O reset global de 20260914090000 (revoke + alter default privileges)
-- não cobriu este caso na prática — mesmo padrão já visto em
-- 20260916040000 (sync_claim/sync_operation_complete), que também precisou
-- de revoke explícito por função apesar do reset global. CLAUDE.md regra 7
-- exige isso explícito, não implícito.

revoke execute on function public.registrar_evento_integracao_interno(uuid, text, text, text, text, uuid, text, jsonb)
  from public, anon, authenticated;
