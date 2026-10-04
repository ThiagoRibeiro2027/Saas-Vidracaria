**ADR-012 — Precificação Dimensional do Configurador**

**Status:** APROVADO\
**Versão:** 1.2\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 2026-09-27 (emenda v1.1 em 2026-10-03 — cálculo automático de custo e
preço no orçamento, ver §8; emenda v1.2 em 2026-10-04 — tipo_calculo
"largura"/"altura", ver fim do documento)\
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
responsável do produto: o custo de cada material vem do "histórico de
compras" — implementado como `pedido_compra_itens.custo_unitario` mais
recente (correção de rota feita durante a Fase 1: `historico_precos_
item_fornecedor`, ADR-011, registra toda PROPOSTA de cotação, mesmo as
não selecionadas — custo real pago é o de um Pedido de Compra de fato
confirmado, não uma proposta qualquer). Nunca um campo de preço próprio
em `itens` (que não existe hoje) nem um valor inventado. Se não houver
histórico de preço pra um material da composição, o cálculo não assume
zero silenciosamente — avisa explicitamente que falta custo pra aquele
componente.

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

**Emenda (27/09/2026, aprovação explícita do responsável do produto,
via chat, antes do código da Fase 2).** A exclusão original abaixo
("otimização real de corte") previa só UM comprimento de barra por
perfil. O responsável do produto pediu explicitamente o caso mais
amplo — múltiplos comprimentos disponíveis por perfil (ex.: 3m e 6m),
com o sistema escolhendo a combinação de **menor custo total** (não
menor sobra em metros — os dois nem sempre coincidem quando o preço não
é exatamente proporcional ao comprimento) pra cobrir a metragem
necessária. Isso passa a ser parte da Fase 2 (§4), com sua própria
tabela de comprimentos candidatos por linha de composição linear. O que
**continua** fora, sem mudança, é o item abaixo em sua forma original —
reaproveitar a sobra de UM corte real (a barra física que sobrou depois
de cortada) num orçamento ou pedido diferente. A escolha de combinação
de barras nesta Fase 2 é sempre sobre catálogo (quais comprimentos
existem pra comprar), nunca sobre estoque físico de sobras já cortadas.

- Reaproveitamento de sobra de barra **já cortada** entre pedidos
  diferentes (estoque físico de retalho). Projeto à parte, já citado
  como fora de escopo no TÓPICO 13 §40 ("Otimizador de Corte Externo").
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

> **Nota (v1.1, 03/10/2026):** a premissa acima estava errada — a "formação
> de preço (markup)" existente era só exibição de margem, não uma regra
> que calculasse preço. Corrigido pela emenda do §8, que cria a margem por
> empresa e o preço sugerido automático.

**Fase 2 — Combinação de barras de menor custo.** Uma linha de
composição `linear` (perfil) ganha um catálogo de comprimentos de barra
candidatos (nova tabela — cada comprimento é um item comprável distinto,
com seu próprio custo via §2.3), além do percentual de perda já previsto
na Fase 1. O cálculo passa a escolher, entre os comprimentos
cadastrados, a combinação de barras que cobre a metragem necessária
(perímetro + perda) pelo **menor custo total** — nunca pela menor sobra
em metros, que pode divergir (emenda ao §3, 27/09/2026). Linha de
composição sem nenhum comprimento cadastrado continua se comportando
como a Fase 1 (custo por metro corrido, sem arredondamento de barra) —
comportamento anterior preservado por omissão, não por padrão forçado.
Reaproveitamento de sobra **física** (retalho já cortado) entre
orçamentos continua fora (§3).

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

- **Fase 1 — resolvida (27/09/2026):** calcula parcialmente e avisa
  explicitamente o que falta — nunca bloqueia o item inteiro nem assume
  zero.
- **Fase 2 — resolvida (27/09/2026):** múltiplos comprimentos por item
  de perfil, cada um um item comprável distinto (não um campo novo em
  `itens`), cadastrado numa tabela própria de "comprimentos candidatos"
  por linha de composição; otimização por menor custo total, não menor
  sobra.
- **Fase 3 — resolvida (27/09/2026):** preço já aprovado/faturado fica
  sempre congelado, nunca muda sozinho. Quando a Engenharia aprova uma
  BOM definitiva com custo diferente do que formou o preço, o sistema
  registra a diferença (custo congelado × custo real, com o preço
  sugerido correspondente) como uma sugestão pendente — um humano com
  `pedidos.manage` decide, explicitamente, se aplica a atualização ou
  mantém o preço como está (`aplicar_atualizacao_preco_bom()` /
  `ignorar_divergencia_preco_bom()`).
