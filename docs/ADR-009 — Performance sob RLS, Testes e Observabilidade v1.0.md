**ADR-009 — Performance sob RLS, Testes e Observabilidade**

**Status:** APROVADO\
**Versão:** 1.1\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 12/09/2026\
**Decisão:** Padrões de performance sob RLS, estratégia de testes e estratégia de observabilidade do SaaS\
**Decisão vinculada:** ADR-001, ADR-002, ADR-003, ADR-005, ADR-007

**1. Contexto**

A auditoria de setembro/2026 identificou três pontos que deveriam ser
aprofundados no projeto: **performance sob RLS**, **estratégia de
testes** e **observabilidade**.

Os três já possuem base documental no TÓPICO 1 — Base / Estrutura: o
§21 trata de banco de dados e índices, o §25 define diretrizes de
observabilidade e o §27 estabelece a cobertura obrigatória de testes.

Este ADR **não substitui essas diretrizes — ele as aprofunda**,
transformando orientação em decisão verificável: padrões concretos de
índice e de escrita de policy, execução automatizada dos testes com
gate de promoção, e separação explícita entre auditoria de negócio e
observabilidade técnica.

O projeto já avançou pelas fases de fundação de segurança, storage,
auditoria, backup, governança e testes de segurança, e hoje possui
migrations criadas, políticas de RLS ativas e scripts de verificação.
Este ADR formaliza decisões sobre esses três temas antes que o volume de
dados e de código torne as correções caras.

**2. Problema**

**2.1 Performance sob RLS**

O isolamento entre empresas é feito por RLS, e toda policy filtra por
`company_id` ou consulta funções auxiliares. Isso significa que o
desempenho de praticamente todas as consultas do sistema depende de como
as policies são escritas e de quais índices existem.

O TÓPICO 1 §21 exige "índices necessários" e orienta a "evitar índices
sem justificativa", mas não define quais índices o modelo multi-tenant
torna obrigatórios. O resultado prático está abaixo.

Verificação do estado atual (setembro/2026):

as funções auxiliares `current_company_id()`, `is_platform_admin()` e
`has_permission()` estão corretamente declaradas como `stable security
definer set search_path = public` — este padrão deve ser preservado;

**não existem índices nas colunas `company_id`** das tabelas
`company_units`, `profiles`, `roles` e `activity_logs`, embora todas
sejam filtradas por `company_id` em suas policies. O PostgreSQL não cria
índice automaticamente para chaves estrangeiras;

a tabela `activity_logs` é a mais sensível: é de crescimento contínuo,
sua policy combina `company_id` com `has_permission()`, e não possui
índice;

algumas policies chamam `auth.uid()` diretamente, o que pode levar à
reavaliação por linha.

**2.2 Testes**

O TÓPICO 1 §27 já define **o que** deve ser testado nos mecanismos
estruturais: multi-tenant e acesso cruzado, identificadores, auditoria,
segurança, configuração, integridade e eventos. Essa lista permanece
válida e é a base da cobertura obrigatória.

O que falta é **como garantir a execução**. Existem scripts de
verificação (`test-foundation-rls`, `test-storage-rls`,
`test-audit-events`, `test-governance`, `test-mfa-and-password`,
`test-security-phase7`, `test-restore`), mas:

não há framework de testes instalado;

não existe script `test` no `package.json`;

não há integração contínua configurada;

a execução depende de alguém lembrar de rodar manualmente.

O Prompt Mestre de Segurança já define o pipeline conceitual — Código →
Lint → Typecheck → Testes → Testes RLS → Testes Multi-Tenant → Testes de
autorização → Teste de Storage → Verificação de secrets — mas ele não
está automatizado.

**2.3 Observabilidade**

O TÓPICO 1 §25 já orienta logs estruturados, identificação da operação,
contexto de tenant e usuário, correlação entre operações e proteção de
dados sensíveis. A Arquitetura Mestre trata o tema no item 15.6.

O que falta é a decisão sobre **o que monitorar, com quais alertas e
onde isso vive**: hoje o sistema possui auditoria de negócio
(`activity_logs`), que responde "quem fez o quê", mas não há distinção
formal entre esse registro e a observabilidade técnica, que responde "o
sistema está saudável, o que quebrou e por quê".

**3. Decisão — Performance sob RLS**

**3.1 Índices obrigatórios**

Toda coluna utilizada em policy de RLS como filtro de isolamento deverá
possuir índice.

Em particular, deverão ser criados índices para `company_id` em todas as
tabelas multi-tenant, e índices para as colunas de junção usadas pelas
funções de permissão (`user_roles.profile_id`, `role_permissions.role_id`,
`permissions(resource, action)`).

Nenhuma tabela multi-tenant nova poderá ser criada sem o índice
correspondente na mesma migration.

**3.2 Padrão de escrita das policies**

Funções auxiliares usadas em policies deverão permanecer `stable`,
`security definer` e com `search_path` fixado.

Chamadas a `auth.uid()` e a funções auxiliares dentro de policies
deverão ser envolvidas em subselect — por exemplo `(select auth.uid())`
e `(select public.current_company_id())` — de modo que o planejador as
avalie uma vez por consulta, e não por linha.

