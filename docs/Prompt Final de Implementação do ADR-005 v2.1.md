**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-005 v2.1 — Operação Offline**

**Status:** APROVADO\
**Versão:** 2.1\
**Data:** 09/09/2026\
**Documento de origem:** ADR-005 — Operação Offline\
**Tipo:** Prompt Final de Implementação

**1. Objetivo**

Implementar a estratégia de operação offline definida no **ADR-005
v2.1**.

O objetivo é permitir continuidade operacional controlada,
principalmente nas atividades de **Obra, Instalação e Montagem**, mesmo
quando houver ausência ou instabilidade de conexão.

A implementação deverá preservar:

integridade dos dados;

segurança;

isolamento entre empresas;

autorização;

rastreabilidade;

consistência;

sincronização confiável.

O offline não deverá criar uma segunda fonte de verdade.

**2. Regra arquitetural fundamental**

Implementar o seguinte princípio:

**O servidor é a única fonte oficial da verdade.**

O armazenamento local deverá ser considerado:

temporário;

operacional;

limitado;

orientado à finalidade;

sujeito à sincronização;

sujeito à revalidação pelo servidor.

Nunca tratar o banco local como banco oficial independente.

**3. Classificação das funcionalidades**

Cada funcionalidade deverá possuir uma classificação explícita:

**Offline Permitido**

Pode ser executada sem conexão dentro das regras definidas.

**Offline Controlado**

Pode ser executada localmente, mas depende de validação/sincronização
posterior e possui restrições.

**Online Obrigatório**

Exige comunicação com o servidor.

Não implementar uma regra genérica em que todo o sistema funcione
offline.

**4. Prioridade do MVP**

O offline deverá ser priorizado para:

Obra;

Instalação;

Montagem;

execução;

ocorrências;

pendências;

evidências;

registros necessários ao trabalho de campo.

A implementação deverá respeitar o escopo do MVP definido no ADR-002.

**5. Dados disponíveis offline**

Disponibilizar localmente somente os dados necessários para as
funcionalidades autorizadas.

Conforme o processo, poderão ser armazenados:

dados da obra;

pedido;

itens;

informações técnicas necessárias;

equipe;

agenda;

materiais necessários;

pendências;

ocorrências;

dados necessários para execução;

dados necessários para identificação;

dados necessários para sincronização.

Não replicar indiscriminadamente todos os dados do tenant para o
dispositivo.

**6. Validade dos dados**

Implementar controle de validade baseado no horário confirmado pelo
servidor.

**Regra de validade**

Os dados sincronizados possuirão **validade operacional de 7 dias**.

Após 7 dias desde a última sincronização confirmada pelo servidor:

os dados serão considerados expirados para operações que dependam de sua
validade;

não poderão ser tratados como dados operacionais atuais;

poderão permanecer disponíveis para consulta local quando tecnicamente
apropriado.

**7. Bloqueio após 3 dias**

Implementar a seguinte regra obrigatória:

**0 a 3 dias sem sincronização confirmada**

O usuário poderá continuar utilizando as funcionalidades offline
autorizadas, respeitando as demais regras.

**Após 3 dias sem sincronização confirmada**

Bloquear:

criação de novos registros offline.

Permitir:

consulta dos dados locais;

visualização do estado local;

tentativa de sincronização;

recuperação da conexão;

tratamento de registros pendentes.

**Após 7 dias**

Considerar os dados expirados para operações que dependam de sua
atualidade.

Essa regra deverá ser aplicada pelo sistema e não depender
exclusivamente da interpretação do usuário.

**8. Referência temporal**

A validade deverá utilizar **tempo confirmado pelo servidor**.

Não confiar no relógio do dispositivo para determinar:

validade;

expiração;

limite de 3 dias;

limite de 7 dias.

Quando necessário, preservar separadamente:

hora do fato;

horário local do dispositivo;

criação local;

sincronização;

confirmação do servidor.

A **hora do fato** deverá ser preservada quando representar o momento
real da atividade.

Ela não substitui o horário de sincronização ou confirmação do servidor.

**9. Identificação dos registros offline**

Todo registro criado offline deverá receber identificador único antes da
sincronização.

O identificador deverá permitir:

identificação inequívoca;

sincronização;

idempotência;

prevenção de duplicidade;

auditoria;

rastreamento;

reprocessamento.

A sincronização não deverá criar registros duplicados.

**10. Fila local de sincronização**

Implementar fila persistente para operações pendentes.

Cada item da fila deverá possuir, quando aplicável:

identificador;

tipo de operação;

entidade;

dados;

dependências;

estado;

tentativas;

erros;

data/hora local;

data/hora da sincronização;

resultado do servidor.

A fila deverá sobreviver a interrupções normais do
aplicativo/dispositivo dentro das limitações do ambiente.

**11. Sincronização**

Quando houver conexão, iniciar sincronização das operações pendentes.

A sincronização deverá:

identificar usuário;

identificar tenant;

validar autenticação;

validar autorização;

validar estado atual;

validar regras de negócio;

detectar conflitos;

