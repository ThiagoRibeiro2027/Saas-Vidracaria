# Runbook — Governança de Segurança (Security Gate Fase 8)

Este documento **não é um ADR** — é a documentação operacional para os
itens de Fase P2 do plano de remediação da auditoria técnica de
14/09/2026 que não são bugs de código: revisão periódica de permissões,
security review por release e observabilidade/alertas de segurança
(decisão tomada em 15/09/2026, seção 3: alerta próprio por e-mail via
Resend, sem log drain nem APM contratado).

## 1. Revisão periódica de permissões

**Objetivo:** confirmar periodicamente que `role_permissions` e
`platform_admins` refletem só o acesso que deveria existir hoje — sem
concessões esquecidas de um teste, de um piloto encerrado, ou de alguém
que já saiu.

**Quando rodar** (sugestão de cadência — ajustável pelo responsável do
produto, nenhum ADR fixa um número):
- a cada release que crie ou altere uma `permission`, um `role` template,
  ou o conteúdo de `role_permissions` do template `ADMIN`;
- sempre que alguém for desligado ou trocar de função, revisar
  especificamente o `platform_admins` e os `user_roles` da pessoa;
- no mínimo trimestralmente, mesmo sem nenhum gatilho acima.

**Checklist:**

1. `select * from platform_admins where active = true;` — cada linha
   corresponde a alguém que hoje deveria ter acesso de plataforma? Contas
   de teste (`*.internal`) não deveriam aparecer aqui num ambiente com
   dado real.
2. Para cada template de papel (`roles` com `company_id is null`):
   `select p.resource, p.action from role_permissions rp join permissions
   p on p.id = rp.permission_id join roles r on r.id = rp.role_id where
   r.key = '<KEY>';` — a lista ainda faz sentido pro papel? (Hoje só
   `ADMIN` recebe permissões por padrão — `COMERCIAL`/`PRODUCAO`/
   `INSTALACAO` ficam vazios até o Tópico 14 existir; a revisão passa a
   valer de verdade quando esse módulo for construído.)
3. `select id, valid_until from user_roles where valid_until is not null
   and valid_until < now();` — atribuições temporárias vencidas deveriam
   ter sido removidas ou já não valem por causa do `valid_until` no
   `has_permission()`? Confirmar que nenhuma ficou "esquecida" sem
   `valid_until` quando deveria ter um prazo.
4. Registrar a revisão (mesmo que sem achados) como um evento de
   auditoria — `log_client_event()`/uma função de negócio dedicada
   quando esse fluxo existir; até lá, um comentário no PR/changelog da
   revisão já é suficiente.

## 2. Security review por release

Toda mudança que toque schema (`supabase/migrations/`), RLS, RBAC, ou
`SECURITY DEFINER` passa pelo mesmo fluxo antes de ir pra produção — o
mesmo que já vem sendo seguido nas Fases 1-8 deste projeto, agora
formalizado:

```text
Feature
  ↓
Ela lê/escreve dado de outro tenant, ou concede algo a alguém
que hoje não tem? (Threat Model — nem que seja 2 frases no PR)
  ↓
Migration (supabase/migrations/, nunca editar uma já aplicada)
  ↓
RLS — toda tabela nova de tenant tem policy de SELECT; toda escrita
passa por função SECURITY DEFINER, nunca por INSERT/UPDATE/DELETE
direto de `authenticated`
  ↓
RBAC — toda operação sensível chama has_permission(); toda
SECURITY DEFINER declara search_path controlado
  ↓
Grant explícito — nova função só recebe EXECUTE pra quem
realmente precisa chamá-la direto (ver SEC-006:
20260914090000_phase8_security_gate_p0.sql)
  ↓
Testes — scripts/test-*.mjs cobrindo o caminho feliz E o
negativo (cross-tenant deny, sem permissão deny); npm test
(reset completo + suíte) e npm run typecheck/lint limpos
  ↓
PR — descreve o que muda em RLS/RBAC/grants, não só a feature
  ↓
Deploy
```

