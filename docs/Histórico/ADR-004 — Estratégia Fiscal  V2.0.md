**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-004 — Estratégia Fiscal**

**Versão:** 2.0\
**Status:** APROVADO\
**Data:** 09/09/2026

**1. Objetivo**

Implementar a estratégia fiscal definida pelo ADR-004, tratando a
fiscalidade como uma **camada especializada e integrada ao SaaS**, sem
transformar o produto em uma engine tributária própria ou em um sistema
contábil.

A implementação deverá preservar integralmente as decisões do ADR-004 e
respeitar o limite do MVP definido pelo ADR-002.

**2. Princípio arquitetural obrigatório**

Implementar a seguinte arquitetura conceitual:

**Módulos do SaaS → Camada Fiscal → Provedor Fiscal**

Os módulos operacionais não deverão possuir dependência direta da
implementação específica do provedor fiscal.

A camada fiscal deverá funcionar como abstração entre o SaaS e os
provedores externos.

**3. Responsabilidades da camada fiscal**

A camada fiscal deverá ser responsável por:

receber dados dos módulos;

organizar os dados fiscais;

validar informações estruturais;

identificar o contexto fiscal da operação;

enviar dados ao provedor quando aplicável;

receber resultados;

registrar documentos e eventos;

apresentar informações aos usuários;

manter histórico;

manter rastreabilidade;

controlar estados;

tratar erros;

permitir reprocessamento;

relacionar documentos fiscais aos processos do SaaS.

Não implementar no SaaS uma engine tributária completa para substituir
um provedor especializado.

**4. Documentos e operações**

A arquitetura deverá suportar, conforme aplicabilidade:

NF-e;

NFS-e;

ISS;

operações de mercadorias;

operações de serviços;

operações combinadas de mercadorias e serviços.

Não assumir que uma operação de vidraçaria seja exclusivamente
mercadoria ou exclusivamente serviço.

Quando houver combinação de mercadoria e serviço, permitir a
**segregação e o rateio dos componentes da operação**, mantendo a
relação com a operação comercial e operacional de origem.

O tipo e a natureza do documento fiscal deverão ser identificáveis e
rastreáveis.

**5. Estrutura fiscal dos itens**

Separar:

**Dados operacionais/comerciais**

de

**Dados fiscais.**

A estrutura fiscal deverá suportar, conforme aplicabilidade:

NCM;

origem;

unidade fiscal;

códigos fiscais;

classificações específicas;

informações de mercadorias;

informações de serviços;

código/classificação municipal de serviço;

informações relacionadas ao ISS;

demais parâmetros fiscais;

vigência.

Permitir tratamento fiscal diferente para o mesmo item conforme o
contexto da operação.

Impedir utilização silenciosa de configuração fiscal incompleta ou
inconsistente quando ela for necessária ao processamento.

**6. Regime tributário**

A estrutura da empresa/estabelecimento deverá permitir:

regime tributário;

parâmetros fiscais;

vigência;

histórico.

O tratamento fiscal deverá considerar, quando aplicável:

**Empresa/Estabelecimento + Regime + Operação + Produto/Serviço +
Origem + Destino + Município + Demais parâmetros fiscais**

Não criar uma configuração tributária universal para todos os tenants.

**7. Provedor fiscal**

Implementar integração com provedor fiscal especializado por meio da
camada de abstração definida neste ADR.

A integração deverá permitir:

envio de dados;

recebimento de cálculo/resultados;

recebimento de documentos;

consulta de situação;

tratamento de erros;

reprocessamento;

registro do resultado.

O resultado recebido deverá permanecer vinculado à operação, documento e
processamento correspondente.

A arquitetura deverá permitir substituição ou inclusão futura de
provedores sem necessidade de reescrever os módulos operacionais.

**8. Recepção automática**

Implementar a distinção obrigatória:

**Recebimento ≠ Validação ≠ Conferência ≠ Aprovação**

Quando houver recepção automática, utilizar fluxo equivalente a:

**Recebimento → Registro → Validação → Conferência → Aprovação/Aceitação
ou Rejeição → Processamento**

Conforme aplicável, armazenar:

origem;

data/hora;

empresa/estabelecimento;

fornecedor/prestador;

documento;

itens;

valores;

informações fiscais;

vínculo com pedido/compra/operação;

situação atual.

Suportar estados como:

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

Utilizar somente estados aplicáveis ao tipo de documento e processo.

**9. Idempotência**

Toda integração fiscal deverá ser projetada para evitar duplicidade.

Implementar mecanismos de idempotência para documentos, eventos e
processamento.

Reprocessamentos não poderão:

duplicar documentos;

duplicar eventos;

perder histórico;

apagar rastreabilidade.

Registrar histórico de processamento, erros, tentativas,
reprocessamentos e resultados.

**10. Rastreabilidade**

Garantir rastreabilidade suficiente para identificar:

origem;

tenant;

empresa/estabelecimento;

operação;

