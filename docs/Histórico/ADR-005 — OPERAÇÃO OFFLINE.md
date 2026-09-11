ADR-005 — OPERAÇÃO OFFLINE

VERSÃO 1.0 — DOCUMENTO OFICIAL

Status: APROVADO E FECHADO

Tipo: Decisão Arquitetural

Escopo: SaaS Industrial

1\. OBJETIVO

Definir a estratégia oficial para operação offline do SaaS Industrial,
permitindo a continuidade controlada de processos selecionados quando
não houver conectividade com o servidor.

O offline será especialmente direcionado a ambientes de campo, chão de
fábrica e locais com conectividade instável.

O objetivo não é reproduzir o SaaS integralmente no dispositivo, mas
permitir que determinados processos continuem operacionais sem conexão e
sejam posteriormente sincronizados com o servidor.

2\. PRINCÍPIO ARQUITETURAL

O SaaS adotará:

<span dir="rtl">“</span>Operação offline seletiva, controlada e
orientada ao processo.”

O servidor permanecerá como fonte única e oficial de verdade.

O dispositivo será um ambiente temporário para:

\- disponibilização controlada de dados;

\- execução de operações autorizadas;

\- armazenamento temporário;

\- coleta de informações;

\- posterior sincronização.

O offline não poderá criar uma arquitetura paralela ao SaaS.

3\. ABRANGÊNCIA

A operação offline será definida por processo e funcionalidade, e não
pela simples disponibilização integral de um módulo.

Cada funcionalidade deverá possuir uma classificação:

3.1 Offline Permitido

Pode ser executada e registrada sem conexão.

3.2 Offline Controlado

Pode ser executada sem conexão, mas possui limitações e validação
posterior.

3.3 Online Obrigatório

Depende de conexão com o servidor ou de serviço externo em tempo real.

Essa classificação deverá fazer parte da definição funcional e técnica
de cada processo.

4\. PRIORIDADE POR PROCESSO

4.1 Obra / Instalação / Montagem

Será o principal caso de uso do offline.

Poderá contemplar:

\- consulta da Obra;

\- consulta de pedido e itens;

\- informações técnicas;

\- desenhos e documentos;

\- programação;

\- equipe;

\- execução;

\- apontamentos;

\- instalação parcial;

\- pendências;

\- peças faltantes, incorretas ou danificadas;

\- ocorrências;

\- observações;

\- checklists;

\- medições;

\- fotografias;

\- evidências;

\- conclusão;

\- assinatura quando aplicável;

\- preparação de termo/comprovante.

4.2 Produção

Poderá operar offline de forma controlada para:

\- consulta da programação disponibilizada;

\- consulta de ordens;

\- consulta de operações;

\- instruções;

\- início/fim;

\- apontamento de produção;

\- quantidades;

\- perdas/refugos;

\- paradas;

\- ocorrências.

Decisões que dependam de informações centralizadas em tempo real poderão
exigir conexão.

4.3 Qualidade

Poderá contemplar:

\- consulta de inspeções;

\- critérios;

\- parâmetros;

\- checklists;

\- resultados;

\- aprovação;

\- reprovação;

\- pendência;

\- não conformidades;

\- observações;

\- fotografias;

\- evidências.

4.4 Expedição

Poderá contemplar:

\- consulta de carga/romaneio;

\- conferência;

\- divergências;

\- ocorrências;

\- evidências;

\- informações operacionais do carregamento.

Processos fiscais ou dependentes de serviços externos permanecerão
sujeitos à conectividade necessária.

4.5 Estoque

O offline será restrito.

Poderá permitir:

\- consulta de dados previamente disponibilizados;

\- conferência física;

\- coleta de informações;

\- determinados registros operacionais.

Dados locais de estoque nunca representarão garantia definitiva de
disponibilidade ou saldo atual.

Reservas, disponibilidade e demais decisões críticas serão validadas
pelo servidor.

4.6 Demais módulos

Comercial, Pedidos, Engenharia, Suprimentos, Financeiro, BI,
Integrações, Usuários/Permissões e Configurações permanecerão online por
padrão, salvo funcionalidades especificamente classificadas como
adequadas ao offline.

5\. CONTEXTO OFFLINE

