**TÓPICO 4 — PCP E PRODUÇÃO**

**1. OBJETIVO DO MÓDULO**

Desenvolver o módulo de **PCP e Produção** como o núcleo operacional da
fábrica, responsável por transformar pedidos e itens liberados em uma
programação produtiva executável, acompanhar a produção em todas as suas
etapas e controlar os resultados até a conclusão, inspeção e liberação
para o processo de expedição.

O módulo deverá atuar de forma integrada sobre:

planejamento;

programação;

sequenciamento;

otimização;

capacidade produtiva;

materiais;

vidro;

sobras e reaproveitamento;

ordens de produção;

lotes fabris;

execução;

apontamentos;

qualidade;

retrabalho;

perdas;

custos produtivos;

manutenção;

recursos produtivos;

replanejamento;

indicadores;

rastreabilidade.

O sistema não deverá ser apenas um mecanismo de registro da produção.
Ele deverá analisar as informações disponíveis, identificar riscos,
restrições e oportunidades, apresentar recomendações ao PCP e permitir
que usuários autorizados tomem as decisões.

**PRINCÍPIO FUNDAMENTAL**

**O sistema recomenda, alerta, simula e apresenta impactos. A empresa
define as regras e o usuário autorizado toma a decisão.**

O sistema não deverá assumir decisões autônomas que possam comprometer
prazos, custos ou prioridades sem autorização.

**2. INTEGRAÇÃO COM OS DEMAIS MÓDULOS**

O PCP deverá receber informações de outros módulos e devolver
informações aos processos seguintes.

**Entradas principais**

Pedidos;

Itens dos pedidos;

Engenharia;

versões de engenharia;

listas de materiais/BOM;

roteiros produtivos;

Estoque;

matérias-primas;

componentes;

sobras reutilizáveis;

Suprimentos;

materiais em compra ou trânsito;

máquinas;

equipamentos;

equipes;

operadores;

ferramentas;

dispositivos;

capacidade produtiva.

**Saídas principais**

necessidades de produção;

ordens de produção;

programação;

lotes fabris;

consumo de materiais;

perdas;

sobras;

produção concluída;

resultados de qualidade;

custos produtivos;

indicadores;

produtos liberados para estoque/expedição;

necessidades de materiais para Suprimentos.

O módulo de **Compras/Suprimentos será separado**. O PCP apenas deverá
gerar, consumir e acompanhar as necessidades relacionadas à produção.

O módulo de **Expedição será separado**. O PCP deverá entregar produtos
produzidos, conferidos, aprovados e liberados para o processo seguinte.

**3. LIBERAÇÃO PARA PRODUÇÃO**

Antes da liberação de uma OP para produção, o sistema deverá verificar
os requisitos necessários.

Considerar, conforme a configuração da empresa:

pedido liberado;

item liberado;

engenharia disponível;

engenharia liberada para produção;

versão correta da engenharia;

roteiro produtivo definido;

materiais identificados;

necessidades de vidro identificadas;

recursos produtivos definidos;

restrições conhecidas;

requisitos de qualidade definidos.

A OP deverá possuir uma situação clara, como:

Liberada;

Liberada com restrição;

Bloqueada.

Quando houver bloqueio ou restrição, o sistema deverá apresentar
claramente:

motivo;

origem;

impacto;

ação necessária.

**4. ENGENHARIA LIBERADA**

O sistema deverá possuir um marco formal de **Engenharia Liberada para
Produção**.

A engenharia deverá possuir:

identificação;

versão;

data;

responsável;

situação;

histórico de alterações.

A OP deverá registrar qual versão da engenharia foi utilizada.

Uma alteração de engenharia deverá ser versionada e deverá permitir
avaliação do impacto sobre:

OPs ainda não iniciadas;

OPs liberadas;

OPs em produção;

produção já realizada;

materiais consumidos;

materiais reservados;

sobras;

custos;

prazo;

programação;

lotes fabris.

O sistema deverá alertar ou bloquear, conforme configuração e permissão,
a produção utilizando engenharia desatualizada.

**5. PLANEJAMENTO DA PRODUÇÃO**

