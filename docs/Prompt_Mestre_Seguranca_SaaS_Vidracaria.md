**PROMPT MESTRE**

**Segurança, Autenticação, Multi-Tenant, Auditoria, Backup e Governança
do SaaS**

Documento de referência para utilização no Claude Code. O conteúdo
abaixo deve ser tratado como requisito arquitetural e de segurança do
projeto.

PROMPT MESTRE — SEGURANÇA, AUTENTICAÇÃO, MULTI-TENANT, AUDITORIA, BACKUP
E GOVERNANÇA

**0. INSTRUÇÃO PRINCIPAL**

Você está desenvolvendo um SaaS multiempresa para gestão de vidraçarias.

O sistema armazenará dados empresariais e dados pessoais de clientes
reais.

SEGURANÇA, ISOLAMENTO DE DADOS, AUTENTICAÇÃO, AUTORIZAÇÃO, AUDITORIA,
BACKUP E RECUPERAÇÃO DE DESASTRES SÃO REQUISITOS CRÍTICOS.

Não trate segurança como uma funcionalidade opcional ou como uma etapa
posterior.

A segurança deve fazer parte da arquitetura desde o início.

**REGRA ABSOLUTA**

Nunca considerar o frontend como mecanismo de segurança.

Ocultar botões, menus ou páginas não constitui autorização.

Toda autorização crítica deverá ser aplicada no servidor e/ou banco de
dados.

**1. STACK**

Utilizar:

- Next.js

- TypeScript

- Tailwind CSS

- Supabase

- PostgreSQL

- Supabase Auth

- Supabase Storage

- Vercel

- Git/GitHub

Utilizar Node.js LTS.

Não adicionar serviços externos sem necessidade.

Sempre priorizar simplicidade, segurança, manutenção e baixo custo
operacional.

**2. ANÁLISE OBRIGATÓRIA ANTES DE ALTERAR O PROJETO**

ANTES de escrever ou alterar código:

**1. analisar a estrutura atual do projeto;**

**2. identificar framework e versões;**

**3. identificar configuração do Supabase;**

**4. identificar banco e migrations existentes;**

**5. identificar autenticação existente;**

**6. identificar RLS existente;**

**7. identificar tabelas;**

**8. identificar políticas;**

**9. identificar Storage;**

**10. identificar variáveis de ambiente;**

**11. verificar possíveis secrets expostos;**

**12. verificar arquitetura multi-tenant;**

**13. verificar permissões;**

**14. verificar logs/auditoria;**

**15. verificar estratégia de backup;**

**16. identificar vulnerabilidades ou inconsistências.**

Não assumir que a arquitetura atual está correta.

Apresentar primeiro um diagnóstico objetivo.

Não destruir ou reescrever funcionalidades existentes sem necessidade.

**3. ARQUITETURA MULTI-TENANT**

O sistema será SaaS multiempresa.

Cada empresa deverá possuir isolamento lógico completo.

Estrutura conceitual:

**SUPER_ADMIN**

├── Empresa A

│ ├── Usuários

│ ├── Clientes

│ ├── Projetos

│ ├── Pedidos

│ ├── Produção

│ ├── Instalações

│ └── Arquivos

└── Empresa B

├── Usuários

├── Clientes

├── Projetos

├── Pedidos

├── Produção

├── Instalações

└── Arquivos

Todas as entidades pertencentes a uma empresa deverão estar vinculadas a
company_id.

Entidades principais:

- companies

- profiles

- clients

- projects

- orders

- order_items

- order_stages

- installations

- files

- activity_logs

- subscriptions

- plans

- invitations

**4. COMPANY_ID**

Nunca confiar em company_id enviado pelo frontend.

O sistema deverá determinar a empresa a partir da identidade autenticada
do usuário e das relações existentes no banco.

Um usuário não pode simplesmente alterar company_id para acessar dados
de terceiros.

Toda operação deverá validar:

usuário autenticado → usuário ativo → empresa ativa → empresa do usuário
→ permissão → registro pertencente à empresa.

**5. ROW LEVEL SECURITY — RLS**

RLS deverá ser utilizado como principal mecanismo de isolamento entre
empresas.

Ativar RLS em todas as tabelas que armazenam dados de clientes.

Criar policies para:

- SELECT

- INSERT

- UPDATE

- DELETE

As policies deverão impedir acesso entre empresas mesmo que o usuário
manipule diretamente URL, IDs, parâmetros, payloads, chamadas de API,
ferramentas de desenvolvedor ou requisições HTTP.

Se um usuário pertence à Empresa A:

