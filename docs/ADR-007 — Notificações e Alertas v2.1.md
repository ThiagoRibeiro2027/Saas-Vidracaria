**ADR-007 — Notificações e Alertas**

**Status:** APROVADO\
**Versão:** 2.1\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 2026-09-09\
**Decisão:** Estratégia de notificações e alertas do SaaS

**1. Contexto**

O SaaS deverá possuir mecanismos de comunicação capazes de informar
usuários sobre eventos relevantes do sistema e do fluxo operacional.

As notificações deverão apoiar:

acompanhamento dos processos;

comunicação de pendências;

alertas operacionais;

mudanças de status;

aprovações;

ocorrências;

atrasos;

falhas;

eventos que exijam ação do usuário.

A estratégia deverá considerar diferentes perfis de usuários, diferentes
responsabilidades e o uso do sistema tanto em ambientes administrativos
quanto no campo.

As notificações não devem substituir os processos operacionais nem se
transformar em dependência única para execução das atividades.

**2. Problema**

O sistema precisa comunicar eventos importantes sem:

gerar excesso de notificações;

depender de um único canal;

comprometer o fluxo quando determinado canal estiver indisponível;

enviar informações para usuários sem autorização;

perder rastreabilidade;

criar dependência obrigatória de serviços externos.

Também existe uma particularidade importante no uso do PWA em
dispositivos iOS: o recebimento de push depende da instalação do PWA na
Tela de Início.

Essa característica deverá ser considerada na arquitetura e na
experiência de utilização.

**3. Decisão**

Será adotada uma estratégia de notificações **multicanal, controlada,
contextual e orientada a eventos**.

Os principais canais considerados serão:

notificações internas no sistema;

e-mail;

push;

outros canais externos, como WhatsApp e SMS, somente quando
posteriormente definidos e integrados.

A existência de múltiplos canais não significa que todos estarão
disponíveis para todos os eventos ou no MVP.

Cada evento deverá possuir uma definição de:

tipo;

prioridade;

destinatário;

contexto;

canal;

condição de disparo;

possibilidade de leitura/confirmação;

histórico;

estado de entrega quando aplicável.

**4. Notificações internas**

As notificações internas serão parte fundamental da estratégia.

O usuário deverá conseguir visualizar notificações relevantes dentro do
próprio sistema.

Quando aplicável, deverão apresentar:

título;

mensagem;

origem;

data/hora;

prioridade;

contexto;

referência ao registro relacionado;

estado de leitura;

ação necessária.

A notificação deverá permitir acesso ao contexto operacional
correspondente quando o usuário possuir autorização para isso.

**5. E-mail**

O e-mail poderá ser utilizado para:

comunicações operacionais;

alertas;

confirmações;

eventos administrativos;

informações que não dependam de resposta imediata;

comunicações definidas pelas preferências do usuário/empresa.

O envio deverá respeitar:

autorização;

preferências;

contexto da empresa;

segurança;

regras aplicáveis de privacidade.

O e-mail não deverá ser tratado como garantia absoluta de entrega.

**6. Push**

O push será disponibilizado como canal complementar, especialmente útil
para usuários que trabalham fora do ambiente administrativo e para o
aplicativo de campo.

Entretanto:

**Nenhum processo operacional crítico poderá depender exclusivamente do
recebimento de uma notificação push.**

A indisponibilidade do push não poderá impedir o usuário de consultar o
sistema ou executar um processo quando possuir autorização e as demais
condições necessárias.

Eventos críticos deverão possuir mecanismo complementar dentro do
próprio sistema.

**7. Push no PWA e iPhone**

Considerando a utilização do PWA como plataforma de campo definida no
ADR-008:

No iPhone, o recebimento de notificações push pelo PWA depende da
instalação do aplicativo na **Tela de Início**.

O sistema deverá considerar essa condição durante o onboarding e
configuração do usuário.

Quando aplicável, deverá:

informar que a instalação na Tela de Início é necessária para habilitar
push;

orientar o usuário sobre o procedimento;

informar o estado da habilitação de notificações;

identificar quando o push não estiver disponível;

evitar apresentar o push como único mecanismo para eventos críticos.

O push deverá ser tratado como **canal complementar**, e não como
requisito estrutural para continuidade do fluxo operacional.

**8. Prioridade das notificações**

As notificações deverão possuir níveis de prioridade.

A arquitetura deverá permitir, no mínimo, diferenciação entre:

