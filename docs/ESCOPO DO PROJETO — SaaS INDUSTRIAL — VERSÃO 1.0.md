**ESCOPO DO PROJETO**

**SaaS INDUSTRIAL — VERSÃO 1.0**

**1. OBJETIVO DO PROJETO**

Desenvolver um sistema SaaS industrial integrado, modular, multiempresa
e escalável, destinado a centralizar e conectar os principais processos
operacionais, administrativos, comerciais, produtivos e financeiros de
empresas industriais.

O sistema deverá permitir que as informações sejam registradas uma única
vez, compartilhadas entre os módulos de forma controlada e rastreável,
evitando duplicidade de dados, retrabalho e perda de histórico.

O SaaS deverá acompanhar o ciclo completo da operação, desde o cadastro
e a negociação comercial até o pedido, engenharia, planejamento,
compras, estoque, produção, qualidade, expedição, entrega,
instalação/montagem e seus respectivos reflexos financeiros.

O sistema deverá ser concebido desde sua origem como uma plataforma SaaS
multiempresa, com isolamento de dados, segurança, rastreabilidade,
escalabilidade e capacidade de evolução.

**2. ESCOPO GERAL**

O projeto contempla uma plataforma integrada composta por 15 módulos
funcionais:

Base / Estrutura do Sistema

Cadastros / Estrutura Inicial

Pedidos

PCP e Produção

Engenharia

Estoque

Suprimentos / Compras

Qualidade

Expedição / Logística

Comercial / Orçamentos

Financeiro

BI

Integrações

Usuários / Permissões

Configurações

Além desses módulos, o sistema deverá contemplar o processo operacional
de:

Obra

Instalação / Montagem em campo

A instalação/montagem não será tratada como um módulo funcional isolado
necessariamente, mas como um processo operacional próprio, integrado aos
demais domínios.

**3. PRINCÍPIO CENTRAL DO SISTEMA**

O sistema deverá seguir o princípio:

<span dir="rtl">“</span>Cada entidade possui uma única fonte de verdade
e um único domínio responsável por sua gestão.”

Os demais módulos poderão:

consultar informações;

solicitar ações;

gerar eventos;

complementar informações dentro de seu próprio domínio;

consumir resultados de outros módulos.

Nenhum módulo deverá criar uma segunda versão independente de uma
entidade que pertence a outro domínio.

**4. ARQUITETURA MODULAR**

**4.1 Base e estrutura**

**Módulo 1 — Base / Estrutura do Sistema**

Responsável pela fundação tecnológica e estrutural do SaaS.

Contempla, entre outros:

estrutura multiempresa;

identificação do tenant;

estrutura organizacional;

padrões fundamentais da plataforma;

mecanismos transversais;

infraestrutura necessária para os demais módulos;

mecanismos de segurança estrutural;

suporte à escalabilidade;

serviços comuns da plataforma.

**4.2 Cadastros**

**Módulo 2 — Cadastros / Estrutura Inicial**

Responsável pelos dados mestres do sistema.

Contempla, entre outros:

clientes;

fornecedores;

itens;

produtos;

matérias-primas;

componentes;

materiais;

unidades;

categorias;

grupos;

características;

obras;

endereços;

demais entidades cadastrais estruturais.

O módulo deverá ser a fonte oficial dos dados mestres.

**4.3 Pedidos**

**Módulo 3 — Pedidos**

Responsável pelo pedido formalizado e pelo compromisso
comercial/operacional.

Contempla:

criação de pedidos;

itens do pedido;

quantidades;

condições;

vinculação com cliente;

vinculação com obra quando aplicável;

acompanhamento do atendimento;

alterações controladas;

cancelamentos;

atendimento parcial;

histórico;

rastreabilidade;

relacionamento com engenharia;

relacionamento com produção;

relacionamento com expedição;

relacionamento com financeiro.

O pedido não deverá controlar diretamente os processos pertencentes aos
demais módulos.

**4.4 PCP e Produção**

**Módulo 4 — PCP e Produção**

Responsável pelo planejamento e execução produtiva.

Contempla:

planejamento;

necessidades;

programação;

ordens de produção;

operações;

recursos;

acompanhamento da produção;

apontamentos;

consumo;

produção parcial;

produção concluída;

reprocessamento;

perdas e ocorrências;

necessidades de materiais;

