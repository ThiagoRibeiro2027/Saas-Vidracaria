**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-004 v2.1 — Estratégia Fiscal**

**Status:** APROVADO\
**Versão:** 2.1\
**Data:** 09/09/2026\
**Documento de origem:** ADR-004 — Estratégia Fiscal\
**Tipo:** Prompt Final de Implementação

**1. Objetivo**

Implementar a arquitetura e os recursos fiscais do SaaS conforme
definido no **ADR-004 v2.1**, mantendo a estratégia fiscal aprovada e
sem reabrir decisões já tomadas.

A implementação deverá permitir que o SaaS integre os processos fiscais
aos processos operacionais e financeiros, utilizando uma **camada fiscal
própria do SaaS integrada a provedores fiscais especializados**.

O SaaS **não deverá se transformar em um motor tributário próprio nem
substituir sistemas contábeis ou fiscais especializados**.

**2. Regra fundamental de implementação**

A implementação deverá seguir:

**Módulos do SaaS → Camada Fiscal → Provedor Fiscal Especializado**

Os módulos operacionais e financeiros não deverão possuir dependência
direta da implementação específica de um fornecedor fiscal.

A camada fiscal deverá funcionar como uma abstração entre o SaaS e o
provedor.

A solução deverá permanecer preparada para substituição ou inclusão de
provedores no futuro.

**3. Escopo fiscal do MVP**

O MVP deverá implementar **somente os cenários fiscais efetivamente
necessários para validar as operações reais da empresa-piloto JR Box
e/ou exigidos legalmente para essas operações**.

A arquitetura deverá estar preparada para:

NF-e;

NFS-e;

ISS;

operações com mercadorias;

operações com serviços;

operações combinadas de mercadorias e serviços.

Entretanto:

**Estar preparado arquiteturalmente para determinado cenário não
significa que esse cenário deverá ser desenvolvido no MVP.**

Não desenvolver cenários fiscais apenas porque a arquitetura suporta sua
existência.

Antes da implementação de cada cenário fiscal, verificar se ele:

ocorre na operação real da JR Box;

é necessário para o fluxo do MVP;

é uma obrigação legal aplicável;

possui justificativa concreta para sua inclusão.

Cenários não necessários deverão permanecer preparados para evolução
futura, mas fora da implementação efetiva do MVP.

**4. Camada Fiscal**

Criar uma camada fiscal responsável por:

organizar dados fiscais;

validar estrutura;

receber informações dos módulos;

enviar informações ao provedor;

receber resultados;

registrar documentos;

registrar eventos;

controlar estados;

apresentar erros;

permitir reprocessamento;

manter histórico;

manter rastreabilidade;

vincular documentos aos processos de origem;

controlar integração com provedores.

A camada fiscal deverá evitar que regras fiscais sejam duplicadas entre:

Comercial;

Pedidos;

Estoque;

Compras/Suprimentos;

Expedição;

Instalação;

Financeiro;

Cadastros.

**5. Provedor fiscal especializado**

O cálculo tributário especializado deverá ser realizado pelo provedor
fiscal definido para a implementação.

O SaaS deverá:

fornecer os dados necessários;

organizar as informações;

validar a estrutura;

enviar ao provedor;

receber o resultado;

registrar o resultado;

apresentar o resultado;

manter o vínculo com a operação;

registrar erros;

permitir reprocessamento;

manter histórico.

Não implementar um motor tributário próprio como substituição ao
provedor.

A integração deverá ser feita por meio da camada fiscal, e não
diretamente pelos módulos de negócio.

**6. Abstração do provedor**

Implementar uma abstração que permita que o restante do sistema
desconheça detalhes específicos do fornecedor.

A arquitetura deverá permitir:

substituição do provedor;

inclusão de novo provedor;

manutenção independente do fornecedor;

padronização das respostas;

tratamento uniforme de erros;

rastreabilidade independente do provedor.

É permitido iniciar o MVP utilizando apenas um provedor, desde que a
arquitetura de abstração seja preservada.

**7. Estrutura fiscal dos itens**

Produtos, materiais e serviços deverão possuir estrutura fiscal própria,
separada da estrutura comercial e operacional.

Quando aplicável, suportar informações como:

NCM;

origem;

unidade fiscal;

códigos fiscais;

classificação fiscal;

código municipal de serviço;

informações relacionadas ao ISS;

demais parâmetros fiscais necessários;

