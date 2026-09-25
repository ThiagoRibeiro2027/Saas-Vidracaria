**ADR-002 — MVP e Escopo do Produto**

**Status:** APROVADO\
**Versão:** 2.13\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 2026-09-09 (§4.7 e §5 revisados em 2026-09-16 — ampliação de
escopo do TÓPICO 4; §4.7 corrigido em 2026-09-17 — contradição interna
resolvida, ver nota no próprio §4.7; §4.3 revisado em 2026-09-19 —
ampliação de escopo do TÓPICO 10; §4.17 revisado em 2026-09-23 —
recorte mínimo do TÓPICO 13, Fase 1; §4.16 revisado em 2026-09-23 —
Fase 2, ainda básica, do TÓPICO 12; §4.18 revisado em 2026-09-23 —
recebimento leve de material, Fase D do plano de fila de
produção/peças/suprimentos; §4.5 revisado em 2026-09-23 — motor de
regras básico, Fase G do mesmo plano; §4.6 e §4.18 revisados em
2026-09-23 — escopo completo do módulo de Compras, ver ADR-011; §4.17
revisado em 2026-09-25 — Fase 2 do TÓPICO 13, UI da fila técnica; §4.17
revisado novamente em 2026-09-25 — Fase 3 do TÓPICO 13, webhooks
recebidos de terceiros; §4.17 revisado uma terceira vez em 2026-09-25 —
Fase 4 do TÓPICO 13, webhooks enviados + motor de automação; §4.14 e
§4.17 revisados em 2026-09-25 — Fase 5 do TÓPICO 13, bancos/boletos/PIX
com contas a pagar/cobrança/conciliação)\
**Decisão:** Definição do escopo funcional e dos limites do MVP\
**Decisão vinculada:** ADR-003, ADR-004, ADR-005, ADR-007, ADR-008 e
ADR-011

**1. Contexto**

O produto será desenvolvido como um SaaS para gestão operacional de
empresas do segmento de vidraçaria.

O MVP deve ser a menor versão capaz de permitir a validação do produto
em uma operação real, utilizando dados, usuários, pedidos e processos
reais.

O objetivo do MVP não é entregar um ERP completo, mas validar se o
sistema consegue sustentar o fluxo operacional central da empresa.

O critério fundamental adotado é:

**Se o piloto consegue operar um pedido real do orçamento ao
aceite/conclusão sem determinada funcionalidade, essa funcionalidade não
faz parte do MVP.**

O fluxo central considerado para o MVP é:

**Orçamento → Pedido → Conferência → Liberação → Engenharia essencial →
Estoque → Produção → Controle necessário → Expedição → Obra/Instalação →
Aceite/Conclusão.**

O MVP também deverá possuir os recursos transversais necessários para
que esse fluxo seja seguro, rastreável e operacionalmente utilizável.

**2. Definição de pedido real**

Para fins deste ADR:

**Pedido real** é aquele que representa uma operação efetivamente
executada ou destinada à execução pela empresa-piloto, utilizando dados,
regras e condições reais, ainda que determinados processos acessórios
sejam temporariamente executados fora do SaaS.

O uso de dados fictícios isoladamente não será considerado suficiente
para validar o MVP.

**3. Decisão**

Será adotado um **MVP focado no fluxo operacional central**, priorizando
a capacidade de executar e rastrear uma operação real de ponta a ponta.

O MVP não deverá conter todas as funcionalidades dos módulos previstos
para o produto definitivo.

A existência de um módulo no MVP não significa que todas as
funcionalidades desse módulo estejam incluídas.

A classificação adotada será:

**MVP:** necessário para operar e validar o fluxo central;

**Release 1:** necessário para profissionalizar, ampliar e escalar a
operação;

**Futuro:** recursos avançados, otimizações e funcionalidades não
essenciais.

**4. Composição do MVP**

**4.1 Base / Estrutura**

Incluído no MVP:

- estrutura multiempresa;

- isolamento entre empresas;

- identificação única de registros;

- estrutura organizacional necessária;

- usuários e acesso;

- parâmetros estruturais;

- auditoria;

- informações necessárias para rastreabilidade.

**4.2 Cadastros**

Incluído no MVP:

- clientes;

- contatos;

- produtos;

- serviços;

- materiais;

- componentes;

- fornecedores quando necessários;

- unidades;

- categorias;

- estruturas técnicas;

- equipes;

- demais cadastros indispensáveis ao fluxo.

**4.2.1 Importação inicial de dados**

O MVP deverá suportar uma **importação inicial controlada dos dados
necessários à operação do cliente-piloto**.

A importação poderá contemplar, conforme necessidade real do piloto:

- clientes;

- contatos;

- produtos;

- serviços;

- materiais;

- componentes;

- fornecedores;

- preços;

- demais dados cadastrais indispensáveis ao início da operação.

A importação deverá utilizar arquivos ou formatos estruturados e deverá
possuir, no mínimo:

- validação dos dados recebidos;

- identificação de registros inválidos;

- identificação de inconsistências;

- apresentação de erros;

- possibilidade de correção antes da efetivação;

- conferência dos dados importados;

- registro da operação para fins de auditoria;

- identificação da origem dos dados importados.

A importação deverá evitar a criação de registros duplicados quando
houver critérios confiáveis de identificação.

A responsabilidade pela conferência final dos dados importados deverá
permanecer com o responsável definido para o processo.

**Não fazem parte do MVP:**

- migração histórica completa;

- migração irrestrita de todos os dados existentes;

- ferramentas complexas de ETL;

- integrações automatizadas de importação não essenciais;

- sincronizações permanentes com sistemas externos para manutenção
  automática desses cadastros.

Caso durante o piloto seja demonstrado que determinada integração ou
mecanismo adicional de importação é indispensável ao fluxo principal,
sua inclusão deverá seguir o processo de governança e controle de escopo
definido neste ADR.

**4.3 Comercial / Orçamentos**

Incluído de forma simplificada:

- criação de orçamento;

- itens;

- quantidades;

- medidas;

- preços;

- descontos;

- condições comerciais básicas;

- validade;

- revisão;

- aprovação;

- histórico;

- conversão em pedido.

**Ampliação de escopo (19/09/2026 — decisão do responsável do produto via
chat).** Passam a fazer parte do MVP, de forma simplificada, três frentes
do Prompt TÓPICO 10 que a versão anterior desta ADR excluía:

**Oportunidades e funil comercial (TÓPICO 10 §3-4), simplificado:**
oportunidade com cliente/prospect, responsável, origem, descrição, valor
potencial, probabilidade, previsão de fechamento e observações; estágio
dentro de um funil **fixo** (Prospecção → Contato → Levantamento →
Oportunidade qualificada → Orçamento → Negociação → Aprovação →
Ganha/Perdida — o exemplo padrão do próprio §3), não configurável por
empresa nesta fase; motivo de perda de uma lista fixa (§4), não
configurável. Um orçamento pode se originar de uma oportunidade. Fica
fora: funil configurável por empresa, atividades/follow-up (§6) e
múltiplos contatos por cliente (§2) — isso continua sendo "CRM avançado"
e "funil comercial avançado" excluídos abaixo.