relacionamento com estoque;

relacionamento com engenharia;

relacionamento com qualidade.

A necessidade de planejamento pertence ao domínio de PCP, ainda que
possa ser originada por pedidos, engenharia, estoque, compras ou
produção.

**4.5 Engenharia**

**Módulo 5 — Engenharia**

Responsável pela definição técnica dos produtos e estruturas.

Contempla:

estruturas de produtos;

BOM;

componentes;

matérias-primas;

processos e informações técnicas;

revisões;

versionamento;

aplicação das estruturas;

composição;

quantidades técnicas;

margens técnicas configuráveis;

duplicação de estruturas, insumos e componentes;

histórico de versões;

rastreabilidade da versão utilizada em cada operação.

A engenharia deverá preservar o histórico técnico.

Uma nova revisão não deverá alterar retroativamente a estrutura
utilizada em pedidos ou produções anteriores.

**4.6 Estoque**

**Módulo 6 — Estoque**

Responsável pela existência física, localização, disponibilidade e
movimentação dos materiais e produtos.

Contempla:

entradas;

saídas;

transferências;

ajustes;

inventário;

reservas;

disponibilidades;

consumos;

devoluções;

perdas;

saldos;

locais;

depósitos;

rastreabilidade;

movimentações;

materiais pendentes;

materiais parciais;

materiais reprovados quando aplicável;

estados operacionais relacionados ao estoque.

Reserva, separação, consumo e expedição deverão ser conceitos distintos.

O estoque não deverá alterar diretamente pedidos, compras ou engenharia.

**4.7 Suprimentos / Compras**

**Módulo 7 — Suprimentos / Compras**

Responsável pelo processo de aquisição e relacionamento operacional com
fornecedores.

Contempla:

necessidades de compra;

solicitações;

cotações;

pedidos de compra;

fornecedores;

itens;

quantidades;

preços;

condições;

aprovação;

acompanhamento;

recebimento;

atrasos;

divergências;

devoluções;

cancelamentos;

histórico;

rastreabilidade.

O processo de recebimento pertence a Suprimentos/Compras.

Os efeitos físicos no estoque são registrados pelo Estoque e eventuais
inspeções de qualidade pelo módulo de Qualidade.

**4.8 Qualidade**

**Módulo 8 — Qualidade**

Responsável pela avaliação da conformidade dos materiais, processos e
produtos.

Contempla:

inspeções;

critérios;

resultados;

aprovação;

reprovação;

bloqueios;

liberações;

não conformidades;

disposições;

retrabalho;

reprocessamento;

rastreabilidade;

relacionamento com recebimento;

relacionamento com produção;

relacionamento com estoque;

relacionamento com expedição.

A decisão de qualidade pertence à Qualidade.

Qualidade não deverá controlar diretamente o estoque, produção ou
expedição, mas poderá gerar eventos que provoquem consequências nesses
processos.

**4.9 Expedição / Logística**

**Módulo 9 — Expedição / Logística**

Responsável pela preparação e saída dos produtos para entrega.

Contempla:

programação de expedição;

separação;

conferência;

romaneio;

carregamento;

transporte;

saída;

entrega;

entregas parciais;

divergências;

ocorrências;

devoluções;

documentos;

rastreabilidade.

A expedição deverá consumir as informações necessárias de estoque,
pedido e qualidade sem assumir a propriedade desses processos.

**4.10 Comercial / Orçamentos**

**Módulo 10 — Comercial / Orçamentos**

Responsável pelo processo comercial anterior à formalização do pedido.

Contempla:

clientes;

oportunidades;

orçamentos;

itens;

quantidades;

preços;

condições;

versões de orçamento;

negociação;

aprovação;

conversão em pedido;

histórico;

rastreabilidade.

A conversão de orçamento em pedido deverá preservar a origem e a
rastreabilidade.

**4.11 Financeiro**

**Módulo 11 — Financeiro**

Responsável pelos registros e processos financeiros.

Contempla:

contas a receber;

contas a pagar;

títulos;

parcelas;

vencimentos;

pagamentos;

recebimentos;

documentos financeiros;

conciliações;

saldos;

consequências financeiras dos processos operacionais;

histórico;

rastreabilidade.

Os módulos operacionais poderão gerar eventos com consequências
financeiras, mas o Financeiro deverá ser a fonte de verdade dos
registros financeiros.

