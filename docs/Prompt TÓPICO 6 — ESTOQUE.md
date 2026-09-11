**TÓPICO 6 — ESTOQUE**

**Objetivo**

Implementar o módulo de Estoque do SaaS de gestão para empresas de
vidraçaria e fabricação, garantindo controle físico, disponibilidade,
reservas, movimentações, rastreabilidade, materiais dimensionais,
Sobras, inventário e integração com os demais módulos do sistema.

O módulo deve ser integrado ao cadastro mestre de itens e aos módulos de
Pedidos, Engenharia, Produção, Suprimentos/Compras, Expedição,
Relatórios e demais módulos do sistema.

A arquitetura deve ser preparada para futuras integrações externas, sem
dependência de um ERP específico.

**1. CADASTRO E CLASSIFICAÇÃO DE ITENS**

Criar um cadastro mestre único de itens por empresa.

Um item deve possuir um único cadastro centralizado, utilizado pelos
demais módulos do sistema, evitando duplicidade de itens entre Estoque,
Engenharia, Produção, Pedidos e Compras.

**Categorias principais**

Permitir classificar os itens como:

Matéria-prima

Componente

Insumo

Produto semiacabado

Produto acabado

Material auxiliar

**Dados do item**

O cadastro deve contemplar, conforme aplicável:

Código interno

Descrição

Descrição complementar

Categoria

Unidade principal

Unidades alternativas

Fatores de conversão

Tipo de controle

Características técnicas

Material

Liga

Acabamento

Cor

Espessura

Dimensões

Fabricante/marca

Modelo

Referência do fabricante

Código do fornecedor

Código externo

Código de barras/GTIN/EAN, quando aplicável

Localização padrão

Status

Estoque mínimo

Estoque máximo

Estoque de segurança

Ponto de reposição

Lote mínimo de compra

Múltiplo de compra

Quantidade padrão de compra

**Status**

Permitir:

Ativo

Inativo

Bloqueado

Pendente de aprovação

Itens que já possuam movimentações não devem ser excluídos fisicamente.
Devem ser inativados.

**Fabricante e fornecedor**

Fabricante e fornecedor são entidades diferentes.

Um item poderá possuir:

um fabricante;

múltiplos fornecedores;

referências diferentes;

códigos diferentes por fornecedor.

**Duplicidade**

Implementar mecanismo de identificação de possíveis itens duplicados.

O sistema deve alertar sobre possíveis duplicidades, mas não bloquear
automaticamente o cadastro, pois itens aparentemente iguais podem
possuir diferenças técnicas ou comerciais.

**Sinônimos**

Permitir cadastrar:

nomes alternativos;

descrições utilizadas internamente;

referências externas;

códigos equivalentes.

**Permissões e histórico**

Controlar permissões de criação e alteração de itens.

Registrar histórico das alterações relevantes.

**2. CONTROLE DE SALDO**

O sistema deve separar claramente:

Estoque físico

Estoque disponível

Estoque reservado

Estoque comprometido

Estoque bloqueado

Estoque em produção

Estoque de produto acabado

Estoque em trânsito

**Regra fundamental**

Nunca considerar automaticamente:

Estoque físico = Estoque disponível

O estoque disponível deve considerar reservas, compromissos, bloqueios e
demais condições que impeçam sua utilização.

**Reserva**

Permitir reservas vinculadas a:

pedido;

OP;

necessidade interna;

outra origem autorizada.

As reservas devem ser:

rastreáveis;

reversíveis;

parciais.

**Reserva parcial**

Exemplo:

Necessidade: 100 unidades\
Disponível: 70 unidades

Resultado:

Reservado: 70

Falta: 30

A falta poderá posteriormente alimentar o módulo de Suprimentos/Compras.

**Estoque bloqueado**

Material bloqueado continua fazendo parte do estoque físico, mas não
pode ser considerado disponível.

**Estoque em produção**

Materiais enviados para produção devem deixar de ser considerados
disponíveis no estoque de almoxarifado, permanecendo identificados como
estoque/material em produção.

**Estoque em trânsito**

Materiais em trânsito não devem aumentar o estoque físico até o
recebimento efetivo.

**Estoque negativo**

Por padrão, impedir estoque negativo.

Caso a empresa autorize exceção:

exigir permissão;

registrar usuário;

data/hora;

origem;

motivo;

alerta;

histórico.

**3. MOVIMENTAÇÕES**

Toda alteração física de estoque deve ocorrer por meio de uma
movimentação registrada.

**Entradas**

Permitir:

Compra

Produção

Devolução

Entrada de Sobra

Transferência

Ajuste de inventário

