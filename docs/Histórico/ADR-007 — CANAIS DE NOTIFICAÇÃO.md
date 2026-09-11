**ADR-007 — CANAIS DE NOTIFICAÇÃO**

**Projeto:** SaaS Industrial\
**Versão:** 1.0\
**Status:** APROVADO E FECHADO\
**Revisão:** CONCLUÍDA\
**Consolidação:** CONCLUÍDA

**1. OBJETIVO**

Definir a arquitetura, estratégia e regras para o serviço de
notificações do SaaS Industrial, estabelecendo:

tipos de notificações;

eventos disparadores;

destinatários;

regras de direcionamento;

prioridades;

preferências;

canais;

templates;

processamento;

filas;

retries;

escalonamentos;

histórico;

auditoria;

segurança;

monitoramento;

integração com os módulos;

critérios de MVP;

evolução futura.

O serviço deverá funcionar como uma capacidade transversal do SaaS, sem
criar dependência indevida entre os módulos de negócio.

**2. PRINCÍPIO ARQUITETURAL CENTRAL**

O serviço de notificações deverá seguir o fluxo:

**Módulo → Evento → Serviço de Notificações → Regra → Destinatário →
Canal → Provedor**

Os módulos de negócio deverão gerar eventos e não deverão implementar
diretamente a lógica de envio para cada canal.

O serviço de notificações será responsável por interpretar o evento e
determinar:

se haverá comunicação;

quem deverá receber;

prioridade;

canal;

momento;

agrupamento;

recorrência;

escalonamento;

histórico;

processamento.

**3. NOTIFICAÇÃO COMO SERVIÇO TRANSVERSAL**

Notificações são uma capacidade transversal do SaaS.

Nenhum módulo deverá criar sua própria infraestrutura independente de
notificações.

O serviço deverá ser reutilizável por:

Comercial;

Pedidos;

Engenharia;

PCP;

Produção;

Estoque;

Suprimentos;

Qualidade;

Expedição;

Obra/Instalação;

Financeiro;

Fiscal;

Integrações;

Operações Offline;

demais módulos futuros.

A existência de uma notificação não altera a responsabilidade do módulo
proprietário do processo.

**4. TIPOS DE NOTIFICAÇÃO**

O sistema deverá suportar, no mínimo:

Informativa;

Alerta;

Pendência;

Aprovação;

Exceção;

Crítica.

Nem todo evento deverá gerar uma notificação.

A geração deverá depender de regras e contexto.

**5. EVENTOS DISPARADORES**

Eventos poderão originar-se de qualquer módulo ou processo relevante.

Exemplos:

**Comercial**

proposta recebida;

aprovação/rejeição;

validade próxima do vencimento;

negociação pendente.

**Pedidos**

pedido criado;

alteração relevante;

bloqueio;

liberação;

informação pendente.

**Engenharia**

projeto disponível;

revisão liberada;

aprovação pendente;

alteração relevante;

incompatibilidade.

**PCP e Produção**

ordem liberada;

programação alterada;

atraso;

recurso indisponível;

produção concluída;

ocorrência crítica.

**Estoque**

estoque abaixo de parâmetro;

reserva;

divergência;

material bloqueado;

necessidade de reposição.

**Suprimentos**

solicitação aguardando aprovação;

cotação disponível;

pedido de compra aprovado;

material pendente;

divergência no recebimento.

**Qualidade**

inspeção pendente;

reprovação;

não conformidade;

retrabalho;

ocorrência crítica.

**Expedição**

carregamento programado;

carga liberada;

divergência;

saída;

ocorrência de transporte;

entrega;

atraso.

**Obra/Instalação**

instalação programada;

alteração da programação;

equipe atribuída;

material pendente;

ocorrência de campo;

instalação parcial;

conclusão;

revisita;

problema técnico;

documentação pendente;

necessidade de intervenção.

**Financeiro**

vencimento próximo;

título vencido;

pagamento identificado;

pendência;

aprovação;

divergência.

**Fiscal**

documento recebido;

autorização;

rejeição;

cancelamento;

evento;

divergência;

processamento pendente;

falha.

**Integrações**

sucesso;

falha;

indisponibilidade;

