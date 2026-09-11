**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-008 — Plataforma de Campo: PWA × Aplicativo Nativo**

**Versão:** 2.0\
**Status:** APROVADO\
**Data:** 09/09/2026\
**Responsável:** Product Owner

**1. INSTRUÇÃO PRINCIPAL**

Implementar a **plataforma de campo do SaaS como PWA (Progressive Web
App)**, conforme definido pelo ADR-008 — Versão 2.0.

A PWA será a experiência especializada para smartphones e tablets
utilizados nas operações de campo, com prioridade para **Obra/Instalação
no MVP**.

Esta implementação deverá respeitar integralmente as decisões dos ADRs
relacionados.

**Não redesenhar as decisões já aprovadas.**

**Não transformar a PWA em um sistema independente.**

**Não criar aplicativo nativo no MVP.**

O backend continuará sendo a fonte oficial de dados, regras, autorização
e processamento.

**2. PRINCÍPIO ARQUITETURAL**

Implementar a arquitetura:

**PWA → APIs/Backend → Banco de Dados/Serviços do SaaS**

A PWA será responsável por:

interface de campo;

coleta de informações;

apresentação de dados;

execução de operações autorizadas;

armazenamento temporário;

fila local;

sincronização;

apresentação do resultado ao usuário;

integração com recursos necessários do dispositivo.

O backend será responsável por:

regras de negócio;

autorização;

validação;

revalidação;

processamento;

persistência oficial;

isolamento de tenants;

auditoria;

controle de estados;

confirmação definitiva das operações.

**3. PRIORIDADE DO MVP**

A implementação deverá priorizar:

Obra/Instalação;

operações essenciais de campo;

funcionamento offline seletivo;

sincronização;

evidências;

segurança;

experiência adequada para smartphone/tablet.

Não implementar uma réplica completa do ERP no dispositivo.

**4. OPERAÇÃO OFFLINE**

Implementar offline conforme ADR-005.

**Offline não significa apenas cache.**

A solução deverá possuir, conforme aplicável:

**Persistência local → Fila de operações → Sincronização → Idempotência
→ Revalidação pelo servidor → Tratamento de erros/conflitos → Resultado
→ Confirmação do servidor.**

Deverá ser possível:

disponibilizar previamente dados necessários;

trabalhar sem conexão;

registrar operações;

registrar ocorrências;

registrar etapas/status;

capturar evidências;

armazenar temporariamente dados;

sincronizar posteriormente.

O offline será seletivo e não deverá transformar todo o SaaS em uma
aplicação offline.

**5. ESTADOS DA OPERAÇÃO**

A interface deverá diferenciar claramente estados como:

registrado no dispositivo;

pendente de sincronização;

enviando;

processando;

sincronizado/confirmado;

erro;

conflito;

rejeitado.

O usuário nunca deverá interpretar um registro apenas local como
confirmação definitiva do servidor.

Utilizar a distinção:

**<span dir="rtl">“</span>Registrado no dispositivo”**

versus

**<span dir="rtl">“</span>Confirmado pelo servidor”.**

**6. FILA LOCAL**

Toda operação offline que necessite ser enviada deverá possuir:

identificador único;

referência à operação;

referência ao registro;

dados necessários;

hora do fato;

estado;

tentativas;

resultado;

informações de auditoria.

A fila deverá ser persistente e resistente a:

encerramento inesperado;

perda de conexão;

reinício do dispositivo;

falha de sincronização;

reprocessamento.

**7. IDEMPOTÊNCIA**

Implementar idempotência de forma que uma operação enviada mais de uma
vez não resulte em duplicação.

O backend deverá possuir mecanismos próprios de idempotência.

A PWA não poderá assumir que uma única tentativa de envio garante
processamento único.

**8. REVALIDAÇÃO NO SERVIDOR**

Toda operação offline deverá ser revalidada quando chegar ao servidor.

O servidor deverá verificar, conforme o processo:

autenticação;

tenant;

usuário;

permissões;

estado atual do registro;

regras de negócio;

integridade;

duplicidade;

conflitos;

validade da operação.

Uma operação válida no momento em que foi registrada offline poderá ser
rejeitada posteriormente caso o estado oficial tenha mudado.

**9. CONFLITOS**

Implementar tratamento de conflitos conforme ADR-005.

Não realizar sobrescrita cega.

O servidor será a autoridade para o estado oficial.

Quando houver conflito:

preservar o fato originalmente registrado;

registrar o conflito;

apresentar resultado adequado;

evitar perda silenciosa de informação;

permitir tratamento/reprocessamento quando aplicável.

**10. HORA DO FATO × HORA DO SERVIDOR**

Preservar a distinção entre:

**hora do fato**

e

**tempo oficial do servidor**.

A PWA deverá registrar a informação temporal disponível no dispositivo
quando a operação ocorrer offline.

O servidor deverá registrar o momento em que recebeu/processou a
operação.