processar operações válidas;

registrar erros;

atualizar o estado local;

preservar histórico.

Uma operação válida quando criada offline poderá ser rejeitada
posteriormente caso o estado oficial tenha mudado.

**12. Revalidação pelo servidor**

Toda operação offline que produza efeito oficial deverá ser revalidada
no servidor.

Validar, conforme aplicável:

usuário;

tenant;

permissões;

registro;

estado;

regras de negócio;

dependências;

integridade;

conflitos;

validade dos dados.

O offline nunca poderá servir para contornar:

permissões;

bloqueios;

regras de negócio;

alterações realizadas posteriormente;

controles de segurança.

**13. Permissões**

As permissões utilizadas no modo offline deverão respeitar o contexto
previamente sincronizado.

Entretanto, a autorização definitiva deverá ocorrer no servidor.

Se uma permissão tiver sido:

revogada;

reduzida;

alterada;

enquanto o usuário estava offline, o servidor deverá prevalecer durante
a sincronização.

O offline não deverá preservar indefinidamente uma autorização que
deixou de existir.

**14. Conflitos**

Implementar tratamento explícito de conflitos.

Nunca sobrescrever silenciosamente dados alterados no servidor.

Quando houver conflito:

identificar;

registrar;

preservar os dados;

aplicar a regra de resolução;

solicitar intervenção quando necessária;

atualizar o estado local;

manter histórico.

O estado oficial será determinado pelo servidor.

**15. Precedência do servidor**

Quando houver divergência:

**Servidor \> Estado local**

O conteúdo criado offline não deverá simplesmente desaparecer.

Se uma operação for:

rejeitada;

parcialmente aceita;

conflitante;

ajustada;

impossibilitada;

o sistema deverá manter o registro da tentativa e seu resultado.

**16. Idempotência**

Implementar idempotência para impedir duplicidades durante:

retry;

reconexão;

sincronização repetida;

falha de comunicação;

processamento parcial;

reinício do aplicativo;

reenvio de evidências.

Repetir uma operação não poderá gerar múltiplos registros oficiais.

**17. Sincronização parcial**

Permitir sincronização parcial.

Uma falha em determinado registro não deverá necessariamente bloquear
registros independentes.

Permitir:

sincronização em lote;

sincronização individual;

retry automático quando apropriado;

retry manual;

identificação dos itens com erro.

O usuário não deverá precisar recriar manualmente uma operação já
registrada localmente apenas porque uma tentativa de sincronização
falhou.

**18. Operações parciais**

Preservar operações parciais quando o processo permitir.

Manter:

planejado;

realizado;

pendente.

Nunca interpretar automaticamente uma execução parcial como conclusão
integral.

**19. Estoque**

No modo offline:

permitir consulta dos dados previamente sincronizados quando autorizado;

não tratar o estoque local como disponibilidade atual garantida;

controlar operações que possam comprometer o estoque;

validar no servidor operações que afetem oficialmente os saldos.

Dados antigos de estoque não poderão criar falsa indicação de
disponibilidade.

**20. Evidências**

Permitir registro offline de evidências quando a funcionalidade estiver
classificada como permitida/controlada.

Podem incluir:

fotografias;

observações;

ocorrências;

pendências;

registros de execução;

aceite;

conclusão parcial.

As evidências deverão possuir:

identificação;

vínculo com o processo;

fila de sincronização;

estado;

histórico.

**21. Segurança local**

Proteger os dados armazenados no dispositivo.

Implementar, conforme capacidade da plataforma:

armazenamento seguro;

controle de sessão;

autenticação;

proteção dos dados locais;

proteção da fila;

expiração;

limpeza quando aplicável;

proteção de credenciais.

Dados locais não poderão permitir acesso a outro tenant.

**22. Multi-tenant**

Todos os dados offline deverão possuir associação inequívoca ao tenant.

Validar no servidor:

usuário;

tenant;

contexto;

registro.

Impedir:

sincronização no tenant errado;

visualização de dados de outro tenant;

reutilização indevida de identificadores;

mistura de filas de diferentes empresas.

**23. Recuperação de falhas**

Preparar o sistema para:

perda de internet;

conexão instável;

encerramento inesperado;

reinício;

falha durante sincronização;

erro de servidor;

conflito;

registro rejeitado;

expiração;

falha no envio de evidência.

Não perder silenciosamente registros pendentes.

**24. Monitoramento da sincronização**

Disponibilizar informações sobre:

última sincronização confirmada;

quantidade de registros pendentes;

erros;

conflitos;

tentativas;

idade dos dados;

estado da fila.

Essas informações deverão estar acessíveis ao usuário e, quando
necessário, aos responsáveis administrativos.

**25. Interface e comunicação**

A interface deverá informar claramente:

Online;

Offline;

última sincronização;

idade dos dados;

quantidade pendente;

erros;

conflitos;

necessidade de sincronização;

bloqueio de novos registros;

expiração dos dados.

O usuário deverá entender claramente quando está operando com dados
potencialmente desatualizados.

**26. Alertas preventivos**

