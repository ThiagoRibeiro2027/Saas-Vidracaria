**Prompt Final de Implementação — ADR-006 — Modelo Comercial**

**Versão:** 2.0\
**Status:** APROVADO\
**Data:** 09/09/2026\
**Responsável:** Product Owner

**1. Objetivo**

Implementar a arquitetura de **Modelo Comercial do SaaS**, conforme
definido no ADR-006 — Versão 2.0.

A implementação deverá separar claramente:

contratação;

estado comercial;

entitlements;

funcionalidades;

permissões de usuários;

regras de negócio;

Financeiro;

gateways/provedores de pagamento.

A implementação deverá ser genérica e multi-tenant, sem criar regras
específicas para uma empresa piloto.

**Este projeto é um SaaS independente e não possui relação com USIMETAL,
Consistem ou qualquer outro sistema empresarial citado fora deste
projeto.**

**2. Regra arquitetural principal**

Implementar a seguinte cadeia lógica:

**Tenant → Contratação → Plano/Módulos/Recursos contratados →
Entitlements → Funcionalidade → Usuário → Permissão → Regra de negócio**

Nenhuma camada deverá substituir outra.

**Regras obrigatórias**

Recurso não contratado não pode ser utilizado.

Permissão não pode liberar recurso não contratado.

Recurso contratado não concede automaticamente permissão a todos os
usuários.

Regras de negócio continuam independentes de contratação e autorização.

O frontend nunca será a autoridade final para controle comercial.

O backend deverá validar contratação/entitlement antes de operações
protegidas.

**3. Entidade de contratação**

Criar estrutura própria para representar a contratação do tenant.

A estrutura deverá suportar, conforme aplicável:

tenant;

plano;

módulos;

recursos;

período;

estado comercial;

trial;

datas relevantes;

histórico;

referências financeiras;

metadados necessários.

Não assumir que todos os tenants terão o mesmo conjunto de módulos ou
recursos.

**4. Ciclo de vida**

Implementar suporte aos seguintes estados:

- TRIAL

- ACTIVE

- PAST_DUE

- SUSPENDED

- CANCELED

- EXPIRED, quando aplicável.

As transições deverão ser centralizadas.

Não espalhar regras de estado comercial pelos módulos.

**PAST_DUE**

Não bloquear automaticamente.

Deverá existir suporte a período de tolerância configurável.

**SUSPENDED**

Representa restrição efetiva de acesso conforme política comercial.

A política de operações permitidas, restritas ou bloqueadas deverá ser
centralizada.

**CANCELED / EXPIRED**

Não apagar automaticamente dados operacionais, históricos, financeiros
ou de auditoria.

**Reativação**

Restabelecer recursos conforme contratação vigente sem reconstrução
manual de dados, configurações ou permissões.

**5. Entitlements**

Implementar uma camada explícita de **entitlements**, ou equivalente
funcional.

O entitlement deverá representar o direito comercial do tenant de
utilizar determinado módulo ou recurso.

Exemplos:

módulo Comercial;

módulo Financeiro;

módulo Qualidade;

funcionalidade específica;

recurso temporariamente disponibilizado durante trial.

**Não confundir**

**Contratação:** o que foi contratado.\
**Entitlement:** o que o tenant possui direito de utilizar.\
**Feature flag:** controle técnico de disponibilização.\
**Permissão:** quem pode utilizar.\
**Regra de negócio:** se a operação pode ser executada.

**6. Feature flags**

Permitir feature flags quando tecnicamente necessárias.

Entretanto:

feature flag não substitui entitlement;

feature flag não substitui autorização;

feature flag não deverá ser utilizada como mecanismo comercial isolado.

O frontend poderá utilizar flags para adaptar a interface, mas o backend
deverá permanecer como autoridade.

**7. Validação de acesso**

Para operações protegidas, validar no backend:

**Tenant → Estado comercial → Entitlement → Funcionalidade → Usuário →
Permissão → Regra de negócio**

A falha em uma condição obrigatória deverá impedir a operação.

Implementar proteção contra bypass por:

API;

alteração de parâmetros;

frontend;

URLs;

endpoints alternativos;

alteração indevida de permissões.

**8. Gateway e pagamentos**

Criar uma **camada de abstração de pagamentos**.

Não acoplar os módulos operacionais diretamente a um gateway.

O gateway será responsável por:

processamento;

cobrança;

métodos de pagamento;

aprovação;

recusa;

estorno;

chargeback;

eventos externos.

O SaaS será responsável por:

contratação;

interpretação dos eventos;

estado comercial;

entitlements;

histórico;

