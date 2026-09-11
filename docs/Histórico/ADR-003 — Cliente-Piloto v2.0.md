**PROMPT FINAL DE IMPLEMENTAÇÃO**

**ADR-003 — Cliente-Piloto**

**Versão:** 2.0\
**Status:** APROVADO\
**Data:** 09/09/2026\
**Responsável pela decisão:** Product Owner

**1. OBJETIVO**

Implementar a governança do cliente-piloto do SaaS de gestão operacional
para vidraçarias, utilizando o piloto como ambiente real e controlado
para validar o produto.

O cliente-piloto deverá permitir validar:

operação ponta a ponta;

aderência dos processos;

usabilidade;

regras de negócio;

integridade dos dados;

rastreabilidade;

permissões e segurança;

estabilidade;

desempenho;

integrações;

operações parciais;

exceções;

ocorrências;

valor operacional do produto.

**PRINCÍPIO FUNDAMENTAL**

**O piloto valida o produto; não define o produto.**

O piloto não deverá ser utilizado para transformar o SaaS em
desenvolvimento sob encomenda ou para criar funcionalidades exclusivas
sem avaliação formal.

**2. RELAÇÃO COM O MVP**

O escopo funcional do piloto deverá respeitar integralmente o **ADR-002
— MVP e Escopo do Produto**.

Não criar um MVP específico para o cliente-piloto.

Não ampliar o MVP automaticamente em função de solicitações realizadas
durante o piloto.

Se uma necessidade for identificada como essencial para que o produto
cumpra seu objetivo, deverá ser realizada análise formal conforme as
regras do ADR-002.

**Regra fundamental**

Se o piloto consegue executar um pedido real sem determinada
funcionalidade, essa funcionalidade não deverá ser considerada
automaticamente parte do MVP.

Qualquer alteração relevante do escopo deverá ser formalmente
registrada, justificada e avaliada quanto aos impactos funcionais,
técnicos e de cronograma.

**3. SELEÇÃO DO CLIENTE-PILOTO**

O cliente-piloto deverá ser representativo do mercado-alvo de
vidraçarias.

**Critérios obrigatórios**

O cliente deverá, preferencialmente:

atuar efetivamente como vidraçaria;

possuir operação real;

realizar pedidos reais;

permitir utilização do sistema em operações reais;

possuir usuários disponíveis;

permitir coleta estruturada de feedback;

participar da identificação e validação de problemas;

permitir acompanhamento dos resultados;

compreender que o piloto possui escopo limitado;

permitir utilização dos dados necessários de forma adequada e legal.

**Critérios desejáveis**

Priorizar empresas que possuam:

volume operacional suficiente;

variedade de produtos;

diferentes processos;

produção própria;

instalação;

diferentes perfis de usuários;

situações normais e excepcionais;

operações parciais;

reprocessamentos;

perdas;

rejeições;

recebimentos parciais;

expedições parciais;

ocorrências;

usuários-chave disponíveis;

responsável interno pelo piloto.

**Evitar**

Evitar empresas que:

dependam de processos incompatíveis com o produto;

exijam alto grau de customização;

não disponibilizem usuários;

não estejam dispostas a utilizar o sistema efetivamente;

esperem que o SaaS seja desenvolvido exclusivamente para suas
necessidades.

A representatividade não significa representar todas as vidraçarias
existentes.

O objetivo é possuir um ambiente suficientemente representativo para
validar as principais premissas do produto.

**4. GOVERNANÇA E RESPONSABILIDADES**

**4.1 Product Owner**

O Product Owner será responsável por:

interpretar o escopo;

avaliar solicitações;

classificar necessidades;

priorizar correções e melhorias;

decidir se determinada necessidade pertence ao produto padrão;

controlar o escopo do MVP;

preservar a coerência entre os ADRs;

decidir alterações relevantes;

manter a governança do produto.

O cliente-piloto não terá autoridade unilateral para alterar o produto.

**4.2 Responsável interno do cliente-piloto**

O cliente deverá indicar um responsável interno pelo piloto.

Esse responsável deverá:

organizar os usuários;

consolidar feedbacks;

comunicar problemas;

auxiliar na validação das regras;

acompanhar os resultados;

participar das avaliações periódicas;

apoiar a implantação.

Não terá autoridade para alterar unilateralmente o produto ou o MVP.

**4.3 Usuários do piloto**

Os usuários deverão representar, conforme a estrutura existente da
empresa:

comercial;

atendimento;

conferência;

engenharia;

estoque;

produção;

qualidade;

expedição;

instalação;

gestão.

Nem todas as funções precisam existir em todas as empresas.

**4.4 Equipe de desenvolvimento**

A equipe deverá:

corrigir defeitos;

analisar problemas de usabilidade;

avaliar solicitações;

preservar o escopo;