Implementar alertas antes do bloqueio.

O sistema deverá alertar sobre:

aproximação dos 3 dias;

ausência prolongada de sincronização;

aproximação dos 7 dias;

registros pendentes;

falhas;

risco de perda da fila local.

O objetivo é estimular sincronização antes da interrupção da capacidade
de criação offline.

**27. PWA no iOS**

O ADR-008 define PWA como plataforma de campo do MVP.

A implementação deverá considerar que o armazenamento local de uma PWA
no iOS pode ser descartado pelo sistema após períodos prolongados sem
utilização.

Portanto:

armazenamento local não é backup;

servidor é fonte única da verdade;

registros pendentes devem ser sincronizados prioritariamente;

alertas preventivos devem ser utilizados;

a janela offline deve permanecer curta e controlada;

o sistema não deverá depender de armazenamento local indefinido.

**28. Operações online obrigatórias**

Classificar como **Online Obrigatório** qualquer operação cuja execução
offline possa comprometer:

segurança;

integridade;

fiscal;

financeiro;

autorização crítica;

disponibilidade real de estoque;

alterações estruturais;

outros controles críticos.

Não permitir que o offline seja utilizado para contornar essas
validações.

**29. Fluxo operacional esperado**

A experiência deverá seguir, quando aplicável:

**Sincronizar → Trabalhar → Registrar → Permanecer Offline → Reconectar
→ Sincronizar → Revalidar → Confirmar**

O usuário deverá conseguir identificar quais registros:

foram criados;

estão pendentes;

foram sincronizados;

foram rejeitados;

apresentaram conflito;

foram confirmados.

**30. Critérios de aceite**

A implementação deverá atender, no mínimo:

offline seletivo;

classificação Offline Permitido / Offline Controlado / Online
Obrigatório;

servidor como fonte única da verdade;

armazenamento local controlado;

fila de sincronização;

IDs únicos;

idempotência;

retry;

sincronização parcial;

revalidação no servidor;

tratamento de conflitos;

precedência do servidor;

isolamento multi-tenant;

revalidação de permissões;

registro da última sincronização confirmada;

bloqueio de novos registros após 3 dias sem sincronização confirmada;

consulta local após o bloqueio, enquanto os dados permanecerem
disponíveis;

tentativa de sincronização após o bloqueio;

expiração operacional dos dados após 7 dias;

utilização do horário confirmado pelo servidor;

preservação da hora do fato quando necessária;

suporte às atividades de campo previstas;

proteção das evidências;

alertas preventivos;

tratamento do risco específico de armazenamento PWA/iOS;

ausência de perda silenciosa;

ausência de duplicidade silenciosa;

ausência de acesso entre tenants;

impossibilidade de utilizar offline para burlar autorização ou regras;

operações críticas mantidas como online quando necessário.

**31. Restrições de implementação**

Não:

criar uma segunda fonte de verdade;

transformar o banco local em banco independente;

implementar offline indiscriminadamente;

ignorar os limites de 3 e 7 dias;

confiar no relógio do dispositivo para validade;

permitir criação offline indefinida;

sobrescrever dados do servidor silenciosamente;

ignorar conflitos;

ignorar alterações de permissão;

tratar estoque local como estoque atual;

utilizar armazenamento local como backup;

criar dependência de armazenamento local indefinido;

alterar as decisões do ADR-005 sem nova decisão formal.

**32. Dependências**

A implementação deverá respeitar:

- **ADR-001 — Usuários / Permissões**

- **ADR-002 — MVP e Escopo do Produto**

- **ADR-003 — Cliente-piloto**

- **ADR-007 — Notificações**

- **ADR-008 — Plataforma do aplicativo de campo**

Não criar regras conflitantes com esses documentos.

**33. Governança**

Este documento é uma especificação derivada do **ADR-005 v2.1**.

Não utilizar este prompt para redesenhar a estratégia offline.

As decisões abaixo estão encerradas:

offline seletivo;

servidor como fonte única da verdade;

validade de 7 dias;

bloqueio de novos registros após 3 dias sem sincronização confirmada;

revalidação pelo servidor;

idempotência;

tratamento de conflitos;

isolamento por tenant;

prioridade para campo;

consideração das limitações do PWA/iOS.

Qualquer mudança estrutural deverá ser formalmente registrada e
refletida em nova versão do ADR.

**34. Princípio final de implementação**

Implementar o offline segundo o seguinte princípio:

**Permitir que o trabalho continue sem conexão, mas somente dentro de
limites controlados, preservando o servidor como fonte única da verdade
e garantindo que toda operação offline seja posteriormente validada,
rastreada e sincronizada com segurança.**

A regra operacional central é:

**Até 3 dias sem sincronização confirmada, o usuário pode operar offline
dentro das permissões e funcionalidades permitidas. Após 3 dias, novos
registros offline ficam bloqueados, mas consulta local e tentativa de
sincronização permanecem disponíveis. Após 7 dias, os dados são
considerados expirados para operações que dependam de sua validade.**

**Fim do Prompt Final de Implementação — ADR-005 v2.1**
