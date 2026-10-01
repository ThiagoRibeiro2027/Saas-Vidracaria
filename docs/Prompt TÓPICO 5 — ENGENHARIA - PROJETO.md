**PROMPT DEFINITIVO DE DESENVOLVIMENTO**

**TÓPICO 5 — ENGENHARIA / PROJETO**

**1. CONTEXTO**

Você está desenvolvendo um SaaS para gestão industrial.

Os módulos anteriores já definiram o fluxo Comercial → Pedido e
PCP/Fábrica → Produção.

O presente módulo corresponde ao **Tópico 5 — Engenharia / Projeto**.

A Engenharia é o núcleo responsável pela **definição técnica oficial do
que será produzido**.

O desenvolvimento deste módulo deve respeitar integralmente as regras
abaixo.

**2. PRINCÍPIO FUNDAMENTAL**

A regra central do módulo é:

**Engenharia define O QUE deve ser produzido. PCP/Fábrica define COMO e
QUANDO produzir.**

A definição técnica liberada pela Engenharia será a **fonte oficial para
fabricação**.

Nenhuma outra área poderá alterar diretamente:

BOM;

dimensões;

materiais;

componentes;

desenhos;

tolerâncias;

especificações técnicas.

Quando outra área identificar necessidade de alteração, deverá utilizar
o fluxo formal de **Solicitação de Engenharia**.

**3. FLUXO PRINCIPAL**

Implementar o seguinte fluxo:

**Pedido → Item do Pedido → Projeto → Produto/Configuração → Regras →
BOM Sugerida → Validação da Engenharia → BOM Definitiva → Revisão →
Aprovação → Liberação → PCP → OP → Fábrica**

A rastreabilidade deverá permitir:

**Cliente → Obra → Pedido → Item → Projeto → Revisão → BOM → OP →
Produção → Qualidade → Entrega**

Também deverá existir rastreabilidade reversa.

**4. RELACIONAMENTO COM O PEDIDO**

Um pedido poderá possuir vários itens.

Cada item poderá possuir um projeto de Engenharia.

Modelo:

**Pedido 1050**

Item 01 → Projeto ENG-1050-01

Item 02 → Projeto ENG-1050-02

Item 03 → Projeto ENG-1050-03

O projeto deverá manter vínculo permanente com:

cliente;

obra;

pedido;

item do pedido.

Não criar projeto sem origem definida, salvo quando permitido
explicitamente para projetos internos/modelos.

**5. PRODUTO X PROJETO**

**Produto**

Representa uma solução técnica reutilizável.

Pode conter:

modelo;

componentes;

subconjuntos;

materiais;

acessórios;

regras;

características configuráveis;

BOM-base;

requisitos/processos tecnicamente necessários.

**Projeto**

Representa a aplicação específica de um produto para determinado
cliente/obra/pedido/item.

O projeto terá sua própria:

configuração;

BOM;

documentação;

desenhos;

revisões;

aprovações;

histórico.

**Regra**

Alterações realizadas em um projeto não poderão alterar automaticamente
o Produto de origem.

Arquitetar o sistema para permitir futuramente que um projeto validado
seja promovido a modelo/template mediante autorização.

**6. BIBLIOTECA TÉCNICA**

Criar biblioteca técnica central e reutilizável.

Deverá suportar:

produtos;

modelos;

conjuntos;

subconjuntos;

componentes;

peças;

matérias-primas;

insumos;

consumíveis;

perfis;

chapas;

barras;

ferragens;

acessórios;

processos;

operações tecnicamente necessárias.

Evitar duplicidade desnecessária de códigos.

**7. CADASTRO DOS ITENS**

Cada item deverá possuir estrutura adequada à sua natureza.

Campos mínimos gerais:

código;

descrição;

tipo;

unidade;

status;

características técnicas;

especificações;

dimensões, quando aplicável;

material, quando aplicável;

observações;

documentos;

histórico.

Permitir campos específicos conforme o tipo do item.

**8. STATUS DOS ITENS**

