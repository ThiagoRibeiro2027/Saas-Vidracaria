**PROMPT DE DESENVOLVIMENTO**

**TÓPICO 12 — BI — BUSINESS INTELLIGENCE**

**1. OBJETIVO**

Desenvolver o módulo de Business Intelligence (BI) do SaaS industrial
multiempresa.

O BI deverá transformar dados operacionais, comerciais, produtivos, de
estoque, suprimentos, qualidade, logística e financeiros em informações
gerenciais para acompanhamento, comparação, identificação de desvios,
análise de causas, análise de impactos, identificação de riscos e
oportunidades e suporte à tomada de decisão.

O BI NÃO deverá substituir os módulos operacionais nem duplicar suas
regras de negócio.

O BI deverá consumir os dados oficiais dos módulos existentes e
preservar rastreabilidade até sua origem.

**2. PRINCÍPIOS FUNDAMENTAIS**

Implementar obrigatoriamente:

BI como camada analítica e gerencial.

Não duplicar regras de negócio dos módulos operacionais.

KPIs oficiais com definição centralizada.

Respeito integral às permissões do usuário.

Isolamento multiempresa através de company_id.

Drill-down dos indicadores relevantes.

Análise de desvios.

Análise de causas quando houver dados suficientes.

Análise de impactos quando houver dados suficientes.

Diferenciação entre realizado, previsto e projetado.

Preservação do histórico necessário para análises temporais.

Metas configuráveis.

Alertas configuráveis por empresa.

Auditoria das configurações relevantes.

Recomendações analíticas sem execução automática de decisões.

Proibição de inventar dados, causas, indicadores ou conclusões.

**3. ESTRUTURA GERAL**

Criar dashboards padrão:

Executivo;

Comercial;

PCP e Produção;

Estoque;

Suprimentos;

Qualidade;

Expedição e Logística;

Financeiro.

Criar também construtor de dashboards personalizados.

**4. KPIs**

Criar estrutura centralizada para definição dos KPIs.

Cada KPI deverá possuir:

nome;

código;

descrição;

fórmula;

unidade;

origem;

periodicidade;

dimensões;

filtros;

comparação;

meta;

limites;

interpretação;

status;

versão;

data de vigência.

Um mesmo KPI deverá possuir uma única definição oficial.

Alterações de definição deverão gerar versionamento.

Preservar:

definição anterior;

nova definição;

usuário;

data/hora;

versão.

**5. FILTROS**

Permitir filtros globais e específicos por componente.

Filtros possíveis:

período;

empresa;

unidade;

filial;

cliente;

fornecedor;

vendedor;

produto;

família;

categoria;

região;

setor;

processo;

máquina;

OP;

pedido;

centro de custo;

projeto;

status;

responsável;

origem.

**6. PERÍODOS**

Disponibilizar:

hoje;

ontem;

semana atual;

semana anterior;

mês atual;

mês anterior;

trimestre;

semestre;

ano;

período personalizado.

Permitir comparação:

período anterior;

mesmo período do ano anterior;

meta;

orçamento;

previsão;

média histórica.

**7. CALENDÁRIO**

Permitir configuração de:

dias úteis;

dias corridos;

feriados;

calendário comercial;

calendário industrial.

Considerar o calendário configurado nos indicadores aplicáveis.

**8. ANÁLISE TEMPORAL**

Disponibilizar:

evolução histórica;

tendência;

acumulado;

acumulado anual;

variação absoluta;

variação percentual;

média móvel;

crescimento;

sazonalidade;

comparação histórica.

**9. DRILL-DOWN**

Indicadores relevantes deverão permitir navegação:

**KPI → Desvio → Causa → Origem → Documento → Registro operacional**

O usuário deverá conseguir identificar de onde veio o valor apresentado.

Exemplo:

Rentabilidade → Cliente → Pedido → Item → Custo → Produção → Consumo →
Matéria-prima → Compra.

O drill-down deverá respeitar as permissões do usuário.

**10. ANÁLISE DE DESVIOS**

Para indicadores relevantes, apresentar:

valor realizado;

valor esperado;

diferença;

percentual;

tendência;

relevância.

Quando houver dados suficientes:

**Desvio → Causa → Origem → Impacto**

O sistema não deverá afirmar uma causa quando os dados não permitirem
sustentá-la.

**11. ANÁLISE DE IMPACTO**

Permitir identificar:

impacto operacional;

impacto financeiro;

impacto comercial;

impacto produtivo;

impacto logístico;

impacto na rentabilidade.

Quando possível, apresentar impacto financeiro estimado.

**12. SAÚDE DOS PROCESSOS**

Criar indicadores de saúde:

Comercial;

Produção;

Estoque;

Suprimentos;

Qualidade;

Logística;

Financeiro.

Status:

Normal;

Atenção;

Crítico.

Os critérios deverão ser configuráveis.

Permitir clicar no indicador e realizar drill-down até os problemas que
originaram o status.

**13. RENTABILIDADE**

Tratar rentabilidade como dimensão transversal do BI.

Permitir análise por:

cliente;

produto;

família;

pedido;

item;

vendedor;

unidade;

período.

Quando disponíveis, considerar:

receita líquida;

matéria-prima;

componentes;

mão de obra;

produção;

processos terceirizados;

perdas;

frete;

comissão;

demais custos diretamente atribuíveis.

Indicador básico:

**Rentabilidade = Receita Líquida − Custos aplicáveis**

**Margem % = Rentabilidade ÷ Receita Líquida × 100**

Preparar arquitetura para inclusão futura de novos componentes de custo.

**14. DASHBOARD COMERCIAL**

Implementar indicadores de:

faturamento;

pedidos;

itens;

ticket médio;

preço médio;

clientes;

vendedores;

produtos;

famílias;

categorias;

regiões;

origens;

crescimento;

ABC;

concentração.

**Clientes**

Ranking por:

faturamento;

pedidos;

margem;

rentabilidade;

ticket;

frequência;

crescimento;

participação.

Identificar:

maiores clientes;

clientes em crescimento;

clientes em queda;

clientes inativos.

**Vendedores**

Analisar:

faturamento;

pedidos;

ticket;

margem;

rentabilidade;

clientes;

novos clientes;

conversão;

crescimento;

carteira.

**Cotações**

Analisar:

quantidade;

valor;

convertidas;

perdidas;

abertas;

conversão por quantidade;

conversão por valor.

Analisar por:

vendedor;

cliente;

produto;

família;

período;

origem;

faixa de valor.

Permitir motivos de perda configuráveis.

**Funil**

Utilizar os estados reais dos processos existentes.

Não criar um segundo processo comercial paralelo.

**Margem e rentabilidade**

Analisar:

cliente;

produto;

família;

pedido;

item;

vendedor;

período.

Criar matriz:

**Volume × Margem × Rentabilidade**

**15. DASHBOARD PCP E PRODUÇÃO**

Implementar:

produção planejada;

produção realizada;

OPs;

cumprimento de prazo;

produção parcial;

produtividade;

eficiência;

capacidade;

utilização;

ociosidade;

sobrecarga;

gargalos;

paradas;

setup;

perdas;

retrabalho;

custo;

rentabilidade industrial.

Comparar:

**Planejado × Realizado**

Analisar desvios de:

quantidade;

prazo;

horas;

consumo;

perdas.

**Produtividade**

Permitir metodologias configuráveis:

peças/hora;

metros/hora;

kg/hora;

unidades/hora;

outras unidades aplicáveis.

**Paradas**

Analisar:

quantidade;

duração;

frequência;

máquina;

setor;

processo;

motivo;

impacto.

**Setup**

Analisar:

quantidade;

duração;

média;

máquina;

processo;

família;

impacto.

**Custos**

Decompor, quando disponível:

matéria-prima;

componentes;

mão de obra;

processos;

terceiros;

perdas;

outros custos configuráveis.

**16. DASHBOARD ESTOQUE**

Implementar:

quantidade;

valor;

mínimo;

máximo;

cobertura;

giro;

ABC;

ruptura;

excesso;

estoque parado;

consumo;

perdas;

inventários;

divergências;

reservas;

disponível;

trânsito.

Separar obrigatoriamente:

**Estoque físico ≠ Reservado ≠ Disponível**

Utilizar a metodologia oficial de valorização definida pelo módulo de
estoque.

**Cobertura**

Permitir cálculo baseado em:

consumo histórico;

média;

demanda planejada;

previsão.

**Estoque parado**

Períodos configuráveis:

30;

60;

90;

180;

365 dias;

personalizado.

**17. DASHBOARD SUPRIMENTOS**

Implementar:

compras;

pedidos de compra;

fornecedores;

preços;