vigência das configurações.

A configuração fiscal deverá considerar o contexto da operação.

O mesmo item poderá possuir tratamento diferente conforme:

estabelecimento;

operação;

origem;

destino;

natureza da operação;

município;

regime tributário;

demais parâmetros aplicáveis.

O sistema não deverá assumir uma regra fiscal universal para todos os
clientes ou operações.

**8. Regime tributário**

O sistema deverá permitir armazenar, por empresa/estabelecimento:

regime tributário;

parâmetros fiscais;

vigência;

histórico das alterações.

O tratamento fiscal deverá considerar, quando aplicável:

**Estabelecimento + Regime + Operação + Item + Origem + Destino +
Município + demais parâmetros necessários.**

Alterações relevantes deverão preservar histórico e rastreabilidade.

**9. NF-e, NFS-e e ISS**

A arquitetura deverá suportar os conceitos necessários para:

**NF-e**

Documentos fiscais relacionados a mercadorias.

**NFS-e**

Documentos fiscais relacionados à prestação de serviços.

**ISS**

Informações e tratamentos relacionados à prestação de serviços sujeitos
ao ISS.

**Operações combinadas**

Quando uma operação possuir mercadorias e serviços, os componentes
deverão permanecer identificáveis e rastreáveis, permitindo a
segregação/apuração necessária pelo processo fiscal adotado.

A implementação concreta deverá ser limitada aos cenários efetivamente
necessários ao MVP.

**10. Recebimento automático de documentos**

Quando necessário e disponível no cenário do MVP, o sistema poderá
receber documentos fiscais automaticamente por meio de:

provedor fiscal;

SEFAZ;

município;

fonte autorizada aplicável.

A implementação deverá respeitar a seguinte regra:

**Recebimento automático não significa aprovação ou aceitação
automática.**

O fluxo deverá ser estruturado como:

**Recebimento → Registro → Validação → Conferência → Aprovação/Aceitação
ou Rejeição → Processamento**

O sistema deverá manter claramente a distinção entre:

documento recebido;

documento validado;

documento conferido;

documento aprovado;

documento rejeitado;

documento processado.

**11. Estados fiscais**

Implementar estrutura capaz de representar, conforme o
documento/processo:

pendente;

recebido;

validado;

aprovado;

rejeitado;

parcialmente aprovado;

divergente;

cancelado;

inutilizado;

em processamento;

erro.

Não assumir que todos os documentos utilizarão todos os estados.

Os estados efetivamente disponíveis deverão respeitar o tipo de
documento e o processo.

**12. Ausência de Pedido de Compra no MVP**

O módulo completo de Compras permanece **fora do MVP**, conforme
ADR-002.

Portanto, a implementação fiscal **não poderá depender da existência de
Pedido de Compra** para receber ou registrar um documento fiscal.

Durante o MVP, um documento fiscal recebido poderá estar vinculado a:

pedido;

necessidade de material;

outra operação do SaaS;

outro processo operacional aplicável;

ou permanecer sem vínculo operacional quando a aquisição tiver ocorrido
fora do SaaS.

Nesse último caso, o documento deverá poder permanecer:

**recebido/registrado → pendente de vínculo ou conferência**

sem impedir seu processamento fiscal quando necessário.

A ausência de Pedido de Compra não deverá bloquear o recebimento ou
registro de um documento fiscal necessário ao piloto.

Quando o módulo de Compras for implementado futuramente, poderá ser
acrescentado o vínculo específico com Pedido de Compra.

Essa evolução futura não deverá ser interpretada como ampliação do MVP
atual.

**13. Idempotência**

A implementação deverá impedir duplicidades decorrentes de:

recebimento repetido;

reprocessamento;

retry;

falha de comunicação;

eventos repetidos;

retorno duplicado do provedor;

processamento parcial.

Deverá existir mecanismo de identificação/idempotência adequado ao tipo
de operação.

O reprocessamento deverá preservar:

histórico;

tentativas;

erros;

resultados anteriores;

responsável;

data/hora;

estado atual.

O reprocessamento não poderá criar registros fiscais duplicados ou
apagar silenciosamente informações anteriores.

**14. Reprocessamento**

Operações fiscais que apresentarem erro deverão poder ser reprocessadas
quando tecnicamente aplicável.

O sistema deverá:

registrar o erro;

apresentar o motivo;

registrar a tentativa;

permitir correção quando necessária;

