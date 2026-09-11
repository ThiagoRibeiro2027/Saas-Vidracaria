ARQUITETURA MESTRE DO SaaS INDUSTRIAL\
VERSÃO 1.0 — DOCUMENTO OFICIAL DE REFERÊNCIA

OBJETIVO, ESCOPO E PRINCÍPIOS ARQUITETURAIS

1.1 OBJETIVO

Este documento estabelece a arquitetura funcional e conceitual
transversal do SaaS industrial, definindo:

responsabilidades dos módulos;

proprietários das entidades;

fluxos entre processos;

regras de comunicação;

fonte única de verdade;

estados e transições;

integrações;

rastreabilidade;

segurança;

multi-tenant;

processamento assíncrono;

configuração;

extensibilidade;

requisitos de resiliência.

Seu objetivo é impedir que a implementação dos módulos gere duplicidade,
conflitos de responsabilidade ou comportamentos incompatíveis.

1.2 PRINCÍPIOS OBRIGATÓRIOS

P1 — FONTE ÚNICA DE VERDADE

Cada entidade deve possuir uma única fonte de verdade.

P2 — RESPONSABILIDADE POR DOMÍNIO

O módulo proprietário é responsável pelo seu domínio.

P3 — FATO, ESTADO E CONSEQUÊNCIA SÃO CONCEITOS DIFERENTES

Um evento ocorrido não deve ser confundido com o estado atual ou com
suas consequências.

P4 — O STATUS PERTENCE AO SEU PROPRIETÁRIO

Nenhum módulo deve controlar diretamente o status de uma entidade
pertencente a outro módulo.

P5 — O PASSADO DEVE SER PRESERVADO

Alterações posteriores não devem apagar ou reescrever fatos históricos.

P6 — VERSIONAMENTO QUANDO NECESSÁRIO

Quando uma alteração puder mudar a interpretação de um registro
histórico, deve existir versionamento.

P7 — EVENTOS PARA DESACOPLAMENTO

Processos independentes devem utilizar eventos quando apropriado.

P8 — IDEMPOTÊNCIA

Processamentos repetidos não podem produzir efeitos duplicados
indevidos.

P9 — FALHAS DEVEM SER CONTROLÁVEIS

O sistema deve possuir estados, retry, reprocessamento e reconciliação
quando aplicável.

P10 — MULTI-TENANT DESDE A ORIGEM

O isolamento entre empresas deve fazer parte da arquitetura fundamental.

P11 — SEGURANÇA EM CAMADAS

Autenticação, autorização, tenant, regras de negócio e integridade devem
ser tratados separadamente.

P12 — BI NÃO CONTROLA OPERAÇÃO

BI é consumidor analítico e não pode ser dependência operacional.

P13 — CONFIGURAÇÃO NÃO SUBSTITUI REGRA DE NEGÓCIO

Configurações parametrizam comportamentos previstos.

P14 — PROCESSAMENTO PESADO É ASSÍNCRONO

Operações potencialmente demoradas devem utilizar processamento em
segundo plano.

P15 — ESTOQUE REPRESENTA FATOS FÍSICOS/OPERACIONAIS

Saldo é consequência das movimentações e estados operacionais.

P16 — PLANEJAMENTO NÃO É EXECUÇÃO

Planejar uma necessidade não significa que ela tenha sido executada.

P17 — PARCIALIDADE É NATIVA

Os processos devem admitir atendimento parcial.

P18 — RASTREABILIDADE PONTA A PONTA

As principais operações devem poder ser rastreadas desde sua origem até
suas consequências.

P19 — INSTALAÇÃO É PROCESSO PRÓPRIO

Expedição, entrega e instalação são etapas diferentes.

P20 — OBRA É CONTEXTO PRÓPRIO

Obra não deve ser confundida com cliente, pedido ou endereço.

P21 — CONSEQUÊNCIA NÃO REESCREVE FATO HISTÓRICO

Uma ocorrência posterior gera nova consequência; não altera o passado.