O sistema deverá transformar a carteira de pedidos e itens liberados em
necessidades e programação de produção.

O planejamento deverá considerar:

prazo prometido;

prioridade;

quantidade;

operações necessárias;

capacidade;

disponibilidade de máquinas;

disponibilidade de equipes;

operadores;

materiais;

vidro;

ferramentas;

dispositivos;

manutenção;

gargalos;

restrições;

produção já realizada;

produção em andamento;

lotes existentes;

necessidades futuras.

Permitir planejamento:

diário;

semanal;

mensal;

por turno;

por setor;

por máquina;

por linha;

por equipe.

A empresa deverá poder configurar seus critérios e horizontes de
planejamento.

**6. SEQUENCIAMENTO INTELIGENTE**

O sistema deverá analisar a programação e recomendar sequências
produtivas que busquem equilíbrio entre prazo e eficiência.

Considerar:

prazo;

atraso;

prioridade;

material disponível;

vidro disponível;

setup;

perfil;

material;

dimensão;

processo;

ferramenta;

máquina;

capacidade;

gargalos;

sobras;

movimentação;

espera;

balanceamento dos recursos.

O sistema deverá evitar que a sequência seja determinada exclusivamente
pela ordem de chegada dos pedidos.

Exemplo:

Uma OP posterior utiliza o mesmo perfil, ferramenta e setup de uma OP
anterior.

O sistema poderá recomendar:

Produzir a OP posterior em conjunto ou imediatamente após a OP atual
para reduzir setup, desde que os prazos das demais OPs não sejam
prejudicados.

As recomendações deverão possuir classificação, por exemplo:

🟢 Recomendado;

🟡 Oportunidade;

🔴 Risco.

O sistema deverá explicar a razão da recomendação.

Exemplo:

<span dir="rtl">“</span>Antecipar OP 720 porque utiliza o mesmo setup da
OP 719, reduzindo aproximadamente X minutos de setup sem impacto
previsto no prazo.”

Os pesos e critérios utilizados pelo mecanismo de recomendação deverão
ser configuráveis pela empresa.

**7. DECISÃO HUMANA**

O usuário autorizado deverá poder:

aceitar recomendação;

rejeitar recomendação;

modificar recomendação;

ignorar recomendação;

alterar a sequência manualmente.

O sistema deverá registrar:

recomendação apresentada;

decisão tomada;

usuário;

data/hora;

motivo, quando aplicável.

O histórico deverá permitir posteriormente analisar:

O que o sistema recomendou → o que o usuário decidiu → por quê → qual
foi o resultado.

**8. SIMULAÇÃO DE CENÁRIOS**

O sistema deverá permitir simular alterações de programação antes de
aplicá-las.

Exemplos:

antecipar OP;

atrasar OP;

alterar prioridade;

trocar equipamento;

agrupar OPs;

alterar sequência;

utilizar sobra;

considerar chegada futura de material;

considerar parada de máquina.

A simulação deverá apresentar, quando aplicável:

impacto em prazos;

capacidade;

setup;

horas produtivas;

horas extras;

materiais;

gargalos;

outras OPs;

riscos;

oportunidades.

A simulação não deverá alterar a programação oficial até que o usuário
autorizado confirme.

**9. HORIZONTE E CONGELAMENTO DA PROGRAMAÇÃO**

Permitir que a empresa configure diferentes horizontes de planejamento,
como:

planejamento de longo prazo;

programação flexível;

programação congelada.

O período congelado deverá evitar alterações constantes sem autorização.

Uma alteração dentro de período protegido deverá exigir permissão
adequada e manter histórico.

**10. REPLANEJAMENTO**

O sistema deverá identificar eventos capazes de exigir reavaliação da
programação.

Exemplos:

novo pedido prioritário;

alteração de prazo;

cancelamento;

alteração de engenharia;

falta de material;

chegada de material;

atraso de vidro;

quebra de máquina;

manutenção;

ausência de operador;

retrabalho;

perda;

alteração de capacidade;

alteração de prioridade.

O sistema deverá recalcular os impactos, mas:

**Recalcular não significa automaticamente alterar a programação
oficial.**

Quando necessário, deverá apresentar alternativas ao usuário autorizado.

