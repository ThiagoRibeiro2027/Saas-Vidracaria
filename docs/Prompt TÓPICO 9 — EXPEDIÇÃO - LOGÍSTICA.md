**TÓPICO 9 — EXPEDIÇÃO / LOGÍSTICA**

**Objetivo**

Desenvolver o módulo de Expedição/Logística do SaaS industrial,
responsável pelo planejamento, preparação, conferência, carregamento,
transporte, entrega, devoluções e encerramento das operações logísticas.

O módulo deve ser integrado aos demais módulos do sistema, mas sem
duplicar responsabilidades que pertencem a Estoque, Qualidade,
Financeiro, Pedidos, Produção ou Instalações/Serviços em Campo.

**1. Preparação e planejamento da expedição**

Permitir gerar uma expedição a partir de:

Pedido;

Produção concluída;

Estoque disponível;

Programação de entrega;

Transferências entre unidades;

Outros eventos configuráveis.

A expedição deverá identificar:

Cliente;

Pedido;

Itens;

Quantidades;

Endereço;

Data prevista;

Prioridade;

Condições especiais;

Documentos necessários.

**Expedições parciais**

Um mesmo pedido poderá possuir várias expedições.

Exemplo:

100 unidades no pedido:

Expedição 1: 40;

Expedição 2: 35;

Expedição 3: 25.

Cada expedição deverá manter sua própria rastreabilidade.

**Agrupamento**

Permitir agrupar diferentes pedidos em uma mesma viagem/carga quando
aplicável, mantendo a individualização e rastreabilidade de cada pedido.

**2. Separação e conferência**

Gerar tarefas/listas de separação contendo:

Item;

Código;

Descrição;

Quantidade;

Unidade;

Lote, quando aplicável;

Localização no estoque;

Pedido;

Cliente;

Observações.

Registrar a quantidade efetivamente separada.

**Divergências**

Se houver diferença entre o planejado e o separado, registrar a
divergência.

Permitir tratamentos configuráveis:

Corrigir separação;

Expedir parcialmente;

Solicitar produção;

Solicitar ajuste;

Bloquear expedição;

Registrar ocorrência.

**3. Reserva de estoque**

A expedição poderá reservar estoque para uma futura saída.

A reserva:

Não representa baixa;

Não altera definitivamente o saldo disponível;

Deve ser rastreável;

Deve poder ser liberada/cancelada conforme o fluxo.

O Estoque permanece como responsável pelo saldo oficial e pelas
movimentações.

**4. Conferência e carregamento**

Antes da saída, conferir:

Pedido;

Cliente;

Item;

Código;

Quantidade;

Lote;

Volumes;

Identificação;

Embalagem;

Acessórios;

Documentos;

Requisitos especiais.

Permitir leitura por código de barras/QR Code quando disponível.

**Organização da carga**

Permitir organizar a carga considerando:

Sequência de entregas;

Cliente;

Pedido;

Volumes;

Peso;

Dimensões;

Capacidade do veículo;

Características dos produtos.

**Lacre**

Quando aplicável, registrar:

Número do lacre;

Responsável;

Data/hora;

Substituição;

Rompimento;

Observações.

**5. Transporte**

Permitir modalidades:

Frota própria;

Transportadora;

Retirada pelo cliente;

Transporte terceirizado;

Outros modelos configuráveis.

Permitir registrar:

Veículo;

Placa;

Tipo/capacidade;

Transportadora;

Dados do transporte;

Informações de rastreamento;

Documentação relacionada.

O cadastro completo de veículos e transportadoras deverá permanecer no
módulo de Cadastros.

**Não utilizar <span dir="rtl">“</span>Motorista” como função
administrativa do sistema.**

Quando houver uma operação de instalação, a pessoa responsável será
tratada no módulo de **Instalações/Serviços em Campo** como
profissional/equipe de instalação.

**6. Frete e rotas**

Permitir configurar:

Responsabilidade pelo frete;

Pagador;

Custo do frete;

Frete cobrado do cliente;

Condições comerciais relacionadas.

Permitir planejamento de rotas por:

Região;

Cidade;

Cliente;

Data;

Prioridade;

Janela de entrega;

Capacidade do veículo.

No MVP, permitir planejamento manual e organização básica das rotas.

Otimização automática de rotas poderá ser implementada futuramente.

**7. Viagens e agrupamento de entregas**

Permitir criar uma viagem contendo diversas expedições.

Exemplo:

Viagem 125:

Pedido 1001 — Cliente A;

Pedido 1008 — Cliente B;

Pedido 1012 — Cliente C.

Cada pedido deverá continuar independente para fins de:

Rastreamento;