P22 — EXCEÇÕES FAZEM PARTE DA ARQUITETURA

Falhas, devoluções, retrabalhos, divergências e revisitas devem ser
previstas desde o início.

MAPA DOS 15 MÓDULOS E RESPONSABILIDADES

TÓPICO 1 — BASE / ESTRUTURA\
Responsabilidade: fundação estrutural e técnica.

TÓPICO 2 — CADASTROS\
Responsabilidade: dados mestres.

TÓPICO 3 — PEDIDOS\
Responsabilidade: compromisso comercial.

TÓPICO 4 — PCP / PRODUÇÃO\
Responsabilidade: planejamento e execução produtiva.

TÓPICO 5 — ENGENHARIA\
Responsabilidade: estrutura e interpretação técnica.

TÓPICO 6 — ESTOQUE\
Responsabilidade: existência, disponibilidade e movimentação.

TÓPICO 7 — SUPRIMENTOS / COMPRAS\
Responsabilidade: aquisição e fornecimento.

TÓPICO 8 — QUALIDADE\
Responsabilidade: conformidade.

TÓPICO 9 — EXPEDIÇÃO / LOGÍSTICA\
Responsabilidade: separação, envio e entrega.

TÓPICO 10 — COMERCIAL / ORÇAMENTOS\
Responsabilidade: negociação e propostas.

TÓPICO 11 — FINANCEIRO\
Responsabilidade: registros financeiros.

TÓPICO 12 — BI\
Responsabilidade: análise e indicadores.

TÓPICO 13 — INTEGRAÇÕES\
Responsabilidade: comunicação externa.

TÓPICO 14 — USUÁRIOS / PERMISSÕES\
Responsabilidade: identidade e autorização.

TÓPICO 15 — CONFIGURAÇÕES\
Responsabilidade: parâmetros e comportamentos configuráveis.

OBRA

Obra é uma entidade/contexto transversal, mantida estruturalmente em
Cadastros.

INSTALAÇÃO/MONTAGEM

Instalação/Montagem é um processo operacional próprio, integrado
principalmente à Expedição, Estoque, Engenharia, Qualidade e Financeiro.

ENTIDADES E FONTE ÚNICA DE VERDADE

3.1 PROPRIETÁRIOS DAS ENTIDADES

TENANT / EMPRESA\
Proprietário: T1 — Base / Estrutura.

USUÁRIO\
Proprietário: T14 — Usuários / Permissões.

PERMISSÕES\
Proprietário: T14 — Usuários / Permissões.

CONFIGURAÇÃO\
Proprietário: T15 — Configurações.

CLIENTE\
Proprietário: T2 — Cadastros.

FORNECEDOR\
Proprietário: T2 — Cadastros.

PESSOA\
Proprietário: T2 — Cadastros.

CONTATO\
Proprietário: T2 — Cadastros.

ENDEREÇO\
Proprietário: T2 — Cadastros.

OBRA\
Proprietário estrutural: T2 — Cadastros.

ITEM / MATERIAL / PRODUTO\
Proprietário: T2 — Cadastros.

ESTRUTURA / BOM\
Proprietário: T5 — Engenharia.

VERSÃO DE ENGENHARIA\
Proprietário: T5 — Engenharia.

ORÇAMENTO\
Proprietário: T10 — Comercial.

PEDIDO\
Proprietário: T3 — Pedidos.

DEMANDA / NECESSIDADE DE PLANEJAMENTO\
Proprietário: T4 — PCP / Produção.

RESERVA\
Proprietário: T6 — Estoque.

MOVIMENTAÇÃO DE ESTOQUE\
Proprietário: T6 — Estoque.

COMPRA\
Proprietário: T7 — Suprimentos / Compras.

RECEBIMENTO\
Proprietário do processo/documento: T7 — Suprimentos / Compras.

ORDEM DE PRODUÇÃO\
Proprietário: T4 — PCP / Produção.

REGISTROS DE PRODUÇÃO\
Proprietário: T4 — PCP / Produção.

INSPEÇÃO / QUALIDADE\
Proprietário: T8 — Qualidade.

