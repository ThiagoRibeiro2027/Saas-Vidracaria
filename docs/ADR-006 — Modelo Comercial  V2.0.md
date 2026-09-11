**ADR-006 — Modelo Comercial**

**Status:** APROVADO\
**Versão:** 2.0\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 09/09/2026\
**Decisão:** Modelo de comercialização, contratação, entitlements e ciclo de vida comercial do SaaS\
**Decisão vinculada:** ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-007, ADR-008\
**Substitui:** ADR-006 — Modelo Comercial do SaaS, Versão 1.0

**1. Contexto**

O SaaS Industrial será comercializado como produto padronizado,
recorrente, modular, escalável e multi-tenant, e não como um projeto
individualizado para cada cliente.

A Versão 1.0 deste ADR estabeleceu os princípios de negócio do modelo
comercial (contratação, planos, cobrança, implantação, ciclo de vida da
assinatura, cancelamento e governança comercial).

Esta Versão 2.0 evolui o ADR-006 para formalizar, além dos princípios de
negócio, a arquitetura técnica que conecta contratação, autorização e
regras de negócio — necessária porque o projeto avançou para a fase de
implementação e essa camada precisa de definição precisa antes de
qualquer código ser escrito.

**Este projeto é um SaaS independente e não possui relação com USIMETAL,
Consistem ou qualquer outro sistema empresarial citado fora deste
projeto.**

**2. Problema**

O sistema precisa resolver, de forma arquiteturalmente consistente:

o que o tenant contratou;

o que o tenant tem direito de usar em decorrência do que contratou;

quem, dentro do tenant, pode efetivamente usar cada recurso;

se uma operação específica pode ser executada dado o estado comercial,
o direito de uso e a regra de negócio aplicável;

como tudo isso se comporta durante trial, inadimplência, suspensão,
cancelamento, upgrade, downgrade e reativação;

como pagamentos externos (gateway) influenciam o estado comercial sem
se tornarem uma dependência rígida ou uma autoridade indevida;

como preservar dados e histórico quando a contratação muda ou termina.

Sem uma decisão explícita, essas responsabilidades tendem a se misturar
— por exemplo, permissões de usuário sendo usadas para controlar
contratação, ou feature flags sendo tratadas como mecanismo comercial —
o que compromete isolamento, auditabilidade e evolução do produto.

**3. Decisão**

Será adotado um modelo comercial modular e multi-tenant, sustentado por
uma cadeia de autorização com camadas explícitas e não substituíveis
entre si:

**Tenant → Contratação → Plano/Módulos/Recursos contratados →
Entitlements → Funcionalidade → Usuário → Permissão → Regra de
negócio**

Nenhuma camada poderá ser usada para fazer o papel de outra. Recurso não
contratado não pode ser utilizado; permissão não pode liberar recurso
não contratado; recurso contratado não concede automaticamente permissão
a todos os usuários; regras de negócio permanecem independentes de
contratação e autorização. O backend é sempre a autoridade final — o
frontend nunca decide disponibilidade comercial.

**3.1 Tenant e unidade comercial**

O Tenant é a principal unidade comercial e de isolamento. Um Tenant
poderá possuir múltiplos usuários e múltiplas unidades operacionais
(fábricas, filiais, depósitos, centros de distribuição, escritórios). O
crescimento da mesma organização deverá ocorrer preferencialmente dentro
do mesmo Tenant; um novo Tenant é usado apenas quando há necessidade de
operação comercialmente independente. Usuários permanecem submetidos ao
modelo definido no ADR-001.

**3.2 Entidade de contratação**

Será criada uma estrutura própria para representar a contratação do
tenant, contendo, conforme aplicável: tenant, plano, módulos, recursos,
período, estado comercial, trial, datas relevantes, histórico,
referências financeiras e metadados necessários. Não se assume que todos
os tenants terão o mesmo conjunto de módulos ou recursos.

**3.3 Planos e módulos**