registrar decisões;

acompanhar estabilidade;

acompanhar desempenho;

proteger os dados;

controlar alterações;

evitar soluções específicas que prejudiquem a generalização do produto.

**5. CANAL DE COMUNICAÇÃO**

Deverá existir canal organizado para registrar:

erros;

dúvidas;

sugestões;

necessidades;

incidentes;

feedback;

solicitações de alteração.

Feedback informal não deverá ser considerado decisão de produto.

**Fluxo obrigatório**

**Feedback → Registro → Classificação → Análise → Decisão →
Implementação → Validação**

**6. ESCOPO OPERACIONAL DO PILOTO**

O piloto deverá priorizar o fluxo principal:

**Orçamento → Pedido → Conferência → Liberação → Engenharia → Estoque →
Produção → Qualidade → Expedição → Obra/Instalação → Conclusão**

Conforme aplicável à operação da empresa.

Também deverão ser observadas situações como:

falta de material;

produção parcial;

rejeição;

retrabalho;

perda;

expedição parcial;

instalação parcial;

pendências;

ocorrências;

cancelamentos.

O sistema deverá distinguir adequadamente:

planejado;

realizado;

pendente.

**7. DURAÇÃO E FASES**

O piloto deverá possuir:

data de início;

período inicial de avaliação;

data ou condição de revisão;

critérios de encerramento.

A duração exata será definida após a seleção do cliente-piloto.

Não criar um piloto indefinido.

**Fases**

Preparação;

Teste controlado;

Operação com pedidos reais;

Ampliação da utilização;

Operação efetiva;

Avaliação.

**8. TREINAMENTO E IMPLANTAÇÃO**

Antes da entrada em produção deverão ser realizados, conforme aplicável:

configuração da empresa;

criação dos usuários;

definição de perfis;

configuração de permissões;

preparação dos cadastros;

validação dos dados;

testes do fluxo principal;

preparação dos dispositivos;

treinamento.

O treinamento deverá ser adequado à função de cada usuário.

O treinamento não deverá ser utilizado para mascarar problemas de
usabilidade.

Se uma operação exigir treinamento excessivamente complexo, registrar
como possível problema de produto.

**9. ENTRADA EM PRODUÇÃO**

A implantação poderá ocorrer gradualmente:

**Preparação → Teste controlado → Primeiros pedidos reais → Ampliação →
Operação efetiva**

A estratégia deverá reduzir riscos sem impedir a utilização de dados e
operações reais.

Sempre que possível, alterações e correções não deverão interromper
operações em andamento.

Mudanças com potencial de impacto operacional deverão passar por
avaliação prévia.

**10. SUPORTE**

Durante o piloto deverá existir suporte estruturado.

As solicitações deverão ser classificadas como:

incidente;

defeito;

dúvida operacional;

problema de configuração;

melhoria;

nova funcionalidade.

Uma solicitação de suporte não implica automaticamente desenvolvimento.

**11. CONTROLE DE VERSÕES**

Toda alteração relevante deverá possuir controle de versão.

Quando uma alteração afetar o fluxo operacional, avaliar:

impacto;

necessidade de treinamento;

necessidade de migração;

compatibilidade com dados existentes;

risco de interrupção.

Manter histórico das versões utilizadas durante o piloto.

**12. CRITÉRIOS DE SUCESSO**

A avaliação deverá considerar:

**Operação**

pedidos processados;

percentual que percorreu o fluxo principal;

pedidos concluídos;

operações parciais;

retrabalhos;

bloqueios;

erros críticos;

ocorrências;

tempos por etapa;

intervenções manuais;

controles externos.

**Adoção**

usuários ativos;

frequência de utilização;

processos realizados no sistema;

funcionalidades utilizadas;

abandono de funcionalidades;

controles paralelos;

necessidade de suporte.

**Qualitativos**

Avaliar:

facilidade de uso;

clareza das telas;

quantidade de etapas;

velocidade;

compreensão das regras;

aderência ao processo;

dificuldades recorrentes;

funcionalidades ausentes;

funcionalidades desnecessárias;

confiança dos usuários.

Não definir metas numéricas arbitrárias antes da seleção do piloto.

As metas deverão ser estabelecidas de acordo com:

volume;

usuários;

processos;

período;

maturidade da implantação.

**13. REGISTRO DE PROBLEMAS E NECESSIDADES**

Cada ocorrência relevante deverá registrar, quando aplicável:

data e hora;

usuário;

empresa;

módulo;

processo;

pedido ou registro afetado;

descrição;

comportamento esperado;

comportamento observado;

evidências;

impacto operacional;

prioridade;

classificação;

responsável;

solução;

data de resolução;

validação.

**Classificações**

Utilizar:

Defeito;

Correção necessária;

Necessidade essencial do produto;

Melhoria;

