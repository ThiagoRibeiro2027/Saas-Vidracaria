**ADR-003 — Estratégia e Cronograma do Cliente-Piloto**

**Versão:** 2.3\
**Status:** APROVADO\
**Data:** 09/09/2026

**1. Contexto**

O SaaS será submetido a validação em ambiente real antes de sua expansão
para outros clientes.

O piloto tem como objetivo validar o comportamento do sistema em uma
operação empresarial real, utilizando dados e processos reais,
permitindo identificar:

problemas funcionais;

problemas de usabilidade;

inconsistências de processos;

falhas de integração;

problemas de desempenho;

problemas de sincronização;

necessidades de ajustes;

comportamentos não previstos durante a especificação.

O piloto não deve ser tratado apenas como demonstração comercial.

Seu objetivo principal é produzir evidências reais de que o produto
consegue suportar a operação definida para o MVP.

**2. Cliente-piloto**

O cliente escolhido para o primeiro piloto será:

**JR Box**

O contato operacional definido para o piloto será:

**Rafael**

A JR Box será utilizada como ambiente real de validação do produto
durante o período definido neste ADR.

**3. Objetivos do piloto**

O piloto deverá validar, principalmente:

utilização real do sistema pelos usuários;

aderência dos fluxos implementados aos processos da empresa;

integridade dos dados;

rastreabilidade das operações;

funcionamento das permissões;

comportamento do sistema em situações reais;

estabilidade;

funcionamento das funcionalidades offline, quando aplicáveis;

sincronização dos dados;

capacidade de acompanhar pedidos reais desde sua origem até a conclusão
do fluxo aplicável.

O piloto deverá produzir evidências suficientes para determinar se o MVP
está adequado para evolução e expansão.

**4. Natureza do piloto**

O piloto será realizado com **dados e operações reais da JR Box**,
respeitando as regras de segurança, privacidade, isolamento de tenant e
permissões definidas nos demais ADRs.

O piloto não significa que todas as funcionalidades futuras do produto
estarão disponíveis.

O escopo será limitado ao MVP aprovado.

Funcionalidades ainda não implementadas não deverão ser consideradas
defeitos do piloto simplesmente por não existirem, desde que estejam
explicitamente fora do escopo aprovado.

**5. Início do piloto**

O início do período do piloto está definido para:

**01/10/2026**

Essa data constitui o marco oficial de início do primeiro ciclo de
validação da JR Box.

A preparação técnica, configuração de ambiente, testes internos e demais
atividades necessárias para disponibilizar o MVP deverão ocorrer antes
da utilização efetiva de cada funcionalidade no ambiente do cliente.

O fato de o piloto possuir uma data de início não significa que todas as
funcionalidades previstas no MVP possam ser consideradas validadas
imediatamente nessa data.

**6. Duração**

O piloto terá duração de:

**12 meses**

Período:

**01/10/2026 a 30/09/2027**

A extensão para 12 meses foi definida para permitir que o produto seja
observado durante ciclos operacionais reais e variados, evitando que a
avaliação fique limitada a um período curto demais para representar
adequadamente a operação do cliente.

**7. Justificativa para a duração**

A duração anterior, de 15 dias, poderia ser insuficiente para validar o
ciclo completo de determinados pedidos.

Operações envolvendo:

orçamento;

pedido;

engenharia;

produção;

expedição;

instalação;

disponibilidade de obra;

programação do cliente final;

podem ultrapassar significativamente duas semanas.

Portanto, a validação não deverá depender de um período curto
artificialmente definido.

O período de 12 meses permite observar:

diferentes ciclos de pedidos;

diferentes volumes de operação;

situações normais e excepcionais;

sazonalidade;

ajustes decorrentes do uso real;

evolução do produto;

reincidência ou eliminação de problemas identificados.

**8. Critério de ciclo completo**

Um dos principais critérios de validação continuará sendo a capacidade
de acompanhar **pedidos reais ao longo do fluxo operacional aplicável**,
preservando:

integridade;

rastreabilidade;

histórico;

estados;

responsabilidades;

vínculos entre etapas.

O encerramento do período de 12 meses não exige que um pedido iniciado
próximo ao final do período seja artificialmente encerrado.

Pedidos em andamento deverão preservar seus dados e histórico de acordo
com as regras do sistema.

**9. Critérios de sucesso**

O piloto será avaliado considerando, entre outros:

**Funcionais**

fluxos principais executados corretamente;

regras de negócio respeitadas;

estados consistentes;

dados preservados;

ausência de perda de informação.

**Operacionais**

usuários conseguindo executar suas atividades;

redução de controles paralelos quando aplicável;

rastreabilidade das operações;

capacidade de acompanhar o pedido ao longo do processo.

**Técnicos**

estabilidade;

desempenho aceitável;

sincronização;

funcionamento offline quando aplicável;

recuperação de falhas;

segurança;

isolamento entre tenants.

**Produto**

aderência à operação real;

identificação de necessidades de melhoria;

identificação de funcionalidades prioritárias;

capacidade de utilização contínua.

**10. Registro de problemas e feedback**

Durante todo o piloto deverão ser registrados:

bugs;

inconsistências;

sugestões;

dificuldades de utilização;

necessidades de melhoria;

problemas de processo;

problemas de dados;

falhas de integração;

incidentes de segurança, quando existentes.