Faturamento;

Estoque;

Entrega;

Ocorrências.

**8. Entrega**

Controlar:

Data prevista;

Data efetiva;

Horário/janela;

Endereço;

Contato;

Status;

Ocorrências.

Status possíveis:

Programada;

Em carregamento;

Em trânsito;

Chegada ao destino;

Entregue;

Entregue parcialmente;

Não entregue;

Reagendada;

Recusada;

Devolvida;

Cancelada;

Outros configuráveis.

**Comprovante de entrega**

Permitir registrar:

Recebedor;

Data/hora;

Assinatura;

Foto;

Documento;

Observações;

Evidência digital.

**9. Entrega parcial**

Permitir que somente parte dos itens seja entregue.

Exemplo:

Expedidos: 100;

Entregues: 80;

Pendentes: 20.

Os itens pendentes deverão permanecer vinculados ao pedido e poderão
gerar nova expedição.

**10. Ocorrências**

Registrar ocorrências como:

Atraso;

Endereço incorreto;

Cliente ausente;

Impossibilidade de acesso;

Avaria;

Falta de volume;

Divergência;

Recusa;

Problema operacional;

Devolução;

Outros motivos configuráveis.

Cada ocorrência deverá registrar:

Tipo;

Data/hora;

Responsável;

Item/volume;

Quantidade;

Descrição;

Evidências;

Tratamento;

Status.

**11. Retorno e devolução**

Quando uma carga retornar, registrar o retorno e encaminhar os itens
para o tratamento apropriado.

O retorno **não deverá automaticamente tornar o item disponível em
estoque**.

Dependendo do caso, poderá ser direcionado para:

Estoque;

Quarentena;

Qualidade;

Reprocesso;

Reparo;

Devolução ao fornecedor;

Sucata/perda;

Outro tratamento configurável.

Fluxo:

**Cliente → Devolução → Recebimento → Qualidade, quando necessário →
Disposição → Estoque**

**12. Avarias**

Permitir registrar avarias ocorridas:

No carregamento;

No transporte;

No recebimento.

Registrar:

Item;

Volume;

Quantidade;

Fotos;

Evidências;

Responsável;

Transportadora;

Veículo;

Tratamento;

Responsabilidade, quando determinada.

Permitir integração com Qualidade, Estoque, Financeiro e Comercial.

**13. Baixa de estoque**

A empresa deverá poder configurar qual evento efetiva a baixa:

Confirmação da saída física;

Faturamento;

Faturamento + saída;

Outro evento configurável.

O sistema deverá impedir dupla baixa.

Exemplo:

**Faturamento → baixa**

ou:

**Expedição → baixa**

ou:

**Faturamento → Expedição → baixa**, conforme configuração.

O Estoque permanece como responsável pela movimentação e pelo saldo
oficial.

Manter rastreabilidade entre:

**Pedido → Item → Faturamento → Expedição → Movimentação de Estoque**

**14. Liberação para saída**

A saída deverá respeitar os bloqueios configurados.

Possíveis bloqueios:

Qualidade;

Estoque insuficiente;

Divergência;

Documentação;

Financeiro;

Comercial;

Endereço;

Aprovação;

Outros.

Cada bloqueio deverá possuir:

Motivo;

Responsável;

Data/hora;

Origem;

Condição de desbloqueio.

Produto bloqueado pela Qualidade não poderá ser expedido enquanto o
bloqueio obrigatório estiver ativo.

**15. Documentação**

Permitir relacionar à expedição:

Nota fiscal;

Documentos de transporte;

Romaneio;

Lista de volumes;

Etiquetas;

Certificados;

Comprovantes;

Documentos do cliente;

Projetos/desenhos necessários;

Outros documentos configuráveis.

O sistema não precisa gerar todos os documentos internamente quando
houver integração externa, mas deverá manter seus vínculos e
disponibilização.

**16. Romaneio**

Permitir gerar romaneio contendo:

Viagem;

Veículo;

Transportadora;

Pedidos;

Clientes;

Endereços;

Itens;

Quantidades;

Volumes;

Peso/dimensões;

Sequência de entrega;

Observações.

**17. Etiquetas e identificação**

Permitir identificar:

Produto;

Volume;

Pedido;

Cliente;

Destino;

Número do volume;

Código de barras;

QR Code;

Informações especiais de manuseio.

Para produtos desmontados ou distribuídos em vários volumes, permitir
identificar a relação entre todos os volumes pertencentes ao mesmo
pedido/produto.

**18. Integrações**

**Pedidos**

Receber:

Itens;

Quantidades;

Cliente;

Endereço;

Condições;

Prioridade;

Requisitos especiais.

Retornar:

