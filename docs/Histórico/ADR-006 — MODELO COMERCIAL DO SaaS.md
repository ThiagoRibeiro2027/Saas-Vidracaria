ADR-006 — MODELO COMERCIAL DO SaaS

STATUS: APROVADO E FECHADO\
VERSÃO: 1.0\
NATUREZA: DECISÃO ARQUITETURAL / PRODUTO\
APLICAÇÃO: SaaS INDUSTRIAL

OBJETIVO

Definir o modelo de comercialização do SaaS Industrial, estabelecendo
princípios para contratação, planos, cobrança, expansão, implantação,
ambientes, ciclo de vida, cancelamento, portabilidade e governança
comercial.

O modelo deverá permitir crescimento sustentável do produto sem
transformar o SaaS em projetos individualizados.

PRINCÍPIOS FUNDAMENTAIS

O SaaS será comercializado como:

produto padronizado;

recorrente;

modular;

escalável;

multi-tenant;

configurável;

expansível.

A configuração será o principal mecanismo de adaptação às necessidades
dos clientes.

Customizações deverão ser excepcionais e controladas, não podendo
comprometer:

arquitetura;

segurança;

atualizações;

manutenção;

escalabilidade;

evolução do produto.

A receita recorrente será o principal modelo econômico, podendo existir
receitas adicionais provenientes de implantação e serviços
profissionais.

MODELO DE CONTRATAÇÃO

A contratação será realizada por empresa/Tenant, mediante assinatura
recorrente.

Poderão ser contratados:

planos;

módulos;

usuários;

unidades;

capacidade;

recursos adicionais;

ambientes;

integrações;

serviços profissionais.

A contratação poderá ser ampliada ou reduzida durante o ciclo de vida do
cliente, respeitando as regras comerciais e contratuais.

MODELO DE COBRANÇA

Será adotado um modelo híbrido, composto conceitualmente por:

ASSINATURA/BASE + MÓDULOS + CAPACIDADE/UTILIZAÇÃO CONTROLADA + SERVIÇOS
ADICIONAIS.

A cobrança deverá ser:

previsível;

transparente;

simples;

escalável.

Não deverá existir, como regra geral, cobrança individual pelas
operações essenciais do sistema, como:

pedidos;

movimentações de estoque;

ordens de produção;

inspeções;

expedições.

PLANOS

O produto poderá possuir diferentes níveis comerciais, inicialmente
estruturados conceitualmente como:

Essencial;

Profissional;

Enterprise.

Os planos representam diferentes níveis de contratação da mesma
plataforma, e não produtos tecnologicamente diferentes.

A composição definitiva de cada plano será definida posteriormente.

MÓDULOS E RECURSOS ADICIONAIS

Os 15 módulos permanecem independentes arquiteturalmente.

A comercialização poderá ocorrer por:

plano;

módulo adicional;

recurso adicional;

add-on;

capacidade.

Módulos estruturais poderão estar incorporados aos planos, enquanto
módulos operacionais poderão possuir tratamento comercial diferenciado.

A contratação deverá sempre respeitar as dependências funcionais.

A desativação de um módulo não implica exclusão de seus dados
históricos.

USUÁRIOS, UNIDADES E TENANTS

O Tenant é a principal unidade comercial e de isolamento.

Um Tenant poderá possuir:

múltiplos usuários;

múltiplas unidades;

fábricas;

filiais;

depósitos;

centros de distribuição;

escritórios;

demais unidades operacionais.

A quantidade de usuários não será necessariamente o principal fator de
preço.

Usuários continuarão submetidos ao modelo definido no ADR-001 — Usuários
e Permissões.

LIMITES DE UTILIZAÇÃO

Poderão existir limites comerciais relacionados a:

usuários;

unidades;

armazenamento;

capacidade;

integrações;

documentos;

recursos específicos;

funcionalidades avançadas.

Os limites deverão ser:

mensuráveis;

transparentes;

acompanháveis;

escaláveis.

