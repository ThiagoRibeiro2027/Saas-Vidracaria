## SaaS Industrial — Vidraçaria

Este projeto segue as decisões documentadas em /docs. Antes de qualquer
implementação, consulte:

- docs/ARQUITETURA MESTRE...
- docs/ESCOPO DO PROJETO...
- docs/Prompt_Mestre_Seguranca_SaaS_Vidracaria.md
- Todos os arquivos ADR-001 a ADR-010 em /docs

Regras obrigatórias:
- Seguir as 8 fases definidas no Prompt Mestre de Segurança (item 47).
- Não avançar de fase sem aprovação explícita do responsável do produto.
- Não implementar regras de negócio que não estejam definidas nos ADRs.
- Security first: RLS, multi-tenant e auditoria são prioridade sobre velocidade.

## Regras de segurança (auditoria técnica de 14/09/2026)

Incorporadas a partir do parecer da auditoria independente que reabriu a
Fase 8 — resumem os princípios que o projeto já vinha seguindo desde a
Fundação de Segurança e valem para toda função/policy nova, não só para o
que foi corrigido no Security Gate P0:

1. Nunca confiar em `company_id`/`tenant_id` enviado pelo cliente — toda
   mutação de tenant valida via `current_company_id()`, nunca por um valor
   recebido em parâmetro.
2. Toda mutação de tenant rejeita empresa suspensa (`assert_company_not_
   suspended()`), salvo exceção explícita e documentada no código.
3. Toda operação privilegiada tem um permission gate explícito
   (`has_permission()`) — nunca depende só de RLS ou só da UI esconder o
   botão.
4. Operação de `platform_admin` exige MFA/AAL2 na camada de autorização do
   banco (`is_platform_admin_mfa_verified()`), nunca só a sessão do
   Next.js — o middleware é roteamento, não a última barreira.
5. Policy de Storage impõe tenant **e** permissão RBAC (`has_permission`),
   nunca só isolamento por prefixo/tenant.
6. Função `SECURITY DEFINER` sempre declara `search_path` controlado
   (`set search_path = public`).
7. `PUBLIC`/`anon` nunca recebem EXECUTE por padrão em função nova do
   schema `public` — grant de `authenticated` é explícito por função, e
   quem cria a função revisa o que está concedendo.
8. Função genérica de auditoria não é exposta como API livre pra o usuário
   controlar `action` sem restrição — o evento deve corresponder a uma
   operação real.
9. Toda funcionalidade sensível de segurança tem teste negativo (deny),
   não só o caminho feliz — direto na Data API, não só pela aplicação.
10. Toda tabela nova de tenant tem RLS habilitada e teste de isolamento
    cross-tenant antes de ser considerada pronta.
11. Credencial de service role nunca chega ao browser (`server-only`,
    módulo administrativo separado).
12. Todo upload de arquivo valida tipo de conteúdo real, tamanho e
    autorização — nunca só o MIME informado pelo cliente.
13. Nenhuma feature é considerada pronta para produção antes dos seus
    testes de segurança passarem.

## Banco e ambiente de trabalho

O projeto é desenvolvido em mais de uma máquina, contra **um único banco**:
o projeto Supabase na nuvem, ref `kisjfapdbyhgszvxyugc`. O código se
sincroniza pelo git; o banco, pelas migrations. Só funciona se as duas
pontas andarem juntas.

1. **Migration só existe quando está aplicada.** Ao criar migration em
   `supabase/migrations/`, rodar `npx supabase db push` antes de encerrar a
   sessão — no mesmo fôlego do commit, não depois. Migration commitada e
   não aplicada quebra a outra máquina, e isso já aconteceu duas vezes
   (a `20261028000000`, um fix de RLS, e as quatro do TÓPICO 13/18).
2. **Ao começar a trabalhar**, rodar `npx supabase migration list` e avisar
   se houver pendência antes de escrever qualquer código — o banco pode ter
   ficado atrás do que a outra máquina commitou.
3. **Nunca alterar estrutura pelo painel do Supabase.** Toda mudança vira
   migration versionada. Alteração feita na mão não existe para a outra
   máquina e aparece como drift (`remote` sem `local`), que é o caso difícil
   de desfazer.
4. **Não usar `supabase start`** (banco local em Docker). Com duas máquinas,
   bancos locais divergem em silêncio. O banco é o da nuvem, sempre.
5. `.env.local` não é versionado e é configurado à mão em cada máquina — as
   variáveis estão documentadas em `.env.example`. A `SUPABASE_SERVICE_ROLE_KEY`
   ignora o RLS: nunca em commit, nunca em log, nunca no browser.