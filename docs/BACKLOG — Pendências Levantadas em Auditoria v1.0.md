# BACKLOG — Pendências levantadas em auditoria (27/09/2026)

Status: registrado, aguardando priorização do responsável do produto. Nenhum
item aqui tem aprovação para implementação — é só o registro do que foi
encontrado, pra não se perder entre sessões. Antes de implementar qualquer um,
seguir a governança normal do projeto (CLAUDE.md): confirmar escopo com o
responsável e, se envolver regra de negócio nova, abrir ADR.

## 1. Funcionalidade no banco sem tela na UI

Achados no audit "mapear o que está embutido" de 27/09/2026 — a função/tabela
existe e funciona via RPC/Data API, mas não tem como o usuário acionar pela
interface:

- **Estoque dimensional (ADR-011 Fase 2)** — schema e funções existem, zero
  tela.
- **`romaneio_expedicao()`** — a página de Expedição menciona o recurso mas
  não tem botão/formulário que chame a função.
- **Editar característica de peça** — só existe "remover" na tela de Peças;
  editar uma característica já cadastrada não tem UI (precisa remover e
  recriar).
- **Editar recurso produtivo / manutenção preventiva** — mesmo padrão: só
  cadastro e remoção, sem edição.

## 2. Lacuna de segurança pré-existente, mais ampla que o corrigido — RESOLVIDO (27/09/2026)

Ao corrigir `orcamento_item_caracteristicas` (ADR-012 Fase 1) para chamar
`assert_company_not_suspended()`, o comentário da migration registrou a
suspeita de que **o módulo de Orçamentos como um todo** tinha funções de
mutação mais antigas sem essa checagem. Feito o levantamento função a
função (migration `20261010003800_fix_orcamento_suspensao_gaps.sql`):
a suspeita era só parcialmente verdadeira — das 9 funções de mutação do
módulo, 7 já estavam corretas (5 delas retrofitadas com
`assert_tenant_write()` em 15/09, antes mesmo do comentário que levantou a
suspeita). Só 2 tinham o gap de fato:

- `upsert_orcamento_item()` — tinha `assert_tenant_write()` em 15/09, mas
  regrediu em 02/10 ao ganhar o parâmetro `custo_unitario` (a reescrita
  voltou ao guard manual antigo, sem a checagem de suspensão).
- `vincular_oportunidade_orcamento()` — nunca teve a checagem, desde que foi
  criada em 01/10.

Ambas corrigidas, com teste negativo em `scripts/test-governance.mjs` (regra
9 do CLAUDE.md) e validação manual do caminho feliz.

## 3. ADR-012 — todas as 4 fases entregues (27/09/2026)

A ADR-012 (Precificação Dimensional do Configurador) está com as 4 fases em
produção, cada uma liberada com "pode seguir" explícito do responsável do
produto (cláusula de governança da própria ADR):

- **Fase 1** — cálculo de custo dimensional (perfil/vidro/acessório).
- **Fase 2** — combinação de barras de menor custo total.
- **Fase 3** — composição do orçamento vira BOM sugerida do pedido
  automaticamente na conversão; preço já aprovado/faturado fica sempre
  congelado, com sugestão de atualização quando a BOM definitiva da
  Engenharia diverge (decisão explícita do operador, nunca automática).
- **Fase 4** — mão de obra automática a partir do roteiro produtivo e do
  novo `recursos_produtivos.custo_hora`.

Telas das Fases 3/4 entregues (27/09/2026): campo + calculadora de mão de
obra no item de orçamento (Comercial), campo `custo_hora` no cadastro de
recurso produtivo — com a edição estreita que faltava pra atualizar
depois de criado (Produção), e a seção de divergência de preço com
"Aplicar sugerido"/"Manter atual" por item de pedido (Pedidos). Validado
com `typecheck`/`eslint`/`next build`; não testado interativamente no
browser — o tenant de desenvolvimento (jrbox) já tem usuários reais e a
sessão não tinha como logar sem adivinhar/resetar credencial de alguém.