prazos;

lead time;

pontualidade;

qualidade;

concentração;

compras emergenciais;

necessidade × compra × recebimento;

desempenho;

economia potencial;

risco.

**Fornecedor**

Avaliar:

preço;

prazo;

pontualidade;

qualidade;

quantidade correta;

devoluções;

histórico.

Permitir pesos configuráveis.

**Matriz de decisão**

Permitir comparar fornecedores por critérios ponderados.

O sistema NÃO deverá escolher automaticamente o fornecedor simplesmente
pelo menor preço.

**18. DASHBOARD QUALIDADE**

Implementar:

inspeções;

aprovações;

rejeições;

não conformidades;

frequência;

severidade;

recorrência;

Pareto;

retrabalho;

perdas;

reclamações;

devoluções;

custo da não qualidade.

Analisar por:

produto;

família;

processo;

máquina;

setor;

fornecedor;

cliente;

OP;

pedido;

motivo;

período.

**Custo da Não Qualidade**

Considerar, quando disponível:

material perdido;

mão de obra;

retrabalho;

processos adicionais;

terceiros;

transporte;

devoluções;

demais custos configuráveis.

Criar:

**Custo da Não Qualidade / Faturamento × 100**

**19. DASHBOARD EXPEDIÇÃO E LOGÍSTICA**

Implementar:

expedições;

entregas;

atrasos;

entregas parciais;

OTIF;

transportadoras;

frete;

regiões;

rotas;

ocorrências;

devoluções;

avarias.

**Prazo**

Comparar:

**Prazo prometido × Prazo realizado**

**OTIF**

Quando houver dados:

no prazo;

integral;

no prazo e integral.

**Frete**

Analisar:

total;

médio;

por pedido;

cliente;

região;

transportadora;

peso/volume;

percentual do faturamento.

**Rentabilidade**

Permitir avaliar:

**Venda − Custos aplicáveis − Custo logístico**

para análise de rentabilidade real.

**20. DASHBOARD FINANCEIRO**

Implementar:

contas a receber;

contas a pagar;

recebimentos;

pagamentos;

inadimplência;

fluxo de caixa;

previsão;

DRE;

margem;

rentabilidade;

despesas;

orçamento;

prazo médio;

concentração;

resultado.

Separar:

realizado;

previsto;

comprometido;

projetado.

**DRE**

Apresentar:

Receita Bruta\
→ Deduções\
→ Receita Líquida\
→ Custos\
→ Margem Bruta\
→ Despesas\
→ Resultado Operacional\
→ Resultado Gerencial.

**Break-even**

Calcular:

**Ponto de Equilíbrio = Custos Fixos ÷ Margem de Contribuição %**

Apresentar:

ponto de equilíbrio;

faturamento atual;

distância até o ponto de equilíbrio;

grau de segurança.

**21. COCKPIT EXECUTIVO**

Criar dashboard executivo contendo:

resultado;

saúde da empresa;

desvios;

causas;

impactos;

oportunidades;

riscos;

tendências;

metas;

prioridades.

**22. PRIORIDADES DE GESTÃO**

Criar ranking baseado em:

**Impacto × Urgência**

Exibir problemas relevantes.

Exemplo:

atraso com impacto financeiro;

queda de rentabilidade;

inadimplência;

ruptura;

excesso de estoque;

aumento de custo.

**23. RESUMO EXECUTIVO**

Criar geração de resumo baseado exclusivamente nos dados.

Exemplo conceitual:

<span dir="rtl">“</span>Faturamento acima da meta, porém rentabilidade
abaixo do esperado devido à redução da margem em determinados produtos.”

Cada afirmação deverá possuir rastreabilidade para os indicadores
utilizados.

Não inventar causas.

**24. OPORTUNIDADES**

Identificar, quando houver evidências:

clientes com potencial;

produtos rentáveis;

oportunidades de redução de custos;

oportunidades de compras;

redução de perdas;

redução de retrabalho;

redução de frete;

melhoria de produtividade;

produtos com margem inadequada.

**25. RISCOS**

Identificar:

concentração de clientes;

concentração de fornecedores;

ruptura;

capacidade insuficiente;

atrasos;

inadimplência;

margem baixa;

excesso de estoque;

dependência;

aumento de custos;

recorrência de problemas de qualidade.

Quando possível, classificar por:

**Probabilidade × Impacto**

**26. METAS**

Permitir metas por:

empresa;

unidade;

departamento;

equipe;

vendedor;

produto;

família;

cliente;

centro de custo.

Periodicidades:

diária;

semanal;

mensal;

trimestral;

anual.

Apresentar:

**Meta → Realizado → Desvio → Tendência**

**27. CONSTRUTOR DE DASHBOARDS**

Permitir ao usuário autorizado:

criar;

editar;

duplicar;

excluir;

favoritar;

definir dashboard inicial;

compartilhar.

Componentes:

KPI;

gráfico;

tabela;

ranking;

saúde;

comparação;

meta.

**28. FILTROS PERSONALIZADOS**

Permitir configuração individual por componente ou dashboard.

Suportar combinações complexas de filtros.

Exemplo:

Empresa + Unidade + Família + Região + Período.

**29. ALERTAS**

Permitir:

**Indicador → Condição → Limite → Período → Destinatário → Canal**

Classificar:

crítico;

atenção;

informativo.

Permitir detecção de anomalias baseada em histórico quando houver dados
suficientes.

**30. ALERTAS CONTEXTUALIZADOS**

O alerta deverá apresentar contexto.

Exemplo:

**Estoque crítico**

estoque atual;

mínimo;

consumo;

cobertura;

OPs afetadas;

pedidos afetados;

impacto estimado.

Quando possível:

**Problema → Causa → Impacto**

**31. NOTIFICAÇÕES**

A empresa deverá definir quais notificações utilizará.

Não assumir que todas as empresas utilizarão todos os canais.

Preparar arquitetura para:

notificações internas;

e-mail;

futuras integrações.

**32. RELATÓRIOS PROGRAMADOS**

Permitir agendar:

dashboards;

relatórios;

indicadores;

rankings;

resumo executivo.

Periodicidade configurável.

**33. RELATÓRIOS PERSONALIZADOS**

Permitir:

seleção de campos;

indicadores;

agrupamentos;

filtros;

ordenação;

período.

Exportações:

PDF;

Excel;

CSV.

**34. COMPARTILHAMENTO**

Permitir compartilhar por:

usuário;

equipe;

departamento;

unidade;

empresa.

Sempre respeitando as permissões de acesso aos dados.

**35. BENCHMARK INTERNO**

Quando houver múltiplas unidades:

Comparar:

unidade;

média;

melhor;

pior;

consolidado.

Indicadores:

faturamento;

margem;

rentabilidade;

produção;

produtividade;

qualidade;

estoque;

logística;

resultado.

**36. SNAPSHOT HISTÓRICO**

Preservar posições históricas relevantes.

Permitir análises como:

estoque em determinada data;

carteira em determinada data;

contas a receber em determinada data;

contas a pagar em determinada data;

metas históricas;

indicadores históricos.

O sistema não deverá depender exclusivamente do estado atual dos
registros para reconstruir posições históricas relevantes.

**37. COMENTÁRIOS GERENCIAIS**

Permitir comentários vinculados a:

KPI;

período;

dashboard;

ocorrência;

desvio.

Registrar:

autor;

data/hora;

conteúdo.

Preservar como histórico gerencial.

**38. ASSISTENTE ANALÍTICO**

Criar assistente capaz de responder perguntas sobre os dados autorizados
ao usuário.

Exemplos:

<span dir="rtl">“</span>Quais clientes reduziram mais o faturamento?”

<span dir="rtl">“</span>Por que a rentabilidade caiu?”

<span dir="rtl">“</span>Quais produtos estão abaixo da margem?”

<span dir="rtl">“</span>Quais pedidos estão em risco?”

<span dir="rtl">“</span>Qual fornecedor aumentou mais os preços?”

<span dir="rtl">“</span>Onde tivemos maior custo de não qualidade?”

O assistente deverá:

respeitar permissões;

utilizar dados oficiais;

utilizar KPIs oficiais;

apresentar números utilizados;

permitir drill-down;

indicar insuficiência de dados;

não inventar causas;

não inventar valores;

não criar fórmulas arbitrárias.

**39. LINGUAGEM NATURAL**

Permitir perguntas como:

<span dir="rtl">“</span>Mostre as vendas dos últimos seis meses.”

<span dir="rtl">“</span>Compare a rentabilidade das unidades.”

<span dir="rtl">“</span>Quais foram os maiores desvios de produção?”

O sistema deverá interpretar a pergunta, mas utilizar as definições
oficiais dos indicadores.

