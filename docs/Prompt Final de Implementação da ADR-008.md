**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-008 — Plataforma do Aplicativo de Campo**

**Status:** APROVADO\
**Versão:** 2.1\
**Data:** 09/09/2026

**1. Objetivo**

Implementar a plataforma de campo do SaaS como uma **PWA — Progressive
Web App**, integrada ao sistema principal e destinada principalmente às
operações de:

obra;

instalação;

montagem;

execução;

conferência;

pendências;

ocorrências;

evidências;

aceite;

conclusão.

A PWA deverá funcionar como parte integrante do SaaS, e não como sistema
independente.

Não implementar aplicativo nativo no MVP.

**2. Regra arquitetural principal**

A arquitetura deverá seguir:

**PWA → APIs/Backend → Regras de negócio → PostgreSQL/Supabase**

A PWA deverá compartilhar com o sistema principal:

autenticação;

autorização;

usuários;

permissões;

multiempresa;

regras de negócio;

APIs;

auditoria;

banco de dados;

armazenamento;

sincronização.

Não criar uma segunda arquitetura de negócio exclusivamente para o
aplicativo de campo.

**3. Fonte única da verdade**

O servidor deverá permanecer como fonte oficial dos dados.

Dados armazenados localmente na PWA são exclusivamente dados
operacionais temporários.

Não considerar dados locais como:

fonte oficial;

backup;

registro definitivo;

mecanismo permanente de recuperação.

O dispositivo poderá armazenar dados necessários para continuidade
operacional, mas a autoridade final permanecerá no servidor.

**4. Funcionalidades de campo**

Implementar na PWA as funcionalidades necessárias ao MVP, incluindo:

consulta de obras;

consulta de instalações;

agenda;

equipes;

responsáveis;

tarefas;

materiais;

execução;

apontamentos;

pendências;

ocorrências;

evidências;

fotos;

observações;

conferências;

aceite;

conclusão;

sincronização;

estado online/offline.

Não implementar funcionalidades fora do escopo definido no ADR-002
apenas por estarem tecnicamente disponíveis.

**5. Experiência mobile**

A interface deverá ser projetada prioritariamente para dispositivos
móveis.

Considerar:

telas pequenas;

navegação por toque;

botões adequados para toque;

leitura rápida;

operação com uma mão quando possível;

ambientes externos;

conectividade limitada;

baixo consumo de dados;

desempenho;

clareza dos estados operacionais.

A experiência de campo deverá ser simples e orientada à execução.

**6. Estratégia offline**

Implementar o offline conforme definido no ADR-005.

O offline deverá ser:

seletivo;

controlado;

orientado ao processo;

limitado às funções autorizadas;

dependente dos dados previamente sincronizados;

sujeito à validade;

sujeito à revalidação no servidor.

Não permitir que todas as funcionalidades do sistema funcionem
automaticamente offline.

Cada funcionalidade deverá possuir uma classificação explícita:

- **Offline permitido;**

- **Offline controlado;**

- **Online obrigatório.**

**7. Dados locais**

Armazenar localmente somente os dados necessários para as operações de
campo autorizadas.

Priorizar:

obras;

instalações;

tarefas;

agenda;

informações necessárias à execução;

materiais necessários;

pendências;

ocorrências;

dados necessários ao registro de evidências;

registros ainda não sincronizados.

Evitar armazenar grandes volumes de dados sem necessidade operacional.

**8. Validade dos dados**

Aplicar as seguintes regras:

**Até 3 dias sem sincronização confirmada**

Permitir criação de novos registros offline, desde que a funcionalidade
seja classificada como offline permitida/controlada e todas as demais
regras sejam atendidas.

**Após 3 dias sem sincronização confirmada**

Bloquear a **criação de novos registros offline**.

Continuar permitindo:

consulta local;

visualização dos dados existentes;

tentativa de sincronização;

tratamento da fila pendente.