auditoria.

O gateway específico permanece como decisão futura.

**9. Webhooks e eventos externos**

Implementar processamento seguro e idempotente de eventos.

Todo evento relevante deverá permitir:

validação;

autenticação quando aplicável;

identificação da origem;

registro;

correlação com contratação;

processamento idempotente;

reprocessamento;

rastreabilidade.

Eventos duplicados não poderão produzir efeitos duplicados.

Um webhook não deverá alterar diretamente permissões ou módulos.

O fluxo deverá ser:

**Evento externo → Validação → Registro → Interpretação → Atualização da
contratação → Atualização dos entitlements/efeitos comerciais**

**10. Indisponibilidade do gateway**

Não suspender um tenant automaticamente apenas porque o gateway está
temporariamente indisponível.

Diferenciar:

falha de pagamento;

atraso no processamento;

indisponibilidade do provedor;

evento recebido;

estado efetivo da contratação.

Somente as regras internas de contratação poderão determinar mudança de
estado comercial.

**11. Trial e onboarding**

A arquitetura deverá suportar:

onboarding;

trial;

ativação;

encerramento.

O onboarding poderá contemplar:

criação/configuração da empresa;

administrador inicial;

configurações essenciais;

identificação dos recursos;

validações iniciais.

Não conceder permissões operacionais além das necessárias.

O trial deverá ser vinculado à contratação e possuir:

início;

término;

recursos disponibilizados;

regras de encerramento/conversão;

histórico.

**Não implementar valores ou condições comerciais definitivas que não
tenham sido decididos.**

**12. Integração com Financeiro**

Manter separação entre Comercial/Contratação e Financeiro.

**Contratação**

Controla:

plano;

módulos;

recursos;

estado comercial;

disponibilidade comercial.

**Financeiro**

Controla:

títulos;

obrigações;

cobranças;

recebimentos;

pagamentos;

situação financeira.

Manter vínculo rastreável:

**Tenant → Contratação → Cobrança/Documento financeiro →
Pagamento/Evento financeiro**

O Financeiro não deverá alterar diretamente:

permissões;

entitlements;

módulos;

regras operacionais.

Eventos financeiros poderão ser enviados à camada comercial para
interpretação.

**13. Suspensão e continuidade**

A implementação deverá impedir que suspensão, expiração ou cancelamento
causem perda de dados.

Considerar operações:

permitidas;

restritas;

bloqueadas;

somente consulta, quando aplicável.

Operações já iniciadas deverão ser tratadas de maneira a evitar:

perda de dados;

registros incompletos;

inconsistência;

perda de rastreabilidade.

A política deverá ser centralizada.

**14. Upgrade e downgrade**

Implementar arquitetura capaz de suportar:

**Upgrade**

inclusão de módulos;

inclusão de recursos;

alteração de plano;

aumento de limites, quando futuramente definido.

Novos entitlements deverão refletir a nova contratação.

Não exigir alteração manual de permissões apenas para disponibilizar um
recurso recém-contratado.

**Downgrade**

Controlar a retirada de recursos considerando:

operações em andamento;

dados existentes;

documentos;

histórico;

dependências;

obrigações aplicáveis.

Nunca apagar automaticamente dados históricos apenas porque um recurso
deixou de ser contratado.

**15. Dados históricos**

Preservar registros produzidos por funcionalidades anteriormente
contratadas, salvo regras legais ou de retenção específicas.

Quando aplicável, permitir acesso controlado em:

consulta;

histórico;

visualização;

outros mecanismos definidos posteriormente.

**16. Auditoria comercial**

Registrar alterações relevantes:

criação da contratação;

trial;

ativação;

alteração de plano;

inclusão/remoção de módulos;

alteração de recursos;

alteração de estado;

pagamentos;

falhas;

estornos;

chargebacks;

cancelamentos;

reativações;

suspensões.

Registrar, quando aplicável:

tenant;

contratação;

evento;

estado anterior;

novo estado;

recurso afetado;

data/hora do servidor;

origem;

usuário/processo;

referência externa;

motivo.

Não sobrescrever histórico de forma que impeça reconstruir a evolução da
contratação.

Utilizar o mecanismo geral de auditoria do SaaS.

**17. Multi-tenant**

Toda estrutura comercial deverá estar vinculada ao tenant correto.

Garantir isolamento no backend e na camada de dados.

Um tenant não poderá:

consultar contratação de outro;

consultar entitlements de outro;

utilizar recurso contratado por outro;

alterar contratação de outro;

influenciar o estado comercial de outro.