**11. ORDEM DE PRODUÇÃO — OP**

A estrutura deverá respeitar:

**Pedido → Item → Ordem de Produção (OP)**

Um pedido poderá possuir vários itens.

Um item poderá gerar uma ou várias OPs.

Uma OP poderá representar:

parte da quantidade;

uma etapa;

um lote;

uma necessidade específica;

um conjunto de itens;

uma produção parcial.

Uma OP poderá ser executada:

parcialmente;

em lotes;

em paralelo;

em diferentes máquinas;

por diferentes equipes.

**12. PRODUÇÃO PARCIAL**

O sistema deverá permitir liberar uma OP parcialmente para a fábrica.

Exemplo:

OP = 100 unidades

Lote 1 = 30;

Lote 2 = 40;

Lote 3 = 30.

Cada lote deverá manter vínculo com a OP original.

O sistema deverá controlar:

quantidade planejada;

quantidade liberada;

quantidade em produção;

quantidade concluída;

quantidade aprovada;

quantidade rejeitada;

quantidade em retrabalho;

saldo.

**13. PRODUÇÃO PARALELA E TRANSFERÊNCIA DE RECURSO**

Uma OP poderá ser dividida entre diferentes recursos.

Exemplo:

OP 200 unidades:

Máquina A = 100;

Máquina B = 100.

O sistema deverá consolidar os resultados na OP.

Também deverá permitir transferência durante a produção.

Exemplo:

Máquina M01 produz 70;

M01 apresenta falha;

saldo de 30 é transferido para M02.

O sistema deverá manter toda a rastreabilidade.

**14. LOTE FABRIL**

O PCP poderá agrupar quantidades de diferentes OPs em um **Lote Fabril**
para otimização operacional.

Exemplo:

Lote Fabril 001:

OP 601 → 40 unidades;

OP 602 → 30 unidades;

OP 615 → 50 unidades.

O agrupamento poderá considerar:

mesmo material;

mesmo perfil;

mesmo processo;

mesma operação;

mesmo setup;

mesma ferramenta;

mesma máquina;

mesma característica produtiva.

O lote fabril será um conceito **operacional e temporário**.

Ele não deverá alterar:

pedido;

item;

cliente;

estrutura comercial;

OP.

Cada quantidade continuará vinculada à sua OP de origem.

Uma OP poderá participar de vários lotes fabris.

**15. ROTEIRO PRODUTIVO**

O sistema deverá permitir que cada empresa configure seus próprios
roteiros.

Exemplos:

**Engenharia → Corte → Usinagem → Montagem → Acabamento → Inspeção →
Embalagem**

ou

**Corte → Furação → Solda → Pintura → Montagem → Inspeção**

O roteiro deverá ser associado ao produto/processo conforme a
metodologia definida pela empresa.

Cada operação deverá possuir:

sequência;

descrição;

recurso necessário;

tempo previsto;

capacidade;

requisitos;

critérios de qualidade;

possíveis equipamentos alternativos.

**16. ACOMPANHAMENTO POR OPERAÇÃO**

O sistema não deverá controlar somente o status geral da OP.

Deverá controlar cada etapa.

Exemplo:

|              |                |
|:------------:|----------------|
| **Operação** | **Quantidade** |
|    Corte     | 100            |
|   Usinagem   | 80             |
|   Montagem   | 50             |
|   Inspeção   | 30             |

Permitir visualizar:

planejado;

iniciado;

produzido;

aprovado;

rejeitado;

retrabalho;

saldo.

**17. CHÃO DE FÁBRICA**

Disponibilizar interfaces adequadas para:

**Computador**

Foco em:

PCP;

planejamento;

programação;

indicadores;

gestão.

**Tablet**

Foco em:

supervisores;

líderes;

acompanhamento;

apontamentos.

**Celular**

Foco em:

operadores;

leitura;

apontamento rápido;

movimentação.

**18. QR CODE E CÓDIGO DE BARRAS**

O sistema deverá gerar automaticamente identificadores visuais para OPs
e, quando aplicável, lotes.

O QR Code/código de barras deverá permitir acessar rapidamente:

OP;

pedido;

item;

produto;

quantidade;

