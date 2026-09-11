**ADR-004 — Estratégia Fiscal e Documentos Fiscais**

**Versão:** 2.2\
**Status:** APROVADO\
**Data:** 09/09/2026\
**Responsável:** Product Owner

**1. Contexto**

O SaaS deverá possuir capacidade de suportar processos fiscais
relacionados às operações das empresas clientes, porém a emissão de
documentos fiscais envolve regras tributárias, municipais e estaduais,
credenciamento, certificados, provedores, leiautes e alterações
regulatórias.

O projeto deverá, portanto, separar claramente:

o fluxo operacional do SaaS;

o tratamento e armazenamento dos documentos fiscais;

a integração com serviços/provedores fiscais;

a emissão efetiva dos documentos fiscais;

as responsabilidades tributárias da empresa cliente.

A arquitetura deverá permitir evolução fiscal sem acoplamento direto do
núcleo do sistema a um único provedor ou mecanismo de emissão.

**2. Decisão**

O sistema será projetado com uma **camada fiscal desacoplada**,
preparada para integração com provedores e serviços especializados de
documentos fiscais.

A emissão fiscal será tratada como uma capacidade específica do sistema,
não devendo contaminar os módulos operacionais com regras de comunicação
direta com SEFAZ, municípios ou provedores.

A arquitetura deverá permitir, conforme evolução futura:

NF-e;

NFS-e;

outros documentos fiscais que venham a ser necessários;

consulta de situação;

armazenamento dos documentos e retornos;

tratamento de rejeições;

reprocessamento;

cancelamento, quando aplicável;

inutilização, quando aplicável;

eventos fiscais;

auditoria e rastreabilidade.

**3. Provedor fiscal**

O sistema deverá utilizar uma camada de abstração entre o núcleo do SaaS
e o provedor fiscal.

O objetivo é evitar que:

regras específicas de um provedor contaminem o domínio;

a troca de provedor exija reconstrução dos módulos operacionais;

cada módulo implemente individualmente integrações fiscais.

A integração deverá ser centralizada e possuir tratamento consistente
de:

envio;

retorno;

erros;

rejeições;

consultas;

reprocessamentos;

idempotência;

armazenamento dos documentos;

auditoria.

**4. Responsabilidade fiscal**

O SaaS será uma ferramenta de apoio à operação da empresa cliente.

A responsabilidade pela:

classificação fiscal;

parametrização tributária;

definição dos dados fiscais;

validação das operações;

emissão;

escrituração;

cumprimento das obrigações acessórias;

permanece com a empresa cliente e seus responsáveis contábeis/fiscais.

O sistema não deverá presumir regras tributárias sem parametrização ou
informação válida.

**5. Recepção de documentos fiscais**

A recepção de documentos fiscais deverá ser tratada de forma
independente da existência de um Pedido de Compra.

Um documento fiscal recebido poderá:

ser vinculado a um Pedido de Compra;

ser vinculado a uma necessidade de material;

ser vinculado a outra operação existente no sistema;

permanecer temporariamente sem vínculo operacional;

permanecer como pendente para posterior classificação.

A ausência de Pedido de Compra não deverá impedir a recepção e o
registro do documento fiscal.

Essa regra é necessária inclusive para operações em que a aquisição
tenha ocorrido fora do módulo de Compras do SaaS.

Quando o módulo de Compras estiver disponível e aplicável, o vínculo
operacional deverá ser estabelecido conforme as regras daquele módulo.

**6. Recepção não significa aprovação**

O recebimento de um documento fiscal não implica automaticamente:

aprovação;

aceite do material;

aceite financeiro;

reconhecimento da obrigação;

encerramento de uma compra.

A recepção deverá ser uma etapa própria, podendo existir posteriormente
um fluxo de conferência, aprovação, rejeição, pendência ou outra
situação operacional.

**7. Idempotência e reprocessamento**

O processamento fiscal deverá ser idempotente.

A mesma informação ou documento não poderá gerar registros duplicados em
razão de:

reenvio;

repetição de chamada;

falha de comunicação;

processamento duplicado;

reprocessamento manual.

O sistema deverá permitir reprocessamento controlado de operações que
tenham falhado, mantendo o histórico das tentativas.

