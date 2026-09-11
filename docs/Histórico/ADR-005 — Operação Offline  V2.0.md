**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-005 — Operação Offline**

**Versão:** 2.0\
**Status:** APROVADO\
**Data:** 09/09/2026\
**Responsável:** Product Owner

**1. Objetivo**

Implementar no SaaS uma capacidade de **offline seletivo, controlado e
orientado à continuidade operacional**, mantendo o servidor como fonte
oficial do estado do sistema.

O offline **não deverá criar uma segunda versão independente do
sistema**.

A prioridade do MVP será **Obra/Instalação**, especialmente as
atividades executadas em campo.

Toda implementação deverá respeitar integralmente as decisões deste ADR
e permanecer compatível com os demais ADRs aprovados.

**2. Diretriz arquitetural principal**

Implementar offline **por funcionalidade**, nunca como um modo offline
geral do sistema.

Cada funcionalidade deverá ser classificada como:

**Permitida offline**;

**Permitida offline com restrições**;

**Somente online**.

A capacidade offline deverá ser disponibilizada somente quando houver:

- necessidade operacional;

- benefício relevante;

- armazenamento local seguro;

- identificação única;

- idempotência;

- sincronização controlada;

- revalidação no servidor;

- tratamento de conflitos;

- rastreabilidade;

- auditoria;

- compatibilidade com o MVP.

**3. Prioridade do MVP**

A prioridade do offline no MVP é:

**Obra/Instalação**

Implementar, conforme aplicável:

- consulta de dados previamente sincronizados;

- execução de atividades;

- medidas;

- ocorrências;

- pendências;

- progresso parcial;

- registros de instalação;

- observações;

- evidências;

- informações necessárias à conclusão;

- demais registros essenciais de campo.

A lista definitiva deverá respeitar as regras dos módulos e do MVP.

**4. Dados offline**

Não armazenar uma cópia completa do banco do tenant no dispositivo.

Disponibilizar somente os dados necessários à funcionalidade autorizada,
considerando:

- usuário;

- permissões;

- tenant;

- empresa;

- obra;

- pedido;

- atividade;

- item;

- cliente;

- medidas;

- serviços;

- engenharia essencial;

- produção essencial;

- expedição essencial;

- pendências;

- ocorrências;

- demais dados necessários.

O dispositivo deverá armazenar somente o mínimo necessário.

Dados pessoais, administrativos, financeiros e fiscais desnecessários
não deverão ser armazenados localmente.

**5. Registro de operação offline**

Toda operação criada offline deverá possuir identificação segura e
persistente.

Registrar, conforme aplicável:

- ID único;

- tenant;

- empresa;

- usuário;

- dispositivo;

- operação;

- registro relacionado;

- hora do fato;

- estado local;

- conteúdo;

- dependências;

- estado de sincronização;

- tentativas;

- erros;

- conflitos;

- resultado.

O ID deverá permanecer o mesmo durante:

**criação → sincronização → processamento → resultado.**

**6. Hora do fato × hora do servidor**

Diferenciar obrigatoriamente:

**Hora do fato**

Momento em que a atividade ocorreu ou foi informada pelo usuário.

**Hora do servidor**

Momento oficial em que o servidor recebeu/processou a operação.

A hora do servidor deverá ser utilizada como referência oficial para
ordenação e processamento do estado do sistema quando necessário.

A hora do fato deverá ser preservada quando possuir relevância
operacional.

**7. Fila de sincronização**

Implementar uma fila persistente para operações offline.

Estados mínimos:

- PENDENTE;

- ENVIANDO;

- PROCESSANDO;

- SINCRONIZADO;

- ERRO;

- CONFLITO;

- REJEITADO.

A fila deverá sobreviver a:

- perda de conexão;

- encerramento do aplicativo;

- reinicialização do dispositivo;

- falhas temporárias;

- timeouts.

Não perder operações não sincronizadas.

**8. Idempotência**

Toda operação offline deverá possuir mecanismo de idempotência.

Reenvios causados por:

- timeout;

- perda de conexão;

- retry;

- reinício;

- falha de resposta;

- repetição manual;

não poderão gerar duplicidade.

Um timeout não poderá ser interpretado automaticamente como falha
definitiva.

O servidor deverá reconhecer operações já processadas.

**9. Sincronização**

Implementar sincronização:

- automática após recuperação da conexão;

- manual quando aplicável.

O processamento deverá respeitar dependências entre operações.

Uma operação dependente não poderá ser tratada como concluída quando sua
predecessora estiver:

- pendente;

- em erro;

- em conflito;

- rejeitada.

O servidor deverá retornar resultado explícito para cada operação.

Resultados possíveis incluem:

- sincronizado;

- rejeitado;

- conflito;

- erro temporário;

- erro que exige intervenção.