**4.12 BI**

**Módulo 12 — BI**

Responsável pela análise gerencial e indicadores.

Contempla:

indicadores;

dashboards;

análises;

relatórios gerenciais;

cruzamento de informações;

histórico;

indicadores operacionais;

indicadores comerciais;

indicadores produtivos;

indicadores financeiros;

indicadores de qualidade;

indicadores logísticos;

indicadores de desempenho.

O BI será consumidor das informações dos demais módulos.

O BI não poderá ser uma dependência operacional para que os processos
transacionais funcionem.

**4.13 Integrações**

**Módulo 13 — Integrações**

Responsável pela comunicação com sistemas externos.

Contempla:

APIs;

importações;

exportações;

integrações automáticas;

recebimento de dados;

envio de dados;

sincronização;

eventos;

filas;

processamento assíncrono;

logs;

erros;

retentativas;

reprocessamento;

idempotência;

reconciliação.

A integração não será fonte de verdade dos dados de negócio.

Ela deverá transportar, sincronizar e orquestrar informações entre o
SaaS e sistemas externos.

**4.14 Usuários / Permissões**

**Módulo 14 — Usuários / Permissões**

Responsável por identidade e controle de acesso.

Contempla:

usuários;

autenticação;

permissões;

perfis;

papéis;

acessos;

segregação de funções;

permissões por módulo;

permissões por ação;

permissões por contexto;

controle multiempresa;

auditoria de acessos.

Permissão não deverá substituir regra de negócio.

**4.15 Configurações**

**Módulo 15 — Configurações**

Responsável pela parametrização do comportamento configurável do
sistema.

Contempla:

parâmetros;

regras configuráveis;

listas;

estados configuráveis dentro dos limites estruturais;

workflows;

aprovações;

campos personalizados;

parâmetros operacionais;

configurações por empresa;

vigência;

versionamento de configurações críticas.

Configuração não poderá substituir regras estruturais do sistema nem
alterar fatos históricos.

**5. OBRA**

Obra deverá ser tratada como uma entidade/contexto próprio.

Uma obra não é simplesmente:

um cliente;

um pedido;

um endereço.

Ela poderá possuir:

identificação própria;

endereço;

cliente relacionado;

informações específicas;

um ou mais pedidos;

uma ou mais entregas;

uma ou mais instalações;

histórico operacional.

A estrutura cadastral da obra pertence ao domínio de Cadastros.

Os processos de execução relacionados à obra pertencem aos respectivos
módulos operacionais.

**6. INSTALAÇÃO / MONTAGEM**

O sistema deverá contemplar o processo de instalação/montagem física no
local da obra.

A instalação se refere à execução em campo de produtos fabricados, como:

estruturas;

esquadrias;

janelas;

portas;

componentes;

outros produtos que necessitem de montagem ou instalação.

Não se trata de instalação do software.

O processo deverá permitir:

programação;

agendamento;

equipe responsável;

endereço/obra;

itens a instalar;

instalação parcial;

instalação concluída;

ocorrências;

impedimentos;

reagendamento;

revisitas;

problemas técnicos;

peças ausentes;

peças incorretas;

danos;

retrabalho;

registros fotográficos;

documentos;

observações;

comprovação da execução;

assinatura/aceite;

conclusão.

A instalação deverá possuir ciclo próprio e não ser apenas um status da
expedição.

A conclusão da instalação e o aceite do cliente deverão ser eventos
distintos.

**7. FLUXO PRINCIPAL DO SISTEMA**

O fluxo macro deverá permitir:

COMERCIAL\
↓\
ORÇAMENTO\
↓\
PEDIDO\
↓\
ENGENHARIA\
↓\
PLANEJAMENTO / PCP\
↓\
SUPRIMENTOS / ESTOQUE\
↓\
PRODUÇÃO\
↓\
QUALIDADE\
↓\
ESTOQUE\
↓\
EXPEDIÇÃO\
↓\
TRANSPORTE\
↓\
OBRA\
↓\
INSTALAÇÃO / MONTAGEM\
↓\
CONCLUSÃO\
↓\
ACEITE\
↓\
FINANCEIRO

Esse fluxo não deverá ser rigidamente linear.

O sistema deverá permitir processos:

paralelos;

parciais;

antecipados quando permitido;

interrompidos;

retomados;

cancelados;

