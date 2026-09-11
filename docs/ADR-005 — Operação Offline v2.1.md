**ADR-005 — Operação Offline**

**Status:** APROVADO\
**Versão:** 2.1\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 09/09/2026\
**Decisão:** Definição da estratégia de operação offline do SaaS\
**Decisões vinculadas:** ADR-001, ADR-002, ADR-003, ADR-007 e ADR-008

**1. Contexto**

O SaaS deverá permitir que determinadas atividades operacionais sejam
executadas mesmo quando o dispositivo estiver temporariamente sem
conexão com a internet.

A necessidade é especialmente relevante para as atividades realizadas em
**Obra/Instalação/Montagem**, onde a conectividade pode ser inexistente
ou instável.

O modo offline não deverá transformar o dispositivo em uma fonte
independente de verdade.

O princípio fundamental será:

**O offline existe para garantir continuidade operacional controlada, e
não para criar uma segunda base de dados independente do servidor.**

A arquitetura deverá, portanto, permitir operação local limitada,
armazenamento temporário, fila de sincronização e posterior
reconciliação com o servidor.

**2. Problema**

Uma operação exclusivamente online pode impedir ou prejudicar atividades
de campo quando:

não houver internet;

houver sinal instável;

houver indisponibilidade temporária da rede;

o dispositivo estiver em região sem cobertura;

houver interrupção momentânea do serviço.

Por outro lado, permitir operação offline irrestrita cria riscos de:

dados desatualizados;

conflitos;

duplicidades;

inconsistências;

utilização de permissões que já foram alteradas;

utilização de informações operacionais vencidas;

perda de registros;

alterações incompatíveis com o estado atual do servidor.

É necessário encontrar um equilíbrio entre **continuidade operacional**
e **integridade centralizada dos dados**.

**3. Decisão**

Será adotada uma estratégia de **offline seletivo, controlado e
orientado ao processo**.

Nem todas as funcionalidades do SaaS poderão funcionar offline.

Cada funcionalidade deverá ser classificada como:

**Offline Permitido**

Pode funcionar sem conexão, respeitando as regras e limitações
definidas.

**Offline Controlado**

Pode executar determinadas operações localmente, mas depende de
validação/sincronização posterior e possui restrições.

**Online Obrigatório**

Não poderá ser executada sem conexão com o servidor.

A classificação deverá ser definida por funcionalidade e processo.

**4. Servidor como fonte única da verdade**

O servidor será a **fonte única de verdade** dos dados oficiais do
sistema.

O armazenamento local do dispositivo:

não substitui o banco central;

não constitui uma base independente;

não representa a verdade definitiva da operação;

não poderá ser utilizado para burlar regras do servidor;

deverá ser tratado como armazenamento operacional temporário.

Após a sincronização, o estado oficial será determinado pelo servidor.

**5. Prioridade do Offline**

O principal objetivo do offline será suportar atividades de campo.

A prioridade inicial será:

**Obra → Instalação → Montagem → Registro de execução → Pendências →
Ocorrências → Evidências**

O offline poderá ser utilizado em outras áreas somente quando houver
justificativa operacional e quando a funcionalidade possuir regras
adequadas para isso.

Não deverá existir uma política genérica de <span dir="rtl">“</span>todo
o sistema funciona offline”.

**6. Contexto offline**

O acesso offline deverá ser considerado dentro de um contexto composto,
no mínimo, por:

empresa/tenant;

usuário;

permissões;

processo;

funcionalidade;

dados previamente sincronizados;

validade desses dados;

estado da sincronização;

regras aplicáveis.

O fato de um usuário possuir determinada permissão não significa
automaticamente que poderá executar a operação offline.

A operação deverá respeitar também as limitações específicas do modo
offline.

**7. Dados disponibilizados offline**

Somente dados necessários para a operação offline deverão ser
armazenados localmente.

O dispositivo poderá manter, conforme a necessidade da funcionalidade:

informações da obra;

dados do pedido;

itens;

informações técnicas necessárias;

equipe;

agenda;

materiais necessários;

pendências;

ocorrências;

informações necessárias para registro da execução;

dados necessários para identificação e sincronização.

Não deverão ser copiados indiscriminadamente todos os dados do tenant
para o dispositivo.

O conjunto de dados offline deverá ser mínimo e orientado à finalidade.