**10. Revalidação no servidor**

Toda operação criada offline deverá ser revalidada no servidor.

Validar, conforme aplicável:

- autenticação;

- tenant;

- empresa;

- usuário;

- permissões;

- existência do registro;

- versão;

- estado atual;

- regras de negócio;

- dependências;

- conflitos;

- validade da operação.

Uma operação válida no momento do registro offline poderá ser rejeitada
posteriormente caso o estado do servidor tenha mudado.

O dispositivo não poderá substituir as regras do servidor.

**11. Conflitos**

Nunca utilizar sobrescrita cega.

O servidor deverá possuir precedência sobre o estado oficial.

Quando houver conflito:

identificar o registro;

identificar a operação local;

comparar com o estado atual;

aplicar regra específica da operação;

resolver automaticamente somente quando houver regra segura;

caso contrário, marcar como conflito;

preservar a informação original;

solicitar intervenção quando necessário;

registrar todo o processo na auditoria.

Não utilizar genericamente a regra:

“última sincronização vence”.

**12. Preservação do fato operacional**

O fato registrado pelo usuário enquanto offline não deverá ser
simplesmente descartado porque não pôde atualizar imediatamente o estado
oficial.

Quando necessário, deverá ser preservado como:

- ocorrência;

- evidência;

- pendência;

- registro rejeitado;

- ou outra estrutura adequada.

A impossibilidade de atualização imediata não poderá resultar em perda
silenciosa da informação operacional.

**13. Segurança**

O offline deverá manter os mesmos princípios de segurança do sistema
online.

Implementar:

- isolamento por tenant;

- controle de acesso;

- validação de permissões;

- proteção do armazenamento local;

- proteção de sessão;

- expiração/invalidação;

- limpeza de dados;

- proteção de tokens;

- mecanismos para dispositivo perdido ou comprometido.

O servidor deverá revalidar as permissões durante a sincronização.

Revogação de acesso deverá ser respeitada mesmo quando o dispositivo
tiver permanecido offline.

**14. Auditoria**

A auditoria deverá permitir reconstruir:

**registro local → armazenamento → tentativa → sincronização →
processamento → resultado.**

Registrar, conforme aplicável:

- usuário;

- dispositivo;

- tenant;

- operação;

- registro;

- hora do fato;

- hora da sincronização;

- estado anterior;

- alteração;

- resultado;

- erro;

- conflito;

- tentativa;

- reprocessamento.

Nenhuma operação offline deverá ficar sem rastreabilidade.

**15. Falhas**

Diferenciar:

**Falha de conectividade**

Manter pendente e tentar novamente.

**Erro temporário do servidor**

Executar retry controlado.

**Erro de validação**

Rejeitar com motivo e preservar a operação.

**Conflito**

Aplicar regras do ADR-005 e solicitar intervenção quando necessário.

**Erro permanente**

Exigir ação apropriada do usuário ou suporte.

Nenhum desses cenários poderá provocar perda silenciosa.

**16. Reprocessamento**

Permitir reprocessamento quando aplicável.

O reprocessamento deverá:

- preservar o ID original;

- manter idempotência;

- manter histórico;

- registrar nova tentativa;

- evitar duplicação;

- respeitar dependências;

- atualizar o estado corretamente.

Quando um lote possuir várias operações, cada operação deverá possuir
resultado independente.

A falha de uma operação não poderá apagar ou ocultar silenciosamente as
demais.

**17. Experiência do usuário**

A complexidade técnica deverá ficar escondida do usuário.

A interface deverá informar claramente:

**Conectividade**

- Online;

- Offline;

- Sincronizando;

- Erro de sincronização.

**Estado da operação**

- Registrado no dispositivo;

- Aguardando sincronização;

- Sincronizando;

- Confirmado pelo servidor;

- Erro;

- Conflito;

- Rejeitado;

- Requer intervenção.

Nunca apresentar uma operação como definitivamente concluída quando ela
estiver apenas registrada localmente.

Utilizar distinção clara entre:

**<span dir="rtl">“</span>Registrado no dispositivo”**

e

**<span dir="rtl">“</span>Confirmado pelo servidor”.**

**18. Dados desatualizados**

Quando uma consulta utilizar dados pré-sincronizados, indicar quando
necessário:

- última sincronização;

- possibilidade de informação desatualizada;

- estado das alterações pendentes.

O usuário deverá conseguir compreender que o dado offline pode não
representar o estado atual do servidor.

**19. Funcionalidades exclusivamente online**

Não implementar offline, salvo decisão formal posterior, para:

- administração de usuários;

- permissões;

- configurações globais críticas;

- alterações estruturais;

- operações fiscais em tempo real;

- operações financeiras críticas;

- alterações globais;

- operações que exijam estado atual do servidor;

