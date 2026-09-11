**PROMPT DE IMPLEMENTAÇÃO — ADR-003 v2.4**

**Estratégia, Cronograma e Operação do Cliente-Piloto**

Implemente as definições deste prompt no projeto SaaS industrial,
respeitando integralmente os ADRs já aprovados e evitando qualquer
alteração de decisão arquitetural previamente estabelecida.

Este prompt implementa exclusivamente as decisões do **ADR-003 v2.4**.

**1. Cliente-Piloto**

Configurar o cliente-piloto oficial como:

**Cliente:** JR Box

**Responsável operacional:** Rafael

A JR Box deverá ser tratada como um tenant real do sistema durante o
piloto.

Não criar regras de negócio permanentes ou alterações no núcleo do
produto exclusivamente para atender à JR Box.

**2. Cronograma Oficial**

Configurar o cronograma oficial do piloto:

**Início:** 01/01/2027

**Duração:** 12 meses

**Encerramento:** 31/12/2027

O cronograma anterior de 01/10/2026 a 30/09/2027 está revogado e não
deve ser utilizado.

A preparação técnica, configuração, testes e homologação poderão ocorrer
antes de 01/01/2027.

A data de início do piloto não significa que todas as funcionalidades do
MVP devam estar disponíveis simultaneamente.

**3. Marcos do Piloto**

Implementar ou estruturar mecanismos de acompanhamento dos seguintes
marcos:

**M1 — Início Operacional**

**01/01/2027**

Objetivos:

- início da utilização real;

- validação dos usuários;

- validação das permissões;

- validação dos dados iniciais;

- acompanhamento dos primeiros registros reais;

- confirmação do funcionamento do suporte;

- confirmação dos mecanismos de backup e recuperação.

**M2 — Primeira Avaliação Consolidada**

**31/03/2027**

Avaliar:

- frequência de utilização;

- dificuldades;

- ocorrências;

- estabilidade;

- qualidade dos dados;

- aderência dos processos;

- correções necessárias;

- treinamento/orientação.

**M3 — Avaliação Intermediária**

**30/06/2027**

Avaliar, conforme aplicabilidade:

- ciclos operacionais reais;

- integridade dos dados;

- rastreabilidade;

- permissões;

- desempenho;

- sincronização;

- funcionamento offline;

- integrações;

- experiência dos usuários;

- problemas recorrentes;

- melhorias realizadas;

- funcionalidades ainda não validadas.

**M4 — Pré-Encerramento**

**30/09/2027**

Avaliar:

- processos validados;

- processos ainda não validados;

- pendências;

- problemas conhecidos;

- estabilidade;

- melhorias;

- limitações;

- necessidades de evolução;

- situação dos dados;

- preparação para avaliação final.

**Avaliação Final**

**31/12/2027**

Consolidar os resultados de todo o piloto.

Os marcos são pontos formais de acompanhamento e não devem ser
interpretados automaticamente como aprovação ou reprovação do piloto.

**4. Operação Real**

A partir do primeiro registro operacional real da JR Box:

- considerar o sistema como parte de uma operação real;

- aplicar autenticação e autorização;

- aplicar isolamento por tenant;

- aplicar regras de segurança;

- garantir rastreabilidade;

- registrar intervenções administrativas relevantes;

- manter backup;

- manter mecanismo de recuperação;

- disponibilizar canal de suporte.

Não tratar o ambiente do piloto como ambiente descartável ou
exclusivamente de demonstração.

**5. Suporte**

Disponibilizar canal formal de suporte para a JR Box desde o primeiro
uso operacional real.

O suporte deverá permitir:

- registro de dúvidas;

- registro de problemas;

- classificação de incidentes;

- acompanhamento;

- orientação aos usuários;

- comunicação de indisponibilidades relevantes;

- acompanhamento até resolução ou encaminhamento.

Problemas críticos relacionados a:

- segurança;

- integridade dos dados;

- perda de dados;

- indisponibilidade;

- continuidade operacional

deverão possuir prioridade elevada.

As intervenções de suporte que impliquem acesso administrativo aos dados
deverão respeitar as regras de segurança, autorização e auditoria já
definidas na arquitetura.

**6. Backup e Recuperação**

Antes ou no início do primeiro uso operacional real:

ativar a rotina de backup;

disponibilizar procedimento documentado de recuperação;

realizar teste de recuperação;

registrar o resultado do teste;

corrigir eventuais falhas identificadas.

O sistema não deverá considerar que possuir backup é suficiente.

Deverá existir capacidade comprovada de restauração.

**7. Registro de Ocorrências**

Criar ou utilizar mecanismo estruturado para registrar ocorrências do
piloto.

Registrar, quando aplicável:

- erro;

- incidente;

- indisponibilidade;

- dificuldade de utilização;

- sugestão;

- solicitação de melhoria;

- problema de dados;

- problema de integração;

- problema de sincronização;

- necessidade de treinamento.

Cada ocorrência deverá possuir, quando aplicável:

- descrição;

- data;

- origem;

- prioridade;

- status;

- responsável;

- solução/encaminhamento;

- histórico.

**8. Acompanhamento de Ciclos Operacionais**

O sistema deverá permitir identificar e acompanhar operações reais ao
longo de suas etapas.

Quando aplicável, registrar:

- origem da operação;

- evolução;

- mudanças de status;

- responsáveis;

- histórico;

- conclusão.

Não encerrar artificialmente uma operação que esteja em andamento apenas
para cumprir o encerramento do piloto.

Operações iniciadas durante o piloto e ainda abertas deverão permanecer
identificadas para a avaliação final.

**9. Evolução Durante o Piloto**

Permitir correções, ajustes e melhorias durante o piloto.

Qualquer evolução deverá:

- preservar os dados existentes;

- preservar históricos;

- preservar segurança;

- evitar regressões;

- manter compatibilidade com processos já utilizados;

- possuir rastreabilidade quando aplicável.

Alterações arquiteturais relevantes deverão gerar ou atualizar ADR
correspondente.

Não transformar o piloto em mecanismo automático de expansão do escopo.

Novas funcionalidades deverão ser avaliadas e priorizadas antes de
implementação.

**10. Segurança**

Aplicar integralmente as regras de segurança definidas nos demais ADRs.

Garantir:

- isolamento entre tenants;

- autenticação;

- autorização;

- permissões;

- rastreabilidade;

- proteção contra acesso indevido;

- integridade dos dados;

- auditoria aplicável.

O usuário administrativo ou de suporte não deverá receber privilégios
superiores aos necessários para sua finalidade.

**11. Exportação dos Dados da JR Box**

Implementar mecanismo que permita exportar os dados pertencentes ao
tenant JR Box.

A exportação deverá contemplar, conforme aplicabilidade:

- cadastros;

- registros operacionais;

- históricos;

- demais dados armazenados;

- documentos e arquivos associados.

Priorizar formatos estruturados e reutilizáveis, como:

- CSV;

- JSON;

e, para documentos/arquivos, preservar o formato original ou formato
adequado à sua reutilização.

A exportação deverá:

- não possuir custo adicional para a JR Box;

- ser disponibilizada ao encerramento do piloto ou mediante solicitação;

- ocorrer em até **15 dias corridos** após o encerramento ou solicitação
  formal, prevalecendo a data que ocorrer por último;

- preservar a integridade dos dados;

- não provocar exclusão automática.

A arquitetura deverá permitir a exportação sem necessidade de
intervenção manual complexa ou reconstrução dos dados.

**12. Retenção dos Dados**

A exportação não implica exclusão imediata dos dados.

Qualquer retenção ou exclusão posterior deverá respeitar:

- requisitos legais;

- requisitos contratuais;

- segurança;

- governança;

- políticas de retenção definidas pelo sistema.

Caso a JR Box permaneça como cliente comercial, o mecanismo de
exportação deverá continuar disponível mediante solicitação.

**13. Avaliação do Piloto**

Disponibilizar informações suficientes para avaliação dos seguintes
grupos de critérios:

**Funcionais**

- funcionalidades utilizadas;

- aderência;

- cobertura do MVP;

- limitações.

**Operacionais**

- utilização;

- estabilidade;

- eficiência;

- ciclos completos;

- ocorrências.

**Técnicos**

- desempenho;

- segurança;

- integridade;

- isolamento;

- autenticação;

- autorização;

- sincronização;

- offline;

- integrações.

**Produto**

- experiência do usuário;

- feedback;

- necessidades de evolução;

- prioridades futuras.

**14. Critérios de Sucesso**

O acompanhamento deverá permitir verificar:

utilização real e recorrente;

funcionamento das funcionalidades aplicáveis do MVP;

capacidade de acompanhar operações reais;

estabilidade;

integridade dos dados;

rastreabilidade;

segurança;

capacidade de tratar problemas;

evolução controlada;

feedback dos usuários;

limitações remanescentes.

A existência de problemas não deverá ser automaticamente considerada
fracasso.

O registro, tratamento e aprendizado decorrente dos problemas também
fazem parte da avaliação.

**15. Avaliação Final**

Em **31/12/2027**, consolidar:

- operações realizadas;

- ciclos completos;

- funcionalidades utilizadas;

- ocorrências;

- problemas corrigidos;

- melhorias;

- estabilidade;

- feedback;

- limitações;

- pendências;

- recomendações;

- situação da exportação dos dados.

O encerramento do piloto não deverá gerar automaticamente expansão
comercial.

**16. Alterações no Cronograma**

Não permitir alterações informais no cronograma oficial.

Qualquer alteração relevante deverá registrar:

- justificativa;

- nova data;

- nova duração;

- impactos;

- efeitos nos marcos;

- efeitos na operação da JR Box.

Alterações significativas deverão ser formalizadas em nova versão do
ADR-003.

**17. Regras de Implementação**

Durante a implementação:

Não alterar decisões estabelecidas nos demais ADRs.

Não utilizar o piloto para introduzir regras permanentes específicas da
JR Box.

Não considerar o ambiente do piloto como ambiente de demonstração.

Não depender da avaliação final para identificar problemas críticos.

Não permitir que o término do piloto provoque perda de dados.

Não permitir exclusão automática dos dados em razão do encerramento.

Não considerar o período de 12 meses como autorização para expansão
automática do MVP.

Preservar segurança, isolamento, auditoria e rastreabilidade.

Evitar regressões nas funcionalidades já validadas.

Registrar alterações arquiteturais relevantes por ADR.

**18. Resultado Esperado**

Ao implementar este ADR, o sistema deverá possuir estrutura suficiente
para:

- operar a JR Box como cliente-piloto real;

- acompanhar o piloto de 01/01/2027 a 31/12/2027;

- registrar e acompanhar os quatro marcos intermediários;

- fornecer suporte desde o primeiro uso real;

- possuir backup e recuperação testados;

- acompanhar ocorrências e feedback;

- acompanhar ciclos operacionais reais;

- permitir evolução controlada;

- avaliar tecnicamente e operacionalmente o piloto;

- garantir a exportação dos dados da JR Box;

- concluir o piloto sem perda ou bloqueio indevido dos dados.

A implementação deverá permanecer alinhada ao **ADR-003 v2.4 —
APPROVED**.

Não retornar ao cronograma de 2026.

Não utilizar o período de 15 dias anteriormente definido.

O cronograma oficial é:

**01/01/2027 → 31/12/2027.**