Não deverão provocar perda de dados nem interrupção abrupta de processos
críticos.

O sistema deverá permitir visualização de:

CONTRATADO → UTILIZADO → DISPONÍVEL → PERCENTUAL UTILIZADO → PROJEÇÃO →
NECESSIDADE DE EXPANSÃO.

IMPLANTAÇÃO E ONBOARDING

A implantação será um serviço estruturado, podendo ser cobrado
separadamente.

Fluxo padrão:

CONTRATAÇÃO → PREPARAÇÃO → PARAMETRIZAÇÃO → DADOS → TREINAMENTO → TESTES
→ HOMOLOGAÇÃO → GO-LIVE → OPERAÇÃO ASSISTIDA

A implantação deverá priorizar:

CONFIGURAÇÃO/PARAMETRIZAÇÃO \> CUSTOMIZAÇÃO.

Poderão ser cobrados separadamente:

migração;

treinamento;

integrações;

consultoria;

serviços profissionais.

AMBIENTES

O SaaS terá como referência o ambiente de produção.

Poderão existir ambientes separados de:

homologação;

testes;

treinamento;

demonstração.

Esses ambientes deverão permanecer isolados.

Dados de produção utilizados em ambientes não produtivos deverão possuir
tratamento adequado, inclusive anonimização/mascaramento quando
necessário.

Ambientes adicionais poderão possuir tratamento comercial próprio.

UPGRADE, DOWNGRADE E EXPANSÃO

O cliente poderá ampliar ou reduzir sua contratação.

Expansões poderão envolver:

módulos;

usuários;

unidades;

capacidade;

recursos;

ambientes;

integrações.

O crescimento da mesma organização deverá ocorrer preferencialmente
dentro do mesmo Tenant.

Um novo Tenant será utilizado quando houver necessidade de operação
comercialmente independente.

Downgrade não poderá provocar perda imediata de dados ou histórico.

Processos críticos em andamento deverão possuir tratamento controlado.

CICLO DE VIDA DA ASSINATURA

A assinatura poderá possuir estados como:

PROPOSTA → IMPLANTAÇÃO → ATIVA → TOLERÂNCIA → SUSPENSA → CANCELADA →
ENCERRADA

Os estados comerciais serão independentes dos estados operacionais dos
módulos.

Inadimplência não deverá significar automaticamente suspensão imediata.

Deverá existir política progressiva de tratamento:

AVISO → TOLERÂNCIA → RESTRIÇÃO → SUSPENSÃO → ENCERRAMENTO

quando aplicável.

CONTRATOS E COBRANÇA

O contrato deverá registrar, quando aplicável:

Tenant;

plano;

módulos;

usuários;

unidades;

capacidade;

recursos;

serviços;

valores;

descontos;

periodicidade;

vigência;

condições de pagamento;

reajustes;

cancelamento.

A gestão comercial definirá as condições contratadas.

O Financeiro continuará sendo a fonte oficial dos efeitos financeiros.

A Fiscal continuará sendo responsável pelos efeitos fiscais.

CANCELAMENTO E PORTABILIDADE

O cancelamento deverá ser controlado e auditável.

O cliente deverá possuir mecanismos para acesso/exportação dos seus
dados, observadas as condições contratuais e legais.

Poderão ser disponibilizados formatos como:

CSV;

XLSX;

PDF;

XML;

arquivos estruturados;

documentos e anexos.

A portabilidade não implica fornecimento do banco de dados interno ou da
arquitetura proprietária do SaaS.

O encerramento não deverá significar exclusão imediata dos dados.

A exclusão definitiva deverá seguir política de retenção, requisitos
legais e processo controlado.

PREÇOS E REAJUSTES

A política de preços deverá permanecer independente da lógica
operacional dos módulos.

Poderão existir:

reajustes;

descontos;

promoções;

diferentes preços por plano;

preços para novos clientes;

condições especiais de contratação.

Alterações comerciais não deverão modificar automaticamente contratos
vigentes, salvo conforme as condições contratuais aplicáveis.