Implementar pelo menos:

Ativo;

Em aprovação;

Bloqueado;

Obsoleto.

Itens bloqueados ou obsoletos:

não podem ser utilizados automaticamente em novas definições sem
validação;

não podem ser substituídos automaticamente;

podem gerar alerta;

podem apresentar alternativas autorizadas.

**9. ITENS SIMILARES**

Ao criar novo item técnico, pesquisar itens existentes com
características semelhantes.

Quando houver correspondência relevante, apresentar sugestão de
similaridade.

Exemplo:

<span dir="rtl">“</span>Encontrado item com 96% de similaridade.”

Apresentar opções:

Usar existente;

Duplicar existente;

Criar novo.

A decisão final será do usuário autorizado.

**10. DUPLICAÇÃO DE ITENS**

Permitir duplicação de:

insumos;

componentes;

matérias-primas;

peças;

perfis;

chapas;

barras;

ferragens;

acessórios;

subconjuntos;

demais itens técnicos compatíveis.

A duplicação deverá:

gerar novo código;

copiar dados técnicos compatíveis;

permitir edição;

preservar o original;

registrar a origem.

Exemplo:

C-1025 → C-1187

Registrar:

C-1187 criado a partir de C-1025.

**11. DUPLICAÇÃO DE PROJETOS**

Permitir:

**Duplicar Projeto / Criar baseado em projeto existente.**

Copiar, conforme permissões:

configuração;

estrutura;

BOM;

documentos;

desenhos;

informações técnicas.

O novo projeto deverá possuir:

nova identidade;

nova revisão;

novo histórico.

Nunca alterar o projeto original.

**12. CONFIGURADOR DE PRODUTO**

Implementar configuração através de características.

Exemplos:

largura;

altura;

material;

acabamento;

fechamento;

número de módulos;

vidro;

acessórios;

ferragens;

demais características técnicas.

A configuração alimentará o motor de regras.

**13. MOTOR DE REGRAS**

As regras devem ser configuráveis pela empresa.

Exemplos:

largura \> X → adicionar componente estrutural;

módulos = 4 → adicionar quatro conjuntos de ferragens;

acabamento = inox → utilizar componentes compatíveis.

As regras devem ser armazenadas como dados configuráveis.

Não criar solução que dependa exclusivamente de alterações de código
para cada nova regra empresarial.

**Princípio**

**O sistema sugere. A Engenharia decide.**

**14. VERSIONAMENTO DAS REGRAS**

As regras deverão possuir versão.

Nova versão de regra:

não altera projetos históricos;

não altera revisões liberadas;

não altera automaticamente projetos em desenvolvimento.

Para projetos em desenvolvimento, o sistema poderá alertar:

<span dir="rtl">“</span>Existe nova versão da regra disponível.”

A Engenharia decidirá se deseja recalcular.

**15. BOM HIERÁRQUICA**

Implementar BOM hierárquica.

Estrutura:

**Produto**\
→ **Conjunto**\
→ **Subconjunto**\
→ **Componente/Peça**\
→ **Matéria-prima/Consumível**

Cada nível poderá possuir composição própria.

A BOM deverá permitir:

quantidade;

unidade;

item;

material;

dimensões;

especificações;

observações;

relacionamento entre níveis.

**16. BOM SUGERIDA**

A BOM sugerida será gerada a partir de:

**Produto + Configuração + Regras**

Ela deverá ser apresentada para análise da Engenharia.

A Engenharia poderá:

adicionar;

remover;

substituir;

alterar quantidade;

alterar material;

alterar dimensão;

ajustar composição.

**17. BOM DEFINITIVA**

Após validação da Engenharia, gerar a **BOM definitiva**.

A BOM definitiva representa a necessidade técnica oficial daquela
revisão.

Ela não representa:

programação;

lote;

OP;

sequência;

máquina;

estoque;

estratégia de corte.

**18. NECESSIDADE TÉCNICA X ESTOQUE**

Nunca alterar a necessidade técnica em função do estoque disponível.