Backlog;

Necessidade específica do cliente.

**14. PRIORIDADE**

A prioridade deverá considerar principalmente:

segurança;

integridade dos dados;

impossibilidade de executar o fluxo principal;

obrigação legal;

rastreabilidade;

impacto operacional;

usabilidade;

produtividade;

conveniência.

**15. REGRA DE GENERALIZAÇÃO**

Uma necessidade identificada no piloto deverá ser incorporada ao produto
padrão quando houver justificativa baseada, por exemplo, em:

recorrência no mercado;

necessidade comum às vidraçarias;

valor estratégico;

melhoria do fluxo padrão;

correção de uma premissa equivocada do produto;

coerência arquitetural.

Não incorporar uma funcionalidade apenas porque o cliente-piloto
solicitou.

**16. ALTERAÇÕES DE ESCOPO**

Qualquer alteração relevante deverá registrar:

escopo anterior;

novo escopo;

motivo;

impacto técnico;

impacto funcional;

impacto no cronograma;

impacto no piloto;

consequências;

funcionalidade removida ou postergada, quando houver;

responsável pela decisão;

data;

ADR afetado;

versão correspondente.

Diferenciar claramente:

**Correção de problema**\
de\
**Evolução do produto.**

**17. SEGURANÇA E DADOS REAIS**

O piloto poderá utilizar dados reais, desde que:

exista finalidade definida;

os usuários sejam autorizados;

seja aplicado o princípio do menor privilégio;

haja rastreabilidade;

os dados estejam adequadamente protegidos;

sejam respeitadas as regras aplicáveis de proteção de dados;

sejam controladas exportações e compartilhamentos.

Dados reais não deverão ser utilizados em ambientes ou funcionalidades
sem proteção compatível.

**Isolamento entre empresas**

O isolamento entre empresas deverá existir tecnicamente.

Não permitir acesso entre empresas sem autorização válida e explícita.

A proteção não poderá depender somente da interface.

Deverá existir proteção na camada de backend e dados.

**18. IDENTIDADE E AUDITORIA**

Cada usuário deverá possuir sua própria identificação.

Não utilizar compartilhamento indiscriminado de credenciais.

O acesso deverá considerar:

perfil;

permissões;

empresa;

unidade;

função;

validade.

Operações relevantes deverão possuir auditoria contendo, conforme
aplicável:

quem realizou;

o que foi realizado;

quando;

estado anterior;

novo estado;

registro afetado.

**19. INCIDENTES DE SEGURANÇA E INTEGRIDADE**

Incidentes relacionados a:

segurança;

isolamento;

integridade;

perda de dados;

inconsistência de dados;

deverão receber prioridade elevada.

Fluxo:

**Registro → Avaliação de impacto → Contenção → Correção → Verificação
dos dados → Documentação → Medidas preventivas**

O piloto não deverá ser tratado como ambiente de segurança reduzida.

**20. AVALIAÇÃO FINAL**

Ao final do período definido deverão ser avaliados:

fluxo ponta a ponta;

integridade dos dados;

rastreabilidade;

permissões;

operações parciais;

exceções;

estabilidade;

desempenho;

incidentes;

controles paralelos;

autonomia dos usuários;

aderência ao processo;

necessidades identificadas.

**21. RESULTADO DO PILOTO**

O resultado deverá ser classificado como:

**A — Piloto aprovado**

O produto demonstrou capacidade de sustentar o fluxo operacional
definido.

**B — Piloto aprovado com ajustes**

O produto demonstrou viabilidade, mas possui ajustes necessários.

**C — Reavaliação necessária**

Não existem evidências suficientes ou existem problemas relevantes que
exigem nova avaliação.

**D — Piloto não aprovado**

Existem problemas estruturais ou limitações que impedem o cumprimento do
objetivo.

**22. CRITÉRIOS PARA NÃO APROVAÇÃO**

Não considerar como motivo suficiente de reprovação a simples ausência
de funcionalidades desejadas.

A reprovação deverá considerar principalmente:

impossibilidade de executar o fluxo principal;

falhas graves de segurança;

perda ou inconsistência relevante de dados;

ausência de rastreabilidade necessária;

incapacidade de tratar situações essenciais;

incompatibilidade estrutural com o processo-alvo;

inviabilidade operacional comprovada;

problemas que não possam ser solucionados pela evolução normal do
produto.

**23. ENCERRAMENTO**

O piloto deverá ser formalmente encerrado somente quando:

o período tiver sido concluído ou a condição de encerramento atingida;

os resultados tiverem sido analisados;

os problemas relevantes tiverem sido classificados;

as principais necessidades tiverem recebido decisão;

os indicadores disponíveis tiverem sido consolidados;

a conclusão tiver sido registrada;

houver decisão formal sobre a continuidade.

