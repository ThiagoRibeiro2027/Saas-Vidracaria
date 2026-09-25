**ADR-011 — Compras**

**Status:** APROVADO\
**Versão:** 1.0\
**Tipo:** Architecture Decision Record (ADR)\
**Data:** 2026-09-23\
**Decisão:** Escopo funcional completo do módulo de Compras (Prompt
TÓPICO 7 — Suprimentos e Compras) e ordem de entrega por fases\
**Decisão vinculada:** ADR-002 (§4.6 e §4.18, que passam a remeter a
esta ADR), ADR-004 (Fiscal — vínculo de nota fiscal de entrada ao
recebimento continua fora desta ADR, território do TÓPICO 13/ADR-004),
ADR-001 (Usuários/Permissões)

**1. Contexto**

O ADR-002 §4.18, desde sua versão original, excluía integralmente o
módulo de Compras do MVP: apenas um registro leve de necessidade de
material (`necessidades_compra`) foi aprovado, ampliado em 23/09/2026
(Fase D do plano de fila de produção/peças/suprimentos) para incluir um
recebimento leve — "a necessidade virou material disponível em
estoque", sem fornecedor, cotação, pedido de compra ou conferência.
Naquela mesma ampliação, o §4.18 foi explícito: "o módulo completo de
Compras continua integralmente fora do MVP, sem nenhuma exceção... nada
disso é aprovado agora".

Com o MVP (Fase 1) tecnicamente completo e as quatro fases de evolução
da BOM (TÓPICO 5 — hierarquia/revisão, configurador, motor de regras,
BOM sugerida→definitiva) entregues, o responsável do produto escolheu
Compras completo como próxima frente de desenvolvimento (Fase 2 do
produto) — e, diferente de todos os módulos ampliados até aqui neste
projeto (que sempre teve um recorte reduzido aprovado primeiro, com
ampliação posterior mediante nova decisão), optou explicitamente pelo
**escopo literal completo** das 39 seções do
`docs/Prompt TÓPICO 7 - SUPRIMENTOS E COMPRAS.md`, e por registrar essa
decisão numa ADR nova e dedicada — esta — em vez de continuar
acumulando emendas no §4.18 do ADR-002.

Isso é a maior frente de escopo já aberta neste projeto: comparável, em
tamanho, a um módulo de compras de ERP completo (fornecedor, cotação,
negociação, alçada, pedido de compra formal, contrato recorrente,
estoque em trânsito, recebimento com conferência/lote/divergência/
devolução, orçado×comprometido×realizado, avaliação de fornecedor e
rastreabilidade ponta a ponta).

**2. Decisão**

Fica aprovado o escopo funcional completo do Prompt TÓPICO 7 (§1 a §39,
mais as seções de fechamento MOTOR DE CONFIGURAÇÃO, PERMISSÕES,
INTEGRAÇÕES, REQUISITOS DE IMPLEMENTAÇÃO e CRITÉRIO DE CONCLUSÃO), a ser
entregue em 10 fases (0 a 9, §4 abaixo), respeitando quatro decisões
estruturais tomadas pelo responsável do produto:

**2.1 Convergência com `necessidades_compra`.** O ciclo leve já em
produção (`aberta→atendida→recebida/cancelada`, `criar_necessidade_
compra()`/`atender_necessidade_compra()`/`cancelar_necessidade_compra()`/
`registrar_recebimento_necessidade()`) não é substituído nem duplicado.
Uma Solicitação de Compra (Fase 4) consome uma necessidade chamando a
função já existente `atender_necessidade_compra()`; o fechamento de um
recebimento completo contra Pedido de Compra (Fase 7) também aciona essa
mesma função/transição. Os dois caminhos — leve (já existente) e
completo (esta ADR) — terminam sempre no mesmo registro de
`necessidades_compra`, preservando toda a rastreabilidade já acumulada.

**2.2 Alçada multi-etapa dedicada.** `approval_thresholds` (T15 §8) é,
por desenho explícito, uma alçada de etapa única, sem sequencial/
paralelo/delegação/escalonamento, e já é usado por Pedidos/Orçamentos.
O TÓPICO 7 §22/§23 exige alçada com múltiplas etapas e exceções. Compras
ganha uma **engine de alçada própria** (tabela de etapas/exceções
dedicada), sem alterar `approval_thresholds` — aceitando, conscientemente,
que o sistema passa a ter dois mecanismos de aprovação paralelos, um por
módulo, até uma eventual unificação futura que não é decidida por esta
ADR.

**2.3 Estoque dimensional exige emenda ao T6 primeiro.** `estoque_
saldos` (T6) modela saldo como escalar por decisão original ("saldo é
ESCALAR... não peça física individual"). O TÓPICO 7 §5/§9 (materiais
dimensionais, sobra reaproveitável) exige controle por peça física
individual — dado que este é um SaaS de vidraçaria, provavelmente o
ponto de maior valor real de todo o módulo. Por decisão do responsável
do produto, isso **não** é resolvido dentro do escopo de Compras
isoladamente: é uma emenda formal ao **ADR-002 §4.6** (Estoque),
registrada e aprovada junto com esta ADR (v2.8→v2.9), autorizando de
forma aditiva o controle por peça física — sem alterar o modelo escalar
para os itens/módulos que não pedirem o contrário.