Cada ocorrência deverá possuir, quando aplicável:

descrição;

data;

usuário;

módulo;

prioridade;

status;

responsável;

solução;

data de resolução.

**11. Evolução durante o piloto**

O produto poderá receber correções e evoluções durante o período do
piloto.

Entretanto, qualquer alteração deverá preservar:

integridade dos dados existentes;

rastreabilidade;

segurança;

compatibilidade com os processos já validados;

decisões arquiteturais aprovadas.

Alterações que representem mudança de escopo relevante deverão ser
formalizadas nos documentos apropriados.

O piloto não deverá ser utilizado como mecanismo informal para alterar
decisões arquiteturais.

**12. Critérios de saída**

Ao final do período definido, deverá ser realizada avaliação formal do
piloto.

A avaliação deverá considerar:

funcionalidades utilizadas;

funcionalidades não utilizadas;

problemas encontrados;

problemas corrigidos;

estabilidade;

aderência operacional;

feedback dos usuários;

ciclos completos observados;

limitações conhecidas;

pendências;

prioridades para próxima versão.

O resultado poderá indicar:

produto apto para expansão;

necessidade de nova fase de validação;

necessidade de correções antes da expansão;

necessidade de revisão de determinados módulos.

O encerramento do piloto não implica automaticamente aprovação comercial
irrestrita do produto.

**13. Alteração do cronograma**

A duração ou as datas do piloto poderão ser alteradas quando houver
justificativa objetiva.

Qualquer alteração deverá:

ser registrada;

possuir justificativa;

indicar a nova data ou duração;

identificar os impactos;

preservar a rastreabilidade da decisão.

Alterações relevantes deverão resultar em nova versão deste ADR.

**14. Alternativas consideradas**

**Alternativa 1 — Piloto de 15 dias**

**Não adotada.**

Embora permitisse obter feedback rapidamente, poderia ser insuficiente
para acompanhar ciclos completos de pedidos e para observar
adequadamente os processos de uma operação real.

**Alternativa 2 — Piloto incremental curto**

**Não adotada como estratégia principal.**

Poderia permitir validação antecipada de determinados módulos, porém não
substituiria a necessidade de observar o produto em operação contínua e
em ciclos completos.

**Alternativa 3 — Adiar indefinidamente o piloto até que todo o produto
estivesse concluído**

**Não adotada.**

Postergaria excessivamente o contato com a operação real e reduziria a
oportunidade de identificar problemas durante a evolução do produto.

**Alternativa 4 — Piloto de 12 meses**

**Adotada.**

Permite iniciar a validação em ambiente real em 01/10/2026 e acompanhar
a evolução do produto durante um período suficientemente amplo para
observar diferentes ciclos operacionais.

**15. Governança**

O piloto deverá possuir responsável definido e canal de acompanhamento.

A JR Box deverá fornecer feedback sobre:

problemas;

dificuldades;

necessidades;

comportamento dos processos;

utilização do sistema.

A equipe responsável pelo produto deverá avaliar os registros e
priorizar correções conforme impacto e criticidade.

**16. Segurança e isolamento**

O piloto deverá respeitar integralmente os mecanismos de:

autenticação;

autorização;

isolamento por tenant;

RLS;

auditoria;

permissões;

proteção de dados;

definidos nos demais ADRs.

O fato de ser um piloto não reduz os requisitos de segurança do sistema.

**17. Dados do piloto**

Os dados utilizados pela JR Box deverão permanecer segregados do
ambiente de outros tenants.

Não será permitido utilizar dados da JR Box para outro tenant sem
autorização e sem os mecanismos apropriados definidos pelo sistema.

Dados históricos e registros gerados durante o piloto deverão manter sua
rastreabilidade.

**18. Relação com o MVP**

O piloto deverá validar o **MVP definido no ADR-002**.

O período de 12 meses não representa autorização para ampliar
automaticamente o escopo do MVP.

Novas funcionalidades identificadas durante o piloto deverão ser
classificadas como:

correção;

melhoria;

evolução;

novo requisito;

e tratadas conforme o processo de governança do projeto.

**19. Decisão final**

Fica definido que:

**A JR Box será o cliente-piloto do SaaS, tendo Rafael como contato
operacional, com início oficial do piloto em 01/10/2026 e duração de 12
meses, encerrando-se em 30/09/2027.**

O período prolongado tem como objetivo permitir validação real e
contínua do produto, incluindo a observação de ciclos completos de
pedidos e diferentes situações operacionais.

A duração do piloto não altera o escopo funcional do MVP nem autoriza
automaticamente a inclusão de novas funcionalidades.

**20. Histórico de versões**

**v2.0**

Definição da estratégia inicial do piloto.

**v2.1**

Ajustes relacionados à definição do cliente-piloto e critérios de
validação.

**v2.2**

Consolidação do cliente-piloto e das regras de acompanhamento.

**v2.3**

**Alteração do cronograma do piloto.**

Principais alterações:

JR Box formalizada como cliente-piloto;

Rafael formalizado como contato operacional;

início mantido em **01/10/2026**;

duração alterada para **12 meses**;

encerramento previsto em **30/09/2027**;

inclusão/consolidação das alternativas consideradas;

justificativa formal para substituição do piloto original de 15 dias;

reforço do critério de validação por ciclos reais e completos de
pedidos.