- **Fase 4 — resolvida (27/09/2026):** custo/hora vive em
  `recursos_produtivos` (campo novo, `custo_hora`), não em
  `roteiro_operacoes` — por recurso (máquina/equipe/operador), não por
  tipo de operação.

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

**8. Emenda v1.1 — cálculo automático de custo e preço no orçamento
(03/10/2026)**

**8.1 O que estava errado.** A Fase 1 entregou o cálculo de custo, mas o
fluxo real não era o do §2.6 ("caminho principal"): (a) o preço unitário
era obrigatório para criar o item do orçamento, então o vendedor tinha de
digitar um valor antes de qualquer cálculo; (b) as características
(largura, altura...) e o botão "Calcular" só existiam depois de o item
estar gravado, porque os valores só podiam ser salvos para um item
existente; (c) o cálculo devolvia só custo de material — a "formação de
preço (markup)" citada no §2 e na Fase 1 nunca existiu como regra, só
como exibição derivada de margem (TÓPICO 10 §12-14). O responsável do
produto identificou isso testando e pediu o fluxo automático: escolher a
peça, informar as dimensões e já ver o preço final, sem cliques extras.

**8.2 Decisões (aprovadas pelo responsável do produto via chat em
03/10/2026).**

- **Margem de preço por empresa.** Uma margem percentual única por
  empresa, definida em Configurações → Margem de preço (`pricing_settings`,
  gate `configuracoes.manage`, `0 <= margem < 100`).
- **Fórmula.** `preço sugerido = (custo de material + custo de mão de
  obra) / (1 - margem/100)`, arredondado a 2 casas.
- **Fluxo na tela.** Ao escolher uma peça configurável no item do
  orçamento, as características aparecem na hora (largura e altura
  primeiro); custo, mão de obra e preço sugerido são recalculados
  automaticamente conforme as dimensões são digitadas; um único botão
  grava item, características, custos e preço numa transação.
- **Mão de obra automática.** O custo de mão de obra da Fase 4 entra no
  mesmo cálculo quando o item tem roteiro produtivo ativo.
- **O servidor recalcula sempre.** Na gravação, custo de material, mão de
  obra e preço são recalculados no banco; do navegador só vêm quantidade,
  valores das características e, opcionalmente, um preço digitado pelo
  vendedor. Nunca um custo. O preço digitado prevalece sobre o sugerido e
  fica marcado na auditoria (`preco_ajustado_pelo_vendedor`).
- **Sem preço sugerido quando o custo não é confiável** (nunca assumir zero
  em silêncio, §2.3): característica obrigatória pendente, dimensões
  pendentes, nenhum componente com custo, material sem histórico de
  compra, operação sem tempo ou custo/hora, ou margem não configurada. O
  painel diz o motivo, e o vendedor digita o preço.
- **Custo incompleto não é gravado.** Em `orcamento_itens.custo_unitario`
  e `custo_mao_obra` só entra custo completo; um custo parcial
  subestimaria o custo real e distorceria a margem exibida.
- **Correção associada.** Linha de composição linear/área sem largura ou
  altura informada era ignorada em silêncio, e o custo parecia completo;
  agora sinaliza "dimensões pendentes" e bloqueia a sugestão de preço.
- **Margem exibida.** A margem mostrada na lista de itens passa a
  considerar material + mão de obra, igual ao cálculo do preço.

**8.3 O que continua fora.** Margem por peça ou família de produto
(evolução possível, se uma margem única não servir a todos); descontos e
arredondamento comercial do preço; recálculo automático de itens já
gravados quando o custo de compra muda — o preço gravado nunca muda
sozinho e só é recalculado quando um item em rascunho é reaberto e
salvo (a Fase 3 continua cuidando do preço congelado depois da
aprovação, §5).

**8.4 Implementação.** Migrations `20261211000000_adr012_calculo_
automatico_orcamento.sql` (margem, núcleo de cálculo reaproveitável,
pré-cálculo `calcular_preco_configurador`, gravação atômica
`upsert_orcamento_item_configurado`, listagem de características para o
vendedor) e `20261211010000_fix_listar_caracteristicas_configurador_
ambiguidade.sql`. As funções públicas antigas
(`calcular_custo_orcamento_item`, `calcular_mao_obra_orcamento_item`)
viram wrappers do mesmo núcleo, com resultado idêntico (teste de
regressão). Tela: `src/app/comercial/ItemConfiguravelForm.tsx` e
Configurações → Margem de preço. Testes: seção 65 de
`scripts/test-pecas.mjs` (isolamento cross-tenant, injeção de
característica alheia, acesso de `anon`, funções internas não chamáveis,
custo incompleto, orçamento fora de rascunho) e seção 66 (unidade das
dimensões, §8.6) — 192/192 — e `scripts/test-comercial.mjs` — 87/87.