Quantidades expedidas;

Quantidades entregues;

Datas;

Ocorrências;

Devoluções;

Situação da entrega.

**Produção**

Consultar:

OP;

Status;

Quantidade produzida;

Quantidade aprovada;

Quantidade disponível;

Pendências.

**Qualidade**

Respeitar:

Inspeções;

Bloqueios;

Liberações;

Checklist de liberação para expedição;

Restrições por lote/item/quantidade.

**Estoque**

Integrar:

Disponibilidade;

Localização;

Lotes;

Reservas;

Separação;

Baixa;

Retorno;

Devolução.

O Estoque mantém o saldo oficial.

**Financeiro/Faturamento**

Integrar:

Faturamento;

Documento fiscal;

Condições financeiras relevantes;

Eventos de baixa vinculados ao faturamento.

Bloqueios financeiros deverão ser configuráveis.

**Instalações/Serviços em Campo**

Quando houver instalação, a Expedição deverá disponibilizar:

Pedido;

Cliente;

Endereço;

Produtos;

Quantidades;

Volumes;

Documentos;

Data;

Informações necessárias ao atendimento.

O processo de instalação será administrado em módulo próprio.

**19. Encerramento**

A expedição poderá ser encerrada quando os requisitos configurados forem
cumpridos:

Carga processada;

Saída registrada;

Entrega realizada ou tratada;

Divergências tratadas;

Devoluções registradas;

Documentação concluída;

Movimentações de estoque processadas;

Ocorrências tratadas.

Uma entrega parcial não deverá ser considerada automaticamente como
expedição totalmente concluída.

**20. Cancelamento**

Permitir cancelar uma expedição conforme seu estágio.

Antes da saída:

Cancelar;

Liberar reservas;

Desfazer separação, quando aplicável.

Após saída:

Não tratar como simples cancelamento;

Utilizar fluxo de retorno/devolução.

Alterações e cancelamentos deverão possuir auditoria.

**21. Indicadores**

Preparar dados para:

Expedições realizadas;

Pedidos expedidos;

Entregas realizadas;

Entregas no prazo;

Atrasos;

Entregas parciais;

Devoluções;

Ocorrências;

Avarias;

Tempo de preparação;

Tempo entre liberação e saída;

Tempo de transporte;

Ocorrências por transportadora;

Ocorrências por região/rota;

Utilização de capacidade de carga.

O BI será responsável pela análise e visualização avançada.

**22. Auditoria**

Registrar ações críticas:

Criação;

Alteração;

Aprovação;

Bloqueio;

Liberação;

Separação;

Conferência;

Carregamento;

Saída;

Entrega;

Devolução;

Cancelamento;

Alteração de quantidades.

Registrar:

Usuário;

Data/hora;

Ação;

Valor anterior;

Novo valor, quando aplicável.

**23. Configurabilidade**

A empresa deverá poder configurar:

Status;

Etapas obrigatórias;

Motivos de bloqueio;

Tipos de ocorrência;

Aprovações;

Regras de baixa;

Documentos obrigatórios;

Critérios de encerramento;

Uso de códigos/QR Code;

Regras de entrega parcial;

Regras de agrupamento;

Regras de transporte;

Outras particularidades operacionais.

**Regras fundamentais do módulo**

Expedição não mantém estoque próprio.

Estoque é responsável pelo saldo e movimentações.

Qualidade determina bloqueios/liberações de qualidade.

Financeiro/Faturamento determina os eventos financeiros/fiscais.

Expedição administra a operação logística.

Uma ordem pode possuir várias expedições.

Uma viagem pode conter várias expedições.

Uma entrega pode ser parcial.

Faturamento e saída física podem ocorrer em momentos diferentes.

O sistema deve impedir dupla baixa de estoque.

Entrega, instalação e encerramento do pedido são eventos distintos.

Instalações/Serviços em Campo será um tópico/módulo separado.

Não utilizar <span dir="rtl">“</span>Motorista” como função
administrativa do sistema.

Toda operação crítica deverá possuir rastreabilidade e auditoria.

Todas as regras relevantes devem ser configuráveis pela empresa quando
indicado.

**Fluxo macro**

**Pedido**\
→ **Produção / Estoque**\
→ **Qualidade**\
→ **Expedição**\
→ **Separação**\
→ **Conferência**\
→ **Carregamento**\
→ **Saída**\
→ **Transporte**\
→ **Entrega**\
→ **Devolução/Ocorrência, quando aplicável**

Quando houver instalação:

**Entrega**\
→ **Instalações/Serviços em Campo**

A arquitetura deverá manter esses processos integrados, porém com
responsabilidades claramente separadas.