O dispositivo não receberá uma cópia completa do banco de dados.

Receberá apenas um contexto offline controlado, limitado por:

\- tenant;

\- usuário;

\- permissões;

\- processo;

\- funcionalidade;

\- período de validade;

\- necessidade operacional.

Poderão ser disponibilizados:

\- Obra;

\- cliente relacionado;

\- pedido;

\- itens;

\- produtos;

\- componentes;

\- dados técnicos;

\- Engenharia;

\- documentos;

\- programação;

\- equipe;

\- Produção;

\- Qualidade;

\- Expedição;

\- checklists;

\- parâmetros necessários.

Dados sem utilidade para o processo não deverão ser disponibilizados.

6\. REGISTROS REALIZADOS OFFLINE

O dispositivo poderá registrar temporariamente:

\- operações;

\- apontamentos;

\- quantidades;

\- ocorrências;

\- observações;

\- checklists;

\- resultados de inspeção;

\- fotografias;

\- documentos;

\- evidências;

\- assinaturas;

\- data/hora;

\- usuário;

\- identificador da operação.

Enquanto não houver confirmação do servidor, esses registros serão
considerados:

<span dir="rtl">“</span>Pendentes de sincronização.”

7\. SINCRONIZAÇÃO

A sincronização seguirá o fluxo:

Dispositivo → Envio → Servidor → Validação → Conflito/Regra →
Processamento → Confirmação

Deverá possuir:

\- identificador único;

\- idempotência;

\- fila;

\- retry;

\- processamento ordenado quando necessário;

\- sincronização parcial;

\- tratamento de erros;

\- tratamento de conflitos;

\- rastreabilidade;

\- confirmação.

8\. REVALIDAÇÃO NO SERVIDOR

Toda operação realizada offline deverá ter sua autorização e validade
reavaliadas pelo servidor durante a sincronização.

Isso inclui, quando aplicável:

\- permissões;

\- status;

\- regras de negócio;

\- versão;

\- quantidades;

\- disponibilidade;

\- validade do processo;

\- condições operacionais.

Uma operação que era válida no momento em que foi registrada offline não
terá aceitação automática se as condições do servidor tiverem mudado.

9\. IDEMPOTÊNCIA

Cada operação offline deverá possuir um identificador único e
persistente.

Reenvios da mesma operação deverão ser reconhecidos pelo servidor e não
poderão gerar duplicidade.

Isso deverá funcionar mesmo quando:

\- houver perda de conexão;

\- o usuário não receber a confirmação;

\- o aplicativo for reiniciado;

\- houver retry automático.

10\. CONFLITOS

O sistema não deverá realizar sobrescrita silenciosa.

O princípio será:

Preservar → Identificar → Validar → Decidir → Registrar

Conflitos poderão envolver:

\- alteração simultânea;

\- cancelamento;

\- mudança de status;

\- mudança de quantidade;

\- alteração de programação;

\- alteração de Engenharia;

\- mudança de equipe;

\- alteração de Obra;

\- duplicidade;

\- estoque;

\- Qualidade;

\- sequência operacional.

Conflitos simples poderão ser resolvidos automaticamente.

Conflitos relevantes poderão gerar pendência para intervenção de usuário
autorizado.

11\. PRECEDÊNCIA DO SERVIDOR

O estado oficial do servidor terá precedência sobre dados locais
desatualizados.

Isso não significa apagar a operação offline.

O sistema deverá preservar:

\- registro original;

\- usuário;

\- dispositivo;

\- data/hora;

\- conteúdo;

\- motivo do conflito;

\- decisão;

\- responsável;

\- resultado.

12\. ESTOQUE E EFEITOS CRÍTICOS

Operações offline relacionadas a efeitos críticos deverão receber
tratamento especial.

Um registro offline poderá representar:

<span dir="rtl">“</span>Foi informado que determinada operação ocorreu.”

Mas não necessariamente:

<span dir="rtl">“</span>O efeito oficial já foi efetivado.”

A efetivação dependerá da validação e processamento pelo servidor.

Essa regra se aplica especialmente a:

\- estoque;

\- reservas;

\- produção;

\- qualidade;

\- financeiro;

\- fiscal;

\- demais efeitos críticos.