**8. Validade dos dados sincronizados**

Os dados disponibilizados para operação offline terão **validade
operacional de 7 dias**.

A validade deverá ser controlada pelo sistema utilizando referência
temporal do servidor.

Dados cuja última sincronização confirmada ultrapasse **7 dias** deverão
ser considerados **expirados para operações que dependam desses dados**.

Dados expirados poderão permanecer disponíveis para consulta local
quando tecnicamente apropriado, mas não deverão ser tratados como dados
operacionais válidos para novas ações que dependam de sua atualidade.

A validade deverá ser registrada e controlada de forma verificável.

**9. Regra de ausência de sincronização**

Além da validade de 7 dias, haverá uma janela operacional mais
restritiva.

Após **3 dias sem uma sincronização confirmada pelo servidor**, o
sistema deverá:

bloquear a criação de novos registros offline;

permitir consulta dos dados locais ainda disponíveis;

permitir tentativa de sincronização;

informar claramente ao usuário a situação;

orientar a recuperação da conexão.

A regra será:

**0–3 dias sem sincronização confirmada:** operação offline permitida
dentro das demais regras.

**Após 3 dias:** criação de novos registros offline bloqueada.

**Até 7 dias:** dados locais ainda podem ser consultados e a
sincronização pode ser tentada.

**Após 7 dias:** dados considerados expirados para operações dependentes
de sua validade.

Essa regra não deverá ser confundida com o prazo de validade dos dados.

**10. Referência temporal**

A referência oficial para sincronização e validade será o **tempo
confirmado pelo servidor**.

O relógio do dispositivo não deverá ser considerado fonte confiável para
determinar validade operacional.

Quando houver registro de uma ocorrência ou atividade executada offline,
o sistema deverá preservar, quando aplicável:

horário informado pelo dispositivo;

data/hora local do evento;

momento de criação local;

momento de sincronização;

momento de confirmação pelo servidor.

O conceito de **<span dir="rtl">“</span>hora do fato”** deverá ser
preservado quando necessário para representar quando a atividade
realmente ocorreu.

A hora do fato não substitui o horário de sincronização ou de
confirmação do servidor.

**11. Identificação dos registros offline**

Todo registro criado offline deverá possuir identificador único gerado
de forma segura no dispositivo.

O identificador deverá permitir:

identificação inequívoca;

sincronização;

prevenção de duplicidade;

rastreamento;

reprocessamento;

auditoria.

A sincronização não deverá gerar um novo registro simplesmente porque o
registro foi criado offline.

**12. Fila de sincronização**

As operações realizadas offline deverão ser armazenadas em uma fila
local de sincronização.

A fila deverá controlar, quando aplicável:

registro;

operação;

identificador;

dependências;

estado;

tentativas;

erro;

data/hora local;

data/hora de sincronização;

resultado do servidor.

A fila deverá permitir sincronização parcial.

Uma falha em um registro não deverá necessariamente impedir a
sincronização de registros independentes.

**13. Sincronização**

Quando a conexão estiver disponível, o sistema deverá tentar sincronizar
os registros pendentes.

A sincronização deverá:

identificar o usuário e tenant;

validar autorização;

validar contexto;

validar estado atual;

validar regras de negócio;

verificar conflitos;

processar registros válidos;

registrar erros;

atualizar o estado local;

preservar o histórico.

A sincronização não deverá assumir que uma operação válida no momento em
que foi criada continuará válida no momento da sincronização.

**14. Revalidação no servidor**

Toda operação offline que produzir efeito oficial deverá ser
**revalidada pelo servidor**.

O servidor deverá verificar, conforme aplicável:

usuário;

empresa;

permissões;

estado do processo;

estado do registro;

regras de negócio;

integridade;

conflitos;

dependências;

demais condições necessárias.

A operação local não poderá utilizar o offline como mecanismo para
contornar:

permissões;

bloqueios;

regras de negócio;

alterações posteriores;

controles de segurança.

**15. Conflitos**

Conflitos deverão ser tratados explicitamente.

Não será permitido sobrescrever silenciosamente dados alterados por
outro usuário ou processo.

Quando houver conflito, o sistema deverá:

identificar o conflito;

preservar os dados envolvidos;

registrar o ocorrido;

aplicar a regra de resolução correspondente;

solicitar intervenção quando necessária;