**Após 7 dias**

Considerar os dados locais expirados para operações que dependam de
validade operacional.

Os dados poderão permanecer disponíveis para consulta quando
tecnicamente possível, mas não deverão ser utilizados para autorizar
novas operações dependentes de dados válidos.

O tempo deverá ser baseado na confirmação de sincronização pelo
servidor.

**9. Comunicação do estado offline**

A PWA deverá informar claramente:

online;

offline;

última sincronização confirmada;

tempo desde a última sincronização;

registros pendentes;

registros com erro;

necessidade de sincronização;

bloqueio de novas operações offline;

expiração dos dados.

Não ocultar essas informações do usuário.

**10. Sincronização**

Implementar uma fila de sincronização.

Fluxo mínimo:

**Registro local → Identificação única → Fila → Envio →
Autorização/Revalidação → Processamento → Confirmação → Atualização
local**

A fila deverá suportar:

tentativas;

retry;

idempotência;

processamento parcial;

erro;

reprocessamento;

confirmação;

rastreabilidade.

**11. Identificadores**

Todo registro criado offline deverá receber identificador único antes de
ser enviado ao servidor.

O identificador deverá permanecer associado ao registro durante todo o
ciclo de sincronização.

O backend deverá reconhecer operações já processadas para evitar
duplicação.

**12. Idempotência**

Toda operação de sincronização deverá ser idempotente quando aplicável.

Se a mesma operação for enviada novamente devido a:

perda de conexão;

timeout;

retry;

fechamento da aplicação;

erro de comunicação;

o servidor não deverá criar registros duplicados.

**13. Revalidação no servidor**

Nenhuma operação offline deverá ser considerada definitivamente aceita
apenas porque foi criada localmente.

No recebimento pelo servidor, revalidar:

empresa;

usuário;

permissões;

registro;

estado atual;

regras de negócio;

validade;

conflitos;

dependências;

autorização da operação.

A autorização final pertence ao backend.

**14. Permissões**

Não confiar exclusivamente nas permissões armazenadas no dispositivo.

Se uma permissão for alterada ou revogada no servidor, a nova regra
deverá prevalecer.

O dispositivo não poderá manter indefinidamente autorização que deixou
de existir no backend.

**15. Conflitos**

Não permitir sobrescrita silenciosa.

Quando houver conflito entre dados locais e dados do servidor:

identificar o conflito;

preservar o histórico;

aplicar a regra definida pelo backend;

informar o resultado quando necessário;

manter rastreabilidade da tentativa original.

O servidor possui precedência.

**16. Hora do registro**

Diferenciar:

- **hora do fato:** momento informado/registrado pelo dispositivo;

- **hora de processamento:** momento confirmado pelo servidor.

A hora do servidor será a referência oficial para processamento e
ordenação sistêmica quando necessário.

A hora do fato deverá ser preservada quando relevante à operação.

**17. Operações parciais**

A PWA deverá suportar execução parcial.

Manter separadamente:

planejado;

realizado;

pendente.

Isso deverá funcionar para situações como:

instalação parcial;

execução parcial;

material parcialmente utilizado;

tarefas parcialmente concluídas;

pendências.

Não converter automaticamente uma operação parcial em concluída.

**18. Evidências**

Permitir registro de:

fotografias;

documentos;

observações;

ocorrências;

evidências de execução;

aceite.

Cada evidência deverá possuir vínculo com o contexto operacional
correspondente.

Evidências criadas offline deverão entrar na fila de sincronização e
possuir controle de estado.

**19. Segurança local**

Aplicar mecanismos adequados para proteção dos dados armazenados
localmente.

Considerar:

dados sensíveis;

sessão;

credenciais;

tokens;

informações operacionais;

arquivos;

evidências;

encerramento de sessão;

dispositivo compartilhado.

Não armazenar segredos desnecessariamente.

**20. Multiempresa**