Empresa A → permitido

Empresa B → negado

Empresa C → negado

**6. TESTE OBRIGATÓRIO DE ISOLAMENTO**

Criar testes específicos para multi-tenancy.

Criar:

Empresa A / Usuário A

Empresa B / Usuário B

Testar:

- SELECT

- INSERT

- UPDATE

- DELETE

- acesso por ID

- acesso via API

- acesso a Storage

- acesso a projetos

- acesso a pedidos

- acesso a instalações

- acesso a logs

Usuário A nunca poderá acessar dados da Empresa B.

**7. AUTENTICAÇÃO**

Utilizar Supabase Auth.

Não criar sistema próprio de armazenamento de senhas.

Implementar:

- login

- logout

- recuperação de senha

- alteração de senha

- sessão segura

- proteção de rotas

- renovação segura da sessão

- bloqueio de usuários desativados

Nunca armazenar senhas em tabelas próprias.

**8. CONTROLE DE SESSÃO**

Toda área protegida deverá verificar a sessão.

Validar:

- usuário autenticado

- sessão válida

- usuário ativo

- empresa ativa

- role

- permissões

Se active = false, o acesso deverá ser bloqueado.

**9. ROLES**

Utilizar inicialmente:

- SUPER_ADMIN

- ADMIN

- COMERCIAL

- PRODUCAO

- INSTALACAO

SUPER_ADMIN:

Representa o proprietário/equipe do SaaS.

Pode administrar empresas, planos, assinaturas, usuários, métricas,
suporte, uso, infraestrutura e logs administrativos.

Não deve possuir acesso irrestrito e silencioso aos dados operacionais
dos clientes.

Acesso administrativo sensível deverá ser auditado.

ADMIN:

Administrador da empresa cliente. Pode administrar somente a própria
empresa.

COMERCIAL:

Acesso às funções comerciais.

PRODUCAO:

Acesso às funções de produção.

INSTALACAO:

Acesso às funções de instalação.

Aplicar princípio do menor privilégio.

**10. AUTORIZAÇÃO**

Para cada funcionalidade definir:

- Quem pode visualizar?

- Quem pode criar?

- Quem pode editar?

- Quem pode excluir?

- Quem pode administrar?

Não utilizar apenas verificações no React.

As permissões críticas devem ser aplicadas no servidor/banco.

**11. SERVICE ROLE**

A variável SUPABASE_SERVICE_ROLE_KEY é extremamente sensível.

Nunca:

- expor no navegador

- utilizar em NEXT_PUBLIC\_\*

- colocar no Git

- colocar em código público

- enviar ao cliente

- incluir em logs

Utilizar apenas server-side e somente quando realmente necessário.

Preferir RLS sempre que possível.

**12. SECRETS**

Nunca armazenar secrets diretamente no código.

Utilizar .env.local para desenvolvimento e secrets protegidos nos
ambientes de deployment.

Garantir .gitignore adequado.

Se um secret for exposto:

**1. considerar comprometido;**

**2. rotacionar imediatamente;**

**3. atualizar ambientes;**

**4. verificar utilização indevida;**

**5. registrar incidente.**

**13. AMBIENTES**

Separar:

- DEV

- STAGING

- PRODUCTION

Nunca utilizar produção para testes.

Nunca utilizar dados reais de clientes em desenvolvimento sem
autorização e anonimização adequada.

Cada ambiente deverá possuir banco, Storage, secrets e configurações
próprios.

**14. DATABASE MIGRATIONS**

Toda alteração estrutural do banco deverá ser versionada.

Utilizar migrations para:

- tabelas

- colunas

- índices

- enums

- funções

- triggers

- RLS

- policies

Nunca alterar produção manualmente sem controle/versionamento.

**15. VALIDAÇÃO DE ENTRADA**

Validar todos os dados recebidos.

Utilizar Zod ou solução equivalente quando apropriado.

Validar:

- tipos

- tamanhos

- formatos

- IDs

- datas

- valores

- arquivos

- MIME types

- extensões

- limites

Nunca confiar nos dados enviados pelo navegador.

**16. SOFT DELETE**

Evitar exclusão física de informações importantes.

Utilizar deleted_at e deleted_by quando apropriado.

Aplicar principalmente a:

- clientes

- projetos

- pedidos

- itens

- instalações

- documentos

Permitir restauração quando tecnicamente possível.

Exclusões definitivas devem ser restritas, confirmadas e auditadas.

**17. AUDITORIA**

Criar activity_logs.

Campos recomendados:

- id

- company_id

- user_id