EXPEDIÇÃO\
Proprietário: T9 — Expedição / Logística.

ENTREGA\
Proprietário: T9 — Expedição / Logística.

INSTALAÇÃO / OCORRÊNCIAS DE INSTALAÇÃO\
Proprietário: processo de Instalação / Montagem.

REGISTROS FINANCEIROS\
Proprietário: T11 — Financeiro.

ESTRUTURAS ANALÍTICAS\
Proprietário: T12 — BI.

MENSAGENS DE INTEGRAÇÃO EXTERNA\
Proprietário: T13 — Integrações.

AUDITORIA\
Responsabilidade: serviço transversal.

3.2 REGRA FUNDAMENTAL

Uma entidade → um proprietário → uma fonte de verdade → múltiplos
consumidores.

Outros módulos podem apresentar ou referenciar dados, mas não criar uma
segunda fonte independente.

FLUXOS PONTA A PONTA

4.1 FLUXO PRINCIPAL

Comercial\
→ Pedido\
→ Engenharia\
→ Planejamento\
→ Estoque / Suprimentos\
→ Produção\
→ Qualidade\
→ Estoque\
→ Expedição\
→ Transporte\
→ Entrega na Obra\
→ Instalação / Montagem\
→ Conclusão\
→ Aceite.

4.2 FLUXO DE COMPRAS

Necessidade\
→ Compra\
→ Recebimento\
→ Estoque\
→ Qualidade\
→ Disponibilização.

4.3 FLUXO DE PRODUÇÃO

Necessidade\
→ Ordem de Produção\
→ Produção\
→ Consumo\
→ Produto\
→ Qualidade\
→ Estoque.

4.4 FLUXO FINANCEIRO

Pedido\
→ Faturamento\
→ Título\
→ Vencimento\
→ Pagamento\
→ Liquidação.

4.5 REGRA

Os fluxos não precisam ser rigidamente sequenciais.

Processos podem ocorrer:

parcialmente;

em paralelo;

em etapas;

com replanejamento;

com pendências.

STATUS, ESTADOS E TRANSIÇÕES

Cada domínio possui seus próprios estados.

Não deverá existir um <span dir="rtl">“</span>superstatus” que tente
representar simultaneamente:

pedido;

produção;

qualidade;

estoque;

expedição;

instalação;

financeiro.

Regra:

Estado pertence ao processo.\
Evento representa fato ocorrido.

5.1 EXEMPLOS

PEDIDO

Em elaboração\
→ Confirmado\
→ Em atendimento\
→ Atendido.

PRODUÇÃO

Planejada\
→ Em execução\
→ Parcial\
→ Concluída.

QUALIDADE

Pendente\
→ Em inspeção\
→ Aprovada / Rejeitada / Condicionada.

INSTALAÇÃO

Planejada\
→ Agendada\
→ Confirmada\
→ Em execução\
→ Parcial\
→ Concluída\
→ Aguardando aceite\
→ Aceita.

5.2 ESTOQUE

Estoque não será reduzido a um único status.

Deverá considerar:

quantidade;

localização;

disponibilidade;

reserva;

bloqueio;

inspeção;

trânsito;

separação;

identificação;

origem.

REGRAS DE NEGÓCIO E RESPONSABILIDADES

O proprietário do domínio determina:

criação;

alteração;

aprovação;

cancelamento;

bloqueio;

liberação;

cálculo;

exceções.

Outros módulos podem solicitar ações, fornecer informações ou reagir a
eventos.

6.1 PERMISSÃO NÃO É REGRA

T14 determina quem pode executar.

O módulo de negócio determina se a operação é válida.

6.2 CONFIGURAÇÃO NÃO É REGRA

T15 fornece parâmetros.

O módulo de domínio interpreta esses parâmetros.

6.3 MARGEM DE QUEBRA

A margem de quebra é uma quantidade técnica planejada.

Exemplo:

2.000 mm × 1,05 = 2.100 mm.

Não representa a perda efetivamente ocorrida.