Exemplo:

Necessidade:

25 barras.

Estoque:

18 barras.

A BOM continua indicando:

25 barras.

Estoque/Compras/PCP deverão tratar a diferença.

**19. OTIMIZAÇÃO DE MATÉRIA-PRIMA**

A Engenharia informa a necessidade técnica e dimensões necessárias.

PCP/Fábrica/Estoque poderão posteriormente definir:

aproveitamento;

corte;

sobras;

agrupamento;

reutilização de materiais;

otimização.

Exemplo:

Necessidade = 1.200 mm\
Barra disponível = 3.000 mm

A Engenharia registra 1.200 mm.

A estratégia para utilização dos 1.800 mm restantes não pertence à
Engenharia.

**20. DOCUMENTOS TÉCNICOS**

Permitir armazenar:

PDFs;

desenhos;

arquivos 2D;

arquivos 3D;

imagens;

memoriais;

especificações;

normas;

documentos do cliente;

fotos;

croquis;

planilhas;

outros arquivos técnicos.

Os arquivos recebidos pelo Comercial deverão acompanhar o projeto.

**21. ARQUIVOS DE TRABALHO E OFICIAIS**

Diferenciar:

**Arquivo de trabalho**

Pode ser alterado durante o desenvolvimento.

**Arquivo oficial**

Vinculado a revisão aprovada/liberada.

Arquivo oficial não poderá ser sobrescrito.

Alteração deverá gerar nova versão/revisão conforme o workflow.

**22. REVISÕES**

Implementar:

**Rev. 00 → Rev. 01 → Rev. 02 → Rev. 03…**

Nunca apagar ou sobrescrever revisão liberada.

Cada revisão deverá armazenar:

número;

data;

usuário;

motivo;

alterações;

BOM;

documentos;

aprovações;

status;

data de liberação.

**23. COMPARAÇÃO DE REVISÕES**

Permitir comparar revisões considerando:

dimensões;

materiais;

quantidades;

componentes;

subconjuntos;

processos;

documentos;

BOM.

**24. ANÁLISE DE IMPACTO**

Antes de liberar nova revisão, avaliar:

pedidos em aberto;

situação real da produção;

OPs existentes;

itens já produzidos;

itens ainda não produzidos;

materiais separados;

materiais consumidos;

documentos que precisam ser atualizados.

**Regra**

A análise deve priorizar **pedidos em aberto e situação real da
produção**.

Pedidos encerrados permanecem no histórico, mas não devem gerar alerta
operacional.

Alterações em componentes compartilhados não devem bloquear
automaticamente o sistema.

O sistema deve apresentar o impacto e exigir aprovação conforme
criticidade configurada.

**25. WORKFLOW**

Implementar workflow configurável:

**Em desenvolvimento**\
→ **Em revisão**\
→ **Aguardando aprovação**\
→ **Aprovado**\
→ **Liberado para produção**

Também suportar:

Em alteração;

Bloqueado;

Cancelado;

Obsoleto.

**26. APROVADO X LIBERADO**

Não tratar os conceitos como equivalentes.

**Aprovado**

Definição técnica validada.

**Liberado**

Definição técnica oficialmente autorizada para fabricação.

**27. REQUISITOS DE LIBERAÇÃO**

A empresa poderá configurar requisitos obrigatórios, incluindo:

aprovação interna;

aprovação do cliente;

BOM validada;

desenhos;

documentos;

dimensões;

requisitos de qualidade;

outros critérios técnicos.

Não permitir liberação enquanto requisitos obrigatórios estiverem
pendentes.

**28. PACOTE TÉCNICO DE FABRICAÇÃO**

Ao liberar uma revisão, gerar referência técnica contendo:

projeto;

revisão;

BOM;

desenhos;

documentos;

materiais;

componentes;

processos/operações tecnicamente necessários;

restrições;

notas técnicas.

A Fábrica deverá identificar claramente:

**Projeto + Revisão que está sendo fabricada.**