**2.4 Conversão de unidade dimensional completa.** Não existe hoje
nenhum mecanismo de conversão de unidade no schema (`itens.unidade_
principal` é um único campo de texto livre). O responsável do produto
optou pela opção mais completa: conversão dimensional real (ex.: metro
linear → kg via densidade linear, área → peso), não um fator fixo por
par de unidades. Isso amarra com a decisão 2.3: as propriedades físicas
de item que alimentam a conversão (densidade, espessura, peso por
metro/área) são as mesmas exigidas pelo controle dimensional de estoque
— por isso ambas nascem juntas, na Fase 2, e não apenas quando a Fase de
materiais dimensionais chegasse isoladamente.

**3. O que fica fora mesmo com o escopo completo aprovado**

Mesmo aprovando o escopo literal das 39 seções, alguns limites de outras
ADRs já aprovadas continuam valendo e não são reabertos por esta ADR:

- **Nota fiscal de entrada vinculada automaticamente ao recebimento**
  continua sendo TÓPICO 13/ADR-004 (captura e conferência fiscal), não
  Compras. O recebimento desta ADR gera o estado "material disponível em
  estoque"; o vínculo fiscal automático fica para quando o TÓPICO 13
  avançar sua própria fase de captura real de NF-e.

- **Otimização matemática/nesting de corte** sobre as peças e sobras
  controladas pela emenda ao T6 (§2.3) permanece vedada — a mesma
  vedação do TÓPICO 4 §54/ADR-002 §4.7/§5. O controle dimensional
  autorizado é só saldo/posição/sobra reaproveitável por decisão humana,
  nunca decisão automática de corte.

- **`approval_thresholds` (T15) não é alterado** por esta ADR — Compras
  usa sua própria engine de alçada (§2.2), sem tocar no mecanismo que
  Pedidos/Orçamentos já usam.

- **Modelo escalar padrão de `estoque_saldos`** não muda para nenhum
  item/módulo que não optar explicitamente por controle dimensional — a
  emenda ao §4.6 é aditiva, não uma reforma do modelo de estoque.

**4. Fases de entrega**

Diferente do padrão usado nos módulos anteriores deste projeto
(aprovação incremental, fase a fase, cada uma com sua própria emenda de
ADR), esta ADR **pré-aprova as 10 fases abaixo de uma vez só** — não é
necessária uma nova emenda de ADR para iniciar cada fase seguinte, salvo
onde indicado. O que continua exigindo checkpoint explícito
("pode seguir") é a validação técnica e o push de cada fase, mesmo ritmo
já usado neste projeto.

**Fase 0 — Governança.** Esta ADR e a emenda ao ADR-002 §4.6. Sem
código.

**Fase 1 — Fornecedor, materiais/fornecedores alternativos, políticas de
abastecimento** (TÓPICO 7 §10, §13, §14, §15). Cadastro completo de
fornecedor (condições de pagamento, lead time, dados bancários,
homologação) associado a `pessoas`/`pessoa_papeis` já existente;
fornecedor principal/alternativo e material alternativo por item, com
log obrigatório de toda substituição; políticas de abastecimento
(estoque mínimo, segurança, ponto de reposição, lote econômico) por
item.

**Fase 2 — Estoque dimensional e conversão de unidade completa**
(TÓPICO 7 §5, §6, base de §9) — implementação da emenda ao ADR-002
§4.6 (§2.3/§2.4 acima). Fase de maior risco técnico do roteiro: estende
um módulo já em produção (T6). Exige regressão completa de todo
consumidor de `estoque_saldos`/`ajustar_saldo()` antes do commit.

**Fase 3 — Motor de necessidades, saldo projetado, consolidação, mapa de
compras futuras** (TÓPICO 7 §1, §3, §4, §7, §8, conclusão de §9, §11,
§12). Generaliza o cálculo líquido já existente em
`gerar_necessidades_de_pedido`/`gerar_necessidades_de_ordem_producao`;
novas origens de necessidade (estoque mínimo, ponto de reposição,
planejamento); consolidação de necessidades preservando rastreabilidade;
mapa de compras futuras com risco de ruptura.

**Fase 4 — Solicitação de Compra e Compras Diretas** (TÓPICO 7 §2, §16).
Entidade formal de Solicitação de Compra (SC), consumindo
`necessidades_compra` via `atender_necessidade_compra()` (§2.1 acima);
compra direta com motivo fixo, justificativa e responsável, auditável.

**Fase 5 — Cotação, negociação, aprovação, alçada** (TÓPICO 7 §17, §18,
§19, §20, §21, §22, §23). Cotação multi-fornecedor com critérios de
comparação configuráveis, negociação com histórico de rodadas, custo
total de aquisição (não só menor preço — princípio central do TÓPICO 7:
"o sistema sugere, o humano decide"), e a engine de alçada dedicada
(§2.2 acima).

