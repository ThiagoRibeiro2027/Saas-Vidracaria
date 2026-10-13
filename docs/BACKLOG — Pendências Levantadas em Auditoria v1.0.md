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
  **Correção — migration aplicada na nuvem em 12/10/2026** (`npm test` com
  `db reset`: 42/42; na nuvem, por `db query --linked`: função presente, só
  `service_role` executa, lista fechada ativa, `anon` 0/388 e `authenticated`
  353 intactos). **O código da rota só vale em produção depois do deploy** —
  até lá o cron publicado na Vercel ainda chama `log_activity`:
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

### Rodada de itens abertos (12/10/2026): configuração da nuvem, LGPD e produção

Verificação feita por `supabase config diff`, `supabase projects list`,
`supabase backups list` e `db query --linked` (somente leitura), mais sondas
com dados reais no banco local.

**Confirmado na nuvem (sem ação):** região `sa-east-1` (ADR-010 §9); signup
público FECHADO (`enable_signup = false`); confirmação de e-mail ligada; rate
limits de Auth iguais aos do `config.toml` local (padrão do Supabase, 30
login/cadastros por janela por IP — `email_sent` não é comparado pela API);
`site_url` e redirects apontam para `https://saas-vidracaria.vercel.app`.
Atenção: o `config.toml` NÃO é a configuração da nuvem (10 divergências,
inclusive `site_url`); **nunca rodar `supabase config push` com ele**, que
trocaria a URL de produção por `127.0.0.1`.

- **Achado 7 (P1) — política de senha.** Nuvem: `minimum_password_length = 6`
  (o `config.toml` declara 10). O app tinha três mínimos (10 na troca; 8 na
  criação e na redefinição pelo admin) e um comentário afirmando que o GoTrue
  rejeitaria — válido só no banco local. **Código corrigido** (commit
  `b19fc79`): `src/lib/auth/password-policy.ts` é a fonte única (10) e
  `test-password-policy.mjs` falha se divergir do `config.toml`. **PENDENTE
  (decisão/ação humana):** ajustar `minimum_password_length` para 10 no painel
  do Supabase (Authentication) — sem isso, quem chamar a Auth API direto
  (a anon key vai no bundle do app de campo) ainda aceita senha de 6.
- **Achado 8 (P1, LGPD) — `anonimizar_pessoa()` só limpava `pessoas` — CORRIGIDO
  (migration `20261012184715`, seção 4 de `test-lgpd-pessoa`).** Provado com
  dados reais: depois de anonimizar o titular permaneciam (a) `obras`: nome e
  endereço; (b) `propostas.destinatario`: o e-mail; (c) `fornecedor_dados`:
  banco, agência, conta e `chave_pix` (aqui, o CPF). **Decisão do responsável
  (12/10): limpar as cópias, preservando o que tem guarda legal** (ADR-010 §6).
  A função agora limpa essas três cópias (só as linhas do titular, na própria
  empresa) e NÃO toca documentos fiscais, contratos, títulos, `propostas.snapshot`
  (só ids/valores — verificado) nem o vínculo `pessoa_id`. O log registra contagens,
  nunca o conteúdo. Fora de alcance, por serem texto livre: `observacoes` e
  descrições de qualquer tabela — não há como higienizar de forma confiável
  automaticamente; registrar no ADR-010.
- **Achado 9 (P1, LGPD) — nome, e-mail e documento na TRILHA DE AUDITORIA
  imutável — CORRIGIDO PARA LOGS NOVOS (migration `20261012185105`, seção 5 de
  `test-lgpd-pessoa`).** O log é imutável por trigger e a anonimização existente
  é por `user_id`, então o nome de uma PESSOA nunca saía de lá. **Decisão do
  responsável (12/10): parar de gravar dado pessoal nos logs novos, sem
  rotina de limpeza do histórico.** Mudado: `upsert_pessoa`/`upsert_obra`/
  `upsert_funcionario`/`criar_perfil_usuario`/`registrar_aceite_instalacao`
  (description sem nome; funcionário sem a ficha em `metadata.before`),
  `marcar_proposta_enviada` (sem o e-mail) e as importações de pessoas, obras,
  funcionários, papéis e dados de fornecedor (log com contagem, sem resultado por
  linha). O log mantém quem/o quê/qual entidade e os NOMES dos campos alterados.
  **Pendente/limitação:** (i) os logs antigos continuam com dado pessoal (decisão
  explícita); (ii) `registrar_aceite_instalacao` não tem teste comportamental
  (precisa de fixture de instalação concluída) — validada só pela leitura da
  função; (iii) outros `description` com nome de entidade de negócio (equipe,
  recurso, regra) não são dado pessoal e ficaram.