Perguntas que toda função `SECURITY DEFINER` nova precisa responder
(adaptado da seção 8 da auditoria) — checklist de PR:

- [ ] Quem pode executar (`authenticated`? Só platform_admin?)
- [ ] `SECURITY INVOKER` ou `SECURITY DEFINER`? Se DEFINER, por quê?
- [ ] `set search_path = public` está presente?
- [ ] Qual tenant pode acessar — valida `current_company_id()`, nunca um
      `company_id` recebido por parâmetro do cliente?
- [ ] Qual `permission` é exigida (`has_permission()`)?
- [ ] Se altera dado de tenant: chama `assert_company_not_suspended()`?
- [ ] Gera evento de auditoria (`log_activity()` interno, nunca expondo
      `log_client_event()` pra uma ação nova sem meter na whitelist)?
- [ ] Existe teste allow **e** deny pra ela em `scripts/test-*.mjs`?

## 3. Observabilidade e alertas de segurança

**Decisão (15/09/2026):** alerta próprio sobre `activity_logs`, sem
log drain nem APM contratado — projeto está no plano Free da Supabase e
da Vercel (Hobby), sem orçamento definido pra uma ferramenta paga ainda.
Implementado em `src/app/api/cron/security-alerts/route.ts`.

**Como funciona:**

- **Gatilho:** Vercel Cron (`vercel.json`), 1x/dia (`0 8 * * *` —
  plano Hobby não permite frequência maior:
  https://vercel.com/docs/cron-jobs/usage-and-pricing). A Vercel
  autentica a chamada via header `Authorization: Bearer $CRON_SECRET`
  (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs);
  o handler rejeita qualquer chamada sem o secret correto.
- **O que verifica:** conta ocorrências de `auth.login_blocked`,
  `governance.subscription_transitioned`, `lgpd.activity_logs_anonymized`
  e `governance.activity_logs_retention_purge` em `activity_logs`, na
  janela desde a última execução (marcador `system.security_alert_run`,
  com fallback de 24h se for a primeira vez) — idempotente por desenho:
  uma invocação duplicada da Vercel Cron reprocessa uma janela vazia, uma
  perdida é coberta pela próxima (mesmo princípio que a própria Vercel
  recomenda para cron jobs).
- **Notificação:** se achar algo, manda um e-mail-resumo via Resend
  (`onboarding@resend.dev` — remetente de teste, sem domínio próprio
  configurado; ver seção 4 pra trocar) pro endereço em
  `SECURITY_ALERT_EMAIL`.

**Variáveis de ambiente necessárias** (Vercel → Settings →
Environment Variables, Production; local em `.env.local` só se for testar
o endpoint manualmente):

| Variável | Valor |
|---|---|
| `CRON_SECRET` | string aleatória de 16+ caracteres (ex.: gerada por um gerenciador de senhas) |
| `RESEND_API_KEY` | API key da conta Resend (resend.com → API Keys) |
| `SECURITY_ALERT_EMAIL` | endereço que recebe o alerta |

**Ampliar no futuro** (não faz parte do escopo de hoje, registrado pra
quando for revisitado): alertar também sobre exceção de aplicação
(Sentry/equivalente) e sobre tentativa de forjar evento de auditoria via
`log_client_event()` — hoje essa tentativa só gera um erro pro chamador,
não fica registrada em `activity_logs` (a própria rejeição não é
persistida, por desenho: registrar a tentativa exigiria decidir se
`p_action` forjado deveria aparecer em claro no log, o que abriria de
novo parte do problema que o SEC-005 fechou).

### 4. Trocar o remetente de e-mail quando houver domínio próprio

1. Adicionar o domínio em Resend → Domains e configurar os registros DNS
   pedidos (SPF/DKIM).
2. Trocar `"SaaS Vidraçaria <onboarding@resend.dev>"` pelo remetente do
   domínio verificado em `src/app/api/cron/security-alerts/route.ts`.