manter rastreabilidade.

A resolução deverá considerar o estado oficial do servidor.

**16. Precedência do servidor**

Em caso de divergência entre o estado local e o estado oficial do
servidor, o servidor terá precedência para determinar o estado oficial.

Isso não significa apagar automaticamente o conteúdo produzido offline.

O registro offline deverá permanecer rastreável, inclusive quando:

rejeitado;

parcialmente aceito;

ajustado;

conflitante;

impossibilitado de aplicação.

**17. Operações parciais**

O offline deverá suportar operações parciais quando o processo permitir.

Deverão ser preservadas, quando aplicáveis:

planejado;

realizado;

pendente.

Uma atividade realizada parcialmente não deverá ser interpretada como
concluída integralmente.

Essa regra deverá ser compatível com os demais módulos do sistema.

**18. Estoque em modo offline**

O estoque deverá possuir restrições específicas no modo offline.

O dispositivo poderá consultar informações previamente sincronizadas,
mas essas informações não deverão ser tratadas como garantia de
disponibilidade atual do estoque.

Operações que possam comprometer a integridade do estoque deverão ser
cuidadosamente controladas.

Quando necessário, a efetivação oficial deverá depender da validação do
servidor.

O sistema não deverá permitir que informações antigas de estoque sejam
utilizadas para criar uma falsa certeza de disponibilidade.

**19. Segurança**

Os dados armazenados localmente deverão possuir proteção compatível com
a sensibilidade das informações.

Deverão ser considerados:

armazenamento seguro;

autenticação;

controle de sessão;

proteção contra acesso indevido;

expiração;

limpeza de dados quando aplicável;

proteção dos dados do tenant;

proteção das filas;

proteção das credenciais.

Dados offline não poderão permitir acesso a informações de outra
empresa.

**20. Isolamento entre tenants**

O armazenamento offline deverá respeitar integralmente o isolamento
entre empresas.

O dispositivo não poderá utilizar dados de uma empresa em contexto de
outra.

A mudança de contexto de empresa deverá ser tratada explicitamente.

Dados locais deverão estar associados ao tenant correto.

A arquitetura deverá impedir que:

registros sejam sincronizados no tenant errado;

dados sejam apresentados em contexto incorreto;

identificadores sejam utilizados para acessar dados de outra empresa.

**21. Permissões**

As permissões aplicadas offline deverão ser baseadas nas permissões
válidas no momento da sincronização inicial, respeitando as limitações
do modo offline.

A autorização definitiva de operações que produzam efeitos oficiais
deverá ser realizada pelo servidor.

Se uma permissão tiver sido revogada ou alterada enquanto o dispositivo
estava offline, o servidor deverá prevalecer durante a sincronização.

O offline não poderá manter indefinidamente uma autorização que deixou
de existir.

**22. Registros e evidências**

Atividades de campo realizadas offline deverão poder registrar, quando
aplicável:

execução;

pendência;

ocorrência;

observação;

evidência;

fotografia;

conclusão parcial;

conclusão;

aceite.

Os registros deverão permanecer vinculados ao processo correto.

Evidências criadas offline deverão entrar na fila de sincronização e
possuir rastreabilidade.

**23. Recuperação de falhas**

A solução deverá ser preparada para situações como:

perda temporária de conexão;

encerramento inesperado do aplicativo;

fechamento do navegador;

reinício do dispositivo;

falha durante sincronização;

duplicidade de tentativa;

erro do servidor;

erro de validação;

conflito;

expiração dos dados;

falha no envio de evidência.

A recuperação deverá evitar perda silenciosa dos registros.

**24. Idempotência**

As operações de sincronização deverão ser idempotentes.

Repetir uma mesma tentativa não poderá criar duplicidades.

Isso deverá ser aplicado especialmente em:

criação de registros;

envio de evidências;

atualização de estados;

sincronização parcial;

retry;

recuperação após falha de conexão.

**25. Sincronização parcial e retry**

A sincronização deverá permitir:

retry automático quando apropriado;

retry manual;

sincronização individual;

sincronização em lote;

sincronização parcial;

identificação dos registros com erro.

Falhas transitórias não deverão exigir que o usuário recrie manualmente
registros já produzidos.

**26. Monitoramento**

O sistema deverá permitir identificar:

dispositivos com sincronização atrasada;

