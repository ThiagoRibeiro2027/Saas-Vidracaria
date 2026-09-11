**ADR-004 — ESTRATÉGIA FISCAL**

**Projeto:** SaaS Industrial\
**Versão:** 1.0\
**Status:** APROVADO E FECHADO\
**Natureza:** Decisão Arquitetural\
**Prioridade:** Obrigatória para implementação

**1. OBJETIVO**

Definir a estratégia arquitetural, funcional e operacional para
tratamento das questões fiscais no SaaS Industrial.

A estratégia deverá permitir que o sistema:

suporte os processos fiscais essenciais;

seja parametrizável;

acompanhe a evolução das regras;

mantenha rastreabilidade;

preserve históricos;

integre-se a ambientes e provedores fiscais;

mantenha separação entre responsabilidades fiscais, operacionais e
financeiras;

seja seguro e multi-tenant;

permita evolução sem dependência estrutural de um único fornecedor.

**2. PRINCÍPIO ARQUITETURAL CENTRAL**

O Fiscal será tratado como uma camada/domínio especializado, integrado
aos demais módulos, mas sem assumir suas responsabilidades.

A separação conceitual será:

Operação empresarial\
↓\
Determinação/Tratamento Fiscal\
↓\
Documento Fiscal\
↓\
Comunicação Fiscal\
↓\
Registro, Eventos e Rastreabilidade

Os módulos operacionais fornecem o contexto da operação.

O domínio fiscal processa e registra os aspectos fiscais.

**3. RESPONSABILIDADE POR DOMÍNIO**

|                 |                                          |
|:---------------:|------------------------------------------|
|   **Domínio**   | **Responsabilidade**                     |
|    Comercial    | Operação comercial                       |
|     Pedidos     | Pedido e seus estados                    |
|   Suprimentos   | Compra e processo de recebimento         |
|     Estoque     | Efeitos físicos sobre materiais/produtos |
|    Produção     | Execução produtiva                       |
|    Qualidade    | Inspeção e conformidade                  |
|    Expedição    | Separação, conferência e expedição       |
| Obra/Instalação | Execução no local                        |
|   Financeiro    | Efeitos financeiros                      |
|     Fiscal      | Documentos, eventos e aspectos fiscais   |
|   Integrações   | Comunicação/orquestração externa         |

O Fiscal não deverá duplicar ou substituir a fonte de verdade de outros
domínios.

**4. DOCUMENTOS FISCAIS**

O MVP terá como principal documento eletrônico fiscal a NF-e, dentro do
escopo definido.

A arquitetura deverá estar preparada para suportar futuramente outros
documentos e modelos fiscais.

Deverão ser contemplados, conforme aplicabilidade:

emissão;

recepção;

consulta;

validação;

autorização;

rejeição;

cancelamento;

inutilização;

eventos;

manifestação;

contingência;

consulta de status;

reprocessamento.

**5. DOCUMENTO FISCAL ≠ PROCESSO OPERACIONAL**

Fica estabelecida como regra arquitetural:

Documento fiscal não é sinônimo de operação física ou financeira.

Exemplos:

NF de entrada ≠ recebimento físico;

NF de entrada ≠ entrada automática no estoque;

NF de saída ≠ expedição;

NF de saída ≠ entrega;

entrega ≠ aceitação da obra;

documento fiscal ≠ lançamento financeiro automático.

Os efeitos deverão ser processados pelos respectivos domínios.

**6. RECEPÇÃO AUTOMÁTICA DE DOCUMENTOS**

O sistema deverá estar preparado para receber automaticamente documentos
fiscais, especialmente documentos de entrada.

Fluxo conceitual:

Ambiente fiscal/Provedor\
→ Recepção automática\
→ SaaS\
→ Conferência\
→ Processamento operacional

A recepção automática não significa aprovação automática.

O operador deverá ser informado da existência do documento e das ações
eventualmente necessárias.

**7. CONFERÊNCIA E DIVERGÊNCIAS**

Documentos recebidos deverão poder ser relacionados a:

fornecedor;

pedido;

itens;

materiais;

recebimento;

qualidade;

estoque;

financeiro.

Deverão ser identificadas divergências como:

quantidade;