**29. ENGENHARIA NÃO DEFINE O ROTEIRO PRODUTIVO**

Engenharia poderá definir:

processo tecnicamente necessário;

operação tecnicamente necessária;

requisito;

restrição;

característica técnica.

Mas não deverá definir:

sequência produtiva;

máquina;

recurso;

lote;

agrupamento;

programação;

data;

estratégia de produção.

Essas decisões pertencem ao PCP/Fábrica.

**30. SOLICITAÇÃO DE ENGENHARIA**

Criar entidade formal de Solicitação de Engenharia.

Origem possível:

Comercial;

Engenharia;

PCP;

Fábrica;

Qualidade;

outros usuários autorizados.

Tipos:

novo projeto;

alteração;

dúvida técnica;

correção;

problema de fábrica;

solicitação de cliente;

alteração de material;

alteração dimensional;

alteração de componente;

ajuste de fabricação;

revisão documental.

**31. WORKFLOW DA SOLICITAÇÃO**

Fluxo:

**Criada → Triagem → Análise → Desenvolvimento/Alteração → Revisão →
Aprovação → Concluída**

Estados adicionais:

Aguardando informação;

Aguardando cliente;

Aguardando aprovação;

Rejeitada;

Cancelada.

<span dir="rtl">“</span>Aguardando informação” não deve ser considerado
automaticamente atraso da Engenharia.

**32. COMUNICAÇÃO TÉCNICA**

Registrar no projeto/solicitação:

comentários;

perguntas;

respostas;

observações;

decisões;

anexos;

aprovações.

Mudanças com impacto produtivo não podem ser consideradas válidas
somente por:

WhatsApp;

e-mail;

conversa verbal.

Devem passar pelo fluxo formal.

**33. APROVAÇÃO DO CLIENTE**

Registrar:

usuário;

data;

revisão;

documento/informação aprovada;

conteúdo aprovado.

Se a aprovação já tiver sido realizada pelo Comercial, utilizar a
informação existente em vez de duplicar o processo.

**34. BLOQUEIO**

Usuários autorizados poderão bloquear projetos críticos.

Conforme configuração da empresa, o bloqueio poderá impedir:

novas etapas produtivas;

novas OPs relacionadas;

utilização da revisão bloqueada.

**35. INTEGRAÇÃO COM PCP**

Engenharia fornece:

BOM;

revisão;

desenhos;

documentos;

materiais;

componentes;

processos tecnicamente necessários;

restrições;

informações técnicas.

PCP define:

OP;

quantidade por OP;

lote;

agrupamento;

sequência;

recursos;

datas;

produção parcial;

estratégia produtiva.

**36. OP E REVISÃO**

Esta regra é obrigatória:

**Toda OP deverá registrar explicitamente a revisão técnica que originou
sua produção.**

Exemplo:

Projeto ENG-458\
Rev. 02\
→ OP-1250

Se posteriormente for criada Rev. 03, a OP-1250 continuará
historicamente vinculada à Rev. 02.

Nunca substituir retroativamente a revisão utilizada por uma OP.

**37. UM PROJETO → VÁRIAS OPS**

Permitir:

**1 Projeto → N OPs**

Exemplo:

Projeto = 100 unidades

PCP pode criar:

OP 001 = 40;

OP 002 = 30;

OP 003 = 30.

A Engenharia não precisa criar um novo projeto para cada OP.

**38. PRODUÇÃO PARCIAL**

A produção parcial pertence ao PCP/Fábrica.

A BOM representa a necessidade técnica total do projeto/item.

PCP poderá dividir a produção em diversas OPs sem alterar a definição
técnica.

**39. RETORNO DA FÁBRICA**

Fábrica poderá abrir solicitação para:

problema de fabricação;

erro de desenho;

problema de montagem;

problema dimensional;

problema de material;

necessidade de alteração;

melhoria.

Se não houver alteração técnica:

**Engenharia responde à solicitação.**

Se houver alteração:

**Fábrica → Solicitação → Engenharia → Nova revisão, se necessária →
Aprovação → Nova liberação**

**40. QUALIDADE**

Qualidade utilizará:

desenhos;

tolerâncias;

materiais;

características críticas;

critérios de aceitação;

especificações.

Permitir vínculo:

**NC → Projeto → Revisão → Componente**

Exemplo:

NC-0258\
→ Projeto ENG-458\
→ Rev. 03\
→ C-1025

**41. CMV TÉCNICO**

Calcular CMV técnico baseado exclusivamente nos materiais/componentes
técnicos diretos:

matérias-primas;

consumíveis;

componentes;

demais materiais técnicos diretos.

Não incluir:

mão de obra;

impostos;

custos indiretos;

despesas;

margem;

preço de venda.

Exemplo:

Perfil = R\$ 200\
Chapa = R\$ 160\
Ferragem = R\$ 100\
Consumível = R\$ 40

**CMV técnico = R\$ 500**

**42. FILA DA ENGENHARIA**

Criar fila central.

Campos mínimos:

número;

cliente;

obra;

pedido;

item;

tipo;

responsável;

prioridade;

entrada;

prazo;

status;

aprovação;

previsão de conclusão;

conclusão real.

Prioridades:

Crítica;

Alta;

Normal;

Baixa.

Status de prazo:

No prazo;

Próximo do vencimento;

Atrasado;

Concluído.

**43. RESPONSÁVEIS**

Permitir:

responsável principal;

participantes auxiliares;

equipe.

No MVP, capacidade/esforço poderá ser básico.

**44. DEPENDÊNCIAS**

Permitir identificar dependências:

informação comercial;

dimensão;

aprovação do cliente;

definição de material;

retorno de fornecedor;

outra área.

Quando aguardando dependência externa, não classificar automaticamente
como atraso da Engenharia.

**45. RISCO DE PRODUÇÃO**

Relacionar Engenharia aos prazos industriais.

Exemplo:

Produção prevista para sexta-feira.

Projeto ainda não liberado.

Sistema deverá apresentar:

**RISCO DE PRODUÇÃO**

**46. RASTREABILIDADE**

Implementar rastreabilidade completa:

**Cliente → Obra → Pedido → Item → Projeto → Revisão → BOM → OP →
Produção → Qualidade → Entrega**

Também permitir consulta reversa.

Ao consultar item do pedido, apresentar:

projeto;

revisão;

BOM;

solicitações;

aprovação;

OPs;

produção parcial;

ocorrências;

retornos à Engenharia.

Ao consultar componente, apresentar:

projetos;

revisões;

pedidos em aberto;

OPs;

produção;

NCs;

solicitações;

alterações;

histórico.

**47. AUDITORIA**

Registrar automaticamente:

criação;

alteração;

duplicação;

bloqueio;

desbloqueio;

obsolescência;

aprovação;

rejeição;

liberação;

cancelamento;

alteração de BOM;

alteração de regra;

alteração de componente;

criação de revisão;

alteração documental.

Registrar:

**usuário + data/hora + ação + objeto + antes/depois quando aplicável +
motivo/comentário**

Histórico técnico não poderá ser apagado.

**48. PERMISSÕES**

Controlar por perfil:

criar;

editar;

duplicar;

bloquear;

aprovar;

liberar;

alterar BOM;

alterar regras;

alterar itens técnicos;

criar revisão;

consultar documentos;

abrir solicitações.

Implementar segregação de responsabilidades.

**49. NOTIFICAÇÕES**

As notificações deverão respeitar a arquitetura definida anteriormente:

**A empresa decide quais notificações deseja utilizar.**

O sistema poderá disponibilizar eventos como:

solicitação criada;

projeto aguardando informação;

aprovação pendente;

projeto próximo do prazo;

projeto atrasado;

risco de produção;

revisão liberada;

alteração solicitada.

A empresa deverá poder configurar quais utilizar e os respectivos
destinatários/regras, conforme infraestrutura de notificações já
definida no sistema.

**50. MVP**

