**Prompt Final de Implementação**

**ADR-003 — Cliente-Piloto — Versão 2.1**

**1. Objetivo**

Implementar e conduzir o cliente-piloto do SaaS conforme definido no
ADR-003 v2.1.

O piloto tem como objetivo validar o MVP em uma operação real de uma
empresa de vidraçaria.

O piloto deve validar o produto existente e suas hipóteses.

**Não transformar o piloto em desenvolvimento de um sistema exclusivo
para o cliente-piloto.**

**2. Cliente-piloto**

Utilizar como cliente-piloto:

**JR Box**

O cliente-piloto deverá utilizar dados, usuários, processos e condições
reais sempre que aplicável.

**3. Responsável interno**

O responsável interno pelo acompanhamento do piloto é:

**Rafael**

O responsável deverá:

coordenar o acompanhamento;

acompanhar utilização;

consolidar problemas;

registrar feedbacks;

acompanhar incidentes;

apoiar a classificação das necessidades;

acompanhar indicadores;

apoiar a avaliação final.

Isso não significa que Rafael será o único responsável pelas operações
do cliente.

**4. Período**

Considerar como período previsto:

**Início:** 01/10/2026\
**Término:** 15/10/2026\
**Duração:** 15 dias corridos.

O período poderá ser alterado somente mediante decisão registrada.

**5. Objetivo de validação**

Validar se o MVP consegue sustentar uma operação real de ponta a ponta.

Priorizar a validação de:

fluxo operacional;

continuidade das informações;

responsabilidades dos usuários;

exceções;

integridade;

segurança;

isolamento entre empresas;

rastreabilidade;

usabilidade;

operação com dados reais.

Não tentar validar todas as funcionalidades futuras do produto.

**6. Fluxo principal**

Validar, quando aplicável à operação real:

**Orçamento → Aprovação/Conversão → Conferência → Liberação → Engenharia
→ Reserva/Disponibilidade → Produção → Controle necessário → Expedição →
Instalação → Aceite/Conclusão → Encerramento.**

Também validar exceções relevantes.

**7. Dados reais**

Utilizar dados reais do cliente-piloto sempre que possível.

Podem ser utilizados:

clientes;

produtos;

materiais;

componentes;

fornecedores;

preços;

pedidos;

medidas;

informações técnicas;

usuários;

obras;

demais dados necessários.

Aplicar os controles de segurança, privacidade, acesso e LGPD definidos
para o produto.

**8. Preparação e importação de dados**

Utilizar a funcionalidade de importação inicial controlada definida no
ADR-002 quando necessária.

A importação poderá contemplar:

clientes;

produtos;

materiais;

componentes;

fornecedores;

preços;

demais dados necessários.

Antes da efetivação:

validar dados;

identificar erros;

identificar inconsistências;

controlar duplicidades;

permitir conferência;

registrar auditoria.

Não realizar migração histórica completa como requisito do piloto.

**9. Usuários e acesso**

Cadastrar os usuários conforme suas responsabilidades reais.

Aplicar o modelo:

**Usuário → Perfil → Permissões**

conforme ADR-001.

Garantir:

escopo correto;

permissões adequadas;

ausência de privilégios indevidos;

autorização no backend;

auditoria.

**10. Preparação dos usuários**

Antes da utilização real, fornecer preparação mínima sobre:

acesso;

responsabilidades;

fluxo operacional;

funcionalidades relevantes;

tratamento de erros;

exceções;

utilização offline quando aplicável.

O treinamento deverá ser objetivo e orientado à operação real.

**11. Registro de problemas**

Todo problema relevante deverá ser registrado.

Registrar, sempre que possível:

usuário;

data/hora;

processo;

contexto;

descrição;

impacto;

frequência;

criticidade;

classificação;

responsável;

solução;

status.

**12. Classificação das necessidades**

Classificar as ocorrências como:

defeito;

erro de dados;

erro de configuração;

necessidade essencial do produto;

melhoria;

necessidade específica do cliente;

dúvida operacional;

solicitação fora do escopo.

Não transformar automaticamente uma solicitação em requisito de
desenvolvimento.

**13. Critério para alteração do MVP**

Uma necessidade poderá justificar alteração do MVP quando:

bloquear o fluxo principal;

comprometer integridade;

comprometer segurança;

representar obrigação legal;

demonstrar erro em uma premissa fundamental;

for indispensável ao propósito do produto.

Solicitações específicas da JR Box não deverão ser incorporadas
automaticamente.

Avaliar se a necessidade deve ser tratada como:

configuração;

funcionalidade padrão;

melhoria futura;

customização controlada;

solicitação não aplicável.

**14. Segurança**

Durante o piloto garantir:

isolamento entre empresas;

autorização no backend;

controle de acesso;

auditoria;

rastreabilidade;

proteção de dados;

segurança das credenciais;

privacidade.

Qualquer falha grave de segurança deverá ser tratada como prioridade
máxima.

**15. Operação offline**

Quando aplicável, validar conforme ADR-005 e ADR-008:

persistência local;

fila de operações;

sincronização;

idempotência;

revalidação pelo servidor;

tratamento de conflitos;

recuperação de erros;

confirmação do servidor.

