**ADR-003 — Estratégia, Cronograma e Operação do Cliente-Piloto**

**Versão:** 2.4\
**Status:** APPROVED\
**Data:** 09/09/2026

**1. Contexto**

O projeto SaaS será validado inicialmente em ambiente real por meio de
um cliente-piloto.

O piloto tem como finalidade validar não apenas a funcionalidade do
sistema, mas também sua utilização em operações reais, considerando
processos, dados, usuários, permissões, estabilidade, segurança,
rastreabilidade, experiência de uso e capacidade de acompanhar ciclos
operacionais completos.

O piloto não será tratado como uma demonstração ou ambiente descartável.
A partir do momento em que houver registros operacionais reais do
cliente, o sistema será considerado parte da operação viva do
cliente-piloto.

**2. Cliente-Piloto**

O cliente definido para o piloto é:

**JR Box**

**Responsável operacional:** Rafael.

A JR Box será utilizada como ambiente real de validação do produto
dentro dos limites definidos pelo MVP e pelos demais ADRs aprovados.

**3. Objetivos do Piloto**

O piloto deverá permitir:

validar o uso real do sistema;

validar os processos contemplados no MVP;

verificar a aderência do sistema às necessidades operacionais;

validar integridade e consistência dos dados;

validar permissões e isolamento entre usuários e tenants;

verificar rastreabilidade das operações;

avaliar estabilidade e desempenho;

validar os mecanismos de sincronização e funcionamento offline, quando
aplicáveis;

identificar falhas, dificuldades e necessidades de melhoria;

acompanhar operações reais do início ao fim;

coletar feedback estruturado dos usuários;

gerar evidências suficientes para avaliar a maturidade do produto ao
final do piloto.

**4. Natureza do Piloto**

O piloto utilizará dados e operações reais da JR Box dentro do escopo
funcional efetivamente disponibilizado.

Não será considerado um ambiente de demonstração.

Consequentemente:

os dados deverão possuir isolamento por tenant;

autenticação e autorização deverão ser aplicadas;

as regras de segurança deverão ser respeitadas;

operações relevantes deverão possuir rastreabilidade;

intervenções administrativas deverão ser registradas;

backups deverão existir;

deverá existir procedimento de recuperação;

deverá existir canal de suporte durante todo o período de operação.

Nenhuma regra específica criada exclusivamente para a JR Box deverá ser
incorporada ao núcleo do produto sem avaliação e formalização
apropriadas.

**5. Cronograma Oficial**

**5.1 Início**

O início oficial do projeto/piloto será:

**01/01/2027**

A data representa o início oficial do período de utilização e validação
planejada com a JR Box.

A preparação técnica, configuração, testes e disponibilização de
funcionalidades poderão ocorrer anteriormente, conforme necessário.

**5.2 Duração**

O período oficial do piloto será de:

**12 meses**

**Período**

**01/01/2027 a 31/12/2027**

A data de 31/12/2027 representa o encerramento planejado do piloto e a
realização da avaliação final.

O cronograma anteriormente definido de 01/10/2026 a 30/09/2027 fica
revogado.

**6. Marcos Intermediários**

O piloto possuirá avaliações intermediárias para evitar que a primeira
avaliação completa ocorra somente ao final dos 12 meses.

Os marcos não representam necessariamente aprovação ou reprovação do
piloto. São pontos formais de acompanhamento, avaliação e definição de
prioridades.

**M1 — Início Operacional**

**Data: 01/01/2027**

A JR Box deverá iniciar a utilização das funcionalidades do MVP que
estiverem efetivamente liberadas e configuradas.

Objetivos:

validar acesso dos usuários;

validar permissões;

validar dados iniciais;

acompanhar primeiros registros reais;

identificar problemas iniciais;

garantir funcionamento do suporte e dos mecanismos de proteção dos
dados.

**M2 — Primeira Avaliação Consolidada**

**Data: 31/03/2027**

A JR Box deverá estar utilizando de forma recorrente as funcionalidades
disponibilizadas para o piloto.

Deverão ser avaliados:

frequência de utilização;

principais dificuldades;

ocorrências e incidentes;

estabilidade;

qualidade dos dados;

aderência dos processos;

necessidade de correções;

necessidades de treinamento ou orientação.

Os problemas encontrados deverão ser registrados e priorizados.

**M3 — Avaliação Intermediária**

**Data: 30/06/2027**

Deverá ser realizada uma avaliação mais abrangente da utilização do
sistema.

Deverão ser analisados, conforme aplicabilidade:

ciclos operacionais reais;

integridade dos dados;

rastreabilidade;

permissões;

desempenho;

sincronização;

funcionamento offline;

integrações;

experiência dos usuários;

problemas recorrentes;

melhorias implementadas;

funcionalidades ainda não validadas.