O produto poderá possuir diferentes níveis comerciais, inicialmente
estruturados conceitualmente como Essencial, Profissional e Enterprise —
representando níveis de contratação da mesma plataforma, não produtos
tecnologicamente diferentes. A composição definitiva de cada plano fica
para definição posterior. Os 15 módulos permanecem independentes
arquiteturalmente; a comercialização pode ocorrer por plano, módulo
adicional, recurso, add-on ou capacidade, sempre respeitando as
dependências funcionais entre módulos. Desativar um módulo não implica
excluir seus dados históricos.

**3.4 Cobrança**

Será adotado um modelo híbrido — assinatura/base + módulos +
capacidade/utilização controlada + serviços adicionais — previsível,
transparente, simples e escalável. Como regra geral, não haverá cobrança
individual por operações essenciais do sistema (pedidos, movimentações
de estoque, ordens de produção, inspeções, expedições).

**3.5 Limites de utilização**

Poderão existir limites comerciais relacionados a usuários, unidades,
armazenamento, capacidade, integrações, documentos e funcionalidades
avançadas. Os limites devem ser mensuráveis, transparentes e
acompanháveis (contratado → utilizado → disponível → percentual
utilizado → projeção → necessidade de expansão), e não podem provocar
perda de dados nem interrupção abrupta de processos críticos.

**3.6 Ciclo de vida da contratação**

A contratação seguirá estados centralizados: **TRIAL → ACTIVE →
PAST_DUE → SUSPENDED → CANCELED → EXPIRED**, quando aplicável. As
transições são centralizadas — não devem ser espalhadas pelos módulos
operacionais. Em PAST_DUE, não há bloqueio automático: deve existir
período de tolerância configurável. SUSPENDED representa restrição
efetiva de acesso conforme política comercial centralizada de operações
permitidas, restritas ou bloqueadas. CANCELED e EXPIRED não apagam
automaticamente dados operacionais, históricos, financeiros ou de
auditoria. A reativação restabelece recursos conforme a contratação
vigente, sem reconstrução manual de dados, configurações ou permissões.

**3.7 Entitlements**

Será implementada uma camada explícita de entitlements (ou equivalente
funcional), representando o direito comercial do tenant de utilizar
determinado módulo ou recurso. Os conceitos não devem ser confundidos:
contratação é o que foi contratado; entitlement é o que o tenant tem
direito de usar; feature flag é controle técnico de disponibilização;
permissão é quem pode usar; regra de negócio é se a operação pode ser
executada.

**3.8 Feature flags**

Feature flags são permitidas quando tecnicamente necessárias, mas não
substituem entitlement nem autorização, e não devem ser usadas como
mecanismo comercial isolado. O frontend pode usá-las para adaptar a
interface, mas o backend permanece como autoridade.

**3.9 Validação de acesso**

Toda operação protegida deve validar, no backend, a cadeia completa:
Tenant → Estado comercial → Entitlement → Funcionalidade → Usuário →
Permissão → Regra de negócio. A falha em qualquer condição obrigatória
impede a operação, com proteção contra bypass por API, alteração de
parâmetros, frontend, URLs, endpoints alternativos ou alteração indevida
de permissões.

**3.10 Gateway e pagamentos**

Será criada uma camada de abstração de pagamentos; os módulos
operacionais não se acoplam diretamente a um gateway específico. O
gateway é responsável por processamento, cobrança, métodos de pagamento,
aprovação, recusa, estorno, chargeback e eventos externos. O SaaS é
responsável por contratação, interpretação dos eventos, estado
comercial, entitlements, histórico e auditoria. A escolha do gateway
específico permanece decisão futura.

**3.11 Webhooks e eventos externos**