- action

- entity_type

- entity_id

- description

- metadata

- ip_address

- user_agent

- created_at

Registrar no mínimo:

Autenticação: login, logout, falha de login, recuperação de senha,
alteração de senha, eventos MFA.

Usuários: criação, convite, alteração de role, ativação, desativação.

Dados: criação, alteração, exclusão, restauração.

Pedidos: criação, alteração de medidas, valores e status, aprovação,
cancelamento, conclusão.

Instalações: criação, agendamento, alteração, reagendamento,
cancelamento, conclusão.

Administração: alteração de empresa, plano, assinatura, configurações e
acesso de suporte.

**18. LOGS DE AUDITORIA**

Usuários comuns não podem apagar ou alterar logs de auditoria.

Não armazenar nos logs:

- senhas

- tokens

- secrets

- informações desnecessariamente sensíveis

**19. STORAGE**

Arquivos não devem ser armazenados dentro do PostgreSQL.

PostgreSQL → metadados do arquivo

Storage → arquivo físico

Estrutura lógica sugerida:

company/{company_id}/projects/{project_id}/orders/{order_id}/

**20. STORAGE PRIVADO**

Utilizar buckets privados para arquivos empresariais.

Não utilizar URLs públicas para informações privadas.

Utilizar URLs assinadas/temporárias quando apropriado.

Garantir que Empresa A só acesse arquivos A e Empresa B só acesse
arquivos B.

**21. UPLOAD**

Implementar:

- limite de tamanho

- validação de MIME

- validação de extensão

- limite de quantidade

- limite de consumo

- proteção contra arquivos maliciosos

Para imagens:

imagem original → validação → redimensionamento → compressão → formato
eficiente → Storage

Não armazenar fotos gigantescas sem necessidade.

**22. LIMITES DE STORAGE**

O SaaS deverá possuir limites de armazenamento por plano.

Os valores deverão ser configuráveis.

Ao atingir 80%: gerar alerta.

Ao atingir 100%: impedir novos uploads ou aplicar a política definida
pelo plano.

Nunca permitir crescimento silencioso e ilimitado que gere custos
inesperados.

**23. LIMITES DE USUÁRIOS**

O número máximo de usuários será uma regra comercial do plano.

Exemplo:

START → 5 usuários

PROFESSIONAL → 15 usuários

PREMIUM → 30 usuários

Implementar:

companies → subscription → plan → max_users

O sistema deverá impedir a criação de usuários acima do limite.

**24. MONITORAMENTO DE CONSUMO**

Acompanhar por empresa:

- usuários

- usuários ativos

- Storage

- banco

- pedidos

- projetos

- arquivos

- consumo mensal

- plano

- status da assinatura

Painel SUPER_ADMIN deverá mostrar essas informações.

**25. PROTEÇÃO CONTRA ABUSO**

Criar limites e monitoramento para:

- uploads

- login

- recuperação de senha

- convites

- operações administrativas

- APIs

- operações em massa

Detectar comportamento anormal e registrar eventos relevantes.

**26. RATE LIMITING**

Avaliar e implementar rate limiting para:

- login

- recuperação de senha

- convite

- upload

- APIs

- operações administrativas

Não permitir abuso que possa gerar custos ou indisponibilidade.

**27. MFA**

Implementar MFA para administradores.

Recomendação:

SUPER_ADMIN → obrigatório

ADMIN → obrigatório ou fortemente recomendado

demais usuários → opcional inicialmente

Eventos relacionados a MFA deverão ser auditados.

**28. CONVITES**

Fluxo:

ADMIN → convite → token temporário → usuário recebe convite → define
senha → conta ativada

Tokens devem:

- expirar

- não ser reutilizáveis

- ser invalidados após uso

- não aparecer em logs

**29. FUNCIONÁRIO DESLIGADO**

Ao desligar um funcionário:

active = false

Bloquear acesso.

Não apagar automaticamente pedidos, projetos, histórico, logs ou
registros criados.

Preservar rastreabilidade.

**30. CANCELAMENTO DE EMPRESA**

Fluxo:

ATIVA → CANCELAMENTO → SUSPENSA → RETENÇÃO → EXCLUSÃO DEFINITIVA

Nunca apagar imediatamente.

Preservar os dados durante o período definido pela política do SaaS.

A exclusão definitiva deverá exigir autorização, ser auditada, seguir
política de retenção e considerar obrigações legais/contratuais.

**31. INADIMPLÊNCIA**

Criar estados de assinatura:

- ACTIVE

- PAST_DUE

- SUSPENDED