item;

preço;

fornecedor;

pedido inexistente;

material não cadastrado;

duplicidade;

recebimento parcial;

material pendente;

material rejeitado;

divergência fiscal;

outras inconsistências.

Documentos divergentes ou pendentes não deverão ser descartados.

**8. CONFIGURAÇÃO FISCAL**

A configuração fiscal deverá ser contextual e poderá considerar:

Tenant\
→ Estabelecimento\
→ Operação\
→ Item/Material\
→ Origem/Destino\
→ Contexto fiscal

Nem toda configuração necessariamente existirá em todos os níveis.

As informações fiscais poderão envolver:

empresa/estabelecimento;

cliente;

fornecedor;

produto;

material;

operação;

origem/destino;

finalidade;

características fiscais;

quantidades;

valores;

demais fatores necessários.

**9. CONFIGURAÇÃO ≠ REGRA FISCAL**

Fica estabelecida uma separação clara entre:

Configuração do cliente

e

Regra fiscal do sistema/legislação aplicável.

O sistema deverá permitir parametrização, mas não deverá tratar uma
configuração feita pelo usuário como prova de correção jurídica ou
tributária.

O cliente, seu contador ou responsável fiscal permanecem responsáveis
pela adequação das informações.

**10. VERSIONAMENTO E VIGÊNCIA**

Informações e regras fiscais relevantes deverão suportar:

versionamento;

data de vigência;

histórico;

auditoria;

alterações futuras.

Alterações futuras deverão afetar novas operações conforme sua vigência.

Não poderão reescrever resultados fiscais históricos.

**11. EMISSÃO FISCAL**

Fluxo conceitual:

Operação autorizada\
→ Preparação fiscal\
→ Validação\
→ Solicitação de emissão\
→ Processamento externo\
→ Retorno\
→ Atualização do documento\
→ Registro do evento

O sistema deverá distinguir claramente:

processamento;

autorizado;

rejeitado;

erro de validação;

erro técnico;

indisponibilidade;

contingência.

**12. CANCELAMENTO, INUTILIZAÇÃO E EVENTOS**

Cancelamento será tratado como evento fiscal próprio.

O documento original permanecerá preservado.

Também deverão possuir registros próprios, quando aplicáveis:

inutilização;

Carta de Correção;

manifestação;

ciência;

confirmação;

desconhecimento;

operação não realizada;

demais eventos suportados.

Cada evento deverá manter:

identificação;

data/hora;

status;

origem;

usuário/processo;

protocolo, quando existente;

histórico;

tentativas de processamento.

**13. CONTINGÊNCIA**

A arquitetura deverá permitir tratamento de indisponibilidade fiscal ou
do provedor.

Deverá ser possível:

identificar indisponibilidade;

registrar tentativas;

utilizar mecanismos de contingência suportados;

controlar documentos em contingência;

regularizar posteriormente;

sincronizar;

impedir duplicidade;

manter rastreabilidade.

**14. IDEMPOTÊNCIA E REPROCESSAMENTO**

Processamentos fiscais deverão ser idempotentes.

Uma mesma informação não poderá gerar duplicadamente:

documento;

recebimento;

entrada de estoque;

título financeiro;

evento.

Falhas técnicas deverão permitir reprocessamento controlado, sem
necessidade de recriação manual da operação.

**15. ARMAZENAMENTO E XML**

Cada documento fiscal deverá possuir um registro fiscal estruturado.

Quando disponível, o XML oficial deverá ser armazenado de forma segura e
associado ao documento.

O sistema deverá preservar:

XML original;

metadados;

protocolos;

eventos;

status;

histórico;

vínculos operacionais.

O XML oficial não deverá ser alterado pelo SaaS.

Representações visuais, como DANFE, não substituem o XML.

**16. RASTREABILIDADE**

A rastreabilidade deverá ser bidirecional.

Exemplo de entrada:

Documento Fiscal\
→ Pedido\
→ Recebimento\
→ Qualidade\
→ Estoque\
→ Financeiro

E também:

Material\
→ Lote\
→ Documento Fiscal de origem

Para saída:

Pedido\
→ Expedição\
→ Documento Fiscal\
→ Transporte\
→ Obra/Instalação