**Saídas**

Permitir:

Consumo em produção

Expedição

Devolução a fornecedor

Perda

Descarte

Transferência

Ajuste de inventário

**Movimentações internas**

Permitir:

Reserva

Liberação de reserva

Transferência de localização

Bloqueio

Desbloqueio

Transferência para produção

Retorno da produção

Reserva não deve ser tratada como saída física.

**Compra**

A entrada física deverá ocorrer somente após o recebimento efetivo.

**Produção**

A produção poderá:

consumir materiais;

devolver materiais;

gerar produtos;

gerar Sobras;

gerar perdas.

Todos esses movimentos devem estar vinculados à OP correspondente.

**Consumo parcial de material dimensional**

Exemplo:

Barra de 6.000 mm.

Consumo:

4.350 mm.

Resultado:

Consumo: 4.350 mm

Sobra: 1.650 mm

A peça física remanescente deve ser registrada como Sobra, conforme as
regras do item.

**Regra de Sobra**

A entrada de Sobra deve possuir movimentação específica denominada:

Entrada de Sobra

Não utilizar nomenclaturas como <span dir="rtl">“</span>retalho” ou
<span dir="rtl">“</span>saldo residual”.

**Reversões**

Não apagar movimentações já consolidadas.

Correções devem gerar movimentos compensatórios, preservando o
histórico.

**Auditoria**

Toda movimentação deve registrar:

tipo;

item;

quantidade;

unidade;

dimensão;

localização de origem;

localização de destino;

documento de origem;

OP/pedido, quando aplicável;

usuário;

data/hora;

motivo;

observação.

**4. RASTREABILIDADE**

O sistema deve manter histórico completo da origem, movimentação e
destino dos materiais.

**Origem**

Permitir rastrear se o material veio de:

compra;

produção;

devolução;

transferência;

inventário;

ajuste.

**Materiais comprados**

Quando aplicável, registrar:

fornecedor;

pedido de compra;

documento fiscal;

lote;

data de recebimento;

localização.

**Rastreabilidade de Sobras**

Toda Sobra deve manter, quando aplicável:

item original;

dimensão original;

dimensão da Sobra;

OP que gerou;

processo/etapa que gerou;

data;

usuário/processo;

localização atual.

Permitir identificação individual da Sobra quando configurado.

Exemplo:

SOB-000154

**Lote e serial**

Controle por lote e/ou número de série deve ser configurável por item.

**Rastreabilidade reversa**

Permitir consultar:

Material → OP → Produto

e:

Produto → OP → Materiais utilizados

**Nível de rastreabilidade configurável**

Por item, permitir configurar:

controle de lote;

controle de serial;

controle de localização;

identificação individual de Sobra;

controle individual de dimensões.

**5. MATERIAIS DE DIMENSÕES VARIÁVEIS**

Este é um requisito fundamental do sistema.

Para materiais lineares, o sistema deve controlar simultaneamente:

quantidade física de peças;

comprimento individual;

comprimento total;

comprimento padrão;

localização;

barras inteiras;

Sobras.

**Regra fundamental**

O sistema deve conhecer as peças físicas existentes.

Não transformar diferentes comprimentos em uma quantidade decimal de
barras.

Exemplo:

Correto:

16 barras × 6.000 mm

1 Sobra × 4.500 mm

Incorreto:

16,75 barras

**Materiais aplicáveis**

Exemplos:

perfis;

barras;

tubos;

cantoneiras;

outros materiais lineares.

**Corte parcial**

Ao consumir parcialmente uma peça:

Peça original → consumo → Sobra ou perda

A nova Sobra deve possuir seu próprio registro.

**Reutilização de Sobra**

Uma Sobra também poderá ser parcialmente consumida.

Exemplo:

Sobra: 1.800 mm\
Consumo: 1.500 mm\
Nova Sobra: 300 mm

A nova Sobra deve novamente ser avaliada conforme a regra de
reaproveitamento configurada para o item.

**Materiais planos**

Preparar estrutura para controle de:

comprimento;

largura;

área;

espessura;

tipo;

características técnicas.

Aplicável, por exemplo, a vidros e chapas.

**Conversões**

Conversões de unidades devem ser configuráveis por item.

Não utilizar conversões universais quando a relação depender das
características do material.

**6. APROVEITAMENTO DE SOBRAS**

O sistema deve transformar Sobras em estoque efetivamente reutilizável.

**Identificação**

Para uma necessidade de material, o sistema deve pesquisar Sobras
compatíveis.

Considerar, conforme configuração:

item;

material;

perfil;

liga;

acabamento;

cor;

espessura;

seção;

comprimento;