Policies baseadas em `exists (...)` são aceitáveis, desde que as colunas
de junção estejam indexadas.

Toda escrita estrutural continua passando pelo servidor, conforme já
definido na fundação — RLS permanece como mecanismo de isolamento, não
como substituto da validação no servidor.

**3.3 Verificação de desempenho**

Consultas das telas de maior uso e das tabelas de crescimento contínuo
(`activity_logs`, arquivos, pedidos, produção) deverão ser verificadas
com `EXPLAIN ANALYZE` executando como usuário autenticado de um tenant,
e não apenas como administrador — uma consulta rápida sem RLS pode ser
lenta sob RLS.

A verificação deverá ser refeita sempre que uma tabela multi-tenant nova
for criada ou quando uma policy for alterada.

**3.4 Volume e crescimento**

Tabelas de crescimento contínuo deverão ter política de retenção,
arquivamento ou particionamento avaliada antes da entrada em produção,
começando por `activity_logs`.

**Decisão registrada (Security Gate Fase 8, 13/09/2026): retenção de
`activity_logs` = 24 meses.** Implementado em
`20260913120000_adr009_activity_logs_retention.sql`:
`purge_activity_logs_older_than_retention()`, restrita a platform_admin,
abre uma exceção deliberada e auditada ao trigger de imutabilidade (só
para DELETE de linhas com mais de 24 meses — o próprio trigger recusa
expurgar linha mais nova, mesmo com o GUC de expurgo ligado) e registra o
expurgo na própria trilha de auditoria. Testado em
`scripts/test-activity-logs-retention.mjs`. **Não agendado
automaticamente** (sem `pg_cron`) — decisão de rodar em produção (e com
que frequência) fica para quando o ambiente definitivo estiver de pé; até
lá, é um procedimento manual disponível a platform_admin.

**4. Decisão — Estratégia de testes**

**4.1 Níveis**

Serão adotados três níveis, com propósitos distintos:

**Testes de segurança e isolamento** (obrigatórios): a cobertura
definida no TÓPICO 1 §27 — multi-tenancy e acesso cruzado,
identificadores, auditoria, segurança, configuração, integridade e
eventos — acrescida de RLS, storage e MFA. São os testes que já existem
como scripts e que passam a ser suíte formal.

**Testes de regra de negócio**: estados, transições e regras críticas
dos módulos (ex.: liberação para produção sem medida confirmada,
aprovação de nova fabricação).

**Testes de fluxo ponta a ponta**: os fluxos principais do MVP, conforme
ADR-002.

**4.2 Automação**

Deverá existir um comando único de execução (`npm test`) que rode a
suíte completa.

Os scripts de verificação existentes deverão ser incorporados a essa
suíte, preservando o que já cobrem — não deverão ser descartados nem
reescritos sem necessidade.

A escolha do framework de testes permanece decisão técnica de
implementação, desde que permita execução por linha de comando e em
integração contínua.

**4.3 Integração contínua**

Deverá ser configurada integração contínua executando, a cada alteração
enviada ao repositório, o pipeline já definido no Prompt Mestre de
Segurança: lint, typecheck, testes, testes de RLS, testes multi-tenant,
testes de autorização, teste de storage e verificação de secrets.

Falha em teste crítico impede a promoção da alteração, conforme a regra
já estabelecida no Prompt Mestre.

**4.4 Dados de teste**

Nunca utilizar dados de produção em testes, conforme já definido no
Prompt Mestre de Segurança. A suíte deverá criar e destruir seus
próprios tenants e usuários de teste.

**4.5 Teste de restauração**

O teste de restauração de backup permanece obrigatório e deverá ser
executado periodicamente, com registro da data do último teste
bem-sucedido, conforme já previsto.

**5. Decisão — Observabilidade**

**5.1 Separação de responsabilidades**

Auditoria e observabilidade são coisas diferentes e não devem ser
confundidas:

**Auditoria** (`activity_logs`): registro de negócio, "quem fez o quê",
com valor legal e de rastreabilidade, sujeito às regras de proteção já
definidas;

**Observabilidade**: saúde técnica do sistema — erros, latência,
falhas de integração, disponibilidade.

Observabilidade não deverá ser implementada gravando eventos técnicos
dentro da tabela de auditoria.

**5.2 O que deve ser observável**

Conforme o item 15.6 da Arquitetura Mestre, deve ser possível
identificar onde ocorreu, quando ocorreu, por que ocorreu, quantas
tentativas houve, qual a consequência e qual a ação necessária.

Para isso deverão ser registrados, no mínimo:

erros de aplicação, com contexto suficiente para diagnóstico;

falhas de autenticação e autorização em volume anormal;

falhas de integração e de webhooks, com tentativas e reprocessamentos;

falhas de upload e de storage;

falhas de jobs e rotinas automáticas;

latência das operações críticas;

indisponibilidade de dependências externas.

**5.3 Correlação**