**Formação de custo simplificada (TÓPICO 10 §12-14):** custo unitário
informável por item do orçamento (metodologia única: "custo informado",
§13 — as demais metodologias dependem de histórico de compras/produção
que o sistema ainda não tem maduro) e markup/margem para sugerir preço,
sem travar o preço final digitado. Custo, margem e markup são
informação interna: nunca aparecem na proposta enviada ao cliente (regra
do §22, que já valia antes desta ampliação). Fica fora: composição de
custo multi-fator vinda de estrutura técnica real da Engenharia/PCP
(matéria-prima, mão de obra por operação, processos produtivos) — isso
depende de BOM que a Engenharia (T5) ainda não tem no recorte atual.

**Proposta comercial (TÓPICO 10 §23-27), simplificada:** documento
gerado a partir do estado atual do orçamento (sem versionamento — este
continua fora do MVP, ver nota da migration original do TÓPICO 10),
congelando um retrato (itens, preços, condições) no momento da geração;
validade própria; registro de envio (data/hora, responsável, canal,
destinatário); e aceite registrado manualmente pelo Comercial (sem
portal do cliente nem assinatura eletrônica — ambos fora de escopo).
Sem geração de PDF com identidade visual/layout configurável nesta fase:
a proposta é um registro estruturado dentro do sistema.

Continuam fora do MVP após esta ampliação:

- CRM avançado (múltiplos contatos por cliente, histórico comercial
  completo além do que já existe);

- funil comercial configurável por empresa;

- atividades e follow-up (§6);

- campanhas;

- automações comerciais complexas;

- comissionamento avançado;

- matriz de aprovação multinível configurável além da alçada simples já
  existente (`approval_thresholds`);

- tabelas de preço por cliente/grupo (§17-18);

- indicadores e previsão comercial (§37-39) — isso é escopo do TÓPICO 12
  (BI), não do Comercial;

- concorrência (§40);

- identidade visual/layout configurável e assinatura eletrônica da
  proposta.

**4.4 Pedidos**

Incluído no MVP:

- conversão de orçamento;

- conferência;

- alterações controladas;

- liberação;

- prioridade;

- histórico;

- informações comerciais e técnicas;

- vínculo com engenharia;

- vínculo com estoque;

- vínculo com produção;

- vínculo com expedição;

- vínculo com instalação;

- conclusão;

- rastreabilidade de ponta a ponta.

**4.5 Engenharia**

A Engenharia do MVP deverá contemplar somente o necessário para
transformar o pedido em informação executável.

Incluído:

- especificações técnicas;

- medidas;

- composição;

- componentes;

- materiais;

- quantidades;

- características técnicas;

- necessidades de produção;

- necessidades de materiais;

- validações essenciais;

- revisões;

- histórico.

A modelagem deverá dar atenção especial a:

- barras;

- cantoneiras;

- perfis;

- demais materiais lineares relevantes à operação.

Não fazem parte do MVP:

- otimização avançada de corte;

- simulações complexas;

- algoritmos avançados de aproveitamento;

- otimização matemática avançada.

**Ampliação de escopo — motor de regras básico, Fase G (23/09/2026 —
decisão do responsável do produto via chat).** O Prompt TÓPICO 5 (54
seções) chama de "MVP" (§50) um PDM/PLM completo — Produto×Projeto,
biblioteca técnica como módulo próprio, configurador de produto,
motor de regras, BOM sugerida→definitiva com workflow de aprovação
separado, versionamento de regras, "Solicitação de Engenharia" como
fluxo à parte, CMV técnico, fila de Engenharia. Nada disso é aprovado
por este parágrafo — o texto acima desta seção (composição,
componentes, materiais, quantidades, características técnicas,
necessidades de produção/materiais, revisões, histórico) continua
sendo o real corte de MVP da Engenharia, e é isso que já foi
implementado nas Fases A/E/F do plano de evolução da BOM leve
(peças/composição hierárquica com revisão básica, e configurador de
características por peça).

O que passa a fazer parte do MVP, de forma simplificada, é só um
**motor de regras básico**: regra = 1 condição (uma característica já
configurada na peça, um operador de comparação, um valor) → 1 ação
sobre a composição da peça (ajustar quantidade de um material,
adicionar material, ou remover material). Regras são dados
configuráveis (tabela, não código), cada regra é imutável uma vez
criada — "editar" uma regra cria uma nova, vinculada à anterior, que é
desativada; nada é sobrescrito, preservando o princípio do Prompt
TÓPICO 5 §14 ("nova versão de regra não altera projetos históricos").
Uma função de simulação mostra o que as regras ativas sugeririam para
um pedido_item específico, comparando com a composição base — **o
sistema sugere, a Engenharia decide** (Prompt TÓPICO 5 §13, princípio
adotado integralmente): nenhuma regra escreve na composição real da
peça automaticamente nesta fase.

Continua fora do MVP após esta ampliação, exatamente como antes: mais
de uma condição combinada por regra (E/OU), motor avançado de regras,
configurador de produto como tela própria além dos campos já cobertos
pela Fase F, Produto×Projeto, biblioteca técnica como módulo dedicado,
workflow de aprovação/liberação separado do que já existe em Pedidos/
Produção, "Solicitação de Engenharia", CMV técnico, fila de
Engenharia, e a aplicação automática da sugestão na composição real
(BOM sugerida→definitiva com workflow de revisão — fase futura
distinta, mediante nova aprovação).

**4.6 Estoque**

Incluído:

- estoque;

- saldos;

- entradas;

- saídas;

- reservas;

- separação;

- consumo;

- movimentações;

- ajustes controlados;

- inventário;

- rastreabilidade;

- vínculo com pedidos;

- vínculo com produção.

O estoque deverá refletir as necessidades do fluxo operacional e
preservar a integridade das quantidades.

**Ampliação de escopo — estoque dimensional e conversão de unidade
completa, Fase 0 da ADR-011 (23/09/2026 — decisão do responsável do
produto via chat).** T6 modela saldo como **escalar** por decisão
original (TÓPICO 6: "saldo é ESCALAR... não peça física individual") —
decisão que continua valendo, sem alteração de comportamento, para todo
item que não pedir o contrário.

Esta emenda autoriza, de forma aditiva, dois mecanismos exigidos pelo
módulo de Compras completo (ADR-011, TÓPICO 7 §5/§6/§9): controle de
estoque por **peça física individual** (barra, chapa, bobina — com
comprimento/área/peso restante e sobra reaproveitável) e as
**propriedades físicas de item** (densidade, espessura, peso por
metro/por área) necessárias a uma conversão de unidade **dimensional
completa** (ex.: metro linear → kg via densidade linear, área → peso) —
não um fator de conversão fixo.

Nada disso se aplica a item que não optar por controle por peça: o
modelo escalar de `estoque_saldos` continua servindo, sem alteração de
comportamento, todo item e todo módulo que já o consome hoje (Estoque,
Produção, Suprimentos, Fila de Produção). O controle dimensional é
aditivo — não substitui, não migra e não obriga a migração de
`estoque_saldos`.

Continua fora desta emenda: rastreamento de lote/série/certificado de
qualidade por peça (isso é Recebimento, escopo da ADR-011, não deste
controle de saldo) e qualquer forma de otimização de corte/nesting sobre
as peças e sobras controladas por esta emenda — a vedação do TÓPICO 4
§54/deste ADR §4.7/§5 à otimização matemática de corte permanece
integralmente; o controle dimensional de estoque autorizado aqui é só
saldo/posição/sobra, nunca decisão de corte.

**4.7 PCP / Produção**

**Revisado em 2026-09-16 — escopo ampliado para o TÓPICO 4 completo**
(docs/Prompt TÓPICO 4 — PCP E PRODUÇÃO.md, §1-53, decisão do responsável
do produto). Substitui o recorte mínimo original desta seção.