conflito;

necessidade de reprocessamento.

**Offline**

operação pendente de sincronização;

sincronização concluída;

erro;

conflito;

intervenção necessária.

**6. PRIORIDADES**

As notificações deverão utilizar:

Crítica;

Alta;

Média;

Baixa.

A prioridade influenciará:

velocidade de processamento;

possibilidade de agrupamento;

escalonamento;

canais;

recorrência;

comportamento dos lembretes.

Notificações críticas não deverão ser indevidamente suprimidas por
mecanismos de redução de volume.

**7. DESTINATÁRIOS**

Os destinatários poderão ser:

usuário;

conjunto de usuários;

responsável;

responsável pelo registro;

perfil;

equipe;

gestor;

supervisor;

unidade;

grupo;

interessados/followers.

O direcionamento deverá considerar:

**Responsabilidade → Ação → Prazo → Processo**

A hierarquia poderá considerar:

**Responsável específico → Equipe/Grupo → Unidade → Perfil/Permissão →
Regra configurada → Interessados**

**8. PERMISSÕES**

O recebimento de uma notificação nunca concede autorização.

Para executar uma ação, o usuário deverá possuir as permissões
necessárias, conforme o ADR-001.

Uma ação iniciada por:

notificação interna;

e-mail;

Push;

WhatsApp;

qualquer outro canal;

deverá passar pelas mesmas validações da operação executada diretamente
no SaaS.

**9. MUDANÇA DE RESPONSABILIDADE**

Quando o responsável de um processo for alterado:

futuras notificações deverão considerar o novo responsável;

histórico deverá preservar a responsabilidade anterior;

notificações já geradas não deverão perder sua rastreabilidade.

Escalonamento de comunicação não implica automaticamente transferência
de responsabilidade.

**10. ESCALONAMENTO**

O sistema poderá escalar notificações conforme:

prazo;

atraso;

criticidade;

impacto;

reincidência;

ausência de ação.

Exemplo:

**Responsável → Supervisor → Gestor**

O escalonamento deverá ser configurável e auditável.

**11. PREFERÊNCIAS DO USUÁRIO**

O usuário poderá configurar, dentro dos limites permitidos:

tipos de notificação;

canais;

frequência;

horários;

agrupamento;

resumos;

silenciamento temporário.

Preferências não poderão:

burlar permissões;

eliminar comunicações obrigatórias;

impedir alertas críticos quando estes forem definidos como obrigatórios;

alterar regras de negócio.

**12. CONFIGURAÇÃO ADMINISTRATIVA**

Poderão existir configurações por:

Tenant;

unidade;

processo;

grupo;

perfil;

usuário.

A hierarquia conceitual poderá seguir:

**Sistema → Tenant → Unidade → Processo/Grupo → Usuário**

Configurações mais específicas poderão complementar ou restringir
configurações gerais, desde que respeitem as regras obrigatórias.

**13. CANAIS**

O SaaS deverá possuir arquitetura preparada para múltiplos canais.

**13.1 Notificação interna**

É o canal fundamental do produto.

Deverá existir um Centro de Notificações com:

lidas/não lidas;

prioridade;

data/hora;

origem;

módulo;

registro relacionado;

ação necessária;

histórico.

**13.2 E-mail**

Canal para:

aprovações;

pendências;

alertas;

comunicações administrativas;

resumos;

situações relevantes.

**13.3 Push**

Especialmente relevante para:

dispositivos móveis;

Obra/Instalação;

campo;

ocorrências;

programação;

alertas operacionais.

**13.4 WhatsApp**

Canal complementar, mediante integração habilitada.

Poderá ser utilizado para determinadas comunicações operacionais ou
externas.

Não será dependência obrigatória do SaaS.

**13.5 SMS**

Canal complementar para situações justificadas pela necessidade
operacional.

Também não será dependência obrigatória do SaaS.

**14. ABSTRAÇÃO DE PROVEDORES**

A arquitetura deverá utilizar:

**SaaS → Serviço de Notificações → Canal → Provedor**

Os módulos não deverão conhecer o provedor específico.

A substituição ou inclusão de provedores deverá ser possível sem
alteração da lógica de negócio.

