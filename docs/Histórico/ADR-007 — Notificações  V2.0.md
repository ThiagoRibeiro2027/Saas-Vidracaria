**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-007 — Notificações**

**Versão do ADR:** 2.0\
**Status:** APROVADO\
**Data:** 09/09/2026\
**Responsável:** Product Owner

**1. Objetivo**

Implementar no SaaS uma **camada centralizada de notificações**,
desacoplada dos módulos operacionais e dos provedores externos de
comunicação.

A implementação deverá transformar eventos relevantes dos processos em
comunicações rastreáveis, seguras e confiáveis.

A regra fundamental é:

**Eventos pertencem aos processos do SaaS; notificações pertencem à
camada de comunicação.**

**2. Arquitetura obrigatória**

Implementar a seguinte cadeia conceitual:

**Processo → Evento → Regra de Notificação → Destinatário → Canal →
Provedor → Resultado**

**Módulo de origem**

Responsável por:

executar o processo;

aplicar suas regras de negócio;

registrar alterações;

gerar/publicar eventos relevantes.

**Camada de notificações**

Responsável por:

receber eventos;

determinar se devem gerar comunicação;

aplicar regras;

determinar destinatários;

determinar canais;

aplicar prioridade;

gerar conteúdo;

enfileirar;

processar;

realizar retry;

registrar resultados;

tratar erros;

permitir reprocessamento.

**Canal/provedor**

Responsável exclusivamente pela entrega da comunicação.

**3. Desacoplamento**

Não permitir que módulos operacionais implementem diretamente lógica de:

e-mail;

WhatsApp;

SMS;

push;

provedores externos;

filas específicas;

templates de comunicação.

Os módulos devem publicar eventos e permanecer independentes da
tecnologia utilizada para comunicação.

**4. Eventos**

Criar mecanismo padronizado para eventos notificáveis.

O evento deverá permitir identificar, quando aplicável:

tenant;

empresa/unidade;

módulo;

tipo do evento;

registro/processo relacionado;

responsável;

data/hora;

prioridade;

dados necessários à comunicação.

Exemplos de eventos:

pedido criado/alterado;

pedido aprovado/reprovado/pendente;

material pendente/parcial/rejeitado;

produção alterada/concluída;

ocorrência de qualidade;

expedição;

instalação/obra;

pendência financeira;

evento fiscal;

alteração relevante de usuário/permissão;

evento técnico relevante.

A lista deverá ser extensível.

**5. Regras de notificação**

Implementar camada centralizada de regras.

As regras deverão permitir determinar:

se o evento gera notificação;

destinatário;

canal;

momento do envio;

prioridade;

repetição;

escalonamento, quando aplicável.

Nem todo evento deverá obrigatoriamente gerar comunicação.

**6. Destinatários**

Permitir definição por:

usuário;

responsável;

perfil/função;

grupo;

unidade/empresa;

outros critérios necessários.

Sempre validar:

tenant;

empresa/unidade;

permissões;

contexto operacional.

Nunca enviar dados de um contexto para destinatário sem autorização.

**7. Contrato e autorização**

Respeitar a separação estabelecida pelos demais ADRs:

**Tenant/Contrato → Disponibilidade do recurso → Usuário → Permissão**

Uma configuração de notificação não poderá:

liberar recurso não contratado;

conceder permissão;

ampliar acesso;

ultrapassar isolamento entre tenants.

Receber uma notificação **não concede qualquer autorização adicional**.

**8. Canais**

Implementar arquitetura abstrata de canais.

Canais previstos:

notificação interna;

e-mail;

push;

WhatsApp;

SMS;

canais futuros.

Cada canal deverá possuir implementação desacoplada.

A arquitetura deverá permitir substituição ou inclusão de provedores sem
alteração dos módulos de origem.

**9. Push e ADR-008**

Não antecipar a decisão entre PWA e aplicativo nativo.

A implementação de push deverá permanecer compatível com o:

**ADR-008 — PWA × Aplicativo Nativo**

**10. Processamento assíncrono**

O processamento de canais externos deverá ser preferencialmente
assíncrono.

Fluxo:

**Evento → Registro → Fila → Processamento → Canal → Provedor →
Resultado**

A operação de negócio não deverá aguardar o envio da comunicação.

**11. Fila**

Implementar mecanismo que permita:

enfileiramento;

processamento;

controle de tentativas;

identificação de pendências;

falhas;

retry;

reprocessamento.

A tecnologia específica da fila poderá ser escolhida pela arquitetura
técnica, desde que cumpra os requisitos deste ADR.

**12. Idempotência**

O processamento deverá ser idempotente.

Impedir duplicidade causada por:

retry;

timeout;

evento duplicado;

reprocessamento;

falha de comunicação;