informativa;

atenção;

importante;

crítica.

A prioridade poderá determinar:

canal utilizado;

destaque visual;

necessidade de confirmação;

persistência;

frequência;

possibilidade de agrupamento.

As regras específicas poderão ser refinadas posteriormente.

**9. Eventos notificáveis**

A arquitetura deverá permitir notificações relacionadas, entre outros,
a:

novos pedidos;

pendências;

aprovações;

reprovações;

liberações;

alterações de status;

atrasos;

produção;

materiais;

estoque;

expedição;

instalação;

ocorrências;

retrabalho;

bloqueios;

tarefas atribuídas;

eventos administrativos;

falhas relevantes;

eventos de segurança.

Nem todo evento deverá gerar notificação.

A geração deverá ocorrer somente quando houver valor operacional ou
administrativo.

**10. Destinatários**

As notificações deverão respeitar:

empresa;

unidade;

usuário;

perfil;

permissões;

responsabilidade pelo processo;

contexto operacional.

Um usuário não deverá receber informações referentes a registros aos
quais não possui acesso.

A autorização deverá ser validada no backend.

**11. Preferências**

O sistema deverá permitir configuração de preferências quando aplicável.

As preferências poderão considerar:

tipo de evento;

canal;

prioridade;

frequência;

horário;

ativação/desativação de determinados avisos.

Preferências não poderão desabilitar mecanismos necessários para
segurança, governança ou obrigações essenciais do sistema.

**12. Estados das notificações**

Quando aplicável, uma notificação deverá possuir estados como:

criada;

pendente;

enviada;

entregue;

lida;

reconhecida;

falhou;

cancelada.

A disponibilidade dos estados dependerá do canal.

O sistema não deverá afirmar que uma mensagem foi entregue quando não
houver evidência compatível com o canal utilizado.

**13. Histórico e rastreabilidade**

Eventos relevantes deverão possuir rastreabilidade.

Deverá ser possível identificar, quando aplicável:

evento originador;

empresa;

usuário destinatário;

canal;

data/hora;

estado;

tentativa;

falha;

leitura;

ação realizada.

A notificação deverá permanecer vinculada ao evento operacional que a
originou quando essa relação for relevante.

**14. Falhas de envio**

Falhas de comunicação não deverão causar perda silenciosa de eventos.

Quando um canal falhar, o sistema deverá:

registrar a falha;

identificar o canal;

preservar o evento;

permitir nova tentativa quando aplicável;

evitar duplicidade indevida;

utilizar mecanismo alternativo quando previsto pela regra do evento.

O evento operacional não deverá ser perdido simplesmente porque uma
notificação não foi entregue.

**15. Idempotência**

O mecanismo de notificações deverá evitar duplicidades causadas por:

retries;

falhas de rede;

reprocessamento;

indisponibilidade temporária;

processamento concorrente.

A arquitetura deverá permitir identificar unicamente o evento
notificável e suas tentativas de processamento.

**16. Agrupamento e excesso de notificações**

O sistema deverá evitar notificações excessivas.

Quando apropriado, deverá permitir:

agrupamento;

consolidação;

redução de mensagens repetidas;

controle de frequência;

prioridade.

Eventos críticos não deverão ser ocultados indevidamente por mecanismos
de agrupamento.

**17. Integração com o fluxo operacional**

As notificações deverão apoiar o fluxo:

**Orçamento → Pedido → Conferência → Liberação → Engenharia → Estoque →
Produção → Qualidade → Expedição → Instalação → Conclusão.**

As notificações devem indicar ao usuário quando uma ação é necessária,
mas não deverão substituir:

status;

pendências;

filas;

tarefas;

registros;

aprovações;

controles operacionais.

O sistema continuará sendo a fonte oficial do estado do processo.

**18. Integração com Offline**

As notificações deverão respeitar a estratégia definida no ADR-005.

A indisponibilidade de conectividade não deverá ser tratada como falha
da operação offline autorizada.

Quando o dispositivo voltar a sincronizar, eventos relevantes poderão
gerar as notificações correspondentes.

Não deverá haver dependência de push para registrar ou preservar um fato
operacional ocorrido offline.

**19. WhatsApp e SMS**

WhatsApp e SMS não fazem parte da dependência mínima do fluxo principal
do MVP.

Caso sejam implementados posteriormente, deverão ser tratados como
canais adicionais.

A indisponibilidade desses serviços não poderá impedir a operação
principal do SaaS.