**15. FALLBACK**

Poderão existir mecanismos de fallback entre canais.

Exemplo:

**Push → E-mail → SMS**

O fallback deverá considerar:

prioridade;

criticidade;

tipo de evento;

preferência;

disponibilidade;

configuração;

custo;

regras do processo.

Não deverá ser aplicado indiscriminadamente.

**16. TEMPLATES**

As notificações deverão utilizar templates centralizados.

Templates poderão definir:

título;

conteúdo;

prioridade;

variáveis;

ação;

prazo;

processo relacionado;

link;

elementos específicos do canal.

O mesmo evento poderá possuir formatos diferentes por canal.

**17. VARIÁVEIS E PERSONALIZAÇÃO**

Templates poderão utilizar informações contextuais, como:

usuário;

empresa/unidade;

pedido;

ordem;

cliente;

fornecedor;

obra;

responsável;

prazo;

status;

prioridade;

data/hora.

A personalização deverá ser controlada.

Não poderá alterar:

regras de negócio;

permissões;

segurança;

informações obrigatórias.

**18. VERSIONAMENTO DOS TEMPLATES**

Templates deverão possuir, quando aplicável:

versão;

vigência;

histórico;

responsável pela alteração;

data/hora.

O sistema deverá identificar qual versão foi utilizada em determinada
comunicação.

Alterações futuras não poderão alterar retroativamente o histórico.

**19. PROCESSAMENTO ASSÍNCRONO**

Envios externos deverão ser processados preferencialmente de forma
assíncrona.

Fluxo:

**Evento → Notificação → Fila → Processamento → Provedor → Resultado**

Uma falha de um provedor externo não deverá bloquear indevidamente a
operação do módulo de origem.

**20. FILA E ESTADOS**

A fila poderá utilizar estados como:

Pendente;

Em processamento;

Enviando;

Enviada;

Entregue;

Falha;

Aguardando retry;

Cancelada;

Expirada.

**21. RETRY**

Falhas temporárias poderão gerar novas tentativas.

O sistema deverá:

controlar quantidade de tentativas;

controlar intervalos;

registrar cada tentativa;

evitar repetição infinita;

permitir tratamento posterior.

**22. IDEMPOTÊNCIA E DUPLICIDADE**

Cada comunicação deverá possuir identificação única.

O sistema deverá impedir duplicidades causadas por:

retry;

reprocessamento;

reinício de serviço;

repetição de evento;

concorrência.

Se o mesmo usuário for identificado por diferentes regras de
direcionamento, deverá receber apenas a comunicação necessária.

**23. FALHA PARCIAL**

A falha em um canal não deverá necessariamente impedir os demais.

Exemplo:

**Interno + Push + E-mail**

Se o E-mail falhar:

Interno poderá ser concluído;

Push poderá ser concluído;

E-mail permanecerá com seu próprio resultado.

**24. REPROCESSAMENTO**

Usuários autorizados poderão reprocessar notificações com falha.

O sistema deverá preservar:

tentativa original;

erro;

novo processamento;

resultado;

usuário que solicitou o reprocessamento.

**25. AGRUPAMENTO E CONTROLE DE VOLUME**

O sistema poderá agrupar eventos semelhantes.

Exemplo:

**15 itens abaixo do estoque mínimo**

em vez de 15 notificações individuais.

Poderão existir:

janelas de agrupamento;

digest;

resumos;

limites;

controles contra tempestades;

proteção contra loops.

Notificações críticas deverão ser tratadas de forma prioritária.

**26. LEMBRETES**

Pendências poderão gerar lembretes automáticos.

Quando a pendência for:

resolvida;

cancelada;

encerrada;

deixar de exigir ação;

os lembretes futuros deverão ser interrompidos.

A notificação não deverá substituir a pendência operacional.

**27. RECORRÊNCIA**

O sistema poderá gerar comunicações recorrentes, como:

resumo diário;

resumo semanal;

acompanhamento;

lembretes de rotina.

A recorrência deverá possuir:

periodicidade;

horário;

destinatários;

canal;

condição;

ativação/inativação.

**28. NOTIFICAÇÕES ACIONÁVEIS**

