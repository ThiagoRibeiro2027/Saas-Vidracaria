**TÓPICO 3 — GESTÃO E ACOMPANHAMENTO DE PEDIDOS**

Desenvolva o módulo de **Gestão e Acompanhamento de Pedidos** do
sistema, considerando todas as regras, permissões, validações e
comportamentos descritos abaixo.

**1. Objetivo do módulo**

O módulo deverá centralizar o cadastro, recebimento, acompanhamento e
controle dos pedidos da empresa, permitindo que cada pedido seja
acompanhado desde sua entrada até sua conclusão.

O módulo deve proporcionar uma visão clara do andamento dos pedidos,
seus itens, prazos, pendências, alterações e eventos relevantes,
evitando retrabalho e perda de informações.

O módulo de pedidos deve ser preparado para integração com outros
módulos do sistema, especialmente os módulos de orçamento/comercial e,
posteriormente, produção.

**2. Cadastro de pedidos**

O sistema deverá permitir o **cadastro direto de pedidos**.

O cadastro deverá aproveitar, sempre que possível, informações já
existentes no sistema, evitando a redigitação de dados.

Um pedido poderá possuir:

Número/identificação do pedido;

Cliente;

Data de criação;

Data prevista de entrega;

Responsável;

Origem do pedido;

Status;

Observações;

Itens;

Informações comerciais relevantes;

Histórico de alterações.

Quando o pedido for originado de uma proposta/orçamento existente,
deverá ser possível estabelecer o vínculo entre o pedido e a respectiva
proposta.

**3. Importação de pedidos**

Além do cadastro manual, o sistema deverá permitir a **importação de
pedidos provenientes de arquivos ou sistemas externos**.

Inicialmente, deverá ser considerada a possibilidade de importação
através de arquivos estruturados, como:

Excel;

CSV;

outros formatos estruturados que venham a ser definidos.

A arquitetura deverá ser preparada para futuras integrações com sistemas
externos.

A importação não deverá simplesmente inserir os dados no banco.

Antes da confirmação, o sistema deverá realizar validações para
identificar:

Cliente inexistente;

Produto/item inexistente;

Dados obrigatórios ausentes;

Informações incompatíveis;

Quantidades inválidas;

Datas inválidas;

Duplicidade de pedido;

Outros erros ou inconsistências.

O usuário deverá visualizar as inconsistências e corrigi-las ou
confirmar a importação quando permitido.

**4. Estrutura do pedido**

Um pedido poderá possuir **um ou vários itens**.

Cada item deverá possuir seus próprios dados e status de acompanhamento.

O sistema deverá permitir visualizar:

**Pedido → Itens → Situação de cada item**

O andamento dos itens deverá contribuir para a determinação do status
geral do pedido.

Exemplo:

Item 1 — concluído;

Item 2 — em andamento;

Item 3 — pendente.

Nesse cenário, o pedido deverá permanecer como parcialmente concluído/em
andamento, conforme as regras de status estabelecidas.

**5. Status do pedido**

O sistema deverá possuir estados que permitam acompanhar claramente o
ciclo de vida do pedido.

A estrutura deverá ser configurável para permitir evolução futura, mas
deverá contemplar, no mínimo, situações como:

Recebido;

Em análise;

Pendente;

Aprovado;

Liberado;

Em andamento;

Parcialmente concluído;

Concluído;

Cancelado.

Os status deverão possuir regras de transição e permissões.

Nem todo usuário poderá alterar qualquer status.

**6. Acompanhamento do pedido**

O sistema deverá permitir acompanhar o pedido de forma cronológica e
visual.

A tela do pedido deverá apresentar, de maneira organizada:

Dados principais;

Cliente;

Itens;

Status atual;

Prazo;

Previsão de entrega;

Responsável;

Pendências;

Eventos relevantes;

Histórico;

Alterações realizadas.

O usuário deverá conseguir identificar rapidamente:

**O que é este pedido?\
Em que situação ele está?\
Existe alguma pendência?\
Está dentro do prazo?\
O que já foi concluído?\
O que ainda falta?**

**7. Histórico e rastreabilidade**

Todas as alterações relevantes deverão ser registradas.

O sistema deverá manter histórico contendo, quando aplicável:

Usuário responsável;

Data;

Horário;

Informação anterior;

Nova informação;

Tipo de alteração;

Observação/motivo, quando necessário.

O histórico deverá ser protegido contra alterações indevidas.

A rastreabilidade deverá permitir identificar quem realizou determinada
alteração e quando ela ocorreu.

**8. Permissões**

O acesso às informações e operações do módulo deverá respeitar o sistema
de permissões.

Deverá ser possível definir permissões por:

Usuário;

Perfil;

Função;

