**PROMPT FINAL DE IMPLEMENTAÇÃO**

**TÓPICO 2 — CADASTROS / ESTRUTURA INICIAL**

**1. CONTEXTO**

Implementar o **Tópico 2 — Cadastros / Estrutura Inicial** de um SaaS
industrial modular, multiempresa, escalável, seguro, auditável e
preparado para integração entre módulos.

Este sistema é **independente de qualquer empresa específica, ERP ou
sistema legado**.

O objetivo deste tópico é estabelecer os **cadastros mestres e
estruturas fundamentais** que serão utilizados pelos demais módulos do
sistema.

A implementação deve respeitar rigorosamente a arquitetura definida no
Tópico 1 — Base / Estrutura do Sistema.

**PRINCÍPIO CENTRAL**

**A Base fornece o mecanismo. O Cadastro fornece a identidade e a
estrutura. O módulo fornece a regra de negócio.**

Nenhum módulo deve criar uma cópia paralela de uma entidade que já
exista como cadastro mestre.

**2. PRINCÍPIOS ARQUITETURAIS**

Implementar os cadastros obedecendo às seguintes regras:

Cada entidade deve possuir uma única identidade oficial.

Todo registro deve possuir um identificador interno imutável.

O código de negócio pode ser alterado quando permitido, mas nunca
substitui o ID interno.

Cadastros mestres devem ser reutilizáveis por todos os módulos.

Informações específicas de processos devem permanecer no módulo
responsável.

Histórico e rastreabilidade devem ser preservados.

Inativação deve ser preferida à exclusão física.

Alterações relevantes devem ser auditadas.

Importações e integrações não eliminam as regras de validação e
governança.

O sistema deve impedir duplicações sempre que possível.

Estruturas configuráveis não devem ser transformadas em estruturas
rígidas sem necessidade.

O modelo deve ser preparado para crescimento futuro sem exigir
reconstrução dos cadastros centrais.

**3. CADASTROS MESTRES PRINCIPAIS**

Implementar, no mínimo:

Pessoas

Papéis/Relacionamentos de Pessoa

Itens

Classificações

Características e Atributos

Unidades de Medida

Conversões

Fabricantes

Marcas

Modelos

Referências Externas

Empresas/Filiais/Unidades conforme estrutura do Tópico 1

Locais

Depósitos

Estruturas de endereçamento

Recursos

Condições comerciais reutilizáveis

Documentos e anexos

Estruturas de importação/exportação

Mecanismos de qualidade e governança cadastral

Todos devem utilizar os mecanismos centrais definidos no Tópico 1.

**4. PESSOAS**

Criar uma entidade central **Pessoa**.

A mesma Pessoa pode possuir simultaneamente diferentes papéis.

Exemplos:

Cliente

Fornecedor

Transportadora

Prestador de serviço

Representante

Contato

Outros papéis futuros

**4.1 Identificação**

Suportar:

Pessoa Física

Pessoa Jurídica

Nome/Razão Social

Nome Fantasia quando aplicável

CPF/CNPJ quando aplicável

Documentos de identificação adicionais

Inscrição estadual

Inscrição municipal

Identificadores equivalentes de outros países

A arquitetura não deve ser exclusivamente dependente de documentos
brasileiros.

**4.2 Situação**

Permitir:

Ativo

Inativo

Bloqueado

Outras situações configuráveis

A situação da Pessoa deve ser independente da situação de seus papéis.

**4.3 Contatos**

Permitir múltiplos:

Telefones

E-mails

Sites

Contatos

Departamentos

Funções/cargos

Finalidades

Indicador de principal

Uma empresa pode possuir diversos contatos.

**4.4 Endereços**

Permitir múltiplos endereços, com finalidade:

Sede

Comercial

Cobrança

Entrega

Faturamento

Correspondência

Outros

**5. PAPÉIS DE PESSOA**

Criar mecanismo de relacionamento entre Pessoa e seus papéis.

Uma mesma Pessoa poderá ser, por exemplo:

Cliente + Fornecedor + Transportadora.

Não criar uma Pessoa diferente para cada papel.

**Cliente**

Permitir informações complementares como:

Código do cliente

Responsável

Representante

Classificação

Condição de pagamento padrão

Tabela de preços

Limite de crédito

Situação comercial

Outras informações comerciais

**Fornecedor**

Permitir:

Código do fornecedor

Categoria

Comprador/responsável

Condição de pagamento

Prazo de fornecimento

Classificação

Situação