- **Achados 8 e 9 e política de senha — aplicados e conferidos na nuvem
  (12/10/2026, somente leitura):** `migration list` em sincronia até
  `20261012185105`; `anonimizar_pessoa` com a limpeza das cópias; as 12 funções do
  achado 9 sem nome, e-mail, ficha ou resultado por linha no log; `anon` com 0
  funções executáveis em `public`. `minimum_password_length` deixou de aparecer em
  `config diff` (nuvem = 10) e o app passou a validar a composição da senha
  (`validatePassword`), espelhando `password_requirements` da nuvem.
- **Achado 10 (P0 operacional) — NÃO existe backup da produção.**
  `supabase backups list` devolve lista vazia (`pitr_enabled: false`): nenhum
  backup gerenciado; os dumps manuais em `backups/db` são de 11–12/09 e do
  banco LOCAL, anteriores aos dados reais. O ADR-010 §15 já registrava o plano
  Free sem backup. Mitigação imediata possível: dump manual da nuvem
  (`supabase db dump --linked`), com os cuidados de LGPD do arquivo gerado.
- **Achado 11 (P1) — os headers de segurança do achado 2 NÃO estão em
  produção.** `curl -I https://saas-vidracaria.vercel.app/login` mostra só
  HSTS (da Vercel) e `X-Powered-By`; sem CSP, `X-Frame-Options` nem `nosniff`.
  O código está pronto (commit `c5cdaf2`), falta o deploy.
- **Achado 12 (P0 antes de ter cliente real) — o banco da nuvem está cheio de
  dados e contas de TESTE (12/10/2026, somente leitura).** `companies`: 248
  (247 ativas), quase todas fixtures de teste (`audit-test`, `bi-test-*`,
  `smoke-*`...); `auth.users`: 382, dos quais 371 `@users.internal`;
  **`platform_admins`: 11 SUPER_ADMIN, todos de teste** (`mfa-test-*`,
  `governance-admin-*`, `9402/9502.platform-admin`), criados de 13/09 a 11/10.
  As fixtures dos testes usam senha fixa e conhecida no repositório
  (`senha-de-teste-123456` e variantes), então essas contas são, na prática,
  credenciais públicas, ativas, com papel ADMIN nos tenants de teste e
  SUPER_ADMIN na plataforma. O login exige empresa+matrícula+senha e o
  cadastro público está fechado, mas isso não protege conta que já existe. A
  senha mínima de 10 só vale para senhas novas. Causa: testes rodados contra a
  nuvem (CLAUDE.md "um único banco") e nunca limpos. **Não foi corrigido nem
  executado nenhum login de prova.** Plano proposto, reversível: banir os
  usuários `@users.internal` de teste e desativar os 11 `platform_admins` de
  teste (Admin API + `active=false`), preservando dados (o trigger de
  `activity_logs` impede apagar empresas com histórico). Decisão do
  responsável: quais empresas são reais (`jrbox`?). Recomendação estrutural:
  projeto Supabase de produção separado do de desenvolvimento/teste.
- **Achado 12, plano de limpeza (decisão do responsável, 12/10/2026: apagar
  tudo, manter só a `jrbox`; nenhuma outra empresa é real).** Scripts em
  `scripts/limpeza/`: `01-simulacao.sql` (só leitura), `02-executar.sql`
  (transação única, `session_replication_role = replica` só dentro dela,
  aborta e desfaz se sobrar algo além da `jrbox`; apaga também os 11
  `platform_admins` de teste) e `03-auth-storage.mjs` (usuários do Auth sem
  perfil e arquivos do Storage de empresas apagadas; simulação por padrão).
  **Testado de ponta a ponta no banco LOCAL**: 96 empresas, 155 usuários e
  2664 logs de teste viraram 1 empresa, 1 usuário e 0 arquivos; o trigger de
  imutabilidade de `activity_logs` continuou ativo e recusando `DELETE`.
  **Ainda NÃO executado na nuvem.** Efeitos a saber: sem platform_admin depois
  (criar um novo, com senha forte e MFA; não usar `seed-platform-admin.mjs`,
  cuja senha é fixa no repositório); o usuário `0001` da `jrbox` nasceu do
  `seed-dev-tenant.mjs` com senha de bootstrap pública e deve ser redefinido
  ou desativado; a limpeza não tem volta e a nuvem não tem backup (fazer dump
  antes).
- **Achado 12, limpeza executada na nuvem e conferida (12/10/2026, somente
  leitura):** 1 empresa (`jrbox`), 2 perfis, 2 usuários no Auth (de 382), 1
  arquivo no Storage (de 33, nenhum de outra empresa), 0 `platform_admins`,
  967 logs (trigger de imutabilidade ativo). Dump prévio dos dados de `public`
  em `backups/db/` (fora do git). **Pendente:** criar um platform_admin novo
  (senha forte e MFA); redefinir ou desativar o usuário `0001` (nasceu com senha
  de bootstrap pública e `must_change_password` está false, então não dá para
  afirmar que a senha foi trocada).