- funcionalidades com risco elevado de inconsistência.

Não simular localmente operações que dependem obrigatoriamente do
servidor.

**20. Limites do MVP**

O offline do MVP deverá permanecer limitado ao necessário para
continuidade operacional.

Não transformar o MVP em uma aplicação totalmente offline.

Novas funcionalidades offline somente poderão ser adicionadas quando
houver:

- necessidade operacional comprovada;

- benefício;

- segurança;

- sincronização;

- idempotência;

- revalidação;

- tratamento de conflitos;

- auditoria;

- compatibilidade com o MVP.

Necessidade identificada no piloto não amplia automaticamente o escopo.

**21. Piloto**

Durante o piloto, registrar evidências sobre:

- frequência das falhas de conexão;

- duração das interrupções;

- funcionalidades utilizadas offline;

- volume de operações;

- conflitos;

- erros;

- dificuldades de sincronização;

- impacto operacional;

- necessidade de ampliação ou redução do offline.

As evidências deverão ser avaliadas pelo Product Owner conforme o
processo definido no ADR-003.

**22. Dependências arquiteturais**

A implementação deverá permanecer compatível com:

**ADR-001 — Usuários, Perfis e Permissões**;

**ADR-002 — MVP e Escopo do Produto**;

**ADR-003 — Cliente-Piloto**;

**ADR-004 — Estratégia Fiscal**;

**ADR-007 — Notificações**;

**ADR-008 — Plataforma do Aplicativo de Campo**.

Especial atenção deverá ser dada ao ADR-008.

A escolha entre PWA e aplicativo nativo deverá considerar:

- armazenamento local;

- persistência da fila;

- sincronização;

- conectividade intermitente;

- segurança;

- autenticação;

- recuperação após encerramento;

- comportamento em dispositivos móveis.

**23. Governança**

Alterações relevantes na arquitetura offline deverão ser formalizadas
quando envolverem:

- ampliação significativa do offline;

- alteração da estratégia de sincronização;

- alteração da autoridade entre dispositivo e servidor;

- mudanças relevantes de segurança;

- mudança na estratégia de conflitos;

- impacto em outros módulos;

- alteração relacionada ao ADR-008;

- impacto relevante no MVP;

- alteração arquitetural transversal.

Alterações internas de implementação que não modifiquem as decisões
deste ADR poderão ocorrer normalmente.

**24. Versionamento**

Nunca alterar ou remover silenciosamente decisões aprovadas.

Alterações relevantes deverão:

- gerar nova versão;

- registrar o que mudou;

- registrar motivo;

- registrar impactos;

- preservar histórico;

- manter coerência com os demais ADRs.

Conflitos entre este ADR e documentos futuros deverão ser formalmente
identificados e resolvidos.

**25. Critérios de Aceitação**

A implementação será considerada aderente ao ADR-005 quando:

- [ ] o offline estiver limitado às funcionalidades autorizadas;

- [ ] Obra/Instalação estiver contemplada no MVP;

- [ ] somente dados necessários forem armazenados localmente;

- [ ] cada operação possuir ID seguro;

- [ ] exista idempotência;

- [ ] exista fila persistente;

- [ ] existam estados de sincronização;

- [ ] exista sincronização automática quando possível;

- [ ] o servidor revalide as operações;

- [ ] conflitos sejam tratados explicitamente;

- [ ] não exista perda silenciosa;

- [ ] não exista duplicação;

- [ ] dependências sejam respeitadas;

- [ ] permissões sejam revalidadas;

- [ ] isolamento de tenant seja mantido;

- [ ] auditoria seja completa;

- [ ] seja possível reconstruir o ciclo da operação;

- [ ] o usuário diferencie registro local de confirmação do servidor;

- [ ] dados potencialmente desatualizados sejam identificáveis;

- [ ] o reprocessamento seja seguro;

- [ ] falhas parciais sejam tratadas individualmente;

- [ ] a implementação seja compatível com os demais ADRs;

- [ ] a evolução permaneça submetida à governança do produto.

**26. Regra Final de Implementação**

Implementar o ADR-005 como uma **capacidade transversal de continuidade
operacional**, com foco inicial em **Obra/Instalação**, sem transformar
o sistema inteiro em uma aplicação offline.

A implementação deve preservar permanentemente os seguintes princípios:

**O dispositivo pode registrar.**

**O servidor valida.**

**O servidor determina o estado oficial.**

**Toda operação é identificável e auditável.**

**Nenhuma falha pode causar perda silenciosa.**

**Nenhum reenvio pode gerar duplicidade.**

**Nenhuma operação offline pode contornar segurança ou regras de
negócio.**

**O usuário nunca deve confundir registro local com confirmação do
servidor.**

**Offline é continuidade operacional controlada, não uma segunda versão
do sistema.**