Eventos externos (de pagamento e afins) serão processados de forma
segura e idempotente: validação, autenticação quando aplicável,
identificação da origem, registro, correlação com a contratação,
processamento idempotente, reprocessamento e rastreabilidade. Eventos
duplicados não podem produzir efeitos duplicados, e um webhook não
altera diretamente permissões ou módulos. Fluxo: Evento externo →
Validação → Registro → Interpretação → Atualização da contratação →
Atualização dos entitlements/efeitos comerciais.

**3.12 Indisponibilidade do gateway**

A indisponibilidade temporária do gateway não é motivo, por si só, para
suspender um tenant automaticamente. O sistema deve diferenciar falha de
pagamento, atraso de processamento, indisponibilidade do provedor,
evento recebido e estado efetivo da contratação — apenas as regras
internas de contratação determinam mudança de estado comercial.

**3.13 Implantação, onboarding e trial**

A implantação é um serviço estruturado, podendo ser cobrado
separadamente, seguindo o fluxo: Contratação → Preparação →
Parametrização → Dados → Treinamento → Testes → Homologação → Go-live →
Operação assistida — priorizando configuração/parametrização sobre
customização. A arquitetura deve suportar onboarding (criação/
configuração da empresa, administrador inicial, configurações
essenciais, identificação de recursos, validações iniciais, sem
conceder permissões operacionais além das necessárias) e trial
(vinculado à contratação, com início, término, recursos disponibilizados,
regras de encerramento/conversão e histórico). Valores e condições
comerciais definitivas não decididas não devem ser implementadas
antecipadamente.

**3.14 Ambientes**

O ambiente de produção é a referência. Podem existir ambientes
separados de homologação, testes, treinamento e demonstração, mantidos
isolados entre si; dados de produção usados em ambientes não produtivos
devem receber tratamento adequado, incluindo anonimização/mascaramento
quando necessário.

**3.15 Upgrade, downgrade e expansão**

O cliente pode ampliar ou reduzir sua contratação (módulos, usuários,
unidades, capacidade, recursos, ambientes, integrações). No upgrade,
novos entitlements devem refletir a nova contratação sem exigir
alteração manual de permissões apenas para liberar um recurso recém-
contratado. No downgrade, a retirada de recursos deve considerar
operações em andamento, dados existentes, documentos, histórico,
dependências e obrigações aplicáveis — nunca apagando automaticamente
dados históricos apenas porque um recurso deixou de ser contratado.

**3.16 Continuidade e dados históricos**

Suspensão, expiração ou cancelamento não podem causar perda de dados.
A política de operações permitidas, restritas, bloqueadas ou somente-
consulta é centralizada, e operações já iniciadas devem ser tratadas
evitando perda de dados, registros incompletos, inconsistência ou perda
de rastreabilidade. Registros produzidos por funcionalidades
anteriormente contratadas são preservados, salvo regras legais ou de
retenção específicas.

**3.17 Integração com Financeiro e Fiscal**

Contratação (Comercial) e Financeiro permanecem separados: a
Contratação controla plano, módulos, recursos, estado comercial e
disponibilidade comercial; o Financeiro controla títulos, obrigações,
cobranças, recebimentos, pagamentos e situação financeira, mantendo
vínculo rastreável Tenant → Contratação → Cobrança/Documento financeiro
→ Pagamento/Evento financeiro. O Financeiro não altera diretamente
permissões, entitlements, módulos ou regras operacionais — apenas envia
eventos à camada comercial para interpretação. A Fiscal continua
responsável pelos efeitos fiscais, conforme ADR-004.

**3.18 Auditoria comercial**

Serão registradas as alterações relevantes do ciclo comercial: criação
da contratação, trial, ativação, alteração de plano, inclusão/remoção
de módulos ou recursos, alteração de estado, pagamentos, falhas,
estornos, chargebacks, cancelamentos, reativações e suspensões — com
tenant, contratação, evento, estado anterior, novo estado, recurso
afetado, data/hora do servidor, origem, usuário/processo, referência
externa e motivo, sem sobrescrever o histórico de forma que impeça
reconstruir a evolução da contratação. Será usado o mecanismo geral de
auditoria do SaaS.