Achado de passagem ao construir a tela: `criar_recurso_produtivo()`/
`editar_recurso_produtivo()` ganharam `p_localizacao` (17/09) e depois o
gate `assert_tenant_write_any('producao', ['configurar','manage'])`
(25/09) — a migration da Fase 4 baseou o `drop function` numa assinatura
mais antiga (sem `localizacao`) e criou uma segunda sobrecarga em
paralelo em vez de substituir a função real, deixando `p_localizacao`
inacessível junto de `p_custo_hora` e regredindo o gate pra só 'manage'
nessa sobrecarga nova. Corrigido na mesma sessão
(`20261010004100_fix_recurso_produtivo_custo_hora_localizacao.sql`).

## 5. Auditoria de segurança TR Systems (12/10/2026)

Executada a partir de `auditoria-seguranca-tr-systems.md`. Metodologia:
leitura estática das migrations + testes automatizados direto na Data API
(banco local recriado por `supabase db reset`). Este registro não é
certificação de segurança nem garantia de conformidade integral com a LGPD.

### Achados corrigidos, com teste

- **Achado 1 (P2, defesa em profundidade)** — `decidir_orcamento()`,
  `decidir_etapa_aprovacao_compra()` e `decidir_etapa_aprovacao_financeiro()`
  dispensavam o papel aprovador da alçada com `is_platform_admin()` (sem
  checar AAL), contra a regra 4 do CLAUDE.md. Não havia exploração conhecida:
  o caminho só era alcançável com AAL2, porque `assert_tenant_write()` já
  passa por `has_permission()`. Troca por `is_platform_admin_mfa_verified()`
  em `20261012165725_alcada_platform_admin_mfa.sql` (só essa chamada muda;
  restante do corpo idêntico à última definição). **Aplicada no banco da
  nuvem em 12/10/2026** (`supabase migration list`: local = remoto).
  Testes negativos "platform_admin em AAL1 não dispensa a alçada" em
  `test-comercial` (seção 6), `test-compras` (41) e `test-bancario` (5).
  Verde no banco local (89/89, 295/295, 79/79). **Não executado:** a
  rodada "sem a migration" (prova de que o teste falha antes) e o caso
  positivo em AAL2.