Incluído:

- geração de produção, ordens de produção (OP) e apontamentos (§1-3,
  §38), com liberação/bloqueio conforme requisitos definidos (§3-4);

- engenharia liberada para produção, com versionamento e avaliação de
  impacto de alterações (§4);

- planejamento e programação da produção por horizonte configurável —
  diário, semanal, mensal, por turno, setor, máquina, linha ou equipe
  (§5);

- sequenciamento inteligente **baseado em regras e parâmetros
  configuráveis** (não IA autônoma, conforme §49) — recomendação
  classificada (🟢/🟡/🔴), com explicação, e decisão sempre do usuário
  autorizado: aceitar, rejeitar, modificar ou ignorar (§6-7);

- simulação de cenários de programação antes da aplicação, sem alterar a
  programação oficial sem confirmação (§8);

- horizonte e congelamento de programação, com histórico de alterações
  em período protegido (§9);

- replanejamento orientado por eventos, sempre com decisão humana — "
  recalcular não significa automaticamente alterar a programação oficial
  " (§10);

- OP com produção parcial, em lotes, em paralelo e com transferência
  entre recursos, preservando rastreabilidade (§11-13);

- lote fabril agrupando quantidades de diferentes OPs para otimização
  operacional, sem alterar pedido/item/estrutura comercial (§14);

- roteiro produtivo configurável por empresa, com acompanhamento
  operação a operação — planejado, iniciado, produzido, aprovado,
  rejeitado, retrabalho, saldo (§15-16);

- interfaces por dispositivo (computador, tablet, celular) conforme o
  perfil de uso (§17);

- QR Code/código de barras e etiquetas para OP e lote (§18-19);

- comparação de necessidade × disponibilidade de materiais, com
  classificação de situação (§20);

- vidro como insumo crítico, com identificação de déficit e geração de
  necessidade para Suprimentos, sem bloquear etapas independentes do
  vidro (§21-22);

- sobras reutilizáveis: registro, rastreamento e identificação de
  oportunidades de reaproveitamento, com decisão do usuário (§24-25) —
  **excluída a otimização matemática/nesting de combinações**, conforme
  já delimitado pelo §54 do TÓPICO 4 e mantido por este ADR (ver exclusão
  no §5);

- qualidade integrada ao processo produtivo, não conformidade,
  disposição e retrabalho vinculado à produção original, com impacto nos
  indicadores (§26-29) — sem duplicar o módulo TÓPICO 8 (Qualidade), que
  permanece responsável pela inspeção formal;

- consumo e perdas comparando planejado × real, com tolerâncias
  configuráveis e alerta (§30);

- capacidade produtiva (máquinas, equipamentos, linhas, equipes,
  operadores, turnos, ferramentas), cálculo de capacidade disponível ×
  necessária e identificação de gargalos (§31-32, §37);

- manutenção preventiva e corretiva de equipamentos, com impacto
  calculado sobre a programação e apresentação de alternativas (§33-36);

- alterações durante a produção com avaliação prévia de impacto e
  histórico "antes → alteração → depois → usuário → data/hora → motivo"
  (§40);

- status de produção e bloqueios configuráveis pela empresa, com motivo
  estruturado e distinção entre "não produzido" e "não pode ser
  produzido" (§41-42);

- encerramento de OP por critério de processo (não só quantidade),
  liberação para estoque/expedição do produto conferido e aprovado
  (§43-44);

- custos produtivos (planejado × real) por OP, item, pedido, lote,
  operação ou produto, sem substituir o módulo financeiro (§45);

- rastreabilidade completa pedido → item → OP → lote fabril → operação →
  recurso → apontamento → material → qualidade → resultado, com
  histórico de toda alteração relevante (§46-47);

- indicadores de produção, prazo, materiais, capacidade, equipamentos,
  qualidade e custos (§48);

- permissões por perfil (operador, líder/supervisor, PCP, gestor) e
  configurabilidade de status, roteiros, operações, recursos, turnos,
  prioridades, critérios de sequenciamento, tolerâncias e regras de
  notificação (§50-51);

- lista de corte por chapa/barra (§54, complemento de 12/09/2026), como
  saída de leitura — não entidade de otimização.

O MVP deverá suportar **execução parcial**, preservando a relação entre:

- quantidade planejada;

- quantidade realizada;

- quantidade pendente.

Continuam fora mesmo do TÓPICO 4 completo (§49 e §54 do próprio tópico,
mantidos por este ADR):

- inteligência artificial autônoma ou funcionalidades preditivas —
  sequenciamento e recomendações usam regras e parâmetros configuráveis;

- otimização matemática/nesting de corte, combinação automática de
  sobras e integração com máquinas de corte — a decisão final de corte
  permanece com o operador (§54, "Limites").

Não fazem parte do MVP:

- otimização matemática;

- balanceamento avançado;

- programação automática (sequenciamento e replanejamento continuam
  sempre com decisão humana — §6-10 deste mesmo §4.7);

- análise avançada de gargalos (a identificação básica de gargalos do
  §31-32/§37 está incluída acima; o que fica de fora é análise
  preditiva/estatística sobre isso);

- OEE.