Outras informações de suprimentos

Transportadora, representante e prestador de serviço devem seguir a
mesma lógica de papéis.

**Regra**

Pessoa = entidade.\
Papel = relacionamento.\
Processo = responsabilidade do módulo.

**6. DUPLICIDADE DE PESSOAS**

Antes da criação de uma Pessoa, executar verificação de possíveis
duplicidades.

Considerar, conforme disponibilidade:

CPF

CNPJ

Nome

Razão social

Nome fantasia

Telefones

E-mails

Endereços

Outros identificadores

Quando não houver identificador único, apresentar possíveis
correspondências ao usuário.

Não criar automaticamente uma segunda Pessoa quando houver forte
indicação de duplicidade.

**7. ITENS**

Criar entidade central **Item**.

O Item representa aquilo que a empresa:

compra

vende

produz

consome

utiliza

movimenta

controla

referencia

**7.1 Tipos/classificações**

Suportar, no mínimo:

Matéria-prima

Insumo

Componente

Produto intermediário

Produto acabado

Material auxiliar

Embalagem

Serviço

Outros tipos configuráveis

Essas classificações não devem gerar cadastros mestres separados.

**7.2 Dados estruturais**

Todo Item deve possuir:

ID interno

Código

Descrição

Tipo

Classificação

Unidade principal

Situação

Empresa/unidade quando aplicável

Informações complementares

Histórico

**8. SEPARAÇÃO ENTRE CADASTRO E MÓDULOS**

Não armazenar no cadastro mestre informações que pertencem a processos.

Exemplos:

**Cadastro Mestre**

identidade do Item

descrição

tipo

classificação

características

dimensões

unidade

fabricante

marca

modelo

referências

**Estoque**

saldo

localização

lote

reserva

movimentações

inventário

remanescente

**Engenharia**

estrutura/BOM

componentes

versões

desenhos

estruturas de fabricação

**PCP/Produção**

roteiro

operação

recurso

capacidade

tempos

**Qualidade**

características de inspeção

planos de inspeção

resultados

não conformidades

**Comercial**

preço

desconto

margem

tabela comercial

**Suprimentos**

fornecedor do Item

preço de compra

prazo

condições específicas

**9. DUPLICAÇÃO DE ITENS**

Implementar duplicação assistida.

Ao duplicar:

gerar novo ID

gerar novo código

copiar somente informações permitidas

preservar referência ao Item original

criar novo histórico

Nunca copiar:

ID

estoque

lotes

reservas

produção

pedidos

histórico comercial

histórico financeiro

inspeções

movimentações operacionais

A duplicação deve servir como ponto de partida para um novo Item.

**10. CLASSIFICAÇÕES**

Implementar estrutura hierárquica configurável.

Estrutura padrão:

Tipo → Grupo → Família → Subfamília → Categoria

A profundidade deve ser configurável.

O **Tipo do Item** é diferente da classificação.

Exemplo:

Tipo: Matéria-prima\
Grupo: Metálicos\
Família: Aços\
Subfamília: Barras\
Categoria: Barra redonda

**11. CARACTERÍSTICAS E ATRIBUTOS**

Implementar mecanismo flexível de características.

Tipos de atributos:

Texto

Inteiro

Decimal

Booleano

Data

Lista controlada

Valor + unidade

Referência a outra entidade

Permitir:

obrigatório

opcional

condicional

valor padrão sugerido

validação mínima/máxima

precisão

formato

lista permitida

unidade

combinações válidas

Características podem ser herdadas da classificação.

Alterações nas definições de atributos devem preservar o histórico dos
valores anteriores.

**12. CARACTERÍSTICAS TÉCNICAS**

Características estruturais devem possuir tratamento próprio.

Exemplos:

Material

Norma

Grau/qualidade

Diâmetro

Largura

Altura

Espessura

Comprimento

Seção

Peso teórico

Perfil

Não transformar dados estruturais importantes em simples campos
genéricos.

Separar:

Estrutura + Classificação + Características + Regras de processo.

**13. MATERIAIS LINEARES**

Dar atenção especial a:

Barras redondas

Barras chatas

Barras quadradas

Barras sextavadas

Cantoneiras

Perfis estruturais

Perfis comerciais

Perfis dobrados

Tubos

Outros materiais lineares

O sistema deve permitir controlar simultaneamente:

quantidade de peças/barras

comprimento total

peso total

comprimento nominal

comprimento disponível

outras características técnicas

Exemplo:

1 barra = 6.000 mm\
Peso teórico = 12,5 kg/m\
10 barras = 60 m\
Peso teórico = 750 kg

A relação entre essas grandezas deve ser explícita.

**14. UNIDADES DE MEDIDA**

Criar cadastro central de unidades.

Cada unidade deve possuir:

Código

Descrição

Símbolo

Tipo/magnitude

Precisão

Situação

Magnitudes incluem:

Unidade/peça

Comprimento

Massa

Área

Volume

Tempo

Outras

Não permitir conversões incompatíveis.

**15. CONVERSÕES**

Suportar três conceitos:

**Conversão universal**

Exemplo:

1 m = 1.000 mm

**Conversão específica do Item**

Quando a relação depende do material/produto.

**Relação técnica derivada**

Exemplo:

peso por metro de determinado perfil.

A relação:

Peças ↔ Comprimento ↔ Peso

deve ser suportada para materiais lineares.

Não tratar peso por metro como conversão universal.

**16. UNIDADES POR CONTEXTO**

Um Item pode possuir:

unidade de compra

unidade de estoque

unidade de produção

unidade de venda

Exemplo:

Compra: barra\
Estoque: barra / metro / kg\
Produção: metro\
Venda: metro / kg

As conversões devem ser explícitas, rastreáveis e configuráveis.

**17. COMPRIMENTO E PESO**

Diferenciar:

comprimento nominal

comprimento recebido

comprimento disponível

comprimento reservado

comprimento consumido

comprimento produzido

comprimento remanescente

Também diferenciar:

peso teórico

peso real

Quando aplicável, armazenar a diferença entre ambos.

Não arredondar prematuramente cálculos técnicos.

Precisão e arredondamento devem ser configuráveis.

**18. FABRICANTES**

Criar entidade reutilizável de Fabricante.

Um fabricante pode também ser Pessoa/Fornecedor.

Não duplicar a Pessoa.

Permitir:

nome

identificação

informações cadastrais

documentos

histórico

situação

**19. MARCAS E MODELOS**

Criar entidades reutilizáveis:

Marca

Modelo

Um modelo pode estar relacionado a uma marca.

Modelo não deve ser obrigatório para materiais onde não faça sentido,
como determinados perfis lineares.

**20. REFERÊNCIAS EXTERNAS**

Um Item pode possuir múltiplas referências externas:

Código do fabricante

Código do fornecedor

Código do cliente

Código de catálogo

Código de norma

Código de integração

Código antigo

Referência comercial

Esses códigos não criam novos Itens.

Permitir pesquisa por qualquer referência válida.

Preservar códigos históricos.

**21. ORGANIZAÇÃO FÍSICA E LÓGICA**

Respeitar:

Empresa → Filial/Unidade → Estruturas Operacionais

Permitir estruturas como:

Fábrica

Unidade produtiva

Almoxarifado

Recebimento

Inspeção

Quarentena

Expedição

Escritório

Outras

**22. LOCAIS E DEPÓSITOS**

Criar entidade central de Local.

Permitir hierarquia:

Unidade → Depósito → Área → Setor → Localização

A profundidade deve ser configurável.

Separar:

**Depósito**

Estrutura lógica de controle.

**Local físico**

Estrutura física onde algo está armazenado ou localizado.

Não assumir que todo estoque está em pallets ou estantes.

Para materiais lineares, suportar:

pátio

cavalete

suporte

área

posição

corredor

identificação própria

**23. ENDEREÇAMENTO**

Permitir estruturas configuráveis como:

Rua

Corredor

Módulo

Prateleira

Nível

Coluna

Posição

Box

Área

Pátio

Suporte

Cavalete

Cada estrutura deve poder ser adaptada à realidade operacional.

**24. RECURSOS E ATIVOS OPERACIONAIS**

Criar cadastro central de **Recursos**.

Exemplos:

Máquinas

Equipamentos

Ferramentas

Dispositivos

Instrumentos

Veículos

Equipamentos de movimentação

Outros recursos operacionais

**Dados mínimos**

ID

Código

Descrição

Tipo

Categoria

Fabricante

Marca

Modelo

Número de série

Número patrimonial

Data de aquisição

Início de operação

Situação

Unidade

Localização

Documentos

Observações

Permitir identificadores:

número de série

patrimônio

código interno

QR Code

código de barras

RFID

**25. RECURSO ≠ ITEM**

Manter distinção clara:

Item = material, produto, componente, insumo ou serviço.