- **Achado 13 (P0 de segurança, cross-tenant) — redefinição de senha trocava a
  senha de usuário de OUTRA empresa (12/10/2026) — CORRIGIDO.** Descoberto
  porque, ao testar a troca de senha no site publicado, apareceu a página
  genérica de erro do Next. A causa do erro visível: as Server Actions de
  Usuários lançavam exceção e, em produção, o Next esconde a mensagem. Ao ler o
  código, `resetarSenhaAction` chamava `auth.admin.updateUserById(profile_id)` (Admin
  API, ignora RLS) com o id vindo do FORMULÁRIO e só depois o banco verificava a
  empresa (`marcar_troca_senha_obrigatoria`). **Provado no navegador, no banco
  local:** um ADMIN da `jrbox` adulterou o `profile_id` e a senha de um usuário
  de outra empresa passou a ser a do atacante (a original deixou de funcionar),
  ainda que a tela mostrasse erro. Exigia conhecer o UUID do alvo e ser ADMIN
  de qualquer empresa; na nuvem hoje só existe a `jrbox`. **Correção:** o banco
  valida primeiro (permissão, suspensão e empresa) e só então a Admin API é
  chamada; `resetarSenhaAction` e `criarUsuarioAction` devolvem o erro como valor
  e a tela o mostra (`FormsSenha.tsx`). Repetido o ataque depois: "Usuário não
  encontrado nesta empresa" e a senha da vítima intacta; senha fraca mostra a
  regra na tela; caminho legítimo funciona. Teste automatizado:
  `scripts/test-usuarios-senha-ordem.mjs` (6 falhas no código antigo, 8/8 no
  novo; estático, garante a ordem e a ausência de `throw`). **Pendente:** as demais
  Server Actions de `/usuarios` (papéis, permissões, desativar) ainda lançam
  exceção e mostram a página genérica em erro esperado. Não é falha de
  segurança (o banco valida tudo), é usabilidade. Outras telas do app seguem o
  mesmo padrão.
- **Encerramento (12/10/2026):** auditoria encerrada com ressalvas conhecidas.
  Concluídos: platform_admin novo com MFA; `0001` redefinido e desativado;
  `CRON_SECRET` conferido; teste manual no site publicado (login, upload,
  download, exclusão, senha fraca). **Abertos por decisão:** backup automático
  (Supabase Pro, na assinatura do contrato; risco aceito até lá) e itens
  jurídicos da LGPD (aguardando informação do responsável).
- **Teste de ataque de ponta a ponta com OWASP ZAP (12/10/2026).** Scan não
  autenticado + scan autenticado (login manual guiado no Chrome proxiado pelo
  ZAP, navegação por Comercial, Usuários, Arquivos, Configurações, Engenharia,
  Export) seguido de Varredura Ativa (política "Dev Standard": XSS, SQLi, etc.)
  contra o banco e o `next start` (build de produção) LOCAIS. **13 tipos de
  alerta, todos revisados manualmente — nenhuma vulnerabilidade real:**
  CSRF ausente (falso positivo — Next.js protege via checagem de `Origin`,
  não por token visível no HTML), XSS potencial em atributo HTML (falso
  positivo — campo interno `$ACTION_1:0` do Next.js, não dado de usuário),
  divulgação de data Unix e comentário suspeito (falsos positivos — código
  de `node_modules`/React, não do projeto), CSP unsafe-eval/inline (decisão já
  documentada, só em dev), Content-Type/HSTS/X-Content-Type-Options "ausentes"
  (na maioria tráfego de fundo do Chrome para domínios do Google que entrou
  no proxy por engano, não do app) e Modern Web Application/Session Management
  Response (puramente informativos, o próprio ZAP marca "nada a corrigir").
  **Achado único que mereceu investigação de código:** cookie `sb-*-auth-token`
  sem `HttpOnly` — confirmado como o DEFAULT da própria biblioteca
  `@supabase/ssr` (`httpOnly:false` em `node_modules/@supabase/ssr/.../
  constants.js`) e **necessário**: o app de campo (`src/app/campo/
  CampoProvider.tsx`, PWA offline dos instaladores) usa `createBrowserClient`
  e precisa ler o token de sessão via JS para chamar RPCs direto do navegador
  quando offline. Risco aceito, mitigado pela CSP (`script-src 'self'`, sem
  `unsafe-eval` em produção) que é a defesa real contra o XSS que tornaria
  esse cookie explorável. **Achado de rota real, verificado também contra a
  nuvem:** `/__nextjs_font/<arquivo>.woff2` respondia 200 sem os headers de
  segurança no `next start` local — mas o mesmo caminho na Vercel
  (`https://saas-vidracaria.vercel.app`) responde 307 para `/login` com todos
  os headers presentes (CSP, HSTS, nosniff, X-Frame-Options); sem exposição em
  produção. **Limite do teste:** cobriu as telas navegadas manualmente; não é
  substituto de um pentest profissional externo, recomendado antes de dado
  real de cliente em volume.