A PWA deverá respeitar integralmente o isolamento entre empresas.

Nenhum dado local poderá ser utilizado para permitir acesso indevido
entre tenants.

O backend deverá continuar aplicando as regras de isolamento e
autorização.

O armazenamento local deverá ser associado ao contexto correto de:

empresa;

usuário;

sessão;

ambiente.

**21. Armazenamento local no iOS**

Considerar explicitamente que o armazenamento local de uma PWA no iPhone
pode ser descartado pelo sistema após períodos prolongados sem
utilização.

Portanto:

não depender de armazenamento local permanente;

não considerar a PWA como backup;

não manter operações pendentes indefinidamente;

priorizar sincronização;

alertar sobre pendências;

orientar o usuário a sincronizar;

manter a janela offline curta.

**22. Alertas preventivos**

Implementar alertas para situações como:

registros pendentes;

sincronização necessária;

aproximação do limite de 3 dias;

bloqueio de criação offline;

aproximação do limite de validade;

dados expirados;

falhas de sincronização;

evidências pendentes;

necessidade de conexão.

O objetivo é evitar que o usuário descubra o problema somente quando
precisar concluir uma operação.

**23. Instalação da PWA**

Implementar orientação para instalação da PWA.

No iPhone, orientar o usuário sobre a instalação na **Tela de Início**.

O onboarding deverá explicar, de forma simples:

como instalar;

por que a instalação é recomendada;

quais recursos dependem dela;

como verificar a sincronização;

como trabalhar offline;

por que é importante sincronizar regularmente.

**24. Push notifications**

O push seguirá o ADR-007.

No iPhone:

considerar a necessidade de instalação na Tela de Início;

orientar o usuário durante o onboarding;

informar quando o recurso não estiver disponível;

não tratar push como requisito para funcionamento do sistema.

Push será um canal complementar.

**25. Não depender de push**

Nenhum processo crítico poderá depender exclusivamente de push.

O usuário deverá conseguir identificar dentro da própria PWA:

tarefas;

pendências;

ocorrências;

bloqueios;

alterações;

avisos críticos;

necessidade de sincronização.

A ausência ou falha do push não poderá impedir a operação.

**26. Operações online obrigatórias**

Operações que exigirem confirmação imediata do servidor deverão
permanecer online.

Exemplos podem incluir, conforme classificação funcional:

operações críticas de estoque;

alterações de autoridade;

alterações administrativas;

operações sensíveis;

ações que dependam de validação imediata;

operações cuja consistência não possa ser garantida offline.

A classificação definitiva de cada operação deverá respeitar o ADR-005 e
as regras de negócio correspondentes.

**27. Recuperação de falhas**

A PWA deverá sobreviver a situações como:

perda de conexão;

fechamento da aplicação;

reinicialização do dispositivo;

timeout;

erro de API;

falha parcial;

tentativa repetida;

sincronização interrompida.

O sistema deverá preservar a fila e permitir retomada quando
tecnicamente possível.

**28. Estados de sincronização**

Os registros deverão possuir estados suficientemente claros para
representar situações como:

local;

pendente;

enviando;

sincronizado;

erro;

conflito;

rejeitado;

reprocessamento;

expirado.

A nomenclatura final poderá ser definida na implementação, desde que
preserve semanticamente essas situações.

**29. Monitoramento**

Disponibilizar mecanismos para acompanhar:

quantidade de registros pendentes;

erros de sincronização;

retries;

conflitos;

registros rejeitados;

tempo desde última sincronização;

falhas recorrentes;

volume de dados offline;

situações de expiração.

Eventos críticos deverão possuir rastreabilidade e auditoria.

**30. Integração com o fluxo operacional**

A PWA deverá ser integrada ao fluxo principal:

**Pedido → Engenharia → Estoque → Produção → Expedição → Obra/Instalação
→ Aceite/Conclusão**

A experiência de campo deverá utilizar as informações produzidas pelas
etapas anteriores.