lote;

operação atual;

situação;

instruções relevantes.

Fluxo esperado:

**Escanear → identificar → iniciar/apontar → informar resultado.**

O código visual será um mecanismo de acesso e rastreamento. O
identificador interno único da OP deverá permanecer independente do
código visual.

**19. ETIQUETAS**

Permitir geração de etiquetas para acompanhar materiais e produção.

A etiqueta poderá conter:

OP;

pedido;

cliente;

produto;

quantidade;

lote;

operação;

QR Code;

código de barras;

informações configuradas pela empresa.

**20. MATERIAIS**

O sistema deverá comparar:

**Necessidade planejada × estoque disponível × material reservado ×
material em trânsito × produção planejada**

Classificar a situação conforme regras da empresa:

disponível;

insuficiente;

reservado;

em trânsito;

previsto;

bloqueado.

O PCP deverá identificar os materiais críticos para a produção.

**21. VIDRO COMO INSUMO CRÍTICO**

O sistema deverá tratar vidro como um insumo produtivo específico e
crítico.

A partir da engenharia/BOM deverá identificar, quando aplicável:

tipo de vidro;

espessura;

dimensão;

quantidade;

acabamento;

beneficiamento;

têmpera;

laminação;

furos;

recortes;

demais características.

Comparar necessidade com estoque e disponibilidade.

Quando houver déficit:

identificar a necessidade;

vincular à OP/item/pedido;

gerar necessidade para Suprimentos;

considerar prazo de fornecimento;

informar impacto no planejamento.

A ausência do vidro não deverá necessariamente bloquear toda a produção.

O sistema deverá permitir executar etapas independentes do vidro quando
tecnicamente possível.

**22. INTERFACE COM SUPRIMENTOS**

O PCP deverá gerar e acompanhar necessidades relacionadas à produção.

Exemplo:

Necessidade de 100 m² de vidro → estoque disponível 40 m² → déficit 60
m².

O sistema deverá informar ao módulo de Suprimentos:

material;

quantidade;

necessidade;

prazo;

OP/pedido relacionado;

prioridade;

impacto.

A execução da compra, negociação com fornecedor, pedido de compra,
contas e demais processos de Suprimentos pertencem ao módulo específico.

**23. OTIMIZAÇÃO DE MATERIAL**

O sistema deverá buscar combinações de corte e utilização de materiais
que reduzam desperdícios.

Exemplo:

Barra de 6.000 mm:

necessidade A = 2.500 mm;

necessidade B = 1.800 mm;

necessidade C = 1.650 mm.

O sistema deverá analisar combinações possíveis e buscar maior
aproveitamento.

A otimização deverá considerar:

pedidos atuais;

pedidos futuros;

prazos;

materiais;

setups;

sobras existentes;

restrições produtivas.

Nunca sacrificar um prazo crítico apenas para obter melhor
aproveitamento sem alertar o usuário.

**24. SOBRAS REUTILIZÁVEIS**

Toda sobra com potencial de utilização deverá poder ser registrada e
rastreada.

A sobra deverá possuir:

código;

material;

perfil;

dimensão;

quantidade;

unidade;

localização;

origem;

OP;

pedido;

data;

status;

possíveis aplicações;

histórico de utilização.

O sistema deverá distinguir:

consumo;

sobra reutilizável;

desperdício.

**25. REAPROVEITAMENTO DE SOBRAS**

O sistema deverá identificar oportunidades de utilização de sobras.

Exemplo:

Existe uma sobra de 1.400 mm que pode atender uma necessidade de
produção prevista para amanhã.

O usuário poderá:

utilizar agora;

reservar para utilização futura;

não utilizar agora;

rejeitar a oportunidade.

Se o usuário não quiser utilizar naquele momento, o sistema deverá
permitir registrar/manter a sobra disponível para uso futuro.

A sobra não deverá ser automaticamente descartada.

**26. QUALIDADE**

A qualidade deverá estar integrada ao processo produtivo.

Permitir configurar pontos de inspeção por:

produto;

operação;

roteiro;

OP;

lote.

Permitir checklists específicos.

Resultados:

aprovado;

aprovado com ressalva;