- CANCELED

Definir claramente o que cada estado permite.

Nunca apagar os dados simplesmente porque a empresa está inadimplente.

**32. EXPORTAÇÃO DE DADOS**

Preparar exportação dos dados de uma empresa:

- clientes

- projetos

- pedidos

- itens

- instalações

- histórico

- arquivos

A exportação deverá respeitar autorização e ser auditada.

**33. SUPORTE / ACESSO ADMINISTRATIVO**

Se implementada a função de acessar uma empresa para suporte, tratar
como operação altamente sensível.

Não implementar simplesmente como SUPER_ADMIN = acesso irrestrito.

Criar:

- autorização explícita

- motivo obrigatório

- sessão temporária

- identificação visual de modo suporte

- auditoria de início/fim

- auditoria das ações realizadas

- expiração automática

- impossibilidade de alterar senha do cliente

- impossibilidade de elevar privilégios permanentemente

**34. BACKUP DO BANCO**

Produção deverá utilizar infraestrutura com backup automático adequado.

Recomendação inicial:

Supabase Pro ou plano superior.

Backup automático diário.

Manter política de retenção documentada.

**35. BACKUP EXTERNO**

Não depender exclusivamente do backup primário.

Planejar segunda cópia externa/off-site.

A cópia deverá estar protegida contra exclusão acidental e
comprometimento do ambiente principal.

**36. BACKUP DO STORAGE**

Backup do PostgreSQL NÃO significa backup dos arquivos do Storage.

Criar estratégia separada para:

- fotos

- PDFs

- documentos

- anexos

Manter relação entre empresa, projeto, pedido e arquivo.

**37. RECUPERAÇÃO DE DESASTRES**

Documentar procedimentos para:

- exclusão acidental

- exclusão em massa

- banco corrompido

- arquivos perdidos

- conta comprometida

- secrets vazados

- falha do provedor

- indisponibilidade

Definir RPO e RTO realistas.

Não prometer ao cliente valores que a infraestrutura não suporta.

**38. TESTE DE RESTAURAÇÃO**

Não considerar backup válido apenas porque está configurado.

Periodicamente:

backup → ambiente isolado → restauração → validação → relatório

Validar:

- quantidade de registros

- relacionamentos

- integridade

- permissões

- arquivos

- funcionamento da aplicação

Nunca testar restauração destrutiva diretamente em produção.

**39. PROTEÇÃO CONTRA EXCLUSÃO EM MASSA**

Operações perigosas deverão possuir proteção.

Exclusão de 1 registro → confirmação

Exclusão de dezenas → confirmação adicional

Exclusão em massa → autorização administrativa

Registrar tudo em auditoria.

**40. TRATAMENTO DE ERROS**

Nunca expor ao usuário:

- SQL

- stack trace

- secrets

- tokens

- detalhes internos

- informações da infraestrutura

Mostrar mensagens amigáveis.

Registrar detalhes técnicos somente em ambiente seguro.

**41. PROTEÇÃO CONTRA ENUMERAÇÃO**

Não permitir que usuários descubram facilmente:

- IDs válidos

- clientes existentes

- pedidos existentes

- dados de outras empresas

Respostas de erro não devem revelar informações desnecessárias.

**42. MONITORAMENTO**

Painel SUPER_ADMIN deverá possuir indicadores de segurança e
infraestrutura:

- RLS ativo

- Storage privado

- Backup ativo

- último backup

- último teste de restauração

- MFA administradores

- falhas de login

- eventos críticos

- Storage utilizado

- banco utilizado

**43. ALERTAS**

Planejar alertas para:

- falhas repetidas de login

- alteração de role

- criação de SUPER_ADMIN

- acesso de suporte

- exclusão em massa

- tentativas de acesso negadas

- consumo anormal

- Storage próximo do limite

- falha de backup

- falha de restauração

- secret comprometido

- alteração de configuração crítica

**44. LGPD**

A arquitetura deverá considerar os princípios da LGPD.

Preparar o sistema para:

- controle de acesso

- rastreabilidade

- identificação de dados pessoais

- exportação

- correção

- exclusão quando aplicável

- retenção

- segurança

- resposta a incidentes

Não criar funcionalidades que entrem em conflito com obrigações legais.

**45. SECURITY GATE — ANTES DE CADA DEPLOY DE PRODUÇÃO**

Nenhuma release deverá ser considerada pronta antes de executar:

Código → Lint → Typecheck → Testes → Testes RLS → Testes Multi-Tenant →
Testes de autorização → Teste de Storage → Verificação de secrets →
Verificação de migrations → Revisão de permissões → Revisão de auditoria
→ Revisão de backup → Security Review → DEPLOY