A perda real é registrada separadamente durante a produção.

6.4 AUTOMAÇÃO

Padrão:

Evento\
→ Processo responsável\
→ Regra\
→ Ação\
→ Novo evento.

Automação não transfere propriedade do domínio.

INTEGRAÇÃO ENTRE MÓDULOS, EVENTOS E DEPENDÊNCIAS

Os módulos poderão se comunicar por:

QUERY\
Consulta sem alteração.

COMMAND\
Solicitação de ação.

EVENT\
Fato que já aconteceu.

7.1 EVENTOS

Eventos devem possuir identificação única e contexto suficiente para:

tenant;

entidade;

origem;

operação;

data/hora;

versão, quando aplicável.

7.2 EXEMPLOS DE EVENTOS

PedidoCriado

PedidoAprovado

EngenhariaVersionada

VersaoEngenhariaComprometida

MaterialRecebido

MaterialReservado

MaterialConsumido

ProduçãoIniciada

QuantidadeProduzida

InspecaoConcluida

QuantidadeAprovada

QuantidadeRejeitada

ProdutoLiberado

ProdutoExpedido

EntregaRealizada

InstalaçãoAgendada

InstalaçãoIniciada

InstalaçãoParcial

OcorrenciaInstalacao

InstalaçãoConcluida

AceiteRealizado

FaturamentoGerado

PagamentoRealizado

TituloLiquidado.

ESTOQUE, RESERVAS, CONSUMO E MOVIMENTAÇÕES

A arquitetura separa:

Demanda\
→ Planejamento\
→ Comprometimento\
→ Reserva\
→ Separação\
→ Consumo / Execução\
→ Disponibilização\
→ Expedição.

8.1 RESERVA

Reserva não é baixa.

8.2 SEPARAÇÃO

Separação não é consumo.

8.3 CONSUMO

Consumo representa utilização física efetiva.

8.4 MOVIMENTAÇÃO

Toda alteração física/operacional relevante deverá possuir movimentação
apropriada.

Exemplos:

entrada;

transferência;

reserva;

separação;

consumo;

retorno;

bloqueio;

liberação;

ajuste;

expedição;

devolução;

sucata.

Saldo é consequência dessas movimentações.

8.5 MATERIAIS LINEARES

O sistema deverá preservar dimensões individuais de:

barras;

cantoneiras;

perfis;

tubos;

outros materiais lineares.

Sobras reutilizáveis deverão possuir identificação e regra de
reutilização configurável.

O futuro otimizador de corte será desacoplado do núcleo de MRP.

ENGENHARIA, VERSIONAMENTO E RASTREABILIDADE

Pedido define:

O QUÊ.

Engenharia define:

COMO.

9.1 ENGENHARIA

Responsável por:

BOM;

componentes;

matérias-primas;

quantidades;

unidades;

dimensões;

operações;

requisitos técnicos;

versões;

revisões.

9.2 VERSIONAMENTO

Toda operação dependente de interpretação técnica deverá identificar a
versão utilizada ou comprometida.

Uma nova revisão não substitui silenciosamente uma versão histórica.

9.3 RASTREABILIDADE

Fluxo:

Pedido\
→ Item\
→ Engenharia / Versão\
→ Planejamento\
→ OP\
→ Material / Lote / ID\
→ Consumo\
→ Produção\
→ Qualidade\
→ Estoque\
→ Expedição\
→ Obra\
→ Instalação\
→ Aceite.

QUALIDADE, PRODUÇÃO E EXPEDIÇÃO

Regra fundamental:

Produção informa o que foi produzido.

Qualidade informa o que está conforme.

Estoque informa o que está disponível.

Expedição informa o que foi enviado.

10.1 PRODUÇÃO

Separar:

planejado;

produzido;

em processo;

inspecionado;

aprovado;

rejeitado;

pendente;

retrabalho;

sucata.

10.2 QUALIDADE

Uma quantidade produzida pode ser dividida em diferentes resultados.

Exemplo:

400 inspecionados:

350 aprovados;\
30 rejeitados;\
20 pendentes.

10.3 RETRABALHO

Retrabalho permanece vinculado à origem.

Não apaga a rejeição original.

10.4 EXPEDIÇÃO

Produto:

produzido ≠ aprovado ≠ disponível ≠ separado ≠ expedido.

A elegibilidade para expedição é uma condição derivada.

OBRA E INSTALAÇÃO / MONTAGEM

11.1 FLUXO

Expedição\
→ Transporte\
→ Entrega na Obra\
→ Instalação / Montagem\
→ Conclusão\
→ Aceite.

11.2 OBRA

Obra é diferente de:

cliente;

pedido;

endereço.

Uma Obra poderá estar relacionada a diferentes pedidos e instalações.

11.3 INSTALAÇÃO

Deverá controlar:

programação;

agenda;

equipe;

responsável;

execução;

quantidades;

pendências;

ocorrências;

fotos;

documentos;

evidências;

conclusão;

aceite;

revisitas.

11.4 OCORRÊNCIAS

Suportar situações como:

obra não liberada;

cliente ausente;

dificuldade de acesso;

peça faltante;

peça incorreta;

peça danificada;

medida incompatível;

problema técnico;

problema de qualidade;

retrabalho;

nova fabricação;

material adicional;

instalação parcial;

necessidade de revisita.

11.5 INTERFACES

Problema técnico:

Instalação → Engenharia.

Problema de conformidade:

Instalação → Qualidade.

Material físico:

Instalação → Estoque.

Consequência financeira:

Instalação → Financeiro.

11.6 CONCLUSÃO E ACEITE

São eventos distintos.

A instalação pode estar concluída operacionalmente e ainda aguardar o
aceite.

COMERCIAL, PEDIDOS E FINANCEIRO

12.1 RESPONSABILIDADES

Comercial: negociação.

Pedido: compromisso formal.

Financeiro: registros financeiros.

12.2 ORÇAMENTO

Orçamento não é Pedido.

Conversão deve preservar rastreabilidade.

Um orçamento pode resultar em:

nenhum pedido;

um pedido;

múltiplos pedidos;

pedido parcial.

12.3 FINANCEIRO

Fluxo:

Pedido\
→ Faturamento\
→ Título\
→ Vencimento\
→ Pagamento\
→ Liquidação.

Pedido não é título financeiro.

12.4 STATUS

Status comercial/operacional e financeiro são independentes.

12.5 INSTALAÇÃO

A instalação pode gerar consequências financeiras, mas não altera
diretamente títulos.

Financeiro permanece como fonte de verdade.

BI, INTEGRAÇÕES E SERVIÇOS TRANSVERSAIS

Serviços transversais incluem:

BI;

integrações;

documentos;

arquivos;

notificações;

busca;

auditoria;

jobs;

eventos.

Eles suportam o sistema, mas não assumem propriedade dos domínios.

13.1 BI

BI consome dados.

Não controla operação.

13.2 INTEGRAÇÕES

T13 controla:

comunicação externa;

identificadores externos;

retry;

idempotência;

reconciliação;

rastreabilidade.

Não se torna proprietário dos dados de negócio.

SEGURANÇA, PERMISSÕES, AUDITORIA E MULTIEMPRESA

14.1 SEGURANÇA

Toda operação considera:

Usuário + Tenant + Permissão + Contexto + Regra de negócio.

14.2 MULTI-TENANT

O isolamento deverá ocorrer em:

banco;

API;

aplicação;

arquivos;

eventos;

jobs;

busca;

BI;

notificações;

integrações;

auditoria.

14.3 AUDITORIA

Operações críticas devem registrar:

quem;

quando;

tenant;

entidade;

ação;

antes;

depois;

origem;

justificativa;

aprovação;

resultado.

14.4 SEGREGAÇÃO

Operações críticas poderão exigir:

autorização;

justificativa;

segundo responsável;

aprovação.

EXCEÇÕES, CONCORRÊNCIA, PROCESSAMENTO ASSÍNCRONO E RESILIÊNCIA