13\. ENGENHARIA E VERSIONAMENTO

Dados técnicos disponibilizados offline deverão manter referência à
versão utilizada.

Se houver nova revisão enquanto o dispositivo estiver offline:

\- a versão anterior será preservada;

\- a nova versão será identificada;

\- o servidor avaliará a validade da operação;

\- eventual conflito será tratado explicitamente.

Nenhuma atualização poderá apagar a rastreabilidade histórica.

14\. ARQUIVOS E EVIDÊNCIAS

Fotos, documentos e evidências poderão ser capturados offline.

Cada arquivo deverá possuir vínculo com seu processo.

Exemplos:

Foto → Ocorrência → Instalação → Obra

Foto → Não conformidade → Inspeção → Produção

Deverão ser controlados:

\- identificador;

\- usuário;

\- data/hora;

\- operação;

\- status;

\- envio;

\- tentativas;

\- confirmação.

Arquivos poderão ser sincronizados independentemente dos dados
estruturados.

15\. SEGURANÇA

O offline deverá manter os mesmos princípios de segurança do SaaS.

Incluindo:

\- autenticação;

\- autorização;

\- permissões;

\- isolamento de tenant;

\- proteção do armazenamento;

\- controle de sessão;

\- expiração;

\- auditoria;

\- proteção contra acesso indevido.

O offline não poderá permitir:

\- alteração de permissões;

\- alteração estrutural;

\- bypass de aprovação;

\- alteração de histórico;

\- acesso indevido;

\- violação de segregação de funções.

16\. EXPERIÊNCIA DO USUÁRIO

O sistema deverá indicar claramente:

\- Online;

\- Offline;

\- Sincronizando;

\- Sincronizado;

\- Pendências;

\- Erros;

\- Conflitos.

Deverá diferenciar claramente:

<span dir="rtl">“</span>Registrado no dispositivo — aguardando
sincronização.”

de:

<span dir="rtl">“</span>Registrado e confirmado pelo servidor.”

O usuário poderá acompanhar pendências e, quando permitido, solicitar
sincronização manual.

17\. ATUALIZAÇÃO DO CONTEXTO

Ao recuperar conexão, o sistema deverá:

1\. sincronizar operações;

2\. processar pendências;

3\. atualizar o contexto;

4\. informar alterações relevantes;

5\. exigir atualização quando necessário.

Dados críticos poderão exigir atualização antes de novas operações.

18\. LIMITES DO OFFLINE

O offline não será utilizado para:

\- reproduzir o SaaS inteiro;

\- garantir disponibilidade de estoque em tempo real;

\- efetivar operações fiscais que dependam de comunicação externa;

\- efetivar operações financeiras críticas sem validação;

\- contornar aprovações;

\- contornar permissões;

\- alterar regras;

\- ignorar controles de Qualidade;

\- ignorar processos obrigatórios.

Determinadas funcionalidades poderão possuir limite máximo de
permanência offline.

19\. DISPOSITIVOS

O foco inicial será:

\- smartphones;

\- tablets;

\- terminais industriais;

\- coletores;

\- outros dispositivos operacionais quando justificável.

A arquitetura deverá ser independente da plataforma.

Os requisitos específicos de hardware e sistemas operacionais serão
definidos na especificação técnica.

20\. RESILIÊNCIA E RECUPERAÇÃO

O sistema deverá resistir a:

\- perda de conexão;

\- queda do aplicativo;

\- reinicialização;

\- indisponibilidade do servidor;

\- falha parcial de sincronização;

\- atualização do aplicativo;

\- armazenamento insuficiente.

Dados já gravados localmente não poderão ser perdidos simplesmente por
uma interrupção.

21\. MONITORAMENTO ADMINISTRATIVO

Usuários autorizados poderão acompanhar:

\- dispositivos;

\- usuários;

\- operações pendentes;

\- conflitos;

\- erros;

\- arquivos pendentes;

\- última sincronização;

\- tempo de sincronização;

\- reprocessamentos.

Deverá existir capacidade de diagnóstico e reprocessamento controlado.

A arquitetura deverá prever bloqueio/invalidação remota do contexto
offline quando necessário.

22\. CONFIGURAÇÃO E GOVERNANÇA