Recurso = máquina, equipamento, ferramenta, instrumento ou outro recurso
operacional.

Não criar Item para representar uma máquina simplesmente porque ela
possui valor patrimonial.

**26. CONDIÇÕES COMERCIAIS REUTILIZÁVEIS**

Criar estruturas centrais para:

Condições de pagamento

Formas de pagamento

Moedas

Prazos

Incoterms quando aplicável

Transportadoras

Representantes

Intermediários

Condições de entrega

Classificações

Separar claramente:

Forma de pagamento ≠ Condição de pagamento.

Condições devem suportar:

múltiplas parcelas

percentuais

intervalos

primeira parcela

dias fixos

outras regras configuráveis

Alterações devem preservar histórico.

**27. DOCUMENTOS E ANEXOS**

Utilizar a infraestrutura central de documentos definida no Tópico 1.

Permitir documentos associados a qualquer entidade relevante.

Tipos:

Contrato

Certificado

Manual

Catálogo

Desenho

Ficha técnica

Licença

Documento fiscal

Documento cadastral

Fotografia

Relatório

Certificação

Outros configuráveis

Suportar:

versões

validade

responsável

origem

histórico

exclusão lógica

controle de acesso

Permitir documentos vinculados a mais de uma entidade quando necessário.

**28. IMPORTAÇÃO**

Implementar importação em massa.

Formatos mínimos:

XLSX

CSV

Arquitetura preparada para outros formatos.

Fluxo:

Arquivo → Leitura → Validação → Identificação de erros → Correção →
Pré-visualização → Confirmação → Gravação

Antes da gravação apresentar:

registros válidos

inválidos

novos

possíveis duplicados

atualizações

campos alterados

Não gravar silenciosamente registros problemáticos.

**29. INTEGRAÇÕES E ENTRADAS AUTOMÁTICAS**

Entradas provenientes de integrações/API/importações devem seguir as
mesmas regras de governança.

O sistema deve registrar:

origem

data/hora

identificação da integração

status

responsável quando aplicável

erros

pendências

registros parciais

registros rejeitados

Mesmo uma entrada automática deve permitir ao operador saber que ela
ocorreu e validar os dados quando necessário.

**30. ATUALIZAÇÕES EM MASSA**

Permitir alteração em massa de registros.

Antes da execução:

mostrar quantidade afetada

mostrar campos alterados

mostrar valores anteriores

mostrar novos valores

apontar conflitos

exigir confirmação quando necessário

Operações críticas devem possuir mecanismos de segurança e, quando
tecnicamente possível, reversibilidade.

**31. EXPORTAÇÃO**

Permitir exportação para:

XLSX

CSV

Respeitando:

permissões

filtros

colunas selecionadas

regras de acesso

privacidade

Registrar exportações relevantes quando necessário.

**32. BUSCA**

Implementar pesquisa global e contextual.

Permitir busca por:

código

descrição

características

fabricante

marca

modelo

referência externa

identificadores

outros campos relevantes

A pesquisa textual deve tolerar:

parte do texto

diferenças de maiúsculas/minúsculas

acentos

**33. FILTROS E LISTAGENS**

Permitir:

filtros combinados

AND/OR quando aplicável

ordenação

agrupamento

escolha de colunas

alteração da ordem das colunas

paginação

quantidade por página

filtros salvos

As visualizações podem ser específicas de cada módulo, mas devem
utilizar o mesmo cadastro mestre.

**34. VISUALIZAÇÃO DO REGISTRO**

Cada registro deve possuir visualização organizada por seções/abas.

Exemplo:

Dados principais

Classificação

Características

Relacionamentos

Documentos

Referências

Histórico

Informações complementares

Permitir navegação para registros relacionados, respeitando permissões.

**35. CÓDIGO DE BARRAS, QR E RFID**

Preparar os cadastros para identificadores físicos.

Quando aplicável, permitir:

código de barras

QR Code

RFID

códigos internos

códigos externos

Esses identificadores devem apontar para a entidade correta, sem criar
duplicação cadastral.

**36. GOVERNANÇA DA QUALIDADE CADASTRAL**

Implementar mecanismos para identificar:

campos obrigatórios ausentes

valores incompatíveis

possíveis duplicidades

referências conflitantes

unidades incompatíveis

relacionamentos inválidos

dados desatualizados

documentos vencidos

características incompletas

Criar indicadores de qualidade cadastral.

**37. REGRAS DE VALIDAÇÃO**

As validações devem ser configuráveis conforme:

tipo

classificação

categoria

situação

contexto

empresa

unidade

processo

Distinguir:

obrigatório

recomendado

informativo

**38. DUPLICIDADES E MERGE**

Quando forem encontradas duplicidades, permitir processo controlado de
consolidação.

Fluxo:

Identificar possíveis duplicados.

Selecionar registro principal.

Selecionar registro duplicado.

Exibir relações afetadas.

Identificar conflitos.

Solicitar confirmação.

Consolidar relações conforme regras.

Preservar rastreabilidade.

Registrar auditoria.

Não simplesmente excluir o duplicado.

**39. APROVAÇÃO CADASTRAL**

Permitir workflow configurável para cadastros críticos.

Exemplo:

Rascunho → Em análise → Aprovado → Ativo

Nem todo cadastro precisa obrigatoriamente passar por aprovação.

A necessidade deve ser configurável conforme tipo, classificação,
situação ou contexto.

**40. AUDITORIA**

Toda alteração relevante deve registrar:

quem alterou

quando alterou

campo alterado

valor anterior

novo valor

origem

motivo, quando aplicável

Também registrar operações relevantes como:

criação

duplicação

importação

integração

inativação

reativação

consolidação de duplicados

alterações estruturais

Utilizar o mecanismo central de auditoria do Tópico 1.

**41. ORIGEM DOS DADOS**

Identificar a origem do registro ou alteração:

Manual

Importação

Integração

API

Duplicação

Processo interno

Atualização automática

Outras fontes configuráveis

Quando existirem fontes conflitantes, o sistema deve identificar o
conflito e aplicar regras de prioridade ou solicitar intervenção.

Nunca sobrescrever silenciosamente informações críticas.

**42. INATIVAÇÃO E EXCLUSÃO**

Priorizar:

Inativação / exclusão lógica

em vez de exclusão física.

Um registro utilizado em processos históricos não deve simplesmente
desaparecer.

A exclusão física deve ser excepcional, controlada e auditada.

Reativação também deve ser controlada e auditada.

**43. INTEGRIDADE ENTRE MÓDULOS**

Todos os módulos devem referenciar os mesmos registros mestres.

Exemplo:

O mesmo Item utilizado em Engenharia, Estoque, Suprimentos, PCP,
Produção, Qualidade e Comercial deve possuir um único ID.

O mesmo vale para:

Pessoa

Recurso

Unidade

Local

Fabricante

Marca

demais entidades centrais.

**44. PERFORMANCE**

Os cadastros devem ser projetados para grande volume de dados.

Implementar, conforme arquitetura tecnológica:

índices adequados

paginação

busca incremental

lazy loading

consultas otimizadas

filtros eficientes

carregamento sob demanda

Evitar carregamento desnecessário de grandes conjuntos de dados.

**45. SEGURANÇA**

Respeitar integralmente o modelo de usuários e permissões definido no
Tópico 14.

O Tópico 2 não deve criar um sistema paralelo de permissões.

As operações devem respeitar:

permissões de visualização

criação

edição

inativação

exclusão

importação

exportação

aprovação

consolidação de duplicados

**46. CONFIGURAÇÕES**

Todas as regras que foram definidas como configuráveis devem utilizar o
mecanismo central de configurações do Tópico 15.

Não criar mecanismos paralelos de configuração.

Exemplos:

classificações

atributos

profundidade hierárquica

unidades

arredondamentos

validações

workflows

status

regras de duplicidade

códigos

obrigatoriedades

**47. INTEGRAÇÃO COM OS DEMAIS TÓPICOS**

O Tópico 2 deve ser integrado arquiteturalmente com:

**Tópico 1 — Base / Estrutura**

Fornece:

IDs

auditoria

documentos

configurações

multiempresa

estrutura organizacional

eventos

segurança

mecanismos comuns

**Tópico 3 — Pedidos**

Consumirá:

Pessoas

Itens

condições comerciais

endereços

demais cadastros necessários.

**Tópico 4 — PCP / Produção**

Consumirá:

Itens

Recursos

Unidades

Locais

características técnicas.

**Tópico 5 — Engenharia**

Consumirá:

Itens

características

unidades

fabricantes

referências

documentos.

**Tópico 6 — Estoque**

Consumirá:

Itens

unidades

depósitos

locais

recursos quando aplicável.

**Tópico 7 — Suprimentos**

Consumirá:

Pessoas

Fornecedores

Itens

fabricantes

referências

condições de pagamento.