Todo processo crítico deverá considerar:

sucesso + parcialidade + falha + duplicidade + concorrência +
recuperação.

15.1 EXCEÇÕES

Devem ser previstas:

cancelamentos;

devoluções;

divergências;

retrabalhos;

falhas de integração;

reprocessamentos;

bloqueios;

revisitas;

alterações técnicas.

15.2 CONCORRÊNCIA

Proteção obrigatória para:

reservas;

separações;

consumo;

expedição;

transferências;

ajustes;

aprovações;

alterações críticas.

15.3 PROCESSAMENTO ASSÍNCRONO

Aplicável a:

importações;

exportações grandes;

relatórios pesados;

documentos;

integrações;

BI;

notificações em massa.

Jobs devem possuir:

ID;

tenant;

origem;

tipo;

horário;

estado;

tentativas;

erro;

resultado;

possibilidade de reprocessamento.

15.4 RETRY E IDEMPOTÊNCIA

Retry não pode produzir duplicidade.

15.5 EVENTOS FORA DE ORDEM

O sistema deverá conseguir:

identificar dependências;

aguardar pré-requisitos;

processar posteriormente;

registrar pendências;

reconciliar divergências.

15.6 OBSERVABILIDADE

Deve ser possível identificar:

onde ocorreu;

quando ocorreu;

por que ocorreu;

tentativas;

consequência;

ação necessária.

CONFIGURAÇÃO E EXTENSIBILIDADE

16.1 TRÊS NÍVEIS

REGRA FIXA\
Estrutural e não configurável.

REGRA CONFIGURÁVEL\
Comportamento previsto pelo sistema.

PARÂMETRO\
Valor utilizado pela regra.

16.2 CONFIGURAÇÃO POR TENANT

Configurações devem ser isoladas por empresa.

16.3 HISTÓRICO

Alterações de configuração não podem reinterpretar automaticamente o
passado.

Quando necessário, utilizar:

versão;

vigência;

data de início;

data de término.

16.4 CAMPOS PERSONALIZADOS

Permitidos quando apropriado.

Não devem substituir campos estruturais fundamentais.

16.5 LISTAS CONFIGURÁVEIS

Quando houver histórico associado, preferir:

inativação \> exclusão.

16.6 EXTENSIBILIDADE

A arquitetura deve permitir:

novos módulos;

novas integrações;

novas APIs;

novos eventos;

novas capacidades analíticas.

16.7 REGRA

Configuração adapta comportamentos previstos; não transforma o sistema
em uma plataforma de regras arbitrárias.

MATRIZ FINAL DE RESPONSABILIDADES E DEPENDÊNCIAS

17.1 DEPENDÊNCIA ESTRUTURAL

T1 → T2 → demais módulos.

17.2 FLUXO PREDOMINANTE

T10 → T3 → T5 → T4 → T8 → T9.

Interfaces paralelas:

T5 / T4 ↔ T6.

T5 / T4 ↔ T7.

T4 ↔ T8.

T8 ↔ T6.

T9 ↔ T6.

T3 / T9 / Instalação ↔ T11.

17.3 DEPENDÊNCIAS PROIBIDAS

Não permitir:

BI controlando operação;

Configuração tomando decisão de negócio;

Integração tornando-se fonte de verdade;

Expedição alterando Qualidade;

Compras alterando Engenharia;

Estoque alterando Pedido;

qualquer módulo manipulando diretamente o estado interno de outro
domínio.

17.4 COMUNICAÇÃO PERMITIDA

CONSULTA

<span dir="rtl">“</span>Qual é a disponibilidade?”

SOLICITAÇÃO

<span dir="rtl">“</span>Reserve esta quantidade.”

EVENTO

<span dir="rtl">“</span>Esta quantidade foi consumida.”

O módulo proprietário processa a ação ou consequência.

DECISÕES ARQUITETURAIS OBRIGATÓRIAS PARA IMPLEMENTAÇÃO

18.1\
Cada entidade terá um proprietário único.