rejeitado.

**27. NÃO CONFORMIDADE**

Uma não conformidade deverá estar vinculada, quando aplicável, a:

pedido;

item;

OP;

lote;

operação;

produto;

material;

responsável.

Registrar:

motivo;

quantidade;

descrição;

fotos;

data/hora;

responsável;

ação;

resultado.

**28. DISPOSIÇÃO DA NÃO CONFORMIDADE**

Permitir definir:

retrabalho;

reprocessamento;

sucata;

uso condicional;

bloqueio;

outra disposição configurável.

**29. RETRABALHO**

O retrabalho deverá gerar uma necessidade produtiva adicional vinculada
à produção original.

Registrar:

OP original;

operação;

quantidade;

motivo;

material adicional;

tempo adicional;

custo;

responsável;

resultado.

O retrabalho deverá impactar os indicadores de:

produtividade;

custo;

prazo;

qualidade.

**30. CONSUMO E PERDAS**

Comparar:

**Consumo planejado × consumo real**

Exemplo:

Planejado = 20 m\
Real = 21,5 m.

Permitir classificar a diferença como:

perda normal;

perda extraordinária;

erro de produção;

retrabalho;

ajuste;

outro motivo configurável.

A empresa deverá poder configurar tolerâncias.

Quando o consumo ou perda ultrapassar o limite configurado, o sistema
deverá alertar.

**31. CAPACIDADE PRODUTIVA**

Permitir cadastrar:

máquinas;

equipamentos;

linhas;

postos;

equipes;

operadores;

turnos;

jornadas;

ferramentas;

dispositivos.

Calcular:

**Capacidade disponível × capacidade necessária**

Exemplo:

Capacidade disponível = 60h\
Necessidade = 80h\
Déficit = 20h.

O sistema deverá identificar:

sobrecarga;

capacidade ociosa;

gargalos;

risco de atraso.

**32. RECURSOS PRODUTIVOS**

Tratar máquinas, equipamentos, equipes, operadores e recursos auxiliares
como recursos produtivos.

Uma operação poderá exigir:

máquina;

operador;

ferramenta;

dispositivo;

gabarito;

matriz;

programa;

equipamento auxiliar.

A indisponibilidade de qualquer recurso crítico poderá bloquear ou
colocar uma OP em risco.

Exemplo:

Máquina disponível ✅\
Operador disponível ✅\
Material disponível ✅\
Ferramenta necessária ❌

OP bloqueada — aguardando ferramenta.

**33. EQUIPAMENTOS E MANUTENÇÃO**

Cadastrar:

equipamentos;

código;

setor;

tipo;

capacidade;

operações compatíveis;

localização;

status;

disponibilidade.

Situações possíveis:

disponível;

em produção;

programado para manutenção;

em manutenção;

parado;

indisponível;

aguardando peça;

aguardando ferramenta;

aguardando operador;

bloqueado;

outros.

**34. MANUTENÇÃO PREVENTIVA**

Permitir configurar:

equipamento;

tipo;

periodicidade;

horas de operação;

ciclos;

data;

duração estimada;

responsável.

A manutenção prevista deverá ser considerada na capacidade futura do
equipamento.

**35. MANUTENÇÃO CORRETIVA**

Registrar:

equipamento;

início da parada;

problema;

motivo;

responsável;

previsão de retorno;

retorno efetivo;

peças;

serviços;

observações.

A parada deverá gerar análise automática de impacto sobre a programação.

**36. IMPACTO DE MANUTENÇÃO NO PCP**

Quando uma máquina parar:

registrar a parada;

identificar OPs afetadas;

identificar quantidades já produzidas;

identificar saldos;

procurar recursos alternativos;

verificar capacidade alternativa;

calcular impacto;

apresentar alternativas;

permitir decisão autorizada;

registrar a reprogramação.

Exemplo:

M01 indisponível.

OP 602 — saldo 30 unidades.

M02 pode executar a operação.

Impacto estimado: +1h20.

Prazo preservado.

**37. GARGALOS**

O sistema deverá identificar gargalos com base na relação entre
capacidade e necessidade.

Exemplo:

Usinagem: 50h disponíveis / 75h necessárias → gargalo.

