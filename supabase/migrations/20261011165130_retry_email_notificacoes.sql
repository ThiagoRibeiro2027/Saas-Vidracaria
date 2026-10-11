-- Achado da auditoria de gaps ADR-001 a ADR-012 (11/10/2026): o cron de
-- e-mail (src/app/api/cron/notificacoes-email/route.ts) varre só
-- email_status='pendente' — uma falha transitória (Resend fora do ar,
-- rate limit, timeout de rede) marca email_status='falhou' e esse estado
-- é terminal: a notificação nunca mais é tentada, mesmo sendo
-- prioridade=critica (ADR-007 §5, o único canal externo deste recorte).
--
-- O cron já roda só 1x/dia (limite do plano Hobby da Vercel, mesma
-- restrição documentada no cron de security-alerts) — então a cadência de
-- retry É a própria cadência diária do cron, sem sentido inventar backoff
-- em minutos/horas como o de integracao_webhooks_saida (TÓPICO 13), que
-- tem cron de alta frequência. "Retry" aqui significa só: uma falha
-- transitória não deve ser definitiva depois de uma única tentativa.
alter table public.notificacoes add column if not exists tentativas integer not null default 0;
comment on column public.notificacoes.tentativas is
  'Tentativas de envio de e-mail já feitas (só relevante com email_status em pendente/falhou). Para de ser revarrida pelo cron ao atingir 5 — nesse ponto a falha é tratada como definitiva.';

-- Substitui o índice parcial original (só 'pendente') por um que cobre
-- também 'falhou' com tentativas restantes — mesmo predicado que a nova
-- consulta do cron vai usar.
drop index if exists public.notificacoes_email_pendente_idx;
create index notificacoes_email_retry_idx on public.notificacoes (id)
  where email_status = 'pendente' or (email_status = 'falhou' and tentativas < 5);