resposta tardia do provedor.

Utilizar identificador único ou mecanismo equivalente.

**13. Estados**

Implementar estados suficientes para representar o ciclo da notificação.

Referência:

**Pendente → Processando → Enviada → Entregue → Lida**

Em caso de falha:

**Erro → Nova tentativa → Processando**

Poderão existir estados adicionais, como:

Cancelada;

Expirada;

Rejeitada;

Não entregue.

A nomenclatura técnica poderá ser ajustada na implementação, preservando
o significado funcional.

**14. Retry**

Implementar retry controlado para erros recuperáveis.

Considerar:

quantidade máxima;

intervalo;

tipo de erro;

recuperabilidade;

limite de processamento.

Não realizar tentativas infinitas para erros permanentes.

**15. Falha de comunicação**

Uma falha em:

e-mail;

WhatsApp;

SMS;

push;

provedor;

fila;

não poderá bloquear ou desfazer a operação de negócio de origem.

Exemplo:

Produção concluída + e-mail não enviado = produção concluída e
comunicação pendente.

**16. Provedores externos**

Criar camada de abstração para provedores.

A integração deverá suportar:

autenticação;

envio;

retorno;

erro;

indisponibilidade;

rastreabilidade;

substituição.

Registrar, quando disponível:

identificador externo;

data/hora;

sucesso/falha;

código/motivo;

tentativa;

demais dados relevantes.

**17. Templates**

Implementar gerenciamento centralizado de templates.

Templates poderão conter:

título;

assunto;

corpo;

variáveis;

identificação do evento;

processo relacionado;

links/ações.

Permitir conteúdo diferente por canal mantendo a mesma regra de negócio.

**18. Versionamento de templates**

Registrar a versão/configuração utilizada em cada envio.

Alterações futuras de templates não poderão alterar o histórico das
notificações já processadas.

**19. Central de notificações**

Implementar central interna permitindo ao usuário:

visualizar notificações;

identificar não lidas;

visualizar lidas;

acessar o processo relacionado;

marcar como lida;

consultar histórico.

O acesso ao processo deverá passar novamente pelas regras normais de
autorização.

**20. Leitura e confirmação**

Diferenciar:

enviada;

entregue;

lida;

confirmada/ciência;

ação executada;

processo concluído.

Nenhum desses estados deverá ser confundido automaticamente com
conclusão do processo operacional.

**21. Preferências**

Implementar preferências individuais quando aplicável.

Respeitar:

regras do tenant;

contrato;

disponibilidade do canal;

permissões;

comunicações obrigatórias.

Preferência individual não poderá impedir comunicação definida como
obrigatória.

**22. Configuração por tenant**

Permitir, quando necessário:

tipos habilitados;

canais;

destinatários;

prioridades;

horários;

condições de envio.

Registrar alterações relevantes de configuração.

**23. Criticidade**

Suportar níveis de prioridade, por exemplo:

informativa;

atenção;

importante;

crítica.

A prioridade poderá influenciar apresentação e estratégia de
comunicação.

**24. Escalonamento**

A arquitetura deverá permitir:

**Responsável → Supervisor → Gestor**

quando uma condição permanecer sem tratamento.

O escalonamento deverá ser controlado por regras e não por alterações de
permissões.

Evitar:

repetição infinita;

excesso de mensagens;

duplicidade;

escalonamento indevido.

**25. Integração com processos**

Os módulos deverão continuar sendo a fonte oficial dos processos.

Exemplo:

**Pedido → Engenharia → Estoque → Produção → Expedição → Instalação**

A camada de notificações poderá acompanhar eventos de todas essas etapas
sem assumir a responsabilidade pelo processo.

**26. Consistência entre operação e evento**

A implementação deverá evitar:

operação concluída sem evento correspondente;

notificação relacionada a operação inexistente;

duplicidade indevida.

A solução técnica poderá utilizar mecanismos apropriados de consistência
transacional/event-driven, desde que preserve o princípio definido neste
ADR.

**27. Auditoria**

Registrar, quando aplicável:

evento de origem;

tenant;

empresa;

destinatário;

canal;

regra;

template/versão;

data/hora;

status;

tentativas;

retorno;

erro;

reprocessamento;

entrega/leitura.

O sistema deverá permitir explicar:

**Por que foi enviada, para quem, por qual canal e qual foi o
resultado?**

**28. LGPD e proteção de dados**

Aplicar os princípios da LGPD e legislação aplicável.

Utilizar somente dados necessários.

Evitar exposição desnecessária de:

dados pessoais;

informações operacionais;

informações sensíveis;

dados de outros tenants.

Quando adequado, enviar apenas resumo e direcionar o usuário ao SaaS.

**29. Segurança**

Todo acesso originado de uma notificação deverá ser novamente validado
pelo backend.

