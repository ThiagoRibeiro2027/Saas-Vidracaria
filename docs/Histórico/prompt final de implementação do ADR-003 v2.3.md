**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-003 — Estratégia e Cronograma do Cliente-Piloto**

**Versão 2.3**

Implemente e configure os requisitos decorrentes do **ADR-003 v2.3**,
respeitando integralmente todos os ADRs aprovados e consolidados do
projeto.

Este prompt é exclusivamente de implementação.\
Não altere decisões arquiteturais ou regras definidas em outros ADRs.

**1. CLIENTE-PILOTO**

O primeiro cliente-piloto oficial do SaaS é:

**JR Box**

Contato operacional:

**Rafael**

Essas informações devem ser utilizadas na configuração, documentação e
identificação do ambiente de piloto.

Não criar regras de negócio exclusivas da JR Box no núcleo do produto.

**2. PERÍODO OFICIAL DO PILOTO**

O período oficial do piloto é:

**Início:** 01/10/2026\
**Duração:** 12 meses\
**Término previsto:** 30/09/2027

A duração anterior de 15 dias não é mais válida.

Não interpretar 01/10/2026 como obrigação de que todas as
funcionalidades do MVP estejam validadas imediatamente nessa data.

**3. OBJETIVO DO PILOTO**

O objetivo é validar o MVP em uma operação empresarial real, observando:

aderência aos processos;

funcionamento dos fluxos;

integridade dos dados;

rastreabilidade;

permissões;

estabilidade;

desempenho;

sincronização;

funcionamento offline, quando aplicável;

experiência dos usuários;

capacidade de acompanhar pedidos reais.

O piloto não é apenas uma demonstração comercial.

**4. ESCOPO**

O piloto deve validar exclusivamente o **MVP definido no ADR-002**.

Funcionalidades futuras não fazem parte automaticamente do piloto.

Uma necessidade identificada durante o piloto deverá ser classificada
como:

correção;

melhoria;

evolução;

novo requisito.

Não ampliar automaticamente o escopo do MVP.

**5. OPERAÇÃO REAL**

Utilizar dados e operações reais da JR Box dentro do escopo aprovado.

Garantir:

isolamento do tenant;

RLS;

autenticação;

autorização;

auditoria;

rastreabilidade;

proteção dos dados.

O ambiente de piloto deve possuir os mesmos requisitos de segurança
aplicáveis ao produto.

**6. CICLO COMPLETO DOS PEDIDOS**

O sistema deve permitir acompanhar pedidos reais ao longo das etapas
aplicáveis.

Preservar:

origem;

alterações;

responsáveis;

estados;

vínculos;

histórico;

etapas executadas;

conclusão.

O término do período de piloto não deve encerrar artificialmente pedidos
ainda em andamento.

**7. REGISTRO DE OCORRÊNCIAS**

Durante o piloto, registrar:

bugs;

erros;

inconsistências;

sugestões;

dificuldades de uso;

problemas de processo;

falhas de integração;

incidentes;

melhorias.

Sempre que aplicável, registrar:

descrição;

data;

usuário;

módulo;

prioridade;

status;

responsável;

solução;

data de resolução.

**8. EVOLUÇÕES DURANTE O PILOTO**

Correções e melhorias podem ser implementadas durante os 12 meses.

Toda alteração deve preservar:

integridade dos dados;

histórico;

rastreabilidade;

segurança;

compatibilidade com os fluxos existentes.

Não transformar uma necessidade específica da JR Box em regra global sem
decisão formal.

Mudanças arquiteturais relevantes devem ser registradas no ADR
correspondente.

**9. CRITÉRIOS DE VALIDAÇÃO**

**9.1 Funcionais**

Verificar:

execução correta dos fluxos;

regras de negócio;

consistência dos estados;

integridade dos dados;

ausência de perda de informação.

**9.2 Operacionais**

Verificar:

capacidade dos usuários de executar suas atividades;

rastreabilidade dos pedidos;

redução de controles paralelos, quando aplicável;

aderência ao processo real.

**9.3 Técnicos**

Verificar:

estabilidade;

desempenho;

sincronização;

funcionamento offline;

recuperação de falhas;

segurança;

isolamento entre tenants.

**9.4 Produto**

Avaliar:

aderência à operação;

feedback dos usuários;

dificuldades;

necessidades de melhoria;

funcionalidades prioritárias;

limitações conhecidas.

**10. CRITÉRIO DE SUCESSO**

O sucesso do piloto não será determinado apenas por:

duração;

número de usuários;

número de acessos;

quantidade de pedidos.

A avaliação deverá considerar evidências de operação real e a capacidade
de acompanhar pedidos através do fluxo aplicável mantendo:

integridade;

rastreabilidade;

histórico;

consistência;

segurança.

Deverá ser possível observar pelo menos um ou mais ciclos reais
completos de pedidos durante o período, conforme a natureza e duração
das operações da JR Box.

**11. ENCERRAMENTO DO PILOTO**

Ao final do período:

**30/09/2027**

realizar avaliação formal.

Consolidar:

pedidos acompanhados;

ciclos completos;

problemas encontrados;

problemas corrigidos;

melhorias implementadas;

estabilidade;

feedback dos usuários;

limitações;

pendências;

recomendações.

Não excluir automaticamente dados do piloto.

Não encerrar artificialmente pedidos que ainda estejam em andamento.

**12. SEGURANÇA**

O fato de ser um piloto não reduz os requisitos de segurança.

Aplicar integralmente:

autenticação;

autorização;

RLS;

isolamento por tenant;

auditoria;

controle de acesso;

proteção de dados;

princípio do menor privilégio.

**13. NÃO REGRESSÃO**

A implementação deste ADR não poderá:

alterar o MVP sem aprovação;

reduzir segurança;

reduzir isolamento entre tenants;

modificar permissões;

eliminar histórico;

eliminar auditoria;

criar funcionalidades fiscais fora do escopo;

criar regras permanentes específicas da JR Box;

encerrar pedidos automaticamente no final do piloto.

**14. REGRA SOBRE O PRAZO**

A duração oficial é:

**01/10/2026 → 30/09/2027**

Não utilizar o prazo anterior de 15 dias.

Caso seja necessária nova alteração de datas ou duração, ela deverá ser
formalmente registrada em nova versão do ADR-003, com justificativa e
impacto.

Não alterar o cronograma informalmente no código ou na configuração.

**15. INSTRUÇÃO FINAL AO IMPLEMENTADOR**

Antes de implementar:

leia o ADR-003 v2.3;

leia o ADR-002 e demais ADRs relacionados;

valide dependências;

identifique conflitos;

não invente regras;

não amplie o escopo;

não crie regras exclusivas permanentes para a JR Box;

registre qualquer requisito não especificado.

**Decisão oficial**

**JR Box é o cliente-piloto do SaaS. Rafael é o contato operacional. O
piloto inicia em 01/10/2026 e possui duração de 12 meses, com término
previsto em 30/09/2027.**

O objetivo é validar o produto em operação real durante um período
suficientemente longo para observar ciclos completos, diferentes
situações operacionais e a evolução do sistema.

**O prazo de 15 dias está revogado.**