**3.19 Multi-tenancy e administração**

Toda estrutura comercial permanece vinculada ao tenant correto, com
isolamento garantido no backend e na camada de dados — um tenant não
pode consultar, usar ou influenciar a contratação, os entitlements ou o
estado comercial de outro. O administrador do tenant pode consultar
informações comerciais conforme suas permissões, mas não pode alterar
arbitrariamente o estado comercial, conceder recursos não contratados,
manipular entitlements diretamente ou contornar regras comerciais por
permissões; intervenções administrativas excepcionais precisam de
mecanismo próprio e auditável.

**3.20 Offline**

Quando houver operação offline (ADR-005), o dispositivo nunca é
autoridade sobre contratação, entitlements, estado comercial, suspensão
ou reativação — o servidor permanece como fonte oficial.

**3.21 Notificações**

Eventos comerciais (vencimentos, pagamentos, falhas, alterações de
contratação, suspensão, reativação) podem gerar notificações, respeitando
o ADR-007, mas a notificação nunca é responsável por alterar o estado
comercial.

**3.22 Cancelamento e portabilidade**

O cancelamento é controlado e auditável. O cliente terá mecanismos para
acesso/exportação dos seus dados (formatos como CSV, XLSX, PDF, XML ou
outros arquivos estruturados), observadas as condições contratuais e
legais — sem que isso implique fornecimento do banco de dados interno ou
da arquitetura proprietária do SaaS. O encerramento não significa
exclusão imediata dos dados; a exclusão definitiva segue política de
retenção, requisitos legais e processo controlado.

**3.23 Preços, reajustes e governança comercial**

A política de preços permanece independente da lógica operacional dos
módulos, podendo incluir reajustes, descontos, promoções e condições
diferenciadas por plano ou por novo cliente; alterações comerciais não
modificam automaticamente contratos vigentes, salvo condições
contratuais aplicáveis. O modelo comercial tem governança própria sobre
planos, preços, módulos, add-ons, limites, descontos, serviços,
políticas de contratação, expansão e cancelamento; mudanças que
impliquem alteração estrutural no produto passam por avaliação técnica
e arquitetural.

**3.24 Métricas**

O SaaS deve acompanhar indicadores comerciais (clientes, novos clientes,
cancelamentos, expansão, contração, receita recorrente, ticket médio,
conversão, inadimplência, retenção, custo de aquisição) e indicadores de
produto (usuários ativos, módulos e recursos utilizados, frequência de
uso, processos executados, funcionalidades pouco usadas, solicitações de
suporte e de melhoria), que podem orientar decisões de produto e
roadmap.

**3.25 MVP**

No MVP será implementado somente o necessário para validar o produto
conforme o ADR-002. Não são requisito obrigatório do MVP: planos
comerciais completos, múltiplos gateways, todos os métodos de pagamento,
trial completo, automações comerciais avançadas, regras financeiras
avançadas, ou funcionalidades comerciais não necessárias ao piloto — mas
a arquitetura deve preservar a capacidade de adicionar esses recursos
posteriormente.

**3.26 Integrações**

A implementação mantém baixo acoplamento entre Comercial, Financeiro,
Fiscal, Gateway, Usuários/Permissões, módulos operacionais e
Notificações, usando eventos para integração sempre que possível, para
evitar dependências diretas desnecessárias.

**4. Decisões deliberadamente postergadas**

Ficam para definição posterior, sem alterar o modelo arquitetural aqui
definido:

grandfathering — política de preservação das condições de clientes
existentes diante de mudanças futuras de preços/planos;

métricas de capacidade — quais indicadores serão efetivamente usados
para determinar capacidade comercial;

infraestrutura de billing — escolha de gateway, provedor, meios de
pagamento e tecnologia de cobrança recorrente;

tabela definitiva de preços e composição final dos planos;

quantidade de usuários por plano e limites definitivos;

duração do trial e política definitiva de inadimplência;