Quando uma notificação exigir ação, deverá indicar, sempre que possível:

**O que aconteceu → O que fazer → Quem deve agir → Prazo → Processo
relacionado**

Quando tecnicamente seguro, poderá permitir ações rápidas.

Toda ação deverá respeitar:

permissões;

regras de negócio;

estado atual;

concorrência;

auditoria.

**29. CONCORRÊNCIA**

Se dois usuários receberem uma mesma ação e um deles executá-la
primeiro, o segundo deverá receber informação de que o estado já foi
alterado.

O sistema não deverá permitir alterações baseadas em estado
desatualizado.

**30. SEGURANÇA E PRIVACIDADE**

Notificações deverão respeitar:

multi-tenancy;

permissões;

escopo organizacional;

minimização de dados;

privacidade;

segurança dos canais externos.

Possuir um link de notificação não significa possuir autorização para
acessar o registro.

A autorização deverá ser novamente validada pelo SaaS.

**31. DADOS SENSÍVEIS**

Quando necessário, a notificação deverá apresentar apenas um resumo.

Informações detalhadas deverão exigir acesso autenticado e autorizado ao
sistema.

Credenciais, tokens e informações técnicas de provedores nunca deverão
aparecer indevidamente nas notificações ou logs comuns.

**32. HISTÓRICO E AUDITORIA**

Deverá ser possível rastrear:

**Evento → Regra → Destinatário → Canal → Tentativa → Provedor →
Resultado**

O histórico deverá preservar:

origem;

destinatário;

canal;

template;

versão;

data/hora;

tentativas;

resultados;

erros;

reprocessamentos.

**33. INTEGRAÇÃO COM PROCESSOS**

As notificações deverão acompanhar os processos sem se tornar
proprietárias deles.

**Comercial/Pedidos**

Aprovações, alterações e pendências.

**Engenharia**

Revisões, aprovações e incompatibilidades.

**PCP/Produção**

Programação, atrasos, ocorrências e conclusão.

**Estoque**

Divergências, reservas e reposição.

**Suprimentos**

Aprovações, compras e recebimentos.

**Qualidade**

Inspeções, rejeições e não conformidades.

**Expedição**

Programações, carregamentos, entregas e ocorrências.

**Obra/Instalação**

Programação, equipe, ocorrências, pendências, conclusão e revisitas.

**Financeiro**

Vencimentos, títulos, pagamentos e pendências.

**Fiscal**

Documentos, eventos, rejeições e divergências.

**Integrações**

Falhas, indisponibilidade e reprocessamentos.

**Offline**

Sincronização, conflitos e operações pendentes.

**34. OFFLINE**

Notificações relacionadas a operações offline deverão distinguir:

**Registrado no dispositivo**

de

**Confirmado pelo servidor.**

Uma operação local não deverá ser apresentada como definitivamente
registrada no SaaS antes da sincronização e validação do servidor.

**35. ADMINISTRAÇÃO E MONITORAMENTO**

Deverá existir visão administrativa para acompanhamento de:

volume;

pendências;

falhas;

retries;

canais;

provedores;

notificações críticas;

filas;

reprocessamentos.

Filtros poderão incluir:

período;

Tenant;

unidade;

módulo;

processo;

usuário;

canal;

prioridade;

status.

**36. INDICADORES**

O sistema deverá permitir acompanhar, quando aplicável:

notificações geradas;

enviadas;

entregues;

falhas;

retries;

tempo de processamento;

volume por canal;

volume por módulo;

volume por usuário;

agrupamentos;

duplicidades evitadas;

notificações críticas.

Quando o canal permitir, poderão ser medidos:

abertura;

leitura;

interação;

ação realizada.

**37. MVP**

🟢 **Obrigatório**

Serviço central de notificações;

arquitetura orientada a eventos;

Centro de Notificações;

tipos;

prioridades;

direcionamento;

permissões;

preferências básicas;

templates;

variáveis;

versionamento;

fila;

processamento assíncrono;

retry;

idempotência;

histórico;

auditoria;

notificações acionáveis;

links para registros;

integração com os principais módulos;

E-mail;

Push;

monitoramento básico.

🟡 **MVP CONTROLADO**

WhatsApp;