Se qualquer teste crítico falhar:

NÃO realizar deploy de produção.

**46. CHECKLIST DE SEGURANÇA PRÉ-PRODUÇÃO**

- [ ] Supabase Auth funcionando

- [ ] Recuperação de senha

- [ ] MFA

- [ ] RLS habilitado

- [ ] RLS testado

- [ ] Isolamento entre empresas testado

- [ ] Roles implementadas

- [ ] Permissões testadas

- [ ] Service Role protegida

- [ ] Secrets protegidos

- [ ] Storage privado

- [ ] URLs protegidas

- [ ] Upload validado

- [ ] Compressão de imagens

- [ ] Limites de Storage

- [ ] Limites de usuários

- [ ] Soft delete

- [ ] Auditoria

- [ ] Logs protegidos

- [ ] Backup automático

- [ ] Backup externo planejado

- [ ] Backup do Storage planejado

- [ ] Restauração testada

- [ ] DEV/STAGING/PROD separados

- [ ] Migrations versionadas

- [ ] Rate limiting

- [ ] Proteção contra exclusão em massa

- [ ] Monitoramento

- [ ] Alertas

- [ ] Política de retenção

- [ ] Procedimento de incidente

- [ ] Exportação de dados

- [ ] Política de cancelamento

- [ ] Política de inadimplência

- [ ] Security Gate aprovado

**47. REGRA PARA O CLAUDE CODE**

Não implementar todas essas funcionalidades de uma única vez.

Trabalhar em etapas.

**FASE 1 — AUDITORIA**

Analisar o projeto atual.

Não modificar código.

Apresentar arquitetura atual, riscos, vulnerabilidades, pontos faltantes
e plano de correção.

Aguardar aprovação.

**FASE 2 — FUNDAÇÃO DE SEGURANÇA**

Implementar:

- Supabase Auth

- profiles

- companies

- roles

- multi-tenancy

- RLS

- proteção de secrets

- middleware

- autorização

Executar testes.

Aguardar aprovação.

**FASE 3 — STORAGE E ARQUIVOS**

Implementar:

- Storage privado

- upload

- validação

- compressão

- limites

- autorização

- auditoria

Executar testes.

Aguardar aprovação.

**FASE 4 — AUDITORIA**

Implementar:

- activity_logs

- eventos

- rastreabilidade

- proteção dos logs

- painel administrativo

Executar testes.

Aguardar aprovação.

**FASE 5 — BACKUP E RECUPERAÇÃO**

Implementar/documentar:

- backup

- política de retenção

- backup externo

- Storage backup

- recuperação

- testes de restauração

- RPO/RTO

Aguardar aprovação.

**FASE 6 — SAAS GOVERNANCE**

Implementar:

- planos

- usuários por plano

- Storage por plano

- subscriptions

- inadimplência

- suspensão

- cancelamento

- exportação

- monitoramento de consumo

Aguardar aprovação.

**FASE 7 — SECURITY TESTING**

Executar testes completos:

- autenticação

- autorização

- RLS

- multi-tenant

- Storage

- uploads

- permissões

- secrets

- APIs

- exclusão

- auditoria

- recuperação

Aguardar aprovação.

**FASE 8 — PRODUÇÃO**

Somente após todas as fases anteriores estarem aprovadas:

- executar Security Gate

- revisar ambiente

- revisar secrets

- revisar banco

- revisar Storage

- revisar backup

- revisar logs

- realizar deploy

**48. PRINCÍPIOS INEGOCIÁVEIS**

SECURITY FIRST

RLS \> confiança no frontend

MENOR PRIVILÉGIO \> acesso total

BACKUP TESTADO \> backup apenas configurado

AUDITORIA \> operação sem rastreabilidade

SOFT DELETE \> exclusão definitiva

STORAGE PRIVADO \> arquivo público

VALIDAÇÃO NO SERVIDOR \> validação apenas no frontend

DADOS ISOLADOS \> conveniência

RECUPERAÇÃO \> exclusão

SIMPLICIDADE \> complexidade desnecessária

O sistema deverá ser construído para suportar crescimento de 1 para
centenas de empresas sem comprometer isolamento, segurança e governança.

Nunca priorizar velocidade de desenvolvimento em detrimento da segurança
dos dados.

Se houver dúvida sobre uma decisão que possa comprometer segurança,
parar, explicar o risco e solicitar aprovação antes de prosseguir.

FIM DO PROMPT
