**Prompt Final de Implementação**

**ADR-002 — MVP e Escopo do Produto — Versão 2.1**

**1. Objetivo**

Implementar o MVP do SaaS de gestão operacional para empresas de
vidraçaria conforme o escopo definido no ADR-002 v2.1.

O objetivo do MVP é permitir a validação do produto em uma operação
real, utilizando dados, usuários, pedidos e processos reais.

O MVP **não deve ser tratado como um ERP completo**.

A prioridade é permitir que um pedido real percorra o fluxo operacional
central de ponta a ponta com segurança, integridade, rastreabilidade e
consistência.

Fluxo principal:

**Orçamento → Pedido → Conferência → Liberação → Engenharia → Estoque →
Produção → Controle necessário → Expedição → Obra/Instalação →
Aceite/Conclusão.**

**2. Regra fundamental de escopo**

Implementar somente o que for necessário para operar e validar o fluxo
operacional central.

Aplicar a seguinte regra:

Se o piloto consegue operar um pedido real sem determinada
funcionalidade, essa funcionalidade não deve ser incluída no MVP apenas
por conveniência ou antecipação.

Não antecipar funcionalidades de Release 1 ou Futuro.

Não transformar o MVP em um ERP completo.

**3. Classificação funcional**

Classificar funcionalidades em:

**MVP**

Necessárias para operar e validar o fluxo central.

**Release 1**

Necessárias para profissionalizar, ampliar ou escalar a operação.

**Futuro**

Funcionalidades avançadas, otimizações e recursos não essenciais.

A existência de um módulo no MVP não significa que todas as
funcionalidades desse módulo devam ser implementadas.

**4. Base / Estrutura**

Implementar no MVP:

estrutura multiempresa;

isolamento entre empresas;

identificação única de registros;

estrutura organizacional necessária;

usuários;

acesso;

parâmetros estruturais;

auditoria;

rastreabilidade.

A arquitetura deverá respeitar as definições do ADR-001.

**5. Cadastros**

Implementar:

clientes;

contatos;

produtos;

serviços;

materiais;

componentes;

fornecedores quando necessários;

unidades;

categorias;

estruturas técnicas;

equipes;

demais cadastros indispensáveis ao fluxo.

**6. Importação inicial de dados**

O MVP deverá permitir uma **importação inicial controlada dos dados
necessários para iniciar a operação do cliente-piloto**.

Podem ser importados, conforme necessidade:

clientes;

contatos;

produtos;

serviços;

materiais;

componentes;

fornecedores;

preços;

outros dados cadastrais indispensáveis.

**6.1 Formato**

Utilizar arquivos ou formatos estruturados.

A solução não precisa implementar uma plataforma completa de ETL.

**6.2 Validação**

Antes da efetivação, validar:

campos obrigatórios;

formatos;

tipos de dados;

referências;

duplicidades;

inconsistências;

relacionamentos;

regras básicas de negócio.

**6.3 Erros**

O usuário deverá conseguir identificar:

registros válidos;

registros inválidos;

campos com erro;

motivo do erro;

registros que precisam de correção.

A importação não deverá efetivar silenciosamente dados inválidos.

**6.4 Conferência**

Deverá existir uma etapa de conferência antes da efetivação definitiva
quando aplicável.

A responsabilidade pela conferência final deverá permanecer com o
responsável pelo processo.

**6.5 Auditoria**

Registrar:

quem realizou a importação;

quando;

origem dos dados;

quantidade de registros;

registros processados;

registros aceitos;

registros rejeitados;

erros encontrados;

resultado da operação.

**6.6 Duplicidades**

Evitar duplicação de registros quando houver critérios confiáveis de
identificação.

Não presumir que nome ou descrição isoladamente seja sempre uma chave
segura.

**6.7 Limites**

Não implementar no MVP:

migração histórica completa;

migração irrestrita de todo o legado;

ETL complexo;

sincronização permanente com sistemas externos;

integrações automáticas de importação que não sejam indispensáveis.

Caso uma integração seja posteriormente demonstrada como indispensável
ao fluxo real, ela deverá ser tratada conforme a governança de escopo do
ADR-002.

**7. Comercial / Orçamentos**

Implementar:

criação de orçamento;

itens;

quantidades;

medidas;

preços;

descontos;

condições comerciais básicas;

validade;

revisão;

aprovação;

histórico;

conversão em pedido.

Não implementar no MVP:

CRM avançado;

funil comercial avançado;

campanhas;

automações comerciais complexas;

comissionamento avançado.

**8. Pedidos**

Implementar:

conversão de orçamento;

conferência;

alterações controladas;

liberação;

prioridade;

histórico;

informações comerciais;

informações técnicas;

vínculo com engenharia;

vínculo com estoque;

vínculo com produção;

vínculo com expedição;

vínculo com instalação;

conclusão;

rastreabilidade ponta a ponta.

Preservar o histórico das alterações relevantes.

**9. Engenharia**