O servidor permanece como fonte oficial dos dados.

**16. Notificações**

Avaliar, quando aplicável:

notificações internas;

e-mail;

push;

preferências;

criticidade;

rastreabilidade;

comportamento em falhas.

Nenhum canal externo deverá ser requisito único para continuidade do
fluxo operacional.

**17. Fiscal**

Validar somente as necessidades fiscais efetivamente presentes na
operação da JR Box.

Seguir o ADR-004.

Não desenvolver funcionalidades fiscais apenas por hipótese ou
antecipação.

**18. Indicadores**

Acompanhar, sempre que possível:

pedidos processados;

usuários ativos;

etapas utilizadas;

pedidos concluídos;

pedidos parciais;

ocorrências;

bloqueios;

retrabalhos;

erros;

tempos de execução;

falhas de sincronização;

problemas de dados;

solicitações de melhoria;

dependência de processos externos.

Os indicadores devem apoiar a avaliação do piloto.

Não criar BI avançado para o piloto.

**19. Critérios de sucesso**

Considerar o piloto bem-sucedido quando houver evidência de que:

pedidos reais podem ser processados;

o fluxo principal pode ser executado;

usuários conseguem executar suas responsabilidades;

dados permanecem consistentes;

existe rastreabilidade;

principais bloqueios podem ser tratados;

operações parciais são corretamente representadas;

isolamento entre empresas é preservado;

a dependência de controles externos para o núcleo da operação é
reduzida;

problemas e necessidades podem ser identificados e classificados;

o produto apresenta condições de utilização e evolução.

**20. Critérios de interrupção**

Interromper ou reduzir temporariamente o piloto quando houver:

falha grave de segurança;

vazamento entre empresas;

perda significativa de dados;

inconsistência crítica;

impossibilidade de executar o fluxo principal;

falha estrutural impeditiva;

descumprimento legal relevante;

impossibilidade operacional de continuidade.

Registrar e analisar formalmente qualquer interrupção.

**21. Avaliação final**

Ao final do período previsto, realizar avaliação formal.

Avaliar:

objetivos;

resultados;

indicadores;

problemas;

feedbacks;

estabilidade;

segurança;

integridade;

rastreabilidade;

aderência ao fluxo;

necessidades identificadas;

alterações realizadas;

backlog gerado.

**22. Resultado do piloto**

Classificar o resultado em uma das categorias:

**A — Aprovado**

MVP demonstrou capacidade suficiente para utilização e evolução.

**B — Aprovado com ajustes**

Produto viável, mas necessita de correções ou melhorias relevantes.

**C — Requer nova validação**

Evidências insuficientes para conclusão.

**D — Reavaliar premissa**

Uma ou mais premissas fundamentais precisam ser revistas.

Registrar formalmente a classificação.

**23. Continuidade**

Após o piloto, poderá ocorrer:

continuidade da operação;

correções;

nova validação;

expansão controlada;

priorização da Release 1;

revisão de decisões;

reavaliação de premissas.

Alterações estruturais deverão ser formalizadas nos documentos
correspondentes.

**24. Governança**

Não permitir alterações informais de:

arquitetura;

escopo do MVP;

segurança;

permissões;

modelo de dados;

decisões dos ADRs.

O piloto é um mecanismo de validação e aprendizado.

Não é mecanismo para alteração informal do produto.

**25. Princípio de decisão**

Para qualquer solicitação surgida durante o piloto, perguntar:

**Isso é necessário para que o produto cumpra sua finalidade como SaaS
genérico?**

Não utilizar como critério principal:

<span dir="rtl">“</span>A JR Box solicitou.”

A necessidade deve ser avaliada pela perspectiva do produto.

**26. Resultado esperado**

Ao final da execução do piloto deverá existir evidência suficiente para
determinar se o MVP:

funciona em operação real;

suporta o fluxo principal;

preserva dados;

mantém rastreabilidade;

atende às responsabilidades dos usuários;

trata exceções;

mantém segurança e isolamento;

possui condições de evolução.

**27. Regra final para implementação**

O desenvolvimento e a operação do piloto deverão obedecer
simultaneamente aos ADRs:

ADR-001 — Usuários / Permissões;

ADR-002 — MVP e Escopo do Produto;

ADR-003 — Cliente-Piloto;

ADR-004 — Fiscal;

ADR-005 — Offline;

ADR-007 — Notificações;

ADR-008 — Plataforma do aplicativo de campo.

Em caso de conflito entre uma solicitação operacional do piloto e uma
decisão arquitetural aprovada, **não alterar automaticamente a
arquitetura**.

Registrar a necessidade e encaminhá-la pelo processo de governança.

**28. Referência**

Este prompt deriva do:

**ADR-003 — Cliente-Piloto — Versão 2.1**

**Status:** APROVADO

O ADR permanece como documento oficial da decisão.

Este prompt representa a tradução da decisão em requisitos operacionais
e de implementação.

**Cliente-piloto:** JR Box\
**Responsável interno:** Rafael\
**Período:** 01/10/2026 a 15/10/2026

**Princípio central:**

**O piloto valida o produto; não transforma o produto em um projeto
exclusivo para o cliente-piloto.**
