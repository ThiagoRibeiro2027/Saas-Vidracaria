**ADR-012 — Precificação Dimensional do Configurador**

**Status:** APROVADO\
**Versão:** 1.0\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 2026-09-27\
**Decisão:** Escopo funcional do motor de precificação dimensional para
peças configuráveis — liga o Orçamento (Comercial) diretamente à
composição técnica que hoje só existia do lado da Engenharia — e ordem
de entrega por fases\
**Decisão vinculada:** ADR-002 §4.3 (a decisão de 26/09/2026 de que
características do orçamento "não são copiadas automaticamente... nem
usadas pra calcular preço" é revista por esta ADR); ADR-011 (Compras —
fonte de custo de matéria-prima); Prompt TÓPICO 5 (Engenharia/Projeto);
Prompt TÓPICO 10 (Comercial/Orçamentos §9, §12-14)

**1. Contexto**

Em 26/09/2026, o TÓPICO 10 §9 ligou o configurador de peça (Fases F-H da
BOM leve, já existente do lado do Pedido) ao Orçamento — mas só pra
captura de características (largura, material, acabamento), sem
nenhuma automação de preço. Aquela decisão foi explícita: "os valores
capturados aqui não são copiados automaticamente" e o preço continua
100% digitado pelo vendedor.

O responsável do produto identificou, testando manualmente, que isso
não é suficiente: para produtos configuráveis (janela, box, porta), o
preço deveria variar proporcionalmente com as medidas informadas —
perfil por metro linear, vidro por metro quadrado, acessórios por
unidade —, e essa formação de preço deveria se tornar o caminho
**principal** de cotação, não um complemento. O objetivo declarado é
reduzir (idealmente eliminar) a necessidade de a Engenharia participar
do momento da venda, pra que ela trabalhe no que realmente importa:
liberar e conferir material pra fábrica. Depois do orçamento aprovado,
o produto ainda passa por uma conferência da Engenharia antes de ir pra
produção — a mesma "BOM sugerida → definitiva" que já existe desde a
Fase H, só que agora alimentada, desde o início, pelo que o vendedor já
configurou na cotação (uma "pré-engenharia").

Achado importante durante o desenho: o caso mais concreto trazido pelo
responsável do produto — "uma porta de 2000mm usa 2 roldanas, uma de
2500mm usa 3" — **já é coberto pelo motor de regras existente** (Fase G,
`peca_regras`: condição sobre uma característica → ajustar quantidade
de um material). Não é necessário nenhum mecanismo novo pra esse caso;
só reaproveitar o que já existe, agora também para fins de preço, não
só de produção.

**2. Decisão**

Fica proposto um motor de precificação dimensional que calcula o custo
(e, por cima dele, o preço já com o markup que a "formação de custo"
existente já aplica) de um item de orçamento cuja peça tenha componentes
configurados — entregue em 4 fases (§4).

**2.1 Papel dimensional da característica.** `peca_caracteristicas`
ganha um campo opcional indicando se aquela característica alimenta uma
fórmula de perímetro/área (ex.: "esta é a largura", "esta é a altura").
Sem isso, não há como uma fórmula genérica saber quais duas
características multiplicar/somar.

**2.2 Tipo de cálculo por linha de composição.** `peca_composicao`
(hoje: sempre quantidade fixa por unidade da peça) ganha um tipo de
cálculo — fixo (comportamento atual, inalterado), linear (perímetro,
para perfil) ou área (para vidro) — mais um percentual de perda
aplicável só aos dois últimos. Regras condicionais continuam
inteiramente cobertas por `peca_regras`, sem mudança nele.

**2.3 Fonte de custo: histórico de compras.** Confirmado pelo
responsável do produto: o custo de cada material vem do preço mais
recente em `historico_precos_item_fornecedor` (ADR-011) — nunca um
campo de preço próprio em `itens` (que não existe hoje) nem um valor
inventado. Se não houver histórico de preço pra um material da
composição, o cálculo não assume zero silenciosamente — avisa
explicitamente que falta custo pra aquele componente.

**2.4 Acessórios reaproveitam o motor existente.** Quantidade
condicionada a faixa de tamanho (ex.: roldana) usa `peca_regras`, já
existente — nenhuma tabela nova. Preço do acessório vem do mesmo
histórico de compras (§2.3), como qualquer outro material da
composição.

**2.5 Mão de obra manual nesta fase.** Campo aberto, digitado pelo
vendedor no item do orçamento — cálculo automático a partir de roteiros
produtivos fica pra Fase 4, não bloqueia as fases anteriores.

**2.6 Caminho principal, não complemento.** Decisão explícita do
responsável do produto: para peça configurável, este motor passa a ser
como o preço é formado — a "formação de custo" manual (custo informado
à mão, TÓPICO 10 §12-14) continua existindo só pra item sem componente
de precificação configurado.

**3. O que fica fora mesmo com o escopo aprovado**

- Otimização real de corte — reaproveitamento de sobra de barra entre
  pedidos diferentes. Projeto à parte, já citado como fora de escopo no
  TÓPICO 13 §40 ("Otimizador de Corte Externo").
- Fórmulas de composição mais sofisticadas que perímetro/área simples
  (ex.: contagem geométrica de barras verticais vs. horizontais,
  encaixes, cortes em ângulo) — entram só quando um caso real exigir,
  com decisão explícita.
- Cálculo automático de mão de obra (Fase 4 — não incluído nas Fases
  1-3).
- Comercial alterando diretamente uma estrutura técnica já aprovada
  pela Engenharia — regra já existente do TÓPICO 10 §10, inalterada.
