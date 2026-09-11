**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-004 — Estratégia Fiscal e Documentos Fiscais**

**Versão 2.2**

Implemente o **ADR-004 v2.2** do SaaS industrial, respeitando
integralmente os ADRs já aprovados e consolidados do projeto.

Este prompt representa a especificação técnica derivada do ADR-004 v2.2.

**Não altere decisões definidas em outros ADRs.**

**1. OBJETIVO**

Implementar a fundação fiscal do SaaS de forma:

desacoplada;

segura;

multi-tenant;

auditável;

rastreável;

idempotente;

preparada para futura integração com provedores fiscais.

**REGRA FUNDAMENTAL DO MVP**

Durante o primeiro piloto da **JR Box**, o faturamento permanecerá no
sistema atualmente utilizado pela empresa.

Portanto:

**O SaaS NÃO deverá emitir documentos fiscais reais durante o primeiro
piloto.**

A emissão fiscal real não é requisito para liberar o MVP.

**2. ESCOPO DO MVP**

Implementar:

estrutura fiscal;

cadastro/registro de documentos fiscais;

identificação do tipo de documento;

associação com operações internas;

estados de processamento;

auditoria;

rastreabilidade;

idempotência;

reprocessamento;

isolamento por tenant;

camada de integração;

abstração de provedor fiscal.

**NÃO implementar como requisito do piloto:**

emissão real de NF-e;

emissão real de NFS-e;

emissão real de outros documentos fiscais;

cancelamento fiscal real;

inutilização fiscal real;

transmissão fiscal de produção;

dependência de certificado digital para emissão;

substituição do sistema fiscal atualmente utilizado pela JR Box.

**3. ARQUITETURA DA CAMADA FISCAL**

Criar uma camada fiscal independente dos módulos:

Comercial;

Pedidos;

Engenharia;

PCP;

Produção;

Estoque;

Compras;

Financeiro.

Os módulos operacionais não devem implementar diretamente:

comunicação com SEFAZ;

comunicação com prefeituras;

comunicação com provedores fiscais;

armazenamento de credenciais fiscais;

regras específicas de um provedor.

Toda comunicação fiscal futura deverá passar pela camada fiscal.

**4. ABSTRAÇÃO DE PROVEDOR**

Criar uma interface/contrato de integração fiscal.

O domínio do sistema não poderá depender diretamente de:

API específica de fornecedor;

SDK específico;

formato proprietário;

credenciais específicas;

implementação exclusiva de um provedor.

A arquitetura deve permitir a substituição do provedor sem reconstrução
dos módulos operacionais.

**5. MODELO DE DOCUMENTO FISCAL**

Criar estrutura capaz de representar documentos fiscais.

Considerar, no mínimo:

- tenant_id;

- tipo do documento;

- identificador interno;

- identificador externo;

- chave/identificador fiscal, quando aplicável;

- origem operacional;

- status;

- datas relevantes;

- provedor;

- referência do processamento;

- dados fiscais;

- arquivo/documento, quando aplicável;

- informações de erro/rejeição;

- timestamps;

- informações de auditoria.

O modelo não deve assumir que todo documento fiscal possui Pedido de
Compra.

**6. RECEPÇÃO DE DOCUMENTOS FISCAIS**

Permitir que um documento fiscal recebido possa:

ser vinculado a um Pedido de Compra;

ser vinculado a uma necessidade de material;

ser vinculado a outra operação interna;

permanecer temporariamente sem vínculo;

permanecer pendente para classificação posterior.

A ausência de Pedido de Compra **não pode impedir a recepção do
documento fiscal**.

**7. RECEPÇÃO NÃO É APROVAÇÃO**

O recebimento de um documento fiscal não deve representar
automaticamente:

aprovação;

aceite do material;

aceite financeiro;

reconhecimento da obrigação;

encerramento da compra.

Separar os estados e responsabilidades.

Quando aplicável, suportar estados como:

recebido;

pendente;

em conferência;

aprovado;

rejeitado;

processado;

erro;

reprocessamento.

Não criar estados redundantes sem justificativa de domínio.

**8. IDEMPOTÊNCIA**

Todo processamento fiscal deve ser idempotente.

Retries, timeouts, reenvios ou reprocessamentos não podem criar:

documentos duplicados;

eventos duplicados;

lançamentos duplicados;

vínculos duplicados.

Definir chaves de idempotência apropriadas para cada operação.

A idempotência deve ser garantida no nível persistente quando
necessário, e não apenas por validação no frontend.

**9. REPROCESSAMENTO**

Implementar mecanismo seguro de reprocessamento.

Cada tentativa deve preservar:

histórico;

data/hora;

usuário ou processo responsável;

motivo;

retorno;

erro;

resultado.

O reprocessamento não pode apagar ou sobrescrever o histórico anterior.

**10. AUDITORIA**

Registrar eventos fiscais relevantes.

A auditoria deve permitir identificar:

tenant;

documento;

operação;

usuário/processo;

ação;

data/hora;

provedor;

tentativa;

retorno;

erro/rejeição;

alteração de estado;

reprocessamento.

**Segurança dos logs**

Nunca registrar em logs:

senha;

token;

chave secreta;

certificado privado;

credencial fiscal;

segredo de integração.

**11. MULTI-TENANCY E SEGURANÇA**

Toda informação fiscal deve respeitar integralmente o isolamento por
tenant definido nos ADRs de arquitetura.

Aplicar:

- tenant_id;

- RLS;

- permissões;

- catálogo de entitlements;

- menor privilégio;

- auditoria.

Nenhum usuário, processo ou consulta poderá acessar documentos fiscais
de outro tenant.

**12. CREDENCIAIS E CERTIFICADOS**

Preparar a arquitetura para futura utilização de certificados digitais e
credenciais fiscais.

Não armazenar certificados ou segredos:

em campos comuns expostos;

no frontend;

em logs;

em variáveis acessíveis indevidamente ao cliente;

em estruturas sem proteção adequada.

A emissão real somente será implementada posteriormente.

**13. REGRA ESPECÍFICA DA JR BOX**

Implementar explicitamente a seguinte regra:

Durante o primeiro piloto da JR Box, o faturamento e a emissão fiscal
permanecerão no sistema atualmente utilizado pela empresa.

Consequentemente:

o SaaS não emitirá NF-e real;

o SaaS não emitirá NFS-e real;

o SaaS não substituirá o sistema fiscal atual;

o fluxo operacional não poderá depender da emissão fiscal;

uma operação do MVP não poderá ficar bloqueada por ausência de
integração fiscal de produção.

**14. PREPARAÇÃO PARA FUTURA EMISSÃO**

A arquitetura deve permitir futura implementação de:

NF-e;

NFS-e;

outros documentos fiscais;

consulta de situação;

autorização;

rejeição;

cancelamento;

inutilização;

eventos fiscais;

armazenamento;

reprocessamento.

Essas funcionalidades não devem ser implementadas como requisito de
produção do piloto.

**15. PARAMETRIZAÇÃO FISCAL**

Preparar o sistema para futura parametrização de:

regime tributário;

município;

natureza da operação;

produtos;

serviços;

códigos fiscais;

tributos;

séries;

ambiente;

provedor;

certificados;

demais parâmetros fiscais.

Não transformar as regras fiscais da JR Box em regras universais do
SaaS.

Não assumir que uma configuração fiscal válida para um tenant será
válida para outro.

**16. EVOLUÇÃO REGULATÓRIA**

A camada fiscal deverá ser projetada para evolução.

Não espalhar regras tributárias rígidas pelos módulos operacionais.

Mudanças futuras de:

leiautes;

tributos;

documentos;

APIs;

provedores;

regras de validação;