O gargalo deverá influenciar:

sequenciamento;

priorização;

alertas;

simulações;

replanejamento.

**38. APONTAMENTO DE PRODUÇÃO**

O operador deverá poder registrar, conforme permissão:

início;

pausa;

retomada;

conclusão;

quantidade produzida;

quantidade aprovada;

perda;

retrabalho;

parada;

observação.

O sistema deverá registrar automaticamente:

usuário;

data;

hora;

equipamento;

operação;

OP;

lote;

quantidade.

**39. PARADAS DE PRODUÇÃO**

Permitir registrar paradas com motivos configuráveis.

Exemplos:

manutenção;

falta de material;

falta de vidro;

falta de operador;

falta de ferramenta;

problema de qualidade;

setup;

aguardando instrução;

aguardando programação;

quebra;

outro.

Os tempos de parada deverão alimentar os indicadores.

**40. ALTERAÇÕES DURANTE A PRODUÇÃO**

O sistema deverá permitir tratar alterações de:

quantidade;

prazo;

prioridade;

material;

acabamento;

engenharia;

desenho;

cancelamento;

inclusão;

exclusão.

Antes da aplicação, deverá avaliar o impacto sobre:

produção realizada;

produção em andamento;

saldo;

OPs;

lotes;

materiais;

sobras;

perdas;

custos;

capacidade;

prazo.

Toda alteração deverá manter:

**Antes → Alteração → Depois → Usuário → Data/Hora → Motivo**

**41. STATUS DA PRODUÇÃO**

Evitar excesso de status.

A empresa deverá poder configurar seus estados, tendo como referência:

Planejada;

Liberada;

Em produção;

Pausada;

Concluída;

Inspecionada;

Liberada para expedição;

Bloqueada;

Cancelada.

Os status deverão ser configuráveis conforme a metodologia da empresa.

**42. BLOQUEIOS**

O sistema deverá diferenciar:

**Não produzido**

de

**Não pode ser produzido.**

Os bloqueios deverão possuir motivos estruturados:

material;

vidro;

engenharia;

máquina;

operador;

ferramenta;

qualidade;

manutenção;

fornecedor;

prioridade;

cliente;

outro.

O motivo deverá ser visível para os usuários autorizados.

**43. ENCERRAMENTO DA OP**

A OP não deverá ser considerada concluída simplesmente por atingir a
quantidade planejada.

O encerramento deverá respeitar os critérios definidos para o processo.

Exemplo:

100 unidades produzidas.

97 aprovadas;

3 rejeitadas;

3 enviadas para retrabalho;

3 retrabalhadas;

3 aprovadas.

Somente então, quando a regra do processo for atendida:

OP = concluída.

O encerramento deverá considerar:

quantidade;

inspeção;

rejeições;

retrabalho;

saldo;

aprovação;

pendências.

**44. LIBERAÇÃO PARA ESTOQUE / EXPEDIÇÃO**

Ao final do processo produtivo, o sistema deverá disponibilizar o
resultado para o próximo processo.

O produto deverá estar:

produzido;

conferido;

aprovado;

liberado.

A gestão operacional de expedição ficará no módulo específico.

**45. CUSTOS PRODUTIVOS**

O PCP deverá controlar custos relacionados à produção, sem substituir o
módulo financeiro/contábil.

Considerar:

materiais;

consumo;

perdas;

mão de obra produtiva;

horas de máquina;

retrabalho;

terceirização;

outros custos produtivos configuráveis.

Permitir:

**Custo planejado × custo real**

e análise por:

OP;

item;

pedido;

lote;

operação;

produto.

**46. RASTREABILIDADE**

Manter rastreabilidade completa:

**Pedido → Item → OP → Lote Fabril → Operação → Recurso → Apontamento →
Material → Qualidade → Resultado**

Registrar:

usuário;

data;

hora;

quantidade;

equipamento;

operação;

alteração;

motivo.

O sistema deverá permitir reconstruir o histórico produtivo de uma OP.

**47. HISTÓRICO**

Toda alteração relevante deverá ser registrada.

Exemplos:

alteração de programação;

alteração de prioridade;

transferência de máquina;