**8. Auditoria e rastreabilidade**

Toda operação fiscal relevante deverá possuir rastreabilidade suficiente
para identificar:

documento;

operação de origem;

data e hora;

usuário ou processo responsável;

provedor utilizado;

tentativa de processamento;

retorno recebido;

erro ou rejeição;

alteração de estado;

reprocessamento;

resultado final.

Informações fiscais relevantes não deverão ser sobrescritas de maneira a
eliminar o histórico operacional.

**9. Escopo fiscal do MVP**

**9.1 Regra específica para o piloto da JR Box**

Durante o primeiro piloto da **JR Box**, o **faturamento permanecerá no
sistema atualmente utilizado pela empresa**.

Consequentemente:

o SaaS não será o sistema emissor de documentos fiscais reais durante o
piloto;

o SaaS não assumirá a responsabilidade operacional pela emissão de NF-e
ou NFS-e durante o piloto;

não será necessário colocar em produção uma integração de emissão fiscal
real apenas para viabilizar o piloto;

documentos fiscais eventualmente emitidos pela JR Box continuarão sendo
processados pelo sistema atualmente utilizado pela empresa, conforme
seus procedimentos existentes.

Essa decisão é uma **limitação deliberada do escopo do primeiro
piloto**, e não uma exclusão definitiva da capacidade fiscal do produto.

**9.2 O que permanece dentro do MVP**

O MVP deverá manter a estrutura necessária para que os processos
operacionais possam posteriormente receber integração fiscal.

Isso inclui, quando aplicável:

estrutura de documentos fiscais;

identificação do tipo de documento;

associação com operações internas;

armazenamento de informações fiscais;

estados e resultados de processamento;

rastreabilidade;

auditoria;

preparação para integração com provedor fiscal.

**9.3 O que fica fora do piloto**

Ficam fora do escopo de emissão fiscal real do primeiro piloto:

emissão de NF-e pelo SaaS;

emissão de NFS-e pelo SaaS;

emissão de outros documentos fiscais pelo SaaS;

cancelamentos fiscais reais realizados pelo SaaS;

inutilizações fiscais realizadas pelo SaaS;

transmissão fiscal de produção pelo SaaS;

operação fiscal real dependente de certificado digital do cliente.

Essas funcionalidades poderão ser incorporadas posteriormente mediante
definição do escopo fiscal efetivo de cada empresa e validação
tributária.

**10. Evolução fiscal pós-piloto**

A habilitação de emissão fiscal deverá ocorrer somente após definição do
cenário real da empresa cliente.

A definição deverá considerar, no mínimo:

regime tributário;

município;

natureza das operações;

produtos e serviços comercializados;

documentos fiscais necessários;

regras estaduais e municipais aplicáveis;

requisitos de certificado;

provedor escolhido;

requisitos de homologação;

requisitos de integração.

O escopo fiscal futuro não deverá ser definido por uma lista genérica de
documentos, mas pelas operações fiscais efetivamente realizadas pelos
clientes atendidos pelo produto.

**11. Preparação para NF-e e NFS-e**

A arquitetura permanecerá preparada para suportar NF-e e NFS-e quando
essas funcionalidades forem incorporadas.

A implementação futura deverá considerar as particularidades dos
ambientes fiscais e dos respectivos provedores.

A camada de integração deverá permanecer desacoplada do domínio
principal.

Para NFS-e, a arquitetura deverá permitir integração por API quando o
cenário do cliente e o serviço utilizado suportarem essa modalidade. A
documentação oficial do padrão nacional prevê integração via API para
sistemas próprios. ([<u>Serviços e Informações do
Brasil</u>](https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica?utm_source=chatgpt.com))

**12. Reforma Tributária e mudanças regulatórias**

A arquitetura fiscal deverá ser preparada para evolução das regras
tributárias e dos documentos fiscais eletrônicos.

Não será permitido estruturar o domínio de forma que regras fiscais
atualmente vigentes sejam consideradas imutáveis.

Alterações regulatórias deverão ser tratadas na camada fiscal e/ou de
parametrização sempre que tecnicamente possível.