largura;

localização;

lote;

fabricante;

outras características técnicas.

**Compatibilidade**

A empresa deve definir quais características são obrigatórias para
permitir o aproveitamento.

Não assumir que itens aparentemente iguais sejam automaticamente
intercambiáveis.

**Critérios de seleção**

Permitir configurar critérios como:

Priorizar Sobras;

Menor desperdício;

Menor comprimento excedente;

Localização;

Lote;

FIFO;

Sequência de produção;

Outros critérios definidos pela empresa.

Os critérios devem ser configuráveis.

**Reserva**

Ao selecionar uma Sobra:

Sobra → Reservada para determinada necessidade/OP

A Sobra reservada não poderá ser utilizada por outra OP.

**Aproveitamento parcial**

Exemplo:

Sobra: 1.800 mm\
Necessidade: 1.500 mm\
Nova Sobra: 300 mm

A nova Sobra deverá seguir novamente o critério mínimo configurado para
o item.

**Limite de reaproveitamento**

O limite é configurável individualmente por item.

Exemplo:

Perfil A:

mínimo reutilizável = 1.000 mm

Perfil B:

mínimo reutilizável = 500 mm

Assim:

1.200 mm → Sobra para Perfil A\
800 mm → perda para Perfil A

Enquanto:

800 mm → Sobra para Perfil B

**Aproveitamento entre pedidos**

Permitir, conforme configuração:

mesmo pedido;

diferentes OPs do mesmo pedido;

outros pedidos do mesmo cliente;

qualquer pedido da empresa.

A empresa poderá estabelecer restrições.

**Sequência de produção**

Permitir que a disponibilidade de Sobras seja considerada durante o
planejamento/sequenciamento da produção.

O sistema poderá indicar oportunidades de aproveitamento que também
contribuam para:

redução de desperdício;

redução de setup;

melhor aproveitamento de matéria-prima;

agrupamento de produções.

**Aprovação**

Permitir três possibilidades:

automático;

assistido;

exigindo aprovação.

**Controle contra dupla utilização**

Uma Sobra não poderá ser utilizada simultaneamente por duas
necessidades.

Ciclo esperado:

Disponível → Reservada → Em utilização → Consumida

ou:

Disponível → Reservada → Reserva cancelada → Disponível

**7. INVENTÁRIO E AJUSTES**

Permitir inventários:

gerais;

por localização;

por grupo;

por item;

cíclicos;

extraordinários.

**Abertura**

Registrar:

número;

data/hora;

responsável;

localização;

itens;

motivo;

tipo;

situação.

**Posição do estoque**

Registrar a posição sistêmica no momento da conferência.

Movimentações posteriores devem ser tratadas de forma que não distorçam
a comparação entre estoque esperado e estoque contado.

**Contagem**

Permitir informar quantidade física encontrada.

Para materiais dimensionais, permitir informar:

peças;

dimensões individuais;

barras inteiras;

Sobras;

localização.

Não utilizar somente metragem total quando for necessário conhecer as
peças físicas.

**Segunda contagem**

Permitir segunda contagem para divergências.

Exemplo:

Sistema: 100\
Primeira contagem: 96\
Segunda contagem: 96

Confirmar divergência.

Caso:

Primeira contagem: 96\
Segunda contagem: 100

Permitir tratar a primeira contagem como divergência de conferência.

**Aprovação**

Permitir regras configuráveis de aprovação conforme:

quantidade;

valor;

item;

grupo;

percentual de divergência.

**Ajustes**

Permitir:

ajuste positivo;

ajuste negativo.

Nunca alterar silenciosamente o saldo anterior.

Registrar:

saldo anterior;

quantidade contada;

diferença;

saldo posterior;

motivo;

usuário;

data/hora;

inventário;

localização;

aprovação;

observação.

**Motivos**

Permitir motivos configuráveis, incluindo:

diferença de inventário;

perda;

avaria;

erro de lançamento;

erro de recebimento;

erro de consumo;

erro de transferência;

material encontrado;

material descartado;

correção cadastral;

outros.

**Localização**

Se o material estiver fisicamente em outra localização:

tratar como transferência/correção de localização

quando não existir diferença de quantidade.

**Materiais bloqueados**

O inventário deve identificar materiais bloqueados, sem desbloqueá-los
automaticamente.

**Auditoria**

Inventários encerrados devem possuir histórico completo.

Alterações posteriores somente mediante permissão específica e sempre
mantendo o histórico.

**8. INTEGRAÇÃO COM OS DEMAIS MÓDULOS**

O Estoque deve funcionar como uma base integrada do SaaS.

**Integração com Pedidos**

