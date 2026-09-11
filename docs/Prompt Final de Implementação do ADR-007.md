**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-007 — Notificações e Alertas**

Implementar o mecanismo de notificações e alertas do SaaS de acordo com
o ADR-007 aprovado.

**IMPORTANTE:** este prompt é uma instrução de implementação. Não
redesenhar, reinterpretar ou ampliar as decisões do ADR.

**1. OBJETIVO**

Implementar uma arquitetura de notificações:

multicanal;

orientada a eventos;

controlada;

rastreável;

segura;

integrada aos processos;

independente de um único canal.

O sistema deverá permanecer operacional mesmo quando um canal de
comunicação estiver indisponível.

**2. CANAIS**

Implementar a estrutura para:

notificações internas;

e-mail;

push.

Preparar a arquitetura para canais futuros, sem torná-los dependência do
MVP:

WhatsApp;

SMS.

**3. NOTIFICAÇÕES INTERNAS**

Criar mecanismo para:

gerar notificações;

listar notificações;

identificar notificações não lidas;

marcar como lida;

acessar o registro relacionado;

identificar prioridade;

identificar origem;

registrar data/hora.

Respeitar integralmente as permissões do usuário.

**4. MODELO DE EVENTO**

Cada evento notificável deverá possuir estrutura capaz de representar:

identificador único;

tipo;

origem;

empresa;

unidade, quando aplicável;

usuário destinatário;

referência ao registro relacionado;

prioridade;

canal;

estado;

data/hora;

tentativas;

erros;

leitura/reconhecimento, quando aplicável.

**5. PRIORIDADES**

Implementar níveis de prioridade:

informativa;

atenção;

importante;

crítica.

Permitir que a prioridade influencie o tratamento do evento e os canais
utilizados quando definido pela regra correspondente.

**6. DESTINATÁRIOS**

Determinar destinatários considerando:

empresa;

unidade;

usuário;

perfil;

permissões;

responsabilidade;

contexto operacional.

A autorização deverá ser validada no backend.

**Nunca confiar somente no frontend para determinar quem pode receber
uma notificação.**

**7. PUSH**

Implementar push como canal complementar.

**Regra obrigatória**

**Nenhum processo operacional crítico poderá depender exclusivamente do
recebimento de push.**

Se o push estiver indisponível:

o evento continuará registrado;

a informação continuará disponível no sistema;

o processo não deverá ser invalidado;

deverá existir mecanismo interno adequado.

**8. PWA E IPHONE**

O ADR-008 define o PWA como plataforma de campo do MVP.

No iPhone, considerar que o recebimento de push pelo PWA depende da
instalação do sistema na **Tela de Início**.

Implementar:

identificação do estado do push;

orientação para instalação quando necessário;

orientação durante o onboarding;

informação quando o push não estiver habilitado;

tratamento adequado quando o usuário utilizar o sistema sem push
disponível.

O push não deverá ser apresentado como requisito para execução dos
processos operacionais.

**9. E-MAIL**

Implementar infraestrutura para envio de e-mails relacionados a eventos
autorizados.

Registrar:

evento;

destinatário;

tentativa;

resultado;

erro;

estado.

A tentativa de envio não deverá ser interpretada automaticamente como
confirmação de entrega.

**10. ESTADOS**

Implementar, quando aplicável:

criada;

pendente;

enviada;

entregue;

lida;

reconhecida;

falhou;

cancelada.

Não criar estados que representem garantias inexistentes do canal
utilizado.

**11. FALHAS E RETRY**

Implementar:

registro de erro;

retry controlado;

reprocessamento;

prevenção de duplicidade;

preservação do evento original.

Uma falha de envio nunca deverá apagar silenciosamente o evento.

**12. IDEMPOTÊNCIA**

Garantir idempotência para:

criação;

envio;

retry;

reprocessamento.

O mesmo evento não deverá gerar múltiplas notificações indevidas por
causa de retries, concorrência ou falhas de comunicação.

**13. AGRUPAMENTO**

Quando adequado, implementar mecanismos de:

agrupamento;

consolidação;

redução de mensagens repetidas;

controle de frequência.

Não ocultar ou eliminar indevidamente eventos críticos.

**14. EVENTOS OPERACIONAIS**

Preparar integração para eventos como:

novo pedido;

pendência;

aprovação;

reprovação;

liberação;

alteração de status;

atraso;

produção;

material;

estoque;

expedição;

instalação;

ocorrência;

retrabalho;

bloqueio;

tarefa atribuída;

eventos administrativos;

eventos críticos de segurança.

Não gerar notificações automaticamente para todo evento existente no
sistema.

A geração deverá ocorrer somente quando houver valor operacional ou
administrativo.

**15. INTEGRAÇÃO COM O FLUXO OPERACIONAL**