regras definitivas de cancelamento, upgrade e downgrade;

estratégia comercial definitiva de onboarding;

metas comerciais ou financeiras.

Nenhuma dessas definições deve ser inventada durante a implementação;
quando necessárias, devem ser registradas como decisão futura formal.

**5. Alternativas consideradas**

**Alternativa A — Contratação controlando diretamente permissões de
uso.** Rejeitada: mistura autorização comercial com autorização
individual, dificultando auditoria e abrindo brechas de bypass.

**Alternativa B — Feature flags como mecanismo comercial.** Rejeitada:
feature flags são um controle técnico de disponibilização, não uma
fonte de verdade sobre direito de uso; usá-las como tal impede
auditoria e cria inconsistência entre ambientes.

**Alternativa C — Acoplamento direto dos módulos operacionais a um
gateway de pagamento específico.** Rejeitada: cria dependência rígida de
fornecedor e dificulta trocar ou adicionar gateways no futuro.

**Alternativa D — Camada de entitlements explícita, desacoplada de
permissões e de feature flags, com backend como autoridade final e
gateway abstraído.** **Aprovada.** Preserva separação de
responsabilidades, auditabilidade, multi-tenancy e evolução futura do
modelo comercial sem reescrever a arquitetura.

**6. Consequências aceitas**

A decisão aceita: complexidade adicional para manter camadas
desacopladas (contratação, entitlement, permissão, regra de negócio);
necessidade de uma camada própria de abstração de pagamentos antes de
integrar qualquer gateway; processamento idempotente de eventos
externos; e o adiamento de decisões comerciais definitivas (preços,
planos, gateway) para depois da arquitetura estar pronta.

**7. Consequências não aceitas**

Não são aceitos: uso de permissões de usuário para controlar
contratação; uso de feature flags como autoridade comercial; suspensão
automática de tenant por indisponibilidade temporária do gateway; perda
de dados históricos por downgrade, suspensão, expiração ou
cancelamento; frontend como autoridade sobre disponibilidade comercial;
efeitos duplicados por eventos de pagamento reprocessados; e alteração
do estado comercial por notificações ou pelo dispositivo em operação
offline.

**8. Dependências**

Este ADR possui relação direta com:

**ADR-001 — Usuários/Permissões**: define autorização individual,
independente da camada comercial.

**ADR-002 — MVP e Escopo do Produto**: define o que efetivamente precisa
existir no MVP comercial.

**ADR-003 — Cliente-Piloto**: valida o modelo comercial em operação
real com a JR Box.

**ADR-004 — Estratégia Fiscal**: define os efeitos fiscais, mantidos
separados do Comercial.

**ADR-005 — Operação Offline**: define por que o dispositivo nunca é
autoridade comercial.

**ADR-007 — Notificações e Alertas**: define como eventos comerciais
podem gerar notificações, sem que a notificação seja autoridade.

**ADR-008 — Plataforma do Aplicativo de Campo**: contexto de uso do PWA
que também depende de entitlements e permissões.

Este ADR permanece subordinado à Arquitetura Mestre do SaaS Industrial.

**9. Governança**

Nenhum módulo poderá criar regras comerciais conflitantes com este ADR.
Alterações futuras devem registrar decisão anterior, nova decisão,
motivo, impacto funcional, impacto técnico, impacto no MVP,
consequências, responsável, data e versão, preservando o histórico das
decisões anteriores — inclusive desta evolução da Versão 1.0 para a
Versão 2.0.

**10. Princípio final**

O modelo comercial deve permitir crescimento sustentável do produto sem
transformá-lo em projetos individualizados por cliente:

**contratação determina disponibilidade comercial; entitlements
representam o direito do tenant; permissões determinam o acesso
individual; regras de negócio validam a operação; o Financeiro controla
as informações financeiras; e o gateway processa pagamentos — sem que
nenhuma dessas camadas substitua outra.**

**Status final: APROVADO**