O offline poderá ser configurado por:

\- processo;

\- funcionalidade;

\- usuário/perfil;

\- validade;

\- frequência de atualização;

\- parâmetros operacionais.

Porém:

Configuração não poderá transformar uma operação estruturalmente
incompatível com offline em uma operação offline.

Alterações relevantes deverão possuir:

\- histórico;

\- usuário;

\- data/hora;

\- configuração anterior;

\- nova configuração;

\- justificativa quando aplicável.

23\. ESCOPO DO MVP

23.1 Obrigatório

\- contexto offline;

\- segurança;

\- permissões;

\- multi-tenant;

\- fila;

\- armazenamento local;

\- identificação única;

\- idempotência;

\- sincronização;

\- retry;

\- conflitos;

\- auditoria;

\- indicadores de estado;

\- recuperação;

\- Obra/Instalação;

\- Produção selecionada;

\- Qualidade selecionada;

\- Expedição selecionada.

23.2 Controlado

\- determinadas operações de Estoque;

\- processos adicionais de campo;

\- funcionalidades que dependam de validação posterior.

23.3 Pós-MVP

\- offline amplo de outros módulos;

\- resolução avançada automática de conflitos;

\- operação prolongada de processos críticos;

\- gestão avançada de dispositivos;

\- integrações avançadas com equipamentos;

\- distribuição avançada de grandes volumes;

\- offline fiscal/financeiro avançado.

24\. CRITÉRIO PARA NOVAS FUNCIONALIDADES OFFLINE

Toda nova funcionalidade deverá ser avaliada quanto a:

\- necessidade de conexão;

\- criticidade;

\- risco de conflito;

\- segurança;

\- integridade;

\- disponibilidade de dados;

\- impacto operacional;

\- possibilidade de recuperação;

\- experiência do usuário.

A necessidade identificada pelo cliente-piloto poderá gerar demanda, mas
não determinará automaticamente a inclusão da funcionalidade.

25\. DECISÕES ARQUITETURAIS OBRIGATÓRIAS

Ficam oficialmente estabelecidos:

1\. Offline seletivo e orientado ao processo.

2\. Servidor como fonte única de verdade.

3\. Contexto offline controlado.

4\. Classificação por funcionalidade.

5\. Prioridade para Obra/Instalação.

6\. Segurança equivalente ao ambiente online.

7\. Permissões conforme ADR-001.

8\. Revalidação no servidor.

9\. Identificador único.

10\. Idempotência.

11\. Retry.

12\. Controle de conflitos.

13\. Preservação histórica.

14\. Sincronização parcial.

15\. Tratamento de arquivos e evidências.

16\. Controle de validade do contexto.

17\. Estoque com restrições especiais.

18\. Fiscal e Financeiro sujeitos às respectivas dependências.

19\. Versionamento de Engenharia preservado.

20\. Monitoramento administrativo.

21\. Bloqueio/invalidação remota previsto.

22\. Configuração subordinada às regras arquiteturais.

23\. Operações críticas não poderão utilizar o offline para burlar
controles.

26\. RELAÇÃO COM A ARQUITETURA MESTRE

Este ADR complementa a Arquitetura Mestre e não a substitui.

Em caso de conflito, permanece a hierarquia:

Arquitetura Mestre → Escopo do Projeto → ADRs aprovados → Especificações
Funcionais → Especificação Técnica → APIs/Eventos → Modelo de Dados →
Implementação.

27\. RESULTADO ESPERADO

A estratégia deverá permitir que o SaaS Industrial continue útil em
ambientes com conectividade limitada, principalmente em:

\- Obras;

\- instalações;

\- montagens;

\- campo;

\- chão de fábrica.

Ao mesmo tempo, deverá preservar:

\- integridade;

\- segurança;

\- rastreabilidade;

\- consistência;

\- isolamento multi-tenant;

\- controle de permissões;

\- histórico;

\- confiabilidade dos dados.

O resultado esperado não é um SaaS <span dir="rtl">“</span>sempre
offline”, mas um SaaS resiliente à ausência de conectividade onde isso
realmente agrega valor operacional.

28\. STATUS FINAL

ADR-005 — Operação Offline

Versão 1.0

Status: APROVADO E FECHADO