- Qualquer preço calculado virar "autoridade cega": o vendedor sempre
  vê o detalhamento (quantos metros de perfil, m² de vidro, cada
  acessório e seu custo) antes de confirmar — nunca uma caixa-preta.

**4. Fases de entrega**

**Fase 1 — Fundação do cálculo.** Papel dimensional em
`peca_caracteristicas` (§2.1); tipo de cálculo + percentual de perda em
`peca_composicao` (§2.2); função que calcula o custo de um item de
orçamento a partir da composição da peça + regras já aplicáveis +
características capturadas (§2.4) + histórico de preço (§2.3); mão de
obra como campo manual (§2.5). Resultado: `orcamento_itens.custo_unitario`
passa a poder ser preenchido automaticamente por essa função, em vez de
só digitado — a formação de preço (markup) já existente atua em cima do
que sair daqui, sem mudança nela.

**Fase 2 — Perda e sobra real de barra.** Perfil passa a considerar o
comprimento de barra disponível do item de matéria-prima e arredonda
pra cima em barras inteiras, além do percentual de perda já previsto na
Fase 1. Reaproveitamento de sobra entre orçamentos continua fora (§3).

**Fase 3 — Composição vira BOM sugerida no Pedido.** Reabre a decisão de
26/09 de não copiar nada na conversão: `converter_orcamento_em_pedido()`
deixa de copiar itens em lote (`INSERT...SELECT`) e passa a copiar linha
a linha, preservando a correspondência entre item de orçamento e item de
pedido — necessário pra que a composição calculada no orçamento vire o
ponto de partida da BOM sugerida do pedido (`pedido_item_bom`, já
existente desde a Fase H), que a Engenharia confere e aprova
(`aprovar_bom_definitiva()`, já existente) antes de liberar pra fábrica.
É a maior mudança técnica do roteiro — mexe numa função central e já
testada — e o motivo pelo qual vem depois da Fase 1/2 validadas, não
antes.

**Fase 4 — Mão de obra automática.** Usa os roteiros produtivos e
recursos já existentes (TÓPICO 4) pra estimar tempo/custo de mão de
obra por operação, substituindo o campo manual da Fase 1.

**5. Perguntas operacionais resolvidas fase a fase**

Não bloqueiam a aprovação desta ADR, mas bloqueiam o código da fase
correspondente até resolvidas com o responsável do produto:

- **Fase 1:** o que a tela mostra/faz quando um material da composição
  não tem nenhum histórico de preço — bloqueia o cálculo do item
  inteiro, ou calcula parcialmente e avisa o que falta?
- **Fase 2:** de onde vem o(s) comprimento(s) de barra disponíveis por
  item de perfil (campo novo no cadastro do item, ou fixo por
  configuração da empresa)?
- **Fase 3:** se a Engenharia reprovar ou alterar a composição sugerida
  depois que o orçamento (e o preço) já foi aprovado/faturado, o preço
  já cobrado do cliente muda retroativamente, ou fica congelado e a
  divergência vira só um registro interno?
- **Fase 4:** fonte exata de custo/hora por operação e por recurso
  produtivo (cadastro já existe em `recursos_produtivos`, mas custo/hora
  por recurso ainda precisa ser confirmado como campo existente ou
  novo).

**6. Consequências**

Aceitas conscientemente:

- O motor de precificação passa a ser dependência crítica de todo
  orçamento de peça configurável — um erro aqui afeta preço de venda
  diretamente, diferente de hoje, onde o motor de regras só afeta
  produção interna.
- `converter_orcamento_em_pedido()`, função central e já testada, muda
  de inserção em lote pra laço linha a linha (Fase 3) — maior risco
  técnico do roteiro, mitigado por regressão completa antes do commit
  daquela fase.
- Peças já configuradas antes desta ADR (sem papel dimensional definido
  nas características, sem tipo de cálculo na composição) simplesmente
  não têm preço calculável até serem revisadas — comportamento
  degradado, não quebrado: cai pro custo manual já existente.

Não aceitas:

- Preço calculado silenciosamente a partir de custo inventado ou
  desatualizado sem aviso.
- Regressão no motor de regras existente — `simular_bom_sugerida()` e
  toda a cadeia de aprovação de BOM da Engenharia continuam se
  comportando exatamente como hoje.
- Vendedor perder a visibilidade do detalhamento por trás do preço
  calculado.

**7. Governança**

Esta ADR, se aprovada, autoriza as 4 fases do §4 desde já — mas cada
fase só começa com um checkpoint explícito ("pode seguir") do
responsável do produto, seguindo o mesmo padrão usado em Compras
(ADR-011) e nas demais frentes desta sessão. Isso não dispensa, em cada
fase:

- as regras de segurança obrigatórias do CLAUDE.md em cada tabela/
  função nova ou alterada (RLS + teste de isolamento cross-tenant, gate
  `has_permission()`/`assert_tenant_write()` — incluindo checagem de
  empresa suspensa, achado da sessão anterior —, `SECURITY DEFINER` com
  `search_path` controlado, sem grant a `PUBLIC`/`anon`, teste negativo,
  auditoria em `activity_logs`);
- a resolução das perguntas operacionais do §5 quando a fase
  correspondente começar;
- validação com dados reais e os scripts `.mjs` de teste antes de cada
  commit, seguindo o padrão já usado neste projeto;
- nenhuma alteração de comportamento do motor de regras/BOM já existente
  do lado da Engenharia, salvo o que a Fase 3 explicitamente decide
  mudar.

**Status final: APROVADO** — aprovação explícita do responsável do
produto em 27/09/2026, via chat, depois de revisão do texto completo
desta ADR. As 4 fases do §4 ficam pré-autorizadas, sujeitas ao
checkpoint por fase já descrito no §7.