A partir desta avaliação deverão ser definidas as prioridades para o
segundo semestre do piloto.

**M4 — Pré-Encerramento**

**Data: 30/09/2027**

Deverá ser realizada uma avaliação de maturidade e preparação para o
encerramento.

Deverão ser identificados:

processos já validados;

processos ainda não validados;

pendências;

problemas conhecidos;

estabilidade;

melhorias realizadas;

limitações existentes;

necessidades de evolução;

situação dos dados;

pontos que deverão compor a avaliação final.

**7. Avaliação Final**

**Data: 31/12/2027**

Ao final do piloto deverá ser realizada uma avaliação formal
considerando:

**7.1 Critérios funcionais**

funcionalidades utilizadas;

aderência aos processos;

cobertura do MVP;

limitações identificadas.

**7.2 Critérios operacionais**

utilização real;

estabilidade da operação;

eficiência dos processos;

capacidade de acompanhar operações completas;

ocorrência e tratamento de problemas.

**7.3 Critérios técnicos**

estabilidade;

desempenho;

segurança;

integridade dos dados;

isolamento entre tenants;

autenticação e autorização;

sincronização;

funcionamento offline, quando aplicável;

integrações.

**7.4 Critérios de produto**

experiência dos usuários;

facilidade de utilização;

feedback da JR Box;

necessidades de evolução;

funcionalidades prioritárias para futuras versões.

**8. Validação de Ciclos Operacionais Completos**

Sempre que aplicável ao processo, o piloto deverá acompanhar operações
reais desde sua origem até sua conclusão.

O objetivo é verificar:

integridade das informações;

continuidade dos dados;

histórico;

mudanças de status;

responsabilidades;

rastreabilidade;

consistência entre etapas.

Não será permitido considerar artificialmente encerradas operações que
ainda estejam em andamento apenas para cumprir o término do piloto.

Operações iniciadas durante o piloto e ainda em andamento deverão ser
identificadas e tratadas na avaliação final.

**9. Registro de Ocorrências e Feedback**

Durante todo o piloto deverá existir registro estruturado de:

erros;

incidentes;

indisponibilidades;

dificuldades de utilização;

sugestões;

solicitações de melhoria;

problemas de dados;

problemas de integração;

problemas de sincronização;

necessidades de treinamento.

Cada ocorrência deverá possuir, quando aplicável:

descrição;

data;

origem;

prioridade;

status;

responsável;

solução ou encaminhamento;

histórico.

**10. Evolução Durante o Piloto**

Correções, ajustes e melhorias poderão ser realizados durante o período
do piloto.

A evolução deverá:

preservar os dados existentes;

preservar o histórico;

preservar a segurança;

evitar regressões;

manter a compatibilidade dos processos já utilizados;

possuir rastreabilidade quando relevante.

Alterações arquiteturais relevantes deverão ser formalizadas por ADR.

O piloto não autoriza expansão indiscriminada do escopo.

Novas funcionalidades deverão ser avaliadas conforme prioridade e
impacto no produto.

**11. Suporte Durante o Piloto**

A partir do primeiro uso operacional real da JR Box deverá existir canal
definido de suporte.

O suporte deverá contemplar:

recebimento de dúvidas;

registro de problemas;

classificação de incidentes;

acompanhamento de problemas críticos;

orientação aos usuários;

comunicação de indisponibilidades relevantes;

acompanhamento até resolução ou encaminhamento.

Problemas críticos que possam comprometer dados, segurança ou
continuidade operacional deverão possuir prioridade de tratamento.

O canal e os procedimentos de suporte deverão estar disponíveis desde o
primeiro uso real e não somente após o lançamento comercial do produto.

**12. Backup e Recuperação**

A partir do primeiro registro operacional real da JR Box:

os dados deverão estar submetidos a rotina de backup;

deverá existir procedimento documentado de recuperação;

deverá ser realizado teste de recuperação antes ou no início da
utilização operacional real;

os resultados dos testes deverão ser registrados;

eventuais falhas de recuperação deverão ser tratadas como prioridade.

Backup não será considerado suficiente por si só: deverá existir
capacidade comprovada de restauração.

**13. Segurança e Proteção dos Dados**

Durante todo o piloto deverão ser aplicadas as regras de segurança
definidas nos demais ADRs.

Deverão ser preservados:

isolamento entre tenants;

autenticação;

autorização;

controle de permissões;

rastreabilidade;

proteção contra acesso indevido;

integridade dos dados;

mecanismos de auditoria aplicáveis.

O acesso administrativo ou de suporte aos dados da JR Box deverá possuir
finalidade legítima e rastreabilidade conforme as regras da arquitetura.

**14. Dados da JR Box ao Encerramento**

A JR Box terá direito à exportação dos seus dados ao término do piloto,
independentemente de ocorrer ou não expansão comercial.

A exportação deverá:

ser realizada sem custo adicional;

abranger os dados do tenant da JR Box;

contemplar, conforme aplicabilidade, cadastros, registros operacionais,
históricos e demais dados armazenados;

preservar a estrutura necessária para reutilização ou consulta;

disponibilizar dados estruturados preferencialmente em formatos como CSV
e/ou JSON;

disponibilizar arquivos/documentos armazenados, quando aplicável, em
formato preservável ou no formato original.

A exportação deverá ser disponibilizada em até **15 dias corridos** após
o encerramento do piloto ou após solicitação formal da JR Box,
prevalecendo a data que ocorrer por último.

A exportação dos dados não implicará exclusão imediata.

Eventual retenção posterior deverá observar requisitos legais,
contratuais, de segurança e de governança aplicáveis.

Caso a JR Box continue como cliente comercial, o direito de exportação
permanecerá disponível mediante solicitação.

**15. Critérios de Sucesso**

O piloto será considerado bem-sucedido quando houver evidências
suficientes de:

utilização real e recorrente;

funcionamento adequado das funcionalidades aplicáveis do MVP;

capacidade de acompanhar processos operacionais reais;

estabilidade compatível com a operação;

integridade e rastreabilidade dos dados;

segurança adequada;

capacidade de identificar e corrigir problemas;

evolução controlada do produto;

feedback suficiente dos usuários;

conhecimento das limitações remanescentes.

O sucesso do piloto não será determinado exclusivamente pela ausência de
problemas.

A capacidade do produto de identificar, registrar, tratar e aprender com
problemas também fará parte da avaliação.

**16. Encerramento do Piloto**

Ao final do período deverá ser produzido um fechamento formal contendo,
no mínimo:

operações realizadas;

ciclos completos acompanhados;

funcionalidades utilizadas;

ocorrências registradas;

problemas corrigidos;

melhorias realizadas;

estabilidade observada;

feedback dos usuários;

limitações;

pendências;

recomendações;

situação da exportação dos dados, quando aplicável.

O encerramento do piloto não implica automaticamente expansão comercial.

A decisão sobre continuidade, expansão, contratação ou alteração de
escopo deverá ser tomada posteriormente com base nos resultados obtidos.

**17. Alterações no Cronograma**

O cronograma não deverá ser alterado informalmente.

Qualquer alteração relevante deverá registrar:

justificativa;

nova data;

nova duração;

impactos;

efeitos sobre as avaliações;

efeitos sobre a operação da JR Box.

Alterações significativas deverão resultar em nova versão deste ADR.

**18. Governança**

O piloto deverá possuir acompanhamento periódico durante todo o período.

As avaliações intermediárias deverão servir como instrumentos de decisão
e priorização, e não apenas como registros formais.

Problemas críticos de segurança, integridade de dados ou continuidade
operacional deverão ser tratados independentemente do calendário dos
marcos.

**19. Relação com o MVP**

O piloto deverá validar as funcionalidades definidas no MVP aprovado no
ADR correspondente.

O período de 12 meses não representa autorização automática para
expansão do escopo do MVP.

Funcionalidades adicionais somente deverão ser incorporadas mediante
avaliação e priorização apropriadas.

**20. Decisão Final**

Fica aprovado que:

a **JR Box** será o cliente-piloto;

**Rafael** será o responsável operacional de referência;

o início oficial do piloto será em **01/01/2027**;

o piloto terá duração de **12 meses**;

o encerramento previsto será em **31/12/2027**;

existirão quatro marcos intermediários de avaliação;

o piloto será tratado como operação real, e não demonstração;

suporte, backup e recuperação deverão existir desde o primeiro uso
operacional real;

os dados da JR Box deverão possuir mecanismo de exportação garantido;

o piloto deverá acompanhar ciclos operacionais reais;

problemas e feedback deverão ser registrados;

correções e evoluções poderão ocorrer durante o piloto;

alterações arquiteturais relevantes deverão ser formalizadas;

o encerramento não implica automaticamente expansão comercial;

o cronograma anterior de **01/10/2026 a 30/09/2027** fica revogado.

**21. Histórico de Versões**

**v2.0** — Definição inicial da estratégia do cliente-piloto.

**v2.1** — Ajustes referentes ao cliente-piloto e critérios de
validação.

**v2.2** — Consolidação do acompanhamento e das condições do piloto.

**v2.3** — Alteração do período do piloto para 12 meses, originalmente
de 01/10/2026 a 30/09/2027, e inclusão das alternativas consideradas.

**v2.4** — Alteração definitiva do cronograma para 01/01/2027 a
31/12/2027; inclusão dos quatro marcos intermediários; formalização do
suporte durante o piloto; definição de backup e recuperação desde o
primeiro uso real; definição das regras de exportação dos dados da JR
Box; consolidação final da estratégia operacional do piloto.