reprocessados;

dependentes de aprovação;

dependentes de disponibilidade;

dependentes de solução técnica.

**8. ESTADOS E STATUS**

Cada processo deverá possuir seus próprios estados.

O status pertence ao domínio responsável pela entidade ou processo.

Exemplos:

Pedido possui seus próprios estados;

Engenharia possui versões;

Produção possui estados produtivos;

Qualidade possui decisão própria;

Estoque possui estados e dimensões operacionais;

Expedição possui ciclo próprio;

Financeiro possui estados financeiros;

Instalação possui ciclo próprio.

Um evento ocorrido em um módulo poderá gerar mudança de estado em outro
módulo por meio das regras e eventos apropriados.

Evento e status não deverão ser tratados como sinônimos.

**9. EVENTOS E INTEGRAÇÃO ENTRE MÓDULOS**

A comunicação entre módulos deverá utilizar três conceitos principais:

Consulta (Query)

Comando/Solicitação (Command)

Evento (Event)

Um módulo não deverá manipular diretamente o estado interno de outro
módulo.

Exemplo:

Produção não altera diretamente o estoque.

Produção gera a necessidade/evento correspondente e o Estoque processa
sua própria movimentação conforme suas regras.

Esse princípio deverá ser aplicado em toda a arquitetura.

**10. HISTÓRICO E RASTREABILIDADE**

O sistema deverá preservar o histórico dos processos.

Deverá ser possível rastrear, quando aplicável:

quem realizou;

quando realizou;

empresa/tenant;

entidade;

ação;

valor anterior;

novo valor;

origem;

justificativa;

aprovação;

resultado;

consequências.

O sistema não deverá apagar o passado para representar o presente.

Informações relevantes deverão possuir histórico e/ou versionamento.

**11. VERSIONAMENTO**

O versionamento será especialmente importante para Engenharia.

Deverá ser possível identificar:

qual versão da engenharia foi utilizada;

em qual pedido;

em qual ordem de produção;

quais componentes foram utilizados;

quais alterações ocorreram posteriormente.

Uma nova versão não poderá reescrever retroativamente uma versão
histórica já utilizada.

**12. RASTREABILIDADE DE MATERIAIS**

Quando aplicável, o sistema deverá permitir rastrear:

RECEBIMENTO\
→ LOTE / IDENTIFICAÇÃO\
→ ESTOQUE\
→ CONSUMO\
→ PRODUÇÃO\
→ PRODUTO\
→ QUALIDADE\
→ EXPEDIÇÃO\
→ OBRA\
→ INSTALAÇÃO

A profundidade dessa rastreabilidade poderá variar conforme o tipo de
material e configuração do processo.

**13. PROCESSOS PARCIAIS**

O sistema deverá possuir suporte nativo a operações parciais.

Exemplos:

pedido parcialmente atendido;

produção parcial;

recebimento parcial;

inspeção parcial;

expedição parcial;

entrega parcial;

instalação parcial;

retrabalho parcial.

Não deverá ser necessário criar soluções artificiais para representar
processos parciais.

**14. EXCEÇÕES**

O sistema deverá tratar exceções como parte normal da operação.

Entre elas:

cancelamentos;

devoluções;

reprocessamentos;

retrabalho;

perdas;

divergências;

rejeições;

materiais pendentes;

falta de material;

falha de fornecedor;

atraso;

erro de engenharia;

alteração de engenharia;

problemas de qualidade;

falhas de expedição;

impedimentos na obra;

ausência do cliente;

peça incorreta;

peça danificada;

necessidade de revisita;

falhas de integração;

eventos duplicados;

falhas de processamento.

As exceções deverão possuir histórico, responsável, motivo e
consequências quando aplicável.

**15. SEGURANÇA E MULTIEMPRESA**

O SaaS deverá ser multiempresa desde sua fundação.

Cada empresa deverá possuir isolamento de dados.

O isolamento deverá ser considerado em:

banco de dados;

APIs;

telas;

pesquisas;

relatórios;

BI;

arquivos;

notificações;

integrações;

tarefas assíncronas;

logs;

auditoria.

O usuário e a empresa/tenant são conceitos distintos.

O sistema deverá impedir acesso indevido entre empresas.

**16. SERVIÇOS TRANSVERSAIS**

O sistema deverá possuir capacidades transversais reutilizáveis,
evitando duplicação entre módulos.