Setor, quando aplicável.

Exemplos:

visualizar pedido;

criar pedido;

editar pedido;

alterar status;

cancelar pedido;

importar pedidos;

corrigir dados importados;

visualizar histórico;

configurar notificações.

A empresa deverá possuir controle sobre essas permissões.

**9. Prazo e previsão de entrega**

O pedido deverá possuir uma **data prevista de entrega**.

O sistema deverá permitir acompanhar a situação do pedido em relação ao
prazo.

Deverá ser possível identificar, conforme as regras configuradas:

pedidos dentro do prazo;

pedidos próximos do vencimento;

pedidos em risco;

pedidos atrasados.

O cálculo e os critérios utilizados para determinar risco de atraso
deverão ser configuráveis e poderão ser aprimorados posteriormente com
informações provenientes de outros módulos.

**10. Notificações e alertas**

O sistema deverá possuir um **mecanismo de notificações e alertas
configurável pela empresa**.

As notificações não deverão ser obrigatórias.

A empresa deverá decidir se deseja utilizar esse recurso e quais
notificações deseja ativar.

Deverá ser possível configurar:

Ativação/desativação das notificações;

Eventos que gerarão notificações;

Destinatários;

Usuários ou perfis;

Regras e condições;

Prioridade do alerta;

Canais disponíveis.

Exemplos de eventos:

Pedido recebido;

Pedido alterado;

Pedido aprovado;

Pedido liberado;

Pedido com pendência;

Pedido em risco de atraso;

Pedido atrasado;

Item concluído;

Pedido concluído;

Necessidade de intervenção.

A configuração deverá ser realizada por usuários autorizados da empresa.

O sistema deverá permitir que diferentes perfis recebam diferentes tipos
de notificações.

**11. Motor de notificações**

A estrutura deverá ser desenvolvida como um **motor de regras
configurável**, evitando criar notificações de forma rígida no código.

Isso permitirá que a empresa:

Ative ou desative regras;

Crie novas regras;

Modifique destinatários;

Modifique condições;

Adicione novos tipos de eventos futuramente.

A arquitetura deverá permitir a expansão desse mecanismo sem necessidade
de reconstrução do módulo.

**12. Histórico de eventos e notificações**

O sistema deverá manter registro dos eventos e notificações gerados,
permitindo consultar:

Evento que originou a notificação;

Data e horário;

Destinatários;

Status da notificação;

Se foi visualizada, quando aplicável;

Usuário relacionado;

Regra que gerou o alerta.

Esse histórico deverá respeitar as permissões de acesso.

**13. Integração com outros módulos**

O módulo de pedidos deverá ser desenvolvido de forma desacoplada e
preparada para integração com outros módulos do sistema.

Deverá permitir futuramente integração, conforme os módulos forem
desenvolvidos, com:

Clientes;

Produtos;

Orçamentos;

Comercial;

Estoque;

Produção;

Expedição;

Financeiro;

Relatórios e indicadores.

Neste momento, não implementar regras específicas de programação ou
execução da produção.

Essas funcionalidades serão tratadas no **Tópico 4 — Produção/Fábrica**.

**14. Interface**

A interface deverá ser simples, clara e orientada à operação.

A tela principal deverá permitir:

Pesquisar pedidos;

Filtrar por status;

Filtrar por cliente;

Filtrar por período;

Filtrar por prazo;

Identificar pedidos atrasados;

Identificar pedidos com pendências;

Abrir rapidamente o pedido;

Visualizar o andamento.

A tela de detalhes deverá apresentar as informações de forma organizada,
evitando excesso de informações simultâneas.

**15. Regras gerais**

O desenvolvimento deverá priorizar:

Integridade dos dados;

Rastreabilidade;

Controle de acesso;

Facilidade de utilização;

Baixo retrabalho;

Escalabilidade;

Flexibilidade;

Preparação para integrações futuras.

Não criar funcionalidades de produção/fábrica dentro deste módulo além
das informações necessárias para **acompanhar o status geral do
pedido**.

As funcionalidades detalhadas de:

roteiro de fabricação;

etapas produtivas;

apontamentos;

programação;

capacidade produtiva;

filas;

máquinas;

setups;

agrupamento de produção;

aproveitamento de matéria-prima;

gargalos;

retrabalho produtivo;

deverão permanecer no **Tópico 4 — Produção/Fábrica**.

**Resultado esperado**

Ao final da implementação, o módulo deverá permitir que a empresa tenha
uma **visão única, confiável e rastreável de seus pedidos**, desde o
recebimento/cadastro até a conclusão, com possibilidade de entrada
manual ou importada, acompanhamento por item, controle de prazos,
histórico completo, permissões e um sistema de notificações totalmente
configurável pela própria empresa.
