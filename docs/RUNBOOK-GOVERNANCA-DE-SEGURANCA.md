# Runbook — Governança de Segurança (Security Gate Fase 8)

Este documento **não é um ADR** — é a documentação operacional para os
itens de Fase P2 do plano de remediação da auditoria técnica de
14/09/2026 que não são bugs de código: revisão periódica de permissões e
security review por release. O item "observabilidade e alertas de
segurança" fica registrado como decisão pendente (seção 3) — depende de
escolha de ferramenta/orçamento, não é algo a implementar sem essa
decisão.

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

## 3. Observabilidade e alertas de segurança — decisão pendente

Não implementado. Depende de escolher uma ferramenta (custo/operação),
não é algo pra decidir sem o responsável do produto. Opções que existem
hoje sem precisar trocar de stack, pra quando essa decisão for tomada:

- **Log drain do Supabase** (Settings → Log Drains) — exporta logs do
  Postgres/Auth/Storage pra um destino externo (ex.: Datadog, um
  webhook próprio). Mais simples de ligar, mas cobre infraestrutura, não
  os eventos de `activity_logs` da aplicação.
- **Alertas sobre `activity_logs`** — um cron/edge function periódico
  consultando por padrões (ex.: muitos `auth.login_blocked` numa janela
  curta, `governance.subscription_transitioned` fora do horário
  esperado) e notificando por e-mail/webhook. Não existe hoje; seria
  código novo, não só configuração.
- **Sentry/equivalente** para exceptions do Next.js — cobre erro de
  aplicação, não eventos de segurança especificamente.

Quando o responsável decidir a ferramenta, o padrão dos demais itens
deste runbook (checklist + gatilho, não cadência arbitrária) deve valer
aqui também: o quê dispara um alerta, pra quem, e o que essa pessoa faz
ao recebê-lo.
