**ADR-013 — Identidade Visual do Produto**

**Status:** APROVADO\
**Versão:** 1.0\
**Tipo:** Architecture Decision Record (ADR) + Prompt de Implementação\
**Data:** 2026-10-07\
**Decisão:** Novo padrão visual para todas as telas do produto (frontend),
substituindo o estilo atual (inline style / `CSSProperties` escrito à mão,
sem design system, adotado só parcialmente em Comercial/Engenharia/Pedidos)
por um padrão único, documentado e reaproveitável — e ordem de migração por
módulo\
**Decisão vinculada:** Nenhuma regra de negócio muda — este ADR é
puramente de apresentação (camada visual). Não altera nenhum fluxo,
permissão, RLS ou schema de nenhum módulo. Convive com `src/components/
ui/` (Button, Card, Badge, Input, Select, Table, Modal, Tabs) — reaproveita
esses componentes como base funcional, só muda a composição visual deles.

**1. Contexto**

O produto foi crescendo por módulo (TÓPICO 1 a 18 + ADR-011/012) sem uma
camada de design consolidada. Existe uma base de design system parcial
(`src/components/ui/`, Tailwind v4 com tokens em `globals.css`) introduzida
numa migração anterior e aplicada só a 3 módulos (Comercial, Engenharia,
Pedidos) — o resto do produto (Compras, Estoque, Suprimentos, Financeiro,
RH, login, etc.) continua em estilo inline herdado de antes dessa base
existir. Avaliando o produto de fora, o responsável do produto considerou
o visual "precário" comparado a SaaS comerciais — não por falta de
funcionalidade, mas por inconsistência entre telas e ausência de
identidade visual própria.

Processo de exploração (sessão de 01-07/10/2026, branch
`claude/jolly-cerf-29odtc`): quatro rodadas de mockup estático (sem tocar
dado real), cada uma reavaliada e descartada ou refinada pelo responsável
do produto antes da próxima:

1. **V1** — reorganização simples (cards de resumo, abas) sobre os tokens
   já existentes. Rejeitada: "parece a mesma coisa, nada de novo".
2. **V2** — mais identidade (sombra, cor por categoria, sparkline,
   Kanban). Melhor recebida, mas cor ainda "sem personalidade".
3. **Identidade C** — cor sólida e confiante (tiles preenchidos, badge com
   fill, cor secundária coral + verde da marca), inspirada em
   HubSpot/Pipedrive/Salesforce. **Aprovada** como melhoria real.
4. **Identidade D** — a aprovada nesta ADR. O responsável do produto
   trouxe 8 prints de referência de um sistema industrial (apontamento de
   produção/MES) e pediu a adoção literal daquele vocabulário visual
   (caixas com borda fina, borda colorida à esquerda nos campos de valor,
   tabela densa com cabeçalho destacado, botões lisos em bloco de cor
   sólida), substituindo a direção da Identidade C. Avaliação honesta
   registrada no momento: é um padrão mais "ERP clássico"/denso, menos
   "uau" à primeira vista que a Identidade C, mas foi a escolha explícita
   do responsável do produto e é o que este ADR formaliza.

Os quatro protótipos foram implementados como rotas isoladas (não
navegáveis pelo menu, sem leitura/escrita no Supabase) e ficam no branch
como referência visual até serem removidos pela Fase 1 abaixo:

- `/mockup-comercial` — V1 e V2 (histórico de commits)
- `/mockup-comercial-b` — opção alternativa monocromática (rejeitada)
- `/mockup-comercial-c` — Identidade C (referência de cor sólida)
- `/mockup-comercial-d` — **Identidade D, a aprovada** — layout completo do
  Comercial no padrão final
- `/mockup-estoque` — Estoque na Identidade C (pré-mudança para D; serve
  de referência de conteúdo/seções, não de cor final)

**2. Decisão — especificação da Identidade D**

**2.1 Faixa de cabeçalho de página.** Toda tela de conteúdo (dentro do
`<main>` do `AppShell`, não a Topbar global) ganha uma faixa superior
`bg-primary text-white` com: breadcrumb pequeno (`text-[11px] text-white/
70`, formato `Módulo › Submódulo › Tela`) e título da tela em negrito
abaixo. Substitui o padrão atual de `<p className="font-mono text-[11px]
text-primary">TÓPICO N — Módulo</p>` solto no topo de cada `page.tsx`.

**2.2 Caixas de campo/resumo (`FieldBox`).** Indicadores de resumo (e,
por extensão, qualquer exibição de valor isolado) usam caixa com borda
fina (`border border-border`), fundo branco, **borda colorida de 4px à
esquerda** (`border-l-4`) indicando o tom do valor — não mais tile com
fundo sólido colorido (isso era a Identidade C, descontinuada). Tons:
`teal`/`border-l-primary` (positivo/neutro), `amber`/`border-l-amber-500`
(atenção), `rose`/`border-l-rose-600` (crítico/negativo). Label pequeno
cinza acima, valor grande e em negrito abaixo, colorido pelo tom.

**2.3 Tabela densa com cabeçalho destacado.** Listagens usam tabela de
verdade (`<table>`, reaproveitando `Table`/`Th`/`Td` de `src/components/
ui/Table.tsx` como base, com classes extras para a faixa do cabeçalho) —
não mais lista de cards. Cabeçalho com fundo sutilmente destacado
(`bg-amber-50`, conforme referência), borda inferior em cada célula,
célula de ação com botão secundário pequeno ("Ver"). Status é pílula de
texto com ponto colorido (`●`), não badge preenchido.