18.2\
Cada módulo será responsável por seu domínio.

18.3\
Comunicações deverão distinguir Query, Command e Event.

18.4\
Eventos deverão possuir identificação e contexto suficientes para
rastreabilidade.

18.5\
Operações críticas deverão suportar idempotência quando aplicável.

18.6\
Operações concorrentes deverão possuir proteção de consistência.

18.7\
Estoque será baseado em movimentações e estados derivados.

18.8\
Reserva, separação, consumo e expedição permanecerão conceitos
distintos.

18.9\
Engenharia utilizará versionamento formal.

18.10\
Produção, Qualidade, Estoque e Expedição permanecerão domínios
distintos.

18.11\
Parcialidade será suportada nativamente.

18.12\
Instalação/Montagem será processo próprio.

18.13\
Obra será contexto próprio.

18.14\
Conclusão e Aceite da instalação serão eventos distintos.

18.15\
Histórico não poderá ser apagado para representar o presente.

18.16\
Multi-tenant será implementado desde a fundação.

18.17\
Segurança será aplicada em múltiplas camadas.

18.18\
Processamentos pesados serão assíncronos.

18.19\
Falhas deverão ser rastreáveis e reprocessáveis quando aplicável.

18.20\
BI não será dependência operacional.

18.21\
Integrações serão desacopladas e idempotentes.

18.22\
Configuração não substituirá regras de negócio.

18.23\
Novas funcionalidades deverão respeitar a matriz de responsabilidades.

HIERARQUIA DE REFERÊNCIA

A arquitetura consolidada estabelece a seguinte hierarquia:

Documento Mestre de Arquitetura\
↓

Prompts funcionais dos 15 módulos\
↓

Especificação técnica\
↓

Implementação.

Quando houver conflito:

A Arquitetura Mestre prevalece sobre decisões locais de implementação.

Os prompts dos módulos continuam sendo a referência detalhada das
funcionalidades específicas de cada módulo.

CRITÉRIO PARA NOVAS FUNCIONALIDADES

Antes de implementar qualquer nova funcionalidade, deve-se responder:

Qual é o domínio?

Quem é o proprietário?

Qual entidade está sendo alterada?

Qual é a fonte de verdade?

É Query, Command ou Event?

Qual é a consequência?

Como o histórico será preservado?

Pode ocorrer parcialmente?

O que acontece em caso de falha?

Como será tratada duplicidade?

Como será tratada concorrência?

Existe necessidade de configuração?

Existe necessidade de versionamento?

Como será mantida a rastreabilidade?

Se essas respostas não forem claras, a funcionalidade deverá ser
analisada arquiteturalmente antes da implementação.

CONCLUSÃO

A arquitetura consolidada estabelece um SaaS industrial modular,
integrado e multi-tenant, no qual cada domínio possui responsabilidade
clara e as interações são controladas por contratos arquiteturais.

O sistema deverá preservar:

fonte única de verdade;

separação de responsabilidades;

histórico;

versionamento;

rastreabilidade;

parcialidade;

consistência;

segurança;

isolamento entre empresas;

resiliência;

extensibilidade.

O fluxo operacional completo contempla:

Comercial\
→ Pedido\
→ Engenharia\
→ Planejamento\
→ Suprimentos / Estoque\
→ Produção\
→ Qualidade\
→ Estoque\
→ Expedição\
→ Transporte\
→ Obra\
→ Instalação / Montagem\
→ Conclusão\
→ Aceite.

Financeiro, BI, Integrações, Segurança, Auditoria, Notificações e
Configurações atuam transversalmente conforme suas respectivas
responsabilidades.

STATUS OFICIAL

ARQUITETURA MESTRE DO SaaS INDUSTRIAL — VERSÃO 1.0

18 blocos consolidados e aprovados.\
15 módulos funcionais previamente definidos.\
Revisão de consistência concluída.\
Decisões arquiteturais obrigatórias estabelecidas.

Este documento passa a ser a referência arquitetural consolidada para a
próxima etapa do projeto.