Se o usuário perguntar <span dir="rtl">“</span>qual é nossa margem?”,
utilizar a definição oficial de margem cadastrada.

**40. RECOMENDAÇÕES ANALÍTICAS**

Quando houver evidências suficientes, apresentar sugestões como:

revisar preço;

negociar fornecedor;

investigar cliente;

revisar estoque;

analisar processo;

reduzir perdas;

investigar qualidade;

reduzir custos.

As recomendações são assistivas.

Não executar automaticamente ações operacionais ou financeiras.

**41. GOVERNANÇA**

Separar permissões:

**Visualizar BI**

Pode consumir dashboards autorizados.

**Configurar BI**

Pode criar e configurar dashboards, metas e alertas conforme sua
permissão.

**Administrar BI**

Pode administrar:

KPIs oficiais;

fórmulas;

metas globais;

alertas globais;

governança;

versionamento.

**42. AUDITORIA**

Registrar:

criação de dashboard;

alteração;

exclusão;

compartilhamento;

KPI;

fórmula;

meta;

alerta;

relatório;

configuração;

comentários gerenciais.

Registrar usuário e data/hora.

**43. MULTIEMPRESA**

Todos os dados analíticos deverão respeitar:

company_id

Permitir, conforme autorização:

visão individual;

visão consolidada;

comparação entre empresas;

comparação entre unidades.

Nunca permitir vazamento de dados entre empresas.

**44. ATUALIZAÇÃO DOS DADOS**

Exibir:

última atualização;

período dos dados;

status da atualização.

Não apresentar dados incompletos como definitivos.

Quando houver processamento assíncrono, informar claramente o estado.

**45. PERFORMANCE**

A arquitetura deverá ser preparada para grandes volumes de dados.

Considerar:

agregações;

índices;

consultas otimizadas;

cache quando apropriado;

processamento assíncrono;

tabelas/views analíticas quando necessário.

A camada analítica não deverá prejudicar o desempenho dos módulos
transacionais.

**46. SEGURANÇA**

Todas as consultas do BI deverão respeitar:

autenticação;

autorização;

- company_id;

  RLS;

  permissões de módulo;

  permissões de unidade;

  permissões de dados sensíveis.

O usuário não poderá utilizar o BI para contornar restrições existentes
no sistema.

**47. INTEGRIDADE DOS DADOS**

Não duplicar dados desnecessariamente.

Sempre que possível, utilizar referências aos registros oficiais.

Preservar rastreabilidade entre:

**Indicador → Registro analítico → Registro operacional.**

**48. CRITÉRIOS DE ACEITE**

O Tópico 12 somente será considerado concluído quando:

dashboards padrão estiverem disponíveis;

dashboards personalizados funcionarem;

KPIs possuírem definição centralizada;

filtros funcionarem;

comparações funcionarem;

metas funcionarem;

alertas funcionarem;

drill-down funcionar;

análise de desvios funcionar;

análise de impacto funcionar;

indicadores de saúde funcionarem;

rentabilidade estiver disponível;

dashboards de todas as áreas estiverem implementados;

Cockpit Executivo estiver implementado;

benchmark interno estiver disponível;

snapshots históricos necessários estiverem disponíveis;

comentários gerenciais funcionarem;

Assistente Analítico funcionar dentro das permissões;

linguagem natural utilizar KPIs oficiais;

auditoria estiver funcionando;

versionamento de KPI estiver funcionando;

isolamento multiempresa estiver validado;

dados incompletos forem identificados corretamente;

exportações e relatórios programados funcionarem;

performance seja validada com volume representativo.

**49. RESULTADO ESPERADO**

O BI deverá evoluir de uma simples ferramenta de gráficos para uma
plataforma de **inteligência gerencial industrial**.

A experiência final deverá seguir o fluxo:

**DADOS**

↓

**KPIs**

↓

**DASHBOARDS**

↓

**DESVIOS**

↓

**CAUSAS**

↓

**IMPACTOS**

↓

**RISCOS / OPORTUNIDADES**

↓

**ALERTAS**

↓

**ANÁLISE**

↓

**RECOMENDAÇÃO**

↓

**DECISÃO**

O sistema deverá sempre privilegiar:

**clareza + rastreabilidade + segurança + flexibilidade + capacidade
analítica + suporte à decisão.**

**FIM DO TÓPICO 12 — BI**