GOVERNANÇA COMERCIAL

O modelo comercial deverá possuir governança própria para:

planos;

preços;

módulos;

add-ons;

limites;

descontos;

serviços;

políticas de contratação;

expansão;

cancelamento.

Mudanças comerciais que impliquem alterações estruturais no produto
deverão passar por avaliação técnica e arquitetural.

MÉTRICAS

O SaaS deverá acompanhar indicadores comerciais e de produto.

Indicadores comerciais:

clientes;

novos clientes;

cancelamentos;

expansão;

contração;

receita recorrente;

ticket médio;

conversão;

inadimplência;

retenção;

custo de aquisição.

Indicadores de produto:

usuários ativos;

módulos utilizados;

recursos utilizados;

frequência de utilização;

processos executados;

funcionalidades pouco utilizadas;

solicitações de suporte;

solicitações de melhoria.

Esses indicadores poderão orientar decisões de produto e roadmap.

EVOLUÇÃO DO MODELO

O modelo comercial poderá evoluir conforme:

mercado;

clientes;

utilização;

sustentabilidade econômica;

estratégia do produto;

custos de infraestrutura;

operação;

roadmap.

Poderão ser criados novos:

planos;

módulos;

recursos;

add-ons;

modelos de capacidade.

A evolução deverá preservar a simplicidade comercial.

Princípio:

POUCOS PLANOS + MÓDULOS CLAROS + ADD-ONS OBJETIVOS + LIMITES
TRANSPARENTES.

DECISÕES FUTURAS NÃO BLOQUEANTES

Ficam deliberadamente para definição posterior:

19.1 Grandfathering

Política específica para preservação das condições de clientes
existentes diante de alterações futuras de preços/planos.

19.2 Métricas de capacidade

Definição dos indicadores que efetivamente serão utilizados para
determinar capacidade comercial.

19.3 Infraestrutura de Billing

Escolha de gateway, provedor, meios de pagamento e tecnologia de
cobrança recorrente.

Essas decisões não alteram o modelo arquitetural definido neste ADR.

DECISÕES OBRIGATÓRIAS PARA IMPLEMENTAÇÃO

A implementação deverá respeitar:

SaaS como produto, não projeto individual.

Multi-tenancy desde a origem.

Tenant como unidade comercial e de isolamento.

Modelo híbrido de cobrança.

Contratação modular.

Configuração como mecanismo principal de adaptação.

Preservação de dados em downgrade.

Separação entre Comercial, Financeiro e Fiscal.

Separação entre estado comercial e estado operacional.

Ciclo de vida controlado da assinatura.

Portabilidade dos dados.

Isolamento dos ambientes.

Rastreamento de alterações comerciais.

Capacidade de expansão dentro do Tenant.

Governança comercial independente da arquitetura operacional.

Nenhuma decisão comercial poderá comprometer segurança, integridade,
escalabilidade ou evolução do produto.

RELAÇÃO COM OS DEMAIS ADRs

O ADR-006 deverá ser interpretado conjuntamente com:

ADR-001 — Modelo de Permissões;

ADR-002 — Escopo do MVP;

ADR-003 — Cliente-Piloto;

ADR-004 — Estratégia Fiscal;

ADR-005 — Operação Offline;

ADR-007 — Canais de Notificação.

O ADR-006 permanece subordinado à:

ARQUITETURA MESTRE DO SaaS INDUSTRIAL.

STATUS FINAL

ADR-006 — MODELO COMERCIAL DO SaaS

STATUS: APROVADO E FECHADO\
VERSÃO: 1.0\
REVISÃO: CONCLUÍDA\
CONSOLIDAÇÃO: CONCLUÍDA

O modelo comercial está oficialmente definido em nível arquitetural e de
produto.

Decisões como tabela definitiva de preços, composição final dos planos,
métricas comerciais de capacidade e escolha da infraestrutura de billing
permanecem para etapas posteriores.

ADR-006 ENCERRADO.