Implementar somente o necessário para transformar o pedido em informação
executável.

Incluir:

especificações técnicas;

medidas;

composição;

componentes;

materiais;

quantidades;

características técnicas;

necessidades de produção;

necessidades de materiais;

validações essenciais;

revisões;

histórico.

Dar atenção especial a:

barras;

cantoneiras;

perfis;

materiais lineares relevantes.

Não antecipar:

otimização avançada de corte;

simulações complexas;

algoritmos avançados de aproveitamento;

otimização matemática avançada.

**10. Estoque**

Implementar:

saldos;

entradas;

saídas;

reservas;

separação;

consumo;

movimentações;

ajustes controlados;

inventário;

rastreabilidade;

vínculo com pedidos;

vínculo com produção.

Garantir integridade dos saldos.

Movimentações relevantes devem possuir origem, responsável e
rastreabilidade.

**11. PCP / Produção**

Implementar:

geração de produção;

ordens/etapas;

liberação;

fila básica;

status;

apontamentos;

consumo de materiais;

quantidade produzida;

perdas/refugos básicos;

retrabalho;

conclusão;

rastreabilidade.

**11.1 Produção parcial**

Suportar obrigatoriamente:

quantidade planejada;

quantidade realizada;

quantidade pendente.

Não considerar uma produção parcial como concluída integralmente.

Não implementar:

sequenciamento avançado;

simulação de capacidade;

otimização matemática;

balanceamento avançado;

programação automática;

análise avançada de gargalos;

OEE;

manutenção.

**12. Expedição / Logística**

Implementar:

preparação;

separação;

conferência;

carregamento;

despacho;

entrega;

ocorrências;

rastreabilidade.

Suportar operações parciais com:

planejado;

realizado;

pendente.

Não implementar:

otimização de rotas;

telemetria;

gestão logística avançada.

**13. Obra / Instalação**

Implementar:

agendamento;

obra;

endereço;

equipe;

responsável;

agenda;

materiais;

execução;

observações;

ocorrências;

pendências;

execução parcial;

conclusão;

aceite;

evidências;

encerramento.

Preparar o módulo para funcionamento offline conforme ADR-005 e ADR-008.

**14. Usuários e Permissões**

Implementar conforme ADR-001.

Modelo fundamental:

**Usuário → Perfil → Permissões**

Considerar:

permissões;

escopo;

permissões individuais;

autoridade;

validade;

auditoria;

autorização no backend;

isolamento entre empresas.

Respeitar a regra:

**Restrição prevalece sobre concessão.**

Não confiar exclusivamente no frontend para controle de autorização.

**15. Configurações**

Implementar:

parâmetros da empresa;

unidades;

numerações;

status;

regras configuráveis;

parâmetros operacionais;

notificações;

configurações de permissões.

Evitar hard-code de regras que possam variar entre empresas.

**16. Notificações**

No MVP implementar:

notificações internas;

e-mail;

push conforme ADR-007 e ADR-008.

WhatsApp e SMS não podem bloquear o fluxo operacional principal.

A arquitetura deverá utilizar a camada centralizada de notificações
definida no ADR-007.

**17. Qualidade**

Implementar somente o necessário para controle operacional:

inspeção essencial;

não conformidade;

bloqueio;

aprovação/reprovação;

retrabalho;

liberação;

histórico.

Não implementar qualidade avançada no MVP.

**18. Financeiro**

Implementar somente:

valor do pedido;

condições de pagamento;

parcelas planejadas;

situação financeira básica;

registro de pagamento/recebimento quando necessário;

vínculo com pedido.

Não implementar:

contas a receber completas;

contas a pagar;

cobrança;

conciliação;

fluxo de caixa completo;

integração bancária;

DRE;

centros de custo avançados;

relatórios financeiros avançados.

**19. Fiscal**

Implementar somente o escopo fiscal efetivamente necessário para o fluxo
real do cliente-piloto, conforme ADR-004.

Não criar funcionalidades fiscais por antecipação.

A arquitetura deve permanecer preparada para evolução futura.

**20. Indicadores**

Implementar somente indicadores operacionais básicos necessários ao
acompanhamento do fluxo.

Não implementar:

BI avançado;

dashboards analíticos complexos;

análises preditivas;

indicadores avançados de desempenho.

**21. Integrações**

Implementar somente integrações indispensáveis ao funcionamento do MVP.

Não criar integrações apenas porque podem ser úteis no futuro.

Integrações futuras deverão ser tratadas como evolução do produto.

**22. Abastecimento / Compras**

Não implementar o módulo completo de Compras no MVP.

Quando houver necessidade de aquisição:

registrar a necessidade;

identificar o material;

registrar quantidade;

permitir acompanhamento.

A compra poderá ocorrer externamente durante o MVP.

Não criar dependência artificial de uma Ordem de Compra para que o fluxo
de aquisição funcione.

**23. Funcionalidades proibidas no MVP**

Não implementar antecipadamente:

Compras completas;