**2.4 Botões de ação em bloco liso.** Ações primárias da tela (criar,
registrar, navegar para sub-fluxo) aparecem como grade de botões grandes,
cor sólida **sem gradiente nem sombra**, texto branco em negrito,
`rounded` (não `rounded-xl`/`2xl` como na Identidade C) — reaproveita
`Button` só como base de acessibilidade/foco; a classe visual é
sobrescrita por ação (azul = navegação/consulta, verde = criar/confirmar,
laranja = ação de atenção, vermelho = destrutiva), mesmo mapeamento
semântico já usado em `Badge`/`Table`.

**2.5 Abas.** Texto + sublinhado de 2px na aba ativa, sem pílula de fundo
(diferença chave vs. Identidade C, que usava `bg-page-bg` com pílula
branca na aba ativa). Label em caixa alta, peso semibold.

**2.6 O que NÃO muda.** Sidebar e Topbar (`AppShell`/`Sidebar`/`Topbar`)
continuam como estão — a faixa de cabeçalho (§2.1) é interna ao
`<main>`, não repete o verde já usado no menu lateral. Os componentes de
`src/components/ui/` (Button, Card, Input, Select, Modal, Tabs) continuam
sendo a base funcional (foco, acessibilidade, portal do Modal, etc.) —
este ADR muda a composição/classe visual em cima deles, não os substitui
por HTML cru onde eles já bastam.

**2.7 Tokens a formalizar.** Hoje a Identidade D usa cores soltas no
mockup (`border-l-amber-500`, `bg-[#2f6fed]`, `bg-rose-600`, etc.), não
tokens em `globals.css`. A Fase 1 (§3) formaliza isso em `@theme`, mesmo
padrão já usado por `--color-primary`/`--color-danger`/`--color-warning`
— sem isso, cada tela nova reinventa o hex.

**3. Fases de entrega**

Mesma disciplina do resto do projeto: cada fase só começa com "pode
seguir" explícito do responsável do produto sobre a fase anterior. Nenhum
dado real, RLS ou action muda em nenhuma fase — é migração de camada
visual, módulo por módulo, sobre o que já existe e funciona.

- **Fase 1 — Fundação.** Formalizar os tokens de cor da Identidade D em
  `globals.css` (`@theme`). Extrair os padrões repetidos do mockup
  (`FieldBox`, faixa de cabeçalho, tabela densa, grade de botões) como
  componentes reaproveitáveis em `src/components/ui/` (ex.:
  `PageHeader.tsx`, `FieldBox.tsx`), para não copiar/colar classe por
  tela. Critério de conclusão: os 5 componentes novos existem, com o
  mesmo rigor dos já existentes (sem lógica de negócio, só apresentação).
- **Fase 2 — Comercial.** Migrar `/comercial` (Orçamentos, Oportunidades,
  Propostas) da Identidade D para valer, usando os componentes da Fase 1
  — o `/mockup-comercial-d` deixa de ser necessário e é apagado. Esta é a
  tela piloto porque já tem o mockup mais completo.
- **Fase 3 — Estoque.** Migrar `/estoque` (Saldo, Reservas, Sobra, Peças
  dimensionais) para a Identidade D (não a C do `/mockup-estoque`, que
  fica só como referência de conteúdo/seções a reaproveitar — a cor final
  é a da Fase 2). `/mockup-estoque` é apagado ao final.
- **Fase 4 em diante — demais módulos**, um de cada vez, na ordem que o
  responsável do produto priorizar: Pedidos, Engenharia (já usam a base
  antiga do design system — revisão, não криação do zero), Produção,
  Qualidade, Expedição, Instalação, Suprimentos, Compras, Financeiro, RH,
  Fiscal, Contratos, BI, Configurações, Usuários, login (`src/app/login/
  page.tsx` já foi redesenhado nesta sessão numa identidade anterior —
  revisar para a D), e por fim `Instalação — Campo (PWA)` (shell próprio,
  `src/app/campo/layout.tsx` — avaliar à parte se o padrão PWA de campo
  segue a mesma identidade ou um recorte otimizado para touch, dado que o
  próprio responsável do produto trouxe referências de tela industrial
  touch-screen; não decidido ainda, fica para quando a Fase 4 chegar
  nesse módulo).

**4. Processo (para quem continuar esta implementação em outra sessão)**

Este arquivo é o documento de transferência pedido pelo responsável do
produto — a sessão que continuar a partir daqui deve:

1. Ler este ADR e os 5 protótipos (`/mockup-comercial-d` é a referência
   principal; os demais `/mockup-*` são histórico de exploração — podem
   ser lidos em `git log --oneline -- 'src/app/mockup-*'` no branch
   `claude/jolly-cerf-29odtc`, ou apagados se a Fase 1 já formalizou os
   componentes).
2. Confirmar com o responsável do produto que a Fase 1 pode começar (este
   ADR registra a aprovação da **identidade visual**, não autoriza
   automaticamente pular direto para migrar todos os módulos — cada fase
   do §3 ainda pede confirmação, mesma régua do resto do projeto).
3. Seguir CLAUDE.md normalmente — isto não muda nenhuma regra de banco/
   migration, mas qualquer componente novo em `src/components/ui/`
   continua sem lógica de negócio, só apresentação.

**5. O que fica fora**

- Tema escuro (a última referência trazida pelo responsável do produto —
  dashboard financeiro em fundo escuro — é uma identidade visual
  diferente, não incorporada aqui; registrar como ADR à parte se for
  retomada).
- Padrão touch/teclado numérico das telas industriais de referência (o
  responsável do produto pediu explicitamente só o visual liso/denso,
  não esse padrão funcional) — fica disponível como opção futura para
  telas de chão de fábrica/campo, não decidido nesta ADR.
- Qualquer mudança de mobile-first/responsivo dedicado — os mockups
  foram avaliados em viewport desktop (1440×900); comportamento em tela
  pequena é decisão de cada fase de migração, não deste ADR.