As notificações deverão apoiar o fluxo:

**Orçamento → Pedido → Conferência → Liberação → Engenharia → Estoque →
Produção → Qualidade → Expedição → Instalação → Conclusão.**

As notificações poderão informar ao usuário que uma ação é necessária,
mas não deverão substituir:

status;

pendências;

filas;

tarefas;

registros;

aprovações;

controles operacionais.

O próprio SaaS continuará sendo a fonte oficial do estado do processo.

**16. OFFLINE**

Integrar o mecanismo de notificações com a estratégia definida no
ADR-005.

Eventos produzidos durante operação offline deverão continuar
preservados conforme as regras do mecanismo offline.

A ausência de push não poderá impedir o registro de um fato operacional.

Após sincronização, eventos relevantes poderão gerar as notificações
correspondentes.

Não depender de push para registrar ou preservar fatos ocorridos
offline.

**17. SEGURANÇA**

Garantir:

isolamento entre empresas;

RLS;

autorização no backend;

menor privilégio;

proteção de dados;

conformidade com LGPD;

proteção contra exposição indevida.

Nunca enviar informações de uma empresa para usuário pertencente a
outra.

O conteúdo das notificações deverá considerar o risco de exposição no
dispositivo ou canal utilizado.

**18. AUDITORIA**

Registrar eventos relevantes de comunicação:

criação;

alteração;

envio;

falha;

retry;

reprocessamento;

leitura;

reconhecimento;

cancelamento.

Alterações administrativas relevantes nas regras de notificação também
deverão ser auditáveis.

**19. PREFERÊNCIAS**

Implementar estrutura para preferências de:

canal;

tipo de evento;

prioridade;

frequência;

ativação/desativação.

Preferências não poderão desabilitar controles obrigatórios de
segurança, governança ou comunicações essenciais definidas pelo sistema.

**20. WHATSAPP E SMS**

Não tornar WhatsApp ou SMS requisitos do MVP.

A indisponibilidade desses serviços nunca poderá bloquear:

pedidos;

produção;

expedição;

instalação;

conclusão;

ou qualquer outro fluxo operacional principal.

**21. MVP**

Priorizar:

notificações internas;

eventos operacionais essenciais;

prioridades;

destinatários;

histórico;

estados;

tratamento de falhas;

retry;

idempotência;

e-mail;

estrutura de push;

integração com PWA;

orientação para instalação na Tela de Início do iPhone.

A implementação efetiva do push deverá respeitar o ADR-008.

**22. REGRAS DE IMPLEMENTAÇÃO**

Não:

criar dependência de push;

criar dependência de WhatsApp;

criar dependência de SMS;

confiar apenas no frontend;

enviar notificações sem autorização;

perder eventos por falha de canal;

duplicar notificações por retry;

considerar tentativa de envio como entrega garantida;

alterar decisões dos ADRs relacionados;

ampliar o escopo do MVP sem decisão formal.

**23. INTEGRAÇÕES E DEPENDÊNCIAS**

Respeitar:

- **ADR-001 — Usuários / Permissões**

- **ADR-002 — MVP**

- **ADR-003 — Cliente-piloto**

- **ADR-005 — Offline**

- **ADR-008 — Plataforma do aplicativo de campo**

Não criar regras conflitantes com esses documentos.

**24. CRITÉRIOS DE ACEITE**

A implementação será considerada correta quando:

notificações internas funcionarem;

eventos possuírem identificação única;

destinatários forem autorizados pelo backend;

empresas permanecerem isoladas;

prioridades forem respeitadas;

histórico existir;

falhas forem registradas;

retries forem controlados;

duplicidades forem evitadas;

e-mail puder ser processado de forma rastreável;

push puder ser utilizado como canal complementar;

iPhone/PWA informar corretamente a necessidade de instalação na Tela de
Início;

indisponibilidade do push não bloquear processos críticos;

indisponibilidade de WhatsApp/SMS não bloquear o sistema;

operações offline permanecerem compatíveis com ADR-005;

auditoria registrar eventos relevantes;

nenhum evento crítico seja perdido silenciosamente por falha de
comunicação.

**25. GOVERNANÇA**

A implementação deverá preservar as decisões do ADR-007.

Qualquer alteração relevante deverá registrar:

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

Não realizar expansão silenciosa de escopo.

**26. PRINCÍPIO FINAL**

**O SaaS é a fonte oficial do estado operacional. As notificações servem
para chamar a atenção do usuário e facilitar a comunicação, mas não
substituem o processo, o status, a pendência, a tarefa ou o registro
operacional.**

Implementar conforme **ADR-007 v2.1 — Notificações e Alertas**, mantendo
compatibilidade com os ADRs relacionados e sem reabrir decisões já
aprovadas.