**Correção de 2026-09-17:** esta lista continha "sequenciamento
avançado", "simulação de capacidade" e "manutenção" como fora do MVP —
resíduo da versão anterior à ampliação de escopo de 2026-09-16, nunca
atualizado quando a lista equivalente do §5 foi corrigida na mesma data
(que já registra: "PCP avançado, sequenciamento avançado, simulação de
capacidade e manutenção deixam de constar nesta lista — passam a fazer
parte do MVP conforme o §4.7 revisado"). Essa lista contradizia tanto a
seção "Incluído" deste mesmo §4.7 (que já lista sequenciamento
inteligente baseado em regras §6-7, simulação de cenários §8 e
manutenção preventiva/corretiva com impacto na programação §33-36) quanto
o próprio §5. Removidos os três itens daqui pra eliminar a contradição —
nenhuma regra de negócio nova foi criada por esta correção, só alinhada
a redação ao que o §4.7 e o §5 já diziam desde 16/09. Decisão do
responsável do produto em 2026-09-17: capacidade produtiva e manutenção
(§31-37) entram como próxima fase de implementação do TÓPICO 4.

**Decisão do responsável do produto em 2026-09-19 (fecha §44 / Fase 7d da
ampliação de escopo):** liberação para expedição já está implementada
(`adicionar_item_expedicao()`, T9, exige `ordens_producao.status=
'concluida'` e `status_qualidade='aprovado'`) — nenhum código novo
necessário desse lado. Liberação para **estoque** de produto acabado
fica fora do MVP: T6 (Estoque, recorte de 13/09/2026, anterior a esta
ampliação de escopo de T4) não modela produto acabado, só matéria-prima
consumida na produção — `estoque_saldos`/`estoque_movimentacoes` não têm
nenhum tipo de entrada para OP concluída. Cada `ordens_producao` é 1:1
com um `pedido_item_id` (fabricação sob encomenda, sem produto de
catálogo genérico pra estocar); um saldo compartilhado por `item_id`
misturaria quantidades já comprometidas com pedidos/clientes diferentes,
duplicando o que `ordens_producao.quantidade_produzida` +
`status_qualidade` já resolvem — mesmo risco de duplicação de autoridade
evitado em §43/§48. §44 fica encerrado sem alteração de schema.

**Decisão do responsável do produto em 2026-09-19 (adia §45 / Fase 7b da
ampliação de escopo):** investigação prévia mostrou que não existe
nenhum dado de preço/custo em lugar nenhum do schema aprovado, e não por
lacuna acidental — três exclusões de ADR já decididas se cruzam
exatamente onde §45 pisa. Material: `itens` (T2) não tem custo unitário,
e ADR-002 §4.18/§5 são taxativos — "o módulo completo de Compras não
fará parte do MVP", cotação/preço ficam pro TÓPICO 7 completo, fase
futura fora do MVP. Mão de obra/máquina: `recursos_produtivos` (T4
§31-32) só tem `capacidade_horas_dia`, nenhum campo de custo/hora — o
próprio TÓPICO 4 doc (§31-37) nunca menciona valor monetário, só horas.
Centro de custo: T11 Financeiro já exclui isso explicitamente do MVP, e
"análise por OP/item/pedido/lote/operação/produto" do §45 é um centro de
custo por outro nome. Implementar §45 como especificado (custo planejado
× real em valor monetário) exigiria inventar preço unitário de material
e taxa/hora de mão de obra/máquina do zero — regra de negócio nova sem
base em ADR. §45 fica adiado (não descartado) para quando Compras e/ou
centro de custo forem decididos para uma fase futura do MVP.

**Decisão do responsável do produto em 2026-09-19 (fecha §41 / Fase 7c da
ampliação de escopo, "só rótulo, sem mexer no que T8/T9 já leem"):**
`ordens_producao.status`/`situacao`/`status_qualidade` continuam com os
mesmos 10 valores internos fixos — `registrar_inspecao_qualidade()` (T8)
e `adicionar_item_expedicao()`/`criar_expedicao()` (T9) continuam
comparando essas strings literalmente, sem nenhuma alteração. O que a
empresa configura é só o rótulo exibido para cada valor
(`producao_status_labels`/`definir_rotulo_status_producao()`/
`rotulos_status_producao()`), mesmo padrão de "configurar apresentação,
nunca a semântica que outro módulo já lê" de roteiros_produtivos/
recursos_produtivos (Fase 5a). "Pausada" (uma das 9 referências do §41)
fica fora: não há estado de pausa/retomada na OP (excluído do recorte
original de T4 como "tracking de tempo, não de quantidade") — não há o
que rotular. "Evitar excesso de status" já estava satisfeito antes desta
fase, com os 3 campos fixos cobrindo os outros 8 estados de referência.
Fecha o bloco combinado da Fase 7 (§40-48): 7a (22/09), 7b adiado e 7d
fechado (19/09), 7c fechado (19/09).

**Decisão do responsável do produto em 2026-09-19 (fecha §50 / Fase 7e,
"ok, conforme recomendado"):** 3 ações finas em `producao`
(`apontar`/`planejar`/`configurar`, TÓPICO 4 §50) substituem parte do que
hoje só `producao.manage` cobria, mapeando os 3 perfis que já
correspondem a função existente — Operador (apontar/perda/retrabalho,
concluir OP, reportar/encerrar manutenção corretiva), PCP (criar/
programar/sequenciar OP, lote, lote fabril, manutenção preventiva,
transferência de recurso) e Gestor (roteiro, recurso, prioridade, peso
de sequenciamento, horizonte, rótulo de status, cancelar OP). Ficam de
fora, por não mapearem pra nada que já existe: "validar apontamentos"
(perfil Líder/Supervisor) exigiria um workflow de aprovação de
apontamento que não existe — regra de negócio nova sem base em ADR,
mesmo problema do §45; "tratar ocorrências" não é conceito de T4 (existe
em T9/T16). `assert_tenant_write_any()` aceita a ação fina OU `manage` —
nenhuma empresa que já tinha `producao.manage` perde acesso a nada, sem
backfill de `role_permissions` necessário.

**Decisão do responsável do produto em 2026-09-19 (fecha §30 e o item
"tolerâncias de perdas" do §51 / Fase 7f, "ok, conforme recomendado"):**
`verificar_tolerancia_perda()` reaproveita `cutting_margin_settings`/
`get_cutting_margin()` (T15 §31.4, já configurável por empresa) — que já
É a margem de quebra planejada — e compara contra
`ordens_producao.quantidade_perdida` real. Fórmula (detalhe de cálculo,
não de escopo): perda tolerada = quantidade_planejada × percentual /
100 — denominador é o planejado, não o produzido, mesmo espírito de
"planejado × real". OP sem margem configurada pro material/processo
nunca vira alerta falso (percentual/tolerada/excedida ficam `null`).
Alerta é sinal passivo no painel, mesmo padrão já decidido pra gargalos
na Fase 5c — sem integrar com ADR-007/Notificações, que não existe no
schema. Turnos e regras de notificação do PCP (§51) continuam fora do
MVP por decisão anterior (Release 1 e módulo de Notificações ainda não
implementado, respectivamente) — com isso, §51 fica sem nenhum item
pendente que dependa só de T4.

**4.8 Expedição / Logística**

Incluído:

- preparação;

- separação;

- conferência;

- carregamento;

- despacho;

- entrega;

- ocorrências;

- rastreabilidade.

Deverá também suportar operações parciais, mantendo:

- planejado;

- realizado;

- pendente.

Não fazem parte do MVP:

- otimização de rotas;

- telemetria de frota;

- gestão logística avançada.

**4.9 Obra / Instalação**

Incluído:

- agendamento;

- obra;

- endereço;

- equipe;

- responsável;

- agenda;

- materiais;

- execução;

- observações;

- ocorrências;

- pendências;

- execução parcial;

- conclusão;

- aceite;

- evidências;

- encerramento.

O módulo deverá estar preparado para operação offline conforme definido
no ADR-005.

**4.10 Usuários e Permissões**

Incluído:

- usuário;

- perfil;

- permissões;

- escopo por empresa/unidade;

- acesso por módulo;

- acesso por função;

- acesso por ação;

- permissões individuais quando aplicáveis;

- autoridade;

- validade;

- auditoria;

- autorização no backend.

A arquitetura deverá respeitar a separação entre:

**Usuário → Perfil → Permissões**

conforme ADR-001.

**4.11 Configurações**

Incluído:

- parâmetros da empresa;

- unidades;

- numerações;

- status;

- regras configuráveis;

- parâmetros operacionais;

- notificações;

- configurações de permissões.

Regras de negócio que possam variar entre empresas deverão ser
configuráveis quando necessário, evitando hard-code específico do
cliente-piloto.

**4.12 Notificações**

No MVP:

- notificações internas;

- e-mail;

- push, condicionado à decisão do ADR-008.

WhatsApp e SMS não poderão bloquear o fluxo principal do sistema.

As preferências de comunicação deverão respeitar as regras aplicáveis de
privacidade e LGPD.

**4.13 Qualidade**

Será disponibilizado somente o mínimo necessário para controle
operacional:

- inspeção essencial;

- registro de não conformidade;

- bloqueio;

- aprovação/reprovação;

- retrabalho;

- liberação;

- histórico.

Funcionalidades avançadas de qualidade ficam para Release 1.

**4.14 Financeiro**

O Financeiro do MVP será deliberadamente limitado.

Deverá manter:

- valor do pedido;

- condições de pagamento;

- parcelas planejadas;

- situação financeira básica;

- registro de pagamento/recebimento quando necessário;

- vínculo com o pedido.

Não fazem parte do MVP:

- estrutura completa de contas a receber;

- contas a pagar;

- cobrança;

- conciliação;

- fluxo de caixa completo;

- integração bancária;

- DRE;

- centros de custo avançados;

- relatórios financeiros avançados.

O objetivo é evitar a criação de um <span dir="rtl">“</span>mini módulo
financeiro completo” dentro do MVP.

**Ampliação de escopo — contas a pagar, cobrança, conciliação e conta
bancária (25/09/2026 — decisão do responsável do produto via chat, TÓPICO
13 §6, Fase 5).** Dos itens listados acima como fora do MVP, quatro
passam a fazer parte, com recorte deliberado:

- **contas a pagar**: já havia sido aberto antes desta data pela ADR-011
  (Compras, Fase 6) — `titulos_pagar`, gêmeo estrutural de
  `titulos_financeiros`, sem plano de contas/centro de custo/juros/
  multas. Esta emenda acrescenta por cima o fluxo de aprovação do TÓPICO
  13 §6.2 (submeter → aprovar por alçada → pagar), sem alterar o
  comportamento de quem nunca configurar alçada;

- **cobrança**: só sobre título a RECEBER (T11) — registro de boleto/PIX
  sem provedor bancário real conectado (sem linha digitável/QR Code de
  verdade), marcar como paga sempre chama `registrar_recebimento_
  titulo()` já existente, nunca duplica o estado do recebimento;

- **conciliação**: só manual (§6.1) — lançamento de movimentação
  bancária e vínculo à mão com título a receber/pagar ou cobrança.
  Conciliação automática/sugerida fica de fora: sem provedor real
  conectado não há extrato de verdade pra comparar;

- **conta bancária**: cadastro simples (banco/agência/conta/tipo/PIX) da
  empresa, sem nenhuma integração real com instituição financeira.

Continuam fora do MVP, sem mudança: fluxo de caixa completo, DRE, centros
de custo avançados, relatórios financeiros avançados, plano de contas, e
qualquer integração bancária real (nenhum provedor de fato conectado —
mesmo espírito do catálogo de integrações da Fase 1 de T13).

**4.15 Fiscal**

O escopo fiscal do MVP será condicionado às decisões do ADR-004.

Não deverão ser criadas premissas fiscais não definidas nesse ADR.

**4.16 Indicadores**

O MVP deverá possuir somente indicadores operacionais básicos
necessários para acompanhamento do fluxo.

Não fazem parte do MVP:

- BI avançado;

- dashboards analíticos complexos;

- análises preditivas;

- indicadores avançados de desempenho.

**Ampliação de escopo — Fase 2, ainda básica (23/09/2026 — decisão do
responsável do produto via chat).** O Prompt TÓPICO 12 (49 seções) é,
do início ao fim, uma plataforma analítica completa — KPI versionado,
drill-down, construtor de dashboards, alertas, Cockpit Executivo,
benchmark, Assistente Analítico em linguagem natural — e continua
integralmente fora do MVP por este parágrafo: nada disso é aprovado
agora.

O que passa a fazer parte do MVP, de forma simplificada, é só:

- **Quatro indicadores calculados simples**, direto sobre o schema que
  já existe, sem nenhuma tabela nova: ticket médio (TÓPICO 12 §14 —
  valor liberado ÷ pedidos liberados), taxa de conversão orçamento→
  pedido (§14 "Cotações", simplificada para contagem de orçamentos com
  pedido vinculado ÷ total de orçamentos no período), taxa de não
  conformidade (§18 — inspeções reprovadas ÷ total de inspeções no
  período), e OTIF básico (§19 — só "no prazo" e "integral", comparando
  `pedidos.previsao_entrega` com a data em que a expedição saiu;
  simplificado — sem separar por transportadora/região/rota).

- **Filtro de período** (§6, só o recorte "período personalizado" via
  data de início/fim) aplicado ao dashboard operacional inteiro
  (recorte mínimo e os quatro indicadores acima) — sem os períodos
  pré-definidos do §6 (hoje/semana/mês/trimestre/etc.), sem comparação
  com período anterior, meta, orçamento ou média histórica (isso seria
  "análise temporal", §8, que continua fora).

Continuam fora do MVP após esta ampliação, exatamente como antes: KPI
versionado com definição centralizada (§4), os demais filtros e
períodos pré-definidos (§5-7 além do que foi listado acima), análise
temporal/tendência/sazonalidade (§8), drill-down (§9), análise de
desvios e de impacto (§10-11), saúde dos processos (§12), rentabilidade
(§13 — exigiria custo de produção que não existe no schema), os
dashboards completos de cada área além dos quatro indicadores acima
(§14-20), Cockpit Executivo (§21), prioridades/oportunidades/riscos
(§22-25), metas (§26), construtor de dashboards (§27-28), alertas
(§29-30), notificações de BI (§31), relatórios agendados/exportação
(§32-33), compartilhamento (§34), benchmark entre unidades (§35),
snapshots históricos (§36), comentários gerenciais (§37), e o
Assistente Analítico em linguagem natural (§38-39). Governança de
permissão continua só `bi.view` — a separação de três níveis do §41
(visualizar/configurar/administrar) só faz sentido quando houver algo
para configurar ou administrar (dashboards, metas, alertas), que
continua fora.

**4.17 Integrações**

Somente integrações indispensáveis ao funcionamento do MVP serão
incluídas.

Integrações não essenciais ficam para fases posteriores.

**Recorte mínimo — Fase 1 (23/09/2026 — decisão do responsável do
produto via chat).** O TÓPICO 13 tem 40 seções e nenhum recorte de MVP
próprio como o TÓPICO 18 tem em seu §12; esta é a primeira fase
aprovada, cobrindo só a espinha dorsal técnica de integrações, sem
nenhum conector externo real ligado:

- **Central de Integrações (TÓPICO 13 §2):** registro de integrações
  por empresa, catálogo interno (nome, categoria, status
  ativo/inativo, ambiente), ativar/desativar sem apagar dados ou
  histórico existente; acesso via `has_permission()`.

- **Catálogo de integrações (§3):** categorias do próprio doc
  (ERP, bancos, fiscal, pagamentos, transportadoras, logística, BI,
  e-commerce, marketplaces, APIs, outros), mas sem nenhum conector
  implementado — constar no catálogo não ativa nada para a empresa.

- **Eventos internos entre módulos (§4),** apenas nível **Informativo**
  (§15): detectar → registrar → informar. Sem execução automática de
  efeitos operacionais/financeiros nesta fase — isso é nível
  Automático, fora de escopo.

- **Infraestrutura técnica genérica:** fila assíncrona simples (§16),
  idempotência (§18), retry com backoff para falha temporária e "erro
  permanente → intervenção necessária" (§17), logs com identificador
  de correlação (§19), auditoria diferenciando ação automática de
  decisão do operador (§20).

- **Fonte oficial configurável por tipo de informação/processo (§9):**
  só o registro da configuração por empresa; reconciliação automática
  entre sistemas (§11) fica fora.

- **Estrutura vazia (tabelas/hooks preparatórios, sem processar nada
  de verdade)** para documentos fiscais (NF-e, §5) e ERP externo (§8):
  prepara o "gancho" sem nenhum conector real ligado, sem captura
  automática de XML, sem sincronização de fato — mesmo padrão já usado
  para o gancho do otimizador de corte externo (§40).

Fica fora desta fase, entrando depois dentro do próprio TÓPICO 13
mediante nova aprovação: processamento real de NF-e/fiscal (captura,
conferência, status por item — §5.1 a §5.7), bancos/PIX/boletos (§6),
cartões e meios de pagamento (§7), APIs de terceiros com autenticação
real (§13), Webhooks recebidos/enviados (§14), certificados digitais
(§22), reconciliação automática entre sistemas (§11), importação/
exportação genérica (§29-30, além do que já existe em §4.2.1), e o
gancho do otimizador de corte externo (§40).

**Ampliação de escopo — Fase 2, UI da fila (25/09/2026 — decisão do
responsável do produto via chat).** A infraestrutura técnica genérica
aprovada na Fase 1 (fila assíncrona, idempotência, retry — §16-18) já
existia inteiramente no banco, incluindo teste de isolamento
cross-tenant e teste negativo (deny), mas sem nenhuma tela própria. Esta
fase só dá visualização e controle manual ao que já existia — não cria
capacidade nova de processamento nem liga nenhum conector real:

- listagem das operações da fila (integração, tipo, status, tentativas,
  próxima tentativa, erro), com destaque visual para erro permanente
  (§17: "intervenção necessária" nunca fica escondida);

- reprocessamento manual de operação em erro (temporário ou permanente)
  e cancelamento de operação pendente ou em erro, ambos reaproveitando
  as funções `reprocessar_operacao()`/`cancelar_operacao()` já existentes
  desde a Fase 1 — nenhuma função nova de banco foi criada.

Continuam fora, nos mesmos termos da Fase 1: tudo o que dependeria de um
conector real (nenhuma tela "testa conexão" ou "sincroniza", porque não
há o que testar/sincronizar ainda) e todo o restante listado no
parágrafo anterior.

**Ampliação de escopo — Fase 3, webhooks recebidos (25/09/2026 — decisão
do responsável do produto via chat).** Do §14 ("Webhooks e Eventos"), só
a metade "recebidos de terceiros" entra agora — webhooks enviados por
este sistema e o motor de automação "Evento → Condição → Ação" descrito
no mesmo parágrafo do doc (condições/ações configuráveis, ex.: "NF-e
recebida → valor acima do limite → solicitar aprovação") continuam
inteiramente fora, por serem um recorte maior e distinto que exigiria
sua própria aprovação:

- endpoint de entrada por integração (`/api/webhooks/integracoes/
  [token]`), gerado/rotacionado/desativado pelo tenant com permissão
  `integracoes.manage`, exigindo a integração ativa;

- autenticação por assinatura HMAC-SHA256 (segredo mostrado uma única
  vez, na geração/rotação — nunca mais legível depois, nem pelo próprio
  tenant) — cobre a exigência do §14 de proteger contra **origem
  inválida**;

- proteção contra **reutilização indevida** (replay): a assinatura cobre
  timestamp + corpo, e requisições fora de uma janela de 5 minutos são
  rejeitadas mesmo com assinatura correta;

- proteção contra **duplicidade**: o evento recebido cai na mesma fila da
  Fase 2, reaproveitando a idempotência já existente — reenviar o mesmo
  evento (`X-Webhook-Id`) nunca cria uma segunda operação;

- proteção contra **eventos inválidos**: corpo precisa ser JSON válido
  com um campo `tipo`, senão é rejeitado antes de chegar à fila.

O caminho de recepção roda sem sessão de usuário (é uma chamada de
servidor para servidor, de um terceiro) — por isso a função que grava na
fila (`registrar_operacao_webhook()`) é a única do módulo que não segue
o padrão geral de "nunca aceitar company_id do cliente, sempre validar
via `current_company_id()`": aqui não existe `current_company_id()`
possível (não há usuário autenticado), então o company_id é derivado da
própria integração (chave estrangeira imutável), nunca de um parâmetro,
e a função só é executável por `service_role` — nenhum grant a
`authenticated`, testado como caso de negação explícito.

Continua fora, sem mudança: tudo o que já estava fora da Fase 1 (NF-e/
fiscal real, bancos/PIX/boletos, cartões, APIs de terceiros com
autenticação real, certificados digitais, reconciliação automática,
importação/exportação genérica, gancho do otimizador de corte externo),
mais webhooks **enviados** por este sistema e o motor de automação
condição→ação do §14.

**Ampliação de escopo — Fase 4, webhooks enviados + motor de automação
(25/09/2026 — decisão do responsável do produto via chat).** Fecha o
§14 ("Webhooks e Eventos") e o §15 ("Níveis de Automação"), com um
recorte deliberado nos três pontos abaixo, cada um decidido explicitamente
antes de codar:

- **Só níveis Informativo e Assistido (§15).** Nível Automático
  ("detectar → executar" sem decisão humana) fica de fora — o próprio
  §15 exige autorização própria pra esse nível, que não foi dada agora.
  Por causa disso, o modelo trava a combinação nível×ação: Informativo só
  aceita a ação "notificar" (nunca efeito externo, coerente com "detectar
  → informar → registrar"); Assistido só aceita "webhook_saida" (a única
  ação com efeito externo, e por isso a única que passa por confirmação
  humana antes de executar). Isso torna o motor estruturalmente à prova
  de loop: a única ação que gera uma nova linha na fila nunca dispara
  sozinha.

- **Entrega real do webhook de saída via Vercel Cron, 1x/dia** — mesma
  limitação de plano Hobby já aceita pros crons de security-alerts e
  notificacoes-email (RUNBOOK-GOVERNANCA-DE-SEGURANCA.md §3). O evento
  fica na fila (mesma infraestrutura de idempotência/retry da Fase 1)
  até a próxima execução.

- **Condição da regra aceita múltiplas condições combinadas por um único
  operador E/OU** (sem agrupamento aninhado nesta fase) — cobre o
  exemplo do próprio §14 ("NF-e recebida → valor acima do limite →
  solicitar aprovação") e vai além do mínimo de uma condição só.

Mecanismo: "Evento" reaproveita a mesma fila de operações da Fase 1/3
(`integracao_operacoes`) — um trigger avalia toda linha nova contra as
regras ativas da empresa (casando por `tipo`), sem precisar de um
barramento de eventos separado. Proteções do §14 (origem inválida,
duplicidade, reutilização indevida, eventos inválidos) resolvidas do lado
do webhook de saída com o mesmo esquema HMAC-SHA256 (timestamp + corpo)
já usado nos webhooks recebidos (Fase 3).

O caminho de entrega (cron) roda sem sessão de usuário, mesma exceção
documentada na Fase 3 para `registrar_operacao_webhook()`: três funções
`sistema_iniciar_processamento_operacao/concluir_operacao/falhar_operacao`
espelham as tenant-facing da Fase 1 sem o gate de `assert_tenant_write()`
(que exige `auth.uid()`, inexistente num cron), restritas a `service_role`
— nunca `authenticated`.

Continua fora: tudo o que já estava fora da Fase 1/3 (NF-e/fiscal real,
bancos/PIX/boletos, cartões, APIs de terceiros com autenticação real,
certificados digitais, reconciliação automática, importação/exportação
genérica, gancho do otimizador de corte externo) e, dentro do próprio
§14-15, o nível Automático e condições agrupadas/aninhadas.

**Ampliação de escopo — Fase 5, bancos/boletos/PIX (25/09/2026 — decisão
do responsável do produto via chat).** Abre §6 (Bancos, Boletos e PIX),
com título a pagar + fluxo de aprovação (§6.2) e conciliação manual
(§6.1) — ver o detalhamento completo na emenda ao §4.14 (Financeiro)
acima, que é onde as tabelas/regras de negócio deste recorte realmente
vivem (`contas_bancarias`, `financeiro_alcada_etapas`/`financeiro_
aprovacoes`/`financeiro_aprovacao_etapas`, `cobrancas`,
`movimentacoes_bancarias`). Fica registrado aqui só porque a decisão de
abrir esse escopo nasceu de uma pergunta sobre T13, não sobre Financeiro
em si — a ADR-011 (Compras) já tinha aberto contas a pagar antes desta
data, sem esperar por T13.

Continua fora, sem mudança: NF-e/fiscal real (bloqueado pelo ADR-004,
não por este ADR), cartões e meios de pagamento (§7), extrato/
conciliação automática, DRE, plano de contas, e qualquer conector
bancário real (nenhum provedor de fato conectado).

**4.18 Abastecimento / Compras**

O módulo completo de Compras não fará parte do MVP.

Entretanto, quando houver necessidade de aquisição de material durante o
MVP, o sistema deverá:

- registrar a necessidade;

- identificar o material;

- registrar a quantidade;

- permitir acompanhamento da necessidade.

A efetivação da compra poderá ocorrer fora do SaaS durante o MVP.

**Ampliação de escopo — recebimento leve, Fase D (23/09/2026 — decisão
do responsável do produto via chat).** O módulo completo de Compras
continua integralmente fora do MVP, sem nenhuma exceção: continuam fora
cadastro de fornecedor com dados/condições de compra, cotação e
comparação de preço, negociação, pedido de compra formal com termos
comerciais, aprovação por alçada de compra, compra recorrente/contrato,
orçado×comprometido×realizado, mapa de compras futuras, avaliação de
fornecedor e o próprio conceito de Pedido de Compra como documento —
nada disso é aprovado agora.

O que passa a fazer parte do MVP, de forma simplificada, é só fechar o
ciclo que o parágrafo acima já abre ("permitir acompanhamento da
necessidade") com um passo a mais depois de "atendida": registrar que o
material referente a uma necessidade de compra foi efetivamente
recebido, com a quantidade recebida, e dar entrada física no estoque a
partir disso — reaproveitando o mecanismo de ajuste de saldo que já
existe (TÓPICO 6, `ajustar_saldo()`), sem criar um mecanismo de entrada
de estoque novo.

Continua fora desta ampliação, ficando para uma fase futura do próprio
TÓPICO 7 mediante nova aprovação: nota fiscal de entrada vinculada
automaticamente ao recebimento (isso é TÓPICO 13, captura/conferência
fiscal, ADR-004), conferência de qualidade do material recebido,
recebimento parcial em múltiplas remessas com rastreamento individual
por remessa, divergência entre pedido/nota/recebido, devolução ao
fornecedor, controle de lote/série no recebimento, e quarentena. O
recebimento aqui é só "a necessidade virou material disponível em
estoque" — um estado a mais no ciclo de vida da necessidade, não um
processo de recebimento com conferência.

**Ampliação de escopo — módulo completo de Compras, ADR-011 (23/09/2026
— decisão do responsável do produto via chat).** As duas ampliações
acima deste parágrafo (recebimento leve, Fase D) permanecem válidas e
implementadas — não são revogadas por esta ampliação.

Esta nova ampliação as supera em abrangência: a frase "o módulo completo
de Compras continua integralmente fora do MVP... nada disso é aprovado
agora", registrada na ampliação de recebimento leve acima, deixa de
valer a partir desta data. Você aprovou explicitamente o **escopo
literal completo** do `docs/Prompt TÓPICO 7 - SUPRIMENTOS E COMPRAS.md`
(39 seções — cadastro de fornecedor com dados/condições de compra,
cotação e comparação de preço, negociação, pedido de compra formal com
termos comerciais, aprovação por alçada de compra, compra
recorrente/contrato, orçado×comprometido×realizado, mapa de compras
futuras, avaliação de fornecedor, recebimento completo com
conferência/lote/divergência/devolução, e o próprio conceito de Pedido
de Compra como documento).

O detalhamento completo de escopo, as fases de entrega e o que cada fase
inclui/exclui estão registrados em **ADR-011 — Compras**, que passa a
governar este módulo — este §4.18 fica, a partir de agora, só com a
remissão. `necessidades_compra` e o ciclo leve (`aberta→atendida→
recebida/cancelada`) das duas ampliações acima continuam existindo e em
produção; a ADR-011 define como esse ciclo se encaixa no fluxo completo
novo (convergem no mesmo registro — uma Solicitação de Compra consome a
necessidade via `atender_necessidade_compra()` já existente, sem
transição paralela).

Continua fora, mesmo com o escopo completo aprovado, por pertencer a
outro ADR: nota fiscal de entrada vinculada automaticamente ao
recebimento (TÓPICO 13, captura/conferência fiscal — ADR-004).

**5. Funcionalidades explicitamente fora do MVP**

Ficam fora do MVP:

- Qualidade avançada;

- Financeiro completo;

- Fiscal completo além do necessário definido pelo ADR-004;

- BI avançado;

- CRM avançado;

- automações avançadas;

- IA;

- funcionalidades preditivas;

- integrações não essenciais;

- otimização matemática/nesting de corte, combinação automática de
  sobras e integração com máquinas de corte (TÓPICO 4 §54 — mantido
  mesmo após a ampliação de escopo de 2026-09-16 registrada no §4.7);

- OEE (não previsto no TÓPICO 4 e não incluído por esta revisão).

**Revisado em 2026-09-23:** "Compras completas" deixa de constar nesta
lista — passa a ser escopo aprovado por decisão do responsável do
produto, registrada no §4.18 e detalhada na ADR-011. Nenhuma regra de
negócio nova é criada por esta revisão em si; a autorização e o
detalhamento estão nas emendas ao §4.6/§4.18 e na ADR-011.

**Revisado em 2026-09-16:** PCP avançado, sequenciamento avançado,
simulação de capacidade e manutenção deixam de constar nesta lista —
passam a fazer parte do MVP conforme o §4.7 revisado, por decisão do
responsável do produto de ampliar o escopo do TÓPICO 4 para o documento
completo (respeitados os limites do §54 e a vedação a IA autônoma do
§49, ambos do próprio TÓPICO 4).

Nenhuma dessas funcionalidades deverá ser antecipada por interpretação
de outros documentos.

**6. Fluxo mínimo validado**

O MVP será considerado operacionalmente válido quando um pedido real
puder percorrer:

**Orçamento → Aprovação/Conversão → Conferência → Liberação → Engenharia
→ Reserva/Disponibilidade → Produção → Controle necessário → Expedição →
Instalação → Aceite/Conclusão → Encerramento.**

As informações produzidas em uma etapa deverão alimentar a etapa
seguinte, evitando redigitação desnecessária.

O sistema deverá preservar:

- responsável;

- data/hora;

- alterações;

- aprovações;

- histórico de status;

- materiais;

- produção;

- expedição;

- instalação;

- ocorrências;

- conclusão.

O MVP deverá suportar exceções operacionais básicas, incluindo:

- material indisponível;

- necessidade de aquisição;

- produção parcial;

- expedição parcial;

- instalação parcial;

- item reprovado;

- retrabalho;

- pendência;

- atraso;

- ocorrência de expedição;

- ocorrência de instalação;

- retorno;

- cancelamento;

- bloqueio.

**7. Critérios de sucesso do MVP**

O MVP deverá demonstrar que:

o fluxo principal pode ser executado de ponta a ponta;

as informações são preservadas entre as etapas;

os usuários conseguem executar suas responsabilidades;

os principais bloqueios operacionais são tratados;

existe rastreabilidade;

existe integridade de dados;

existe isolamento entre empresas;

não é necessário utilizar planilhas externas para controlar o núcleo do
fluxo;

operações parciais são corretamente representadas;

o sistema pode ser utilizado com dados e usuários reais.

Não é requisito do MVP que todos os módulos estejam completos.

**8. Relação com o cliente-piloto**

O cliente-piloto serve para validar o produto, e não para definir um
produto exclusivo para ele.

Novas necessidades identificadas durante o piloto deverão ser
classificadas como:

- defeito;

- correção necessária;

- necessidade essencial do produto;

- melhoria/backlog;

- necessidade específica do cliente.

Uma necessidade poderá entrar no MVP quando:

- bloquear o fluxo principal;

- comprometer integridade dos dados;

- comprometer segurança;

- representar obrigação legal;

- demonstrar que uma premissa fundamental do produto estava incorreta;

- for indispensável ao propósito do produto.

Solicitações específicas do cliente não entrarão automaticamente no
produto.

Deverá ser avaliado se são:

- configuração;

- funcionalidade padrão;

- melhoria futura;

- customização controlada;

- solicitação não aplicável ao produto.

Qualquer aumento relevante de escopo deverá registrar:

- funcionalidade;

- motivo;

- impacto;

- justificativa;

- impacto no cronograma;

- impacto de desenvolvimento;

- funcionalidade que eventualmente será removida ou postergada.

**9. Consequências aceitas**

A decisão aceita conscientemente:

- MVP incompleto;

- algumas atividades temporariamente executadas fora do SaaS;

- funcionalidades avançadas postergadas;

- ajustes decorrentes do uso real;

- priorização dinâmica baseada em evidências;

- algumas automações manuais durante o piloto.

Não são aceitos:

- perda de dados;

- vazamento entre empresas;

- ausência de rastreabilidade essencial;

- inconsistência de dados;

- impossibilidade de concluir o fluxo principal;

- falhas graves de segurança;

- descumprimento legal aplicável.

A prioridade de desenvolvimento será:

fluxo operacional;

segurança, integridade, rastreabilidade e estabilidade;

usabilidade e produtividade;

suporte;

funcionalidades avançadas.

Estratégia:

**Validar → Aprender → Priorizar → Evoluir.**

**10. Alternativas consideradas**

**Alternativa A — Produto completo antes do piloto**

**Rejeitada.**

Aumentaria custo, prazo e risco antes de obter validação real.

**Alternativa B — Todos os módulos no MVP, porém simplificados**

**Rejeitada.**

Ainda produziria um escopo excessivamente amplo e reduziria o foco.

**Alternativa C — MVP focado no fluxo operacional central**

**APROVADA.**

Permite validar a principal hipótese do produto com menor risco.

**Alternativa D — MVP específico para o cliente-piloto**

**Rejeitada.**

Criaria risco de transformar o piloto em projeto sob medida.

**11. Dependências**

Este ADR possui dependências com:

**ADR-001 — Usuários / Permissões**

Define a arquitetura de acesso e autorização.

**ADR-003 — Cliente-piloto**

Define formalmente o cliente-piloto, responsabilidades e critérios de
validação.

**ADR-004 — Fiscal**

Define o escopo fiscal efetivamente necessário ao MVP.

**ADR-005 — Offline**

Define o funcionamento offline, especialmente para Obra/Instalação.

**ADR-007 — Notificações**

Define os canais e regras de comunicação.

**ADR-008 — Plataforma do aplicativo de campo**

Será necessária para definir a estratégia definitiva de PWA versus
aplicativo nativo e, consequentemente, o push.

**12. Governança do MVP**

Este ADR representa o limite oficial do MVP.

Nenhum outro documento poderá ampliar esse escopo por interpretação.

Qualquer alteração deverá registrar:

- decisão anterior;

- nova decisão;

- motivo;

- impacto funcional;

- impacto técnico;

- impacto no prazo;

- consequências;

- data;

- responsável pela decisão.

O ADR deverá ser versionado.

Alterações posteriores não deverão apagar silenciosamente decisões
anteriores.

**13. Decisões postergadas**

Ficam para definição posterior:

- planos comerciais;

- preços;

- gateway de pagamento;

- métodos de pagamento da assinatura;

- período de teste;

- onboarding self-service;

- regras de PAST_DUE;

- regras de SUSPENDED;

- roadmap completo da Release 1;

- integrações futuras;

- aprofundamento fiscal;

- aprofundamento financeiro;

- funcionalidades avançadas de BI;

- funcionalidades avançadas de automação e IA.

A arquitetura deverá permanecer preparada para evolução sem exigir
reconstrução do núcleo do produto.

**14. Resultado esperado**

O MVP deverá ser suficientemente pequeno para ser desenvolvido e
validado com rapidez, mas suficientemente completo para permitir uma
operação real do fluxo principal.

A definição final é:

**O MVP não busca ser um ERP completo. Busca provar que o SaaS consegue
controlar, com segurança, rastreabilidade e integridade, o fluxo
operacional central de uma vidraçaria desde o orçamento até a conclusão
do pedido.**

**Status final: APROVADO**

**Versão consolidada: 2.4**\
**Alteração desta versão: ampliação do escopo do TÓPICO 10 (Comercial,
§4.3) para incluir, de forma simplificada, oportunidades/funil comercial
(fixo, não configurável), formação de custo (metodologia única "custo
informado") e proposta comercial (documento gerado do orçamento, sem
versionamento nem PDF/layout configurável). Decisão do responsável do
produto em 2026-09-19, via chat. Continuam fora do MVP: CRM avançado,
funil configurável, atividades/follow-up, campanhas, automações
complexas, comissionamento avançado, matriz de aprovação multinível,
tabelas de preço por cliente, indicadores comerciais (ficam no TÓPICO
12/BI) e concorrência. Versão anterior (2.3) arquivada em
docs/Histórico.**

**Versão consolidada: 2.3**\
**Alteração desta versão: correção de uma contradição interna no §4.7 —
a lista "Não fazem parte do MVP" ao final da seção ainda excluía
sequenciamento avançado, simulação de capacidade e manutenção, resíduo
da versão anterior à ampliação de escopo de 16/09/2026 que nunca foi
atualizado quando o §5 já havia corrigido a mesma contradição. Nenhuma
regra de negócio nova foi criada — só alinhada a redação ao que o §4.7 e
o §5 já diziam. Decisão do responsável do produto em 2026-09-17: prioriza
capacidade produtiva e manutenção (§31-37) como próxima fase de
implementação do TÓPICO 4. Versão anterior (2.2) arquivada em
docs/Histórico.**

**Versão 2.2 (16/09/2026): ampliação do escopo do TÓPICO 4 (PCP/Produção,
§4.7) para o documento completo — sequenciamento inteligente baseado em
regras, simulação de cenários, lote fabril, roteiro produtivo
configurável, capacidade/recursos, manutenção preventiva/corretiva,
custos produtivos, QR Code/etiquetas e indicadores —, mantidas as
vedações a IA autônoma e a otimização matemática/nesting de corte já
fixadas pelo próprio TÓPICO 4 (§49 e §54). Decisão do responsável do
produto em 2026-09-16, registrada também no §5. Versão anterior (2.1)
arquivada em docs/Histórico.**