**8.5 Consequências aceitas.** Além das do §6: o preço de venda passa a
ser sugerido pelo sistema (um erro de custo ou de margem agora chega ao
preço sem digitação), mitigado por o vendedor sempre ver o
detalhamento e poder ajustar; e a margem única por empresa é uma
simplificação — peças com margens muito diferentes exigirão o ajuste
manual até existir margem por peça.

**8.6 Correção de unidade das dimensões (03/10/2026).** Testando na tela
com o catálogo real da JR Box, apareceu que o cálculo da Fase 1 supunha
largura e altura sempre em milímetros (perímetro = 2 × (L + A) ÷ 1.000;
área = L × A ÷ 1.000.000), enquanto as peças `BOX-COR-VID`, `JAN-ALU-2F`
e `PORT-VID-TEMP` têm dimensões em **metros**. Com 2 m × 1,5 m o sistema
calculava 0,00756 m de perfil e 0,00000315 m² de vidro — 1.000× e
1.000.000× abaixo do real. Não houve preço errado gravado: esses materiais
ainda não tinham custo, a margem não estava configurada e nenhum orçamento
real tinha custo calculado por esse motor. Decisão (aprovada pelo
responsável do produto em 03/10/2026):

- A unidade é lida de `peca_caracteristicas.unidade` da largura e da
  altura (`mm`, `cm` ou `m`, sem diferenciar maiúscula de minúscula) e as
  dimensões são convertidas para metros antes do cálculo. Para `mm` o
  resultado é idêntico ao anterior.
- Unidade vazia ou desconhecida **não é adivinhada**: as linhas por
  perímetro/área ficam de fora, o cálculo sinaliza
  `unidade_dimensao_invalida` e o preço não é sugerido (motivo
  `unidade_dimensao_invalida`); o vendedor digita o preço e o custo
  incompleto não é gravado, como nos demais casos do §8.2.
- Defeito de tela corrigido junto: os campos de dimensão tinham mínimo 1,
  o que bloqueava valores como 0,8 m.
- Fica a cargo do cadastro da peça manter a unidade correta; peças
  cadastradas sem unidade (ou com unidade fora de mm/cm/m) passam a avisar
  em vez de calcular errado.

Implementação: migration `20261212000000_adr012_unidade_dimensoes.sql`
(recria `_calcular_custo_peca`, `_calcular_preco_configurador` e
`upsert_orcamento_item_configurado`).

**Status final: APROVADO** — aprovação explícita do responsável do
produto em 27/09/2026, via chat, depois de revisão do texto completo
desta ADR. As 4 fases do §4 ficam pré-autorizadas, sujeitas ao
checkpoint por fase já descrito no §7.

**Emenda v1.1:** aprovação explícita do responsável do produto em
03/10/2026, via chat, depois de revisão do plano completo (§8), com
checkpoint por etapa (banco, configurações, tela, documentação).

**Emenda v1.2 (04/10/2026) — tipo_calculo "largura" e "altura":** até aqui,
um material de composição em metro corrido só podia ser "Fixo", "Linear"
(perímetro inteiro, 2×(largura+altura)) ou "Área". Um material que
consome só UMA dimensão (ex.: trilho superior de um box, que corre só na
largura de cima, não no perímetro inteiro) não tinha como ser
representado — cadastrar como "Linear" superestimava o consumo. Pedido
feito em chat pelo responsável do produto ao configurar o perfil de
alumínio do BOX-COR-VID na base de homologação (JR Box) e notar esse
mesmo problema num material vizinho (TRI-SUP-BOX). `tipo_calculo` passa a
aceitar também `'largura'` e `'altura'`: consomem exatamente a dimensão
daquele papel, com os mesmos % de perda e combinação de comprimento de
barra que já valiam para "Linear". Migração aditiva, sem mudar o tipo de
nenhuma composição já cadastrada.

Implementação: migration
`20261213000000_adr012_tipo_calculo_largura_altura.sql` (recria
`_calcular_custo_peca` e `definir_tipo_calculo_composicao`, amplia a
constraint de `tipo_calculo`).