permitir novo processamento;

registrar o novo resultado;

preservar o histórico anterior.

Nenhuma falha deverá resultar em perda silenciosa do documento ou da
operação.

**15. Rastreabilidade fiscal**

Todo documento ou processo fiscal relevante deverá permitir identificar:

empresa/tenant;

estabelecimento;

operação de origem;

documento;

itens;

valores;

responsável;

usuário/processo responsável;

data/hora;

informações enviadas;

resultado recebido;

alterações relevantes;

erros;

tentativas;

reprocessamentos;

estado atual.

O documento fiscal deverá permanecer relacionado ao processo operacional
correspondente quando houver esse vínculo.

O documento fiscal **não substitui o processo operacional**.

**16. Integração com módulos**

A camada fiscal deverá possuir integração controlada com:

Comercial/Orçamentos;

Pedidos;

Estoque;

Suprimentos/Compras;

Expedição/Logística;

Obra/Instalação;

Financeiro;

Cadastros;

Configurações;

Usuários/Permissões.

As integrações deverão respeitar as responsabilidades de cada módulo.

Nenhum módulo deverá criar uma estratégia fiscal paralela ou conflitante
com a camada fiscal central.

A integração com Compras deverá permanecer compatível com o fato de que
o módulo completo de Compras está fora do MVP.

**17. Segurança e multi-tenant**

Toda informação fiscal deverá respeitar o isolamento entre empresas.

Implementar:

autorização no backend;

segregação por tenant;

controle por estabelecimento quando aplicável;

controle de acesso;

proteção dos documentos;

auditoria;

histórico;

integridade.

É proibido permitir acesso ou exposição de informações fiscais de outro
tenant.

Operações fiscais críticas deverão possuir registro de auditoria.

**18. Auditoria**

Registrar eventos relevantes, incluindo:

criação;

recebimento;

alteração;

validação;

aprovação;

rejeição;

cancelamento;

inutilização;

envio ao provedor;

resposta do provedor;

erro;

tentativa;

reprocessamento;

alteração de configuração fiscal;

alteração de vínculo;

ações administrativas relevantes.

A auditoria deverá permitir reconstruir o histórico da operação.

Alterações relevantes não deverão apagar silenciosamente o estado
anterior.

**19. Tratamento de erros**

Todo erro fiscal relevante deverá:

ser identificado;

possuir motivo quando disponível;

ser registrado;

ser apresentado de forma compreensível;

permitir ação corretiva quando aplicável;

permitir retry/reprocessamento quando possível;

preservar histórico.

Evitar mensagens genéricas que impossibilitem identificar a origem do
problema.

Erros críticos deverão possuir destaque adequado para impedir que o
usuário interprete a operação como concluída quando ela não estiver
concluída.

**20. Integridade**

A implementação deverá preservar a consistência entre:

documento fiscal;

operação;

itens;

valores;

estabelecimento;

cliente/fornecedor;

estoque;

financeiro;

demais processos vinculados.

Não permitir:

duplicidade silenciosa;

perda de documento;

vínculo incorreto sem identificação;

alteração fiscal sem histórico;

aprovação automática indevida;

informação fiscal incompleta sendo tratada como válida sem sinalização.

**21. Configurações fiscais**

As configurações fiscais deverão possuir:

contexto;

vigência;

histórico;

validação;

controle de acesso.

Não utilizar configurações fiscais incompletas ou incompatíveis
silenciosamente.

Quando uma informação obrigatória estiver ausente, o sistema deverá
indicar a pendência e impedir o processamento quando essa informação for
necessária para aquela operação.

**22. Fluxo de aprovação/conferência**

Quando o cenário exigir conferência humana, o sistema deverá permitir
que o usuário identifique:

documento;

origem;

operação;

itens;

valores;

divergências;

situação fiscal;

situação operacional;

pendências.

A aprovação deverá representar uma decisão explícita e rastreável.

Não considerar o simples recebimento do documento como aprovação.

**23. MVP e JR Box**

A implementação deverá utilizar as operações reais da **JR Box** como
referência para determinar o escopo fiscal efetivamente implementado no
piloto.

O objetivo é validar o produto em uma operação real, e não construir
cobertura fiscal completa antes do piloto.

Para cada funcionalidade fiscal proposta, classificar:

necessária ao piloto;

necessária por obrigação legal;

necessária à integridade do fluxo;

preparada para futuro;