Permitir:

consultar disponibilidade;

identificar necessidades;

reservar materiais;

identificar faltas.

**Integração com Engenharia**

A Engenharia deve utilizar o mesmo cadastro mestre de itens.

Estruturas/BOMs devem utilizar os itens existentes no Estoque.

**Integração com Produção**

Permitir:

reserva;

solicitação;

retirada;

consumo;

devolução;

geração de Sobra;

perdas;

produção de acabados/semiacabados.

**Múltiplas OPs**

Um mesmo pedido poderá possuir várias OPs.

O Estoque deve permitir que diferentes OPs consumam materiais
separadamente, mantendo rastreabilidade individual.

Exemplo:

Pedido 100\
OP 101\
OP 102\
OP 103

Permitir consultar:

consumo total do pedido;

consumo por OP.

**Integração com Suprimentos/Compras**

Quando houver insuficiência de estoque, o sistema poderá gerar
necessidades de compra.

Exemplo:

Necessidade: 500\
Disponível: 320\
Falta: 180

A falta poderá alimentar o processo de compras.

**Integração com Expedição**

Permitir:

Produto acabado → estoque → expedição

Registrar a saída efetiva vinculada ao pedido.

**Relatórios e indicadores**

Preparar dados para indicadores como:

estoque por grupo;

estoque por localização;

estoque disponível;

estoque reservado;

estoque bloqueado;

estoque em produção;

estoque parado;

giro;

cobertura;

perdas;

Sobras;

aproveitamento de Sobras;

divergências;

acuracidade;

valor de estoque;

consumo por OP;

consumo por produto.

**Integrações externas**

A arquitetura deve permitir futuras integrações com sistemas externos.

Não criar dependência estrutural de um ERP específico neste momento.

**REGRAS GERAIS DO MÓDULO**

Utilizar cadastro mestre único de itens.

Não permitir estoques paralelos por módulo.

Toda alteração física deve gerar movimentação.

Toda movimentação deve possuir origem.

Reserva não é saída física.

Estoque físico não é igual a estoque disponível.

Sobras reutilizáveis fazem parte do estoque físico.

Materiais em produção devem possuir situação própria.

Materiais em trânsito não devem aumentar o estoque antes do recebimento.

Materiais dimensionais devem ser controlados como peças físicas quando
necessário.

Não representar peças de diferentes comprimentos como frações de uma
barra.

Toda Sobra deve manter sua origem e histórico.

O limite de reaproveitamento deve ser configurável por item.

Sobras podem ser reutilizadas por diferentes OPs/pedidos conforme regras
da empresa.

Nunca permitir dupla utilização da mesma Sobra.

Consumo parcial pode gerar nova Sobra.

A nova Sobra deve ser avaliada novamente segundo as regras do item.

Perdas devem ser diferenciadas de Sobras.

Ajustes não devem apagar histórico.

Inventários devem possuir rastreabilidade.

A empresa deve poder configurar permissões e aprovações.

As regras de negócio devem ser configuráveis sempre que possível.

A arquitetura deve permitir evolução futura sem necessidade de
reestruturação do núcleo do Estoque.

**ESCOPO MÍNIMO DO MVP**

O MVP do módulo de Estoque deve obrigatoriamente contemplar:

cadastro mestre de itens;

categorias;

unidades;

controle de saldo;

estoque físico;

estoque disponível;

reservas;

reservas parciais;

movimentações;

transferências;

consumo de produção;

devoluções;

perdas;

Sobras;

rastreabilidade;

materiais lineares com quantidade + metragem;

comprimento individual das peças;

controle de barras inteiras e Sobras;

consumo parcial;

geração de nova Sobra;

limite de reaproveitamento configurável por item;

localização;

aproveitamento de Sobras;

reserva de Sobras;

prevenção de dupla utilização;

inventário;

segunda contagem;

ajustes positivos e negativos;

motivos de ajuste;

aprovação configurável;

auditoria;

integração com Pedidos;

integração com Engenharia;

integração com Produção;

integração com Suprimentos/Compras;

integração com Expedição;

estrutura para relatórios e indicadores;

arquitetura preparada para integrações externas futuras.

**EVOLUÇÕES FUTURAS**

A arquitetura deve permitir posteriormente:

código de barras;

QR Code;

etiquetas de Sobras;

leitura por celular;

coletores;

inventário mobile;

inventário offline;

identificação individual avançada;

otimização matemática de cortes;

nesting;

combinação automática de Sobras;

otimização de sequência de produção;

otimização de setup;

integração com máquinas de corte;

algoritmos avançados de aproveitamento;

análises preditivas de estoque.