parada;

manutenção;

consumo;

perda;

retrabalho;

inspeção;

não conformidade;

alteração de engenharia;

alteração de quantidade;

alteração de prazo.

**48. INDICADORES**

O módulo deverá disponibilizar indicadores de:

**Produção**

planejado × realizado;

produtividade;

cumprimento da programação;

produção por período;

produção por equipamento;

produção por equipe.

**Prazo**

pedidos no prazo;

pedidos em risco;

pedidos atrasados;

impacto de paradas.

**Materiais**

consumo planejado × real;

perda;

desperdício;

sobras;

valor recuperado por reaproveitamento.

**Capacidade**

capacidade disponível;

capacidade utilizada;

capacidade ociosa;

sobrecarga;

gargalos.

**Equipamentos**

disponibilidade;

utilização;

horas paradas;

manutenção preventiva;

manutenção corretiva.

**Qualidade**

aprovação;

rejeição;

não conformidade;

retrabalho.

**Custos**

custo planejado × real;

custo de perdas;

custo de retrabalho;

custo por etapa.

**49. RECURSOS DE ANÁLISE E FUTURA INTELIGÊNCIA**

A primeira versão deverá utilizar principalmente:

regras;

parâmetros configuráveis;

dados estruturados;

histórico;

capacidade;

materiais;

prazos;

processos.

O sistema não deverá depender de inteligência artificial autônoma para
funcionar.

Entretanto, a arquitetura deverá permitir evolução futura para
utilização de dados históricos na melhoria de:

estimativas de tempo;

previsão de atrasos;

capacidade;

manutenção;

consumo;

perdas;

setup;

sequenciamento;

probabilidade de cumprimento de prazo.

**50. PERMISSÕES**

As ações críticas deverão respeitar perfis e permissões.

Exemplos:

**Operador**

apontar produção;

registrar perda;

registrar parada;

registrar observação;

consultar informações necessárias à operação.

**Líder/Supervisor**

acompanhar produção;

validar apontamentos;

tratar ocorrências;

transferir recursos conforme permissão.

**PCP**

planejar;

programar;

sequenciar;

reprogramar;

criar/alterar lotes;

analisar capacidade;

tratar riscos.

**Gestor**

configurar regras;

aprovar alterações críticas;

analisar indicadores;

definir prioridades.

Os perfis deverão ser configuráveis pela empresa.

**51. CONFIGURABILIDADE**

Evitar regras rígidas no sistema.

A empresa deverá poder configurar:

status;

roteiros;

operações;

recursos;

máquinas;

turnos;

capacidade;

prioridades;

critérios de sequenciamento;

tolerâncias de perdas;

regras de qualidade;

bloqueios;

motivos;

permissões;

critérios de encerramento;

horizontes de planejamento;

regras de notificação relacionadas ao PCP.

**52. PRINCÍPIOS DE NEGÓCIO**

O desenvolvimento deverá respeitar obrigatoriamente os seguintes
princípios:

1.  **Pedido e produção são conceitos diferentes.**

2.  **Uma OP pode ser parcial.**

3.  **Uma OP pode possuir vários lotes fabris.**

4.  **Um lote fabril pode reunir diferentes OPs.**

5.  **O lote fabril não altera a estrutura comercial.**

6.  **Uma OP pode ser executada em paralelo.**

7.  **Uma produção pode ser transferida entre recursos.**

8.  **Cada operação possui seu próprio acompanhamento.**

9.  **Material disponível não significa necessariamente material
    liberado.**

10. **Máquina disponível não significa necessariamente operação
    disponível.**

11. **Vidro deve ser tratado como insumo crítico quando aplicável.**

12. **Falta de vidro não deve necessariamente bloquear etapas
    independentes.**

13. **Sobra reutilizável não é desperdício.**

14. **O sistema deve identificar oportunidades de reaproveitamento.**

15. **O usuário pode decidir não utilizar uma sobra imediatamente.**

16. **Perdas devem ser diferenciadas de sobras.**

17. **Retrabalho deve permanecer rastreável.**

18. **Não produzido é diferente de bloqueado.**

19. **Replanejamento não deve alterar automaticamente programação
    protegida.**