Qualidade avançada;

Financeiro completo;

Fiscal completo além do necessário;

PCP avançado;

sequenciamento avançado;

simulação de capacidade;

otimização matemática;

OEE;

manutenção;

BI avançado;

CRM avançado;

automações avançadas;

IA;

funcionalidades preditivas;

integrações não essenciais;

otimizações avançadas de produção;

otimizações avançadas de corte.

**24. Fluxo mínimo obrigatório**

Validar o seguinte fluxo:

**Orçamento → Aprovação/Conversão → Conferência → Liberação → Engenharia
→ Reserva/Disponibilidade → Produção → Controle necessário → Expedição →
Instalação → Aceite/Conclusão → Encerramento.**

As etapas deverão compartilhar os dados necessários.

Evitar redigitação desnecessária.

**25. Rastreabilidade**

Preservar, quando aplicável:

responsável;

data/hora;

alterações;

aprovações;

histórico de status;

materiais;

produção;

expedição;

instalação;

ocorrências;

conclusão.

**26. Exceções obrigatórias**

O MVP deverá tratar, no mínimo:

material indisponível;

necessidade de aquisição;

produção parcial;

expedição parcial;

instalação parcial;

item reprovado;

retrabalho;

pendência;

atraso;

ocorrência de expedição;

ocorrência de instalação;

retorno;

cancelamento;

bloqueio.

Não presumir que o fluxo operacional será sempre linear.

**27. Dados e integridade**

O sistema deverá garantir:

consistência entre etapas;

integridade das quantidades;

rastreabilidade das movimentações;

isolamento entre empresas;

histórico das alterações relevantes;

identificação única dos registros;

controle de estados;

prevenção de duplicidades;

tratamento adequado de operações parciais.

**28. Critérios de aceite do MVP**

O MVP será considerado tecnicamente e funcionalmente aderente quando:

um pedido real puder percorrer o fluxo principal;

os dados forem preservados entre as etapas;

cada usuário puder executar suas responsabilidades;

bloqueios principais forem tratados;

houver rastreabilidade;

houver integridade dos dados;

houver isolamento entre empresas;

o núcleo da operação não depender de planilhas externas;

operações parciais forem corretamente representadas;

dados e usuários reais puderem ser utilizados;

os dados cadastrais necessários puderem ser importados de forma
controlada;

a importação inicial possuir validação, conferência e auditoria.

**29. Relação com o cliente-piloto**

O cliente-piloto deverá ser utilizado para validar o produto.

Não transformar o MVP em projeto específico para o cliente.

Novas necessidades deverão ser classificadas como:

defeito;

correção necessária;

necessidade essencial do produto;

melhoria/backlog;

necessidade específica do cliente.

Somente necessidades justificadas poderão alterar o escopo.

**30. Governança de alterações**

Nenhum módulo ou funcionalidade deverá ser acrescentado ao MVP apenas
por interpretação.

Alterações relevantes deverão registrar:

decisão anterior;

nova decisão;

motivo;

impacto funcional;

impacto técnico;

impacto no prazo;

consequências;

data;

responsável.

Preservar histórico das decisões.

Nunca apagar silenciosamente decisões anteriores.

**31. Prioridade de desenvolvimento**

Seguir a seguinte ordem:

fluxo operacional;

segurança;

integridade;

rastreabilidade;

estabilidade;

usabilidade;

produtividade;

suporte;

funcionalidades avançadas.

Estratégia:

**Validar → Aprender → Priorizar → Evoluir.**

**32. Princípio de implementação**

Não implementar funcionalidades apenas porque elas pertencem a módulos
existentes no produto.

O desenvolvimento deverá sempre verificar:

essa funcionalidade é necessária ao fluxo do MVP?

ela é necessária para segurança, integridade ou obrigação legal?

ela é necessária para validar a hipótese central?

existe uma forma operacionalmente aceitável de executar o processo fora
do SaaS durante o piloto?

Se a resposta indicar que a funcionalidade não é necessária, ela deverá
permanecer fora do MVP.

**33. Resultado esperado**

Ao final da implementação, o SaaS deverá ser capaz de controlar e
rastrear uma operação real de uma vidraçaria desde o orçamento até a
conclusão do pedido, sem exigir que todos os módulos do produto
definitivo estejam completos.

O sistema deverá ser pequeno o suficiente para validação rápida e
suficientemente completo para sustentar o fluxo operacional central.

**34. Referência da decisão**

Este prompt deriva do:

**ADR-002 — MVP e Escopo do Produto — Versão 2.1**

Status da decisão:

**APROVADO**

Este prompt não substitui o ADR.

O ADR permanece como documento oficial da decisão, suas justificativas,
alternativas, consequências e governança.

O presente documento traduz a decisão em requisitos de implementação.

**Regra final:**

**Implementar o mínimo necessário para provar, em operação real, que o
SaaS consegue controlar com segurança, integridade e rastreabilidade o
fluxo operacional central de uma vidraçaria.**
