**INVENTÁRIO DE DADOS PESSOAIS (LGPD)**

**Status:** RASCUNHO — levantamento técnico a partir do schema;
validação do conteúdo (finalidade declarada, base legal, prazo de
retenção definitivo) é responsabilidade da controladora com apoio
jurídico, conforme ADR-010 §3-4\
**Versão:** 1.0\
**Data:** 23/09/2026\
**Base documental:** ADR-010 §3 (categorias mínimas exigidas), §4
(bases de tratamento), §5 (direitos do titular)\
**Item do ROTEIRO — Fechamento da Fase 1 (Go-Live) v1.0** que este
documento fecha: 2.5

**1. Objetivo**

O ADR-010 §3 exige que o sistema mantenha identificados, no mínimo,
seis conjuntos de dados pessoais, cada um com finalidade declarada e
responsável identificável. Este documento levanta, para cada conjunto,
onde o dado vive no schema (tabela/coluna), com que finalidade é
tratado e sob qual base legal preliminar — a base final é decisão da
controladora com apoio jurídico (ADR-010 §4), não deste levantamento
técnico.

**2. Usuários do sistema**

**Onde:** `auth.users` (gerenciado pelo Supabase Auth — e-mail, hash de
senha, fatores de MFA); `public.profiles` (nome de exibição,
identificador de login, e-mail de contato, status ativo/inativo);
`public.user_roles` (papel atribuído); `public.activity_logs` (todo
acesso e ação do usuário, incluindo IP e user agent — ver seção 7).

**Finalidade:** autenticar e autorizar o acesso ao sistema; atribuir
responsabilidade por cada ação (rastreabilidade exigida pelo Prompt
Mestre de Segurança).

**Base legal preliminar:** execução de contrato (o usuário só existe
porque a empresa-cliente o cadastrou para operar o sistema) — a
confirmar com jurídico.

**Retenção:** enquanto o usuário estiver ativo; ao ser desativado, o
`profiles` permanece (histórico de auditoria depende dele), mas o
acesso é revogado. Anonimização de dados pessoais do titular após
pedido de exclusão está implementada (`src/lib/audit/
anonymizeDataSubject.ts`, ver seção 6) — a trilha de auditoria em si
nunca é apagada (ADR-010, decisão registrada: exclusão não apaga
auditoria, apenas anonimiza os campos pessoais).

**Responsável:** Administrador da empresa-cliente (papel ADMIN),
sob supervisão do responsável técnico do sistema.

**3. Funcionários** (TÓPICO 17 — RH)

**Onde:** `public.funcionarios` (nome, cargo, função, telefone,
e-mail, data de admissão/desligamento, motivo de desligamento);
`public.funcionario_documentos` (documentos de admissão, certificação,
EPI e habilitação — nome do documento, datas, validade; o arquivo em
si fica no Storage privado, referenciado por `public.files`);
`public.funcionario_afastamentos` (afastamentos e férias).

**Finalidade:** gestão de RH — vínculo empregatício, controle de
documentação obrigatória (EPI, habilitação), controle de afastamentos.

**Base legal preliminar:** execução de contrato de trabalho e
obrigação legal (documentação de segurança do trabalho) — a confirmar
com jurídico.

**Retenção:** enquanto o vínculo estiver ativo; após desligamento, a
retenção segue obrigação trabalhista/previdenciária (prazo legal a
confirmar com jurídico — não definido tecnicamente neste sistema).

**Responsável:** RH da empresa-cliente (permissão `rh.manage`) — acesso
já restrito por permissão dedicada por se tratar de dado pessoal
sensível (`rh.view`/`rh.manage`, não aberto a outros módulos — ver
correção de acesso a arquivos de RH registrada em code review desta
mesma sessão).

**4. Clientes finais e contatos**

**Onde:** `public.pessoas` (tipo de documento CPF/CNPJ, número do
documento, nome, nome fantasia, telefone, e-mail, endereço) com
`public.pessoa_papeis.papel = 'CLIENTE'`; `public.obras` (nome e
endereço da obra, vinculada à pessoa).

**Finalidade:** identificar o cliente e a obra para orçamento, pedido,
produção, expedição e instalação.