O cronograma de documentos fiscais eletrônicos de 2026 já prevê mudanças
relevantes para NF-e, NFS-e e documentos relacionados à Reforma
Tributária, reforçando a necessidade de manter essa camada desacoplada e
evolutiva. ([<u>Serviços e Informações do
Brasil</u>](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-2026?utm_source=chatgpt.com))

**13. Segurança**

Informações fiscais e documentos fiscais deverão ser tratados como dados
empresariais protegidos.

O sistema deverá aplicar:

controle de acesso;

isolamento por tenant;

auditoria;

proteção de credenciais;

proteção de certificados;

não exposição de segredos em logs;

controle de acesso às informações fiscais.

Certificados digitais e credenciais de integração não deverão ser
armazenados em campos comuns ou expostos à camada de aplicação sem
mecanismos apropriados de proteção.

**14. Princípios arquiteturais**

A implementação fiscal deverá respeitar os seguintes princípios:

**Desacoplamento** — fiscal não deve contaminar o domínio operacional.

**Abstração de provedor** — o domínio não deverá depender de um
fornecedor específico.

**Idempotência** — processamento repetido não pode gerar duplicidade.

**Rastreabilidade** — operações fiscais devem ser auditáveis.

**Reprocessamento** — falhas recuperáveis devem poder ser processadas
novamente.

**Isolamento por tenant** — dados fiscais pertencem exclusivamente ao
tenant correspondente.

**Parametrização** — regras específicas não devem ser codificadas de
maneira rígida quando puderem ser parametrizadas.

**Evolução regulatória** — a arquitetura deve suportar alterações legais
e técnicas.

**Separação de responsabilidades** — emissão fiscal e operação comercial
são responsabilidades distintas.

**Segurança por padrão** — credenciais e documentos fiscais devem
receber proteção adequada.

**15. Critérios de aceite do ADR**

Este ADR será considerado implementado quando:

existir uma camada fiscal claramente separada do domínio operacional;

existir abstração para integração com provedores;

documentos fiscais puderem ser registrados sem depender de Pedido de
Compra;

recepção e aprovação forem processos distintos;

existir idempotência;

existir reprocessamento controlado;

existir auditoria;

houver isolamento por tenant;

o MVP da JR Box não depender de emissão fiscal pelo SaaS;

estiver documentado que o faturamento do piloto permanece no sistema
atual da JR Box;

a arquitetura permanecer preparada para futura emissão de NF-e/NFS-e;

nenhuma integração fiscal real de produção seja considerada requisito
para iniciar o piloto da JR Box.

**16. Consequências**

**Positivas**

Redução significativa do risco do primeiro piloto.

Evita colocar emissão fiscal real em produção antes da validação do
núcleo operacional.

Mantém o desenho preparado para evolução fiscal.

Evita acoplamento prematuro a provedor fiscal.

Permite validar os fluxos principais do SaaS sem depender de
homologações fiscais.

Facilita futura expansão para diferentes cenários tributários.

**Negativas**

O primeiro piloto não validará a emissão fiscal pelo SaaS.

A integração fiscal real deverá ser implementada em etapa posterior.

Haverá uma segunda fase de validação específica para os processos
fiscais.

**17. Decisão final**

Para o primeiro piloto da JR Box:

**O SaaS não será responsável pela emissão fiscal real. O faturamento
continuará sendo realizado no sistema atualmente utilizado pela JR
Box.**

A capacidade fiscal permanecerá prevista arquiteturalmente, mas sua
ativação operacional será posterior e condicionada à definição do
cenário fiscal real de cada cliente.

Essa decisão fecha o escopo fiscal do MVP sem eliminar a estratégia
fiscal de longo prazo do produto.

**18. Histórico da decisão**

**v2.0**

Definição inicial da estratégia fiscal e da arquitetura de integração.

**v2.1**

Evolução da camada fiscal, tratamento da recepção de documentos sem
dependência de Pedido de Compra e preparação para cenários fiscais
futuros.

**v2.2**

**Alteração principal:** fechamento do escopo fiscal do primeiro piloto
da JR Box.

Foi definido que:

o faturamento permanecerá fora do SaaS durante o piloto;

a emissão fiscal real não fará parte do primeiro piloto;

a capacidade fiscal permanecerá arquiteturalmente preparada;

a implementação fiscal futura será definida a partir das operações reais
de cada cliente.