documento;

usuário/processo responsável, quando aplicável;

data/hora;

dados utilizados;

resultado;

alterações;

erros;

reprocessamentos;

situação atual.

O documento fiscal deverá permanecer vinculado ao processo operacional
correspondente.

Não utilizar o documento fiscal como substituto do processo operacional.

**11. Integração com módulos**

Implementar contratos claros entre a camada fiscal e os módulos
necessários, incluindo conforme aplicabilidade:

Comercial;

Pedidos;

Estoque;

Suprimentos/Compras;

Expedição/Logística;

Obra/Instalação;

Financeiro;

Cadastros;

Configurações;

Usuários/Permissões.

Evitar regras fiscais duplicadas em diferentes módulos.

As regras fiscais deverão permanecer centralizadas na camada fiscal
sempre que apropriado.

**12. Escopo do MVP**

Implementar somente a capacidade fiscal necessária para que o piloto
execute adequadamente o fluxo real definido pelo ADR-002.

Conforme necessidade do piloto, o MVP poderá contemplar:

NF-e;

NFS-e;

ISS;

principais atributos fiscais;

regime tributário;

parâmetros da empresa/estabelecimento;

integração com provedor;

recepção automática;

validação;

conferência;

aprovação/aceitação;

rejeição;

divergências;

erros;

reprocessamento;

rastreabilidade;

vínculo documento ↔ operação.

Não expandir o MVP por interpretação da equipe de desenvolvimento.

**13. Funcionalidades fora do MVP**

Não implementar como requisito geral do MVP, salvo necessidade
comprovada:

cobertura de todos os documentos fiscais;

todos os cenários tributários;

automações fiscais avançadas;

múltiplos provedores simultâneos;

recursos fiscais especializados não necessários;

análises fiscais avançadas;

substituição de sistemas contábeis ou fiscais especializados.

**14. Segurança**

Aplicar as políticas gerais de segurança do SaaS:

isolamento por tenant;

controle de acesso;

menor privilégio;

rastreabilidade;

proteção dos dados;

integridade;

histórico;

prevenção de alterações indevidas.

Nenhum dado fiscal poderá atravessar o limite de um tenant.

Operações fiscais relevantes deverão ser auditáveis.

**15. Erros e exceções**

Falhas não poderão causar perda silenciosa de dados.

Implementar mecanismos para:

identificar o erro;

registrar a ocorrência;

apresentar o motivo;

permitir correção quando aplicável;

permitir nova tentativa;

permitir reprocessamento;

registrar o resultado.

Erros que afetem o fluxo operacional deverão possuir sinalização
adequada aos usuários responsáveis.

**16. Governança**

A implementação deverá respeitar:

ADR-001 — Usuários e Permissões;

ADR-002 — MVP e Escopo do Produto;

ADR-003 — Cliente-Piloto;

ADR-005 — Operação Offline;

ADR-007 — Notificações e Alertas;

ADR-008 — Plataforma do Aplicativo de Campo.

Nenhum módulo poderá criar estratégia fiscal conflitante com este ADR.

Alterações arquiteturais relevantes deverão ser formalmente avaliadas e,
quando necessário, gerar revisão ou novo ADR.

**17. Versionamento**

Preservar:

histórico das configurações fiscais;

vigência;

alterações;

processamento;

resultados;

erros;

reprocessamentos;

versões das integrações quando aplicável.

Não sobrescrever silenciosamente informações históricas.

**18. Critérios de aceite**

A implementação somente será considerada aderente ao ADR-004 se:

existir camada fiscal independente;

os módulos não dependerem diretamente do provedor;

NF-e e NFS-e puderem ser suportadas conforme escopo do MVP;

ISS puder ser tratado quando aplicável;

mercadoria e serviço puderem ser distinguidos;

operações combinadas puderem ser segregadas/rateadas;

itens possuírem estrutura fiscal separada;

empresa/estabelecimento possuir regime e parâmetros fiscais;

o provedor especializado puder executar os cálculos quando aplicável;

recebimento não equivaler automaticamente a aprovação;

documentos possuírem estados rastreáveis;

integrações forem idempotentes;

reprocessamento for possível;

erros forem registrados;

documentos forem vinculados às operações;

houver isolamento entre tenants;

o escopo fiscal respeitar o MVP do ADR-002;

não existir dependência arquitetural irreversível de um único provedor.

**19. Regra final de implementação**

**Não criar funcionalidades fiscais além das aprovadas neste ADR por
iniciativa da implementação.**

Quando surgir uma necessidade fiscal nova:

**Necessidade → Registro → Classificação → Análise → Decisão →
Implementação → Validação**

Se a necessidade alterar arquitetura, segurança, escopo do MVP,
integração ou outra decisão transversal, deverá ser formalmente avaliada
antes da implementação.

A implementação deverá preservar integralmente a estratégia definida no
**ADR-004 — Estratégia Fiscal, Versão 2.0 — APROVADO**.