Deverá existir um identificador de correlação por requisição,
permitindo relacionar erro, usuário, tenant e operação — sem expor dados
sensíveis.

**5.4 Proteção de dados nos registros técnicos**

Registros técnicos não deverão conter segredos, tokens, senhas, dados
pessoais desnecessários ao diagnóstico, nem conteúdo de documentos.

O isolamento entre empresas deve ser preservado também na
observabilidade: identificar o tenant é necessário, expor seus dados não
é.

**5.5 Alertas mínimos**

Deverão existir alertas para: indisponibilidade da aplicação, taxa
anormal de erros, falha de backup, falha recorrente de integração e
esgotamento de capacidade (storage, limites de plano).

**5.6 Ferramenta**

A escolha da ferramenta específica de observabilidade permanece decisão
futura. A arquitetura deverá permitir sua adoção sem reescrita —
registros estruturados e ponto único de captura de erro.

**6. Alternativas consideradas**

**Alternativa A — Confiar que RLS "simplesmente funciona" e tratar
performance depois.** Rejeitada: índices e padrão de policy são baratos
agora e caros depois, quando já houver volume e dependência das
consultas existentes.

**Alternativa B — Manter os testes como scripts executados manualmente.**
Rejeitada: um teste que depende de alguém lembrar de rodar não é
garantia; a Fase 7 exige testes completos e o piloto exige confiança
contínua.

**Alternativa C — Usar a tabela de auditoria também como log técnico.**
Rejeitada: mistura registro de negócio com ruído técnico, prejudica
retenção, custo e a própria auditoria.

**Alternativa D — Padrões explícitos de RLS, suíte automatizada em CI e
observabilidade separada da auditoria.** **Aprovada.**

**7. Consequências aceitas**

Custo adicional de manutenção de índices e de escrita disciplinada de
policies; tempo de configuração da integração contínua; necessidade de
manter a suíte de testes atualizada conforme os módulos evoluem; e
introdução de mais um componente (observabilidade) na operação.

**8. Consequências não aceitas**

Não são aceitos: tabela multi-tenant sem índice na coluna de
isolamento; policy nova sem verificação de desempenho; alteração
promovida sem execução dos testes críticos; uso de dados de produção em
teste; registro técnico contendo segredos ou dados pessoais
desnecessários; e observabilidade gravada dentro da tabela de auditoria.

**9. Ação corretiva imediata**

Como o código já existente foi criado antes desta decisão, deverá ser
executada uma correção pontual, sem alterar comportamento funcional:

criar índice de `company_id` em `activity_logs` — **a única das tabelas
citadas sem cobertura**;

**correção de 12/09/2026:** a redação original desta seção listava também
`company_units`, `profiles`, `roles` e as colunas de junção de
`has_permission()`. Verificação posterior no schema mostrou que todas já
possuem índice utilizável, como efeito de UNIQUE constraints existentes
desde a Fase 2, todas com a coluna necessária como líder:
`company_units_company_code_unique (company_id, code)`,
`profiles_company_login_unique (company_id, login_identifier)`,
`roles_company_key_unique (company_id, key)`,
`user_roles_no_duplicate (profile_id, ...)`,
`role_permissions` (PK `role_id, permission_id`) e
`permissions_resource_action_unique (resource, action)`. Um índice
B-tree composto atende igualdade pela coluna líder, portanto índices
dedicados adicionais seriam redundantes e contrariariam o princípio de
evitar índice sem justificativa (T1 §21). **Não criar esses índices.**

criar índice para a consulta de anonimização do ADR-010 —
`activity_logs (user_id) where anonymized_at is null`;

revisar as policies existentes para o padrão de subselect;

verificar com `EXPLAIN ANALYZE`, como usuário de tenant, as consultas
sobre `activity_logs` e `files`.

**10. Dependências**

**TÓPICO 1 — Base / Estrutura**: §21 (banco de dados e índices), §25
(observabilidade) e §27 (cobertura de testes) são a base que este ADR
aprofunda. Em caso de dúvida, o T1 define a diretriz e este ADR define
como verificá-la.

**ADR-001 — Usuários/Permissões**: as funções de permissão são
executadas dentro das policies e afetam desempenho.

**ADR-002 — MVP**: define o alcance dos testes de fluxo.

**ADR-003 — Cliente-Piloto**: a operação real da JR Box é o primeiro
teste de carga verdadeiro do sistema.

**ADR-005 — Offline**: sincronização gera picos de escrita e precisa ser
observável.

**ADR-007 — Notificações**: falhas de envio são evento de
observabilidade, não de auditoria.

Este ADR permanece subordinado à Arquitetura Mestre e ao Prompt Mestre
de Segurança, cujo pipeline de qualidade este documento apenas
automatiza e detalha.

**11. Governança**

Alterações neste ADR deverão registrar decisão anterior, nova decisão,
motivo, impacto e versão, preservando o histórico.

**12. Princípio final**

**Isolamento correto não basta se for lento; teste que depende de
memória humana não é garantia; e sistema que não conta o que está
acontecendo só é diagnosticado pelo cliente.**

**Status final: APROVADO**