**Fase 6 — Pedido de Compra, compras recorrentes, orçamento** (TÓPICO 7
§24, §25, §33). Pedido de Compra formal como documento; compras
recorrentes reaproveitando `contratos` (T18, tipo='fornecedor') — sem
reinventar o conceito de contrato; orçado×comprometido×realizado
integrado ao Financeiro real (reaproveitando o padrão de
`gerar_titulos_pedido()`, T11), não um ledger paralelo.

**Fase 7 — Recebimento completo, conferência/qualidade, lote,
divergência, devolução** (TÓPICO 7 §26, §27, §28, §29, §30, §31, §36).
Recebimento parcial/múltiplo contra Pedido de Compra, reaproveitando
`ajustar_saldo()` (T6) só na conferência final; conferência de qualidade
reaproveitando `inspecoes_qualidade`/`nao_conformidades` (T8); anexos
reaproveitando `files`/`register_file`. Fecha a convergência do §2.1: o
recebimento completo também transiciona a `necessidade_compra` de
origem.

**Fase 8 — Compras emergenciais, avaliação de fornecedores,
rastreabilidade** (TÓPICO 7 §32, §35, §39, verificação de §37). Compra
emergencial como variante (campo `urgencia` + justificativa obrigatória)
das entidades já criadas, não uma entidade nova; avaliação de fornecedor
com pesos configuráveis, alimentada por dados reais de recebimento/
divergência/preço; rastreabilidade ponta a ponta (necessidade→SC→
cotação→negociação→aprovação→PC→recebimento→estoque→consumo) e sua
consulta inversa.

**Fase 9 — Dashboard, configuração consolidada, auditoria de
permissões, critério de conclusão** (TÓPICO 7 §38 + seções de
fechamento). Dashboard reaproveitando `dashboard_operacional()` (T12);
consolidação de toda parametrização das fases anteriores; matriz de
permissões testada; fluxo ponta a ponta espelhando o critério de
conclusão do TÓPICO 7.

**5. Perguntas operacionais resolvidas fase a fase**

As seguintes questões não bloqueiam a aprovação desta ADR (o escopo e a
ordem de entrega já estão decididos), mas bloqueiam o código da fase
correspondente até serem resolvidas com uma pergunta pontual ao
responsável do produto, no mesmo ritmo já usado nas fases anteriores
deste projeto:

- **Fase 3:** fórmula/limiar de "risco de ruptura" do mapa de compras
  futuras (§12); regra de disparo da sugestão de vínculo de excedente
  (§9) — sob demanda vs. rotina.
- **Fase 4:** campos obrigatórios/opcionais de compra direta (§2),
  configuráveis por empresa — precisa de um default.
- **Fase 5:** critérios e pesos default de comparação de cotação
  (§17/§21).
- **Fase 8:** fórmula e pesos default de avaliação de fornecedor (§35).

**6. Consequências**

Aceitas conscientemente:

- Escopo e prazo muito maiores que qualquer frente anterior deste
  projeto — 10 fases, comparável a um módulo de ERP completo.
- T6 (Estoque), módulo já em produção, recebe uma emenda aditiva
  (Fase 2) — maior risco técnico do roteiro, mitigado por regressão
  completa antes do commit.
- Dois mecanismos de alçada paralelos no sistema (T15 e Compras) até uma
  eventual unificação futura não decidida aqui.

Não aceitas:

- Perda de rastreabilidade dos dados já existentes em
  `necessidades_compra`.
- Regressão em qualquer módulo que hoje consome `estoque_saldos`/
  `ajustar_saldo()` (Estoque, Produção, Suprimentos, Fila de Produção).
- Qualquer regra de negócio implementada sem cobertura explícita desta
  ADR.

**7. Governança**

Esta ADR pré-autoriza as 10 fases do §4 de uma vez, por decisão explícita
do responsável do produto via chat em 23/09/2026 — diferente do padrão
de aprovação incremental usado nos módulos anteriores deste projeto.
Isso não dispensa, para cada fase:

- o checkpoint explícito ("pode seguir") do responsável do produto antes
  de iniciar a fase seguinte;
- as 13 regras de segurança obrigatórias do CLAUDE.md em cada tabela/
  função nova (RLS + teste de isolamento cross-tenant, gate
  `has_permission()`/`assert_tenant_write()`, `SECURITY DEFINER` com
  `search_path` controlado, sem grant a PUBLIC/anon, teste negativo,
  auditoria em `activity_logs`);
- a resolução das perguntas operacionais do §5 quando a fase
  correspondente começar;
- a validação standalone-PostgreSQL e os scripts `.mjs` de teste antes
  de cada commit, seguindo o padrão já usado neste projeto.

A emenda ao ADR-002 §4.6 (Fase 0) precisa estar registrada e aprovada
antes do código da Fase 2 — mas não bloqueia a Fase 1, que não depende
dela.

Alterações posteriores a esta ADR não deverão apagar silenciosamente
decisões anteriores, mesmo padrão de governança do ADR-002 §12.

**Status final: APROVADO**