O MVP deverá obrigatoriamente permitir:

criação de projeto;

vínculo Pedido/Item/Projeto;

Produto x Projeto;

biblioteca técnica;

cadastro de itens;

duplicação de itens;

duplicação de projetos;

configuração básica;

motor de regras básico;

versionamento básico das regras;

BOM hierárquica;

BOM sugerida;

BOM definitiva;

necessidade técnica;

revisão;

comparação básica de revisões;

análise básica de impacto;

documentos;

aprovação;

liberação;

pacote técnico;

Solicitação de Engenharia;

integração com PCP/Fábrica;

registro de revisão na OP;

integração básica com Qualidade;

CMV técnico;

fila de Engenharia;

alerta de risco de produção;

rastreabilidade;

auditoria;

permissões;

proteção do histórico.

**51. FORA DO MVP**

Não implementar como requisito da primeira versão:

integração avançada com CAD;

PDM;

PLM;

reconhecimento automático de desenhos;

geração avançada automática de projetos;

cálculos estruturais avançados;

IA avançada;

motor avançado de regras;

otimização automática avançada de corte;

planejamento avançado de capacidade da Engenharia;

BI avançado específico;

integração externa completa com CAD/PDM/ERP;

promoção avançada de projetos para templates/modelos.

A arquitetura deve permitir evolução futura sem necessidade de
reconstrução do núcleo.

**52. REGRAS DE INTEGRIDADE**

O desenvolvimento não poderá criar comportamentos que contrariem as
seguintes regras:

Engenharia define o que produzir.

PCP/Fábrica define como e quando produzir.

BOM técnica não é planejamento.

Estoque não altera necessidade técnica.

Revisão liberada é referência oficial.

Histórico não é sobrescrito.

Alteração técnica relevante possui controle de revisão.

Fábrica não altera diretamente a definição técnica.

Produto e Projeto são entidades diferentes.

Duplicação nunca modifica o original.

Regras são configuráveis e versionadas.

Sistema sugere; Engenharia decide.

Item bloqueado/obsoleto não é substituído automaticamente.

Impacto prioriza pedidos em aberto e produção real.

Toda OP registra a revisão utilizada.

Produção parcial não exige novos projetos.

Processos técnicos da Engenharia não equivalem ao roteiro produtivo do
PCP.

Todas as áreas utilizam uma única fonte oficial da definição técnica.

Alterações técnicas devem ser rastreáveis.

Histórico técnico não pode ser apagado.

**53. CRITÉRIO FINAL DE ACEITE**

O Tópico 5 somente será considerado concluído quando for possível
executar, no sistema:

**Pedido**\
→ **Item**\
→ **Projeto**\
→ **Produto**\
→ **Configuração**\
→ **Regras**\
→ **BOM sugerida**\
→ **Validação da Engenharia**\
→ **BOM definitiva**\
→ **Revisão**\
→ **Documentação**\
→ **Aprovação**\
→ **Liberação**\
→ **PCP**\
→ **OP**\
→ **Fábrica**

E, em caso de problema:

**Fábrica/PCP/Qualidade/Comercial**\
→ **Solicitação de Engenharia**\
→ **Análise**\
→ **Nova revisão, se necessária**\
→ **Aprovação**\
→ **Nova liberação**

Todo o processo deverá permanecer rastreável.

**54. ORIENTAÇÃO FINAL AO AGENTE DE DESENVOLVIMENTO**

Não inventar regras de negócio não especificadas neste documento.

Quando houver necessidade de decisão técnica de implementação:

preservar as regras de negócio acima;

priorizar integridade e rastreabilidade;

evitar duplicação de informações;

manter separação entre módulos;

preparar a arquitetura para evolução futura;

não implementar funcionalidades fora do MVP sem necessidade;

não permitir atalhos que comprometam revisão, aprovação ou histórico.

A implementação deve resultar em um módulo de Engenharia capaz de
funcionar como **fonte oficial da definição técnica do produto para toda
a cadeia industrial**.