**20. Segurança e privacidade**

As notificações deverão respeitar:

isolamento entre empresas;

permissões;

menor privilégio;

proteção de dados;

LGPD;

necessidade de acesso.

Não deverão ser enviados dados sensíveis ou informações operacionais
para destinatários não autorizados.

O conteúdo apresentado em notificações deverá considerar o risco de
exposição no dispositivo ou canal utilizado.

**21. Auditoria**

Eventos críticos de comunicação deverão possuir rastreabilidade
adequada.

Quando aplicável, deverão ser registrados:

criação;

alteração;

envio;

falha;

reprocessamento;

leitura;

reconhecimento;

cancelamento.

Alterações administrativas relevantes nas regras de notificação também
deverão ser auditáveis.

**22. MVP**

No MVP serão priorizados:

notificações internas;

e-mail;

estrutura para push;

eventos operacionais essenciais;

prioridades;

destinatários;

histórico;

estados;

controle de falhas;

preferências básicas;

integração com o fluxo principal.

O push não será tratado como requisito único para funcionamento do MVP.

A implementação efetiva do push deverá respeitar a decisão do ADR-008
sobre PWA e plataforma de campo.

**23. Fora do MVP**

Não fazem parte do MVP, salvo necessidade comprovada:

WhatsApp;

SMS;

automações complexas;

campanhas;

marketing automation;

mecanismos avançados de inteligência;

personalização excessiva;

múltiplos provedores simultâneos;

análise avançada de comportamento;

automações preditivas.

**24. Alternativas consideradas**

**Alternativa A — Apenas notificações internas**

**Rejeitada.**

Não atende adequadamente usuários que precisam ser avisados fora da
interface.

**Alternativa B — Push como principal canal**

**Rejeitada.**

Criaria dependência excessiva do dispositivo, navegador, sistema
operacional e conectividade.

**Alternativa C — Multicanal controlado**

**APROVADA.**

Permite adequar o canal ao evento e manter o sistema operacional mesmo
quando determinado canal estiver indisponível.

**Alternativa D — WhatsApp/SMS como canais obrigatórios**

**Rejeitada.**

Criaria dependência externa desnecessária para o funcionamento do núcleo
operacional.

**25. Consequências aceitas**

A decisão aceita:

necessidade de integração com serviços externos;

diferenças de disponibilidade entre canais;

necessidade de configuração;

manutenção de múltiplos mecanismos;

limitações específicas de plataformas;

necessidade de controle contra duplicidade;

implementação progressiva.

Também é aceita a necessidade de orientar usuários de iPhone sobre a
instalação do PWA na Tela de Início para utilização do push.

**26. Consequências não aceitas**

Não são aceitos:

perda silenciosa de notificações relevantes;

vazamento de informações entre empresas;

envio para usuário sem autorização;

duplicidade descontrolada;

dependência exclusiva de push para processo crítico;

dependência obrigatória de WhatsApp/SMS;

falsa indicação de entrega;

ausência de rastreabilidade;

alteração silenciosa de regras;

bloqueio do fluxo operacional pela indisponibilidade de um canal de
comunicação.

**27. Dependências**

Este ADR possui relação direta com:

**ADR-001 — Usuários / Permissões**

Define autorização e escopo dos destinatários.

**ADR-002 — MVP**

Define os limites funcionais do MVP.

**ADR-003 — Cliente-piloto**

Define a validação dos mecanismos durante a operação real.

**ADR-005 — Offline**

Define comportamento de notificações em operações offline.

**ADR-008 — Plataforma do aplicativo de campo**

Define a utilização do PWA e as limitações relacionadas ao push em iOS.

**28. Governança**

Nenhum módulo poderá criar regras de notificação conflitantes com este
ADR.

Alterações deverão registrar:

decisão anterior;

nova decisão;

motivo;

impacto funcional;

impacto técnico;

impacto no MVP;

consequências;

responsável;

data;

versão.

A evolução da estratégia deverá preservar o histórico das decisões
anteriores.

**29. Princípio final**

A estratégia de notificações deverá:

**informar o usuário sem transformar a comunicação em dependência
operacional.**

O sistema deverá permanecer funcional mesmo quando determinado canal
estiver indisponível.

As notificações devem complementar o processo, enquanto o próprio SaaS
permanece como fonte oficial dos estados, pendências, tarefas e
informações operacionais.

**Status final: APROVADO**