SMS;

fallback;

digest;

agrupamento avançado;

escalonamento avançado;

recorrência avançada;

indicadores avançados de interação.

**WhatsApp e SMS não constituem dependência obrigatória para
funcionamento ou liberação do MVP.**

🔵 **PÓS-MVP**

novos canais;

inteligência para redução de ruído;

priorização dinâmica;

análise preditiva;

automações avançadas;

personalização avançada;

analytics avançado;

campanhas/comunicações avançadas;

novas integrações.

**38. CRITÉRIO PARA NOVOS CANAIS E FUNCIONALIDADES**

Toda nova funcionalidade deverá avaliar:

necessidade;

público;

frequência;

custo;

confiabilidade;

segurança;

rastreabilidade;

retry;

idempotência;

integração;

manutenção;

impacto no produto.

Toda nova notificação deverá responder:

Qual evento a origina?

Quem precisa saber?

Por que precisa saber?

Precisa de ação?

Qual prioridade?

Qual canal?

Precisa ser imediata?

Pode ser agrupada?

Pode ser recorrente?

Como será auditada?

O que acontece se falhar?

**39. DECISÕES ARQUITETURAIS OBRIGATÓRIAS**

A implementação deverá obrigatoriamente respeitar:

Serviço transversal de notificações.

Arquitetura orientada a eventos.

Desacoplamento entre módulos e canais.

Abstração dos provedores.

Multi-tenancy.

Integração com permissões do ADR-001.

Preferências configuráveis.

Comunicações obrigatórias protegidas contra supressão indevida.

Templates centralizados.

Versionamento.

Processamento assíncrono.

Filas.

Retry.

Idempotência.

Controle de duplicidade.

Controle de loops.

Agrupamento controlado.

Escalonamento.

Auditoria.

Histórico.

Segurança e minimização de dados.

Reprocessamento controlado.

Tratamento de concorrência.

Integração com processos sem apropriação da lógica de negócio.

Compatibilidade com operação offline.

Monitoramento.

Capacidade de evolução para novos canais.

Preservação da integridade e independência dos módulos.

**40. RELAÇÃO COM AS DEMAIS ADRs**

O ADR-007 deverá respeitar as decisões já aprovadas:

- **ADR-001 — Modelo de Permissões**

- **ADR-002 — Escopo do MVP**

- **ADR-003 — Cliente-Piloto**

- **ADR-004 — Estratégia Fiscal**

- **ADR-005 — Operação Offline**

- **ADR-006 — Modelo Comercial do SaaS**

Em caso de conflito, prevalecerá a hierarquia definida na Arquitetura
Mestre.

**41. HIERARQUIA DE REFERÊNCIA**

A implementação deverá respeitar:

**1. Arquitetura Mestre**\
↓\
**2. Escopo Geral**\
↓\
**3. ADRs aprovadas**\
↓\
**4. Especificações funcionais dos módulos**\
↓\
**5. Especificação técnica**\
↓\
**6. Contratos de API/Eventos**\
↓\
**7. Modelo de dados**\
↓\
**8. Implementação**

Nenhuma implementação local poderá contrariar uma decisão arquitetural
superior.

**42. PRINCÍPIO FINAL DO ADR-007**

**O sistema de notificações deverá ser transversal, orientado a eventos,
desacoplado, seguro, rastreável, resiliente e configurável, permitindo
comunicação eficiente e acionável sem transformar notificações em
dependência indevida dos processos de negócio.**

**43. STATUS FINAL**

**ADR:** 007\
**Título:** Canais de Notificação\
**Versão:** 1.0\
**Status:** APROVADO E FECHADO\
**Revisão:** CONCLUÍDA\
**Consolidação:** CONCLUÍDA

**Decisão final:**\
O SaaS adotará um serviço centralizado e transversal de notificações,
baseado em eventos, com múltiplos canais, preferências configuráveis,
direcionamento por responsabilidade, processamento assíncrono,
idempotência, retries, escalonamento, auditoria, segurança e capacidade
de evolução, tendo como canais fundamentais do MVP a notificação
interna, E-mail e Push, enquanto WhatsApp e SMS serão canais
complementares de adoção controlada.