deverão poder ser absorvidas preferencialmente na camada fiscal.

**17. FLUXO MÍNIMO DO DOCUMENTO FISCAL**

Implementar um fluxo coerente com:

**Recepção → Identificação → Associação/Classificação → Conferência →
Resultado**

O documento poderá permanecer sem vínculo ou pendente quando não houver
informação suficiente para sua classificação.

Nenhum processo deverá presumir automaticamente que:

Documento recebido = documento aprovado = obrigação financeira
reconhecida.

Esses conceitos devem permanecer separados.

**18. CRITÉRIOS DE ACEITE**

A implementação será considerada concluída quando:

existir camada fiscal desacoplada;

existir abstração de provedor;

existir modelo de documento fiscal;

documentos puderem ser recebidos sem Pedido de Compra;

recepção e aprovação forem distintas;

houver idempotência;

houver reprocessamento;

houver auditoria;

houver isolamento por tenant;

credenciais e certificados estiverem protegidos;

informações sensíveis não aparecerem nos logs;

o fluxo operacional da JR Box não depender de emissão fiscal;

não houver emissão fiscal real obrigatória no piloto;

a arquitetura estiver preparada para futura NF-e/NFS-e.

**19. TESTES OBRIGATÓRIOS**

Criar testes para validar, no mínimo:

**Multi-tenant**

usuário não acessa documento de outro tenant;

RLS impede acesso indevido;

operações administrativas respeitam escopo.

**Idempotência**

mesma operação processada duas vezes não duplica documento;

retry não duplica evento;

reprocessamento mantém histórico.

**Recepção**

documento com Pedido de Compra;

documento sem Pedido de Compra;

documento pendente;

documento rejeitado;

documento aprovado após conferência.

**Auditoria**

criação registrada;

alteração de estado registrada;

reprocessamento registrado;

usuário/processo identificado.

**Segurança**

segredos não aparecem nos logs;

credenciais não são expostas no frontend;

acesso não autorizado é bloqueado.

**JR Box**

fluxo operacional funciona sem emissão fiscal;

nenhuma etapa do MVP exige transmissão fiscal real;

faturamento permanece externo ao SaaS.

**20. NÃO REGRESSÃO**

A implementação deste ADR não poderá:

alterar regras de outros ADRs;

tornar Compras obrigatório para recepção fiscal;

tornar emissão fiscal obrigatória para pedidos;

tornar emissão fiscal obrigatória para o piloto;

criar dependência de um único provedor;

eliminar rastreabilidade;

permitir acesso fiscal entre tenants;

introduzir regras tributárias específicas da JR Box no núcleo global do
produto.

Caso seja identificado conflito com outro ADR aprovado:

**não escolher uma interpretação unilateral.**

Registrar o conflito e interromper a implementação daquele ponto até
definição da decisão arquitetural.

**21. REGRA FINAL**

O objetivo desta implementação é construir a **fundação fiscal
correta**, e não antecipar a emissão fiscal de produção.

**Durante o piloto:**

**Operação no SaaS → SIM**

**Faturamento no SaaS → NÃO**

**Emissão fiscal pelo SaaS → NÃO**

**Sistema fiscal atual da JR Box → SIM**

**Futuramente:**

**Fundação fiscal → já preparada**

**Integração com provedor → etapa posterior**

**NF-e/NFS-e → etapa posterior, conforme cenário fiscal real**

**INSTRUÇÃO AO IMPLEMENTADOR**

Antes de iniciar a implementação:

leia o ADR-004 v2.2;

leia os demais ADRs aprovados;

identifique dependências;

verifique conflitos;

não invente regras fiscais;

não amplie o escopo do MVP;

implemente somente o que está definido;

registre qualquer decisão necessária que não esteja especificada.

**Não transformar preparação arquitetural em emissão fiscal de
produção.**

**Não utilizar a JR Box como justificativa para criar regras fiscais
permanentes no núcleo do SaaS.**