**Base legal preliminar:** execução de contrato — a confirmar com
jurídico.

**Retenção:** enquanto a relação comercial estiver ativa; retenção após
encerramento de contrato ainda não tem prazo técnico definido (ver
ROTEIRO — Fechamento da Fase 1, item pendente de definição comercial).

**Responsável:** Comercial da empresa-cliente (permissão
`pessoas.manage`).

**5. Fornecedores e prestadores**

**Onde:** mesma tabela `public.pessoas`, com
`public.pessoa_papeis.papel = 'FORNECEDOR'`; `public.contratos` (TÓPICO
18 — objeto, vigência, valor, forma de pagamento, quando o tipo é
`fornecedor` ou `funcionario`/prestador).

**Finalidade:** gestão de suprimentos e formalização de contrato com
fornecedor ou prestador de serviço.

**Base legal preliminar:** execução de contrato — a confirmar com
jurídico.

**Retenção:** enquanto o contrato estiver vigente ou até o prazo legal
de guarda de documento fiscal/contratual (a confirmar com jurídico).

**Responsável:** Suprimentos/Comercial da empresa-cliente.

**6. Registros de campo** (ADR-008 — Instalação)

**Onde:** `public.files` (referenciando `entity_type`/`entity_id` de
instalação — fotos de execução, evidências, ocorrências); registro de
quem confirmou o aceite da instalação (sem assinatura eletrônica formal
nesta fase, conforme decisão já registrada no TÓPICO 16).

**Finalidade:** comprovar a execução do serviço e o aceite do cliente;
suporte a disputa/garantia.

**Base legal preliminar:** execução de contrato e legítimo interesse
(prova de execução) — a confirmar com jurídico. Atenção especial: fotos
de obra podem capturar pessoas e propriedade de terceiros não
cadastrados no sistema (vizinhos, transeuntes) — ADR-010 já sinaliza
esse risco em §3, sem solução técnica automática; é uma orientação
operacional para quem tira a foto.

**Retenção:** vinculada ao prazo de garantia do serviço/produto (a
confirmar com jurídico/comercial).

**Responsável:** Instalação/Campo da empresa-cliente.

**7. Registros técnicos e de auditoria**

**Onde:** `public.activity_logs` (usuário, ação, entidade afetada,
descrição, metadados, **endereço IP e user agent** — que são dado
pessoal).

**Finalidade:** rastreabilidade e segurança — obrigatória pelo Prompt
Mestre de Segurança e pela arquitetura multi-tenant do sistema.

**Base legal preliminar:** legítimo interesse (segurança, prevenção a
fraude, obrigação de auditoria) — a confirmar com jurídico.

**Retenção:** **24 meses**, com expurgo automático controlado (só
alcança linhas com mais de 24 meses; implementado em
`supabase/migrations/20260913120000_adr009_activity_logs_retention.sql`,
testado em `scripts/test-activity-logs-retention.mjs`). Anonimização de
dados pessoais do titular (sem apagar a trilha em si) já implementada
para `activity_logs` desde 12/09/2026.

**Responsável:** responsável técnico/segurança do sistema.

**8. O que este levantamento NÃO resolve**

Este documento é um levantamento técnico de onde o dado pessoal vive e
para que serve — não substitui: (a) a validação jurídica formal da base
legal de cada conjunto (ADR-010 §4, explicitamente "sujeito a validação
jurídica"); (b) a definição dos prazos de retenção ainda em aberto
(pós-desligamento de funcionário, pós-encerramento de contrato); (c) o
processo formal de atendimento a pedidos de titular (ADR-010 §5 já
define os direitos suportados tecnicamente — acesso, exportação,
anonimização — mas prazos e formalidades de resposta são
responsabilidade da controladora).

**9. Próxima ação**

Responsável do produto/jurídico revisa cada seção acima, confirma ou
ajusta a base legal preliminar e preenche os prazos de retenção ainda
em aberto (funcionário desligado, contrato encerrado). Depois disso,
este documento passa de RASCUNHO para vigente e fecha o item 2.5 do
ROTEIRO — Fechamento da Fase 1 (Go-Live).