Essas informações não deverão ser confundidas.

**11. EVIDÊNCIAS**

Implementar suporte para:

fotografias;

documentos;

arquivos;

evidências de obra;

evidências de ocorrências;

demais evidências previstas pelos processos.

Cada evidência deverá possuir:

identificador;

vínculo com a operação;

estado;

sincronização;

proteção;

confirmação do servidor.

Capturar uma foto não significa que ela já esteja definitivamente
armazenada no SaaS.

**12. CÂMERA E RECURSOS DO DISPOSITIVO**

Utilizar recursos do dispositivo somente quando houver necessidade
funcional.

Priorizar:

câmera;

armazenamento;

arquivos;

localização, quando necessária;

conectividade;

recursos adequados ao smartphone/tablet.

GPS/localização não deverá ser coletado continuamente sem finalidade
funcional.

**13. NOTIFICAÇÕES PUSH**

Integrar push conforme ADR-007.

A PWA será apenas o canal no dispositivo.

Não implementar regras de negócio de notificações dentro da PWA.

Respeitar:

configurações do tenant;

preferências do usuário;

disponibilidade do canal;

criticidade;

permissões do dispositivo.

Falha no push não poderá bloquear uma operação de negócio.

**14. AUTENTICAÇÃO E AUTORIZAÇÃO**

A PWA deverá utilizar os mecanismos oficiais de autenticação do SaaS.

A autorização deverá permanecer no backend.

Respeitar:

**Tenant → Estado Comercial → Entitlement → Usuário → Permissão → Regra
de Negócio.**

A PWA não poderá liberar funcionalidades simplesmente porque uma
interface ou parâmetro foi alterado.

Não confiar exclusivamente em:

frontend;

rotas;

parâmetros;

URLs;

armazenamento local.

**15. SEGURANÇA DOS DADOS LOCAIS**

Armazenar localmente somente o necessário.

Proteger:

dados;

tokens;

credenciais;

evidências;

operações pendentes;

informações temporárias.

Considerar:

expiração de sessão;

invalidação/revogação;

dispositivo perdido;

acesso por terceiros;

retenção;

remoção de dados temporários;

minimização de dados.

Nenhum dado deverá permanecer localmente sem justificativa funcional.

**16. ISOLAMENTO DE TENANTS**

O isolamento entre empresas deverá existir no backend e nas APIs.

A PWA deverá:

utilizar somente dados autorizados;

manter contexto do tenant;

impedir mistura de dados locais;

impedir sincronização cruzada;

descartar ou invalidar dados incompatíveis quando necessário.

O frontend nunca será considerado mecanismo suficiente de isolamento.

**17. EXPERIÊNCIA DE CAMPO**

Projetar a interface para uso real em campo.

Priorizar:

poucos passos;

ações rápidas;

boa legibilidade;

botões e controles adequados para telas móveis;

baixa necessidade de digitação;

feedback imediato;

identificação clara dos estados;

tratamento compreensível de erros;

operação com conectividade ruim.

A experiência de campo deverá ser especializada, sem criar um segundo
sistema de negócio.

**18. ATUALIZAÇÕES**

Implementar atualização centralizada da PWA sempre que possível.

Garantir compatibilidade entre:

PWA;

backend;

APIs;

banco local;

fila;

estrutura de operações;

evidências.

Uma atualização não poderá causar perda de operações ainda não
sincronizadas.

Quando houver mudança incompatível, deverá existir mecanismo de:

migração;

compatibilidade;

sincronização;

ou tratamento seguro das operações pendentes.

**19. DISPOSITIVOS SUPORTADOS**

Definir uma matriz oficial de suporte considerando:

sistema operacional;

navegador;

versão;

capacidades necessárias;

tamanho de tela;

recursos de hardware.

Não será necessário suportar todos os dispositivos existentes.

A matriz deverá ser baseada nos dispositivos efetivamente utilizados
pelo público-alvo/piloto.

**20. VALIDAÇÃO TÉCNICA**

Antes da aceitação da implementação, executar testes nos dispositivos
suportados.

**Online**

Validar:

login;

consulta;

registros;

ocorrências;

evidências;

sincronização;

notificações aplicáveis.

**Offline**

Validar:

disponibilização dos dados;

perda de conexão;

registro;

captura de evidências;

encerramento;

reabertura;

retorno da conexão;

sincronização;

processamento;

confirmação do servidor.

**Falhas**

Testar:

conexão instável;

perda durante envio;

servidor indisponível;

rejeição;

conflito;

erro;

reprocessamento;

encerramento inesperado;

atualização com operações pendentes.

**21. CRITÉRIOS DE ACEITAÇÃO**

A implementação somente será considerada aderente quando:

funcionar nos dispositivos suportados;

executar offline seletivo;

não perder operações;

não duplicar operações;

utilizar idempotência;

revalidar no servidor;

tratar conflitos;