- **Achado 2 (P1)** — nenhuma resposta enviava CSP, `X-Frame-Options` nem
  `nosniff` (clickjacking). `next.config.ts` passa a enviar CSP
  (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action`
  `'self'`, `connect-src` com o Supabase por causa do app de campo),
  `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e
  HSTS, e remove `X-Powered-By`. `'unsafe-inline'` em `script-src` é
  concessão consciente (hidratação do Next.js; nonce exigiria renderização
  dinâmica em todas as rotas). `scripts/test-security-headers.mjs`: 45
  falhas sem a correção, 53/53 com ela. **Pendente:** validar no
  `next build && next start` e em produção (testado só no `next dev`), com
  atenção a download por URL assinada e à sincronização do campo.

### Pendências reconfirmadas, sem mudança

Confirmadas por teste no banco local: MFA do `platform_admin` imposto no
banco (AAL1 nega, AAL2 permite); Storage com RBAC e escrita direta fechada;
`log_activity()` fechada a `authenticated` (SEC-005); papel de outra empresa
recusado (SEC-009); quota de storage aplicada (SEC-012); `anon` sem acesso
a tabelas e RPCs sensíveis. Leitura estática: nenhuma função
`SECURITY DEFINER` sem `search_path`, nenhum grant de EXECUTE a `anon` ou
`PUBLIC`.

### Abertas

- **`assert_company_not_suspended()` em todos os pontos de entrada** —
  testado em 4 entradas (`test-governance` seção 3); uniformidade total não
  provada. Falta um teste de varredura sobre toda função de escrita de tenant.
- **`next_document_number()`** — gate por permissão testado; exposição a
  `anon` só com prova indireta.
- **Signup público e rate limiting** — não testáveis localmente; conferir a
  configuração do projeto na nuvem (painel do Supabase). O `config.toml`
  local mantém `enable_signup = true` (SEC-011, supabase/auth#330).
- **Matriz LGPD e controles P1/P2** além do coberto pelos testes de
  anonimização — não auditados nesta rodada. Itens que dependem de decisão
  humana: os 3 itens jurídicos do ADR-010 §15; backup automático exige
  Supabase Pro.

### Achados novos da varredura (12/10/2026, após a primeira entrega)

- **Achado 4 (P0/P1) — EXECUTE aberto a `PUBLIC`/`anon`.** O reset de
  `20260914090000` fez `alter default privileges in schema public revoke …`,
  que não remove o default GLOBAL do Postgres (função nova nasce com
  `PUBLIC=EXECUTE`). No banco local, 325 de 387 funções de `public` estavam
  executáveis por `anon`. PoC (local, transação revertida; depois também pela
  Data API): sem login, `rpc/log_system_event` aceitou `p_company_id` de
  outra empresa e gravou o evento nela. Outras internas
  (`submeter_aprovacao_compra/financeiro`, `criar_op_lote_operacoes`,
  `calcular_necessidade_liquida_item`) recebem `p_company_id` do cliente e não
  checam identidade (regras 1 e 7 do CLAUDE.md). **Correção rascunhada, NÃO
  aplicada na nuvem:** `20261012175409_fecha_execute_public_anon.sql`
  (fecha o default global; tira PUBLIC/anon de tudo; preserva `authenticated`
  onde já existia, exceto triggers e 16 funções internas; mantém
  `service_role`; verificações internas abortam a migration em caso de
  divergência). Teste: `scripts/test-execute-grants-varredura.mjs` — 12
  falhas antes, 21/21 depois, no banco local. **Regressão:** `npm test`
  completo com `db reset` (migration reaplicada pelo arquivo): os 39 scripts
  anteriores passaram (12/10/2026); o único vermelho foi o próprio teste novo,
  por `psql` fora do PATH (faltava o `PATH_WITH_LIBPQ` dos outros testes),
  corrigido e revalidado sem o libpq no PATH. **Aplicada no banco da nuvem em
  12/10/2026** (`supabase migration list`: local = remoto, última
  `20261012175409`). Conferido na nuvem por `supabase db query --linked`
  (somente SELECT no catálogo): `anon` com 0 de 387 funções executáveis,
  `authenticated` com 353 (igual ao local), `service_role` com 387, internas e
  triggers fechados, default global do `postgres` sem `PUBLIC`. Regressão no
  app contra a nuvem: as 24 telas do menu responderam 200 sem erro de
  permissão e o BI carregou os dados reais pelas RPCs. **Não executado na
  nuvem:** o `test-execute-grants-varredura` (cria tenant de teste; só roda no
  banco local) e as ações de escrita das telas.
- **Achado 3 (P1) — 9 funções de escrita de tenant sem
  `assert_company_not_suspended()`** (regra 2): `ajustar_saldo`,
  `delete_file`, `upsert_oportunidade`, `mudar_estagio_oportunidade`,
  `cancelar_proposta`, `marcar_proposta_enviada`, `registrar_aceite_proposta`,
  `registrar_recusa_proposta`, `remover_permissao_individual`. Detectadas por
  `scripts/test-suspensao-varredura.mjs`; corpo de `delete_file` e
  `mudar_estagio_oportunidade` lido no banco: só checavam permissão.
  **Corrigido — aplicada na nuvem em 12/10/2026:**
  `20261012181317_guarda_suspensao_escrita_tenant.sql` — a única mudança em
  cada função é `perform public.assert_company_not_suspended()` logo depois
  do gate de permissão (corpo gerado de `pg_get_functiondef()`, não
  reescrito). Testes: `test-governance` seção 3 agora confere que o ERRO é de
  suspensão (com id inexistente a função também erra sem a guarda, então
  `!!error` não provava nada) — 9 falhas antes, verde depois (63/63); a
  varredura passa (6/6) e entrou no `run-tests.mjs`.
- **Achado 5 (P1) — `log_system_event()`** confiava em `p_company_id` do
  cliente: um usuário de um tenant gravava evento em outro (ou "sem dono").
  **Corrigido — aplicada na nuvem em 12/10/2026:**
  `20261012181332_log_system_event_valida_empresa.sql` — `service_role`
  (crons, webhooks, `sistema_falhar_operacao`) e `platform_admin` MFA informam
  a empresa; usuário comum só registra na PRÓPRIA (`current_company_id()`),
  nulo vira a empresa dele, empresa alheia é recusada. Verificado antes que
  todo chamador (11 em `src/app/api/**` via admin, `upload.ts` com a empresa
  do usuário, `falhar_operacao`) é compatível. Testes: `test-governance`
  seção 6 (outra empresa recusada e nada gravado; nulo atribuído; própria
  aceita; service_role e platform_admin em qualquer empresa).
- **Regressão dos achados 3 e 5:** `npm test` completo com `db reset`
  (migrations reaplicadas pelo arquivo): **41/41 scripts** (12/10/2026),
  inclusive `test-bancario`, cuja falha anterior era só estado residual do
  banco sem reset. **Conferido na nuvem** após o `db push`
  (`supabase db query --linked`, somente SELECT): as 9 funções do achado 3
  têm `assert_company_not_suspended()` no corpo; `log_system_event` tem a
  validação de empresa; a varredura de suspensão na nuvem deixa sem guarda
  só as 9 exceções justificadas do teste (platform_admin, rastro técnico e do
  próprio usuário); privilégios do achado 4 intactos (`anon` 0, `authenticated`
  353, `service_role` 387 de 387). **Não executado na nuvem:** os testes de
  comportamento (criam tenants; só rodam no banco local).

- **Achado 6 (P1) — o cron `storage-reconciliation` purgava órfãos sem
  deixar rastro de auditoria** (suspeita da primeira rodada, agora
  **confirmada e corrigida**). A rota chamava `admin.rpc("log_activity")`, que
  exige `auth.uid()` — nulo para a service role — e levantava exceção; a rota
  nunca olhava o retorno. Reproduzido de ponta a ponta com o cron real
  (`scripts/test-cron-storage-reconciliation.mjs`, sobe um `next dev`, cria
  órfão envelhecido): resposta `200 ok:true`, objeto purgado, **nenhuma linha
  em `activity_logs`** (7 de 11 verificações antes; 14/14 depois).
  **Correção, NÃO aplicada na nuvem ainda:**
  `20261012182823_sistema_registrar_evento_plataforma.sql` — função só para
  `service_role` (revoke explícito + checagem de `auth.role()` no corpo), lista
  FECHADA de ações (hoje só `security.storage_orphans_purged`; regra 8 do
  CLAUDE.md), grava como evento de plataforma (`company_id` e `user_id` nulos).
  A rota agora checa o retorno: falha de auditoria vira `system_event`
  (`job_failure`) e a resposta é 500, mesmo com a purga feita. Não se abriu
  `log_activity()` para `service_role` de propósito (é a escrita padrão de
  dezenas de funções de negócio). **Não coberto por teste:** o caminho em que a
  gravação da auditoria falha (resposta 500 + system_event).
- **Observação (não corrigida, decisão do responsável):** o padrão "chamada
  `rpc` com retorno descartado" ainda existe em (a)
  `src/app/api/cron/integracoes-webhooks-saida/route.ts` (`sistema_iniciar_
  processamento_operacao`, `sistema_falhar_operacao`, `sistema_concluir_operacao`)
  e (b) `log_platform_admin_access` nas telas `audit` e `governance` (trilha de
  acesso de suporte do platform_admin), além dos `log_client_event` de
  login/MFA/export. Nenhum deles foi reproduzido como falha; apenas não
  deixariam rastro de que falharam. Vale decidir, caso a caso, se a falha deve
  ser visível.

### Ambiente de teste local (aprendizado)

`npm test` falhou em 6 scripts (todos por upload na Storage) porque o
container da Storage ficou numa versão antiga (1.73.1) enquanto o schema foi
migrado pela v1.77.5 fixada pelo CLI: `INSERT … ON CONFLICT (name,
bucket_id)` retornava `42P10`. Resolvido com `supabase stop && supabase
start` (recria os containers). Se a falha reaparecer após atualizar o CLI,
repetir. Não era defeito do código do projeto.