Em operações parciais, deverá ser possível identificar exatamente qual
parcela originou cada documento.

**17. INTEGRAÇÃO COM ESTOQUE E FINANCEIRO**

O documento fiscal poderá gerar eventos para outros módulos, mas não
assumirá suas responsabilidades.

Exemplo:

NF recebida\
→ Fiscal registra documento\
→ Suprimentos confere recebimento\
→ Qualidade avalia, quando aplicável\
→ Estoque registra efeito físico\
→ Financeiro registra efeito financeiro

Cada etapa mantém seu próprio domínio e histórico.

**18. CONCILIAÇÃO**

O sistema deverá permitir identificar divergências entre:

Fiscal × Operacional × Estoque × Financeiro

Exemplos:

NF de 100 unidades × recebimento de 90;

NF de R\$ 50.000 × pedido de R\$ 48.000;

documento cancelado × título financeiro ainda aberto;

item fiscal × item cadastrado;

quantidade expedida × quantidade faturada.

As divergências deverão gerar pendências ou alertas para tratamento.

**19. SEGURANÇA E PERMISSÕES**

O acesso fiscal seguirá o modelo estabelecido no ADR-001:

Usuário → Perfil → Permissões

As permissões poderão controlar:

consulta;

XML;

download;

emissão;

cancelamento;

inutilização;

eventos;

reprocessamento;

configurações;

escopo por estabelecimento/unidade.

Será aplicado o princípio do menor privilégio.

**20. AUDITORIA**

Operações fiscais relevantes deverão possuir auditoria.

Devem ser rastreáveis, conforme aplicável:

usuário;

tenant;

data/hora;

documento;

operação;

origem;

resultado;

alterações;

justificativa;

tentativas;

retorno externo.

O histórico fiscal não poderá ser livremente apagado ou alterado.

**21. MULTI-TENANT**

Todos os dados fiscais deverão respeitar o isolamento entre tenants:

documentos;

XMLs;

eventos;

arquivos;

configurações;

logs;

auditoria;

integrações;

processamento assíncrono.

Nenhum tenant poderá acessar dados fiscais de outro.

**22. ALERTAS E PENDÊNCIAS**

O sistema deverá possuir uma visão centralizada das pendências fiscais.

Exemplos:

documento novo;

aguardando conferência;

rejeitado;

erro técnico;

processamento pendente;

contingência;

divergência;

evento pendente;

falha de integração;

necessidade de reprocessamento.

As pendências poderão possuir prioridade:

Crítica;

Alta;

Média;

Baixa.

Deverão registrar responsável, histórico e tempo de tratamento.

**23. MONITORAMENTO FISCAL**

O MVP deverá disponibilizar indicadores básicos, incluindo, conforme
aplicável:

documentos recebidos;

emitidos;

autorizados;

rejeitados;

cancelados;

pendentes;

divergentes;

em contingência;

com erro.

Não faz parte do MVP construir uma plataforma avançada de inteligência
fiscal.

**24. CONTADOR E RESPONSABILIDADE FISCAL**

O SaaS deverá permitir participação controlada do contador ou
responsável fiscal.

Poderá fornecer:

consulta;

conferência;

relatórios;

acompanhamento;

análise de pendências;

apoio à configuração.

Entretanto:

O SaaS não substitui o contador nem assume responsabilidade profissional
pela interpretação tributária específica do cliente.

O cliente permanece responsável pela correção das informações e
configurações fornecidas.

**25. PROVEDOR FISCAL**

A arquitetura adotará:

SaaS\
→ Camada Fiscal\
→ Provedor\
→ Ambiente Fiscal

O MVP poderá utilizar um único provedor especializado.

Entretanto, o núcleo do SaaS não poderá depender estruturalmente de sua
implementação.

A arquitetura deverá permitir:

substituição;

inclusão de outro provedor;

migração;

preservação do histórico;

identificação do provedor utilizado em cada processamento.

**26. CONTRATO INTERNO FISCAL**

O SaaS deverá possuir um modelo/contrato fiscal interno padronizado.

Os módulos internos não deverão depender diretamente da API ou
particularidades de um provedor.

A camada fiscal fará a tradução entre:

modelo interno do SaaS\
↔\
modelo do provedor.

**27. ESCOPO DO MVP**

🟢 **Obrigatório**

configuração fiscal básica;

NF-e;

emissão;

recepção automática;

XML;

registro estruturado;

autorização;

rejeição;

cancelamento;

eventos essenciais;

inutilização quando aplicável;

contingência quando aplicável;

reprocessamento;

idempotência;

conferência;

divergências;

rastreabilidade;

integração operacional;

integração financeira;

segurança;

auditoria;

alertas;

indicadores básicos.

🟡 **Controlado**

manifestações;

eventos adicionais;

operações especiais;

cenários menos frequentes;

documentos complementares;

relatórios fiscais mais elaborados;

integração mais profunda com contador;

cenários fiscais complexos de múltiplos estabelecimentos.

🔵 **Pós-MVP**

cobertura ampla de documentos fiscais;

motor tributário altamente sofisticado;

automações fiscais avançadas;

integração contábil completa;

múltiplos provedores simultâneos;

EDI avançado;

análises fiscais avançadas;

cenários especializados de alta complexidade.

**28. CRITÉRIO PARA EVOLUÇÃO FISCAL**

Novas funcionalidades deverão ser avaliadas considerando:

necessidade real;

relevância operacional;

relevância comercial;

legislação aplicável;

viabilidade técnica;

segurança;

manutenção;

compatibilidade arquitetural;

benefício × complexidade.

Alterações legalmente obrigatórias terão tratamento prioritário.

**29. COMPATIBILIDADE ARQUITETURAL**

O ADR-004 é compatível com:

Arquitetura Mestre;

Escopo do Projeto;

ADR-001 — Usuários/Permissões;

ADR-002 — Escopo do MVP;

ADR-003 — Cliente-Piloto;

T13 — Integrações;

T6 — Estoque;

T7 — Suprimentos;

T9 — Expedição;

T10 — Comercial;

T11 — Financeiro;

T14 — Usuários/Permissões;

T15 — Configurações.

Nenhuma decisão deste ADR altera a fonte de verdade dos demais domínios.

**30. DECISÕES ARQUITETURAIS OBRIGATÓRIAS**

Ficam estabelecidas como obrigatórias para implementação:

Fiscal como domínio especializado.

Separação entre fiscal, operacional e financeiro.

NF-e como principal documento fiscal eletrônico do MVP.

Recepção automática de documentos fiscais.

Conferência antes de efeitos operacionais quando aplicável.

Documento fiscal ≠ recebimento físico.

Documento fiscal ≠ entrada automática de estoque.

Documento fiscal ≠ expedição/entrega.

Documento fiscal ≠ lançamento financeiro automático.

Cancelamento e eventos como registros próprios.

Preservação dos documentos originais.

XML preservado sem alteração.

Versionamento e histórico.

Idempotência.

Reprocessamento.

Contingência.

Auditoria.

Isolamento multi-tenant.

Controle de acesso conforme ADR-001.

Camada de abstração entre SaaS e provedor fiscal.

Rastreabilidade ponta a ponta.

Separação entre configuração e regra fiscal.

Preservação dos efeitos históricos.

Pendências e divergências visíveis e tratáveis.

Arquitetura preparada para evolução fiscal.

**31. HIERARQUIA DE REFERÊNCIA**

Em caso de conflito, prevalece:

Arquitetura Mestre

Escopo do Projeto

ADRs aprovados

Especificações funcionais

Especificação técnica

Contratos de API/Eventos

Modelo de dados

Implementação

Nenhuma decisão de implementação poderá contrariar este ADR sem revisão
arquitetural formal.

**32. CONCLUSÃO**

O ADR-004 — Estratégia Fiscal estabelece uma arquitetura fiscal robusta,
parametrizável, rastreável, multi-tenant e independente de fornecedor,
adequada ao MVP e preparada para evolução.

O objetivo não é transformar o SaaS em um sistema fiscal isolado, mas
permitir que a dimensão fiscal seja integrada de forma segura aos
processos industriais, preservando a responsabilidade de cada domínio.

**STATUS FINAL: APROVADO E FECHADO — VERSÃO 1.0**