Não duplicar cadastros ou informações já existentes no SaaS sem
necessidade.

**31. Não criar aplicativo nativo no MVP**

Não desenvolver:

aplicativo iOS nativo;

aplicativo Android nativo;

duas plataformas paralelas;

backend específico para aplicativo nativo.

A PWA é a plataforma oficial de campo do MVP.

Aplicativo nativo somente poderá ser considerado em decisão futura
baseada em evidência de necessidade essencial.

**32. Critérios para futura adoção de aplicativo nativo**

Uma futura decisão de aplicativo nativo deverá demonstrar uma
necessidade que não possa ser adequadamente resolvida pela PWA, como:

limitação técnica comprovada;

necessidade de hardware;

desempenho insuficiente;

limitação comprovada do offline;

requisito operacional crítico;

recurso nativo indispensável.

Preferência subjetiva por aplicativo nativo não constitui justificativa
suficiente.

**33. Critérios de aceite**

A implementação será considerada aderente quando:

a PWA funcionar como plataforma oficial de campo;

as principais atividades de campo puderem ser executadas;

o offline funcionar de forma seletiva;

a validade de 7 dias for aplicada;

após 3 dias sem sincronização confirmada, novas criações offline forem
bloqueadas;

consultas locais continuarem disponíveis após o bloqueio;

a sincronização puder ser tentada mesmo após o bloqueio;

dados locais não forem tratados como fonte oficial;

o servidor fizer a revalidação;

conflitos não forem sobrescritos silenciosamente;

operações forem idempotentes;

registros parciais forem preservados;

evidências forem sincronizáveis;

o isolamento multiempresa for preservado;

a limitação de armazenamento da PWA no iOS for considerada;

existirem alertas preventivos;

o onboarding orientar a instalação no iPhone;

push não for requisito para operações críticas;

não existir aplicativo nativo no MVP;

a PWA estiver integrada ao restante do SaaS.

**34. Restrições de implementação**

Não:

criar banco local como segunda fonte da verdade;

confiar somente em autorização local;

permitir sincronização sem revalidação;

sobrescrever conflitos silenciosamente;

perder registros pendentes silenciosamente;

depender de push;

assumir que armazenamento local é permanente;

criar aplicativo nativo no MVP;

ampliar o escopo funcional sem decisão formal;

alterar decisões dos ADRs relacionados por interpretação.

**35. Dependências**

A implementação deverá respeitar:

**ADR-001 — Usuários / Permissões**

**ADR-002 — MVP**

**ADR-005 — Offline**

**ADR-007 — Notificações**

demais ADRs aplicáveis ao fluxo operacional.

Em caso de conflito, não alterar silenciosamente uma ADR.

Registrar a necessidade de revisão conforme a governança definida.

**36. Governança**

Este prompt é uma instrução de implementação da decisão registrada na
ADR-008.

Não utilizar este prompt para redefinir a arquitetura.

Qualquer necessidade que implique:

mudança de plataforma;

inclusão de aplicativo nativo;

alteração da estratégia offline;

alteração da fonte de verdade;

mudança de dependência de notificações;

expansão relevante do MVP;

deverá gerar uma nova decisão formal ou revisão da ADR correspondente.

Não realizar expansão silenciosa de escopo.

**37. Princípio final de implementação**

**Implementar o campo como uma PWA integrada ao SaaS, com experiência
móvel, offline seletivo e controlado, sincronização robusta e servidor
como única fonte da verdade. A PWA deverá permitir a continuidade
operacional sem transformar o armazenamento local em fonte oficial ou
backup. Push será complementar, especialmente no iPhone, e nenhuma
operação crítica dependerá exclusivamente dele. Aplicativo nativo não
faz parte do MVP e somente poderá ser considerado futuramente mediante
necessidade essencial comprovada.**

**FIM DO PROMPT — ADR-008 v2.1**