registros pendentes;

registros com erro;

conflitos;

tentativas de sincronização;

última sincronização confirmada;

idade dos dados locais;

situação da fila.

O objetivo é permitir acompanhamento da saúde da operação offline.

**27. Experiência do usuário**

O usuário deverá ser informado de forma clara sobre a situação da
conexão e dos dados locais.

A interface deverá comunicar, quando aplicável:

online/offline;

última sincronização;

idade dos dados;

quantidade de registros pendentes;

erros;

conflitos;

necessidade de sincronização;

bloqueio para novos registros;

expiração dos dados.

O usuário não deverá precisar descobrir sozinho que está operando com
dados antigos.

**28. Alertas preventivos**

O sistema deverá emitir alertas preventivos antes dos bloqueios.

Especialmente:

aproximação do limite de 3 dias;

ausência prolongada de sincronização;

aproximação da validade de 7 dias;

existência de registros pendentes;

falhas de sincronização;

risco de perda da fila local.

Os alertas deverão priorizar a sincronização antes que o usuário fique
impedido de criar novos registros.

**29. Limitação específica de PWA/iOS**

A estratégia de plataforma definida no ADR-008 considera **PWA como
plataforma do aplicativo de campo no MVP**.

Deverá ser considerada a limitação de dispositivos iOS em que dados
armazenados localmente por uma PWA podem ser descartados pelo sistema
após períodos prolongados sem utilização.

Essa possibilidade cria risco de perda da fila local caso o usuário
permaneça muito tempo sem abrir/utilizar o aplicativo.

Por isso:

o armazenamento local não poderá ser considerado backup;

o servidor continuará sendo a fonte única da verdade;

registros pendentes deverão ser sincronizados prioritariamente;

o usuário deverá receber alertas preventivos;

a janela de operação offline deverá ser curta e controlada;

o sistema deverá reduzir a dependência de permanência prolongada de
dados locais.

A estratégia deverá considerar esse risco desde a implementação do MVP.

**30. Aplicativo/PWA e sincronização**

A implementação deverá priorizar uma experiência em que o usuário:

recebe os dados necessários;

realiza as atividades;

registra as informações;

retorna à conectividade;

sincroniza;

recebe confirmação do servidor.

O fluxo não deverá pressupor que o dispositivo manterá indefinidamente
todos os dados locais.

**31. Offline e documentos críticos**

Operações que exigirem validação imediata do servidor deverão permanecer
**Online Obrigatório**.

Não permitir offline para operações em que a falta de confirmação
imediata possa comprometer:

segurança;

integridade;

controle financeiro;

controle fiscal;

autorização crítica;

disponibilidade real de estoque;

alterações estruturais;

outras operações definidas como críticas.

**32. Offline no MVP**

O MVP deverá priorizar o offline para:

Obra;

Instalação;

Montagem;

execução;

ocorrências;

pendências;

evidências;

registros operacionais necessários ao campo.

O offline não deverá ser implementado indiscriminadamente em todos os
módulos.

A implementação deverá ser compatível com o escopo do MVP definido no
ADR-002.

**33. O que não será permitido**

Não será permitido:

tratar o dispositivo como fonte de verdade;

permitir operação offline irrestrita;

ignorar expiração dos dados;

permitir criação de novos registros após o bloqueio de 3 dias sem
sincronização confirmada;

considerar dados com mais de 7 dias como operacionalmente válidos quando
sua validade for necessária;

ignorar conflitos;

sobrescrever silenciosamente dados do servidor;

ignorar alterações de permissão;

utilizar estoque offline como garantia de disponibilidade;

perder registros silenciosamente;

criar duplicidades durante retry;

utilizar o offline para burlar regras;

considerar armazenamento local como backup.

**34. Consequências aceitas**

A decisão aceita:

complexidade adicional de sincronização;

necessidade de fila local;

necessidade de tratamento de conflitos;

necessidade de revalidação no servidor;

limitações de funcionalidades offline;

necessidade de controle de validade;

bloqueios preventivos;

possibilidade de intervenção do usuário em conflitos;

restrições específicas do PWA;

necessidade de monitoramento.

Essas complexidades são aceitas para preservar a continuidade
operacional sem comprometer a integridade central do SaaS.

**35. Consequências não aceitas**

Não são aceitos:

perda de dados;

perda silenciosa da fila;

duplicidade;

inconsistência entre servidor e cliente;

acesso entre tenants;

execução sem autorização;

utilização indefinida de dados vencidos;

sobrescrita silenciosa;

falsa indicação de sincronização;

falsa indicação de conclusão;

operação baseada em estoque desatualizado como se fosse atual.

**36. Alternativas consideradas**

**Alternativa A — Sistema totalmente online**

**Rejeitada.**

Não atende adequadamente às condições de campo e à necessidade de
continuidade operacional.

**Alternativa B — Sistema totalmente offline**

**Rejeitada.**

Criaria risco elevado de inconsistência, conflitos, segurança e dados
desatualizados.

**Alternativa C — Offline seletivo e controlado**

**APROVADA.**

Permite continuidade operacional onde realmente necessária, mantendo o
servidor como fonte oficial.

**Alternativa D — Aplicativo com banco local como fonte independente**

**Rejeitada.**

Criaria uma segunda fonte de verdade e aumentaria significativamente os
riscos de inconsistência.

**37. Dependências**

Este ADR possui relação direta com:

**ADR-001 — Usuários / Permissões**

Define identidade, permissões e autorização.

**ADR-002 — MVP e Escopo do Produto**

Define que o offline deve ser implementado conforme necessidade do MVP e
prioriza a operação real.

**ADR-003 — Cliente-piloto**

Define a validação do offline durante o piloto.

**ADR-007 — Notificações**

Define mecanismos de alerta e comunicação.

**ADR-008 — Plataforma do aplicativo de campo**

Define a utilização de PWA no MVP e as limitações associadas.

**38. Governança**

Este ADR representa a decisão oficial sobre operação offline.

Nenhum módulo deverá criar sua própria estratégia de offline de forma
independente.

Novas necessidades deverão respeitar:

classificação Offline Permitido / Offline Controlado / Online
Obrigatório;

servidor como fonte da verdade;

revalidação;

idempotência;

rastreabilidade;

segurança;

validade;

isolamento por tenant.

Qualquer alteração relevante deverá registrar:

decisão anterior;

nova decisão;

motivo;

impacto;

consequências;

responsável;

data;

versão.

As decisões anteriores não deverão ser apagadas silenciosamente.

**39. Critérios de aceite**

A implementação será considerada aderente quando:

o offline estiver limitado às funcionalidades autorizadas;

o servidor permanecer como fonte única da verdade;

Obra/Instalação/Montagem forem suportadas conforme necessidade;

existir armazenamento local controlado;

existir fila de sincronização;

registros offline possuírem identificadores únicos;

existir idempotência;

existir retry;

existir sincronização parcial;

o servidor revalidar as operações;

conflitos não forem sobrescritos silenciosamente;

permissões forem revalidadas;

existir isolamento entre tenants;

a última sincronização confirmada pelo servidor for registrada;

após 3 dias sem sincronização confirmada, novos registros offline sejam
bloqueados;

consulta local continue disponível após esse bloqueio quando os dados
ainda estiverem disponíveis;

tentativa de sincronização continue disponível;

dados com mais de 7 dias sejam considerados expirados para operações
dependentes de sua validade;

o sistema utilize referência temporal do servidor;

a hora do fato possa ser preservada quando necessária;

registros e evidências sejam rastreáveis;

existam alertas preventivos;

o risco de descarte de armazenamento da PWA no iOS seja considerado;

o armazenamento local não seja tratado como backup;

operações críticas permaneçam online quando necessário;

não exista perda ou duplicidade silenciosa.

**40. Princípio final**

A estratégia definida é:

**Offline seletivo, controlado e orientado ao processo, com o servidor
como fonte única da verdade.**

O offline deverá permitir que o trabalho continue quando a conectividade
falhar, mas sem transformar o dispositivo em uma base independente ou
permitir que dados antigos, permissões antigas ou estados antigos sejam
tratados indefinidamente como válidos.

A regra operacional central será:

**Até 3 dias sem sincronização confirmada: operação offline permitida
dentro das demais regras. Após 3 dias: novos registros offline
bloqueados, mantendo consulta local e tentativa de sincronização. Após 7
dias: dados considerados expirados para operações que dependam de sua
validade.**

**Status final: APROVADO**\
**Versão consolidada: 2.1**