Validar:

autenticação;

tenant;

empresa/unidade;

permissão;

contexto.

Não confiar exclusivamente em:

links;

parâmetros;

identificadores;

interface;

conteúdo da notificação.

**30. Monitoramento**

Implementar observabilidade suficiente para acompanhar:

volume;

pendências;

processamento;

sucesso;

falhas;

retries;

tempo de processamento;

tempo de entrega, quando disponível;

falhas por canal;

falhas por provedor;

acúmulo de fila.

Distinguir:

**erro operacional ≠ erro de comunicação.**

**31. Reprocessamento**

Permitir reprocessamento de notificações recuperáveis sem recriar o
evento operacional.

Preservar:

evento original;

tentativas anteriores;

erros;

resultados;

novas tentativas.

**32. MVP**

O MVP deverá implementar somente o necessário para suportar
adequadamente o fluxo operacional real definido no ADR-002.

Capacidades previstas conforme necessidade:

camada centralizada;

eventos;

regras básicas;

destinatários;

notificações internas;

e-mail;

preferências básicas;

rastreabilidade;

estados;

retry;

idempotência;

integração com módulos;

segurança;

auditoria.

**Não tornar obrigatórios no MVP sem necessidade comprovada:**

WhatsApp;

SMS;

automações avançadas;

escalonamentos complexos;

múltiplos provedores simultâneos;

múltiplos idiomas;

comunicação em massa;

analytics avançado;

agrupamento sofisticado;

IA aplicada a notificações.

**33. Piloto**

Necessidades identificadas durante o piloto deverão seguir o processo do
ADR-003.

Não incorporar automaticamente solicitações específicas.

Classificar como:

defeito;

correção necessária;

necessidade essencial;

melhoria;

backlog;

necessidade específica do cliente.

**34. Offline**

Eventos originados em operações offline deverão respeitar as regras do
ADR-005.

Não considerar automaticamente um evento local como confirmação
definitiva da operação.

O processamento deverá respeitar:

sincronização;

confirmação pelo servidor;

idempotência;

rastreabilidade;

autoridade do servidor.

**35. Modelo Comercial**

Respeitar o ADR-006.

O contrato poderá determinar quais recursos/canais estão disponíveis ao
tenant.

Porém:

**contratação ≠ permissão**

e

**permissão ≠ contratação**.

Nenhuma alteração manual de permissão poderá liberar recurso não
contratado.

**36. Governança**

O Product Owner deverá governar:

evolução;

priorização;

escopo;

alterações estruturais;

coerência com ADRs.

Mudanças estruturais deverão ser formalmente avaliadas e, quando
necessário, originar novo ADR.

**37. Versionamento**

Preservar:

versão;

status;

data;

responsável;

histórico.

Não remover decisões aprovadas silenciosamente.

**38. Dependências**

A implementação deverá permanecer coerente com:

ADR-001 — Usuários, Perfis e Permissões;

ADR-002 — MVP e Escopo do Produto;

ADR-003 — Cliente-Piloto;

ADR-004 — Estratégia Fiscal;

ADR-005 — Operação Offline;

ADR-006 — Modelo Comercial;

ADR-008 — PWA × Aplicativo Nativo.

**39. Critérios de aceite**

A implementação será considerada aderente quando:

☐ módulos operacionais não dependerem diretamente de canais;

☐ eventos forem separados das notificações;

☐ regras forem centralizadas;

☐ destinatários respeitarem tenant e autorização;

☐ canais forem desacoplados;

☐ processamento externo for assíncrono;

☐ existir idempotência;

☐ retry for controlado;

☐ falhas de comunicação não bloquearem processos;

☐ existir rastreabilidade completa;

☐ existir central de notificações;

☐ preferências respeitarem regras superiores;

☐ links não ampliarem permissões;

☐ dados forem protegidos;

☐ LGPD for considerada;

☐ existir monitoramento;

☐ existir reprocessamento;

☐ MVP não seja expandido indevidamente;

☐ integração com ADR-005, ADR-006 e ADR-008 seja preservada;

☐ versionamento e auditoria sejam mantidos.

**40. Regra final de implementação**

**Implementar uma camada centralizada, desacoplada, segura, rastreável e
resiliente de notificações, na qual os módulos geram eventos, a camada
de notificações decide como comunicar e os canais realizam a entrega.**

**Nenhuma notificação poderá alterar a autoridade do processo
operacional, conceder permissões ou comprometer a integridade da
operação de origem.**

**Este prompt deve ser implementado em conformidade com o ADR-007 —
Versão 2.0 — APROVADO.**

**Não redesenhar decisões já aprovadas. Em caso de conflito com outro
documento, interromper a implementação daquela parte e aplicar a
governança formal dos ADRs.**