20. **Alterações devem preservar histórico.**

21. **Engenharia precisa estar formalmente liberada para produção.**

22. **A versão da engenharia utilizada deve ser rastreável.**

23. **Qualidade deve fazer parte do fluxo produtivo.**

24. **A OP somente deve ser encerrada quando seus critérios forem
    atendidos.**

25. **O PCP termina sua responsabilidade na entrega de produção aprovada
    e liberada para o processo seguinte.**

26. **O sistema recomenda; a empresa e o usuário autorizado decidem.**

**53. DIRETRIZ FINAL PARA O DESENVOLVIMENTO**

Desenvolver o Tópico 4 como um módulo de PCP moderno, flexível e
orientado à realidade industrial.

Não criar apenas telas de cadastro e apontamento.

O sistema deverá:

entender a demanda;

compreender a capacidade;

verificar materiais;

identificar restrições;

considerar vidro e demais insumos;

analisar sobras;

avaliar setups;

identificar gargalos;

considerar manutenção;

montar e otimizar sequências;

permitir produção parcial;

acompanhar cada etapa;

identificar riscos;

simular alternativas;

registrar decisões;

controlar qualidade;

controlar perdas;

controlar retrabalho;

medir custos;

preservar rastreabilidade;

aprender futuramente com o histórico.

A arquitetura deverá ser preparada para integração com os demais módulos
do sistema, mantendo separação clara de responsabilidades e evitando
duplicidade de funcionalidades.

O objetivo final é transformar o sistema em uma ferramenta que permita à
empresa responder, em tempo real:

**O que precisamos produzir?**

**Quando precisamos produzir?**

**Em que sequência devemos produzir?**

**Temos capacidade?**

**Temos material e vidro?**

**Existe alguma sobra que podemos aproveitar?**

**Qual recurso deve executar?**

**Existe algum gargalo ou manutenção?**

**O que está bloqueando a produção?**

**O que já foi produzido?**

**Onde está cada quantidade?**

**Quanto estamos consumindo e perdendo?**

**Quanto está custando?**

**Estamos em risco de atraso?**

**Qual a melhor alternativa?**

**E qual decisão foi tomada pelo responsável?**

O Tópico 4 deverá funcionar como o **centro de inteligência operacional
da fábrica**, mantendo a empresa no controle das decisões e garantindo
rastreabilidade completa desde a liberação da produção até a entrega do
produto aprovado ao próximo processo.


**54. LISTA DE CORTE — complemento aprovado em 12/09/2026**

Complemento decorrente de revisão posterior ao texto original. Não
altera as seções anteriores.

**Contexto**

A operação define hoje o corte pela experiência do operador, sem
software de apoio. As seções 23 a 25 já tratam da análise de
combinações e do reaproveitamento de sobras, e o §19 prevê etiquetas,
mas não existe um documento de saída que diga ao operador **o que
cortar de qual chapa ou barra**.

**Decisão**

O sistema deverá gerar uma **lista de corte** por chapa/barra, como
saída operacional da ordem de produção.

A lista deverá conter, conforme aplicável:

identificação da chapa/barra de origem (item, dimensão, lote ou sobra
de origem);

peças a serem obtidas, com dimensões e quantidades;

pedido, obra e ambiente de destino de cada peça, quando aplicável;

sequência sugerida de corte, quando houver;

margem de quebra aplicada (conforme parametrização do TÓPICO 15);

sobra prevista;

identificação da OP e do responsável;

data e hora de emissão.

**Limites**

A lista de corte **não é resultado de otimização matemática**. O
sistema apresenta o agrupamento a partir das combinações já previstas
nas seções 23 a 25; a decisão final de corte permanece com o operador.

Permanecem fora de escopo, conforme o TÓPICO 6 e o ADR-002: otimização
matemática de cortes, nesting, combinação automática de sobras,
algoritmos avançados de aproveitamento e integração com máquinas de
corte.

**Rastreabilidade**

A sobra efetivamente gerada deverá ser registrada conforme a seção 24,
e a perda real conforme já previsto — nenhuma das duas se confunde com
a margem de quebra planejada (Arquitetura Mestre, item 6.3).