Entre elas:

autenticação;

autorização;

auditoria;

histórico;

armazenamento de arquivos;

documentos;

anexos;

notificações;

alertas;

workflows;

aprovações;

comentários;

pesquisa;

importação;

exportação;

processamento assíncrono;

filas;

eventos;

logs;

monitoramento.

Esses serviços poderão ser utilizados por vários módulos, mas as regras
específicas de cada processo permanecerão no domínio responsável.

**17. PROCESSAMENTO ASSÍNCRONO**

Operações pesadas deverão ser processadas de forma assíncrona quando
necessário.

Exemplos:

importações grandes;

integrações;

processamento de arquivos;

relatórios pesados;

geração de documentos;

cargas analíticas;

grandes volumes de notificações;

processamento em lote.

Operações interativas deverão permanecer rápidas e previsíveis.

Processamentos assíncronos deverão possuir:

identificação;

empresa/tenant;

origem;

tipo;

estado;

tentativas;

erros;

resultado;

possibilidade de reprocessamento.

**18. CONCORRÊNCIA E CONSISTÊNCIA**

O sistema deverá ser preparado para situações em que múltiplos usuários
ou processos tentem alterar os mesmos dados simultaneamente.

Deverão existir mecanismos para:

controle de concorrência;

prevenção de duplicidade;

idempotência;

consistência transacional;

controle de reservas;

controle de movimentações;

proteção contra eventos duplicados;

reconciliação;

processamento seguro de eventos fora de ordem.

**19. INTEGRAÇÕES**

O sistema deverá possuir arquitetura preparada para integração com
sistemas externos.

As integrações deverão:

ser desacopladas;

possuir autenticação;

possuir controle de erros;

permitir retentativas;

ser idempotentes;

registrar logs;

permitir rastreamento;

permitir reprocessamento;

permitir reconciliação.

Falhas de integração não deverão comprometer indevidamente os processos
internos do SaaS.

**20. EXPERIÊNCIA DO USUÁRIO**

O sistema deverá apresentar uma experiência única e consistente.

Deverá possuir:

navegação padronizada;

componentes consistentes;

filtros padronizados;

pesquisas;

histórico contextual;

acesso rápido às entidades relacionadas;

mensagens de erro compreensíveis;

confirmação para ações críticas;

indicação clara de processos assíncronos;

visualização adequada de estados;

acessibilidade.

Desktop deverá ser priorizado para operações complexas.

Celular e tablet deverão ser considerados especialmente para:

consulta;

aprovação;

alertas;

acompanhamento;

operações rápidas;

instalação/montagem em campo.

**21. ESCALABILIDADE**

A arquitetura deverá permitir crescimento progressivo em:

número de empresas;

usuários;

pedidos;

itens;

movimentações;

documentos;

eventos;

integrações;

históricos;

dados analíticos.

O crescimento de uma empresa não deverá comprometer desproporcionalmente
o desempenho das demais.

**22. PRINCÍPIOS ARQUITETURAIS OBRIGATÓRIOS**

O desenvolvimento deverá respeitar obrigatoriamente:

Fonte única de verdade.

Um proprietário por domínio.

Responsabilidade clara por entidade e processo.

Separação entre evento e status.

Query, Command e Event.

Comunicação desacoplada entre módulos.

Idempotência.

Controle de concorrência.

Processos parciais nativos.

Histórico preservado.

Versionamento quando necessário.

Rastreabilidade ponta a ponta.

Multiempresa desde a fundação.

Segurança em camadas.

Processamento assíncrono para operações pesadas.

Integrações desacopladas.

BI sem dependência operacional.

Configuração sem substituir regras de negócio.

Ausência de duplicação funcional desnecessária.

Capacidade de evolução futura.

**23. LIMITES DE RESPONSABILIDADE ENTRE MÓDULOS**

Não será permitido que:

BI controle operações;

Configurações tome decisões de negócio;

Integrações se tornem fonte de verdade;

Estoque altere diretamente pedidos;

Compras altere diretamente engenharia;

Expedição altere diretamente qualidade;

Financeiro seja controlado diretamente por módulos operacionais;

um módulo manipule diretamente o estado interno de outro domínio.

As interações deverão ocorrer por:

consulta;

solicitação;

evento;

serviços transversais devidamente definidos.