- **Melhorias do responsável do produto, item 4 (12/10/2026) — percentual de
  quebra passa a ser do item, não mais de uma configuração por tipo de
  material + processo.** Decisão: substituir totalmente (não é um override).
  Migration `20261012235145_percentual_quebra_no_item.sql`: coluna
  `itens.percentual_quebra` (nullable — NULL preserva "sem quebra conhecida",
  nunca dispara alerta de tolerância; backfill a partir do valor geral já
  configurado em `cutting_margin_settings` por classificação, quando havia);
  `upsert_item()` ganha `p_percentual_quebra`; `lista_corte`,
  `lista_corte_lote_fabril` e `verificar_tolerancia_perda` passam a ler
  `itens.percentual_quebra` em vez de `get_cutting_margin(classificação, '')`.
  UI (Engenharia → Itens) ganhou o campo e a coluna na lista.
  **Duas pegadinhas achadas e corrigidas no processo:**
  (1) `CREATE OR REPLACE FUNCTION` com uma assinatura de aridade diferente
  cria uma SOBRECARGA nova em vez de substituir a função antiga — sem o
  `DROP FUNCTION` explícito da versão de 7 argumentos, ficavam duas
  `upsert_item` coexistindo e a chamada nomeada via PostgREST ficava ambígua.
  (2) a função nova (mesmo via `CREATE OR REPLACE`) nasce sem `EXECUTE` pra
  `authenticated` — efeito colateral do achado 4 da auditoria (fechamento do
  `EXECUTE` padrão), exigiu `GRANT` explícito na própria migration.
  Testado: `test-cadastros.mjs` seção 4a (vermelho sem a migration, verde
  com ela) e `test-producao.mjs` seções 11 e 28 atualizadas pra configurar o
  percentual no item da fixture em vez de via `upsert_cutting_margin`.
  **Pendência deixada em aberto, sem ação ainda:** `cutting_margin_settings`,
  `get_cutting_margin()`, `upsert_cutting_margin()`, `importar_cutting_margin_
  settings()` e a aba "Margem de quebra" em Configurações Gerais continuam
  no ar, mas não alimentam mais nenhum cálculo — ficou uma tela que configura
  algo que não tem mais efeito. Decidir com o responsável se remove.
  `importar_itens()` também não ganhou a coluna nesta rodada (import de item
  continua sem jeito de trazer o percentual de quebra já preenchido).
- **Melhorias do responsável do produto, item 9 (12/10/2026) — Fila de
  Produção sai do topo do menu e entra como aba de Produção.** Era uma rota
  irmã (`/fila-producao`, item próprio no menu), virou a aba "Fila de
  Produção" dentro de `/producao` (`?tab=fila`), mesmo padrão das outras 8
  abas do módulo. `FilaProducaoSection.tsx` e a função (`listar_fila_
  producao()`, sem mudança nenhuma no banco) migraram de pasta; a rota
  `/app/fila-producao` foi removida. `test-fila-producao.mjs` continua
  verde sem alteração (testa a RPC direto, não a página). Reorganização de
  tela, sem decisão de produto nova — não precisou de pergunta ao
  responsável.
- **Testes órfãos corrigidos:** `test-lgpd-pessoa`, `test-export` e
  `test-limite-usuarios` existiam e passam, mas não estavam no `run-tests.mjs`.
  `test-imagem-exif` (novo) prova que a foto de obra perde EXIF/GPS no upload
  (regressão simulada com `.withMetadata()` faz o teste falhar).
- **Inventário de dados pessoais** (rascunho de 23/09): não cobre chave PIX
  (`contas_bancarias`, `fornecedor_dados`, `cobrancas`), `propostas`
  (`destinatario`), `documentos_fiscais.dados` nem `integracao_operacoes.payload`.
  A validação jurídica (finalidade, base, prazo) segue sendo decisão humana.

### Ambiente de teste local (aprendizado)

`npm test` falhou em 6 scripts (todos por upload na Storage) porque o
container da Storage ficou numa versão antiga (1.73.1) enquanto o schema foi
migrado pela v1.77.5 fixada pelo CLI: `INSERT … ON CONFLICT (name,
bucket_id)` retornava `42P10`. Resolvido com `supabase stop && supabase
start` (recria os containers). Se a falha reaparecer após atualizar o CLI,
repetir. Não era defeito do código do projeto.