fora do MVP.

Funcionalidades classificadas como apenas futuras não deverão ser
implementadas antecipadamente sem nova decisão formal.

**24. O que NÃO implementar no MVP**

Não implementar como parte do MVP, salvo se uma necessidade real e
formalmente justificada alterar o escopo:

cobertura completa de documentos fiscais;

todos os cenários tributários;

múltiplos provedores simultâneos;

automações fiscais avançadas;

análises fiscais avançadas;

relatórios fiscais avançados não necessários;

motor tributário próprio completo;

substituição de sistema contábil;

substituição de sistema fiscal especializado;

integração obrigatória com Pedido de Compra;

funcionalidades fiscais não necessárias à operação real da JR Box.

**25. Evolução futura**

A arquitetura deverá permitir evolução posterior para:

novos documentos;

novos cenários tributários;

novos provedores;

múltiplos provedores;

maior automação;

integrações adicionais;

integração fiscal específica com Compras;

relatórios avançados;

novos municípios;

novos estabelecimentos;

novas necessidades legais.

A existência dessa capacidade futura não autoriza sua implementação
antecipada no MVP.

**26. Dependências**

A implementação deverá respeitar:

- **ADR-001 — Usuários/Permissões**

- **ADR-002 — MVP e Escopo do Produto**

- **ADR-003 — Cliente-piloto**

- **ADR-005 — Offline**

- **ADR-007 — Notificações**

- **ADR-008 — Plataforma do aplicativo de campo**

Quando houver conflito entre uma implementação proposta e esses ADRs,
não assumir uma nova regra automaticamente.

O conflito deverá ser identificado e encaminhado para decisão formal.

**27. Governança e controle de escopo**

Não alterar silenciosamente as decisões do ADR-004.

Qualquer necessidade que amplie significativamente o escopo fiscal
deverá registrar:

decisão anterior;

nova necessidade;

motivo;

impacto funcional;

impacto técnico;

impacto no prazo;

impacto no MVP;

consequências;

responsável;

data;

nova versão do ADR quando aplicável.

O histórico das decisões deverá ser preservado.

**28. Regra de implementação**

A equipe de desenvolvimento deverá interpretar este documento como
**especificação derivada de uma decisão arquitetural já aprovada**.

Não utilizar este prompt para redesenhar a estratégia fiscal.

Não reabrir:

escolha da camada fiscal;

utilização de provedor especializado;

abstração do provedor;

separação entre documento fiscal e processo operacional;

distinção entre recebimento e aprovação;

necessidade de idempotência;

necessidade de rastreabilidade;

ausência de dependência de Pedido de Compra no MVP;

princípio de implementação fiscal limitada às necessidades reais do
piloto.

Essas decisões já estão aprovadas no ADR-004 v2.1.

**29. Critérios de aceite**

A implementação será considerada aderente quando:

existir uma camada fiscal independente dos módulos de negócio;

os módulos não dependerem diretamente do provedor fiscal;

existir abstração para o provedor;

o provedor especializado realizar os cálculos fiscais aplicáveis;

os cenários fiscais implementados forem somente os necessários ao
piloto;

NF-e/NFS-e/ISS puderem ser suportados arquiteturalmente;

mercadorias e serviços puderem ser tratados de forma estruturada;

configurações fiscais possuírem contexto e vigência;

o recebimento automático não representar aprovação automática;

documentos puderem ser recebidos sem Pedido de Compra durante o MVP;

documentos sem vínculo de compra puderem permanecer pendentes quando
necessário;

exista idempotência;

exista reprocessamento controlado;

exista rastreabilidade completa;

exista auditoria;

exista isolamento entre tenants;

erros fiscais sejam identificáveis e rastreáveis;

não exista perda silenciosa de documentos;

não exista dependência indevida de Compras;

a implementação não contenha funcionalidades fiscais avançadas sem
justificativa formal.

**30. Princípio final**

A implementação fiscal do SaaS deverá seguir:

**Fiscal integrado ao processo operacional, sustentado por uma camada
fiscal própria e por provedores especializados, com segurança,
rastreabilidade, idempotência e evolução controlada.**

E, para o MVP:

**Implementar somente o necessário para que a JR Box possa executar e
validar suas operações reais dentro do fluxo definido pelo produto, sem
transformar o MVP em um sistema fiscal completo.**

**Fim do Prompt Final de Implementação — ADR-004 v2.1**