**24. ESCOPO FUNCIONAL DO PRODUTO**

O produto deverá cobrir o ciclo completo de gestão industrial:

CADASTRO\
→ COMERCIAL\
→ ORÇAMENTO\
→ PEDIDO\
→ ENGENHARIA\
→ PLANEJAMENTO\
→ COMPRAS\
→ ESTOQUE\
→ PRODUÇÃO\
→ QUALIDADE\
→ EXPEDIÇÃO\
→ LOGÍSTICA\
→ OBRA\
→ INSTALAÇÃO / MONTAGEM\
→ CONCLUSÃO\
→ ACEITE\
→ FINANCEIRO\
→ BI

Com os módulos transversais de:

Integrações;

Usuários e Permissões;

Configurações;

Segurança;

Auditoria;

Histórico;

Documentos;

Notificações;

Eventos;

Processamento assíncrono.

**25. ESCOPO NÃO FUNCIONAL**

O produto deverá ser:

SaaS;

multiempresa;

seguro;

escalável;

modular;

integrado;

auditável;

rastreável;

resiliente;

preparado para processamento assíncrono;

preparado para integrações;

preparado para evolução;

responsivo;

adequado para desktop, tablet e dispositivos móveis conforme o processo.

**26. CRITÉRIO PARA NOVAS FUNCIONALIDADES**

Toda nova funcionalidade deverá responder:

Qual é o domínio responsável?

Qual é o módulo proprietário?

Qual entidade está envolvida?

Qual é a fonte única de verdade?

É consulta, comando ou evento?

Qual é a consequência?

Como o histórico será preservado?

O processo pode ser parcial?

O que acontece em caso de falha?

Existe risco de duplicação?

Existe risco de concorrência?

O comportamento precisa ser configurável?

Precisa de versionamento?

Como será garantida a rastreabilidade?

Se uma nova funcionalidade não respeitar esses princípios, deverá ser
revisada antes da implementação.

**27. FORA DO ESCOPO ARQUITETURAL**

Não fazem parte deste escopo:

criação de módulos sem justificativa de domínio;

duplicação de cadastros;

duplicação de regras de negócio;

criação de fontes paralelas de verdade;

alteração retroativa de histórico;

dependência operacional do BI;

manipulação direta do estado interno de outros módulos;

soluções específicas que comprometam a arquitetura multiempresa;

funcionalidades desenvolvidas exclusivamente para contornar limitações
arquiteturais.

**28. HIERARQUIA DE REFERÊNCIA DO PROJETO**

A documentação deverá seguir a seguinte hierarquia:

Arquitetura Mestre do SaaS Industrial

Escopo Geral do Projeto

Especificações funcionais dos 15 módulos

Especificação técnica

Contratos de API e eventos

Modelo de dados

Implementação

Em caso de conflito, a Arquitetura Mestre deverá prevalecer sobre
decisões locais de implementação.

**29. RESULTADO ESPERADO**

O resultado final deverá ser uma plataforma SaaS industrial integrada,
capaz de centralizar os processos de uma empresa industrial em um único
ambiente, mantendo:

dados confiáveis;

responsabilidades claras;

rastreabilidade;

histórico;

segurança;

integração;

flexibilidade;

escalabilidade;

capacidade de evolução.

O sistema deverá representar o funcionamento real da operação, incluindo
processos normais, parciais, exceções, retrabalhos, cancelamentos,
devoluções, revisões, ocorrências e atividades em campo.

**30. DEFINIÇÃO FINAL DO ESCOPO**

O projeto consiste no desenvolvimento de um SaaS industrial integrado,
modular e multiempresa, composto por 15 módulos funcionais e processos
transversais, cobrindo desde os cadastros e operações comerciais até
engenharia, planejamento, suprimentos, estoque, produção, qualidade,
expedição, logística, obra, instalação/montagem, financeiro, BI e
integrações.

A arquitetura deverá garantir que cada domínio tenha responsabilidade
própria, que cada entidade possua fonte única de verdade, que os módulos
se comuniquem de maneira controlada e desacoplada e que todo o ciclo
operacional possa ser rastreado de ponta a ponta.

Este documento representa o escopo geral do produto e deverá servir como
referência para as próximas etapas de especificação técnica, arquitetura
de software, modelagem de dados, definição de APIs, contratos de eventos
e implementação.