O encerramento não exige que todas as demandas tenham sido
implementadas.

**24. REGISTRO FINAL DO PILOTO**

Deverá ser mantido registro contendo:

identificação do cliente;

período;

versão do produto;

escopo;

usuários;

resultados;

indicadores;

incidentes;

problemas;

decisões;

funcionalidades incorporadas;

funcionalidades postergadas;

necessidades específicas;

lições aprendidas;

decisão final;

responsável;

data.

**25. ROADMAP**

As informações do piloto poderão:

gerar correções;

gerar melhorias;

criar itens de backlog;

alterar prioridades;

antecipar funcionalidades;

alterar requisitos;

gerar novos ADRs.

Entretanto:

**A solicitação do cliente-piloto não determina automaticamente sua
inclusão ou prioridade no roadmap.**

O roadmap permanece sob responsabilidade da governança do produto.

**26. NOVOS ADRs**

Se o piloto revelar necessidade de alteração estrutural relevante
envolvendo:

arquitetura;

segurança;

modelo de dados;

integração;

comportamento transversal;

decisões técnicas fundamentais;

deverá ser avaliada a criação ou atualização de ADR específico.

Não realizar mudança estrutural relevante apenas como correção informal.

**27. PROIBIÇÃO DE CUSTOMIZAÇÃO INFORMAL**

Não implementar alterações específicas para o cliente-piloto sem:

registro;

classificação;

análise;

avaliação de impacto;

responsável pela decisão;

definição de abrangência.

Não criar comportamento incompatível com o produto padrão sem decisão
formal.

**28. RISCOS E MITIGAÇÕES**

Considerar, no mínimo:

**Customização excessiva**

Mitigar por meio de classificação, análise de generalização e controle
formal.

**Expansão indevida do MVP**

Aplicar obrigatoriamente o ADR-002.

**Dependência de um único cliente**

Avaliar necessidades sob a perspectiva do mercado-alvo.

**Dados inadequados**

Preparar e validar os dados.

**Baixa adoção**

Utilizar treinamento, acompanhamento e análise das causas.

**Problemas de segurança**

Aplicar integralmente os controles do produto.

**Conclusões prematuras**

Avaliar evidências durante período adequado e distinguir problemas de
implantação, usabilidade, defeitos e limitações estruturais.

**29. ENCERRAMENTO E GOVERNANÇA**

O cliente-piloto é um ambiente controlado para validar o SaaS em
condições reais.

O piloto:

valida o produto;

não redefine o produto;

não transforma o SaaS em desenvolvimento sob encomenda;

não expande automaticamente o MVP;

não determina sozinho o roadmap;

não substitui a governança do produto.

Ao mesmo tempo, os resultados do piloto deverão ser tratados como fonte
relevante de evidências para:

correções;

evolução;

priorização;

decisões de produto;

novos ADRs;

planejamento futuro.

**PRINCÍPIO FINAL**

**O cliente-piloto ajuda a provar se o produto funciona na realidade de
uma vidraçaria. A governança do produto decide o que o produto deve se
tornar.**

**30. CONTROLE DE VERSÃO DO ADR**

Este ADR deverá possuir controle de versões.

Toda revisão deverá registrar:

versão;

data;

motivo da alteração;

pontos alterados;

impacto;

responsável.

As versões anteriores deverão permanecer preservadas.

Não realizar exclusão silenciosa de decisões anteriormente aprovadas.

**31. DEPENDÊNCIAS**

Este ADR deverá ser implementado em conjunto com:

- **ADR-001 — Usuários, Perfis e Permissões**

- **ADR-002 — MVP e Escopo do Produto**

- **ADR-004 — Fiscal**

- **ADR-005 — Operação Offline**

- **ADR-007 — Notificações**

- **ADR-008 — Plataforma de Campo**

Em caso de conflito entre ADRs aprovados, não resolver a divergência
apenas por interpretação durante a implementação.

A divergência deverá ser identificada e formalmente resolvida.

**32. REGRA FINAL DE IMPLEMENTAÇÃO**

Antes de implementar qualquer funcionalidade, fluxo, regra ou alteração
relacionada ao cliente-piloto:

verificar este ADR;

verificar o ADR-002;

verificar os demais ADRs aplicáveis;

verificar se a necessidade é defeito, correção, necessidade essencial,
melhoria, backlog ou necessidade específica;

avaliar impacto no produto padrão;

evitar customização informal;

registrar decisões relevantes;

preservar o histórico das versões;

validar a alteração após implementação.

**Não interpretar uma necessidade do cliente-piloto como autorização
automática para ampliar o produto.**

**Não utilizar o piloto para contornar decisões já aprovadas nos ADRs.**

**O piloto deve produzir evidências para evolução do SaaS, mantendo a
integridade do produto padrão e do seu escopo.**