**Tópico 8 — Qualidade**

Consumirá:

Itens

Pessoas

Recursos

características

documentos.

**Tópico 9 — Expedição / Logística**

Consumirá:

Clientes

Transportadoras

endereços

Itens

locais.

**Tópico 10 — Comercial**

Consumirá:

Clientes

Itens

representantes

condições comerciais.

**Tópico 11 — Financeiro**

Consumirá:

Pessoas

condições

moedas

demais estruturas financeiras necessárias.

**Tópico 13 — Integrações**

Utilizará os cadastros mestres para integração com sistemas externos.

**Tópico 14 — Usuários / Permissões**

Controlará acesso aos cadastros e operações.

**Tópico 15 — Configurações**

Controlará as parametrizações cadastrais.

**48. REGRAS FUNDAMENTAIS DE IMPLEMENTAÇÃO**

Implementar obrigatoriamente os seguintes princípios:

**REGRA 1 — IDENTIDADE ÚNICA**

Uma entidade real = um cadastro oficial.

**REGRA 2 — NÃO DUPLICAR ENTIDADES**

Módulos não podem criar cópias de Pessoas, Itens, Recursos, Locais ou
demais entidades mestres.

**REGRA 3 — ID INTERNO IMUTÁVEL**

O ID técnico nunca deve ser alterado ou reutilizado.

**REGRA 4 — CÓDIGO NÃO É IDENTIDADE**

O código de negócio pode possuir regras próprias, mas não substitui o
ID.

**REGRA 5 — CADASTRO NÃO É PROCESSO**

Dados operacionais pertencem aos módulos responsáveis.

**REGRA 6 — HISTÓRICO**

Mudanças relevantes devem ser rastreáveis.

**REGRA 7 — GOVERNANÇA**

Importações e integrações não eliminam validações.

**REGRA 8 — QUALIDADE**

O sistema deve detectar inconsistências e possíveis duplicidades.

**REGRA 9 — INATIVAÇÃO**

Preservar dados históricos.

**REGRA 10 — ESCALABILIDADE**

A estrutura deve suportar crescimento sem necessidade de remodelagem
estrutural.

**49. CRITÉRIOS DE ACEITE**

O Tópico 2 será considerado implementado quando:

Pessoas puderem ser cadastradas de forma centralizada.

Uma Pessoa puder possuir múltiplos papéis.

Clientes, fornecedores e transportadoras não gerarem duplicação de
Pessoa.

Itens possuírem identidade única.

Itens puderem ser classificados e caracterizados.

Características puderem ser configuradas por tipo/classificação.

Unidades e conversões forem centralizadas.

Barras, cantoneiras e perfis puderem ser controlados por peça,
comprimento e peso.

Peso teórico e real puderem ser diferenciados.

Fabricantes, marcas e modelos forem reutilizáveis.

Referências externas não criem novos Itens.

Locais e depósitos forem estruturados hierarquicamente.

Estruturas para materiais lineares forem suportadas.

Recursos forem distintos de Itens.

Condições comerciais reutilizáveis estiverem disponíveis.

Documentos possuírem histórico e validade quando aplicável.

Importações possuírem pré-validação.

Atualizações em massa possuírem confirmação.

Busca e filtros funcionarem sobre os dados estruturados.

Duplicidades puderem ser detectadas e consolidadas de forma controlada.

Auditoria estiver integrada.

Origem dos dados estiver registrada.

Inativação preservar histórico.

Os módulos utilizarem os mesmos cadastros mestres.

Permissões utilizarem o Tópico 14.

Configurações utilizarem o Tópico 15.

Não existirem mecanismos paralelos de cadastro, configuração, auditoria
ou permissões.

**50. RESULTADO ESPERADO**

Ao final da implementação, o sistema deverá possuir uma **camada de
Cadastros Mestres robusta, única, reutilizável e governada**, capaz de
servir como fundamento para todos os módulos do SaaS industrial.

A arquitetura deve permitir que novos módulos sejam adicionados sem
necessidade de recriar:

Pessoas

Itens

Recursos

Unidades

Fabricantes

Locais

Documentos

demais entidades mestres.

O resultado deve ser um cadastro centralizado, confiável, auditável,
escalável e preparado para operações industriais complexas.

**PRINCÍPIO FINAL**

**O cadastro define quem/qual entidade é.\
A classificação define o que ela representa.\
As características definem suas propriedades.\
Os módulos definem como ela se comporta nos processos.**

Não implementar atalhos que violem essa separação.