Respeitar integralmente a arquitetura de isolamento multi-tenant já
definida no projeto.

**18. Administração**

O administrador do tenant poderá consultar informações comerciais
conforme suas permissões.

Não poderá:

alterar arbitrariamente o estado comercial;

conceder recursos não contratados;

manipular entitlements diretamente;

contornar regras comerciais por permissões.

Intervenções administrativas excepcionais deverão possuir mecanismo
próprio e auditável.

**19. Offline**

Quando houver operação offline, o dispositivo não deverá ser autoridade
sobre:

contratação;

entitlements;

estado comercial;

suspensão;

reativação.

O servidor permanece como fonte oficial.

Respeitar integralmente o ADR-005.

**20. Integrações**

A implementação deverá manter baixo acoplamento entre:

Comercial;

Financeiro;

Fiscal;

Gateway;

Usuários/Permissões;

módulos operacionais;

Notificações.

Eventos poderão ser utilizados para integração, evitando dependências
diretas desnecessárias.

**21. Notificações**

Eventos comerciais poderão gerar notificações sobre:

vencimentos;

pagamentos;

falhas;

alterações de contratação;

suspensão;

reativação;

outros eventos relevantes.

A notificação não será responsável pela alteração do estado comercial.

Respeitar o ADR-007.

**22. MVP**

Implementar no MVP somente o necessário para validar o produto conforme
ADR-002.

A arquitetura deverá ser preparada para evolução futura, mas **não
implementar antecipadamente todas as funcionalidades comerciais
previstas para versões posteriores**.

Não transformar em requisito obrigatório do MVP:

planos comerciais completos;

múltiplos gateways;

todos os métodos de pagamento;

trial completo;

automações comerciais avançadas;

regras financeiras avançadas;

funcionalidades comerciais não necessárias ao piloto.

A implementação deverá preservar a arquitetura necessária para adicionar
esses recursos posteriormente.

**23. Decisões deliberadamente postergadas**

Não inventar ou definir durante a implementação:

preços;

planos definitivos;

quantidade de usuários por plano;

limites definitivos;

gateway específico;

métodos de pagamento definitivos;

duração do trial;

política definitiva de inadimplência;

regras definitivas de cancelamento;

regras definitivas de upgrade/downgrade;

estratégia comercial definitiva de onboarding;

metas comerciais ou financeiras.

Quando uma dessas definições for necessária, registrar como decisão
futura apropriada.

**24. Dependências**

Manter coerência com:

ADR-001 — Usuários e Permissões;

ADR-002 — MVP e Escopo do Produto;

ADR-003 — Cliente-Piloto;

ADR-004 — Estratégia Fiscal;

ADR-005 — Operação Offline;

ADR-007 — Notificações;

ADR-008 — Plataforma da Aplicação de Campo.

Não criar implementação que contradiga essas decisões.

**25. Versionamento e governança**

A implementação deverá preservar:

versão;

status;

data;

responsável;

histórico;

alterações;

decisões substituídas.

Não apagar silenciosamente decisões aprovadas.

Mudanças arquiteturais relevantes deverão gerar nova decisão formal.

**26. Critérios de aceite**

A implementação será considerada aderente ao ADR-006 quando:

☐ existir representação própria da contratação;

☐ existir ciclo de vida comercial controlado;

☐ estados comerciais forem centralizados;

☐ existir camada de entitlement;

☐ contratação e permissão estiverem separadas;

☐ backend validar disponibilidade comercial;

☐ houver proteção contra bypass;

☐ existir abstração para gateway;

☐ eventos de pagamento forem idempotentes;

☐ houver histórico comercial;

☐ houver auditoria;

☐ upgrade e downgrade forem arquiteturalmente suportados;

☐ dados históricos forem preservados;

☐ integração com Financeiro respeitar separação de responsabilidades;

☐ multi-tenancy estiver preservado;

☐ offline não puder definir estado comercial;

☐ notificações não forem autoridade comercial;

☐ MVP não seja expandido indevidamente;

☐ decisões postergadas não sejam inventadas durante implementação.

**27. Regra final de implementação**

**Implementar o ADR-006 como uma camada comercial centralizada,
multi-tenant, auditável e desacoplada, na qual contratação determina
disponibilidade comercial, entitlements representam direitos do tenant,
permissões determinam o acesso individual, regras de negócio validam
operações, Financeiro controla informações financeiras e gateways
processam pagamentos.**

**Não redesenhar o modelo comercial nem introduzir decisões não
aprovadas. Implementar somente as definições estabelecidas neste ADR e
preservar explicitamente todas as decisões deliberadamente
postergadas.**
