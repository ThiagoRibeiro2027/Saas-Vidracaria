# Runbook — Rotação de Secrets (Security Gate Fase 8)

Este documento **não é um ADR** — é a documentação operacional exigida
pelo checklist de Security Gate da Fase 8, item "Secrets: rotação
configurada". Política decidida em 13/09/2026: rotação **sob demanda**
(compromise-driven), sem cadência fixa — roda quando houver suspeita ou
confirmação de vazamento, desligamento de alguém com acesso, ou troca de
responsável pela infraestrutura. Não há automação; todo procedimento
abaixo é manual.

## 1. Inventário de secrets

| Secret | Onde vive | Quem/o quê usa |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` (legacy JWT) | Vercel (env var `Secret`, Production); `.env.local` local | `src/lib/supabase/admin.ts` — bypassa RLS, uso restrito a server-only |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy JWT) | Vercel (env var `Config`, exposta ao cliente por desenho); `.env.local` | Todo client Supabase do app (RLS é a proteção real, não o sigilo desta chave) |
| Senha do Postgres do projeto remoto | Só na posse de quem a gerou/rotacionou — este projeto não a persiste em nenhum arquivo do repo | Conexão direta (`psql`/`DATABASE_URL`), scripts de backup/restore/teste que precisam de acesso fora do PostgREST |
| Supabase personal access token (`SUPABASE_ACCESS_TOKEN`) | Cofre de senhas pessoal de quem opera a CLI/Management API — nunca no repo | `supabase` CLI e chamadas diretas à Management API (`api.supabase.com`) |
| Vercel token (`VERCEL_TOKEN`) | Cofre de senhas pessoal | `vercel` CLI |

Nenhum destes é commitado — `.env*` está no `.gitignore` (item já
verificado no Security Gate, `git ls-files` não retorna nenhum `.env`).

## 2. Gatilhos para rotacionar

Rotacionar imediatamente quando:

- um secret aparecer em texto puro em algum lugar que não deveria (chat,
  log, commit, issue) — mesmo que o canal seja considerado privado;
- alguém com acesso a um destes secrets deixar a equipe ou mudar de
  função;
- houver suspeita concreta de acesso não autorizado ao projeto Supabase,
  à conta Vercel, ou ao repositório.

Não há rotação calendarizada — decisão registrada em 13/09/2026.

## 3. Procedimento por secret

### 3.1 `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Estas são as chaves legacy (JWT) do projeto. Regenerar invalida as
anteriores imediatamente para todo tráfego.

1. Painel do projeto → Settings → API → gerar novas legacy keys (ou via
   Management API, `POST /v1/projects/{ref}/api-keys`).
2. Atualizar em todo lugar que as usa:
   - Vercel: `vercel env rm SUPABASE_SERVICE_ROLE_KEY production` seguido
     de `vercel env add SUPABASE_SERVICE_ROLE_KEY production --sensitive
     --value=<nova>` (mesmo padrão para `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     com `--type config`).
   - `.env.local` de quem desenvolve, se usarem o projeto remoto local.
3. Fazer novo deploy de produção na Vercel (env var só é lida no build/
   runtime seguinte — deploys já rodando continuam com a chave antiga até
   redeploy).
4. Rodar a suíte de testes contra o projeto remoto (`scripts/test-*.mjs`
   com as novas chaves) para confirmar que nada quebrou antes de encerrar
   a rotação.

### 3.2 Senha do banco (Postgres)

1. `PATCH /v1/projects/{ref}/database/password` (Management API) com a
   nova senha, ou pelo painel (Settings → Database → Reset database
   password).
2. Efeito imediato — qualquer conexão direta (`psql`, `DATABASE_URL`)
   usando a senha antiga passa a falhar. Como nenhum script do repo
   persiste essa senha (é sempre lida de variável de ambiente informada na
   hora), não há mais nenhum lugar para atualizar além de onde a pessoa
   operando guarda a senha.
3. Validar com `psql "$DATABASE_URL" -c "select 1;"` antes de considerar
   concluído.

### 3.3 Personal access tokens (Supabase / Vercel)

1. Revogar o token comprometido/antigo direto no painel da conta
   (`supabase.com/dashboard/account/tokens` ou
   `vercel.com/account/tokens`) — não há endpoint de API para isso (seria
   o próprio token se autorrevogando).
2. Gerar um novo, guardar num cofre de senhas — nunca em arquivo
   versionado nem colado em texto puro em nenhum canal de chat/ticket.
3. Nenhuma propagação necessária além de onde a pessoa/processo que opera
   a CLI guarda o token — ele não é lido por nenhum ambiente de execução
   do app (só por quem roda comandos administrativos).

## 4. Nota sobre o ambiente atual

O projeto remoto (`Saas-Vidracaria`, ref `kisjfapdbyhgszvxyugc`, região
`sa-east-1`) está hoje no plano **Free** — provisório, sem backup
automático (ver ADR-010 §15). A senha do banco desse projeto foi
rotacionada uma vez em 13/09/2026 (Security Gate Fase 8, troca pontual
porque a senha original não era conhecida por quem assumiu a operação —
não foi um evento de comprometimento).