preservar evidências;

proteger dados locais;

preservar tenant isolation;

preservar autorização;

manter auditoria;

não perder operações durante atualização;

apresentar estados claros ao usuário;

respeitar ADR-007;

executar adequadamente as operações essenciais de campo.

**22. FALHAS NÃO ACEITÁVEIS**

Não aceitar como comportamento normal:

perda de dados;

duplicação de operações;

falsa confirmação;

perda de evidência;

sincronização silenciosamente falha;

acesso a outro tenant;

bypass de permissão;

corrupção de fila;

perda de operações durante atualização;

impossibilidade de recuperar uma operação pendente;

quebra grave de segurança.

**23. RELAÇÃO COM ADR-005**

O ADR-008 implementará a plataforma escolhida para suportar o modelo
offline definido no ADR-005.

Não alterar:

offline seletivo;

prioridade Obra/Instalação;

servidor como fonte oficial;

identificadores únicos;

idempotência;

revalidação;

precedência do servidor;

tratamento de conflitos;

hora do fato;

auditoria;

estados de sincronização.

**24. RELAÇÃO COM ADR-007**

O ADR-008 não deverá duplicar a arquitetura de notificações.

Respeitar:

eventos;

regras;

destinatários;

preferências;

templates;

prioridades;

escalonamentos;

auditoria;

canais.

Push será apenas uma capacidade da plataforma de campo.

**25. RELAÇÃO COM ADR-003**

Problemas identificados no piloto deverão seguir:

**Problema → Registro → Classificação → Análise → Decisão →
Implementação → Validação.**

Uma solicitação para criar aplicativo nativo não será automaticamente
considerada mudança de plataforma.

Primeiro deverá ser demonstrado:

qual problema ocorreu;

qual requisito foi afetado;

em qual dispositivo;

em qual operação;

se existe solução na PWA;

qual impacto.

**26. APLICATIVO NATIVO**

Não desenvolver aplicativo nativo no MVP.

O nativo permanecerá como alternativa futura.

Sua adoção deverá ser considerada somente quando:

a PWA não atender requisito essencial;

houver necessidade comprovada de recurso nativo;

offline exigir capacidades incompatíveis com a PWA;

push/processamento em segundo plano exigir maior controle;

a experiência justificar a complexidade.

Uma mudança deverá ser formalmente registrada.

**27. INDEPENDÊNCIA DO BACKEND**

Evitar acoplamento entre backend e PWA.

As APIs e contratos deverão permitir, futuramente, que uma aplicação
nativa utilize:

mesmos dados;

mesmas regras;

mesmas permissões;

mesmos processos;

mesmos mecanismos de auditoria;

mesmos mecanismos de sincronização.

Não reconstruir o backend para atender exclusivamente à PWA.

**28. COEXISTÊNCIA FUTURA**

Não implementar PWA + aplicativo nativo simultaneamente no MVP.

Caso futuramente seja necessária coexistência:

deverá existir decisão formal;

ambas as interfaces deverão utilizar o mesmo backend;

não deverá haver duplicação de regras;

dados e operações deverão permanecer consistentes.

**29. GOVERNANÇA**

Alterações estruturais envolvendo:

plataforma;

offline;

sincronização;

recursos nativos;

notificações;

deverão ser formalmente registradas.

Não alterar silenciosamente este ADR ou outros ADRs aprovados.

**30. ORDEM DE PRIORIDADE**

Em qualquer decisão de implementação, priorizar:

segurança;

integridade dos dados;

isolamento entre tenants;

autorização;

confiabilidade da sincronização;

continuidade da operação;

experiência de campo;

manutenção;

simplicidade;

recursos adicionais.

Nenhum recurso adicional deverá comprometer os itens anteriores.

**31. ESCOPO FORA DO MVP**

Não implementar como requisito do MVP:

aplicativo nativo;

duas aplicações móveis simultâneas;

suporte irrestrito a dispositivos;

GPS contínuo;

recursos avançados de hardware sem necessidade;

replicação completa do ERP localmente;

funcionalidades móveis independentes das regras do SaaS.

**32. REGRA FINAL DE IMPLEMENTAÇÃO**

Implementar a plataforma de campo como **PWA**, utilizando a menor
complexidade tecnológica capaz de atender aos requisitos essenciais do
MVP.

A implementação deverá preservar:

**Segurança + Integridade + Offline + Sincronização + Evidências +
Experiência de Campo + Backend como fonte oficial.**

A validação técnica é requisito de aceitação da implementação, não uma
nova escolha entre PWA e aplicativo nativo.

Se uma limitação essencial for identificada:

**primeiro corrigir/adequar a PWA; somente uma limitação essencial,
comprovada e não solucionável adequadamente deverá gerar nova decisão
arquitetural.**

A tecnologia deverá se adaptar ao produto.

**Não limitar artificialmente o produto para justificar a tecnologia
escolhida.**
